import { describe, expect, test } from "bun:test";
import {
  answerCellText,
  answerColumnLabel,
  answerColumns,
  answerFilterChoices,
  matchesAnswerFilter,
  PLACE_OTHER_FILTER,
  shownAnswerColumns,
  type StoredAnswerRow,
} from "./registration-answer-columns";
import type { RegistrationQuestion } from "./registration-questions";

function question(
  overrides: Partial<RegistrationQuestion> & Pick<RegistrationQuestion, "id">,
): RegistrationQuestion {
  return {
    kind: "short_text",
    prompt: overrides.id,
    help: null,
    column_label: null,
    required: false,
    options: [],
    min_value: null,
    max_value: null,
    show_if: null,
    ...overrides,
  };
}

// Chatter Snow's carpool questions, prompts as the tenant wrote them.
const carpool = question({
  id: "carpool",
  kind: "single_choice",
  prompt: "Do you want to carpool to this event?",
  column_label: "Carpool",
  options: [
    { id: "need", label: "Needs ride" },
    { id: "drive", label: "Can drive" },
    { id: "no", label: "No" },
  ],
});
const seatsNeeded = question({
  id: "seats-needed",
  kind: "number",
  prompt: "How many seats do you need?",
  column_label: "seats",
  show_if: { question_id: "carpool", option_ids: ["need"] },
});
const seatsOpen = question({
  id: "seats-open",
  kind: "number",
  prompt: "How many open seats to you have?",
  column_label: "seats",
  show_if: { question_id: "carpool", option_ids: ["drive"] },
});
const borough = question({
  id: "borough",
  prompt: "Which borouch/city are you coming from/leaving from?",
  column_label: "Borough",
});
const sharesInfo = question({
  id: "shares",
  kind: "consent",
  prompt: "Ok to share my name, phone, email and borough/city with 5Borough",
  column_label: "Shares info",
  show_if: { question_id: "carpool", option_ids: ["need", "drive"] },
});
const questions = [carpool, seatsNeeded, seatsOpen, borough, sharesInfo];

function row(questionId: string, value: unknown, text: string) {
  return { question_id: questionId, value, answer_text: text };
}

describe("answerColumns", () => {
  test("folds number follow-ups into their parent and keeps consent apart", () => {
    const columns = answerColumns(questions);
    expect(columns.map((column) => column.question.id)).toEqual([
      "carpool",
      "borough",
      "shares",
    ]);
    expect(columns[0].followUps.map((followUp) => followUp.id)).toEqual([
      "seats-needed",
      "seats-open",
    ]);
  });

  test("a follow-up whose parent is gone gets a column of its own", () => {
    const columns = answerColumns([seatsNeeded, borough]);
    expect(columns.map((column) => column.question.id)).toEqual([
      "seats-needed",
      "borough",
    ]);
  });
});

describe("answerCellText", () => {
  const [carpoolColumn] = answerColumns(questions);

  test("an answered follow-up reads after its parent, with its unit", () => {
    const rows: StoredAnswerRow[] = [
      row("carpool", "drive", "Can drive"),
      row("seats-open", 2, "2"),
    ];
    expect(answerCellText(carpoolColumn, rows)).toBe("Can drive · 2 seats");
  });

  test("one seat is a seat", () => {
    const rows = [
      row("carpool", "need", "Needs ride"),
      row("seats-needed", 1, "1"),
    ];
    expect(answerCellText(carpoolColumn, rows)).toBe("Needs ride · 1 seat");
  });

  test("an unanswered follow-up leaves the parent alone", () => {
    expect(
      answerCellText(carpoolColumn, [row("carpool", "need", "Needs ride")]),
    ).toBe("Needs ride");
  });

  test("an unanswered parent is an empty cell, whatever follows it", () => {
    expect(answerCellText(carpoolColumn, [])).toBeNull();
    expect(answerCellText(carpoolColumn, [row("seats-open", 2, "2")])).toBe(
      null,
    );
  });

  test("a follow-up hidden by show_if is left out", () => {
    // Answered while they could drive, then changed to needing a ride.
    const rows = [
      row("carpool", "need", "Needs ride"),
      row("seats-open", 3, "3"),
    ];
    expect(answerCellText(carpoolColumn, rows)).toBe("Needs ride");
  });

  test("a follow-up with no label reads as its bare answer", () => {
    const [column] = answerColumns([
      carpool,
      { ...seatsOpen, column_label: null },
    ]);
    expect(
      answerCellText(column, [
        row("carpool", "drive", "Can drive"),
        row("seats-open", 2, "2"),
      ]),
    ).toBe("Can drive · 2");
  });
});

describe("answerColumnLabel", () => {
  test("prefers the short label", () => {
    expect(answerColumnLabel(borough)).toBe("Borough");
  });

  test("cuts a long prompt with no label to the label's length", () => {
    const long = question({ id: "long", prompt: "x".repeat(120) });
    expect(answerColumnLabel(long)).toBe(`${"x".repeat(24)}…`);
  });

  test("cuts at a word break where there is one", () => {
    const prompt = "Which borouch/city are you coming from/leaving from?";
    expect(answerColumnLabel(question({ id: "b", prompt }))).toBe(
      "Which borouch/city are…",
    );
  });

  test("leaves a short prompt whole", () => {
    expect(answerColumnLabel(question({ id: "q", prompt: "Diet" }))).toBe(
      "Diet",
    );
  });
});

describe("shownAnswerColumns", () => {
  const columns = answerColumns([...questions, question({ id: "fourth" })]);

  test("shows the first three when nobody has picked", () => {
    expect(
      shownAnswerColumns(columns, null).map((column) => column.question.id),
    ).toEqual(["carpool", "borough", "shares"]);
  });

  test("shows the picked ones in the event's order, skipping stale ids", () => {
    expect(
      shownAnswerColumns(columns, ["fourth", "gone", "carpool"]).map(
        (column) => column.question.id,
      ),
    ).toEqual(["carpool", "fourth"]);
  });

  test("an empty pick hides them all", () => {
    expect(shownAnswerColumns(columns, [])).toEqual([]);
  });
});

describe("matchesAnswerFilter", () => {
  test("matches a single choice by option id", () => {
    const rows = [row("carpool", "drive", "Can drive")];
    expect(matchesAnswerFilter(carpool, rows, "drive")).toBe(true);
    expect(matchesAnswerFilter(carpool, rows, "need")).toBe(false);
  });

  test("matches a consent box by yes or no, and never when unanswered", () => {
    expect(
      matchesAnswerFilter(sharesInfo, [row("shares", false, "No")], "no"),
    ).toBe(true);
    expect(matchesAnswerFilter(sharesInfo, [], "no")).toBe(false);
  });

  test("matches a multiple choice that includes the option", () => {
    const multi = question({
      id: "multi",
      kind: "multi_choice",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    });
    expect(
      matchesAnswerFilter(multi, [row("multi", ["a", "b"], "A, B")], "b"),
    ).toBe(true);
  });
});

describe("place filters (#1701)", () => {
  const place = question({ id: "from", kind: "place" });
  const brooklyn = { id: "bk", label: "Brooklyn, NY" };
  const wburg: StoredAnswerRow = {
    ...row(
      "from",
      { place_id: "w", label: "Williamsburg, Brooklyn" },
      "Williamsburg, Brooklyn",
    ),
    place_region: brooklyn,
  };
  const essex: StoredAnswerRow = {
    ...row("from", { place_id: "m", label: "Montclair" }, "Montclair"),
    place_region: { id: "essex", label: "Essex County, NJ" },
  };
  const other = row("from", { other: "Somewhere" }, "Somewhere");

  test("offers the regions answered, then Not listed", () => {
    expect(answerFilterChoices(place, [[wburg], [essex], [other], []])).toEqual(
      [
        { value: "bk", label: "Brooklyn, NY" },
        { value: "essex", label: "Essex County, NJ" },
        { value: PLACE_OTHER_FILTER, label: "Not listed or other" },
      ],
    );
  });

  test("matches by region, and Not listed by having none", () => {
    expect(matchesAnswerFilter(place, [wburg], "bk")).toBe(true);
    expect(matchesAnswerFilter(place, [essex], "bk")).toBe(false);
    expect(matchesAnswerFilter(place, [other], PLACE_OTHER_FILTER)).toBe(true);
    expect(matchesAnswerFilter(place, [wburg], PLACE_OTHER_FILTER)).toBe(false);
    expect(matchesAnswerFilter(place, [], PLACE_OTHER_FILTER)).toBe(false);
  });
});
