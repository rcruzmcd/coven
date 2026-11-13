import type { Nodes, Parents } from "mdast";
import { parseMarkdown } from "./parse";

/**
 * Markdown a person typed, as plain text for the places that cannot render it
 * (#1873): an ICS `DESCRIPTION`, the text part of an email, a page's meta
 * description, a CSV cell, the plain-text exports.
 *
 * Read off the same parse tree `MarkdownText` renders, so what comes out is
 * what a reader saw, minus the markup:
 *
 * - paragraphs stay separated by a blank line, and every line break the writer
 *   typed stays a line break (soft or hard, as `remark-breaks` displays it);
 * - list items become `- item` / `1. item` lines, nested items indented;
 * - a link becomes `text (url)`, or just the text when it already is the url;
 * - emphasis, strikethrough and code markers are dropped, keeping their text;
 * - a table becomes one line per row, cells separated by ` | `.
 *
 * Text with no Markdown in it comes back as it went in, trimmed.
 */
export function markdownToPlainText(markdown: string): string {
  if (markdown.trim() === "") return "";
  return blocks(parseMarkdown(markdown).children).trim();
}

/** Block-level children, a blank line between each. */
function blocks(nodes: Nodes[]): string {
  return nodes
    .map(block)
    .filter((text) => text !== "")
    .join("\n\n");
}

function block(node: Nodes): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return inline(node.children);
    case "list":
      return node.children
        .map((item, index) => {
          const marker = node.ordered ? `${(node.start ?? 1) + index}. ` : "- ";
          const check =
            item.checked === true
              ? "[x] "
              : item.checked === false
                ? "[ ] "
                : "";
          // A tight item's paragraphs read as lines; a loose one keeps its gap.
          const body = item.children
            .map(block)
            .filter((text) => text !== "")
            .join(node.spread || item.spread ? "\n\n" : "\n");
          return `${marker}${check}${indentContinuation(body, marker.length)}`;
        })
        .join(node.spread ? "\n\n" : "\n");
    case "blockquote":
      return blocks(node.children);
    case "code":
    case "html":
      return node.value;
    case "table":
      return node.children
        .map((row) =>
          row.children.map((cell) => inline(cell.children).trim()).join(" | "),
        )
        .join("\n");
    case "thematicBreak":
    case "definition":
      return "";
    default:
      return "children" in node ? blocks(node.children) : inline([node]);
  }
}

function inline(nodes: Nodes[]): string {
  return nodes.map(phrase).join("");
}

function phrase(node: Nodes): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "html":
      return node.value;
    case "break":
      return "\n";
    case "image":
      return node.alt ?? "";
    case "link": {
      const text = inline(node.children);
      const bare = node.url.replace(/^mailto:/, "");
      return text === ""
        ? node.url
        : text === bare || text === node.url
          ? text
          : `${text} (${node.url})`;
    }
    default:
      return "children" in node ? inline((node as Parents).children) : "";
  }
}

/** Lines after the first sit under the item's text, not under its marker. */
function indentContinuation(text: string, width: number): string {
  const pad = " ".repeat(width);
  return text.replace(/\n(?!\n|$)/g, `\n${pad}`);
}

/**
 * `markdownToPlainText`, every line indented by `indent` -- for a note set
 * under a heading in a plain-text export, where only indenting the first line
 * would push the rest of a multi-line note out to the margin. Blank lines stay
 * blank. Empty for empty input, so the caller can supply its own placeholder.
 */
export function plainBlock(markdown: string, indent: string): string {
  const text = markdownToPlainText(markdown);
  if (text === "") return "";
  return text
    .split("\n")
    .map((line) => (line === "" ? "" : `${indent}${line}`))
    .join("\n");
}

/**
 * `markdownToPlainText` on one line, cut to at most `max` characters at a word
 * boundary with an ellipsis -- for a page's meta description or a listing
 * excerpt, where line breaks mean nothing and a search result shows ~160
 * characters. Empty for empty input.
 */
export function plainExcerpt(markdown: string, max = 160): string {
  const text = markdownToPlainText(markdown).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  // A space at `max - 1` ends a whole word, so look one character further.
  const space = text.slice(0, max).lastIndexOf(" ");
  const cut = space > max / 2 ? text.slice(0, space) : text.slice(0, max - 1);
  return `${cut.trimEnd()}…`;
}
