"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Shirt,
  Plus,
  WandSparkles,
  CloudSun,
  History,
  ShoppingBag,
  Settings2,
  ArrowRight,
  LockKeyhole,
  RefreshCw,
  Check,
  Search,
  Heart,
  WashingMachine,
  Archive,
  Undo2,
  Camera,
  CloudRain,
  MapPin,
  X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster, toast } from "sonner";
import PieceEditor, { Choice, Toggle, PiecePhoto } from "./piece-editor";
import {
  availability,
  defaults,
  demoPieces,
  dayToday,
  addDays,
  occasions,
  categories,
  generateOutfit,
  purchaseScore,
  lastWorn,
  type Piece,
  type Wear,
  type Preferences,
  type Context,
} from "@/lib/wardrobe";
import { colorwayOptions, findColorway, colorSwatches } from "@/lib/colorways";
import type { PhotoResult } from "@/lib/photo";
import { jsonRequest, uploadId, type State } from "@/lib/client";
import { readConnection } from "@/lib/connection";
import ConnectionPanel from "./connection-panel";
import OutfitPicker from "./outfit-picker";
import OutfitSuggestions from "./outfit-suggestions";
import AutoUpload from "./auto-upload";
import ColorRepair from "./color-repair";
import {
  canRemovePiece,
  outfitKey,
  outfitSuggestions,
  replacePiece,
  swapOptions,
  type OutfitSuggestion,
} from "@/lib/outfit-views";
import type { Category } from "@/lib/wardrobe";
const assets = import.meta.env.BASE_URL;
function ColorSwatches({ colors }: { colors: readonly string[] }) {
  return (
    <div className="color-swatches" aria-label={"Colors: " + colors.join(", ")}>
      {colors.map((color) => (
        <span
          key={color}
          title={color}
          style={{ background: colorSwatches[color] }}
        >
          <span className="sr-only">{color}</span>
        </span>
      ))}
    </div>
  );
}

export default function Studio() {
  const [signedIn] = useState(() => !!readConnection());
  const [tab, setTab] = useState("today"),
    [state, setState] = useState<State>({
      pieces: [],
      wears: [],
      preferences: defaults,
    }),
    [demo, setDemo] = useState(false),
    [demoItems, setDemoItems] = useState(demoPieces),
    [demoWears, setDemoWears] = useState<Wear[]>([]),
    [loading, setLoading] = useState(signedIn),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [day, setDay] = useState(dayToday()),
    [occasion, setOccasion] = useState("Everyday"),
    [temperature, setTemperature] = useState(30),
    [rain, setRain] = useState(false),
    [aircon, setAircon] = useState(false),
    [weather, setWeather] = useState("Manual temperature"),
    [outfit, setOutfit] = useState<Piece[]>([]),
    [reason, setReason] = useState(""),
    [locks, setLocks] = useState<string[]>([]);
  const [view, setView] = useState<"mix" | "suggestions">("mix"),
    [suggestions, setSuggestions] = useState<OutfitSuggestion[]>([]);
  const [colorway, setColorway] = useState("Automatic"),
    [outfitColorway, setOutfitColorway] = useState("");
  const selectedPalette = findColorway(colorway),
    outfitPalette = findColorway(outfitColorway);
  const [autoUpload, setAutoUpload] = useState(false),
    [repair, setRepair] = useState(false);
  const [editor, setEditor] = useState(false),
    [editing, setEditing] = useState<Piece | null>(null),
    [purchaseMode, setPurchaseMode] = useState(false),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All pieces"),
    [filter, setFilter] = useState("Active");
  const [prefs, setPrefs] = useState(defaults),
    [citySearch, setCitySearch] = useState("Marikina"),
    [cities, setCities] = useState<
      {
        id: number;
        name: string;
        country: string;
        latitude: number;
        longitude: number;
      }[]
    >([]);
  const [candidate, setCandidate] = useState<Piece | null>(null),
    [candidatePhoto, setCandidatePhoto] = useState<PhotoResult | null>(null),
    [price, setPrice] = useState(""),
    [estimatedWears, setEstimatedWears] = useState("20");
  const pieces = demo ? demoItems : state.pieces,
    wears = demo ? demoWears : state.wears,
    preferences = state.preferences;
  const context: Context = {
    day,
    occasion,
    temperature,
    rain,
    aircon,
    colorway,
  };
  const ctxRef = useRef({ pieces, wears, preferences, context, locks, outfit });
  ctxRef.current = { pieces, wears, preferences, context, locks, outfit };
  const weatherAbort = useRef<AbortController | null>(null);
  const boardRef = useRef<HTMLElement | null>(null),
    [generationAttempt, setGenerationAttempt] = useState(0),
    [generationMessage, setGenerationMessage] = useState("");
  useEffect(() => {
    if (!generationAttempt) return;
    boardRef.current?.focus({ preventScroll: true });
    boardRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }, [generationAttempt]);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest("/api/wardrobe");
      setState(data);
      setPrefs(data.preferences);
      setCitySearch(data.preferences.city);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (signedIn) void refresh();
  }, [signedIn]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register(assets + "sw.js").catch(() => {});
  }, []);
  async function getWeather() {
    if (!signedIn) return;
    weatherAbort.current?.abort();
    const controller = new AbortController();
    weatherAbort.current = controller;
    setWeather("Getting forecast…");
    try {
      const d = await jsonRequest<{
        temperature: number;
        rain: boolean;
        probability: number;
      }>(
        `/api/weather?lat=${preferences.latitude}&lon=${preferences.longitude}&day=${day}`,
        { signal: controller.signal },
      );
      setTemperature(d.temperature);
      setRain(d.rain);
      setWeather(`Forecast feels-like high · ${d.probability}% rain`);
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setWeather("Forecast unavailable · set manually");
    }
  }
  useEffect(() => {
    if (signedIn && !loading) void getWeather();
    return () => weatherAbort.current?.abort();
  }, [signedIn, loading, day, preferences.latitude, preferences.longitude]);
  useEffect(() => {
    setOutfit([]);
    setOutfitColorway("");
    setLocks([]);
    setReason("");
    setGenerationMessage("");
    setSuggestions([]);
  }, [
    demo,
    day,
    occasion,
    temperature,
    rain,
    aircon,
    colorway,
    pieces,
    wears,
    preferences,
  ]);
  async function mutate(action: string, data: Record<string, unknown>) {
    setBusy(action);
    try {
      const next = await jsonRequest("/api/wardrobe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      });
      setState(next);
      return next;
    } finally {
      setBusy("");
    }
  }
  function notifyError(e: unknown) {
    toast.error((e as Error).message);
  }
  function generate() {
    const s = ctxRef.current;
    try {
      const result = s.pieces.length
        ? generateOutfit(
            s.pieces,
            s.wears,
            s.preferences,
            s.context,
            s.locks,
            s.outfit.map((p) => p.id),
          )
        : {
            items: [],
            colorway: undefined,
            reason: signedIn
              ? "Add a top, bottom and shoes—or a one-piece and shoes—to get started."
              : "Connect your wardrobe in Settings, or try the sample wardrobe below.",
          };
      setSuggestions(
        result.items.length && result.colorway
          ? outfitSuggestions(
              { items: result.items, colorway: result.colorway },
              s.pieces,
              s.wears,
              s.preferences,
              s.context,
              s.locks,
            )
          : [],
      );
      setOutfit(result.items);
      setOutfitColorway(result.colorway?.name || "");
      setReason(result.reason);
      setGenerationMessage(
        result.items.length
          ? `Your outfit is ready: ${result.items.length} pieces selected. ${result.colorway?.name} colorway.`
          : result.reason,
      );
    } catch {
      const message =
        "Your outfit could not be generated. Reload your wardrobe and try again.";
      setSuggestions([]);
      setOutfit([]);
      setOutfitColorway("");
      setReason(message);
      setGenerationMessage(message);
    }
    setGenerationAttempt((attempt) => attempt + 1);
  }
  function openAdd(purchase = false, piece: Piece | null = null) {
    if (!signedIn && !purchase && !(demo && piece)) {
      setTab("settings");
      toast.info("Connect your wardrobe to save your clothes.");
      return;
    }
    if (!purchase && !piece) {
      setAutoUpload(true);
      return;
    }
    setEditing(piece);
    setPurchaseMode(purchase);
    setEditor(true);
  }
  async function loadSavedPieces() {
    const data = await jsonRequest("/api/wardrobe");
    setState(data);
    return data.pieces;
  }
  async function uploadPiece(piece: Piece, photo: PhotoResult): Promise<Piece> {
    // Recheck cloud state before each save, including retries after a lost response.
    const latest = await jsonRequest("/api/wardrobe"),
      id = uploadId(photo.blob);
    const existing = latest.pieces.find(
      (p) => p.id === id || p.fingerprint === photo.fingerprint,
    );
    if (existing) {
      setState(latest);
      return existing;
    }
    const form = new FormData();
    form.append("id", id);
    form.append("photo", photo.blob, "clothing.jpg");
    form.append("original", photo.original, "original.jpg");
    form.append("data", JSON.stringify(piece));
    const next = await jsonRequest("/api/upload", {
      method: "POST",
      body: form,
    });
    setState(next);
    setDemo(false);
    const saved = next.pieces.find(
      (p) => p.id === id || p.fingerprint === photo.fingerprint,
    );
    if (!saved)
      throw new Error("The save could not be confirmed. Retry this photo.");
    return saved;
  }
  async function saveColor(id: string, from: string, to: string) {
    const latest = await jsonRequest("/api/wardrobe"),
      piece = latest.pieces.find((p) => p.id === id);
    if (!piece) throw new Error("This piece is no longer in your wardrobe.");
    if (piece.color !== from) {
      setState(latest);
      throw new Error(
        "This color changed since the scan. Reopen the repair screen to check it again.",
      );
    }
    if (from === to) return;
    await mutate("piece", { id, data: { ...piece, color: to } });
  }
  async function savePiece(piece: Piece, photo: PhotoResult | null) {
    if (purchaseMode) {
      if (!photo) throw new Error("Add a photo first.");
      if (candidatePhoto) URL.revokeObjectURL(candidatePhoto.url);
      const url = URL.createObjectURL(photo.blob);
      setCandidate({ ...piece, id: "candidate", image: url });
      setCandidatePhoto({ ...photo, url });
      return;
    }
    if (editing) {
      if (demo) {
        setDemoItems((items) =>
          items.map((p) => (p.id === piece.id ? piece : p)),
        );
      } else await mutate("piece", { id: piece.id, data: piece });
      toast.success("Clothing updated");
      return;
    }
    if (!photo) throw new Error("Add a photo first.");
    await uploadPiece(piece, photo);
    toast.success("Clothing saved");
  }
  async function updatePiece(piece: Piece, change: Partial<Piece>) {
    try {
      if (demo)
        setDemoItems((items) =>
          items.map((p) => (p.id === piece.id ? { ...p, ...change } : p)),
        );
      else
        await mutate("piece", { id: piece.id, data: { ...piece, ...change } });
      if (change.laundry || change.archived) {
        setOutfit((current) => current.filter((p) => p.id !== piece.id));
        setLocks((current) => current.filter((id) => id !== piece.id));
      }
      toast.success("Wardrobe updated");
    } catch (e) {
      notifyError(e);
    }
  }
  async function wearToday() {
    setBusy("wear");
    try {
      if (day !== dayToday())
        throw new Error(
          "You can plan ahead, but only record what you wear today.",
        );
      if (demo) {
        if (demoWears.some((w) => w.day === day))
          throw new Error(
            "A sample outfit is already recorded today. Undo it in history first.",
          );
        setDemoWears([
          ...demoWears,
          { id: "demo-" + day, day, items: outfit, occasion, temperature },
        ]);
      } else
        await mutate("wear", {
          day,
          ids: outfit.map((p) => p.id),
          occasion,
          temperature,
        });
      setOutfit([]);
      setLocks([]);
      toast.success(
        demo
          ? "Sample wear recorded (not saved to your account)"
          : "Outfit recorded. Your rotation starts today.",
      );
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy("");
    }
  }
  async function undo(w: Wear) {
    try {
      if (demo) setDemoWears((ws) => ws.filter((x) => x.id !== w.id));
      else await mutate("undo", { id: w.id });
      toast.success("Wear undone. Availability recalculated.");
    } catch (e) {
      notifyError(e);
    }
  }
  function toggleLock(piece: Piece) {
    setLocks((ids) =>
      ids.includes(piece.id)
        ? ids.filter((id) => id !== piece.id)
        : [...ids, piece.id],
    );
    setSuggestions([]);
  }
  function selectPiece(category: Category, piece: Piece | null) {
    if (
      !outfitPalette ||
      outfit.some((p) => p.category === category && locks.includes(p.id))
    )
      return;
    if (
      piece
        ? !swapOptions(
            pieces,
            wears,
            preferences,
            context,
            outfit,
            outfitPalette,
            category,
          ).some((p) => p.id === piece.id)
        : !canRemovePiece(outfit, category, outfitPalette, context)
    )
      return;
    setOutfit((items) => replacePiece(items, category, piece));
    setGenerationMessage(
      piece
        ? `${piece.name} selected. The rest of your outfit stays in place.`
        : `${category} removed from your outfit.`,
    );
  }
  function chooseSuggestion(suggestion: OutfitSuggestion) {
    setOutfit(suggestion.items);
    setOutfitColorway(suggestion.colorway.name);
    setReason("");
    setView("mix");
    setGenerationMessage(
      `Outfit selected: ${suggestion.items.length} pieces. Slide a row to make it yours.`,
    );
    setGenerationAttempt((attempt) => attempt + 1);
  }
  const active = pieces.filter((p) => !p.archived),
    available = active.filter(
      (p) => availability(p, wears, day, preferences.cooldown) === "Available",
    );
  const visible = pieces.filter(
    (p) =>
      (filter === "Archived" ? p.archived : !p.archived) &&
      (filter !== "Laundry" || p.laundry) &&
      (filter !== "Ready to wear" ||
        availability(p, wears, day, preferences.cooldown) === "Available") &&
      (category === "All pieces" || p.category === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const score = useMemo(
    () =>
      candidate
        ? purchaseScore(
            candidate,
            pieces,
            price === "" ? null : Number(price),
            preferences.budget,
          )
        : null,
    [candidate, pieces, price, preferences.budget],
  );
  const money = (n: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: preferences.currency,
      maximumFractionDigits: 0,
    }).format(n);
  async function searchCity() {
    setBusy("city");
    try {
      const data = await jsonRequest<{ results: typeof cities }>(
        "/api/weather?city=" + encodeURIComponent(citySearch),
      );
      setCities(data.results);
      if (!data.results.length)
        toast.info("No matching cities. Try a nearby city.");
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy("");
    }
  }
  const signIn = (
    <button className="primary" onClick={() => setTab("settings")}>
      Connect my wardrobe
    </button>
  );
  return (
    <div className="studio">
      <Toaster richColors position="top-center" />
      <header className="app-header">
        <a
          className="wordmark"
          href={assets}
          onClick={(event) => {
            event.preventDefault();
            setTab("today");
          }}
          aria-label="WearNext home"
        >
          <img
            src={assets + "favicon.svg"}
            className="brand-icon"
            alt=""
            width="36"
            height="36"
          />
          wearnext
        </a>
        <button className="primary add-clothes" onClick={() => openAdd()}>
          <Plus size={18} />
          Add clothes
        </button>
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <nav className="nav-row" aria-label="Main navigation">
          <TabsList className="main-tabs" aria-label="WearNext screens">
            <TabsTrigger value="today">
              <WandSparkles />
              Outfits
            </TabsTrigger>
            <TabsTrigger value="wardrobe">
              <Shirt />
              Wardrobe
            </TabsTrigger>
            <TabsTrigger value="shop">
              <ShoppingBag />
              Shop
            </TabsTrigger>
            <TabsTrigger value="history">
              <History />
              History
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 />
              Settings
            </TabsTrigger>
          </TabsList>
        </nav>
        {demo ? (
          <div className="mode-banner">
            <span>Sample wardrobe · Nothing is saved.</span>
            <button onClick={() => setDemo(false)}>
              Exit sample <X size={16} />
            </button>
          </div>
        ) : !signedIn && tab !== "settings" ? (
          <div className="mode-banner">
            <span>Your clothes, on all your devices.</span>
            <button onClick={() => setTab("settings")}>
              Connect wardrobe <ArrowRight size={16} />
            </button>
          </div>
        ) : null}
        {loading && (
          <p className="notice" role="status">
            Opening your wardrobe…
          </p>
        )}
        {error && (
          <div className="error notice" role="alert">
            {error}{" "}
            <button className="quiet" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        <TabsContent value="today">
          <section className="page-heading">
            <div>
              <h1>
                {day === dayToday() ? "Today’s outfit" : "Plan an outfit"}
              </h1>
              <p className="page-subtitle">
                {new Date(day + "T12:00:00").toLocaleDateString("en-PH", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </section>
          <div className="planner-grid">
            <section className="planner-controls" aria-label="Outfit options">
              <div className="planner-basics">
                <Choice
                  label="Occasion"
                  value={occasion}
                  options={occasions}
                  onChange={setOccasion}
                />
                <div className="weather-summary">
                  {rain ? <CloudRain size={25} /> : <CloudSun size={25} />}
                  <div>
                    <strong>
                      {temperature}°C · {rain ? "Rain" : "Dry"}
                    </strong>
                    <span>{preferences.city}</span>
                  </div>
                </div>
                <button
                  className="primary generate-button"
                  disabled={
                    loading ||
                    !Number.isFinite(temperature) ||
                    temperature < -40 ||
                    temperature > 60
                  }
                  aria-controls="outfit-result"
                  onClick={generate}
                >
                  <WandSparkles size={18} />
                  {loading
                    ? "Loading…"
                    : outfit.length
                      ? "Try another"
                      : "Pick an outfit"}
                </button>
              </div>
              <details className="planner-more">
                <summary>More options</summary>
                <div className="planner-details">
                  <label className="field">
                    <span>Plan for</span>
                    <input
                      type="date"
                      value={day}
                      min={dayToday()}
                      max={addDays(dayToday(), 9)}
                      onChange={(e) => {
                        if (e.target.value) setDay(e.target.value);
                      }}
                    />
                  </label>
                  <div className="colorway-picker">
                    <Choice
                      label="Colorway"
                      value={colorway}
                      options={colorwayOptions}
                      onChange={setColorway}
                    />
                    {selectedPalette && (
                      <ColorSwatches colors={selectedPalette.colors} />
                    )}
                  </div>
                  <label className="field">
                    <span>Feels like (°C)</span>
                    <input
                      type="number"
                      min={-40}
                      max={60}
                      value={temperature}
                      onChange={(e) => {
                        setTemperature(Number(e.target.value));
                        setWeather("Manual temperature");
                        weatherAbort.current?.abort();
                      }}
                    />
                  </label>
                  <div className="context-toggles">
                    <Toggle
                      label="Rain expected"
                      checked={rain}
                      onChange={(v) => {
                        setRain(v);
                        setWeather("Manual weather");
                        weatherAbort.current?.abort();
                      }}
                    />
                    <Toggle
                      label="Air-conditioned indoors"
                      checked={aircon}
                      onChange={setAircon}
                    />
                  </div>
                </div>
                <div className="forecast-note">
                  <p>
                    {weather}
                    {signedIn ? " · " + preferences.city : ""}
                  </p>
                  {signedIn && (
                    <button
                      className="quiet small"
                      onClick={() => void getWeather()}
                    >
                      <RefreshCw size={14} />
                      Refresh forecast
                    </button>
                  )}
                  <a
                    href="https://open-meteo.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Weather by Open-Meteo
                  </a>
                </div>
              </details>
              <p
                className="generation-feedback sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {generationMessage}
              </p>
            </section>
            <section
              className="outfit-workspace"
              id="outfit-result"
              ref={boardRef}
              tabIndex={-1}
              aria-label="Outfit result"
            >
              <div
                className="outfit-view-switch"
                role="group"
                aria-label="Outfit view"
              >
                <button
                  aria-pressed={view === "mix"}
                  onClick={() => setView("mix")}
                >
                  Mix &amp; match
                </button>
                <button
                  aria-pressed={view === "suggestions"}
                  onClick={() => {
                    setView("suggestions");
                    if (!suggestions.length) generate();
                  }}
                >
                  Suggestions
                </button>
              </div>
              {view === "mix" ? (
                <section
                  className={
                    "outfit-board" + (outfit.length ? " outfit-editor" : "")
                  }
                >
                  <div className="board-label">
                    <span>
                      {outfit.length
                        ? `${occasion} · ${temperature}°C`
                        : reason
                          ? "No outfit generated"
                          : "Ready when you are"}
                    </span>
                    <span>{available.length} pieces available</span>
                  </div>
                  {outfit.length ? (
                    <>
                      <div className="editor-summary">
                        <div
                          className="editor-outfit-preview"
                          role="group"
                          aria-label="Current outfit preview"
                        >
                          <div className="suggestion-collage">
                            {outfit.map((p) => (
                              <div
                                key={p.id}
                                className={
                                  "suggestion-piece category-" +
                                  p.category.toLowerCase()
                                }
                              >
                                <PiecePhoto piece={p} />
                              </div>
                            ))}
                          </div>
                        </div>
                        {outfitPalette && (
                          <div className="outfit-colorway">
                            <div>
                              <strong>{outfitPalette.name}</strong>
                            </div>
                            <ColorSwatches
                              colors={[...new Set(outfit.map((p) => p.color))]}
                            />
                            <p>Slide a row to change your look.</p>
                          </div>
                        )}
                      </div>
                      {outfitPalette && (
                        <OutfitPicker
                          pieces={pieces}
                          wears={wears}
                          preferences={preferences}
                          context={context}
                          outfit={outfit}
                          palette={outfitPalette}
                          locks={locks}
                          onSelect={selectPiece}
                          onLock={toggleLock}
                        />
                      )}
                      <div className="outfit-notes">
                        <p>
                          {temperature >= 27
                            ? "Lightweight pieces for a warm day."
                            : temperature < 18
                              ? "Layer up for a cooler day."
                              : "Balanced layers for a mild day."}{" "}
                          {rain
                            ? "Rain is possible—take an umbrella; check your shoes."
                            : ""}
                        </p>
                      </div>
                      <button
                        className="primary full wear-button"
                        disabled={
                          !!busy ||
                          day !== dayToday() ||
                          !outfit.some((p) => p.category === "Shoes") ||
                          !(
                            outfit.some((p) => p.category === "One-piece") ||
                            (outfit.some((p) => p.category === "Top") &&
                              outfit.some((p) => p.category === "Bottom"))
                          ) ||
                          outfit.some(
                            (p) =>
                              availability(
                                p,
                                wears,
                                day,
                                preferences.cooldown,
                              ) !== "Available",
                          )
                        }
                        onClick={() => void wearToday()}
                      >
                        <Check size={18} />
                        {busy === "wear"
                          ? "Recording…"
                          : day !== dayToday()
                            ? "Planned ahead · wear it on the day"
                            : "Wear this today"}
                      </button>
                    </>
                  ) : (
                    <>
                      {!reason && (
                        <div
                          className="sample-photo"
                          role="img"
                          aria-label="Example white linen shirt"
                          style={{
                            backgroundImage: `url(${assets}demo-catalog.png)`,
                            backgroundSize: "300% 200%",
                            backgroundPosition: "0% 0%",
                          }}
                        />
                      )}
                      <div className="board-empty">
                        <h2>
                          {reason
                            ? "Let’s find what’s missing."
                            : pieces.length
                              ? "A fresh way to wear it."
                              : "Start with your wardrobe."}
                        </h2>
                        {reason && locks.length > 0 && (
                          <button
                            className="quiet"
                            onClick={() => {
                              setLocks([]);
                              setSuggestions([]);
                            }}
                          >
                            Unlock kept pieces
                          </button>
                        )}
                        <p>
                          {reason ||
                            (pieces.length
                              ? "Pick an outfit, then slide the pieces to make it yours."
                              : "Add a few pieces. We’ll help put them together.")}
                        </p>
                        {!pieces.length ? (
                          <>
                            <button
                              className="quiet"
                              onClick={() => {
                                setDemo(true);
                                setDemoWears([]);
                                setDemoItems(demoPieces);
                              }}
                            >
                              Try a sample wardrobe <ArrowRight size={18} />
                            </button>
                          </>
                        ) : (
                          <button
                            className="quiet"
                            onClick={() => setTab("wardrobe")}
                          >
                            View my wardrobe <ArrowRight size={18} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </section>
              ) : (
                <>
                  {reason && (
                    <p className="notice" role="status">
                      {reason}
                    </p>
                  )}
                  <OutfitSuggestions
                    suggestions={suggestions}
                    occasion={occasion}
                    onChoose={chooseSuggestion}
                    onDismiss={(key) =>
                      setSuggestions((items) =>
                        items.filter((item) => outfitKey(item.items) !== key),
                      )
                    }
                    onGenerate={generate}
                  />
                </>
              )}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="wardrobe">
          <section className="page-heading">
            <div>
              <h1>Wardrobe</h1>
              <p className="page-subtitle">
                {active.length} pieces · {available.length} ready to wear
              </p>
            </div>
            <button
              className="quiet repair-colors"
              disabled={!signedIn || demo || loading || !!busy}
              onClick={() => setRepair(true)}
            >
              <RefreshCw size={16} />
              Repair color tags
            </button>
          </section>
          <div className="wardrobe-toolbar">
            <label className="search-field">
              <Search size={18} />
              <input
                aria-label="Search wardrobe"
                placeholder="Find a piece…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <details className="wardrobe-filters">
              <summary>
                Filters
                {category !== "All pieces" || filter !== "Active"
                  ? " · On"
                  : ""}
              </summary>
              <div className="filter-fields">
                <Choice
                  label="Category filter"
                  value={category}
                  options={["All pieces", ...categories]}
                  onChange={setCategory}
                />
                <Choice
                  label="Show"
                  value={filter}
                  options={["Active", "Ready to wear", "Laundry", "Archived"]}
                  onChange={setFilter}
                />
              </div>
            </details>
          </div>
          {visible.length ? (
            <div className="wardrobe-grid">
              {visible.map((p) => {
                const status = availability(
                  p,
                  wears,
                  dayToday(),
                  preferences.cooldown,
                );
                const last = lastWorn(p, wears, dayToday());
                return (
                  <article key={p.id} className="wardrobe-card">
                    <button
                      className="wardrobe-photo"
                      onClick={() => openAdd(false, p)}
                      aria-label={"Edit " + p.name}
                    >
                      <PiecePhoto piece={p} />
                    </button>
                    <div className="wardrobe-info">
                      <div className="row-between">
                        <h3>{p.name}</h3>
                        <button
                          className={
                            "icon-button " + (p.favorite ? "favorite" : "")
                          }
                          aria-label={
                            (p.favorite ? "Unfavorite " : "Favorite ") + p.name
                          }
                          disabled={!!busy}
                          onClick={() =>
                            void updatePiece(p, { favorite: !p.favorite })
                          }
                        >
                          <Heart
                            size={18}
                            fill={p.favorite ? "currentColor" : "none"}
                          />
                        </button>
                      </div>
                      <p>
                        {p.category} · {p.color}
                      </p>
                      {status !== "Available" && (
                        <span className="availability resting">{status}</span>
                      )}
                      <details className="piece-manage">
                        <summary>
                          Manage<span className="sr-only"> {p.name}</span>
                        </summary>
                        <p className="small">
                          {last ? "Last worn " + last : "Not worn yet"}
                        </p>
                        <div className="card-actions">
                          <button onClick={() => openAdd(false, p)}>
                            Edit
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() =>
                              void updatePiece(p, { laundry: !p.laundry })
                            }
                          >
                            <WashingMachine size={15} />
                            {p.laundry ? "Clean" : "Laundry"}
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() =>
                              void updatePiece(p, { archived: !p.archived })
                            }
                          >
                            <Archive size={15} />
                            {p.archived ? "Restore" : "Archive"}
                          </button>
                        </div>
                      </details>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-page">
              <Shirt size={36} />
              <h2>
                {pieces.length
                  ? "No pieces match your filters."
                  : "Your wardrobe starts here."}
              </h2>
              <p>
                Choose photos to automatically tag and save your clothes. We’ll
                check for duplicates too.
              </p>
              {pieces.length ? (
                <button
                  className="secondary"
                  onClick={() => {
                    setSearch("");
                    setCategory("All pieces");
                    setFilter("Active");
                  }}
                >
                  Clear filters
                </button>
              ) : !signedIn ? (
                signIn
              ) : (
                <button className="primary" onClick={() => openAdd()}>
                  Add my first clothes
                </button>
              )}
              <button className="quiet" onClick={() => setDemo(true)}>
                Explore sample clothes
              </button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="shop">
          <section className="page-heading">
            <div>
              <h1>Worth buying?</h1>
              <p className="page-subtitle">
                See how a new piece fits your wardrobe.
              </p>
            </div>
            {candidate && (
              <button className="secondary" onClick={() => openAdd(true)}>
                <Camera size={18} />
                Check another item
              </button>
            )}
          </section>
          {!candidate ? (
            <div className="shopping-empty">
              <div className="shopping-visual">
                <div
                  className="sample-photo"
                  role="img"
                  aria-label="Sample blue T-shirt"
                  style={{
                    backgroundImage: `url(${assets}demo-catalog.png)`,
                    backgroundSize: "300% 200%",
                    backgroundPosition: "50% 0%",
                  }}
                />
                <span className="sample-tag">Example item</span>
              </div>
              <div>
                <h2>Make room for the right piece.</h2>
                <p>
                  Add a photo to see outfit matches, similar clothes you own,
                  and how it fits your budget.
                </p>
                <button className="primary" onClick={() => openAdd(true)}>
                  <Camera size={18} />
                  Take or upload a photo
                </button>
                <p className="small">Review the details before checking.</p>
              </div>
            </div>
          ) : (
            <div className="shopping-grid">
              <aside className="candidate-panel">
                <PiecePhoto piece={candidate} />
                <h2>{candidate.name}</h2>
                <p>
                  {candidate.color} · {candidate.category} · {candidate.style}
                </p>
                <label className="field">
                  <span>Sale price ({preferences.currency})</span>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>How many times would you wear it?</span>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={estimatedWears}
                    onChange={(e) => setEstimatedWears(e.target.value)}
                  />
                </label>
                {price !== "" &&
                  Number(price) >= 0 &&
                  Number(estimatedWears) > 0 && (
                    <p className="cost-per-wear">
                      {money(Number(price) / Number(estimatedWears))} per
                      estimated wear
                    </p>
                  )}
                <button
                  className="secondary full"
                  disabled={!signedIn || !candidatePhoto || !!busy || demo}
                  onClick={async () => {
                    setBusy("buy-add");
                    try {
                      setPurchaseMode(false);
                      if (!candidatePhoto)
                        throw new Error("Upload the photo again.");
                      await uploadPiece(candidate, candidatePhoto);
                      toast.success("Added to your wardrobe");
                      setCandidate(null);
                    } catch (e) {
                      notifyError(e);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  I bought it · add to wardrobe
                </button>
                <p className="small">Only use this once you own it.</p>
              </aside>
              {score && (
                <section className="score-panel">
                  <div className="score-heading">
                    <div className="score-number">
                      {score.lowConfidence ? "—" : score.score}
                      <span>
                        {score.lowConfidence ? "Not enough data" : "/ 100"}
                      </span>
                    </div>
                    <div>
                      <h2>{score.verdict}</h2>
                      <p>
                        {score.lowConfidence
                          ? "Save at least three real pieces for a useful assessment."
                          : `${score.limited ? "At least " : ""}${score.combos} compatible outfit${score.combos === 1 ? "" : "s"} with your ${demo ? "sample " : ""}wardrobe.`}
                      </p>
                    </div>
                  </div>
                  <div className="score-breakdown">
                    {Object.entries(score.breakdown).map(([key, value]) => (
                      <div key={key}>
                        <span>
                          {
                            {
                              versatility: "Outfit potential",
                              originality: "Not too similar",
                              gap: "Wardrobe gap",
                              value: "Within budget",
                            }[key]
                          }
                        </span>
                        <strong>
                          {value} /{" "}
                          {
                            {
                              versatility: 40,
                              originality: 30,
                              gap: 20,
                              value: 10,
                            }[key]
                          }
                        </strong>
                      </div>
                    ))}
                  </div>
                  <details className="help-details">
                    <summary>How this score works</summary>
                    <p className="form-note">
                      The score uses your saved clothing details to estimate
                      outfit matches, similarity, wardrobe gaps and budget. It
                      does not assess quality or physical fit. Rotation and
                      laundry are ignored.{" "}
                      {price === ""
                        ? "Add a price to include budget points."
                        : ""}
                    </p>
                  </details>
                  <h3>
                    {score.similar.length
                      ? `${score.similar.length} similar piece${score.similar.length === 1 ? "" : "s"} already owned`
                      : "No close match in your saved wardrobe"}
                  </h3>
                  <p className="small">Based on your saved clothing details.</p>
                  <div className="similar-grid">
                    {score.similar.slice(0, 4).map((s) => (
                      <div className="similar-piece" key={s.piece.id}>
                        <PiecePhoto piece={s.piece} />
                        <strong>{s.piece.name}</strong>
                        <span>{s.score}% detail match</span>
                      </div>
                    ))}
                  </div>
                  <h3>Possible combinations</h3>
                  {score.previews.length ? (
                    <div className="combo-list">
                      {score.previews.map((items, i) => (
                        <div className="combo" key={i}>
                          {items.map((p) => (
                            <div key={p.id}>
                              <PiecePhoto piece={p} />
                              <span>{p.name}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No complete outfit matches yet.</p>
                  )}
                </section>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="history">
          <section className="page-heading">
            <div>
              <h1>History</h1>
              <p className="page-subtitle">The outfits you’ve worn.</p>
            </div>
          </section>
          {wears.length ? (
            <div className="history-list">
              {[...wears]
                .sort((a, b) => b.day.localeCompare(a.day))
                .map((w) => (
                  <article key={w.id} className="history-card">
                    <div>
                      <h2>
                        {new Date(w.day + "T12:00:00").toLocaleDateString(
                          "en-PH",
                          { month: "long", day: "numeric", year: "numeric" },
                        )}
                      </h2>
                      <p>
                        {w.occasion} · {w.temperature}°C
                      </p>
                      <button
                        className="quiet"
                        disabled={!!busy}
                        onClick={() => void undo(w)}
                      >
                        <Undo2 size={16} />
                        Undo wear
                      </button>
                    </div>
                    <div className="history-pieces">
                      {w.items.map((p) => (
                        <div key={p.id}>
                          <PiecePhoto piece={p} />
                          <span>{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
            </div>
          ) : (
            <div className="empty-page">
              <History size={36} />
              <h2>No looks recorded yet.</h2>
              <p>
                Choose “Wear this today” on an outfit to save it here and start
                its rotation.
              </p>
              <button className="secondary" onClick={() => setTab("today")}>
                Plan an outfit
              </button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="settings">
          <section className="page-heading">
            <div>
              <h1>Settings</h1>
            </div>
          </section>
          {!signedIn && <ConnectionPanel connected={false} />}
          <div className="settings-grid">
            <section className="settings-panel">
              <h2>Your rotation</h2>
              <label className="field">
                <span>Days before wearing clothing again</span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={prefs.cooldown}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      cooldown: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <p>
                Clothing rests between wears. Shoes and accessories can repeat;
                items in laundry stay out of suggestions.
              </p>
              <div className="privacy-note">
                <LockKeyhole size={20} />
                <p>
                  Your clothes and history stay in your Google account. Photos
                  are prepared on your device before saving.
                </p>
              </div>
            </section>
            <section className="settings-panel">
              <h2>Weather & shopping</h2>
              <label className="field">
                <span>Weather city</span>
                <div className="input-action">
                  <input
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                  />
                  <button
                    className="secondary"
                    disabled={!!busy || !signedIn}
                    onClick={() => void searchCity()}
                  >
                    <Search size={17} />
                    <span className="sr-only">Search city</span>
                  </button>
                </div>
              </label>
              {cities.map((c) => (
                <button
                  key={c.id}
                  className="city-result"
                  onClick={() => {
                    setPrefs((p) => ({
                      ...p,
                      city: c.name + ", " + c.country,
                      latitude: c.latitude,
                      longitude: c.longitude,
                    }));
                    setCitySearch(c.name);
                    setCities([]);
                  }}
                >
                  <MapPin size={16} />
                  {c.name}, {c.country}
                </button>
              ))}
              <p className="small">
                Selected: {prefs.city}. City-level weather; no precise location
                tracking.
              </p>
              <div className="field-pair">
                <Choice
                  label="Currency"
                  value={prefs.currency}
                  options={["PHP", "USD", "EUR", "GBP", "JPY"]}
                  onChange={(v) => setPrefs((p) => ({ ...p, currency: v }))}
                />
                <label className="field">
                  <span>Budget per piece</span>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    value={prefs.budget}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        budget: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <p className="small">
                Currency changes labels only; no exchange-rate conversion.
              </p>
              <button
                className="primary full"
                disabled={
                  !signedIn ||
                  !!busy ||
                  prefs.cooldown < 0 ||
                  prefs.cooldown > 90 ||
                  prefs.budget < 0
                }
                onClick={async () => {
                  try {
                    await mutate("settings", { data: prefs });
                    toast.success("Settings saved");
                    setOutfit([]);
                    setLocks([]);
                  } catch (e) {
                    notifyError(e);
                  }
                }}
              >
                Save settings
              </button>
            </section>
          </div>
          {signedIn && <ConnectionPanel connected />}
          <div className="settings-footer">
            <p>
              Add WearNext to your Home Screen from your browser. Keep an
              internet connection to load and save clothes. Dates use Manila
              time.
            </p>
            <button
              className="quiet"
              onClick={() => {
                setDemo(!demo);
                setTab("today");
              }}
            >
              {demo ? "Leave sample mode" : "Try the sample wardrobe"}
            </button>
          </div>
        </TabsContent>
      </Tabs>
      <AutoUpload
        open={autoUpload}
        onClose={() => setAutoUpload(false)}
        loadPieces={loadSavedPieces}
        onSave={uploadPiece}
      />
      <ColorRepair
        open={repair}
        onClose={() => setRepair(false)}
        loadPieces={loadSavedPieces}
        saveColor={saveColor}
      />
      <PieceEditor
        open={editor}
        onClose={() => setEditor(false)}
        existing={editing}
        purchase={purchaseMode}
        onSave={savePiece}
      />
    </div>
  );
}
