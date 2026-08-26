import { useEffect, useMemo, useRef, useState } from "react";
import type { Configuration, Provider } from "../../types/domain";
import { useOverlayStore } from "../../stores/overlayStore";
import { evoca } from "../../services/evoca";
import { EventsOn, ClipboardGetText } from "../../wailsjs/runtime/runtime";
import { Markdown } from "./Markdown";

const overlayButtonClass = "inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40";

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
  const activeRequestId = useRef<string | null>(null);

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
        activeRequestId.current = null;
        setStreaming(false); setLoadingStartedAt(null); state.setOutput(event.output || useOverlayStore.getState().output);
        offChunk(); offDone(); offError(); if (streamCleanup.current) streamCleanup.current = null;
      }
    });
    const offError = EventsOn("evoca:llm:error", (event: { id: string; error: string }) => {
      if (event?.id === requestId) {
        activeRequestId.current = null;
        setStreaming(false); setLoadingStartedAt(null); state.setError(event.error || "LLM request failed");
        offChunk(); offDone(); offError(); if (streamCleanup.current) streamCleanup.current = null;
      }
    });
    const offCancelled = EventsOn("evoca:llm:cancelled", (event: { id: string }) => {
      if (event?.id === requestId) {
        activeRequestId.current = null;
        setStreaming(false); setLoadingStartedAt(null);
        state.setOutput(""); state.setState("input");
        offChunk(); offDone(); offError(); offCancelled(); if (streamCleanup.current) streamCleanup.current = null;
      }
    });
    const cleanup = () => { offChunk(); offDone(); offError(); offCancelled(); };
    streamCleanup.current = cleanup;
    return cleanup;
  }

  async function run() {
    if (!selected || !state.input.trim() || streaming) return;
    streamCleanup.current?.(); streamCleanup.current = null;
    setStreaming(true); setLoadingStartedAt(Date.now()); state.setOutput(""); state.setState("loading");
    const requestId = crypto.randomUUID(); activeRequestId.current = requestId; listenToStream(requestId);
    try { await evoca.startConfigurationStream(selected.id, state.input, requestId); }
    catch (error) { setStreaming(false); setLoadingStartedAt(null); state.setError(String(error)); }
  }

  function backToConfigurations() {
    if (activeRequestId.current) void evoca.cancelLLM(activeRequestId.current);
    activeRequestId.current = null;
    streamCleanup.current?.(); streamCleanup.current = null; setStreaming(false); setLoadingStartedAt(null); state.backToSearch();
  }

  function cancelCurrentRequest() {
    const requestId = activeRequestId.current;
    if (requestId) void evoca.cancelLLM(requestId);
    activeRequestId.current = null;
    streamCleanup.current?.(); streamCleanup.current = null;
    setStreaming(false); setLoadingStartedAt(null);
    state.setOutput("");
    state.setState("input");
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
    const requestId = crypto.randomUUID(); activeRequestId.current = requestId; listenToStream(requestId);
    try { await evoca.startScreenshotStream(selected.id, state.input, requestId, Math.round(shot.x), Math.round(shot.y), Math.round(shot.width), Math.round(shot.height), Math.round(window.innerWidth), Math.round(window.innerHeight)); }
    catch (error) { setStreaming(false); setLoadingStartedAt(null); state.setError(String(error)); }
  }

  function cancelScreenshotPreview() {
    setScreenshotPreview(null); setScreenshotImage(null); setSelection(null); void evoca.cancelScreenshot();
  }

  if (screenshotMode) return (
    <div className="fixed inset-0 z-50 cursor-crosshair bg-cover bg-center bg-no-repeat shadow-[inset_0_0_0_1px_rgba(216,184,110,.16)] after:pointer-events-none after:absolute after:inset-0 after:bg-black/30" style={screenshotImage ? { backgroundImage: `url(${screenshotImage})` } : undefined} onPointerDown={onScreenshotPointerDown} onPointerMove={onScreenshotPointerMove} onPointerUp={(event) => void onScreenshotPointerUp(event)}>
      <div className="absolute left-1/2 top-5 z-10 -translate-x-1/2 rounded-full border border-white/[.1] bg-black/55 px-4 py-2 text-[10px] font-medium text-white/72 backdrop-blur-md">Drag to select an area · Esc to cancel</div>
      {selection && selection.width > 0 && selection.height > 0 && <div className="absolute z-10 border border-evoca-accent bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,.34),0_0_0_1px_rgba(255,255,255,.12)]" style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }} />}
    </div>
  );

  if (screenshotPreview && selection) return (
    <div className="flex h-full w-full items-center justify-center p-5">
      <div className="w-full max-w-[720px] rounded-[20px] border border-white/[.08] bg-[#101319]/97 p-4 shadow-[0_30px_90px_rgba(0,0,0,.55)]">
        <div className="mb-3 flex items-center justify-between"><strong>Screenshot preview</strong><span className="text-[8px] text-white/25">{Math.round(selection.width)} × {Math.round(selection.height)}</span></div>
        <div className="flex max-h-[calc(92vh-130px)] min-h-[120px] items-center justify-center overflow-auto rounded-[13px] border border-white/[.05] bg-black/30"><img src={screenshotPreview} alt="Screenshot preview" className="block max-h-[calc(92vh-145px)] max-w-full object-contain" /></div>
        <div className="mt-3 flex items-center justify-between"><span className="text-[8px] text-white/24">Only the selected area will be sent to the active configuration.</span><div className="flex gap-2"><button className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40" onClick={cancelScreenshotPreview}>Cancel</button><button className={`${overlayButtonClass} !border-evoca-accent/35 !bg-evoca-accent !text-[#18170f] !shadow-[0_8px_22px_rgba(216,184,110,.13)] hover:!bg-evoca-accent-2`} onClick={() => void confirmScreenshot()}>Confirm & Send</button></div></div>
      </div>
    </div>
  );

  if (state.state === "closed") return null;

  if (state.state === "searching") return (
    <section className="h-full w-full overflow-hidden border border-evoca-line bg-[linear-gradient(180deg,rgba(18,21,27,.985),rgba(10,12,16,.995)),radial-gradient(circle_at_24%_0%,rgba(255,255,255,.04),transparent_34%)] shadow-[0_35px_100px_rgba(0,0,0,.58),0_12px_30px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.035)] flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-4 [--wails-draggable:drag]">
        <div className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px] border border-evoca-accent/20 bg-[#F5E8C5] text-[30px] text-[#1B1B1A] leading-none">✦</span><div><b className="text-[13px] font-semibold tracking-[-.01em] text-white">eVoca</b><small className="block text-[9px] text-white/32">LLM launcher</small></div></div>
        <div className="flex items-center gap-1.5"><button className="grid h-7 w-7 place-items-center rounded-[9px] border border-transparent bg-transparent text-white/42 transition hover:border-white/[.07] hover:bg-white/[.04] hover:text-white" onClick={() => void evoca.hideOverlay()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5"><path d="M6 9h12"/><path d="m8 12 4 4 4-4"/><path d="M5 5h14v14H5z"/></svg></button><button className="rounded-[9px] border border-transparent bg-transparent px-2.5 py-1.5 text-[10px] font-medium text-white/52 transition hover:border-white/[.07] hover:bg-white/[.04] hover:text-white" onClick={onOpenHistory}>History</button><button className="rounded-[9px] border border-transparent bg-transparent px-2.5 py-1.5 text-[10px] font-medium text-white/52 transition hover:border-white/[.07] hover:bg-white/[.04] hover:text-white" onClick={onOpenSettings}>Settings</button></div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
        <div className="relative mb-3"><input autoFocus className="h-12 w-full rounded-[14px] border border-white/[.08] bg-white/[.035] pl-11 pr-20 text-[13px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.025)] focus:border-evoca-accent/35 focus:bg-white/[.05] focus:ring-2 focus:ring-evoca-accent/[.07] placeholder:text-white/27" placeholder="Search configurations..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="mb-3 flex items-center justify-between"><span className="text-[9px] font-medium uppercase tracking-[.15em] text-white/28">{filtered.length} configurations</span><small className="text-[9px] text-white/24">Choose one to start a run</small></div>
        <div className="min-h-0 flex-1 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden pr-1">
          {filtered.length ? filtered.map((item) => {
            const provider = providers.find((p) => p.id === item.providerId);
            return <button className="flex w-full items-center gap-3 rounded-[14px] border border-transparent bg-transparent p-2.5 text-left text-inherit transition hover:border-white/[.07] hover:bg-white/[.035]" key={item.id} onClick={() => state.select(item.id)}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-white/[.07] bg-white/[.035] text-[14px] text-evoca-accent shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">{item.icon || "✦"}</span>
              <span className="min-w-0 flex-1"><b className="block truncate text-[12px] font-semibold text-white/92">{item.name}</b><small className="mt-0.5 block truncate text-[9px] text-white/34">{item.description || "Ready for a new run"}</small><small className="mt-0.5 block truncate !text-white/24">{provider?.name || "No provider"} · {item.model || "No model"}</small></span>
              <span className="flex shrink-0 items-center gap-1.5"><span className="rounded-full border border-white/[.06] bg-white/[.025] px-2 py-1 text-[8px] font-medium text-white/35">{item.inputType === "text" ? "Text" : item.inputType}</span><span className="text-[11px] text-white/20">→</span></span>
            </button>;
          }) : <div className="flex min-h-[160px] flex-1 items-center justify-center text-center text-[10px] text-white/28">No configurations match “{query}”.</div>}
        </div>
        <div className="mt-3 flex items-center justify-between"><span className="text-[9px] text-white/24">Reusable AI workflows, not a chat inbox.</span><div className="flex items-center gap-1.5"><kbd className="rounded-[6px] border border-white/[.08] bg-white/[.025] px-1.5 py-1 font-mono text-[8px] text-white/33">Ctrl + Space</kbd><span className="text-[9px] text-white/24">Open</span><kbd className="rounded-[6px] border border-white/[.08] bg-white/[.025] px-1.5 py-1 font-mono text-[8px] text-white/33">Esc</kbd><span className="text-[9px] text-white/24">Close</span></div></div>
      </div>
    </section>
  );

  if (state.state === "loading") {
    const elapsedSeconds = Math.floor(loadingElapsedMs / 1000);
    const thinkingLabel = elapsedSeconds >= 8 ? "Still thinking" : "Thinking";
    return <section className="h-full w-full overflow-hidden border border-evoca-line bg-[linear-gradient(180deg,rgba(18,21,27,.985),rgba(10,12,16,.995)),radial-gradient(circle_at_24%_0%,rgba(255,255,255,.04),transparent_34%)] shadow-[0_35px_100px_rgba(0,0,0,.58),0_12px_30px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.035)] flex h-full flex-col"><div className="flex min-h-14 items-center gap-2 border-b border-white/[.06] px-5 [--wails-draggable:drag]"><div className="flex min-w-0 flex-1 items-center gap-2.5"><div><h2 className="m-0 truncate text-[12px] font-semibold text-white">{selected?.name}</h2><div className="text-[9px] text-white/30">{selected?.model || "Model"}</div></div></div></div>
      <div className="min-h-0 flex-1 px-5 py-4">{state.output ? <div className="h-full min-h-[260px] overflow-auto rounded-[14px] border border-white/[.06] bg-[#0a0c10] p-4 leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,.02)]"><Markdown source={state.output} /><span className="opacity-70 animate-[evoca-blink_1s_steps(2,start)_infinite]">▌</span></div> : <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center"><span className="h-3 w-3 rounded-full bg-evoca-accent shadow-[0_0_24px_rgba(216,184,110,.3)] animate-[evoca-thinking_1.7s_ease-in-out_infinite]" aria-hidden="true" /><strong>{thinkingLabel}</strong><span className="text-[9px] text-white/24">{elapsedSeconds}s elapsed</span><span className="max-w-[260px] text-[9px] leading-5 text-white/25">eVoca is streaming the result as soon as the model produces visible output.</span><button type="button" className="mt-1 inline-flex items-center justify-center rounded-[10px] border border-red-200/10 bg-red-300/[.055] px-3 py-2 text-[10px] font-semibold text-evoca-danger transition hover:bg-red-300/[.1]" onClick={cancelCurrentRequest}>Cancel</button></div>}
        {state.output && <div className="flex items-center gap-2 border-t border-white/[.06] px-1 py-3 text-[9px] text-white/30"><span className="flex items-center gap-1"><i className="block h-1.5 w-1.5 rounded-full bg-white/45 animate-[evoca-pulse_1.2s_infinite_ease-in-out]"></i><i className="block h-1.5 w-1.5 rounded-full bg-white/45 animate-[evoca-pulse_1.2s_infinite_ease-in-out] [animation-delay:.15s]"></i><i className="block h-1.5 w-1.5 rounded-full bg-white/45 animate-[evoca-pulse_1.2s_infinite_ease-in-out] [animation-delay:.3s]"></i></span><span>Generating…</span></div>}<div className="flex items-center justify-end border-t border-white/[.06] px-5 py-3"><button type="button" className="rounded-[10px] border border-red-200/10 bg-red-300/[.04] px-3 py-2 text-[9px] font-semibold text-red-100/60 transition hover:bg-red-300/[.08] hover:text-red-50" onClick={cancelCurrentRequest}>Cancel request</button></div></div></section>;
  }

  if (state.state === "input") {
    const handlePaste = async () => { try { const text = await ClipboardGetText(); if (text) state.setInput(state.input ? `${state.input}\n${text}` : text); } catch (err) { console.error("Failed to read clipboard via Wails runtime:", err); } };
    return <section className="h-full w-full overflow-hidden border border-evoca-line bg-[linear-gradient(180deg,rgba(18,21,27,.985),rgba(10,12,16,.995)),radial-gradient(circle_at_24%_0%,rgba(255,255,255,.04),transparent_34%)] shadow-[0_35px_100px_rgba(0,0,0,.58),0_12px_30px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.035)] flex h-full flex-col"><div className="flex min-h-14 items-center gap-2 border-b border-white/[.06] px-5 [--wails-draggable:drag]"><div className="flex min-w-0 flex-1 items-center gap-2.5"><button className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/[.07] bg-white/[.03] px-2.5 py-1.5 text-[9px] font-semibold text-white/60 transition hover:bg-white/[.06] hover:text-white" onClick={backToConfigurations}>← Back</button><div><h2 className="m-0 truncate text-[12px] font-semibold text-white">{selected?.name}</h2><div className="text-[9px] text-white/30">{selected?.model || "No model selected"}</div></div></div></div>
      <div className="min-h-0 flex-1 p-5"><div className="mb-3 flex items-center gap-2"><span className="rounded-[8px] border border-evoca-accent/15 bg-evoca-accent-soft px-2 py-1 text-[9px] text-evoca-accent">Configuration</span></div><textarea autoFocus className="h-full min-h-[250px] w-full resize-none rounded-[14px] border border-white/[.075] bg-[#0b0e12] p-4 text-[12px] leading-6 text-white outline-none transition focus:border-evoca-accent/25 focus:ring-2 focus:ring-evoca-accent/[.05]" disabled={streaming} placeholder="Describe what you want eVoca to do…" value={state.input} onChange={(e) => state.setInput(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void run(); }} /></div>
      <div className="flex items-center justify-between px-5 py-4 pt-10"><div className="flex items-center gap-2 text-[9px] text-white/25"><span>Ctrl + Enter</span><span>Run</span></div><div className="flex items-center gap-2"><button type="button" className="inline-flex h-9 items-center justify-center rounded-[10px] border border-white/[.08] bg-white/[.035] px-3.5 text-[10px] font-semibold text-white/62 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] transition hover:border-white/[.13] hover:bg-white/[.06] hover:text-white" disabled={streaming} onClick={() => void handlePaste()}>Paste</button><button type="button" className="inline-flex h-9 items-center justify-center rounded-[10px] border border-white/[.08] bg-white/[.035] px-3.5 text-[10px] font-semibold text-white/62 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] transition hover:border-white/[.13] hover:bg-white/[.06] hover:text-white" disabled={streaming} onClick={() => void beginScreenshot()}>Screenshot</button><button type="button" className="inline-flex h-9 items-center justify-center rounded-[10px] border border-white/[.08] bg-white/[.035] px-3.5 text-[10px] font-semibold text-white/62 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] transition hover:border-white/[.13] hover:bg-white/[.06] hover:text-white !border-evoca-accent/35 !bg-evoca-accent !text-[#18170f] !shadow-[0_8px_22px_rgba(216,184,110,.13)] hover:!bg-evoca-accent-2" disabled={streaming || !state.input.trim()} onClick={() => void run()}>Run →</button></div></div></section>;
  }

  if (state.state === "output") return <section className="h-full w-full overflow-hidden border border-evoca-line bg-[linear-gradient(180deg,rgba(18,21,27,.985),rgba(10,12,16,.995)),radial-gradient(circle_at_24%_0%,rgba(255,255,255,.04),transparent_34%)] shadow-[0_35px_100px_rgba(0,0,0,.58),0_12px_30px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.035)] flex h-full flex-col"><div className="flex min-h-14 items-center gap-2 border-b border-white/[.06] px-5 [--wails-draggable:drag]"><div className="flex min-w-0 flex-1 items-center gap-2.5"><button className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/[.07] bg-white/[.03] px-2.5 py-1.5 text-[9px] font-semibold text-white/60 transition hover:bg-white/[.06] hover:text-white" onClick={backToConfigurations}>← Back</button><div><h2 className="m-0 truncate text-[12px] font-semibold text-white">Result</h2><div className="text-[9px] text-white/30">{selected?.name}</div></div></div></div><div className="min-h-0 flex-1 px-5 py-4"><div className="h-full min-h-[260px] overflow-auto rounded-[14px] border border-white/[.06] bg-[#0a0c10] p-4 leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,.02)]"><Markdown source={state.output} /></div></div><div className="flex items-center justify-between border-t border-white/[.06] px-5 py-3"><span className="text-[9px] text-white/30">Execution complete</span><div className="flex items-center gap-2"><button className={overlayButtonClass} onClick={() => navigator.clipboard.writeText(state.output)}>Copy</button><button className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-evoca-accent/35 !bg-evoca-accent !text-[#18170f] !shadow-[0_8px_22px_rgba(216,184,110,.13)] hover:!bg-evoca-accent-2" onClick={() => { state.close(); void evoca.hideOverlay(); }}>Close</button></div></div></section>;

  return <section className="h-full w-full overflow-hidden border border-evoca-line bg-[linear-gradient(180deg,rgba(18,21,27,.985),rgba(10,12,16,.995)),radial-gradient(circle_at_24%_0%,rgba(255,255,255,.04),transparent_34%)] shadow-[0_35px_100px_rgba(0,0,0,.58),0_12px_30px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.035)] flex h-full flex-col"><div className="flex min-h-14 items-center gap-2 border-b border-white/[.06] px-5"><div className="flex min-w-0 flex-1 items-center gap-2.5"><div><h2 className="m-0 truncate text-[12px] font-semibold text-white">Execution failed</h2><div className="text-[9px] text-white/30">eVoca could not complete the request.</div></div></div></div><div className="p-5"><div className="rounded-[12px] border border-red-300/10 bg-red-400/[.06] px-3 py-2.5 text-[11px] leading-5 text-evoca-danger">{state.error}</div></div><div className="flex items-center justify-between border-t border-white/[.06] px-5 py-3"><span className="text-[9px] text-white/30">Try again or return to the configuration.</span><button className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-evoca-accent/35 !bg-evoca-accent !text-[#18170f] !shadow-[0_8px_22px_rgba(216,184,110,.13)] hover:!bg-evoca-accent-2" onClick={() => state.setState("input")}>Back to input</button></div></section>;
}
