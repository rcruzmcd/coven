import type { Json } from "@/lib/database.types";
import {
  MAX_QUESTIONS,
  QUESTION_COLUMN_LABEL_MAX_LENGTH,
  MAX_QUESTION_OPTIONS,
  isChoiceKind,
  toRegistrationQuestion,
  type QuestionCondition,
  type QuestionKind,
  type PlaceGranularity,
  type QuestionOption,
  type RegistrationQuestion,
} from "@/lib/registration-questions";

/**
 * The Planning tab's side of an event's registration questions (#1501): the
 * draft the editor holds, what it sends to `save_event_registration_questions()`
 * and the checks that let it say what is wrong before the round trip. Plain
 * functions, so the server action can read the field the editor writes.
 */

/** A saved question as staff see it: the shared shape plus the export flag. */
export type EventRegistrationQuestion = RegistrationQuestion & {
  shares_contact: boolean;
};

export type QuestionDraft = {
  /** Minted here for a new question, so a condition can name it before it is saved. */
  id: string;
  kind: QuestionKind;
  prompt: string;
  help: string;
  /** The short name in the registrants list (#1512); blank falls back to the prompt. */
  columnLabel: string;
  required: boolean;
  /** Kept while the kind is not a choice, so switching back loses nothing. */
  options: QuestionOption[];
  /** As typed; blank is unbounded. */
  min: string;
  max: string;
  showIf: QuestionCondition | null;
  sharesContact: boolean;
  /** A place question's settings (#1699), kept while the kind is another. */
  placeGranularity: PlaceGranularity;
  placeAllowOther: boolean;
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

export function newOption(): QuestionOption {
  return { id: crypto.randomUUID(), label: "" };
}

/** A blank question; a choice starts with the two options it needs. */
export function newQuestionDraft(): QuestionDraft {
  return {
    id: crypto.randomUUID(),
    kind: "single_choice",
    prompt: "",
    help: "",
    columnLabel: "",
    required: false,
    options: [newOption(), newOption()],
    min: "",
    max: "",
    showIf: null,
    sharesContact: false,
    placeGranularity: "locality",
    placeAllowOther: true,
  };
}

export function questionDrafts(
  questions: readonly EventRegistrationQuestion[] | undefined,
): QuestionDraft[] {
  return (questions ?? []).map((question) => ({
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    help: question.help ?? "",
    columnLabel: question.column_label ?? "",
    required: question.required,
    options: question.options.map((option) => ({ ...option })),
    min: question.min_value === null ? "" : String(question.min_value),
    max: question.max_value === null ? "" : String(question.max_value),
    showIf: question.show_if
      ? {
          question_id: question.show_if.question_id,
          option_ids: [...question.show_if.option_ids],
        }
      : null,
    sharesContact: question.shares_contact,
    placeGranularity: question.place?.granularity ?? "locality",
    placeAllowOther: question.place?.allow_other ?? true,
  }));
}

function bound(value: string): number | null {
  const raw = value.trim();
  return raw === "" ? null : Number(raw);
}

/**
 * The drafts as the RPC takes them, in order. Whatever does not apply to a
 * kind is left blank here rather than trusted to the server to ignore.
 */
export function questionsPayload(drafts: readonly QuestionDraft[]) {
  return drafts.map((draft) => ({
    id: draft.id,
    kind: draft.kind,
    prompt: draft.prompt.trim(),
    help: draft.help.trim() || null,
    column_label: draft.columnLabel.trim() || null,
    required: draft.kind !== "consent" && draft.required,
    options: isChoiceKind(draft.kind)
      ? draft.options.map((option) => ({
          id: option.id,
          label: option.label.trim(),
        }))
      : [],
    min_value: draft.kind === "number" ? bound(draft.min) : null,
    max_value: draft.kind === "number" ? bound(draft.max) : null,
    show_if: draft.showIf,
    shares_contact: draft.kind === "consent" && draft.sharesContact,
    place_granularity: draft.kind === "place" ? draft.placeGranularity : null,
    place_allow_other: draft.kind !== "place" || draft.placeAllowOther,
  }));
}

/** Whether two sets of drafts would save the same thing. */
export function sameQuestions(
  a: readonly QuestionDraft[],
  b: readonly QuestionDraft[],
): boolean {
  return (
    JSON.stringify(questionsPayload(a)) === JSON.stringify(questionsPayload(b))
  );
}

/** Whether any other question is shown only for an answer to this one. */
export function hasDependents(
  drafts: readonly QuestionDraft[],
  id: string,
): boolean {
  return drafts.some((draft) => draft.showIf?.question_id === id);
}

/**
 * The questions the one at `index` may be conditional on: earlier,
 * single-choice and always shown, one level only. None for a question
 * something else already depends on, since that would make two levels.
 */
export function conditionParents(
  drafts: readonly QuestionDraft[],
  index: number,
): QuestionDraft[] {
  if (hasDependents(drafts, drafts[index].id)) return [];
  return drafts
    .slice(0, index)
    .filter((draft) => draft.kind === "single_choice" && draft.showIf === null);
}

/**
 * Drops what an edit made impossible: a condition on a question that was
 * removed, moved below, stopped being a single choice or became conditional
 * itself, and option ids that are no longer among its options. A condition
 * that loses every option stays, for the editor to ask for one.
 */
export function normalizeConditions(
  drafts: readonly QuestionDraft[],
): QuestionDraft[] {
  const next: QuestionDraft[] = [];
  for (const draft of drafts) {
    const condition = draft.showIf;
    if (!condition) {
      next.push(draft);
      continue;
    }
    const parent = next.find(
      (earlier) =>
        earlier.id === condition.question_id &&
        earlier.kind === "single_choice" &&
        earlier.showIf === null,
    );
    if (!parent) {
      next.push({ ...draft, showIf: null });
      continue;
    }
    const optionIds = condition.option_ids.filter((id) =>
      parent.options.some((option) => option.id === id),
    );
    next.push(
      optionIds.length === condition.option_ids.length
        ? draft
        : { ...draft, showIf: { ...condition, option_ids: optionIds } },
    );
  }
  return next;
}

function label(draft: QuestionDraft, index: number) {
  return draft.prompt.trim() || `Question ${index + 1}`;
}

/**
 * The first thing wrong with the drafts, in order, or null. The RPC refuses
 * the same things; this only says which question before the round trip.
 */
export function questionsDraftError(
  drafts: readonly QuestionDraft[],
): string | null {
  if (drafts.length > MAX_QUESTIONS) {
    return `An event can ask at most ${MAX_QUESTIONS} questions.`;
  }
  for (const [index, draft] of drafts.entries()) {
    const name = label(draft, index);
    if (draft.prompt.trim() === "") {
      return `Question ${index + 1} needs a prompt.`;
    }
    if (draft.columnLabel.trim().length > QUESTION_COLUMN_LABEL_MAX_LENGTH) {
      return `The column name of “${name}” can be at most ${QUESTION_COLUMN_LABEL_MAX_LENGTH} characters.`;
    }
    if (isChoiceKind(draft.kind)) {
      const labels = draft.options.map((option) =>
        option.label.trim().toLowerCase(),
      );
      if (labels.length < 2 || labels.length > MAX_QUESTION_OPTIONS) {
        return `“${name}” needs between 2 and ${MAX_QUESTION_OPTIONS} options.`;
      }
      if (labels.some((text) => text === "")) {
        return `Every option of “${name}” needs a label.`;
      }
      if (new Set(labels).size !== labels.length) {
        return `The options of “${name}” need different labels.`;
      }
    }
    if (draft.kind === "number") {
      const min = bound(draft.min);
      const max = bound(draft.max);
      if (
        (min !== null && !Number.isInteger(min)) ||
        (max !== null && !Number.isInteger(max))
      ) {
        return `The limits of “${name}” must be whole numbers.`;
      }
      if (min !== null && max !== null && min > max) {
        return `The minimum of “${name}” is above its maximum.`;
      }
    }
    if (draft.showIf && draft.showIf.option_ids.length === 0) {
      return `Pick at least one answer that shows “${name}”.`;
    }
  }
  return null;
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
    showIf:
      draft.showIf && ids.has(draft.showIf.question_id)
        ? {
            question_id: remap(draft.showIf.question_id),
            option_ids: draft.showIf.option_ids
              .filter((id) => ids.has(id))
              .map(remap),
          }
        : null,
  }));
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
