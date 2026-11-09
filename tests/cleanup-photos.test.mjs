import { test } from "node:test";
import assert from "node:assert/strict";
import { component } from "./helpers/component.mjs";
function fixture({
  confident = true,
  photoFails = false,
  colorFails = false,
  resizeFails = false,
  pendingPhoto,
} = {}) {
  const applied = [],
    restored = [],
    colors = [],
    piece = {
      id: "old",
      name: "My shirt",
      color: "Grey",
      favorite: true,
      laundry: true,
    };
  let cleanCalls = 0,
    colorCalls = 0,
    appliedZoom = null;
  const props = {
    open: true,
    onClose() {},
    loadPieces: async () => [piece],
    saveColor: async (...args) => {
      colorCalls++;
      if (colorFails) throw Error("Color save failed");
      colors.push(args);
    },
  };
  const modules = {
    "./piece-editor": {
      Choice: "Choice",
      PiecePhoto: "PiecePhoto",
      Toggle: "Toggle",
    },
    "@/lib/wardrobe": { colors: ["Grey", "Blue"] },
    "@/lib/wardrobe-photos": {
      savedPhotoAnalysis: async () => ({ colors: {} }),
      wardrobePhoto: async () => new Blob(),
    },
    "@/lib/category-recognition": {
      recognizeCategory: async () => ({ attributes: {} }),
    },
    "@/lib/photo-tags": {
      chooseColor: () => ({ color: "Blue", certain: true }),
    },
    "@/lib/photo-cleanup": {
      cleanPhoto: async () => {
        cleanCalls++;
        if (photoFails && cleanCalls === 1) throw Error("Detector failed");
        return pendingPhoto
          ? pendingPhoto
          : {
              cutout: new Blob(),
              blob: new Blob(),
              url: "blob:clean",
              confident,
              reason: "Check the edges",
            };
      },
      framePhoto: async (_, zoom) => ({
        blob: new Blob(),
        url: "blob:zoom-" + zoom,
      }),
    },
    "@/lib/photo-display": {
      photoTreatment: () => (appliedZoom ? { zoom: appliedZoom } : null),
      applyCleanPhoto: (piece, photo, zoom) => {
        if (resizeFails && zoom !== 1) throw Error("Storage full");
        applied.push({ id: piece.id, zoom });
        appliedZoom = zoom;
      },
      restorePhoto: (piece) => {
        restored.push(piece.id);
        appliedZoom = null;
      },
    },
  };
  const c = component("color-repair.tsx", props, modules);
  return {
    ...c,
    applied,
    restored,
    colors,
    get cleanCalls() {
      return cleanCalls;
    },
    get colorCalls() {
      return colorCalls;
    },
  };
}
test("cleanup corrects color and photo independently, then allows resizing and restoration", async () => {
  const c = fixture();
  c.button("Clean up now").props.onClick();
  await c.settle();
  assert.equal(c.colors.length, 1);
  assert.deepEqual(c.applied, [{ id: "old", zoom: 1 }]);
  c.nodes()
    .find((n) => n.type === "Choice" && n.props.label.startsWith("Photo size"))
    .props.onChange("Larger");
  await c.settle();
  assert.equal(c.applied.at(-1).zoom, 1.12);
  assert.equal(c.cleanCalls, 1);
  c.button("Restore original photo").props.onClick();
  assert.deepEqual(c.restored, ["old"]);
  assert.ok(c.button("Use cleaned photo"));
});
test("uncertain cutouts are previewed without being applied until accepted", async () => {
  const c = fixture({ confident: false });
  c.button("Clean up now").props.onClick();
  await c.settle();
  assert.equal(c.applied.length, 0);
  assert.equal(c.colors.length, 1);
  c.button("Use cleaned photo").props.onClick();
  assert.equal(c.applied.length, 1);
});
test("photo retry does not repeat a successful color save", async () => {
  const c = fixture({ photoFails: true });
  c.button("Clean up now").props.onClick();
  await c.settle();
  assert.equal(c.colors.length, 1);
  assert.equal(c.applied.length, 0);
  c.button("Retry / resume (1)").props.onClick();
  await c.settle();
  assert.equal(c.colorCalls, 1);
  assert.equal(c.applied.length, 1);
});
test("failed color save does not prevent photo cleanup or cause duplicate photo processing on retry", async () => {
  const c = fixture({ colorFails: true });
  c.button("Clean up now").props.onClick();
  await c.settle();
  assert.equal(c.applied.length, 1);
  assert.ok(c.button("Retry / resume (1)"));
  c.button("Retry / resume (1)").props.onClick();
  await c.settle();
  assert.equal(c.cleanCalls, 1);
  assert.equal(c.colorCalls, 2);
});
test("photo-only cleanup never changes saved colors", async () => {
  const c = fixture();
  c.nodes()
    .find((n) => n.type === "Toggle" && n.props.label === "Fix color tags")
    .props.onChange(false);
  c.button("Clean up now").props.onClick();
  await c.settle();
  assert.equal(c.colorCalls, 0);
  assert.equal(c.applied.length, 1);
});

test("a failed size save retains the previous applied size", async () => {
  const c = fixture({ resizeFails: true });
  c.button("Clean up now").props.onClick();
  await c.settle();
  c.nodes()
    .find((n) => n.type === "Choice" && n.props.label.startsWith("Photo size"))
    .props.onChange("Larger");
  await c.settle();
  assert.equal(
    c
      .nodes()
      .find(
        (n) => n.type === "Choice" && n.props.label.startsWith("Photo size"),
      ).props.value,
    "Auto fit",
  );
  assert.equal(c.applied.length, 1);
  assert.match(c.nodes().map(c.text).join(" "), /Storage full/);
});
test("closing during a pending cutout does not apply a stale photo on return", async () => {
  let finish;
  const pendingPhoto = new Promise((r) => (finish = r)),
    c = fixture({ pendingPhoto });
  c.button("Clean up now").props.onClick();
  await c.settle();
  c.props.open = false;
  c.render();
  finish({
    cutout: new Blob(),
    blob: new Blob(),
    url: "blob:late",
    confident: true,
  });
  await c.settle();
  assert.equal(c.applied.length, 0);
  assert.ok(c.revoked.includes("blob:late"));
});
