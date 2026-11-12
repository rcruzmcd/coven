import { describe, expect, test } from "bun:test";
import { withHardLineBreaks } from "./hard-line-breaks";

describe("withHardLineBreaks", () => {
  test("ends each line of a paragraph with a hard break (#1871)", () => {
    expect(
      withHardLineBreaks(
        "Motion passed 4-0\nTreasurer to send report\nNext meeting in March",
      ),
    ).toBe(
      "Motion passed 4-0\\\nTreasurer to send report\\\nNext meeting in March",
    );
  });

  test("leaves paragraph breaks, lists and tables alone", () => {
    const source =
      "First paragraph\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(withHardLineBreaks(source)).toBe(source);
  });

  test("leaves fenced code and inline code alone", () => {
    const source = "```\nline one\nline two\n```";
    expect(withHardLineBreaks(source)).toBe(source);
  });

  test("breaks a lazy continuation line inside a list item", () => {
    expect(withHardLineBreaks("- Budget\napproved")).toBe(
      "- Budget\\\napproved",
    );
  });

  test("breaks inside emphasis and replaces trailing spaces", () => {
    expect(withHardLineBreaks("**one \ntwo**")).toBe("**one\\\ntwo**");
  });

  test("keeps an existing hard break as it is", () => {
    expect(withHardLineBreaks("one  \ntwo")).toBe("one  \ntwo");
    expect(withHardLineBreaks("one\\\ntwo")).toBe("one\\\ntwo");
  });

  test("keeps CRLF line endings", () => {
    expect(withHardLineBreaks("one\r\ntwo")).toBe("one\\\r\ntwo");
  });

  test("returns text without line breaks unchanged", () => {
    expect(withHardLineBreaks("")).toBe("");
    expect(withHardLineBreaks("Just one line")).toBe("Just one line");
  });
});
