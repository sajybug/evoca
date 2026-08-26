import { useEffect, useMemo, useRef, useState } from "react";

export interface SelectOption { value: string; label: string; }

interface Props {
  value: string;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchableSelect({ value, options, placeholder = "Select…", searchPlaceholder = "Search…", disabled = false, onChange, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  return <div ref={rootRef} className={`relative ${className}`}>
    <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open} className="flex w-full items-center justify-between rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-left text-[10px] text-white outline-none transition hover:bg-white/[.045] focus:border-evoca-accent/35 focus:ring-2 focus:ring-evoca-accent/[.06] disabled:opacity-40">
      <span className={`truncate ${selected ? "text-white" : "text-white/25"}`}>{selected?.label || placeholder}</span>
      <span className="ml-2 text-[9px] text-white/30">{open ? "▴" : "▾"}</span>
    </button>
    <div className={`${open ? "pointer-events-auto opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1"} absolute left-0 right-0 top-[calc(100%+6px)] z-[80] overflow-hidden rounded-[12px] border border-white/[.08] bg-[#11141a] shadow-[0_20px_50px_rgba(0,0,0,.55)] transition`}>
      <div className="border-b border-white/[.06] p-2">
        <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} className="w-full rounded-[9px] border border-white/[.07] bg-white/[.035] px-2.5 py-2 text-[9px] text-white outline-none placeholder:text-white/25 focus:border-evoca-accent/30" />
      </div>
      <div role="listbox" className="max-h-[260px] overflow-y-auto p-1">
        {filtered.length === 0 ? <div className="px-2.5 py-3 text-center text-[9px] text-white/25">No matches.</div> : filtered.map((option) => <button type="button" role="option" aria-selected={option.value === value} key={option.value} className={`flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[9px] transition ${option.value === value ? "bg-evoca-accent/[.12] text-white" : "text-white/62 hover:bg-white/[.05] hover:text-white"}`} onClick={() => { onChange(option.value); setOpen(false); setQuery(""); }}>
          <span className="truncate">{option.label}</span>{option.value === value && <span className="ml-2 text-evoca-accent">✓</span>}
        </button>)}
      </div>
    </div>
  </div>;
}
