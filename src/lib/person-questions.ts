import {
  QUESTION_KINDS,
  answersError,
  toRegistrationQuestion,
  type RegistrationAnswers,
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

/**
 * One stored answer as the portal reads it (#1744): the raw value to edit,
 * and the words as shown, which every reader displays -- including answers to
 * a question or option archived since.
 */
export type PersonAnswerRow = {
  question_id: string | null;
  value: unknown;
  prompt_as_shown: string;
  answer_text: string;
};

/**
 * The form field registration step 2's profile answers travel in, beside
 * #1501's `registrationAnswers`.
 */
export const PROFILE_ANSWERS_FIELD = "profileAnswers";

/**
 * One line for a registrant's row (#1746): their answers to the questions
 * snapshotted at check-in, in question order, as of check-in where the
 * registration was snapshotted and as they stand now where it was not -- the
 * rule every figure reads (20261104120000), all or nothing per registration.
 * "Snowboard · Beginner" where Chatter Snow's Rides column said it. Null
 * where there is nothing to say.
 */
export function profileSummary(
  questions: readonly PersonQuestion[],
  snapshots: readonly {
    question_id: string | null;
    answer_text: string;
  }[] = [],
  answers: readonly { question_id: string | null; answer_text: string }[] = [],
): string | null {
  const source = snapshots.length > 0 ? snapshots : answers;
  const words = questions
    .filter((question) => question.snapshot_at_checkin)
    .flatMap((question) => {
      const answer = source.find((row) => row.question_id === question.id);
      return answer ? [answer.answer_text] : [];
    });
  return words.length > 0 ? words.join(" · ") : null;
}

/** The columns `PersonAnswerRow` reads off `person_answers`. */
export const PERSON_ANSWER_COLUMNS =
  "person_id, question_id, value, prompt_as_shown, answer_text";

/** The question columns every asking surface reads. */
export const PERSON_QUESTION_COLUMNS =
  "id, key, kind, prompt, help, column_label, required, options, allow_other, min_value, max_value, place_granularity, place_allow_other, show_if, ask_after_registration, ask_on_my_details, snapshot_at_checkin, archived_at, sort_order";

/** A refused save of answers in words, or the fallback. */
export function personAnswersErrorMessage(message: string | undefined) {
  return (
    (message && PERSON_ANSWER_ERROR_MESSAGES[message]) ??
    "Could not save these answers. Please try again."
  );
}

/** What a form answering profile questions says when a save is refused. */
export const PERSON_ANSWER_ERROR_MESSAGES: Record<string, string> = {
  PERSON_ANSWERS_REQUIRED: "Please answer the required questions.",
  PERSON_ANSWERS_INVALID:
    "One of the questions has changed since the page loaded. Reload the page and try again.",
  PERSON_ANSWERS_UNAVAILABLE:
    "These questions can no longer be answered from this page.",
};

/**
 * What is wrong with step 2's profile answers, or null (#1744). The step is
 * skippable: answering nothing is never wrong, and only a form that answers
 * something is held to `required` on the questions it shows -- the rule
 * `apply_person_answers()` applies to the registration form.
 */
export function profileAnswersError(
  questions: readonly RegistrationQuestion[],
  answers: RegistrationAnswers,
): { questionId: string; message: string } | null {
  if (Object.keys(answers).length === 0) return null;
  return answersError(questions, answers);
}
