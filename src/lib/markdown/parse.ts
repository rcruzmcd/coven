import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * Markdown a person typed, as an mdast tree, parsed exactly the way
 * `MarkdownText` parses it for display (CommonMark + GFM).
 *
 * Server-safe and React-free, so the helpers that turn the same text into
 * something other than HTML (hard-break Markdown for the clipboard, plain text
 * for ICS, email and CSV) read it with the same grammar a reader saw rendered,
 * instead of a regex that approximates it.
 */
const processor = unified().use(remarkParse).use(remarkGfm);

export function parseMarkdown(markdown: string): Root {
  // remark-gfm only adds syntax extensions to the parser; there are no
  // transforms to run, so the parse tree is already the final tree.
  return processor.parse(markdown);
}
