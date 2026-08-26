import { useEffect, useMemo, useState } from "react";
import { evoca } from "../../services/evoca";
import type { Configuration, Execution, ExecutionPage } from "../../types/domain";
import { Markdown } from "../overlay/Markdown";

function formatTime(value: number) { const ms = value < 1e12 ? value * 1000 : value; return new Date(ms).toLocaleString(); }
function formatDuration(ms: number) { if (!ms) return "—"; return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`; }

export function HistoryPanel({ configurations, onClose }: { configurations: Configuration[]; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [requestType, setRequestType] = useState("");
  const [configurationId, setConfigurationId] = useState("");
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [data, setData] = useState<ExecutionPage>({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [selected, setSelected] = useState<Execution | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadHistory(nextPage = page) {
    setLoading(true);
    try { const next = await evoca.listExecutions(nextPage, 20, search, status, requestType, configurationId); setData(next && Array.isArray(next.items) ? next : { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }); setLoadError(""); }
    catch (error) { console.error("history load failed", error); setLoadError(String(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadHistory(); }, [page, search, status, requestType, configurationId]);
  useEffect(() => { if (data.totalPages > 0 && page > data.totalPages) setPage(data.totalPages); }, [data.totalPages, page]);
  const selectedConfig = useMemo(() => configurations.find((x) => x.id === selected?.configurationId), [configurations, selected]);
  async function openExecution(item: Execution) { try { setSelected(await evoca.getExecution(item.id)); } catch { setSelected(item); } }

  return <section className="panel history-panel">
    <div className="settings-topbar window-drag-handle">
      <div className="settings-topbar-left"><span className="brand-mark inline-flex items-center justify-center leading-none">✦</span><div className="settings-topbar-copy"><h1>History</h1><p>{data.total} saved executions · inspect prompts, screenshots, and responses</p></div></div>
      <div className="settings-topbar-actions"><button type="button" className="chrome-button" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await loadHistory(); } finally { setRefreshing(false); } }}>{refreshing ? "Refreshing…" : "Refresh"}</button><button type="button" className="chrome-button" onClick={onClose}>Close</button></div>
    </div>
    <div className="history-toolbar-wrap">
      <div className="history-toolbar">
        <input placeholder="Search prompts, answers, models..." value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        <select value={configurationId} onChange={(e) => { setPage(1); setConfigurationId(e.target.value); }}><option value="">All configurations</option>{configurations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={requestType} onChange={(e) => { setPage(1); setRequestType(e.target.value); }}><option value="">All inputs</option><option value="text">Text</option><option value="screenshot">Screenshot</option></select>
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}><option value="">All statuses</option><option value="success">Success</option><option value="error">Error</option><option value="running">Running</option></select>
      </div>
    </div>

    <div className="history-grid">
      <div className="history-list">
        {loadError && <div className="error mb-3">History load failed: {loadError}</div>}
        {loading && <div className="status-message mb-3">Loading history…</div>}
        {!loading && !data.items.length && <div className="empty-state">No executions found for the current filters.</div>}
        {data.items.map((item) => <button className={`history-item ${selected?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => void openExecution(item)}>
          <div className="history-item-top"><b>{item.configurationName}</b><span>{formatTime(item.createdAt)}</span></div>
          <div className="history-item-main">{item.input || "(no prompt)"}</div>
          <div className="history-item-meta"><span>{item.requestType === "screenshot" ? "Screenshot" : "Text"}</span><span>{item.model || "Model —"}</span><span>{item.totalTokens ? `${item.totalTokens} tok` : "tokens —"}</span><span>{item.status}</span></div>
        </button>)}
      </div>

      <div className="history-detail">
        {selected ? <>
          <div className="history-detail-head"><div><h3>{selected.configurationName}</h3><p>{selected.providerName} · {selected.model} · {selectedConfig ? "configuration saved" : "configuration no longer available"}</p></div><span className="row-chip">{selected.requestType === "screenshot" ? "Screenshot run" : "Text run"}</span></div>
          <div className="history-stats"><div className="history-stat"><span>Status</span><b>{selected.status}</b></div><div className="history-stat"><span>Duration</span><b>{formatDuration(selected.durationMs)}</b></div><div className="history-stat"><span>TTFT</span><b>{formatDuration(selected.firstTokenMs)}</b></div><div className="history-stat"><span>Tokens</span><b>{selected.totalTokens || "—"}</b></div><div className="history-stat"><span>Speed</span><b>{selected.tokensPerSec ? `${selected.tokensPerSec.toFixed(1)} tok/s` : "—"}</b></div></div>
          <div className="history-section"><div className="section-title">Request</div><div className="history-code"><b>Input</b><pre>{selected.input || "(empty)"}</pre><b>System prompt</b><pre>{selected.systemPrompt || "(empty)"}</pre></div></div>
          {selected.imageData && <div className="history-section"><div className="section-title">Screenshot</div><div className="history-image-wrap"><img src={`data:image/png;base64,${selected.imageData}`} alt="Request screenshot" /></div></div>}
          <div className="history-section"><div className="section-title">Response</div><div className="history-response"><Markdown source={selected.output || selected.error || "(no response)"} /></div></div>
          <div className="history-footer">Started {formatTime(selected.createdAt)}{selected.completedAt ? ` · completed ${formatTime(selected.completedAt)}` : ""}{selected.inputTokens ? ` · ${selected.inputTokens} input / ${selected.outputTokens} output tokens` : ""}</div>
        </> : <div className="empty-state">Select an execution to inspect the full request and response.</div>}
      </div>
    </div>

    <div className="history-bottom"><span>{data.total} executions · Page {data.totalPages ? data.page : 0} / {data.totalPages || 0}</span><button disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><button disabled={!data.totalPages || data.page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
  </section>;
}
