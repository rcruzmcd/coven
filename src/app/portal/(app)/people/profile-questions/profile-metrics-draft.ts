import {
  MAX_METRICS,
  optionMetricKey,
  type MetricRule,
  type PersonAnswerMetric,
} from "@/lib/person-answer-metrics";
import type { PersonQuestion } from "@/lib/person-questions";

/**
 * The Metrics section's draft (#1745): one derived figure per row, saved
 * together by `save_person_answer_metrics()`.
 */
export type MetricDraft = {
  id: string;
  /** Kept as saved; set by a migration, not this editor. */
  key: string | null;
  label: string;
  rule: MetricRule;
  questionIds: string[];
  optionKeys: string[];
};

/** One option key a metric can count, across the questions it reads. */
export type MetricOptionChoice = {
  key: string;
  /** The option's label; where questions disagree, each label once. */
  label: string;
  hint: string | null;
  archived: boolean;
};

export function newMetricDraft(): MetricDraft {
  return {
    id: crypto.randomUUID(),
    key: null,
    label: "",
    rule: "any",
    questionIds: [],
    optionKeys: [],
  };
}

export function metricDrafts(
  metrics: readonly PersonAnswerMetric[],
): MetricDraft[] {
  return metrics.map((metric) => ({
    id: metric.id,
    key: metric.key,
    label: metric.label,
    rule: metric.rule,
    questionIds: [...metric.question_ids],
    optionKeys: [...metric.option_keys],
  }));
}

/** The choice questions a metric can read: current ones, plus any it already reads. */
export function metricQuestions(
  questions: readonly PersonQuestion[],
  draft: MetricDraft,
): PersonQuestion[] {
  return questions.filter(
    (question) =>
      (question.kind === "single_choice" || question.kind === "multi_choice") &&
      (question.archived_at === null ||
        draft.questionIds.includes(question.id)),
  );
}

/**
 * The option keys of the questions a metric reads, in the first question's
 * order, each key once: ski level and snowboard level both offer `beginner`,
 * and a metric counts the key, not one question's option.
 */
export function metricOptionChoices(
  questions: readonly PersonQuestion[],
  questionIds: readonly string[],
): MetricOptionChoice[] {
  const choices = new Map<string, MetricOptionChoice>();
  for (const question of questions) {
    if (!questionIds.includes(question.id)) continue;
    for (const option of question.options) {
      const key = optionMetricKey(option);
      const seen = choices.get(key);
      if (!seen) {
        choices.set(key, {
          key,
          label: option.label,
          hint: option.hint ?? null,
          archived: option.archived === true,
        });
      } else {
        if (!seen.label.split(" / ").includes(option.label)) {
          seen.label = `${seen.label} / ${option.label}`;
        }
        seen.archived = seen.archived && option.archived === true;
      }
    }
  }
  return [...choices.values()];
}

/** The draft with its questions changed, dropping keys none of them offer now. */
export function withQuestions(
  questions: readonly PersonQuestion[],
  draft: MetricDraft,
  questionIds: string[],
): MetricDraft {
  const offered = new Set(
    metricOptionChoices(questions, questionIds).map((choice) => choice.key),
  );
  return {
    ...draft,
    questionIds,
    optionKeys: draft.optionKeys.filter((key) => offered.has(key)),
  };
}

export function metricsPayload(drafts: readonly MetricDraft[]) {
  return drafts.map((draft) => ({
    id: draft.id,
    key: draft.key,
    label: draft.label.trim(),
    rule: draft.rule,
    question_ids: draft.questionIds,
    option_keys: draft.optionKeys,
  }));
}

export function sameMetrics(
  a: readonly MetricDraft[],
  b: readonly MetricDraft[],
): boolean {
  return (
    JSON.stringify(metricsPayload(a)) === JSON.stringify(metricsPayload(b))
  );
}

/** The first thing wrong with the drafts, or null; the RPC refuses the same. */
export function metricsDraftError(
  questions: readonly PersonQuestion[],
  drafts: readonly MetricDraft[],
): string | null {
  if (drafts.length > MAX_METRICS) {
    return `The organization can define at most ${MAX_METRICS} figures.`;
  }
  for (const draft of drafts) {
    if (!draft.label.trim()) return "Every figure needs a name.";
    if (draft.questionIds.length === 0) {
      return `“${draft.label.trim()}” needs at least one question to read.`;
    }
    const offered = new Set(
      metricOptionChoices(questions, draft.questionIds).map((c) => c.key),
    );
    if (
      draft.optionKeys.length === 0 ||
      draft.optionKeys.some((key) => !offered.has(key))
    ) {
      return `“${draft.label.trim()}” needs at least one answer to count.`;
    }
  }
  return null;
}
