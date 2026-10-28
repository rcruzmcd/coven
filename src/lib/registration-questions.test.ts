import { describe, expect, test } from "bun:test";
import {
  answerRowsToAnswers,
  answerSummaryRows,
  answersError,
  answersToDraft,
  draftToAnswers,
  emptyAnswerDraft,
  formatAnswerRows,
  missingRequiredQuestions,
  parseAnswersField,
  setAnswersField,
  toRegistrationQuestion,
  type RegistrationQuestion,
} from "./registration-questions";

function question(
  overrides: Partial<RegistrationQuestion> & Pick<RegistrationQuestion, "id">,
): RegistrationQuestion {
  return {
    kind: "short_text",
    prompt: overrides.id,
    help: null,
    required: false,
    options: [],
    min_value: null,
    max_value: null,
    show_if: null,
    ...overrides,
  };
}

// Chatter Snow's carpool questions, the first use.
const gettingThere = question({
  id: "getting",
  kind: "single_choice",
  prompt: "Getting there",
  required: true,
  options: [
    { id: "drive", label: "Driving, can offer seats" },
    { id: "ride", label: "Need a ride" },
    { id: "own", label: "Making my own way" },
  ],
});
const seats = question({
  id: "seats",
  kind: "number",
  prompt: "Seats available",
  required: true,
  min_value: 1,
  max_value: 7,
  show_if: { question_id: "getting", option_ids: ["drive"] },
});
const leavingFrom = question({ id: "from", prompt: "Leaving from" });
const share = question({
  id: "share",
  kind: "consent",
  prompt: "OK to share my name and contact with the partner",
});
const QUESTIONS = [gettingThere, seats, leavingFrom, share];

describe("draftToAnswers", () => {
  test("an empty draft sends only the consent box, as a no", () => {
    expect(draftToAnswers(QUESTIONS, emptyAnswerDraft(QUESTIONS))).toEqual({
      share: false,
    });
  });

  test("a hidden question's answer is dropped", () => {
    const draft = {
      ...emptyAnswerDraft(QUESTIONS),
      getting: "ride",
      seats: "3",
      from: "  Burlington ",
    };
    expect(draftToAnswers(QUESTIONS, draft)).toEqual({
      getting: "ride",
      from: "Burlington",
      share: false,
    });
  });

  test("a shown number is sent as a number", () => {
    const draft = {
      ...emptyAnswerDraft(QUESTIONS),
      getting: "drive",
      seats: "3",
      share: true,
    };
    expect(draftToAnswers(QUESTIONS, draft)).toEqual({
      getting: "drive",
      seats: 3,
      share: true,
    });
  });

  test("round-trips through answersToDraft", () => {
    const answers = { getting: "drive", seats: 2, share: true };
    expect(
      draftToAnswers(QUESTIONS, answersToDraft(QUESTIONS, answers)),
    ).toEqual(answers);
  });
});

describe("answersError", () => {
  test("a visible required question left unanswered", () => {
    expect(answersError(QUESTIONS, {})?.questionId).toBe("getting");
    expect(answersError(QUESTIONS, { getting: "drive" })?.questionId).toBe(
      "seats",
    );
  });

  test("a hidden required question is not required", () => {
    expect(answersError(QUESTIONS, { getting: "own" })).toBeNull();
  });

  test("staff are not held to required", () => {
    expect(answersError(QUESTIONS, {}, { required: false })).toBeNull();
  });

  test("a number outside the bounds, or not whole", () => {
    for (const value of [0, 8, 2.5]) {
      expect(
        answersError(QUESTIONS, { getting: "drive", seats: value })?.message,
      ).toContain("between 1 and 7");
    }
  });
});

test("missingRequiredQuestions follows the conditions", () => {
  expect(missingRequiredQuestions(QUESTIONS, {}).map((q) => q.id)).toEqual([
    "getting",
  ]);
  expect(
    missingRequiredQuestions(QUESTIONS, { getting: "drive" }).map((q) => q.id),
  ).toEqual(["seats"]);
});

test("answerSummaryRows reads choices as their labels", () => {
  expect(
    answerSummaryRows(QUESTIONS, { getting: "drive", seats: 3, share: true }),
  ).toEqual([
    { label: "Getting there", value: "Driving, can offer seats" },
    { label: "Seats available", value: "3" },
    {
      label: "OK to share my name and contact with the partner",
      value: "Yes",
    },
  ]);
});

test("formatAnswerRows uses the stored words, in the event's order", () => {
  expect(
    formatAnswerRows([
      {
        question_id: "b",
        prompt_as_shown: "Leaving from",
        answer_text: "Burlington",
        sort_order: 2,
      },
      {
        question_id: null,
        prompt_as_shown: "Getting there",
        answer_text: "Need a ride",
        sort_order: 0,
      },
    ]),
  ).toBe("Getting there: Need a ride; Leaving from: Burlington");
});

test("answerRowsToAnswers keeps well-formed values only", () => {
  expect(
    answerRowsToAnswers([
      { question_id: "a", value: "x" },
      { question_id: "b", value: ["x", "y"] },
      { question_id: "c", value: { nope: true } },
      { question_id: null, value: "archived" },
    ]),
  ).toEqual({ a: "x", b: ["x", "y"] });
});

describe("the form field", () => {
  test("round-trips through FormData", () => {
    const formData = new FormData();
    setAnswersField(formData, { getting: "drive", seats: 2 });
    expect(parseAnswersField(formData)).toEqual({
      answers: { getting: "drive", seats: 2 },
    });
  });

  test("absent is no answers, and garbage is refused", () => {
    expect(parseAnswersField(new FormData())).toEqual({ answers: null });
    for (const raw of ["not json", "[]", "3"]) {
      const formData = new FormData();
      formData.set("registrationAnswers", raw);
      expect(parseAnswersField(formData)).toHaveProperty("error");
    }
  });
});

test("toRegistrationQuestion skips a kind it does not know", () => {
  expect(
    toRegistrationQuestion({ id: "x", kind: "file_upload", prompt: "Upload" }),
  ).toBeNull();
  expect(
    toRegistrationQuestion({
      question_id: "y",
      kind: "single_choice",
      prompt: "Pick",
      options: [{ id: "a", label: "A" }, { bad: true }],
      show_if: null,
    })?.options,
  ).toEqual([{ id: "a", label: "A" }]);
});

// #1699
describe("place questions", () => {
  const from = question({
    id: "from",
    kind: "place",
    prompt: "Where are you coming from?",
    required: true,
    place: { granularity: "locality", allow_other: true },
  });
  const strict = question({
    id: "strict",
    kind: "place",
    prompt: "Neighborhood",
    place: { granularity: "neighborhood", allow_other: false },
  });
  const brooklyn = {
    place_id: "db302e7c-2238-5829-ab07-ecbc3c244d11",
    label: "Brooklyn, NY",
  };

  test("reads its settings off the row, defaulting to city/town with Not listed", () => {
    expect(
      toRegistrationQuestion({ id: "q", kind: "place", prompt: "From" })?.place,
    ).toEqual({ granularity: "locality", allow_other: true });
    expect(
      toRegistrationQuestion({
        id: "q",
        kind: "place",
        prompt: "From",
        place_granularity: "neighborhood",
        place_allow_other: false,
      })?.place,
    ).toEqual({ granularity: "neighborhood", allow_other: false });
    expect(
      toRegistrationQuestion({ id: "q", kind: "short_text", prompt: "Notes" })
        ?.place,
    ).toBeNull();
  });

  test("sends a picked place, and Not listed only with text", () => {
    expect(draftToAnswers([from], { from: brooklyn })).toEqual({
      from: brooklyn,
    });
    expect(
      draftToAnswers([from], { from: { other: "  Hoboken-ish " } }),
    ).toEqual({ from: { other: "Hoboken-ish" } });
    expect(draftToAnswers([from], { from: { other: "  " } })).toEqual({});
    expect(draftToAnswers([from], { from: "" })).toEqual({});
  });

  test("is required like any other kind", () => {
    expect(answersError([from], {})?.questionId).toBe("from");
    expect(answersError([from], { from: brooklyn })).toBeNull();
  });

  test("refuses Not listed where it is off, and text over 200 characters", () => {
    expect(answersError([strict], { strict: { other: "Somewhere" } })).toEqual({
      questionId: "strict",
      message: "Please pick a place for “Neighborhood”.",
    });
    expect(
      answersError([from], { from: { other: "x".repeat(201) } })?.questionId,
    ).toBe("from");
  });

  test("reads back in words and into a draft", () => {
    expect(answerSummaryRows([from], { from: brooklyn })).toEqual([
      { label: "Where are you coming from?", value: "Brooklyn, NY" },
    ]);
    expect(answerSummaryRows([from], { from: { other: "Hoboken" } })).toEqual([
      { label: "Where are you coming from?", value: "Hoboken" },
    ]);
    const answers = answerRowsToAnswers([
      { question_id: "from", value: brooklyn },
    ]);
    expect(answers).toEqual({ from: brooklyn });
    expect(answersToDraft([from], answers)).toEqual({ from: brooklyn });
    expect(emptyAnswerDraft([from])).toEqual({ from: "" });
  });
});
