/**
 * Per-event registration questions (#1501): typed questions an event asks at
 * registration, answered once per registration -- a party travels together --
 * unlike #1407's options, which are counts per person. Carpooling is Chatter
 * Snow's first use; nothing here knows what a carpool is.
 *
 * The kind vocabulary and validator are meant to be shared by any later set of
 * questions (per-person profile questions, #1409), so nothing in this module is
 * about events except the error codes.
 *
 * `apply_registration_answers()` is the authority on every rule here; the
 * checks in this module only let a form say what is wrong before the round
 * trip.
 */

export const QUESTION_KINDS = [
  "single_choice",
  "multi_choice",
  "short_text",
  "number",
  "consent",
  "place",
] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  single_choice: "Single choice",
  multi_choice: "Multiple choice",
  short_text: "Short text",
  number: "Number",
  consent: "Consent checkbox",
  place: "Place (city, town or neighborhood)",
};

export const SHORT_TEXT_MAX_LENGTH = 500;
export const QUESTION_PROMPT_MAX_LENGTH = 300;
export const QUESTION_HELP_MAX_LENGTH = 500;
export const QUESTION_COLUMN_LABEL_MAX_LENGTH = 24;
export const QUESTION_OPTION_LABEL_MAX_LENGTH = 120;
export const MAX_QUESTIONS = 20;
export const MAX_QUESTION_OPTIONS = 20;
export const PLACE_OTHER_MAX_LENGTH = 200;

/**
 * How fine a place question asks (#1699). `neighborhood` is an NYC
 * neighborhood where there is one, and a city/town everywhere else.
 */
export const PLACE_GRANULARITIES = ["locality", "neighborhood"] as const;
export type PlaceGranularity = (typeof PLACE_GRANULARITIES)[number];

export const PLACE_GRANULARITY_LABELS: Record<PlaceGranularity, string> = {
  locality: "City/town",
  neighborhood: "Neighborhood where available",
};

/** A place question's settings; null on every other kind. */
export type PlaceSettings = {
  granularity: PlaceGranularity;
  /** Whether "Not listed" with a short text is offered. */
  allow_other: boolean;
};

/**
 * A place answer: a place from the reference table with its label as shown,
 * or the text typed under "Not listed". The server re-reads the label.
 */
export type PlaceAnswer =
  { place_id: string; label: string } | { other: string };

export function isPlaceAnswer(value: unknown): value is PlaceAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  return (
    (typeof answer.place_id === "string" && typeof answer.label === "string") ||
    typeof answer.other === "string"
  );
}

export type QuestionOption = { id: string; label: string };

/** Shown only when an earlier single-choice question has one of these answers. */
export type QuestionCondition = { question_id: string; option_ids: string[] };

export type RegistrationQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  help: string | null;
  /**
   * The short name staff gave it for the registrants list (#1512). Staff-only:
   * absent where the question was read from the public view.
   */
  column_label?: string | null;
  required: boolean;
  options: QuestionOption[];
  min_value: number | null;
  max_value: number | null;
  show_if: QuestionCondition | null;
  /** A place question's settings (#1699); null or absent on other kinds. */
  place?: PlaceSettings | null;
};

/**
 * A stored answer, by kind: option id, option ids, text, number, yes/no, or a
 * place.
 */
export type AnswerValue = string | string[] | number | boolean | PlaceAnswer;

/** Question id -> answer, as the RPCs take it. Hidden and empty ones are absent. */
export type RegistrationAnswers = Record<string, AnswerValue>;

/**
 * What a form holds while it is being filled in: a string for a choice, text
 * or number field, an array for a multiple choice, a boolean for a consent box,
 * and for a place the place picked or "Not listed" text ("" while neither).
 */
export type AnswerDraftValue = string | string[] | boolean | PlaceAnswer;
export type AnswerDraft = Record<string, AnswerDraftValue>;

/** A stored answer as the portal, the email and the export read it. */
export type AnswerRow = {
  question_id: string | null;
  prompt_as_shown: string;
  answer_text: string;
  sort_order: number;
};

function isKind(value: unknown): value is QuestionKind {
  return (QUESTION_KINDS as readonly unknown[]).includes(value);
}

function toOptions(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) =>
    option &&
    typeof option === "object" &&
    typeof (option as QuestionOption).id === "string" &&
    typeof (option as QuestionOption).label === "string"
      ? [
          {
            id: (option as QuestionOption).id,
            label: (option as QuestionOption).label,
          },
        ]
      : [],
  );
}

function toCondition(value: unknown): QuestionCondition | null {
  if (!value || typeof value !== "object") return null;
  const { question_id, option_ids } = value as Partial<QuestionCondition>;
  if (typeof question_id !== "string" || !Array.isArray(option_ids)) {
    return null;
  }
  return {
    question_id,
    option_ids: option_ids.filter((id): id is string => typeof id === "string"),
  };
}

/**
 * A row from `event_registration_questions`, the public view or
 * `my_registration_questions()`, with its jsonb columns read defensively.
 * Null for a kind this build does not know, so a newer kind is skipped rather
 * than rendered as something it is not.
 */
export function toRegistrationQuestion(row: {
  id?: string | null;
  question_id?: string | null;
  kind: string | null;
  prompt: string | null;
  help?: string | null;
  column_label?: string | null;
  required?: boolean | null;
  options?: unknown;
  min_value?: number | null;
  max_value?: number | null;
  show_if?: unknown;
  place_granularity?: string | null;
  place_allow_other?: boolean | null;
}): RegistrationQuestion | null {
  const id = row.id ?? row.question_id;
  if (!id || !isKind(row.kind) || !row.prompt) return null;
  return {
    id,
    kind: row.kind,
    prompt: row.prompt,
    help: row.help ?? null,
    column_label: row.column_label ?? null,
    required: row.required === true,
    options: toOptions(row.options),
    min_value: row.min_value ?? null,
    max_value: row.max_value ?? null,
    show_if: toCondition(row.show_if),
    place:
      row.kind === "place"
        ? {
            granularity:
              row.place_granularity === "neighborhood"
                ? "neighborhood"
                : "locality",
            allow_other: row.place_allow_other !== false,
          }
        : null,
  };
}

export function isChoiceKind(kind: QuestionKind) {
  return kind === "single_choice" || kind === "multi_choice";
}

/**
 * Whether a question is shown, given the answers so far. One level deep: the
 * question a condition names is never conditional itself.
 */
export function isQuestionVisible(
  question: RegistrationQuestion,
  draft: AnswerDraft | RegistrationAnswers,
): boolean {
  if (!question.show_if) return true;
  const parent = draft[question.show_if.question_id];
  return (
    typeof parent === "string" && question.show_if.option_ids.includes(parent)
  );
}

export function visibleQuestions(
  questions: readonly RegistrationQuestion[],
  draft: AnswerDraft | RegistrationAnswers,
): RegistrationQuestion[] {
  return questions.filter((question) => isQuestionVisible(question, draft));
}

/** An empty draft: nothing chosen, nothing typed, every box unticked. */
export function emptyAnswerDraft(
  questions: readonly RegistrationQuestion[],
): AnswerDraft {
  const draft: AnswerDraft = {};
  for (const question of questions) {
    draft[question.id] =
      question.kind === "multi_choice"
        ? []
        : question.kind === "consent"
          ? false
          : "";
  }
  return draft;
}

/** A stored answer set back into a form's draft, for editing it. */
export function answersToDraft(
  questions: readonly RegistrationQuestion[],
  answers: RegistrationAnswers,
): AnswerDraft {
  const draft = emptyAnswerDraft(questions);
  for (const question of questions) {
    const value = answers[question.id];
    if (value === undefined) continue;
    if (question.kind === "multi_choice") {
      draft[question.id] = Array.isArray(value) ? value : [];
    } else if (question.kind === "consent") {
      draft[question.id] = value === true;
    } else if (question.kind === "place") {
      draft[question.id] = isPlaceAnswer(value) ? value : "";
    } else {
      draft[question.id] = Array.isArray(value) ? "" : String(value);
    }
  }
  return draft;
}

/**
 * A draft as the RPC takes it. Hidden questions and empty answers are left
 * out; a shown consent box is always sent, since unticked is the answer "no".
 * A number that is not one is sent as text for the RPC to refuse, rather than
 * silently dropped -- `answerDraftError` stops a form sending it first.
 */
export function draftToAnswers(
  questions: readonly RegistrationQuestion[],
  draft: AnswerDraft,
): RegistrationAnswers {
  const answers: RegistrationAnswers = {};
  for (const question of visibleQuestions(questions, draft)) {
    const value = draft[question.id];
    switch (question.kind) {
      case "consent":
        answers[question.id] = value === true;
        break;
      case "multi_choice":
        if (Array.isArray(value) && value.length > 0) {
          answers[question.id] = value;
        }
        break;
      case "number": {
        const raw = typeof value === "string" ? value.trim() : "";
        if (raw === "") break;
        const number = Number(raw);
        answers[question.id] = Number.isFinite(number) ? number : raw;
        break;
      }
      case "place": {
        if (!isPlaceAnswer(value)) break;
        if ("place_id" in value) {
          answers[question.id] = {
            place_id: value.place_id,
            label: value.label,
          };
        } else if (value.other.trim() !== "") {
          answers[question.id] = { other: value.other.trim() };
        }
        break;
      }
      default: {
        const raw = typeof value === "string" ? value.trim() : "";
        if (raw !== "") answers[question.id] = raw;
      }
    }
  }
  return answers;
}

function numberBounds(question: RegistrationQuestion): string {
  const { min_value: min, max_value: max } = question;
  if (min !== null && max !== null) return ` between ${min} and ${max}`;
  if (min !== null) return ` of ${min} or more`;
  if (max !== null) return ` of ${max} or less`;
  return "";
}

/**
 * The first thing wrong with a set of answers, in question order, or null.
 * `required: false` is the staff paths, which may leave anything unanswered.
 */
export function answersError(
  questions: readonly RegistrationQuestion[],
  answers: RegistrationAnswers,
  { required = true }: { required?: boolean } = {},
): { questionId: string; message: string } | null {
  for (const question of visibleQuestions(questions, answers)) {
    const value = answers[question.id];
    if (value === undefined) {
      if (required && question.required) {
        return {
          questionId: question.id,
          message: `Please answer “${question.prompt}”.`,
        };
      }
      continue;
    }
    if (question.kind === "number") {
      const ok =
        typeof value === "number" &&
        Number.isInteger(value) &&
        (question.min_value === null || value >= question.min_value) &&
        (question.max_value === null || value <= question.max_value);
      if (!ok) {
        return {
          questionId: question.id,
          message: `“${question.prompt}” needs a whole number${numberBounds(question)}.`,
        };
      }
    }
    if (
      question.kind === "short_text" &&
      typeof value === "string" &&
      value.length > SHORT_TEXT_MAX_LENGTH
    ) {
      return {
        questionId: question.id,
        message: `“${question.prompt}” can be at most ${SHORT_TEXT_MAX_LENGTH} characters.`,
      };
    }
    if (question.kind === "place" && isPlaceAnswer(value) && "other" in value) {
      if (question.place?.allow_other === false) {
        return {
          questionId: question.id,
          message: `Please pick a place for “${question.prompt}”.`,
        };
      }
      if (value.other.length > PLACE_OTHER_MAX_LENGTH) {
        return {
          questionId: question.id,
          message: `“${question.prompt}” can be at most ${PLACE_OTHER_MAX_LENGTH} characters.`,
        };
      }
    }
  }
  return null;
}

/** An answer in words, the way the server will store it in `answer_text`. */
export function answerText(
  question: RegistrationQuestion,
  value: AnswerValue | undefined,
): string | null {
  if (value === undefined) return null;
  switch (question.kind) {
    case "single_choice":
      return (
        question.options.find((option) => option.id === value)?.label ?? null
      );
    case "multi_choice": {
      const chosen = Array.isArray(value) ? value : [];
      const labels = question.options
        .filter((option) => chosen.includes(option.id))
        .map((option) => option.label);
      return labels.length > 0 ? labels.join(", ") : null;
    }
    case "consent":
      return value === true ? "Yes" : "No";
    case "place":
      if (!isPlaceAnswer(value)) return null;
      return "place_id" in value ? value.label : value.other;
    default:
      return String(value);
  }
}

/** Prompt/answer pairs for a review step, in question order. */
export function answerSummaryRows(
  questions: readonly RegistrationQuestion[],
  answers: RegistrationAnswers,
): { label: string; value: string }[] {
  return visibleQuestions(questions, answers).flatMap((question) => {
    const text = answerText(question, answers[question.id]);
    return text === null ? [] : [{ label: question.prompt, value: text }];
  });
}

/** Stored answers in the order the event asked them. */
export function sortAnswerRows<T extends AnswerRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

/** "Getting there: Need a ride; Leaving from: Burlington". */
export function formatAnswerRows(rows: readonly AnswerRow[]): string {
  return sortAnswerRows(rows)
    .map((row) => `${row.prompt_as_shown}: ${row.answer_text}`)
    .join("; ");
}

/** Stored raw values back into the shape the RPCs take. */
export function answerRowsToAnswers(
  rows: readonly { question_id: string | null; value: unknown }[],
): RegistrationAnswers {
  const answers: RegistrationAnswers = {};
  for (const row of rows) {
    if (!row.question_id) continue;
    const value = row.value;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      isPlaceAnswer(value) ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"))
    ) {
      answers[row.question_id] = value as AnswerValue;
    }
  }
  return answers;
}

/**
 * Required questions a registration has not answered -- the registrants tab's
 * "missing required answers" filter, and the follow-up for people who
 * registered before the questions existed.
 */
export function missingRequiredQuestions(
  questions: readonly RegistrationQuestion[],
  answers: RegistrationAnswers,
): RegistrationQuestion[] {
  return visibleQuestions(questions, answers).filter(
    (question) => question.required && answers[question.id] === undefined,
  );
}

/** The one form field the answers travel in, as JSON. */
export const ANSWERS_FIELD = "registrationAnswers";

export function setAnswersField(
  formData: FormData,
  answers: RegistrationAnswers,
) {
  formData.set(ANSWERS_FIELD, JSON.stringify(answers));
}

/**
 * Reads the answers back out of FormData. Null when the field was not sent --
 * an event with no questions, or a caller that did not answer -- which the RPC
 * reads as "no answers". Anything that is not a JSON object is an error: it
 * means a client that did not use this module.
 */
export function parseAnswersField(
  formData: FormData,
): { answers: RegistrationAnswers | null } | { error: string } {
  const raw = formData.get(ANSWERS_FIELD);
  if (raw === null || String(raw).trim() === "") return { answers: null };
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        error: REGISTRATION_ANSWER_ERROR_MESSAGES.EVENT_ANSWERS_INVALID,
      };
    }
    return { answers: parsed as RegistrationAnswers };
  } catch {
    return { error: REGISTRATION_ANSWER_ERROR_MESSAGES.EVENT_ANSWERS_INVALID };
  }
}

export const REGISTRATION_ANSWER_ERROR_MESSAGES: Record<string, string> = {
  EVENT_ANSWERS_REQUIRED: "Please answer the required questions.",
  EVENT_ANSWERS_INVALID:
    "One of the questions has changed since the page loaded. Reload the page and try again.",
};

/** Codes that are about something answered on the form's event step. */
export const REGISTRATION_ANSWER_ERROR_CODES = Object.keys(
  REGISTRATION_ANSWER_ERROR_MESSAGES,
);

/** What the Planning tab's editor says when a save is refused. */
export const REGISTRATION_QUESTION_ERROR_MESSAGES: Record<string, string> = {
  EVENT_QUESTIONS_INVALID:
    "One of the questions could not be saved. Check each one and try again.",
  EVENT_QUESTIONS_TOO_MANY: `An event can ask at most ${MAX_QUESTIONS} questions.`,
  EVENT_QUESTIONS_PROMPT_REQUIRED: "Every question needs a prompt.",
  EVENT_QUESTIONS_OPTIONS_INVALID:
    "Choice questions need at least two options, each with a different label.",
  EVENT_QUESTIONS_CONDITION_INVALID:
    "A condition must name an earlier single-choice question that is always shown.",
  EVENT_QUESTIONS_COLUMN_LABEL_TOO_LONG: `A column name can be at most ${QUESTION_COLUMN_LABEL_MAX_LENGTH} characters.`,
};
