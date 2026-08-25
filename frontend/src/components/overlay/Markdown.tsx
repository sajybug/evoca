import React from "react";

const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;

function directionFor(text: string): "rtl" | "ltr" {
  return RTL_RE.test(text) ? "rtl" : "ltr";
}

function inline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (/^`[^`]+`$/.test(part)) return <code key={i} dir="ltr">{part.slice(1, -1)}</code>;
    if (/^\*\*.*\*\*$/.test(part) || /^__.*__$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*.*\*$/.test(part) || /^_.*_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function TextNode({ text, as: Tag = "p" }: { text: string; as?: React.ElementType }) {
  return <Tag dir={directionFor(text)}>{inline(text)}</Tag>;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let code: string[] | null = null;

  const flushList = () => {
    if (list.length) {
      nodes.push(<ul key={`ul-${nodes.length}`} dir="rtl">{list}</ul>);
      list = [];
    }
  };
  const flushCode = () => {
    if (code) {
      nodes.push(<pre key={`code-${nodes.length}`} dir="ltr"><code>{code.join("\n")}</code></pre>);
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
      list.push(<li key={index} dir={directionFor(text)}>{inline(text)}</li>);
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
  return <div className="markdown">{nodes}</div>;
}
