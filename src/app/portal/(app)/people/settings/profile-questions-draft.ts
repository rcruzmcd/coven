import {
  newQuestionDraft,
  questionDrafts,
  questionsDraftError,
  questionsPayload,
  type QuestionDraft,
} from "@/lib/question-drafts";
import { QUESTION_OPTION_KEY_PATTERN } from "@/lib/registration-questions";
import type { PersonQuestion } from "@/lib/person-questions";

/**
 * People › People settings, the settings view beside the People list (#1760;
 * it was `/portal/people/profile-questions`, which still redirects here).
 */
export const PEOPLE_SETTINGS_PATH = "/portal/people/settings";

/**
 * The Profile questions editor's draft (#1743): #1501's shared draft plus what
 * a person question adds -- its code, its programs and where it is asked.
 */
export type PersonQuestionDraft = QuestionDraft & {
  /** The question's stable code; blank is none. */
  key: string;
  programIds: string[];
  askAfterRegistration: boolean;
  askOnMyDetails: boolean;
  /** Copy the answer onto the registration at check-in (#1745). */
  snapshotAtCheckin: boolean;
};

/** A blank question, asked in both places, for every event. */
export function newPersonQuestionDraft(): PersonQuestionDraft {
  return {
    ...newQuestionDraft(),
    key: "",
    programIds: [],
    askAfterRegistration: true,
    askOnMyDetails: true,
    snapshotAtCheckin: false,
  };
}

export function personQuestionDrafts(
  questions: readonly PersonQuestion[],
): PersonQuestionDraft[] {
  const shared = questionDrafts(questions);
  return questions.map((question, index) => ({
    ...shared[index],
    key: question.key ?? "",
    programIds: [...question.program_ids],
    askAfterRegistration: question.ask_after_registration,
    askOnMyDetails: question.ask_on_my_details,
    snapshotAtCheckin: question.snapshot_at_checkin,
  }));
}

/** The drafts as `save_person_questions()` takes them, in order. */
export function personQuestionsPayload(drafts: readonly PersonQuestionDraft[]) {
  const shared = questionsPayload(drafts);
  return drafts.map((draft, index) => {
    // Consent is not a person question kind, so its export flag never applies.
    const { shares_contact: _sharesContact, ...rest } = shared[index];
    void _sharesContact;
    return {
      ...rest,
      key: draft.key.trim() || null,
      program_ids: draft.programIds,
      ask_after_registration: draft.askAfterRegistration,
      ask_on_my_details: draft.askOnMyDetails,
      snapshot_at_checkin: draft.snapshotAtCheckin,
    };
  });
}

export function samePersonQuestions(
  a: readonly PersonQuestionDraft[],
  b: readonly PersonQuestionDraft[],
): boolean {
  return (
    JSON.stringify(personQuestionsPayload(a)) ===
    JSON.stringify(personQuestionsPayload(b))
  );
}

/** The first thing wrong with the drafts, or null; the RPC refuses the same. */
export function personQuestionsDraftError(
  drafts: readonly PersonQuestionDraft[],
): string | null {
  const shared = questionsDraftError(drafts, "The organization");
  if (shared) return shared;
  const keys = drafts.flatMap((draft) =>
    draft.key.trim() ? [draft.key.trim()] : [],
  );
  if (keys.some((key) => !QUESTION_OPTION_KEY_PATTERN.test(key))) {
    return "A question code is lower-case letters, digits and underscores, starting with a letter.";
  }
  if (new Set(keys).size !== keys.length) {
    return "Two questions have the same code.";
  }
  return null;
}

/**
 * How many changes the save bar counts (#1761): each question added, removed
 * or edited, plus one for a new order of the questions kept.
 */
export function personQuestionChanges(
  drafts: readonly PersonQuestionDraft[],
  saved: readonly PersonQuestionDraft[],
): number {
  const before = new Map(
    personQuestionsPayload(saved).map((row) => [row.id, JSON.stringify(row)]),
  );
  const after = personQuestionsPayload(drafts);
  const edited = after.filter(
    (row) => before.get(row.id) !== JSON.stringify(row),
  ).length;
  const now = new Set(after.map((row) => row.id));
  const removed = [...before.keys()].filter((id) => !now.has(id)).length;
  const keptBefore = [...before.keys()].filter((id) => now.has(id));
  const keptAfter = after.map((row) => row.id).filter((id) => before.has(id));
  const reordered = keptBefore.some((id, index) => keptAfter[index] !== id);
  return edited + removed + (reordered ? 1 : 0);
}
