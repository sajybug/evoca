import { useEffect, useMemo, useRef, useState } from "react";
import type { Configuration } from "../../types/domain";
import { useOverlayStore } from "../../stores/overlayStore";
import { evoca } from "../../services/evoca";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { Markdown } from "./Markdown";

type Point = { x: number; y: number };
type Selection = { x: number; y: number; width: number; height: number };

export function Overlay({
  configurations,
  onOpenSettings,
  onOpenHistory,
}: {
  configurations: Configuration[];
  onOpenSettings: () => void;
  onOpenHistory: () => void;
}) {
  const state = useOverlayStore();
  const [query, setQuery] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [screenshotImage, setScreenshotImage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const dragStart = useRef<Point | null>(null);
  const filtered = useMemo(
    () => configurations.filter((x) => `${x.name} ${x.description ?? ""}`.toLowerCase().includes(query.toLowerCase())),
    [configurations, query]
  );
  const selected = configurations.find((x) => x.id === state.selected);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (screenshotMode || screenshotPreview) {
        setScreenshotMode(false);
        setScreenshotPreview(null);
        setScreenshotImage(null);
        setSelection(null);
        dragStart.current = null;
        void evoca.cancelScreenshot();
        return;
      }
      if (state.state !== "closed") {
        state.close();
        void evoca.hideOverlay();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [screenshotMode, screenshotPreview, state]);

  function listenToStream(requestId: string) {
    const offChunk = EventsOn("evoca:llm:chunk", (event: { id: string; chunk: string }) => {
      if (event?.id === requestId) {
        const current = useOverlayStore.getState().output;
        useOverlayStore.getState().setOutput(current + (event.chunk || ""));
        useOverlayStore.getState().setState("loading");
      }
    });
    const offDone = EventsOn("evoca:llm:done", (event: { id: string; output: string }) => {
      if (event?.id === requestId) {
        setStreaming(false);
        state.setOutput(event.output || useOverlayStore.getState().output);
        offChunk(); offDone(); offError();
      }
    });
    const offError = EventsOn("evoca:llm:error", (event: { id: string; error: string }) => {
      if (event?.id === requestId) {
        setStreaming(false);
        state.setError(event.error || "LLM request failed");
        offChunk(); offDone(); offError();
      }
    });
    return () => { offChunk(); offDone(); offError(); };
  }

  async function run() {
    if (!selected || !state.input.trim() || streaming) return;
    setStreaming(true);
    state.setState("loading");
    state.setOutput("");
    const requestId = crypto.randomUUID();
    listenToStream(requestId);
    try {
      await evoca.startConfigurationStream(selected.id, state.input, requestId);
    } catch (error) {
      setStreaming(false);
      state.setError(String(error));
    }
  }

  async function beginScreenshot() {
    if (!selected || streaming || screenshotMode) return;
    try {
      const image = await evoca.beginScreenshot();
      setScreenshotImage(image);
      setScreenshotPreview(null);
      setSelection(null);
      dragStart.current = null;
      setScreenshotMode(true);
    } catch (error) {
      state.setError(`Screenshot failed: ${String(error)}`);
    }
  }

  function onScreenshotPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!screenshotMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY };
    setSelection({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
  }

  function onScreenshotPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start) return;
    const x = Math.min(start.x, event.clientX);
    const y = Math.min(start.y, event.clientY);
    const width = Math.abs(event.clientX - start.x);
    const height = Math.abs(event.clientY - start.y);
    setSelection({ x, y, width, height });
  }

  async function onScreenshotPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start || !selected) return;
    const x = Math.min(start.x, event.clientX);
    const y = Math.min(start.y, event.clientY);
    const width = Math.abs(event.clientX - start.x);
    const height = Math.abs(event.clientY - start.y);
    const nextSelection = { x, y, width, height };
    setSelection(nextSelection);
    if (width < 8 || height < 8) return;

    try {
      const preview = await evoca.previewScreenshot(
        Math.round(x),
        Math.round(y),
        Math.round(width),
        Math.round(height),
        Math.round(window.innerWidth),
        Math.round(window.innerHeight),
      );
      setScreenshotMode(false);
      setScreenshotPreview(preview);
    } catch (error) {
      setScreenshotMode(false);
      setScreenshotImage(null);
      setSelection(null);
      void evoca.cancelScreenshot();
      state.setError(`Screenshot preview failed: ${String(error)}`);
    }
  }

  async function confirmScreenshot() {
    if (!selected || !selection || streaming) return;
    setScreenshotPreview(null);
    setScreenshotImage(null);
    setSelection(null);
    setStreaming(true);
    state.setState("loading");
    state.setOutput("");
    const requestId = crypto.randomUUID();
    listenToStream(requestId);
    try {
      await evoca.startScreenshotStream(
        selected.id,
        state.input,
        requestId,
        Math.round(selection.x),
        Math.round(selection.y),
        Math.round(selection.width),
        Math.round(selection.height),
        Math.round(window.innerWidth),
        Math.round(window.innerHeight),
      );
    } catch (error) {
      setStreaming(false);
      state.setError(String(error));
    }
  }

  function cancelScreenshotPreview() {
    setScreenshotPreview(null);
    setScreenshotImage(null);
    setSelection(null);
    void evoca.cancelScreenshot();
  }

  if (screenshotMode) {
    return (
      <div
        className="screenshot-selection"
        style={screenshotImage ? { backgroundImage: `url(${screenshotImage})` } : undefined}
        onPointerDown={onScreenshotPointerDown}
        onPointerMove={onScreenshotPointerMove}
        onPointerUp={(event) => void onScreenshotPointerUp(event)}
      >
        <div className="screenshot-hint">Drag to select an area · Esc to cancel</div>
        {selection && selection.width > 0 && selection.height > 0 && (
          <div
            className="screenshot-rect"
            style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
          />
        )}
      </div>
    );
  }

  if (screenshotPreview && selection) {
    return (
      <div className="screenshot-preview">
        <div className="screenshot-preview-card">
          <div className="screenshot-preview-header">
            <div>Screenshot preview</div>
            <div className="screenshot-preview-meta">{Math.round(selection.width)} × {Math.round(selection.height)}</div>
          </div>
          <div className="screenshot-preview-image-wrap">
            <img src={screenshotPreview} alt="Screenshot preview" className="screenshot-preview-image" />
          </div>
          <div className="screenshot-preview-actions">
            <button onClick={cancelScreenshotPreview}>Cancel</button>
            <button className="primary" onClick={() => void confirmScreenshot()}>Confirm & Send</button>
          </div>
        </div>
      </div>
    );
  }

  if (state.state === "closed") return null;

  if (state.state === "searching") {
    return (
      <section className="panel">
        <div className="brand window-drag-handle">
          <div><span className="brand-mark">✦</span><b>eVoca</b></div>
          <div className="brand-actions"><button onClick={onOpenHistory}>History</button><button onClick={onOpenSettings}>Settings</button></div>
        </div>
        <input autoFocus placeholder="Search configurations..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="list">
          {filtered.map((item) => (
            <button className="row" key={item.id} onClick={() => state.select(item.id)}>
              <span className="glyph">{item.icon || "✦"}</span>
              <span><b>{item.name}</b><small>{item.description}</small></span>
            </button>
          ))}
        </div>
        <footer><span>Global hotkey toggles eVoca · Esc</span></footer>
      </section>
    );
  }

  if (state.state === "loading" && state.output) {
    return (
      <section className="panel">
        <div className="title window-drag-handle">{selected?.name} · Generating…</div>
        <div className="result"><Markdown source={state.output} /><span className="stream-cursor">▌</span></div>
        <footer><span>Live stream</span><button onClick={() => navigator.clipboard.writeText(state.output)}>Copy</button></footer>
      </section>
    );
  }

  if (state.state === "input" || state.state === "loading") {
    return (
      <section className="panel">
        <div className="title window-drag-handle">{selected?.name}</div>
        <textarea
          autoFocus
          disabled={streaming}
          placeholder="Enter text or a prompt for the screenshot..."
          value={state.input}
          onChange={(e) => state.setInput(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void run(); }}
        />
        <footer>
          <span>{state.state === "loading" ? "Generating…" : "Ctrl+Enter to run"}</span>
          <button disabled={streaming} onClick={() => void beginScreenshot()}>Screenshot</button>
          <button className="primary" disabled={streaming} onClick={() => void run()}>Run</button>
        </footer>
      </section>
    );
  }

  if (state.state === "output") {
    return (
      <section className="panel">
        <div className="title window-drag-handle">Result</div>
        <div className="result"><Markdown source={state.output} /></div>
        <footer>
          <button onClick={() => navigator.clipboard.writeText(state.output)}>Copy</button>
          <button className="primary" onClick={() => { state.close(); void evoca.hideOverlay(); }}>Close</button>
        </footer>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="title">Execution failed</div>
      <div className="error">{state.error}</div>
      <footer><button className="primary" onClick={() => state.setState("input")}>Back</button></footer>
    </section>
  );
}
