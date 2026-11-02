import {
  QUESTION_KINDS,
  toRegistrationQuestion,
  type RegistrationQuestion,
} from "@/lib/registration-questions";

/**
 * Per-tenant person profile questions (#1409, #1743): questions a tenant asks
 * about a person, answered once per person and kept current. They share
 * #1501's kinds, options, conditions and validator (`registration-questions.ts`)
 * and differ in owner, cardinality and where they are asked.
 *
 * `apply_person_answers()` is the authority on every answer rule, and
 * `save_person_questions()` on every question rule; this module only reads
 * their rows and words their refusals.
 */

/** #1501's kinds less consent: a per-person consent is a standing permission with its own legal basis (#1318). */
export const PERSON_QUESTION_KINDS = QUESTION_KINDS.filter(
  (kind) => kind !== "consent",
);

export type PersonQuestion = RegistrationQuestion & {
  /** A stable slug unique in the tenant, for migrations, metrics and the API. */
  key: string | null;
  ask_after_registration: boolean;
  ask_on_my_details: boolean;
  snapshot_at_checkin: boolean;
  /** The programs it is asked after registering in; empty is every event. */
  program_ids: string[];
  archived_at: string | null;
};

type PersonQuestionRow = Parameters<typeof toRegistrationQuestion>[0] & {
  key?: string | null;
  ask_after_registration?: boolean | null;
  ask_on_my_details?: boolean | null;
  snapshot_at_checkin?: boolean | null;
  archived_at?: string | null;
};

/** A `person_questions` row with its scopes, or null for a kind this build does not know. */
export function toPersonQuestion(
  row: PersonQuestionRow,
  programIds: readonly string[] = [],
): PersonQuestion | null {
  const question = toRegistrationQuestion(row);
  if (!question || question.kind === "consent") return null;
  return {
    ...question,
    key: row.key ?? null,
    ask_after_registration: row.ask_after_registration === true,
    ask_on_my_details: row.ask_on_my_details === true,
    snapshot_at_checkin: row.snapshot_at_checkin === true,
    program_ids: [...programIds],
    archived_at: row.archived_at ?? null,
  };
}

/** What the Profile questions editor says when a save is refused. */
export const PERSON_QUESTION_ERROR_MESSAGES: Record<string, string> = {
  PERSON_QUESTIONS_INVALID:
    "One of the questions could not be saved. Check each one and try again.",
  PERSON_QUESTIONS_TOO_MANY:
    "The organization can ask at most 20 profile questions.",
  PERSON_QUESTIONS_PROMPT_REQUIRED: "Every question needs a prompt.",
  PERSON_QUESTIONS_OPTIONS_INVALID:
    "Choice questions need at least two options still offered, each with a different label, and option codes must be different lower-case words.",
  PERSON_QUESTIONS_CONDITION_INVALID:
    "A condition must name earlier single-choice questions, each once, and some of their options.",
  PERSON_QUESTIONS_COLUMN_LABEL_TOO_LONG:
    "A column name can be at most 24 characters.",
  PERSON_QUESTIONS_KEY_INVALID:
    "A question code is lower-case letters, digits and underscores, starting with a letter.",
  PERSON_QUESTIONS_KEY_TAKEN:
    "Two questions have the same code, or an archived question still uses it.",
  PERSON_QUESTIONS_SCOPE_INVALID:
    "One of the programs a question is limited to no longer exists. Reload the page and try again.",
  PERSON_QUESTIONS_KIND_LOCKED:
    "A question people have answered keeps its answer type. Remove it (it is archived with its answers) and add a new one instead.",
  PERSON_QUESTIONS_OPTION_IN_USE:
    "An option people have chosen can't be removed. Archive it instead.",
};

/** What a form answering profile questions says when a save is refused. */
export const PERSON_ANSWER_ERROR_MESSAGES: Record<string, string> = {
  PERSON_ANSWERS_REQUIRED: "Please answer the required questions.",
  PERSON_ANSWERS_INVALID:
    "One of the questions has changed since the page loaded. Reload the page and try again.",
  PERSON_ANSWERS_UNAVAILABLE:
    "These questions can no longer be answered from this page.",
};
