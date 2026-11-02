import { describe, expect, test } from "bun:test";
import { profileSummary, type PersonQuestion } from "./person-questions";

function question(id: string, snapshot: boolean): PersonQuestion {
  return {
    id,
    kind: "single_choice",
    prompt: id,
    required: false,
    options: [],
    key: id,
    ask_after_registration: true,
    ask_on_my_details: true,
    snapshot_at_checkin: snapshot,
    program_ids: [],
    archived_at: null,
  } as unknown as PersonQuestion;
}

const QUESTIONS = [
  question("discipline", true),
  question("level", true),
  question("mountain", false),
];

// #1746. The Profile column's line, read the way every figure reads answers.
describe("profileSummary", () => {
  test("joins the snapshotted questions' answers, in question order", () => {
    expect(
      profileSummary(
        QUESTIONS,
        [],
        [
          { question_id: "level", answer_text: "Beginner" },
          { question_id: "discipline", answer_text: "Snowboard" },
          { question_id: "mountain", answer_text: "Hunter" },
        ],
      ),
    ).toBe("Snowboard · Beginner");
  });

  test("the check-in snapshot wins over the current answers, all or nothing", () => {
    expect(
      profileSummary(
        QUESTIONS,
        [{ question_id: "discipline", answer_text: "Skis" }],
        [
          { question_id: "discipline", answer_text: "Snowboard" },
          { question_id: "level", answer_text: "Advanced" },
        ],
      ),
    ).toBe("Skis");
  });

  test("null where there is nothing to say", () => {
    expect(profileSummary(QUESTIONS)).toBeNull();
    expect(
      profileSummary(
        QUESTIONS,
        [],
        [{ question_id: "mountain", answer_text: "Hunter" }],
      ),
    ).toBeNull();
  });
});
