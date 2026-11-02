import {
  MAX_QUESTIONS,
  QUESTION_COLUMN_LABEL_MAX_LENGTH,
  MAX_QUESTION_OPTIONS,
  QUESTION_OPTION_HINT_MAX_LENGTH,
  QUESTION_OPTION_KEY_PATTERN,
  isChoiceKind,
  type QuestionCondition,
  type QuestionKind,
  type PlaceGranularity,
  type QuestionOption,
  type RegistrationQuestion,
} from "@/lib/registration-questions";

/**
 * The draft an editor of typed questions holds (#1501), what it sends to the
 * save RPC and the checks that let it say what is wrong before the round
 * trip. Written for an event's registration questions and shared with the
 * tenant's person profile questions (#1743), which add their own fields on
 * top. Plain functions, so a server action can read what the editor writes.
 */

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
  /** Any of its clauses shows it (#1742); a clause may still be missing options. */
  showIf: QuestionCondition | null;
  sharesContact: boolean;
  /** A place question's settings (#1699), kept while the kind is another. */
  placeGranularity: PlaceGranularity;
  placeAllowOther: boolean;
  /** A single choice's "Other" (#1742), kept while the kind is another. */
  allowOther: boolean;
};

export function newOption(): QuestionOption {
  return {
    id: crypto.randomUUID(),
    label: "",
    key: null,
    hint: null,
    archived: false,
  };
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
    allowOther: false,
  };
}

export function questionDrafts(
  questions:
    | readonly (RegistrationQuestion & { shares_contact?: boolean })[]
    | undefined,
): QuestionDraft[] {
  return (questions ?? []).map((question) => ({
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    help: question.help ?? "",
    columnLabel: question.column_label ?? "",
    required: question.required,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      key: option.key ?? null,
      hint: option.hint ?? null,
      archived: option.archived === true,
    })),
    min: question.min_value === null ? "" : String(question.min_value),
    max: question.max_value === null ? "" : String(question.max_value),
    showIf: question.show_if
      ? {
          any: question.show_if.any.map((clause) => ({
            question_id: clause.question_id,
            option_ids: [...clause.option_ids],
          })),
        }
      : null,
    sharesContact: question.shares_contact === true,
    placeGranularity: question.place?.granularity ?? "locality",
    placeAllowOther: question.place?.allow_other ?? true,
    allowOther: question.allow_other === true,
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
          key: option.key?.trim() || null,
          hint: option.hint?.trim() || null,
          archived: option.archived === true,
        }))
      : [],
    min_value: draft.kind === "number" ? bound(draft.min) : null,
    max_value: draft.kind === "number" ? bound(draft.max) : null,
    show_if: draft.showIf,
    shares_contact: draft.kind === "consent" && draft.sharesContact,
    place_granularity: draft.kind === "place" ? draft.placeGranularity : null,
    place_allow_other: draft.kind !== "place" || draft.placeAllowOther,
    allow_other: draft.kind === "single_choice" && draft.allowOther,
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
  return drafts.some((draft) =>
    draft.showIf?.any.some((clause) => clause.question_id === id),
  );
}

/**
 * The questions the one at `index` may be conditional on: any earlier
 * single choice (#1742), conditional or not. Only earlier ones, so a cycle
 * cannot be made.
 */
export function conditionParents<D extends QuestionDraft>(
  drafts: readonly D[],
  index: number,
): D[] {
  return drafts
    .slice(0, index)
    .filter((draft) => draft.kind === "single_choice");
}

/**
 * Drops what an edit made impossible: a clause naming a question that was
 * removed, moved below or stopped being a single choice, and option ids that
 * are no longer among its options. A condition left with no clause is
 * dropped; a clause that loses every option stays, for the editor to ask for
 * one.
 */
export function normalizeConditions<D extends QuestionDraft>(
  drafts: readonly D[],
): D[] {
  const next: D[] = [];
  for (const draft of drafts) {
    const condition = draft.showIf;
    if (!condition) {
      next.push(draft);
      continue;
    }
    const clauses = condition.any.flatMap((clause) => {
      const parent = next.find(
        (earlier) =>
          earlier.id === clause.question_id && earlier.kind === "single_choice",
      );
      if (!parent) return [];
      const optionIds = clause.option_ids.filter((id) =>
        parent.options.some((option) => option.id === id),
      );
      return [
        optionIds.length === clause.option_ids.length
          ? clause
          : { ...clause, option_ids: optionIds },
      ];
    });
    const unchanged =
      clauses.length === condition.any.length &&
      clauses.every((clause, i) => clause === condition.any[i]);
    next.push(
      unchanged
        ? draft
        : { ...draft, showIf: clauses.length > 0 ? { any: clauses } : null },
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
  /** Who asks them, for the too-many message: "An event", "The organization". */
  owner = "An event",
): string | null {
  if (drafts.length > MAX_QUESTIONS) {
    return `${owner} can ask at most ${MAX_QUESTIONS} questions.`;
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
      if (draft.options.filter((option) => !option.archived).length < 2) {
        return `“${name}” needs at least 2 options that are not archived.`;
      }
      const keys = draft.options.flatMap((option) =>
        option.key?.trim() ? [option.key.trim()] : [],
      );
      if (keys.some((key) => !QUESTION_OPTION_KEY_PATTERN.test(key))) {
        return `Option codes of “${name}” are lower-case letters, digits and underscores, starting with a letter.`;
      }
      if (new Set(keys).size !== keys.length) {
        return `The options of “${name}” need different codes.`;
      }
      if (
        draft.options.some(
          (option) =>
            (option.hint?.trim().length ?? 0) > QUESTION_OPTION_HINT_MAX_LENGTH,
        )
      ) {
        return `An option hint of “${name}” can be at most ${QUESTION_OPTION_HINT_MAX_LENGTH} characters.`;
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
    if (draft.showIf?.any.some((clause) => clause.option_ids.length === 0)) {
      return `Pick at least one answer that shows “${name}”.`;
    }
  }
  return null;
}
