import { describe, expect, test } from "bun:test";
import { normalizeSignInCode } from "./sign-in-code";

describe("normalizeSignInCode", () => {
  test("keeps the digits of a pasted code", () => {
    expect(normalizeSignInCode(" 123-456 ")).toBe("123456");
    expect(normalizeSignInCode("123 456 789")).toBe("123456");
    expect(normalizeSignInCode("abc")).toBe("");
  });
});
