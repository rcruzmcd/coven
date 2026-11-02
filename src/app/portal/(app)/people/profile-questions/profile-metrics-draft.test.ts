import { describe, expect, test } from "bun:test";
import type { PersonQuestion } from "@/lib/person-questions";
import {
  metricOptionChoices,
  metricQuestions,
  metricsDraftError,
  newMetricDraft,
  withQuestions,
} from "./profile-metrics-draft";

function question(
  id: string,
  options: PersonQuestion["options"],
  extra: Partial<PersonQuestion> = {},
): PersonQuestion {
  return {
    id,
    kind: "single_choice",
    prompt: id,
    help: null,
    required: false,
    options,
    min_value: null,
    max_value: null,
    show_if: null,
    key: null,
    ask_after_registration: true,
    ask_on_my_details: true,
    snapshot_at_checkin: true,
    program_ids: [],
    archived_at: null,
    ...extra,
  };
}

const ski = question("ski", [
  { id: "s1", key: "first_time", label: "First time on skis" },
  { id: "s2", key: "beginner", label: "Beginner" },
]);
const board = question("board", [
  { id: "b1", key: "first_time", label: "First time on a snowboard" },
  { id: "b2", key: "beginner", label: "Beginner" },
  { id: "b3", label: "No code" },
]);
const household = question("household", [], { kind: "number" });
const retired = question("retired", [{ id: "r1", label: "R" }], {
  archived_at: "2026-11-01T00:00:00Z",
});

describe("metric drafts", () => {
  test("a key two questions share is one choice, its labels joined", () => {
    expect(metricOptionChoices([ski, board], ["ski", "board"])).toEqual([
      {
        key: "first_time",
        label: "First time on skis / First time on a snowboard",
        hint: null,
        archived: false,
      },
      { key: "beginner", label: "Beginner", hint: null, archived: false },
      { key: "b3", label: "No code", hint: null, archived: false },
    ]);
  });

  test("only choice questions, and an archived one only if already read", () => {
    const draft = newMetricDraft();
    const all = [ski, household, retired];
    expect(metricQuestions(all, draft).map((q) => q.id)).toEqual(["ski"]);
    expect(
      metricQuestions(all, { ...draft, questionIds: ["retired"] }).map(
        (q) => q.id,
      ),
    ).toEqual(["ski", "retired"]);
  });

  test("dropping a question drops the keys only it offered", () => {
    const draft = {
      ...newMetricDraft(),
      questionIds: ["ski", "board"],
      optionKeys: ["beginner", "b3"],
    };
    expect(withQuestions([ski, board], draft, ["ski"]).optionKeys).toEqual([
      "beginner",
    ]);
  });

  test("a figure needs a name, a question and an answer to count", () => {
    const draft = newMetricDraft();
    expect(metricsDraftError([ski], [draft])).toBe(
      "Every figure needs a name.",
    );
    const named = { ...draft, label: "Beginners" };
    expect(metricsDraftError([ski], [named])).toContain("question");
    expect(
      metricsDraftError([ski], [{ ...named, questionIds: ["ski"] }]),
    ).toContain("answer");
    expect(
      metricsDraftError(
        [ski],
        [{ ...named, questionIds: ["ski"], optionKeys: ["beginner"] }],
      ),
    ).toBeNull();
  });
});
