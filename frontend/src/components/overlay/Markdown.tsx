import React from "react";

function inline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    if (/^\*\*.*\*\*$/.test(part) || /^__.*__$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*.*\*$/.test(part) || /^_.*_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let code: string[] | null = null;

  const flushList = () => {
    if (list.length) { nodes.push(<ul key={`ul-${nodes.length}`}>{list}</ul>); list = []; }
  };
  const flushCode = () => {
    if (code) { nodes.push(<pre key={`code-${nodes.length}`}><code>{code.join("\n")}</code></pre>); code = null; }
  };

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      flushList();
      if (code) flushCode(); else code = [];
      return;
    }
    if (code) { code.push(line); return; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flushList(); const Tag = `h${heading[1].length}` as React.ElementType; nodes.push(<Tag key={index}>{inline(heading[2])}</Tag>); return; }
    const item = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (item) { list.push(<li key={index}>{inline(item[1])}</li>); return; }
    if (/^\s*\d+\.\s+/.test(line)) { flushList(); nodes.push(<p key={index}>{inline(line)}</p>); return; }
    if (!line.trim()) { flushList(); return; }
    flushList(); nodes.push(<p key={index}>{inline(line)}</p>);
  });
  flushList(); flushCode();
  return <div className="markdown">{nodes}</div>;
}
