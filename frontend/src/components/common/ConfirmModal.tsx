interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({ open, title, message, confirmLabel = "Delete", busy = false, onCancel, onConfirm }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className="w-full max-w-[380px] overflow-hidden rounded-[16px] border border-white/[.08] bg-[linear-gradient(180deg,#15181e,#0d1014)] shadow-[0_35px_100px_rgba(0,0,0,.62),inset_0_1px_0_rgba(255,255,255,.035)]">
        <div className="border-b border-white/[.06] px-5 py-4">
          <h2 id="confirm-modal-title" className="m-0 text-[13px] font-semibold text-white">{title}</h2>
          <p className="mt-1.5 text-[10px] leading-5 text-white/40">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5">
          <button type="button" disabled={busy} className="inline-flex items-center justify-center rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/75 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white" onClick={onCancel}>Cancel</button>
          <button type="button" disabled={busy} className="inline-flex items-center justify-center rounded-[10px] border border-red-200/10 bg-red-300/[.07] px-3 py-2 text-[10px] font-semibold text-evoca-danger transition hover:bg-red-300/[.12]" onClick={onConfirm}>{busy ? "Deleting…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
