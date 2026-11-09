import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Choice, PiecePhoto, Toggle } from "./piece-editor";
import { colors, type Piece } from "@/lib/wardrobe";
import { savedPhotoAnalysis, wardrobePhoto } from "@/lib/wardrobe-photos";
import { recognizeCategory } from "@/lib/category-recognition";
import { chooseColor } from "@/lib/photo-tags";
import { cleanPhoto, framePhoto, type CleanPhoto } from "@/lib/photo-cleanup";
import {
  applyCleanPhoto,
  photoTreatment,
  restorePhoto,
} from "@/lib/photo-display";

type Repair = {
  piece: Piece;
  before: string;
  color: string;
  colorStatus:
    | "waiting"
    | "unchanged"
    | "saved"
    | "review"
    | "failed"
    | "undone"
    | "skipped";
  photoStatus: "waiting" | "applied" | "review" | "failed" | "kept" | "skipped";
  colorMessage: string;
  photoMessage: string;
  photo?: CleanPhoto;
  originalUrl?: string;
  showOriginal: boolean;
  zoom: number;
};
type Props = {
  open: boolean;
  onClose: () => void;
  loadPieces: () => Promise<Piece[]>;
  saveColor: (id: string, from: string, to: string) => Promise<void>;
};
const needsWork = (row: Repair) =>
  ["waiting", "failed"].includes(row.colorStatus) ||
  ["waiting", "failed"].includes(row.photoStatus);
export default function ColorRepair({
  open,
  onClose,
  loadPieces,
  saveColor,
}: Props) {
  const [rows, setRows] = useState<Repair[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [fixColors, setFixColors] = useState(true),
    [tidyPhotos, setTidyPhotos] = useState(true);
  const repairs = useRef<Repair[]>([]),
    working = useRef(false),
    stop = useRef(false),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0);
  const publish = () => setRows([...repairs.current]);
  useEffect(() => {
    if (!open) return;
    repairs.current = [];
    working.current = false;
    setRows([]);
    setBusy(false);
    setError("");
    setStatus("");
    return () => {
      generation.current++;
      controller.current?.abort();
      for (const row of repairs.current) {
        if (row.photo) URL.revokeObjectURL(row.photo.url);
        if (row.originalUrl) URL.revokeObjectURL(row.originalUrl);
      }
    };
  }, [open]);
  async function scan() {
    if (working.current || (!fixColors && !tidyPhotos)) return;
    working.current = true;
    setBusy(true);
    setError("");
    stop.current = false;
    const abort = new AbortController(),
      token = generation.current;
    controller.current = abort;
    const progress = (message: string) => {
      if (token === generation.current && !abort.signal.aborted)
        setStatus(message);
    };
    try {
      if (!repairs.current.length) {
        progress("Loading your saved pieces…");
        const pieces = await loadPieces();
        abort.signal.throwIfAborted();
        repairs.current = pieces.map((piece) => ({
          piece,
          before: piece.color,
          color: piece.color,
          colorStatus: fixColors ? "waiting" : "skipped",
          photoStatus: tidyPhotos ? "waiting" : "skipped",
          colorMessage: "",
          photoMessage: "",
          showOriginal: false,
          zoom: photoTreatment(piece)?.zoom || 1,
        }));
        publish();
      }
      let modelAvailable = true;
      for (let i = 0; i < repairs.current.length; i++) {
        if (stop.current || abort.signal.aborted) break;
        const row = repairs.current[i];
        if (!needsWork(row)) continue;
        progress(
          `Cleaning ${i + 1} of ${repairs.current.length}: ${row.piece.name}`,
        );
        if (["waiting", "failed"].includes(row.colorStatus))
          try {
            const analysis = await savedPhotoAnalysis(row.piece);
            abort.signal.throwIfAborted();
            let semantic;
            if (modelAvailable)
              try {
                semantic = (
                  await recognizeCategory(await wardrobePhoto(row.piece), {
                    signal: abort.signal,
                    onProgress: progress,
                  })
                ).attributes?.color;
              } catch {
                abort.signal.throwIfAborted();
                modelAvailable = false;
              }
            abort.signal.throwIfAborted();
            const decision = chooseColor(analysis.colors, semantic);
            row.color = decision.color || row.before;
            if (!decision.certain) {
              row.colorStatus = "review";
              row.colorMessage = decision.reason;
            } else if (row.color === row.before) {
              row.colorStatus = "unchanged";
              row.colorMessage = "Color checked";
            } else {
              await saveColor(row.piece.id, row.before, row.color);
              row.colorStatus = "saved";
              row.colorMessage = "Color corrected";
            }
          } catch (e) {
            if (abort.signal.aborted) break;
            row.colorStatus = "failed";
            row.colorMessage = (e as Error).message;
          }
        if (token === generation.current) publish();
        if (["waiting", "failed"].includes(row.photoStatus))
          try {
            if (!row.photo) {
              const source = await wardrobePhoto(row.piece);
              abort.signal.throwIfAborted();
              const result = await cleanPhoto(source, {
                signal: abort.signal,
                onProgress: progress,
              });
              if (abort.signal.aborted) {
                URL.revokeObjectURL(result.url);
                abort.signal.throwIfAborted();
              }
              row.photo = result;
              row.originalUrl = URL.createObjectURL(source);
              if (row.zoom !== 1) {
                const framed = await framePhoto(result.cutout, row.zoom);
                URL.revokeObjectURL(result.url);
                row.photo = { ...result, ...framed };
              }
            }
            abort.signal.throwIfAborted();
            if (row.photo.confident) {
              applyCleanPhoto(row.piece, row.photo, row.zoom);
              row.photoStatus = "applied";
              row.photoMessage = "Background removed · Size balanced";
            } else {
              row.photoStatus = "review";
              row.photoMessage = row.photo.reason;
            }
          } catch (e) {
            if (abort.signal.aborted) break;
            row.photoStatus = "failed";
            row.photoMessage = (e as Error).message;
          }
        if (token === generation.current) publish();
      }
      progress(
        stop.current
          ? "Paused. Resume whenever you’re ready."
          : repairs.current.length
            ? "Cleanup finished. Check any photos or colors marked for review."
            : "Your wardrobe has no saved photos yet.",
      );
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (token === generation.current) {
        working.current = false;
        setBusy(false);
        publish();
      }
    }
  }
  async function applyColor(row: Repair, undo = false) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await saveColor(
        row.piece.id,
        undo ? row.color : row.before,
        undo ? row.before : row.color,
      );
      row.colorStatus = undo ? "undone" : "saved";
      if (undo) row.color = row.before;
      row.colorMessage = undo ? "Original tag restored" : "Color saved";
    } catch (e) {
      row.colorMessage = (e as Error).message;
    } finally {
      working.current = false;
      setBusy(false);
      publish();
    }
  }
  function usePhoto(row: Repair, restore = false) {
    if (working.current) return;
    try {
      if (restore) {
        restorePhoto(row.piece);
        row.photoStatus = "kept";
        row.showOriginal = true;
        row.photoMessage = "Original photo restored";
      } else if (row.photo) {
        applyCleanPhoto(row.piece, row.photo, row.zoom);
        row.photoStatus = "applied";
        row.showOriginal = false;
        row.photoMessage = "Cleaned photo applied";
      }
    } catch (e) {
      row.photoMessage = (e as Error).message;
    }
    publish();
  }
  async function resize(row: Repair, value: string) {
    if (working.current || !row.photo) return;
    working.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const zoom = value === "Smaller" ? 0.85 : value === "Larger" ? 1.12 : 1,
        framed = await framePhoto(row.photo.cutout, zoom);
      if (token !== generation.current) {
        URL.revokeObjectURL(framed.url);
        return;
      }
      try {
        if (row.photoStatus === "applied")
          applyCleanPhoto(row.piece, framed, zoom);
      } catch (error) {
        URL.revokeObjectURL(framed.url);
        throw error;
      }
      URL.revokeObjectURL(row.photo.url);
      row.photo = { ...row.photo, ...framed };
      row.zoom = zoom;
      row.showOriginal = false;
    } catch (e) {
      row.photoMessage = (e as Error).message;
    } finally {
      if (token === generation.current) {
        working.current = false;
        setBusy(false);
        publish();
      }
    }
  }
  const remaining = rows.filter(needsWork).length;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !working.current) onClose();
      }}
    >
      <DialogContent className="photo-dialog color-repair">
        <DialogHeader>
          <DialogTitle>Clean up wardrobe</DialogTitle>
          <DialogDescription>
            Remove backgrounds, balance photo sizes and fix color tags. Clear
            results apply automatically.
          </DialogDescription>
        </DialogHeader>
        {!rows.length && (
          <div className="cleanup-options">
            <Toggle
              label="Fix color tags"
              checked={fixColors}
              onChange={setFixColors}
              disabled={busy}
            />
            <Toggle
              label="Remove backgrounds and auto-fit"
              checked={tidyPhotos}
              onChange={setTidyPhotos}
              disabled={busy}
            />
          </div>
        )}
        <p className="small">
          Photo cleanup is remembered on this device; originals are kept. Keep
          this screen open while it works.
        </p>
        {status && (
          <p className="upload-status" role="status">
            {status}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!!rows.length && (
          <p className="upload-count">
            {rows.filter((r) => r.photoStatus === "applied").length} photos
            cleaned · {rows.filter((r) => r.colorStatus === "saved").length}{" "}
            colors fixed ·{" "}
            {
              rows.filter(
                (r) => r.photoStatus === "review" || r.colorStatus === "review",
              ).length
            }{" "}
            to review
          </p>
        )}
        <div className="repair-rows">
          {rows.map((row) => (
            <article key={row.piece.id} className="repair-row">
              <div className="cleanup-photo">
                {row.photo ? (
                  <>
                    <img
                      className="piece-photo"
                      alt={
                        (row.showOriginal ? "Original " : "Cleaned ") +
                        row.piece.name
                      }
                      src={row.showOriginal ? row.originalUrl : row.photo.url}
                    />
                    <button
                      className="quiet small"
                      disabled={busy}
                      onClick={() => {
                        row.showOriginal = !row.showOriginal;
                        publish();
                      }}
                    >
                      {row.showOriginal ? "Show cleaned" : "Show original"}
                    </button>
                  </>
                ) : (
                  <PiecePhoto piece={row.piece} />
                )}
              </div>
              <div>
                <h3>{row.piece.name}</h3>
                {row.colorStatus !== "skipped" && (
                  <>
                    <p>
                      {row.before}
                      {row.color !== row.before ? " → " + row.color : ""}
                    </p>
                    <p className="small">{row.colorMessage}</p>
                  </>
                )}
                {row.colorStatus === "review" && (
                  <>
                    <Choice
                      label={"Color for " + row.piece.name}
                      value={row.color}
                      options={colors}
                      onChange={(value) => {
                        row.color = value;
                        publish();
                      }}
                    />
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void applyColor(row)}
                    >
                      Save this color
                    </button>
                  </>
                )}
                {row.colorStatus === "saved" && (
                  <button
                    className="quiet small"
                    disabled={busy}
                    onClick={() => void applyColor(row, true)}
                  >
                    Undo correction
                  </button>
                )}
                {row.photoStatus !== "skipped" && (
                  <p className="small cleanup-photo-status">
                    {row.photoMessage}
                  </p>
                )}
                {row.photo && (
                  <>
                    <fieldset disabled={busy} className="cleanup-size">
                      <Choice
                        label={"Photo size for " + row.piece.name}
                        value={
                          row.zoom < 1
                            ? "Smaller"
                            : row.zoom > 1
                              ? "Larger"
                              : "Auto fit"
                        }
                        options={["Smaller", "Auto fit", "Larger"]}
                        onChange={(value) => void resize(row, value)}
                      />
                    </fieldset>
                    {row.photoStatus !== "applied" && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => usePhoto(row)}
                      >
                        Use cleaned photo
                      </button>
                    )}
                  </>
                )}
                {(row.photoStatus === "applied" ||
                  photoTreatment(row.piece)) && (
                  <button
                    className="quiet small"
                    disabled={busy}
                    onClick={() => usePhoto(row, true)}
                  >
                    Restore original photo
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="photo-picker-actions">
          {busy ? (
            <button
              className="secondary"
              onClick={() => {
                stop.current = true;
                setStatus("Stopping after the current piece…");
              }}
            >
              Stop after this piece
            </button>
          ) : (
            <>
              {(!rows.length || remaining > 0) && (
                <button
                  className="primary"
                  disabled={!fixColors && !tidyPhotos}
                  onClick={() => void scan()}
                >
                  {rows.length
                    ? `Retry / resume (${remaining})`
                    : "Clean up now"}
                </button>
              )}
              <button className="secondary" onClick={onClose}>
                Done
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
