import { env, InferenceSession, Tensor } from "onnxruntime-web/wasm";
import wasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import mjs from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
env.wasm.numThreads = 1;
env.wasm.wasmPaths = { wasm, mjs };
let model: Promise<InferenceSession> | undefined;
async function getModel() {
  if (!model)
    model = (async () => {
      const url = new URL(
        import.meta.env.BASE_URL + "models/background/u2netp.onnx",
        self.location.origin,
      ).href;
      let cache: Cache | undefined, response: Response | undefined;
      try {
        cache = await caches.open("wearnext-background-v1");
        response = await cache.match(url);
      } catch {}
      if (!response) {
        response = await fetch(url);
        if (!response.ok) throw Error("Detector unavailable");
        try {
          await cache?.put(url, response.clone());
        } catch {}
      }
      return InferenceSession.create(await response.arrayBuffer(), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    })().catch((error) => {
      model = undefined;
      throw error;
    });
  return model;
}
let queue = Promise.resolve();
self.onmessage = (
  event: MessageEvent<{ id: number; pixels: Uint8ClampedArray }>,
) => {
  const { id, pixels } = event.data;
  queue = queue.then(async () => {
    try {
      self.postMessage({ id, status: "Preparing background removal…" });
      const network = await getModel();
      self.postMessage({ id, status: "Removing the background…" });
      const n = 320 * 320,
        data = new Float32Array(n * 3),
        mean = [0.485, 0.456, 0.406],
        std = [0.229, 0.224, 0.225];
      let max = 1;
      for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++) max = Math.max(max, pixels[i * 4 + c]);
      for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++)
          data[c * n + i] = (pixels[i * 4 + c] / max - mean[c]) / std[c];
      const input = new Tensor("float32", data, [1, 3, 320, 320]);
      try {
        const output = await network.run({ [network.inputNames[0]]: input });
        try {
          const mask = new Float32Array(
            output[network.outputNames[0]].data as Float32Array,
          );
          self.postMessage({ id, mask });
        } finally {
          Object.values(output).forEach((t) => t.dispose());
        }
      } finally {
        input.dispose();
      }
    } catch {
      self.postMessage({
        id,
        error: "Background removal is unavailable. Keep the original or retry.",
      });
    }
  });
};
