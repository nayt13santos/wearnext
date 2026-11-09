import { test } from "node:test";
import assert from "node:assert/strict";
import { fitGarment, garmentMask } from "../lib/photo-framing.ts";
test("small, large, tall and wide garments share the same outer size without distortion", () => {
  for (const [width, height] of [
    [20, 80],
    [200, 800],
    [800, 200],
    [300, 300],
  ]) {
    const fit = fitGarment({ x: 100, y: 20, width, height });
    assert.equal(Math.max(fit.width, fit.height), 738);
    assert.equal(fit.width / fit.height, width / height);
    assert.equal(fit.x + fit.width / 2, 450);
    assert.equal(fit.y + fit.height / 2, 450);
  }
});
test("all offered sizes stay fully inside the frame, with room around every edge", () => {
  for (const zoom of [0.65, 0.85, 1, 1.12, 1.15])
    for (const [width, height] of [
      [1, 10],
      [10, 1],
      [5, 5],
    ]) {
      const fit = fitGarment({ x: 0, y: 0, width, height }, 900, zoom);
      assert.ok(fit.x >= 25);
      assert.ok(fit.y >= 25);
      assert.ok(fit.x + fit.width <= 875);
      assert.ok(fit.y + fit.height <= 875);
    }
  for (const zoom of [0, 2, NaN, Infinity])
    assert.throws(() =>
      fitGarment({ x: 0, y: 0, width: 20, height: 20 }, 900, zoom),
    );
});
const fixture = () => {
  const data = new Float32Array(10000);
  const rect = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) data[j * 100 + i] = 0.99;
  };
  return { data, rect };
};
test("mask keeps both shoes and rejects detached background specks", () => {
  const { data, rect } = fixture();
  rect(20, 30, 20, 40);
  rect(60, 30, 20, 40);
  data[3] = 1;
  const result = garmentMask(data, 100, 100);
  assert.equal(result.confident, true);
  assert.equal(result.alpha[3], 0);
  assert.ok(result.alpha[40 * 100 + 25] > 240);
  assert.ok(result.alpha[40 * 100 + 65] > 240);
  assert.deepEqual(result.bounds, { x: 18, y: 28, width: 64, height: 44 });
});
test("white or black flat masks cannot erase a whole photo; edge-touching objects need review", () => {
  assert.throws(() => garmentMask(new Float32Array(10000), 100, 100));
  assert.throws(() =>
    garmentMask(new Float32Array(10000).fill(0.99), 100, 100),
  );
  const { data, rect } = fixture();
  rect(0, 10, 40, 80);
  assert.equal(garmentMask(data, 100, 100).confident, false);
  data[50] = NaN;
  assert.throws(() => garmentMask(data, 100, 100));
});
