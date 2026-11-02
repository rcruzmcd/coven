import type { Json } from "@/lib/database.types";
import {
  toRegistrationQuestion,
  type QuestionCondition,
  type RegistrationQuestion,
} from "@/lib/registration-questions";
import { questionDrafts, type QuestionDraft } from "@/lib/question-drafts";

// The draft, its payload and its checks are shared with person questions
// (#1743); re-exported so the Planning tab's importers are unchanged.
export {
  conditionParents,
  hasDependents,
  newOption,
  newQuestionDraft,
  normalizeConditions,
  questionDrafts,
  questionsDraftError,
  questionsPayload,
  sameQuestions,
  type QuestionDraft,
} from "@/lib/question-drafts";

/**
 * The Planning tab's side of an event's registration questions (#1501): the
 * saved shape staff read, the form field it travels in, and copying another
 * event's questions.
 */

/** A saved question as staff see it: the shared shape plus the export flag. */
export type EventRegistrationQuestion = RegistrationQuestion & {
  shares_contact: boolean;
};

/** The one form field the questions travel in, as JSON. */
export const REGISTRATION_QUESTIONS_FIELD = "registrationQuestions";

export function toEventRegistrationQuestion(
  row: Parameters<typeof toRegistrationQuestion>[0] & {
    shares_contact?: boolean | null;
  },
): EventRegistrationQuestion | null {
  const question = toRegistrationQuestion(row);
  return question
    ? { ...question, shares_contact: row.shares_contact === true }
    : null;
}

/**
 * Another event's questions as new drafts for this one. Every question and
 * option gets a fresh id -- the saved ids belong to the other event, and the
 * RPC refuses them -- and a condition is pointed at the copies of what it
 * named, so it survives the copy.
 */
export function copyQuestions(
  questions: readonly EventRegistrationQuestion[],
  mint: () => string = () => crypto.randomUUID(),
): QuestionDraft[] {
  const ids = new Map<string, string>();
  for (const question of questions) {
    ids.set(question.id, mint());
    for (const option of question.options) ids.set(option.id, mint());
  }
  const remap = (id: string) => ids.get(id) ?? id;
  return questionDrafts(questions).map((draft) => ({
    ...draft,
    id: remap(draft.id),
    options: draft.options.map((option) => ({
      ...option,
      id: remap(option.id),
    })),
    showIf: copyCondition(draft.showIf, ids),
  }));
}

function copyCondition(
  condition: QuestionCondition | null,
  ids: ReadonlyMap<string, string>,
): QuestionCondition | null {
  const clauses = (condition?.any ?? []).flatMap((clause) => {
    const questionId = ids.get(clause.question_id);
    return questionId
      ? [
          {
            question_id: questionId,
            option_ids: clause.option_ids.flatMap((id) => ids.get(id) ?? []),
          },
        ]
      : [];
  });
  return clauses.length > 0 ? { any: clauses } : null;
}

/**
 * Reads the field back out on the server. Null when it was not sent -- the
 * questions did not change -- so saving a budget does not rewrite them. The
 * contents are checked by the RPC; this only refuses something that is not a
 * list of questions at all.
 */
export function parseRegistrationQuestionsField(
  value: FormDataEntryValue | null,
): { data: Json[] } | { error: string } | null {
  if (value === null || String(value).trim() === "") return null;
  const invalid = {
    error: "The registration questions could not be read. Please try again.",
  };
  try {
    const parsed: unknown = JSON.parse(String(value));
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (item) => !item || typeof item !== "object" || Array.isArray(item),
      )
    ) {
      return invalid;
    }
    return { data: parsed as Json[] };
  } catch {
    return invalid;
  }
}
