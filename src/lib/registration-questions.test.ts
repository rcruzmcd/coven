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
  offeredOptions,
  parseAnswersField,
  setAnswersField,
  toCondition,
  toRegistrationQuestion,
  visibleQuestions,
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
  show_if: { any: [{ question_id: "getting", option_ids: ["drive"] }] },
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
  ).toEqual([{ id: "a", label: "A", key: null, hint: null, archived: false }]);
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

// #1742. The rider profile's park question: shown when either level, each
// conditional on the discipline, is past first time.
describe("any-of conditions over conditional questions (#1742)", () => {
  const discipline = question({
    id: "discipline",
    kind: "single_choice",
    options: [
      { id: "ski", label: "Ski" },
      { id: "board", label: "Snowboard" },
      { id: "both", label: "Both" },
    ],
  });
  const levels = [
    { id: "first", label: "First time" },
    { id: "beginner", label: "Beginner" },
    { id: "advanced", label: "Advanced" },
  ];
  const skiLevel = question({
    id: "ski_level",
    kind: "single_choice",
    options: levels,
    show_if: {
      any: [{ question_id: "discipline", option_ids: ["ski", "both"] }],
    },
  });
  const boardLevel = question({
    id: "board_level",
    kind: "single_choice",
    options: levels,
    show_if: {
      any: [{ question_id: "discipline", option_ids: ["board", "both"] }],
    },
  });
  const park = question({
    id: "park",
    kind: "short_text",
    required: true,
    show_if: {
      any: [
        { question_id: "ski_level", option_ids: ["beginner", "advanced"] },
        { question_id: "board_level", option_ids: ["beginner", "advanced"] },
      ],
    },
  });
  const PROFILE = [discipline, skiLevel, boardLevel, park];
  const shown = (answers: Record<string, string>) =>
    visibleQuestions(PROFILE, answers).map(({ id }) => id);

  test("either clause shows it", () => {
    expect(
      shown({
        discipline: "both",
        ski_level: "first",
        board_level: "advanced",
      }),
    ).toContain("park");
    expect(shown({ discipline: "ski", ski_level: "beginner" })).toContain(
      "park",
    );
    expect(
      shown({ discipline: "both", ski_level: "first", board_level: "first" }),
    ).not.toContain("park");
  });

  test("a hidden question counts as unanswered, however stale its draft", () => {
    // Snowboard only: the ski level left in the draft no longer counts.
    expect(
      shown({
        discipline: "board",
        ski_level: "advanced",
        board_level: "first",
      }),
    ).toEqual(["discipline", "board_level"]);
    expect(
      draftToAnswers(PROFILE, {
        discipline: "board",
        ski_level: "advanced",
        board_level: "first",
        park: "Yes",
      }),
    ).toEqual({ discipline: "board", board_level: "first" });
  });

  test("a required question behind a hidden chain is not required", () => {
    expect(
      answersError(PROFILE, { discipline: "ski", ski_level: "first" }),
    ).toBeNull();
    expect(
      answersError(PROFILE, { discipline: "ski", ski_level: "advanced" })
        ?.questionId,
    ).toBe("park");
  });

  test("a bare condition from before #1742 reads as a one-item any", () => {
    expect(toCondition({ question_id: "a", option_ids: ["x"] })).toEqual({
      any: [{ question_id: "a", option_ids: ["x"] }],
    });
    expect(toCondition({ any: [] })).toBeNull();
    expect(
      toCondition({
        any: [{ question_id: "a" }, { question_id: "b", option_ids: ["y", 3] }],
      }),
    ).toEqual({
      any: [{ question_id: "b", option_ids: ["y"] }],
    });
  });
});

describe("option keys, hints and archiving (#1742)", () => {
  const level = toRegistrationQuestion({
    id: "level",
    kind: "single_choice",
    prompt: "Level",
    options: [
      { id: "a", label: "First time", key: "first_time" },
      { id: "b", label: "Beginner", hint: "Linking turns on greens" },
      { id: "c", label: "Old level", archived: true },
    ],
  })!;

  test("reads key, hint and archived", () => {
    expect(level.options).toEqual([
      {
        id: "a",
        label: "First time",
        key: "first_time",
        hint: null,
        archived: false,
      },
      {
        id: "b",
        label: "Beginner",
        key: null,
        hint: "Linking turns on greens",
        archived: false,
      },
      { id: "c", label: "Old level", key: null, hint: null, archived: true },
    ]);
  });

  test("an archived option is offered only to an answer that has it", () => {
    expect(offeredOptions(level).map(({ id }) => id)).toEqual(["a", "b"]);
    expect(offeredOptions(level, ["c"]).map(({ id }) => id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("a single choice's Other (#1742)", () => {
  const mountain = question({
    id: "mountain",
    kind: "single_choice",
    prompt: "Preferred mountain",
    options: [
      { id: "hunter", label: "Hunter" },
      { id: "belleayre", label: "Belleayre" },
    ],
    allow_other: true,
  });

  test("is read only for a single choice that allows it", () => {
    expect(
      toRegistrationQuestion({
        id: "m",
        kind: "single_choice",
        prompt: "M",
        allow_other: true,
      })?.allow_other,
    ).toBe(true);
    expect(
      toRegistrationQuestion({
        id: "m",
        kind: "multi_choice",
        prompt: "M",
        allow_other: true,
      })?.allow_other,
    ).toBe(false);
  });

  test("travels as {other}, trimmed, and reads as its text", () => {
    const answers = draftToAnswers([mountain], {
      mountain: { other: "  Jay Peak " },
    });
    expect(answers).toEqual({ mountain: { other: "Jay Peak" } });
    expect(answerSummaryRows([mountain], answers)).toEqual([
      { label: "Preferred mountain", value: "Jay Peak" },
    ]);
    expect(answersToDraft([mountain], answers)).toEqual({
      mountain: { other: "Jay Peak" },
    });
    expect(draftToAnswers([mountain], { mountain: { other: "  " } })).toEqual(
      {},
    );
  });

  test("is refused where not allowed, or too long", () => {
    expect(
      answersError([{ ...mountain, allow_other: false }], {
        mountain: { other: "Jay" },
      })?.message,
    ).toContain("Please pick");
    expect(
      answersError([mountain], { mountain: { other: "x".repeat(201) } })
        ?.message,
    ).toContain("at most 200");
    expect(answersError([mountain], { mountain: { other: "Jay" } })).toBeNull();
  });

  test("does not meet a condition on the question", () => {
    const follow = question({
      id: "follow",
      show_if: { any: [{ question_id: "mountain", option_ids: ["hunter"] }] },
    });
    expect(
      visibleQuestions([mountain, follow], { mountain: { other: "hunter" } }),
    ).toEqual([mountain]);
  });
});
