import type { QuestionOption } from "@/lib/registration-questions";

/**
 * Tenant-defined derived figures over profile questions (#1409 section 4,
 * #1745): "Beginner participants" is a row, not code. A metric names choice
 * questions and option keys; `person_answer_metric_counts()` counts it over
 * check-in snapshots, falling back to current answers.
 */

export const METRIC_RULES = ["any", "every_answered"] as const;
export type MetricRule = (typeof METRIC_RULES)[number];

export const MAX_METRICS = 10;

export const METRIC_RULE_LABELS: Record<
  MetricRule,
  { label: string; description: string }
> = {
  any: {
    label: "Any answer matches",
    description:
      "Counts someone if any of these questions was answered with one of the chosen options.",
  },
  every_answered: {
    label: "Every answer matches",
    description:
      "Counts someone if they answered at least one of these questions, and every answer they gave is one of the chosen options.",
  },
};

export type PersonAnswerMetric = {
  id: string;
  key: string | null;
  label: string;
  rule: MetricRule;
  question_ids: string[];
  option_keys: string[];
};

/** One metric's figure from the impact RPCs. */
export type PersonAnswerMetricCount = {
  id: string;
  key: string | null;
  label: string;
  /** Checked-in attendees the metric counts, per event, summed. */
  count: number;
  /** Checked-in attendees who answered any question it reads. */
  answered: number;
};

export function isMetricRule(value: unknown): value is MetricRule {
  return (METRIC_RULES as readonly unknown[]).includes(value);
}

/** The key a metric stores for an option: its code, else its id. */
export function optionMetricKey(option: QuestionOption): string {
  return option.key?.trim() || option.id;
}

/** A `person_answer_metrics` row, or null for a rule this build does not know. */
export function toPersonAnswerMetric(row: {
  id: string;
  key: string | null;
  label: string;
  rule: string;
  question_ids: string[];
  option_keys: string[];
}): PersonAnswerMetric | null {
  if (!isMetricRule(row.rule)) return null;
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    rule: row.rule,
    question_ids: [...row.question_ids],
    option_keys: [...row.option_keys],
  };
}

/** The impact RPCs' `person_answer_metrics`, dropping anything malformed. */
export function toMetricCounts(raw: unknown): PersonAnswerMetricCount[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.label !== "string") return [];
    return [
      {
        id: row.id,
        key: typeof row.key === "string" ? row.key : null,
        label: row.label,
        count: Number(row.count) || 0,
        answered: Number(row.answered) || 0,
      },
    ];
  });
}

/** What the Metrics section says when a save is refused. */
export const PERSON_ANSWER_METRIC_ERROR_MESSAGES: Record<string, string> = {
  PERSON_ANSWER_METRICS_INVALID:
    "One of the figures could not be saved. Check each one and try again.",
  PERSON_ANSWER_METRICS_TOO_MANY: `The organization can define at most ${MAX_METRICS} figures.`,
  PERSON_ANSWER_METRICS_LABEL_REQUIRED: "Every figure needs a name.",
  PERSON_ANSWER_METRICS_KEY_INVALID:
    "A figure code is lower-case letters, digits and underscores, starting with a letter.",
  PERSON_ANSWER_METRICS_KEY_TAKEN: "Two figures have the same code.",
  PERSON_ANSWER_METRICS_QUESTIONS_INVALID:
    "Each figure must read at least one choice question. Save the questions first, then the figures.",
  PERSON_ANSWER_METRICS_OPTIONS_INVALID:
    "Each figure must count at least one option of the questions it reads.",
};
