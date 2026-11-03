import { describe, expect, test } from "bun:test";
import {
  newPersonQuestionDraft,
  personQuestionChanges,
} from "./profile-questions-draft";

const a = { ...newPersonQuestionDraft(), prompt: "Home mountain" };
const b = { ...newPersonQuestionDraft(), prompt: "Ski level" };

describe("personQuestionChanges", () => {
  test("is zero when nothing would save differently", () => {
    expect(personQuestionChanges([a, b], [a, b])).toBe(0);
    expect(
      personQuestionChanges([{ ...a, prompt: " Home mountain " }], [a]),
    ).toBe(0);
  });

  test("counts each question added, removed or edited", () => {
    const c = newPersonQuestionDraft();
    expect(personQuestionChanges([{ ...a, required: true }, c], [a, b])).toBe(
      3,
    );
  });

  test("counts a new order as one change, beside any edits", () => {
    expect(personQuestionChanges([b, a], [a, b])).toBe(1);
    expect(personQuestionChanges([b, { ...a, required: true }], [a, b])).toBe(
      2,
    );
    // Appending or dropping one is not a reorder.
    expect(personQuestionChanges([b], [a, b])).toBe(1);
  });
});
