"use client";

import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Markdown a person typed, rendered rather than shown raw (#1201).
 *
 * Minutes and agenda notes are written in plain `<textarea>`s, and notetakers
 * type Markdown conventions in them -- `- ` for a bullet, `**bold**` for
 * emphasis. Every governance surface displayed that verbatim with
 * `whitespace-pre-wrap`, so a finalized set of minutes read with literal
 * asterisks in it; `agenda-export.ts` already *emitted* Markdown for the
 * clipboard and nothing ever rendered it.
 *
 * **Secure by default, and kept that way.** `react-markdown` builds a React
 * element tree instead of setting `dangerouslySetInnerHTML`, so a `<script>`
 * or an `<img onerror=...>` typed into a note is text, not markup, and its
 * `defaultUrlTransform` already blocks `javascript:` hrefs. Adding
 * `rehype-raw` is what would reintroduce raw HTML -- and would then oblige us
 * to add `rehype-sanitize` and a schema to take it back out again. Don't. No
 * sanitiser dependency is needed as long as raw HTML stays off, which is the
 * whole reason this library was chosen over `marked` + `dompurify`.
 *
 * **A newline is a line break** (`remark-breaks`, #1871). CommonMark joins
 * the lines of a paragraph with a space, but notetakers type one point per
 * line without bullets, and before #1201 these surfaces were
 * `whitespace-pre-wrap` -- so three lines typed one under another read as one
 * run-on sentence until this plugin went in. A blank line still separates
 * paragraphs. Markdown that leaves the app (the export's Copy button) carries
 * the same breaks explicitly: `withHardLineBreaks` in `@/lib/markdown`.
 *
 * Styling is a handful of rules on `.markdown-text` in `globals.css` rather
 * than `@tailwindcss/typography`: one more dependency for six selectors is not
 * worth it in a 17-package runtime.
 */

/**
 * What a note needs and nothing more. Anything else degrades to its text
 * (`unwrapDisallowed`), so a stray `# heading` in a note reads as words
 * instead of opening a heading level inside a card.
 *
 * `br` is on the list though the elements above it carry the meaning: every
 * newline the writer typed becomes one, and dropping it would silently join
 * two lines. It has no attributes and no children to carry anything else.
 */
const NOTE_ELEMENTS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "code",
  "pre",
  "hr",
  "h3",
  "h4",
  // GFM tables.
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

/**
 * The same, plus the two top heading levels.
 *
 * Only for Markdown this app generated -- the export dialog's print view,
 * which renders the very string the Copy button puts on the clipboard, so
 * `# Minutes — ...` has to be a heading there. A note is never rendered with
 * this: a person's `#` should not be able to open an `h1` inside a page that
 * already has one.
 */
const DOCUMENT_ELEMENTS = ["h1", "h2", ...NOTE_ELEMENTS];

export function MarkdownText({
  children,
  allow = "note",
  className,
}: {
  /** The Markdown source. Empty or whitespace-only renders nothing. */
  children: string;
  /** `document` only for Markdown this app wrote. See `DOCUMENT_ELEMENTS`. */
  allow?: "note" | "document";
  className?: string;
}) {
  if (children.trim() === "") return null;

  return (
    <div className={cn("markdown-text", className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        allowedElements={
          allow === "document" ? DOCUMENT_ELEMENTS : NOTE_ELEMENTS
        }
        unwrapDisallowed
      >
        {children}
      </Markdown>
    </div>
  );
}
