/** Pure mask/framing geometry, shared by browser processing and regression tests. */
export type Bounds = { x: number; y: number; width: number; height: number };
export function fitGarment(bounds: Bounds, canvasSize = 900, zoom = 1) {
  if (
    !Number.isFinite(zoom) ||
    zoom < 0.65 ||
    zoom > 1.15 ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    throw new Error("Invalid photo size.");
  const scale =
    (canvasSize * 0.82 * zoom) / Math.max(bounds.width, bounds.height);
  const width = bounds.width * scale,
    height = bounds.height * scale;
  return {
    x: (canvasSize - width) / 2,
    y: (canvasSize - height) / 2,
    width,
    height,
  };
}
export function garmentMask(
  values: Float32Array,
  width: number,
  height: number,
) {
  const n = width * height;
  if (values.length !== n || n === 0)
    throw new Error("The background detector returned an invalid mask.");
  let min = 1,
    max = 0;
  for (const v of values) {
    if (!Number.isFinite(v))
      throw new Error("The background detector returned an invalid mask.");
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  if (max - min < 0.2 || max < 0.5)
    throw new Error(
      "Could not separate the clothing from its background. Try a clearer photo.",
    );
  const mask = new Float32Array(n);
  for (let i = 0; i < n; i++) mask[i] = (values[i] - min) / (max - min);
  const labels = new Int32Array(n),
    queue = new Int32Array(n),
    sizes = [0];
  let label = 0;
  for (let i = 0; i < n; i++) {
    if (labels[i] || mask[i] < 0.15) continue;
    label++;
    let head = 0,
      tail = 1;
    queue[0] = i;
    labels[i] = label;
    const push = (j: number) => {
      if (!labels[j] && mask[j] >= 0.15) {
        labels[j] = label;
        queue[tail++] = j;
      }
    };
    while (head < tail) {
      const j = queue[head++];
      if (j % width) push(j - 1);
      if (j % width < width - 1) push(j + 1);
      if (j >= width) push(j - width);
      if (j < n - width) push(j + width);
    }
    sizes[label] = tail;
  }
  const largest = sizes.reduce((a, b) => Math.max(a, b), 0);
  if (!largest) throw new Error("No clothing was found in this photo.");
  const keep = sizes.map((size) => size >= Math.max(6, largest * 0.01));
  keep[0] = false;
  const alpha = new Uint8ClampedArray(n);
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1,
    area = 0,
    solid = 0,
    edge = 0;
  for (let i = 0; i < n; i++)
    if (keep[labels[i]]) {
      const x = i % width,
        y = Math.floor(i / width);
      alpha[i] = Math.round(mask[i] * 255);
      area++;
      if (mask[i] > 0.9) solid++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) edge++;
    }
  if (area < Math.max(6, n * 0.003))
    throw new Error(
      "The clothing is too small to clean reliably. Try a closer photo.",
    );
  const confident =
    area / n > 0.015 &&
    area / n < 0.85 &&
    solid / area > 0.65 &&
    edge / area < 0.015 &&
    keep.filter(Boolean).length <= 4;
  // Include a small transparent margin so resizing never clips soft garment edges.
  x0 = Math.max(0, x0 - 2);
  y0 = Math.max(0, y0 - 2);
  x1 = Math.min(width - 1, x1 + 2);
  y1 = Math.min(height - 1, y1 + 2);
  return {
    alpha,
    bounds: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
    confident,
    reason: confident
      ? "Background removed and size balanced."
      : "Check the edges before using this cleaned photo.",
  };
}
