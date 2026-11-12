/**
 * The text edits behind `MarkdownTextarea` (#1872), as pure functions of the
 * textarea's value and selection so each one is testable without a DOM.
 *
 * Every function returns one `TextEdit` -- replace `[start, end)` with `text`,
 * then select `[selectionStart, selectionEnd)` in the new value -- or `null`
 * when the key or button does not apply here and the browser's default should
 * happen instead. One contiguous replacement per action is deliberate: the
 * component applies it through `execCommand("insertText")`, so the browser's
 * own undo stack records each action as a single step.
 */

export type TextSelection = {
  value: string;
  start: number;
  end: number;
};

export type TextEdit = {
  start: number;
  end: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

/**
 * indent, marker (`-`, `*`, `+` or `1.` / `1)`), the space after it, and an
 * optional GFM task box.
 */
const LIST_ITEM = /^([ \t]*)([-*+]|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/;

function lineStartAt(value: string, index: number): number {
  return value.lastIndexOf("\n", index - 1) + 1;
}

function lineEndAt(value: string, index: number): number {
  const end = value.indexOf("\n", index);
  return end === -1 ? value.length : end;
}

/** The whole lines a selection touches, as one range. */
function selectedLines({ value, start, end }: TextSelection) {
  const from = lineStartAt(value, start);
  // A selection ending right at the start of a line (triple-click, or
  // shift+down to the line below) does not include that line.
  const lastIndex = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const to = lineEndAt(value, lastIndex);
  return { from, to, lines: value.slice(from, to).split("\n") };
}

/**
 * Enter on a list item: the next item's marker, numbers counting up. Enter on
 * an item with nothing after its marker ends the list instead, by removing the
 * marker -- the convention every list-aware editor shares, and the only way
 * out of a list that doesn't need the mouse.
 */
export function continueList(selection: TextSelection): TextEdit | null {
  const { value, start, end } = selection;
  if (start !== end) return null;

  const from = lineStartAt(value, start);
  const to = lineEndAt(value, start);
  const line = value.slice(from, to);
  const match = LIST_ITEM.exec(line);
  if (!match) return null;

  const markerEnd = from + match[0].length;
  // Enter inside the indent or the marker itself is an ordinary newline.
  if (start < markerEnd) return null;

  if (line.slice(match[0].length).trim() === "") {
    return {
      start: from,
      end: to,
      text: "",
      selectionStart: from,
      selectionEnd: from,
    };
  }

  const [, indent, bullet, number, delimiter, gap, task] = match;
  const marker =
    number === undefined ? bullet : `${Number(number) + 1}${delimiter}`;
  const text = `\n${indent}${marker}${gap}${task ? "[ ] " : ""}`;
  const caret = start + text.length;
  return { start, end, text, selectionStart: caret, selectionEnd: caret };
}

/**
 * Tab / Shift+Tab on list items: nest or un-nest every selected line.
 *
 * Only inside a list, and only where the result is still a list: Tab nests a
 * line only under an item at least as deep above it, and Shift+Tab needs an
 * indent to remove. Everywhere else this returns `null` and Tab moves focus as
 * it always does -- including from the first item of a list, which is how a
 * keyboard user leaves the field without unnesting their work.
 */
export function indentListItems(
  selection: TextSelection,
  outdent: boolean,
): TextEdit | null {
  const { value, start, end } = selection;
  const { from, to, lines } = selectedLines(selection);
  const items = lines.map((line) => LIST_ITEM.exec(line));
  if (items.some((item) => item === null)) return null;

  // A nested item sits under its parent's text, so the step is the width of
  // the marker it nests under: two for `- `, three for `1. `.
  const step = (item: RegExpExecArray) => item[2].length + 1;

  let next: string[];
  if (outdent) {
    if (items.every((item) => item![1].length === 0)) return null;
    next = lines.map((line, index) => {
      const remove = Math.min(items[index]![1].length, step(items[index]!));
      return line.slice(remove);
    });
  } else {
    const previous = LIST_ITEM.exec(
      value.slice(
        lineStartAt(value, Math.max(0, from - 1)),
        Math.max(0, from - 1),
      ),
    );
    if (from === 0 || !previous) return null;
    if (previous[1].length < items[0]![1].length) return null;
    const pad = " ".repeat(step(previous));
    next = lines.map((line) => `${pad}${line}`);
  }

  const text = next.join("\n");
  const firstDelta = next[0].length - lines[0].length;
  const totalDelta = text.length - (to - from);
  return {
    start: from,
    end: to,
    text,
    selectionStart: Math.max(from, start + firstDelta),
    selectionEnd: Math.max(from, end + totalDelta),
  };
}

/**
 * Bold (`**`) or italic (`_`): wrap the selection, or unwrap it when it is
 * already wrapped -- whether the markers are just outside the selection or the
 * first and last characters of it. Italic is `_` rather than `*` so the two
 * never read each other's markers as their own.
 *
 * Whitespace at the selection's edges (a double-clicked word often carries
 * its trailing space) stays outside the markers, where CommonMark needs it.
 */
export function toggleInline(
  selection: TextSelection,
  marker: "**" | "_",
): TextEdit {
  const { value, start, end } = selection;
  const width = marker.length;
  const selected = value.slice(start, end);

  if (
    value.slice(start - width, start) === marker &&
    value.slice(end, end + width) === marker
  ) {
    return {
      start: start - width,
      end: end + width,
      text: selected,
      selectionStart: start - width,
      selectionEnd: end - width,
    };
  }
  if (
    selected.length >= width * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(width, -width);
    return {
      start,
      end,
      text: inner,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  const lead = /^\s*/.exec(selected)![0];
  const core = selected.trim();
  const trail = selected.slice(lead.length + core.length);
  const text = `${lead}${marker}${core}${marker}${trail}`;
  const coreStart = start + lead.length + width;
  return {
    start,
    end,
    text,
    selectionStart: coreStart,
    selectionEnd: coreStart + core.length,
  };
}

/**
 * Bulleted or numbered list on the selected lines: add the marker to each
 * non-blank line (replacing the other kind's), or remove it when every line
 * already has it. Numbers run 1, 2, 3 in the order the lines appear.
 */
export function toggleList(
  selection: TextSelection,
  kind: "bullet" | "number",
): TextEdit {
  const { from, to, lines } = selectedLines(selection);
  const isKind = (line: string) => {
    const match = LIST_ITEM.exec(line);
    return match !== null && (match[3] === undefined) === (kind === "bullet");
  };
  const filled = lines.filter((line) => line.trim() !== "");
  const remove = filled.length > 0 && filled.every(isKind);

  let count = 0;
  const next = lines.map((line) => {
    if (line.trim() === "" && lines.length > 1) return line;
    const match = LIST_ITEM.exec(line);
    const indent = match ? match[1] : (/^[ \t]*/.exec(line)?.[0] ?? "");
    const body = line.slice(match ? match[0].length : indent.length);
    if (remove) return `${indent}${body}`;
    count += 1;
    return `${indent}${kind === "bullet" ? "-" : `${count}.`} ${body}`;
  });

  const text = next.join("\n");
  // A single line keeps a caret at the end of its text; several stay selected.
  const single = lines.length === 1 && selection.start === selection.end;
  const caret = from + text.length;
  return {
    start: from,
    end: to,
    text,
    selectionStart: single ? caret : from,
    selectionEnd: caret,
  };
}

/**
 * `[text](url)`, with the part still to be typed selected: the url when text
 * was selected, the text when a url was, the text when nothing was.
 */
export function insertLink(selection: TextSelection): TextEdit {
  const { value, start, end } = selection;
  const selected = value.slice(start, end);

  if (/^(https?:\/\/|mailto:)\S+$/.test(selected)) {
    const text = `[](${selected})`;
    return {
      start,
      end,
      text,
      selectionStart: start + 1,
      selectionEnd: start + 1,
    };
  }

  const label = selected === "" ? "link text" : selected;
  const url = "https://";
  const text = `[${label}](${url})`;
  if (selected === "") {
    return {
      start,
      end,
      text,
      selectionStart: start + 1,
      selectionEnd: start + 1 + label.length,
    };
  }
  const urlStart = start + label.length + 3;
  return {
    start,
    end,
    text,
    selectionStart: urlStart,
    selectionEnd: urlStart + url.length,
  };
}
