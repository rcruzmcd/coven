import {
  QUESTION_COLUMN_LABEL_MAX_LENGTH,
  answerRowsToAnswers,
  isQuestionVisible,
  type AnswerRow,
  type RegistrationQuestion,
} from "./registration-questions";

/**
 * How registration answers read in the portal's registrants list (#1512).
 *
 * One column per top-level question, headed by its short `column_label` (or
 * its prompt, cut to fit). A conditional follow-up has no column of its own:
 * its answer is folded into its parent's cell -- "Can drive · 2 seats" -- with
 * the follow-up's label as the unit. The exception is a consent follow-up,
 * whose "Yes" or "No" means nothing after another answer, so it keeps a
 * column. Full prompts and answers stay in the detail sheet and the CSV.
 */

export type AnswerColumn = {
  question: RegistrationQuestion;
  /** Shown in this column's cells after the parent's answer, in order. */
  followUps: RegistrationQuestion[];
};

/** A stored answer row with its raw value, as the registrants list holds it. */
export type StoredAnswerRow = Pick<AnswerRow, "question_id" | "answer_text"> & {
  value: unknown;
  /** A place answer's county, borough or state (#1701), where it has one. */
  place_region?: { id: string; label: string };
};

/** The place filter's choice for "Not listed" and places with no region. */
export const PLACE_OTHER_FILTER = "other";

/** How many answer columns a list shows before anybody picks. */
export const DEFAULT_ANSWER_COLUMNS = 3;

function foldsIntoParent(
  question: RegistrationQuestion,
  ids: ReadonlySet<string>,
): boolean {
  return (
    question.show_if !== null &&
    question.kind !== "consent" &&
    ids.has(question.show_if.question_id)
  );
}

/** The current questions as list columns, in the event's order. */
export function answerColumns(
  questions: readonly RegistrationQuestion[],
): AnswerColumn[] {
  const ids = new Set(questions.map((question) => question.id));
  return questions
    .filter((question) => !foldsIntoParent(question, ids))
    .map((question) => ({
      question,
      followUps: questions.filter(
        (other) =>
          foldsIntoParent(other, ids) &&
          other.show_if?.question_id === question.id,
      ),
    }));
}

/**
 * The header: the short label, else the prompt cut to the same length -- at a
 * word break where there is one past halfway.
 */
export function answerColumnLabel(question: RegistrationQuestion): string {
  const label = question.column_label?.trim();
  if (label) return label;
  const { prompt } = question;
  const max = QUESTION_COLUMN_LABEL_MAX_LENGTH;
  if (prompt.length <= max) return prompt;
  const cut = prompt.slice(0, max);
  const space = prompt[max] === " " ? max : cut.lastIndexOf(" ");
  return `${(space >= max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** "2 seats", "1 seat": the label is a unit, so it agrees with one. */
function withUnit(text: string, unit: string): string {
  const singular = text === "1" && /[^s]s$/i.test(unit);
  return `${text} ${singular ? unit.slice(0, -1) : unit}`;
}

/**
 * One cell: the parent's answer, then each shown follow-up's. Null when the
 * parent is unanswered -- a follow-up alone has nothing to qualify. A
 * follow-up whose condition the stored answers no longer meet (the parent was
 * changed after it was answered) is left out, as the form would hide it.
 */
export function answerCellText(
  column: AnswerColumn,
  rows: readonly StoredAnswerRow[],
): string | null {
  const byQuestion = new Map(
    rows.flatMap((row) => (row.question_id ? [[row.question_id, row]] : [])),
  );
  const parent = byQuestion.get(column.question.id)?.answer_text;
  if (!parent) return null;
  const answers = answerRowsToAnswers(rows);
  const parts = [parent];
  for (const followUp of column.followUps) {
    const text = byQuestion.get(followUp.id)?.answer_text;
    if (!text || !isQuestionVisible(followUp, answers)) continue;
    const unit = followUp.column_label?.trim();
    parts.push(
      unit && followUp.kind === "number" ? withUnit(text, unit) : text,
    );
  }
  return parts.join(" · ");
}

/**
 * Which columns are shown: the picked ids that still exist, in the event's
 * order, or the first few when nobody has picked.
 */
export function shownAnswerColumns(
  columns: readonly AnswerColumn[],
  picked: readonly string[] | null,
): AnswerColumn[] {
  if (picked === null) return columns.slice(0, DEFAULT_ANSWER_COLUMNS);
  const wanted = new Set(picked);
  return columns.filter((column) => wanted.has(column.question.id));
}

/** One answer a list can be narrowed to, as the URL and the menu name it. */
export type AnswerFilterChoice = { value: string; label: string };

/**
 * What a column can be filtered by: a choice question's options, a consent
 * box's two answers, or for a place question (#1701) the counties, boroughs
 * and states the registrations in `answered` came from, then Not listed. Null
 * for free text and numbers, which have no short list of answers to pick from.
 */
export function answerFilterChoices(
  question: RegistrationQuestion,
  answered: readonly (readonly StoredAnswerRow[])[] = [],
): AnswerFilterChoice[] | null {
  switch (question.kind) {
    case "place": {
      const regions = new Map<string, string>();
      for (const rows of answered) {
        const region = rows.find(
          (row) => row.question_id === question.id,
        )?.place_region;
        if (region) regions.set(region.id, region.label);
      }
      return [
        ...[...regions]
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        { value: PLACE_OTHER_FILTER, label: "Not listed or other" },
      ];
    }
    case "single_choice":
    case "multi_choice":
      return question.options.map((option) => ({
        value: option.id,
        label: option.label,
      }));
    case "consent":
      return [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ];
    default:
      return null;
  }
}

/** Whether a registration gave `value` to `question`; unanswered never does. */
export function matchesAnswerFilter(
  question: RegistrationQuestion,
  rows: readonly StoredAnswerRow[],
  value: string,
): boolean {
  if (question.kind === "place") {
    const row = rows.find((answer) => answer.question_id === question.id);
    if (!row) return false;
    return value === PLACE_OTHER_FILTER
      ? !row.place_region
      : row.place_region?.id === value;
  }
  const stored = answerRowsToAnswers(rows)[question.id];
  if (stored === undefined) return false;
  if (question.kind === "consent") return stored === (value === "yes");
  return Array.isArray(stored) ? stored.includes(value) : stored === value;
}
