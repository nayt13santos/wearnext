import { openPhoto, canvasOf } from "./photo";
import { fitGarment, garmentMask } from "./photo-framing";
export type CleanupOptions = {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};
export type CleanPhoto = {
  cutout: Blob;
  blob: Blob;
  url: string;
  confident: boolean;
  reason: string;
};
type Pending = {
  resolve: (mask: Float32Array) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
  progress?: CleanupOptions["onProgress"];
};
let worker: Worker | undefined,
  nextId = 0,
  idle: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, Pending>();
function reset() {
  clearTimeout(idle);
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) {
    request.cleanup();
    request.reject(new Error("Background removal stopped. Retry this photo."));
  }
  pending.clear();
}
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./background-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onerror = reset;
    worker.onmessage = (event) => {
      const { id, mask, status, error } = event.data,
        request = pending.get(id);
      if (!request) return;
      if (status) {
        request.progress?.(status);
        return;
      }
      pending.delete(id);
      request.cleanup();
      if (error) request.reject(new Error(error));
      else request.resolve(mask);
      if (!pending.size) idle = setTimeout(reset, 30000);
    };
  }
  return worker;
}
function infer(pixels: Uint8ClampedArray, options: CleanupOptions) {
  options.signal?.throwIfAborted();
  clearTimeout(idle);
  return new Promise<Float32Array>((resolve, reject) => {
    const id = ++nextId;
    let timer: ReturnType<typeof setTimeout>;
    const abort = () => {
      pending.delete(id);
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
      if (!pending.size) reset();
    };
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    };
    try {
      const active = getWorker();
      timer = setTimeout(reset, 120000);
      pending.set(id, {
        resolve,
        reject,
        cleanup,
        progress: options.onProgress,
      });
      options.signal?.addEventListener("abort", abort, { once: true });
      active.postMessage({ id, pixels }, [pixels.buffer]);
    } catch (e) {
      pending.delete(id);
      cleanup();
      reject(e);
    }
  });
}
function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not prepare the cleaned photo.")),
      type,
      0.92,
    ),
  );
}
export async function framePhoto(
  cutout: Blob,
  zoom = 1,
): Promise<{ blob: Blob; url: string }> {
  const image = await openPhoto(cutout);
  try {
    const { canvas, context } = canvasOf(900, 900),
      fit = fitGarment(
        { x: 0, y: 0, width: image.width, height: image.height },
        900,
        zoom,
      );
    context.fillStyle = "white";
    context.fillRect(0, 0, 900, 900);
    context.drawImage(image.image, fit.x, fit.y, fit.width, fit.height);
    const blob = await encode(canvas, "image/jpeg");
    return { blob, url: URL.createObjectURL(blob) };
  } finally {
    image.close();
  }
}
export async function cleanPhoto(
  photo: Blob,
  options: CleanupOptions = {},
): Promise<CleanPhoto> {
  options.signal?.throwIfAborted();
  const image = await openPhoto(photo);
  let sourceOpen = true;
  try {
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height)),
      width = Math.max(1, Math.round(image.width * scale)),
      height = Math.max(1, Math.round(image.height * scale));
    const full = canvasOf(width, height);
    full.context.drawImage(image.image, 0, 0, width, height);
    image.close();
    sourceOpen = false;
    const small = canvasOf(320, 320);
    small.context.fillStyle = "white";
    small.context.fillRect(0, 0, 320, 320);
    small.context.drawImage(full.canvas, 0, 0, 320, 320);
    const raw = await infer(
      small.context.getImageData(0, 0, 320, 320).data,
      options,
    );
    options.signal?.throwIfAborted();
    const mask = garmentMask(raw, 320, 320),
      rgba = small.context.createImageData(320, 320);
    for (let i = 0; i < mask.alpha.length; i++) {
      rgba.data[i * 4] = 255;
      rgba.data[i * 4 + 1] = 255;
      rgba.data[i * 4 + 2] = 255;
      rgba.data[i * 4 + 3] = mask.alpha[i];
    }
    small.context.putImageData(rgba, 0, 0);
    full.context.globalCompositeOperation = "destination-in";
    full.context.drawImage(small.canvas, 0, 0, width, height);
    const b = mask.bounds,
      x = Math.floor((b.x * width) / 320),
      y = Math.floor((b.y * height) / 320),
      w = Math.min(width - x, Math.ceil((b.width * width) / 320)),
      h = Math.min(height - y, Math.ceil((b.height * height) / 320));
    const crop = canvasOf(w, h);
    crop.context.drawImage(full.canvas, x, y, w, h, 0, 0, w, h);
    const cutout = await encode(crop.canvas, "image/png");
    options.signal?.throwIfAborted();
    const framed = await framePhoto(cutout);
    if (options.signal?.aborted) {
      URL.revokeObjectURL(framed.url);
      options.signal.throwIfAborted();
    }
    const detailed = Math.max(w, h) >= 180;
    return {
      ...framed,
      cutout,
      confident: mask.confident && detailed,
      reason: detailed
        ? mask.reason
        : "This piece is small in the photo. Check the edges and clarity before using it.",
    };
  } finally {
    if (sourceOpen) image.close();
  }
}

/** Keep the source hash and analysis stable so photo cleanup cannot break duplicate detection. */
export async function prepareUploadPhoto(
  photo: import("./photo").PhotoResult,
  options: CleanupOptions = {},
): Promise<import("./photo").PhotoResult> {
  try {
    const result = await cleanPhoto(photo.original, options);
    if (!result.confident) {
      URL.revokeObjectURL(result.url);
      return { ...photo, cleanup: "review" };
    }
    URL.revokeObjectURL(photo.url);
    return { ...photo, blob: result.blob, url: result.url, cleanup: "cleaned" };
  } catch (error) {
    options.signal?.throwIfAborted();
    return { ...photo, cleanup: "unavailable" };
  }
}
