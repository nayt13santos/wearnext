import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/photo-display.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function fixture({ stored = new Map(), cleanup, storageFails = false } = {}) {
  let next = 0,
    cleanCalls = 0;
  const revoked = [],
    events = [],
    exports = {};
  runInNewContext(compiled, {
    exports,
    Number,
    JSON,
    URL: {
      createObjectURL: () => "blob:display-" + ++next,
      revokeObjectURL: (url) => revoked.push(url),
    },
    localStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => {
        if (storageFails) throw Error("Full");
        stored.set(key, value);
      },
      removeItem: (key) => stored.delete(key),
    },
    fetch: async () => ({ ok: true, blob: async () => new Blob(["source"]) }),
    require: (id) =>
      id === "./client"
        ? { photoSource: async (id) => "data:original-" + id }
        : {
            cleanPhoto: async () => {
              cleanCalls++;
              return cleanup
                ? cleanup()
                : {
                    url: "blob:recomputed",
                    cutout: new Blob(),
                    blob: new Blob(),
                  };
            },
            framePhoto: async (_, zoom) => ({
              url: "blob:resized-" + zoom,
              blob: new Blob(),
            }),
          },
  });
  exports.onPhotoChange((id) => events.push(id));
  return {
    api: exports,
    stored,
    revoked,
    events,
    get cleanCalls() {
      return cleanCalls;
    },
  };
}
const piece = { id: "p1", fingerprint: "source-v1" };
test("cleanup stores only framing metadata, uses the cached result everywhere, and restores the original", async () => {
  const f = fixture();
  f.api.applyCleanPhoto(piece, { blob: new Blob(["private pixels"]) }, 1.12);
  assert.equal(await f.api.displayPhotoSource(piece), "blob:display-1");
  assert.equal(f.cleanCalls, 0);
  assert.deepEqual([...f.stored.values()], ['{"zoom":1.12}']);
  assert.deepEqual(f.events, ["p1"]);
  f.api.restorePhoto(piece);
  assert.equal(f.stored.size, 0);
  assert.equal(await f.api.displayPhotoSource(piece), "data:original-p1");
  assert.deepEqual(f.revoked, ["blob:display-1"]);
});
test("a new page rebuilds remembered cleanup once and shares it between concurrent views", async () => {
  const first = fixture();
  first.api.applyCleanPhoto(piece, { blob: new Blob() }, 0.85);
  const reloaded = fixture({ stored: first.stored });
  const urls = await Promise.all([
    reloaded.api.displayPhotoSource(piece),
    reloaded.api.displayPhotoSource(piece),
  ]);
  assert.deepEqual(urls, ["blob:resized-0.85", "blob:resized-0.85"]);
  assert.equal(reloaded.cleanCalls, 1);
  assert.equal(
    await reloaded.api.displayPhotoSource({
      ...piece,
      fingerprint: "different",
    }),
    "data:original-p1",
  );
});
test("restoring while cleanup is in progress cannot reinstate the old cleaned view", async () => {
  let finish;
  const f = fixture({
    stored: new Map([["wearnext.photo-fit.v1:p1:source-v1", '{"zoom":1}']]),
    cleanup: () => new Promise((r) => (finish = r)),
  });
  const result = f.api.displayPhotoSource(piece);
  await new Promise((r) => setImmediate(r));
  f.api.restorePhoto(piece);
  finish({ url: "blob:late", blob: new Blob(), cutout: new Blob() });
  assert.equal(await result, "data:original-p1");
  assert.ok(f.revoked.includes("blob:late"));
  assert.equal(f.stored.size, 0);
});
test("storage and detector failures retain access to the original instead of losing the photo", async () => {
  const blocked = fixture({ storageFails: true });
  assert.throws(
    () => blocked.api.applyCleanPhoto(piece, { blob: new Blob() }),
    /cannot remember/,
  );
  assert.equal(blocked.events.length, 0);
  const failed = fixture({
    stored: new Map([["wearnext.photo-fit.v1:p1:source-v1", '{"zoom":1}']]),
    cleanup: async () => {
      throw Error("Offline");
    },
  });
  assert.equal(await failed.api.displayPhotoSource(piece), "data:original-p1");
  assert.equal(failed.stored.size, 1);
});
