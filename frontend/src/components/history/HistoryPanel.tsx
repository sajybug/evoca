import { useEffect, useMemo, useState } from "react";
import { evoca } from "../../services/evoca";
import type { Configuration, Execution, ExecutionPage } from "../../types/domain";
import { Markdown } from "../overlay/Markdown";
import { ConfirmModal } from "../common/ConfirmModal";
import { SearchableSelect } from "../common/SearchableSelect";

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
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState<"all" | "selected" | null>(null);

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

  return <section className="h-full w-full overflow-hidden border border-evoca-line bg-[linear-gradient(180deg,rgba(18,21,27,.985),rgba(10,12,16,.995)),radial-gradient(circle_at_24%_0%,rgba(255,255,255,.04),transparent_34%)] shadow-[0_35px_100px_rgba(0,0,0,.58),0_12px_30px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.035)] flex flex-col">
    <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-4 [--wails-draggable:drag]">
      <div className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px] border border-evoca-accent/20 bg-[#F5E8C5] text-[30px] text-[#1B1B1A] inline-flex items-center justify-center leading-none">✦</span><div><h1 className="m-0 text-[13px] font-semibold tracking-[-.01em] text-white">History</h1><p className="text-[9px] leading-4 text-white/32">{data.total} saved executions · inspect prompts, screenshots, and responses</p></div></div>
      <div className="flex items-center gap-1.5"><button type="button" className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/[.07] bg-white/[.03] px-2.5 py-1.5 text-[9px] font-semibold text-white/60 transition hover:bg-white/[.06] hover:text-white" disabled={refreshing || deleting} onClick={async () => { setRefreshing(true); try { await loadHistory(); } finally { setRefreshing(false); } }}>{refreshing ? "Refreshing…" : "Refresh"}</button><button type="button" className="inline-flex items-center gap-1.5 rounded-[9px] border border-red-200/10 bg-red-300/[.04] px-2.5 py-1.5 text-[9px] font-semibold text-red-100/60 transition hover:bg-red-300/[.08] hover:text-red-50" disabled={!data.total || deleting} onClick={() => setConfirm("all")}>{deleting ? "Deleting…" : "Delete all"}</button><button type="button" className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/[.07] bg-white/[.03] px-2.5 py-1.5 text-[9px] font-semibold text-white/60 transition hover:bg-white/[.06] hover:text-white" onClick={onClose}>Close</button></div>
    </div>
    <div className="border-b border-white/[.06] px-5 py-4">
      <div className="grid grid-cols-[1.6fr_1fr_.8fr_.8fr] gap-2 max-[900px]:grid-cols-2">
        <input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25 text-[9px] !py-2.5" placeholder="Search prompts, answers, models..." value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        <SearchableSelect value={configurationId} options={[{value:"",label:"All configurations"}, ...configurations.map((x) => ({value:x.id,label:x.name}))]} onChange={(value) => { setPage(1); setConfigurationId(value); }} />
        <SearchableSelect value={requestType} options={[{value:"",label:"All inputs"},{value:"text",label:"Text"},{value:"screenshot",label:"Screenshot"}]} onChange={(value) => { setPage(1); setRequestType(value); }} />
        <SearchableSelect value={status} options={[{value:"",label:"All statuses"},{value:"success",label:"Success"},{value:"error",label:"Error"},{value:"cancelled",label:"Cancelled"},{value:"running",label:"Running"}]} onChange={(value) => { setPage(1); setStatus(value); }} />
      </div>
    </div>

    <div className="min-h-0 flex-1 grid grid-cols-[320px_minmax(0,1fr)] gap-0 max-[900px]:grid-cols-1">
      <div className="min-h-0 overflow-auto border-r border-white/[.06] px-3 py-3 max-[900px]:max-h-[280px] max-[900px]:border-r-0 max-[900px]:border-b">
        {loadError && <div className="rounded-[12px] border border-red-300/10 bg-red-400/[.06] px-3 py-2.5 text-[11px] leading-5 text-evoca-danger mb-3">History load failed: {loadError}</div>}
        {loading && <div className="rounded-[11px] border border-white/[.06] bg-white/[.025] px-3 py-2.5 text-[10px] leading-5 text-white/56 mb-3">Loading history…</div>}
        {!loading && !data.items.length && <div className="flex min-h-[160px] flex-1 items-center justify-center text-center text-[10px] text-white/28">No executions found for the current filters.</div>}
        {data.items.map((item) => <button className={`mb-1.5 block w-full rounded-[12px] border border-transparent bg-transparent p-3 text-left transition hover:border-white/[.07] hover:bg-white/[.035] ${selected?.id === item.id ? "border-evoca-accent/30 bg-evoca-accent/[.08] shadow-[inset_2px_0_0_rgba(216,184,110,.65),0_0_0_1px_rgba(216,184,110,.04)]" : ""}`} key={item.id} onClick={() => void openExecution(item)}>
          <div className="flex items-center justify-between gap-2"><b className="truncate text-[10px] font-semibold text-white/82">{item.configurationName}</b><span className="shrink-0 text-[8px] text-white/24">{formatTime(item.createdAt)}</span></div>
          <div className="mt-2 line-clamp-2 text-[9px] leading-5 text-white/45">{item.input || "(no prompt)"}</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[8px] font-medium text-white/30"><span className="rounded-full border border-white/[.06] bg-white/[.025] px-2 py-1">{item.requestType === "screenshot" ? "Screenshot" : "Text"}</span><span className="rounded-full border border-white/[.06] bg-white/[.025] px-2 py-1">{item.model || "Model —"}</span><span className="rounded-full border border-white/[.06] bg-white/[.025] px-2 py-1">{item.totalTokens ? `${item.totalTokens} tok` : "tokens —"}</span><span className="rounded-full border border-white/[.06] bg-white/[.025] px-2 py-1">{item.status}</span></div>
        </button>)}
      </div>

      <div className="min-h-0 min-w-0 overflow-auto p-5">
        {selected ? <>
          <div className="flex items-start justify-between gap-4"><div><h3 className="m-0 text-[12px] font-semibold text-white">{selected.configurationName}</h3><p className="mt-1 text-[9px] leading-4 text-white/30">{selected.providerName} · {selected.model} · {selectedConfig ? "configuration saved" : "configuration no longer available"}</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-white/[.06] bg-white/[.025] px-2 py-1 text-[8px] font-medium text-white/35">{selected.requestType === "screenshot" ? "Screenshot run" : "Text run"}</span><button type="button" className="rounded-[9px] border border-red-200/10 bg-red-300/[.04] px-2.5 py-1.5 text-[9px] font-semibold text-red-100/60 transition hover:bg-red-300/[.08] hover:text-red-50 disabled:opacity-40" disabled={deleting} onClick={() => setConfirm("selected")}>Delete</button></div></div>
          <div className="mt-4 grid grid-cols-5 gap-2 max-[900px]:grid-cols-2"><div className="rounded-[11px] border border-white/[.05] bg-white/[.02] px-3 py-2.5"><span className="block text-[8px] uppercase tracking-[.12em] text-white/25">Status</span><b className="mt-1 block text-[10px] font-semibold text-white/75">{selected.status}</b></div><div className="rounded-[11px] border border-white/[.05] bg-white/[.02] px-3 py-2.5"><span className="block text-[8px] uppercase tracking-[.12em] text-white/25">Duration</span><b className="mt-1 block text-[10px] font-semibold text-white/75">{formatDuration(selected.durationMs)}</b></div><div className="rounded-[11px] border border-white/[.05] bg-white/[.02] px-3 py-2.5"><span className="block text-[8px] uppercase tracking-[.12em] text-white/25">TTFT</span><b className="mt-1 block text-[10px] font-semibold text-white/75">{formatDuration(selected.firstTokenMs)}</b></div><div className="rounded-[11px] border border-white/[.05] bg-white/[.02] px-3 py-2.5"><span className="block text-[8px] uppercase tracking-[.12em] text-white/25">Tokens</span><b className="mt-1 block text-[10px] font-semibold text-white/75">{selected.totalTokens || "—"}</b></div><div className="rounded-[11px] border border-white/[.05] bg-white/[.02] px-3 py-2.5"><span className="block text-[8px] uppercase tracking-[.12em] text-white/25">Speed</span><b className="mt-1 block text-[10px] font-semibold text-white/75">{selected.tokensPerSec ? `${selected.tokensPerSec.toFixed(1)} tok/s` : "—"}</b></div></div>
          <div className="mt-4 rounded-[14px] border border-white/[.06] bg-white/[.018] p-4"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[.14em] text-white/25">Request</div><div className="overflow-hidden rounded-[10px] border border-white/[.05] bg-[#090c10] p-3"><b className="block text-[9px] font-semibold text-white/55">Input</b><pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[9px] leading-5 text-white/45">{selected.input || "(empty)"}</pre><b className="mt-4 block text-[9px] font-semibold text-white/55">System prompt</b><pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[9px] leading-5 text-white/45">{selected.systemPrompt || "(empty)"}</pre></div></div>
          {selected.imageData && <div className="mt-4 rounded-[14px] border border-white/[.06] bg-white/[.018] p-4"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[.14em] text-white/25">Screenshot</div><div className="overflow-hidden rounded-[10px] border border-white/[.05] bg-black/20"><img src={`data:image/png;base64,${selected.imageData}`} alt="Request screenshot" /></div></div>}
          <div className="mt-4 rounded-[14px] border border-white/[.06] bg-white/[.018] p-4"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[.14em] text-white/25">Response</div><div className="min-w-0 max-w-full overflow-hidden rounded-[10px] border border-white/[.05] bg-[#090c10] p-4"><Markdown source={selected.output || selected.error || "(no response)"} /></div></div>
          <div className="mt-4 text-[8px] text-white/22">Started {formatTime(selected.createdAt)}{selected.completedAt ? ` · completed ${formatTime(selected.completedAt)}` : ""}{selected.inputTokens ? ` · ${selected.inputTokens} input / ${selected.outputTokens} output tokens` : ""}</div>
        </> : <div className="flex min-h-[160px] flex-1 items-center justify-center text-center text-[10px] text-white/28">Select an execution to inspect the full request and response.</div>}
      </div>
    </div>

    <div className="flex items-center gap-2 border-t border-white/[.06] px-5 py-3 text-[8px] text-white/25"><span>{data.total} executions · Page {data.totalPages ? data.page : 0} / {data.totalPages || 0}</span><button className="rounded-[8px] border border-white/[.075] bg-white/[.035] px-2 py-1.5 text-[9px] font-semibold text-white/55 transition hover:bg-white/[.06] hover:text-white disabled:opacity-40" disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><button className="rounded-[8px] border border-white/[.075] bg-white/[.035] px-2 py-1.5 text-[9px] font-semibold text-white/55 transition hover:bg-white/[.06] hover:text-white disabled:opacity-40" disabled={!data.totalPages || data.page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div>

    <ConfirmModal
      open={confirm !== null}
      title={confirm === "all" ? "Delete all History?" : "Delete History entry?"}
      message="This action cannot be undone."
      busy={deleting}
      onCancel={() => setConfirm(null)}
      onConfirm={async () => {
        setDeleting(true);
        try {
          if (confirm === "all") { await evoca.clearExecutions(); setSelected(null); setPage(1); await loadHistory(1); }
          else if (selected) { await evoca.deleteExecution(selected.id); setSelected(null); await loadHistory(page); }
          setConfirm(null);
        } catch (error) { setLoadError(String(error)); }
        finally { setDeleting(false); }
      }}
    />
  </section>;
}
