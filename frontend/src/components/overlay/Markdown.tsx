import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";

import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;

function directionFor(text: string): "rtl" | "ltr" {
  return RTL_RE.test(text) ? "rtl" : "ltr";
}

function getTextContent(node: React.ReactNode): string {
  if (typeof node === "string") {
    return node;
  }

  if (typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextContent).join("");
  }

  if (
    React.isValidElement<{
      children?: React.ReactNode;
    }>(node)
  ) {
    return getTextContent(node.props.children);
  }

  return "";
}

export function Markdown({
  source,
}: {
  source: string;
}) {
  return (
    <div className="min-w-0 max-w-full overflow-wrap-anywhere break-words">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
        ]}
        rehypePlugins={[
          rehypeHighlight,
          rehypeKatex,
        ]}
        components={{
          /**
           * H1
           */
          h1: ({ children }) => {
            const text = getTextContent(children);

            return (
              <h1
                dir={directionFor(text)}
                className="mt-3 mb-3 text-[16px] font-semibold leading-6 text-white"
              >
                {children}
              </h1>
            );
          },

          /**
           * H2
           */
          h2: ({ children }) => {
            const text = getTextContent(children);

            return (
              <h2
                dir={directionFor(text)}
                className="mt-3 mb-2 text-[14px] font-semibold leading-6 text-white"
              >
                {children}
              </h2>
            );
          },

          /**
           * H3
           */
          h3: ({ children }) => {
            const text = getTextContent(children);

            return (
              <h3
                dir={directionFor(text)}
                className="mt-3 mb-2 text-[13px] font-semibold leading-5 text-white"
              >
                {children}
              </h3>
            );
          },

          /**
           * H4
           */
          h4: ({ children }) => {
            const text = getTextContent(children);

            return (
              <h4
                dir={directionFor(text)}
                className="mt-2 mb-1.5 text-[11px] font-semibold leading-5 text-white/90"
              >
                {children}
              </h4>
            );
          },

          /**
           * H5
           */
          h5: ({ children }) => {
            const text = getTextContent(children);

            return (
              <h5
                dir={directionFor(text)}
                className="mt-2 mb-1.5 text-[11px] font-semibold leading-5 text-white/90"
              >
                {children}
              </h5>
            );
          },

          /**
           * H6
           */
          h6: ({ children }) => {
            const text = getTextContent(children);

            return (
              <h6
                dir={directionFor(text)}
                className="mt-2 mb-1.5 text-[11px] font-semibold leading-5 text-white/90"
              >
                {children}
              </h6>
            );
          },

          /**
           * Paragraph
           */
          p: ({ children }) => {
            const text = getTextContent(children);

            return (
              <p
                dir={directionFor(text)}
                className="my-2 text-[11px] leading-6 text-white/68"
              >
                {children}
              </p>
            );
          },

          /**
           * Strong
           */
          strong: ({ children }) => (
            <strong className="font-semibold text-white">
              {children}
            </strong>
          ),

          /**
           * Emphasis
           */
          em: ({ children }) => (
            <em className="italic text-white/80">
              {children}
            </em>
          ),

          /**
           * Links
           */
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-evoca-accent-2 underline underline-offset-2"
            >
              {children}
            </a>
          ),

          /**
           * Unordered list
           */
          ul: ({ children }) => (
            <ul
              dir="auto"
              className="my-2 list-disc space-y-1 pl-5 text-[11px] leading-6 text-white/72"
            >
              {children}
            </ul>
          ),

          /**
           * Ordered list
           */
          ol: ({ children }) => (
            <ol
              dir="auto"
              className="my-2 list-decimal space-y-1 pl-5 text-[11px] leading-6 text-white/72"
            >
              {children}
            </ol>
          ),

          /**
           * List item
           */
          li: ({ children }) => {
            const text = getTextContent(children);

            return (
              <li
                dir={directionFor(text)}
                className="text-[11px] leading-6 text-white/68"
              >
                {children}
              </li>
            );
          },

          /**
           * Blockquote
           */
          blockquote: ({ children }) => (
            <blockquote
              dir="auto"
              className="my-3 border-s-2 border-white/20 ps-3 text-[11px] leading-6 text-white/55"
            >
              {children}
            </blockquote>
          ),

          /**
           * Horizontal rule
           */
          hr: () => (
            <hr className="my-4 border-white/[.08]" />
          ),

          /**
           * Inline code / fenced code
           *
           * Mermaid is intentionally NOT rendered.
           * It will simply be shown as a normal code block.
           */
          code: ({
            children,
            className,
          }) => {
            const isInline = !className;

            if (isInline) {
              return (
                <code
                  dir="ltr"
                  className="rounded bg-white/[.05] px-1 py-0.5 font-mono text-[10px] text-evoca-accent-2"
                >
                  {children}
                </code>
              );
            }

            return (
              <code
                dir="ltr"
                className={`${className} font-mono text-[10px] leading-5`}
              >
                {children}
              </code>
            );
          },

          /**
           * Fenced code block
           *
           * language-mermaid is treated exactly like
           * every other language and is shown as raw code.
           */
          pre: ({ children }) => (
            <pre
              dir="ltr"
              className="my-3 overflow-x-auto rounded-[10px] border border-white/[.06] bg-black/25 p-3 font-mono text-[10px] leading-5 text-white/65"
            >
              {children}
            </pre>
          ),

          /**
           * Table wrapper
           */
          table: ({ children }) => (
            <div className="my-3 w-full overflow-x-auto">
              <table className="min-w-full border-collapse overflow-hidden rounded-lg border border-white/[.08] text-[10px]">
                {children}
              </table>
            </div>
          ),

          /**
           * Table head
           */
          thead: ({ children }) => (
            <thead className="bg-white/[.05]">
              {children}
            </thead>
          ),

          /**
           * Table body
           */
          tbody: ({ children }) => (
            <tbody>{children}</tbody>
          ),

          /**
           * Table row
           */
          tr: ({ children }) => (
            <tr className="border-b border-white/[.06] last:border-b-0">
              {children}
            </tr>
          ),

          /**
           * Table header cell
           */
          th: ({ children }) => {
            const text = getTextContent(children);

            return (
              <th
                dir={directionFor(text)}
                className="border-e border-white/[.06] px-3 py-2 text-start font-semibold text-white/90 last:border-e-0"
              >
                {children}
              </th>
            );
          },

          /**
           * Table cell
           */
          td: ({ children }) => {
            const text = getTextContent(children);

            return (
              <td
                dir={directionFor(text)}
                className="border-e border-white/[.06] px-3 py-2 align-top text-white/65 last:border-e-0"
              >
                {children}
              </td>
            );
          },

          /**
           * GFM task-list checkbox
           */
          input: ({
            checked,
            disabled,
            ...props
          }) => (
            <input
              {...props}
              type="checkbox"
              checked={checked}
              disabled={disabled ?? false}
              readOnly
              className="me-2 align-middle"
            />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}