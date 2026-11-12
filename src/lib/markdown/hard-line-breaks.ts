import type { Nodes } from "mdast";
import { parseMarkdown } from "./parse";

/**
 * The same Markdown with every soft line break made hard (#1871), so a note
 * pasted into another Markdown tool keeps the lines `MarkdownText` shows.
 *
 * `MarkdownText` renders a single newline as a line break (`remark-breaks`),
 * because notetakers type one point per line without bullets. Every other
 * CommonMark renderer joins those lines into one paragraph, so the copied
 * Markdown has to say so explicitly: a trailing backslash, the one hard-break
 * form that survives editors trimming trailing spaces.
 *
 * Soft breaks are found on the parsed tree, not by line: a newline inside a
 * paragraph's text is one, while the newline between two list items, two
 * table rows or the lines of a fenced code block is not, and a backslash there
 * would render literally. Everything else in the source is left byte-for-byte.
 */
export function withHardLineBreaks(markdown: string): string {
  const offsets: number[] = [];

  const visit = (node: Nodes) => {
    if (node.type === "text") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      for (let index = start; index < end; index++) {
        if (markdown[index] === "\n") offsets.push(index);
      }
      return;
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(parseMarkdown(markdown));

  if (offsets.length === 0) return markdown;

  let result = "";
  let cursor = 0;
  for (const offset of offsets) {
    // Trailing spaces before the newline would sit between the text and the
    // backslash; drop them so the line ends in exactly one hard-break marker.
    let lineEnd = offset;
    if (markdown[lineEnd - 1] === "\r") lineEnd--;
    let textEnd = lineEnd;
    while (textEnd > cursor && /[ \t]/.test(markdown[textEnd - 1])) textEnd--;
    result += `${markdown.slice(cursor, textEnd)}\\`;
    cursor = lineEnd;
  }
  return result + markdown.slice(cursor);
}
