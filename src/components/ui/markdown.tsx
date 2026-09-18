import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Markdown as a model writes it, drawn as it was meant: headings, bold
 * and italic, bullet and numbered lists, rules, code. The subset is
 * small on purpose, and everything is emitted as text inside fixed
 * elements — never as HTML — because what a model writes is content
 * from outside (CLAUDE.md, the AI surface). Links are left as the
 * text they are; a run's output is not a page to click around in.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; text: string }
  | { kind: "rule" };

const HEADING = /^(#{1,4})\s+(.*)$/;
/** A line that is nothing but bold is a heading in a model's hand. */
const BOLD_LINE = /^\*\*([^*]+)\*\*:?\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ...list });
    list = null;
  };

  for (const line of lines) {
    if (code) {
      if (line.startsWith("```")) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else code.push(line);
      continue;
    }
    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      code = [];
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
      continue;
    }
    const bold = BOLD_LINE.exec(line);
    if (bold) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", level: 3, text: bold[1]! });
      continue;
    }
    if (RULE.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "rule" });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    // A line under a list item without a marker continues the item.
    if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) blocks.push({ kind: "code", text: code.join("\n") });
  flushParagraph();
  flushList();
  return blocks;
}

/** `**bold**`, `*italic*` and `` `code` `` inside a line; everything else is text. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];
    if (token.startsWith("**")) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      out.push(
        <code key={key++} className="bg-secondary rounded px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    else out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={cn("flex flex-col gap-3 text-reading leading-relaxed", className)}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading": {
            const size =
              block.level === 1
                ? "text-lg font-semibold"
                : block.level === 2
                  ? "text-base font-semibold"
                  : "text-reading font-semibold";
            return (
              <p key={i} className={cn(size, i > 0 && "mt-2")}>
                {inline(block.text)}
              </p>
            );
          }
          case "paragraph":
            return <p key={i}>{inline(block.text)}</p>;
          case "list":
            return block.ordered ? (
              <ol key={i} className="flex list-decimal flex-col gap-1 pl-6">
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="flex list-disc flex-col gap-1 pl-6">
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ul>
            );
          case "code":
            return (
              <pre
                key={i}
                className="bg-background overflow-auto rounded-md px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap"
              >
                {block.text}
              </pre>
            );
          case "rule":
            return <hr key={i} className="border-border" />;
          default:
            return <Fragment key={i} />;
        }
      })}
    </div>
  );
}
