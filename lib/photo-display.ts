import { photoSource } from "./client";
import { cleanPhoto, framePhoto, type CleanPhoto } from "./photo-cleanup";
import type { Piece } from "./wardrobe";
const PREFIX = "wearnext.photo-fit.v1:";
type Treatment = { zoom: number };
const prepared = new Map<string, Promise<string>>(),
  urls = new Map<string, string>();
const listeners = new Set<(id: string) => void>();
const key = (piece: Piece) =>
  PREFIX + piece.id + ":" + (piece.fingerprint || "");
export function photoTreatment(piece: Piece): Treatment | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(piece)) || "null");
    return value &&
      Number.isFinite(value.zoom) &&
      value.zoom >= 0.65 &&
      value.zoom <= 1.15
      ? { zoom: value.zoom }
      : null;
  } catch {
    return null;
  }
}
export function onPhotoChange(listener: (id: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function changed(piece: Piece) {
  listeners.forEach((listener) => listener(piece.id));
}
function remember(piece: Piece, url: string) {
  const k = key(piece),
    old = urls.get(k);
  urls.set(k, url);
  prepared.set(k, Promise.resolve(url));
  if (old && old !== url) URL.revokeObjectURL(old);
}
export function applyCleanPhoto(
  piece: Piece,
  result: Pick<CleanPhoto, "blob">,
  zoom = 1,
) {
  if (!Number.isFinite(zoom) || zoom < 0.65 || zoom > 1.15)
    throw new Error("Check the photo size.");
  // Store only the display choice. Private images stay in memory; Drive originals are untouched.
  try {
    localStorage.setItem(key(piece), JSON.stringify({ zoom }));
  } catch {
    throw new Error(
      "This browser cannot remember photo cleanup. Allow website storage and retry.",
    );
  }
  const url = URL.createObjectURL(result.blob);
  remember(piece, url);
  changed(piece);
}
export function restorePhoto(piece: Piece) {
  try {
    localStorage.removeItem(key(piece));
  } catch {
    throw new Error("Could not restore this photo. Try again.");
  }
  const k = key(piece),
    old = urls.get(k);
  urls.delete(k);
  prepared.delete(k);
  if (old) URL.revokeObjectURL(old);
  changed(piece);
}
export function displayPhotoSource(piece: Piece): Promise<string> {
  const treatment = photoTreatment(piece);
  if (!treatment) return photoSource(piece.id);
  const k = key(piece),
    cached = prepared.get(k);
  if (cached) return cached;
  let promise!: Promise<string>;
  promise = (async () => {
    const raw = await photoSource(piece.id),
      response = await fetch(raw);
    if (!response.ok) throw new Error("Photo unavailable.");
    const result = await cleanPhoto(await response.blob());
    let url = result.url;
    if (treatment.zoom !== 1) {
      const framed = await framePhoto(result.cutout, treatment.zoom);
      URL.revokeObjectURL(url);
      url = framed.url;
    }
    // A late render must not reinstate cleanup after Restore or a new size choice.
    if (prepared.get(k) !== promise) {
      URL.revokeObjectURL(url);
      return displayPhotoSource(piece);
    }
    urls.set(k, url);
    return url;
  })().catch(() => {
    if (prepared.get(k) === promise) {
      prepared.delete(k);
      return photoSource(piece.id);
    }
    return displayPhotoSource(piece);
  });
  prepared.set(k, promise);
  return promise;
}
