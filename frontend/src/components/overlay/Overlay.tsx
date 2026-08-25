import { useEffect, useMemo, useState } from "react";
import type { Configuration } from "../../types/domain";
import { useOverlayStore } from "../../stores/overlayStore";
import { evoca } from "../../services/evoca";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { Markdown } from "./Markdown";

export function Overlay({
  configurations,
  onOpenSettings,
}: {
  configurations: Configuration[];
  onOpenSettings: () => void;
}) {
  const state = useOverlayStore();
  const [query, setQuery] = useState("");
  const [streaming, setStreaming] = useState(false);
  const filtered = useMemo(
    () => configurations.filter((x) => `${x.name} ${x.description ?? ""}`.toLowerCase().includes(query.toLowerCase())),
    [configurations, query]
  );
  const selected = configurations.find((x) => x.id === state.selected);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        state.close();
        void evoca.hideOverlay();
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [state.close]);

  async function run() {
    if (!selected || !state.input.trim() || streaming) return;
    setStreaming(true);
    state.setState("loading");
    state.setOutput("");
    const requestId = crypto.randomUUID();
    const offChunk = EventsOn("evoca:llm:chunk", (event: { id: string; chunk: string }) => {
      if (event?.id === requestId) {
        const current = useOverlayStore.getState().output;
        useOverlayStore.getState().setOutput(current + (event.chunk || ""));
        useOverlayStore.getState().setState("loading");
      }
    });
    const offDone = EventsOn("evoca:llm:done", (event: { id: string; output: string }) => {
      if (event?.id === requestId) { setStreaming(false); state.setOutput(event.output || useOverlayStore.getState().output); offChunk(); offDone(); offError(); }
    });
    const offError = EventsOn("evoca:llm:error", (event: { id: string; error: string }) => {
      if (event?.id === requestId) { setStreaming(false); state.setError(event.error || "LLM request failed"); offChunk(); offDone(); offError(); }
    });
    try {
      await evoca.startConfigurationStream(selected.id, state.input, requestId);
    } catch (error) {
      setStreaming(false);
      offChunk(); offDone(); offError();
      state.setError(String(error));
    }
  }

  if (state.state === "closed") return null;

  if (state.state === "searching") {
    return (
      <section className="panel">
        <div className="brand">
          <div><span className="brand-mark">✦</span><b>eVoca</b></div>
          <button onClick={onOpenSettings}>Settings</button>
        </div>
        <input
          autoFocus
          placeholder="Search configurations..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
        <div className="title">{selected?.name} · Generating…</div>
        <div className="result"><Markdown source={state.output} /><span className="stream-cursor">▌</span></div>
        <footer><span>Live SSE stream</span><button onClick={() => navigator.clipboard.writeText(state.output)}>Copy</button></footer>
      </section>
    );
  }

  if (state.state === "input" || state.state === "loading") {
    return (
      <section className="panel">
        <div className="title">{selected?.name}</div>
        <textarea
          autoFocus
          disabled={streaming}
          placeholder="Enter text..."
          value={state.input}
          onChange={(e) => state.setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void run();
          }}
        />
        <footer>
          <span>{state.state === "loading" ? "Generating…" : "Ctrl+Enter to run"}</span>
          <button className="primary" disabled={streaming} onClick={() => void run()}>Run</button>
        </footer>
      </section>
    );
  }

  if (state.state === "output") {
    return (
      <section className="panel">
        <div className="title">Result</div>
        <div className="result"><Markdown source={state.output} />{streaming && <span className="stream-cursor">▌</span>}</div>
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
