import { useEffect, useMemo, useRef, useState } from "react";
import type { Configuration, Provider } from "../../types/domain";
import { useOverlayStore } from "../../stores/overlayStore";
import { evoca } from "../../services/evoca";
import { EventsOn, ClipboardGetText } from "../../wailsjs/runtime/runtime";
import { Markdown } from "./Markdown";

type Point = { x: number; y: number };
type Selection = { x: number; y: number; width: number; height: number };

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

export function Overlay({ configurations, onOpenSettings, onOpenHistory, providers }: {
  configurations: Configuration[];
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  providers: Provider[];
}) {
  const state = useOverlayStore();
  const [query, setQuery] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [loadingElapsedMs, setLoadingElapsedMs] = useState(0);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [screenshotImage, setScreenshotImage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const dragStart = useRef<Point | null>(null);
  const streamCleanup = useRef<(() => void) | null>(null);

  const filtered = useMemo(() => configurations.filter((x) => `${x.name} ${x.description ?? ""} ${x.model}`.toLowerCase().includes(query.toLowerCase())), [configurations, query]);
  const selected = configurations.find((x) => x.id === state.selected);

  useEffect(() => {
    if (!loadingStartedAt || !streaming) { setLoadingElapsedMs(0); return; }
    const tick = () => setLoadingElapsedMs(Date.now() - loadingStartedAt);
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [loadingStartedAt, streaming]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (screenshotMode || screenshotPreview) {
        setScreenshotMode(false); setScreenshotPreview(null); setScreenshotImage(null); setSelection(null); dragStart.current = null;
        void evoca.cancelScreenshot();
        return;
      }
      if (state.state !== "closed") { state.close(); void evoca.hideOverlay(); }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [screenshotMode, screenshotPreview, state]);

  function listenToStream(requestId: string) {
    const offChunk = EventsOn("evoca:llm:chunk", (event: { id: string; chunk: string }) => {
      if (event?.id === requestId) { useOverlayStore.getState().appendOutput(event.chunk || ""); useOverlayStore.getState().setState("loading"); }
    });
    const offDone = EventsOn("evoca:llm:done", (event: { id: string; output: string }) => {
      if (event?.id === requestId) {
        setStreaming(false); setLoadingStartedAt(null); state.setOutput(event.output || useOverlayStore.getState().output);
        offChunk(); offDone(); offError(); if (streamCleanup.current) streamCleanup.current = null;
      }
    });
    const offError = EventsOn("evoca:llm:error", (event: { id: string; error: string }) => {
      if (event?.id === requestId) {
        setStreaming(false); setLoadingStartedAt(null); state.setError(event.error || "LLM request failed");
        offChunk(); offDone(); offError(); if (streamCleanup.current) streamCleanup.current = null;
      }
    });
    const cleanup = () => { offChunk(); offDone(); offError(); };
    streamCleanup.current = cleanup;
    return cleanup;
  }

  async function run() {
    if (!selected || !state.input.trim() || streaming) return;
    streamCleanup.current?.(); streamCleanup.current = null;
    setStreaming(true); setLoadingStartedAt(Date.now()); state.setOutput(""); state.setState("loading");
    const requestId = crypto.randomUUID(); listenToStream(requestId);
    try { await evoca.startConfigurationStream(selected.id, state.input, requestId); }
    catch (error) { setStreaming(false); setLoadingStartedAt(null); state.setError(String(error)); }
  }

  function backToConfigurations() {
    streamCleanup.current?.(); streamCleanup.current = null; setStreaming(false); setLoadingStartedAt(null); state.backToSearch();
  }

  async function beginScreenshot() {
    if (!selected || streaming || screenshotMode) return;
    try {
      const image = await evoca.beginScreenshot();
      setScreenshotImage(image); setScreenshotPreview(null); setSelection(null); dragStart.current = null; setScreenshotMode(true);
    } catch (error) { state.setError(`Screenshot failed: ${String(error)}`); }
  }

  function onScreenshotPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!screenshotMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY };
    setSelection({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
  }
  function onScreenshotPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current; if (!start) return;
    setSelection({ x: Math.min(start.x, event.clientX), y: Math.min(start.y, event.clientY), width: Math.abs(event.clientX - start.x), height: Math.abs(event.clientY - start.y) });
  }
  async function onScreenshotPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current; dragStart.current = null; if (!start || !selected) return;
    const x = Math.min(start.x, event.clientX); const y = Math.min(start.y, event.clientY); const width = Math.abs(event.clientX - start.x); const height = Math.abs(event.clientY - start.y);
    const nextSelection = { x, y, width, height }; setSelection(nextSelection);
    if (width < 8 || height < 8) return;
    try {
      const preview = await evoca.previewScreenshot(Math.round(x), Math.round(y), Math.round(width), Math.round(height), Math.round(window.innerWidth), Math.round(window.innerHeight));
      setScreenshotMode(false); setScreenshotPreview(preview);
    } catch (error) {
      setScreenshotMode(false); setScreenshotImage(null); setSelection(null); void evoca.cancelScreenshot(); state.setError(`Screenshot preview failed: ${String(error)}`);
    }
  }

  async function confirmScreenshot() {
    if (!selected || !selection || streaming) return;
    setScreenshotPreview(null); setScreenshotImage(null); const shot = selection; setSelection(null);
    streamCleanup.current?.(); streamCleanup.current = null; setStreaming(true); setLoadingStartedAt(Date.now()); state.setOutput(""); state.setState("loading");
    const requestId = crypto.randomUUID(); listenToStream(requestId);
    try { await evoca.startScreenshotStream(selected.id, state.input, requestId, Math.round(shot.x), Math.round(shot.y), Math.round(shot.width), Math.round(shot.height), Math.round(window.innerWidth), Math.round(window.innerHeight)); }
    catch (error) { setStreaming(false); setLoadingStartedAt(null); state.setError(String(error)); }
  }

  function cancelScreenshotPreview() {
    setScreenshotPreview(null); setScreenshotImage(null); setSelection(null); void evoca.cancelScreenshot();
  }

  if (screenshotMode) return (
    <div className="screenshot-selection" style={screenshotImage ? { backgroundImage: `url(${screenshotImage})` } : undefined} onPointerDown={onScreenshotPointerDown} onPointerMove={onScreenshotPointerMove} onPointerUp={(event) => void onScreenshotPointerUp(event)}>
      <div className="screenshot-hint">Drag to select an area · Esc to cancel</div>
      {selection && selection.width > 0 && selection.height > 0 && <div className="screenshot-rect" style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }} />}
    </div>
  );

  if (screenshotPreview && selection) return (
    <div className="screenshot-preview">
      <div className="screenshot-preview-card">
        <div className="screenshot-preview-header"><strong>Screenshot preview</strong><span className="screenshot-preview-meta">{Math.round(selection.width)} × {Math.round(selection.height)}</span></div>
        <div className="screenshot-preview-image-wrap"><img src={screenshotPreview} alt="Screenshot preview" className="screenshot-preview-image" /></div>
        <div className="screenshot-preview-actions"><span>Only the selected area will be sent to the active configuration.</span><div className="flex gap-2"><button onClick={cancelScreenshotPreview}>Cancel</button><button className="primary" onClick={() => void confirmScreenshot()}>Confirm & Send</button></div></div>
      </div>
    </div>
  );

  if (state.state === "closed") return null;

  if (state.state === "searching") return (
    <section className="panel overlay-shell">
      <div className="brand settings-topbar window-drag-handle">
        <div><span className="brand-mark inline-flex items-center justify-center leading-none">✦</span><div><b>eVoca</b><small className="block">LLM launcher</small></div></div>
        <div className="brand-actions"><button onClick={onOpenHistory}>History</button><button onClick={onOpenSettings}>Settings</button></div>
      </div>
      <div className="overlay-content">
        <div className="overlay-search-wrap"><input autoFocus className="overlay-search" placeholder="Search configurations..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="launcher-subrow"><span>{filtered.length} configurations</span><small>Choose one to start a run</small></div>
        <div className="list">
          {filtered.length ? filtered.map((item) => {
            const provider = providers.find((p) => p.id === item.providerId);
            return <button className="row" key={item.id} onClick={() => state.select(item.id)}>
              <span className="glyph">{item.icon || "✦"}</span>
              <span className="row-copy"><b>{item.name}</b><small>{item.description || "Ready for a new run"}</small><small className="configuration-meta">{provider?.name || "No provider"} · {item.model || "No model"}</small></span>
              <span className="row-trailing"><span className="row-chip">{item.inputType === "text" ? "Text" : item.inputType}</span><span className="row-arrow">→</span></span>
            </button>;
          }) : <div className="empty-state">No configurations match “{query}”.</div>}
        </div>
        <div className="launcher-footer"><span>Reusable AI workflows, not a chat inbox.</span><div className="shortcut-hint"><kbd>Ctrl + Space</kbd><span>Open</span><kbd>Esc</kbd><span>Close</span></div></div>
      </div>
    </section>
  );

  if (state.state === "loading") {
    const elapsedSeconds = Math.floor(loadingElapsedMs / 1000);
    const thinkingLabel = elapsedSeconds >= 8 ? "Still thinking" : "Thinking";
    return <section className="panel flex h-full flex-col"><div className="title window-drag-handle"><div className="title-spacer"><button className="back-button" onClick={backToConfigurations}>← Back</button><div><h2>{selected?.name}</h2><div className="title-meta">{selected?.model || "Model"}</div></div></div></div>
      <div className="min-h-0 flex-1 px-5 py-4">{state.output ? <div className="result"><Markdown source={state.output} /><span className="stream-cursor">▌</span></div> : <div className="llm-thinking"><span className="thinking-orb" aria-hidden="true" /><strong>{thinkingLabel}</strong><span className="thinking-time">{elapsedSeconds}s elapsed</span><span className="thinking-caption">eVoca is streaming the result as soon as the model produces visible output.</span></div>}
        {state.output && <div className="llm-loading-inline"><span className="loading-dots"><i></i><i></i><i></i></span><span>Generating…</span></div>}</div></section>;
  }

  if (state.state === "input") {
    const handlePaste = async () => { try { const text = await ClipboardGetText(); if (text) state.setInput(state.input ? `${state.input}\n${text}` : text); } catch (err) { console.error("Failed to read clipboard via Wails runtime:", err); } };
    return <section className="panel input-screen"><div className="title window-drag-handle"><div className="title-spacer"><button className="back-button" onClick={backToConfigurations}>← Back</button><div><h2>{selected?.name}</h2><div className="title-meta">{selected?.model || "No model selected"}</div></div></div></div>
      <div className="input-body"><div className="input-context"><span className="config-badge">Configuration</span><span>Enter the task eVoca should run.</span></div><textarea autoFocus className="prompt-editor" disabled={streaming} placeholder="Describe what you want eVoca to do…" value={state.input} onChange={(e) => state.setInput(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void run(); }} /></div>
      <div className="input-footer pt-10"><div className="input-footer-left"><span>Ctrl + Enter</span><span>Run</span></div><div className="input-footer-right"><button type="button" className="overlay-action" disabled={streaming} onClick={() => void handlePaste()}>Paste</button><button type="button" className="overlay-action" disabled={streaming} onClick={() => void beginScreenshot()}>Screenshot</button><button type="button" className="overlay-action primary" disabled={streaming || !state.input.trim()} onClick={() => void run()}>Run →</button></div></div></section>;
  }

  if (state.state === "output") return <section className="panel flex h-full flex-col"><div className="title window-drag-handle"><div className="title-spacer"><button className="back-button" onClick={backToConfigurations}>← Back</button><div><h2>Result</h2><div className="title-meta">{selected?.name}</div></div></div><div className="result-toolbar"><button onClick={() => navigator.clipboard.writeText(state.output)}>Copy</button></div></div><div className="result-wrap"><div className="result"><Markdown source={state.output} /></div></div><div className="result-footer"><span>Execution complete</span><button className="primary button" onClick={() => { state.close(); void evoca.hideOverlay(); }}>Close</button></div></section>;

  return <section className="panel flex h-full flex-col"><div className="title"><div className="title-spacer"><div><h2>Execution failed</h2><div className="title-meta">eVoca could not complete the request.</div></div></div></div><div className="p-5"><div className="error">{state.error}</div></div><div className="result-footer"><span>Try again or return to the configuration.</span><button className="primary button" onClick={() => state.setState("input")}>Back to input</button></div></section>;
}
