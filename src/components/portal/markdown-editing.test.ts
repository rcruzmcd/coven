import { describe, expect, test } from "bun:test";
import {
  continueList,
  indentListItems,
  insertLink,
  toggleInline,
  toggleList,
  type TextEdit,
  type TextSelection,
} from "./markdown-editing";

/** `|` marks the caret, or `[` and `]` a selection. */
function at(marked: string): TextSelection {
  const cut = (text: string, at: number, width: number) =>
    text.slice(0, at) + text.slice(at + width);
  const caret = marked.indexOf("|");
  if (caret !== -1) {
    return { value: cut(marked, caret, 1), start: caret, end: caret };
  }
  const start = marked.indexOf("[[");
  const value = cut(marked, start, 2);
  const end = value.indexOf("]]");
  return { value: cut(value, end, 2), start, end };
}

/** The new value with its selection marked the same way. */
function apply({ value }: TextSelection, edit: TextEdit | null): string | null {
  if (!edit) return null;
  const next = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
  if (edit.selectionStart === edit.selectionEnd)
    return `${next.slice(0, edit.selectionStart)}|${next.slice(edit.selectionStart)}`;
  return `${next.slice(0, edit.selectionStart)}[[${next.slice(
    edit.selectionStart,
    edit.selectionEnd,
  )}]]${next.slice(edit.selectionEnd)}`;
}

const run = (marked: string, fn: (s: TextSelection) => TextEdit | null) =>
  apply(at(marked), fn(at(marked)));

describe("continueList", () => {
  test("continues a bullet list", () => {
    expect(run("- one|", continueList)).toBe("- one\n- |");
    expect(run("  * one|", continueList)).toBe("  * one\n  * |");
  });

  test("counts a numbered list up", () => {
    expect(run("1. one\n2. two|", continueList)).toBe("1. one\n2. two\n3. |");
    expect(run("9) nine|", continueList)).toBe("9) nine\n10) |");
  });

  test("continues a task list with an unchecked box", () => {
    expect(run("- [x] done|", continueList)).toBe("- [x] done\n- [ ] |");
  });

  test("ends the list on an empty item", () => {
    expect(run("- one\n- |", continueList)).toBe("- one\n|");
    expect(run("1. one\n2. |", continueList)).toBe("1. one\n|");
  });

  test("splits an item when Enter lands mid-text", () => {
    expect(run("- one|two", continueList)).toBe("- one\n- |two");
  });

  test("leaves Enter alone outside a list, before the marker, or over a selection", () => {
    expect(run("plain|", continueList)).toBeNull();
    expect(run("|- one", continueList)).toBeNull();
    expect(run("- [[one]]", continueList)).toBeNull();
    expect(run("-not a list|", continueList)).toBeNull();
  });
});

describe("indentListItems", () => {
  test("nests an item under the item above it", () => {
    expect(run("- one\n- t|wo", (s) => indentListItems(s, false))).toBe(
      "- one\n  - t|wo",
    );
    expect(run("1. one\n2. t|wo", (s) => indentListItems(s, false))).toBe(
      "1. one\n   2. t|wo",
    );
  });

  test("un-nests with Shift+Tab", () => {
    expect(run("- one\n  - t|wo", (s) => indentListItems(s, true))).toBe(
      "- one\n- t|wo",
    );
  });

  test("leaves Tab to move focus outside a list or where it cannot nest", () => {
    expect(run("plain|", (s) => indentListItems(s, false))).toBeNull();
    expect(run("- fi|rst", (s) => indentListItems(s, false))).toBeNull();
    expect(
      run("- one\n  - two\n    - th|ree", (s) => indentListItems(s, false)),
    ).toBeNull();
    expect(run("- to|p", (s) => indentListItems(s, true))).toBeNull();
  });
});

describe("toggleInline", () => {
  test("wraps the selection", () => {
    expect(run("say [[hello]]", (s) => toggleInline(s, "**"))).toBe(
      "say **[[hello]]**",
    );
    expect(run("say [[hello]]", (s) => toggleInline(s, "_"))).toBe(
      "say _[[hello]]_",
    );
  });

  test("keeps edge whitespace outside the markers", () => {
    expect(run("[[hello ]]world", (s) => toggleInline(s, "**"))).toBe(
      "**[[hello]]** world",
    );
  });

  test("unwraps markers just outside the selection", () => {
    expect(run("say **[[hello]]**", (s) => toggleInline(s, "**"))).toBe(
      "say [[hello]]",
    );
  });

  test("unwraps markers at the edges of the selection", () => {
    expect(run("say [[**hello**]]", (s) => toggleInline(s, "**"))).toBe(
      "say [[hello]]",
    );
  });

  test("inserts an empty pair around the caret", () => {
    expect(run("say |", (s) => toggleInline(s, "**"))).toBe("say **|**");
  });

  test("does not mistake bold for italic", () => {
    expect(run("**[[hello]]**", (s) => toggleInline(s, "_"))).toBe(
      "**_[[hello]]_**",
    );
  });
});

describe("toggleList", () => {
  test("bullets each selected line", () => {
    expect(run("[[one\ntwo]]", (s) => toggleList(s, "bullet"))).toBe(
      "[[- one\n- two]]",
    );
  });

  test("numbers each selected line, skipping blank ones", () => {
    expect(run("[[one\n\ntwo]]", (s) => toggleList(s, "number"))).toBe(
      "[[1. one\n\n2. two]]",
    );
  });

  test("removes the marker when every line has it", () => {
    expect(run("[[- one\n- two]]", (s) => toggleList(s, "bullet"))).toBe(
      "[[one\ntwo]]",
    );
  });

  test("switches one kind of list to the other", () => {
    expect(run("[[- one\n- two]]", (s) => toggleList(s, "number"))).toBe(
      "[[1. one\n2. two]]",
    );
  });

  test("marks the caret's line and keeps the caret at its end", () => {
    expect(run("first\nsec|ond", (s) => toggleList(s, "bullet"))).toBe(
      "first\n- second|",
    );
    expect(run("|", (s) => toggleList(s, "bullet"))).toBe("- |");
  });
});

describe("insertLink", () => {
  test("links the selected text and selects the url to type", () => {
    expect(run("see [[bylaws]]", insertLink)).toBe(
      "see [bylaws]([[https://]])",
    );
  });

  test("puts a selected url in the url and the caret in the text", () => {
    expect(run("[[https://x.org]]", insertLink)).toBe("[|](https://x.org)");
  });

  test("inserts a placeholder link with its text selected", () => {
    expect(run("|", insertLink)).toBe("[[[link text]]](https://)");
  });
});
