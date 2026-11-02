import type { QuestionOption } from "@/lib/registration-questions";
import { answerColumnLabel } from "@/lib/registration-answer-columns";

/**
 * The event's Profile answers card (#1745), replacing the rider-only Riders
 * breakdown: registrations per option of each choice question snapshotted at
 * check-in, from `get_event_answer_breakdown()`. A question conditional on one
 * other question on the card is nested under that question's answers
 * (discipline -> level), the shape of #1701's place breakdowns.
 */

export type AnswerBreakdownQuestionRow = {
  id: string;
  kind: string;
  prompt: string;
  column_label: string | null;
  options: QuestionOption[] | null;
  parent_question_id: string | null;
};

export type AnswerBreakdownCountRow = {
  question_id: string;
  /** null is an "Other" answer. */
  option_id: string | null;
  /** The registration's answer to the parent question, where nested. */
  parent_option_id: string | null;
  registrations: number;
};

export type AnswerBreakdownData = {
  /** Registrations that were not cancelled. */
  registrations: number;
  questions: AnswerBreakdownQuestionRow[];
  counts: AnswerBreakdownCountRow[];
  /** Registrations that answered, by question id. */
  answered: Record<string, number>;
};

export type AnswerBreakdownRow = {
  id: string;
  label: string;
  registrations: number;
};

export type AnswerBreakdownGroup = {
  /** The parent option this group sits under; null for a question not nested. */
  id: string | null;
  label: string | null;
  /** The group's registrations; null where a multi choice makes a sum wrong. */
  registrations: number | null;
  rows: AnswerBreakdownRow[];
};

export type AnswerBreakdownSection = {
  questionId: string;
  heading: string;
  prompt: string;
  /** The heading of the question it is nested under, if any. */
  parentHeading: string | null;
  answered: number;
  groups: AnswerBreakdownGroup[];
};

export const OTHER_ROW_ID = "other";
const REMOVED_LABEL = "An option since removed";

function heading(question: AnswerBreakdownQuestionRow): string {
  return answerColumnLabel({
    id: question.id,
    kind: "single_choice",
    prompt: question.prompt,
    column_label: question.column_label,
    help: null,
    required: false,
    options: [],
    min_value: null,
    max_value: null,
    show_if: null,
  });
}

/**
 * Rows in the question's own order: every offered option, zeros included, so
 * a level nobody chose still reads as 0; an archived or removed option only
 * where somebody chose it; "Other" last.
 */
function rows(
  question: AnswerBreakdownQuestionRow,
  counts: readonly AnswerBreakdownCountRow[],
): AnswerBreakdownRow[] {
  const byOption = new Map<string | null, number>();
  for (const count of counts) {
    byOption.set(
      count.option_id,
      (byOption.get(count.option_id) ?? 0) + Number(count.registrations),
    );
  }
  const options = question.options ?? [];
  const known = new Set(options.map((option) => option.id));
  const listed = options.flatMap((option) => {
    const registrations = byOption.get(option.id) ?? 0;
    if (option.archived && registrations === 0) return [];
    return [{ id: option.id, label: option.label, registrations }];
  });
  const removed = [...byOption].filter(([id]) => id !== null && !known.has(id));
  const removedTotal = removed.reduce((sum, [, n]) => sum + n, 0);
  const other = byOption.get(null) ?? 0;
  return [
    ...listed,
    ...(removedTotal > 0
      ? [{ id: "removed", label: REMOVED_LABEL, registrations: removedTotal }]
      : []),
    ...(other > 0
      ? [{ id: OTHER_ROW_ID, label: "Other", registrations: other }]
      : []),
  ];
}

export function answerBreakdown(
  data: AnswerBreakdownData,
): AnswerBreakdownSection[] {
  const questions = new Map(data.questions.map((q) => [q.id, q]));

  return data.questions.map((question) => {
    const counts = data.counts.filter((c) => c.question_id === question.id);
    const parent = question.parent_question_id
      ? questions.get(question.parent_question_id)
      : undefined;
    const sumsRight = question.kind === "single_choice";

    let groups: AnswerBreakdownGroup[];
    if (!parent) {
      groups = [
        {
          id: null,
          label: null,
          registrations: null,
          rows: rows(question, counts),
        },
      ];
    } else {
      // Under each parent option somebody who answered this one chose, in
      // the parent's order; answers with no parent answer last.
      const parentIds = new Set(counts.map((c) => c.parent_option_id));
      const parentRows = rows(
        parent,
        data.counts.filter((c) => c.question_id === parent.id),
      ).filter((row) => parentIds.has(row.id === OTHER_ROW_ID ? null : row.id));
      groups = parentRows.map((parentRow) => {
        const parentOptionId =
          parentRow.id === OTHER_ROW_ID ? null : parentRow.id;
        const inGroup = counts.filter(
          (c) => c.parent_option_id === parentOptionId,
        );
        const groupRows = rows(question, inGroup);
        return {
          id: parentRow.id,
          label: parentRow.label,
          registrations: sumsRight
            ? groupRows.reduce((sum, row) => sum + row.registrations, 0)
            : null,
          rows: groupRows,
        };
      });
    }

    return {
      questionId: question.id,
      heading: heading(question),
      prompt: question.prompt,
      parentHeading: parent ? heading(parent) : null,
      answered: Number(data.answered[question.id] ?? 0),
      groups,
    };
  });
}
