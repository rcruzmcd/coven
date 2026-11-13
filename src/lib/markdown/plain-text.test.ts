import { describe, expect, test } from "bun:test";
import { markdownToPlainText, plainBlock, plainExcerpt } from "./plain-text";

describe("markdownToPlainText", () => {
  test("passes plain text through unchanged", () => {
    const text = "Meet at the lodge.\nBring water.\n\nSecond paragraph.";
    expect(markdownToPlainText(text)).toBe(text);
  });

  test("drops emphasis, strikethrough and code markers", () => {
    expect(markdownToPlainText("**Bold**, *italic*, ~~gone~~ and `code`")).toBe(
      "Bold, italic, gone and code",
    );
  });

  test("keeps line breaks, soft and hard", () => {
    expect(markdownToPlainText("one\ntwo  \nthree\\\nfour")).toBe(
      "one\ntwo\nthree\nfour",
    );
  });

  test("writes lists as marked lines, nested items indented", () => {
    expect(markdownToPlainText("* one\n* two\n  * deeper")).toBe(
      "- one\n- two\n  - deeper",
    );
    expect(markdownToPlainText("3. three\n4. four")).toBe("3. three\n4. four");
    expect(markdownToPlainText("- [x] done\n- [ ] open")).toBe(
      "- [x] done\n- [ ] open",
    );
  });

  test("writes a link as its text and url", () => {
    expect(markdownToPlainText("See [the bylaws](https://x.org/b).")).toBe(
      "See the bylaws (https://x.org/b).",
    );
    expect(markdownToPlainText("<https://x.org>")).toBe("https://x.org");
    expect(markdownToPlainText("a@x.org")).toBe("a@x.org");
  });

  test("writes a table as one line per row", () => {
    expect(
      markdownToPlainText(
        "| Item | Owner |\n| --- | --- |\n| Budget | Jamie |",
      ),
    ).toBe("Item | Owner\nBudget | Jamie");
  });

  test("keeps headings and quotes as their text", () => {
    expect(markdownToPlainText("# Title\n\n> quoted")).toBe("Title\n\nquoted");
  });

  test("returns an empty string for empty input", () => {
    expect(markdownToPlainText("  \n ")).toBe("");
  });
});

describe("plainBlock", () => {
  test("indents every line of the plain text, leaving blank lines blank", () => {
    expect(plainBlock("**one**\ntwo\n\n- three", "  ")).toBe(
      "  one\n  two\n\n  - three",
    );
  });

  test("is empty for empty input", () => {
    expect(plainBlock(" ", "  ")).toBe("");
  });
});

describe("plainExcerpt", () => {
  test("flattens Markdown onto one line", () => {
    expect(
      plainExcerpt("**Bring** water\n\n- helmet\n- [map](https://x.test)"),
    ).toBe("Bring water - helmet - map (https://x.test)");
  });

  test("cuts long text at a word boundary with an ellipsis", () => {
    const excerpt = plainExcerpt("word ".repeat(100), 30);
    expect(excerpt.length).toBeLessThanOrEqual(30);
    expect(excerpt).toBe("word word word word word word…");
  });

  test("is empty for empty input", () => {
    expect(plainExcerpt("  ")).toBe("");
  });
});
