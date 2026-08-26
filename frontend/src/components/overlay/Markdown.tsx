import React from "react";

const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;

function directionFor(text: string): "rtl" | "ltr" {
  return RTL_RE.test(text) ? "rtl" : "ltr";
}

function inline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (/^`[^`]+`$/.test(part)) return <code className="rounded bg-white/[.05] px-1 py-0.5 font-mono text-[10px] text-evoca-accent-2" key={i} dir="ltr">{part.slice(1, -1)}</code>;
    if (/^\*\*.*\*\*$/.test(part) || /^__.*__$/.test(part)) return <strong className="font-semibold text-white" key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*.*\*$/.test(part) || /^_.*_$/.test(part)) return <em className="italic text-white/80" key={i}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function TextNode({ text, as: Tag = "p" }: { text: string; as?: React.ElementType }) {
  const normalized = typeof Tag === "string" ? Tag : "p";
  const typography = normalized === "h1" ? "mt-2 mb-3 text-[16px] font-semibold leading-6 text-white"
    : normalized === "h2" ? "mt-2 mb-2 text-[14px] font-semibold leading-6 text-white"
    : normalized === "h3" ? "mt-2 mb-2 text-[13px] font-semibold leading-5 text-white"
    : normalized === "h4" || normalized === "h5" || normalized === "h6" ? "mt-2 mb-1.5 text-[11px] font-semibold leading-5 text-white/90"
    : "my-2 text-[11px] leading-6 text-white/68";
  return <Tag className={typography} dir={directionFor(text)}>{inline(text)}</Tag>;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let code: string[] | null = null;

  const flushList = () => {
    if (list.length) {
      nodes.push(<ul className="my-2 list-disc space-y-1 pl-5 text-[11px] leading-6 text-white/72" key={`ul-${nodes.length}`} dir="rtl">{list}</ul>);
      list = [];
    }
  };
  const flushCode = () => {
    if (code) {
      nodes.push(<pre className="my-3 overflow-x-auto rounded-[10px] border border-white/[.06] bg-black/25 p-3 font-mono text-[10px] leading-5 text-white/65" key={`code-${nodes.length}`} dir="ltr"><code>{code.join("\n")}</code></pre>);
      code = null;
    }
  };

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      flushList();
      if (code) flushCode(); else code = [];
      return;
    }
    if (code) { code.push(line); return; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const Tag = `h${heading[1].length}` as React.ElementType;
      nodes.push(<TextNode key={index} as={Tag} text={heading[2]} />);
      return;
    }
    const item = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (item) {
      const text = item[1];
      list.push(<li className="text-[11px] leading-6 text-white/68" key={index} dir={directionFor(text)}>{inline(text)}</li>);
      return;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushList();
      nodes.push(<TextNode key={index} text={line} />);
      return;
    }
    if (!line.trim()) { flushList(); return; }
    flushList();
    nodes.push(<TextNode key={index} text={line} />);
  });
  flushList();
  flushCode();
  return <div className="min-w-0 max-w-full overflow-wrap-anywhere break-words">{nodes}</div>;
}
