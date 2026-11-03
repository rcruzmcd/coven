"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { answerColumnLabel } from "@/lib/registration-answer-columns";
import {
  MAX_METRICS,
  METRIC_RULES,
  METRIC_RULE_LABELS,
  type MetricRule,
  type PersonAnswerMetric,
} from "@/lib/person-answer-metrics";
import type { PersonQuestion } from "@/lib/person-questions";
import {
  metricDrafts,
  metricOptionChoices,
  metricQuestions,
  metricsDraftError,
  metricsPayload,
  newMetricDraft,
  sameMetrics,
  withQuestions,
  type MetricDraft,
} from "./profile-metrics-draft";
import {
  savePersonAnswerMetricsAction,
  type ProfileQuestionsActionResult,
} from "./actions";

/**
 * The page's second section (#1745): figures the Results card and the
 * Program Impact Report show, defined over saved choice questions -- "Beginner
 * participants" is a row here, not code. Saved apart from the questions,
 * since a figure can only name a question that has been saved.
 */
export function ProfileMetricsEditor({
  metrics,
  questions,
}: {
  metrics: PersonAnswerMetric[];
  /** Saved questions, current and archived. */
  questions: PersonQuestion[];
}) {
  const router = useRouter();
  const [saved] = useState(() => metricDrafts(metrics));
  const [drafts, setDrafts] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dirty = !sameMetrics(drafts, saved);
  const hasChoice = questions.some(
    (question) =>
      question.archived_at === null &&
      (question.kind === "single_choice" || question.kind === "multi_choice"),
  );

  function update(id: string, next: MetricDraft) {
    setDrafts(drafts.map((draft) => (draft.id === id ? next : draft)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = metricsDraftError(questions, drafts);
    setError(problem);
    if (problem) return;
    startTransition(async () => {
      await runAction<ProfileQuestionsActionResult>(
        () => savePersonAnswerMetricsAction(metricsPayload(drafts)),
        {
          success: "Figures saved.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Figures</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="app-muted text-sm">
            Counts of checked-in attendees shown on each event&apos;s Results
            card and on the Program Impact Report, like “Beginner participants”.
            They read the answers copied at check-in, or the current answer
            where nothing was copied. Turn on “Copy the answer at check-in” for
            each question a figure reads, so a past event&apos;s figure never
            changes when someone updates their answer.
          </p>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {!hasChoice && drafts.length === 0 ? (
            <p className="app-muted text-sm">
              Figures count answers to choice questions. Save a single or
              multiple choice question above first.
            </p>
          ) : null}

          <ul className="flex flex-col gap-4">
            {drafts.map((draft, index) => (
              <li key={draft.id} className="rounded-lg border p-4">
                <MetricFields
                  draft={draft}
                  number={index + 1}
                  questions={questions}
                  disabled={isPending}
                  onChange={(next) => update(draft.id, next)}
                  onRemove={() =>
                    setDrafts(drafts.filter((other) => other.id !== draft.id))
                  }
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending || !hasChoice || drafts.length >= MAX_METRICS}
              onClick={() => setDrafts([...drafts, newMetricDraft()])}
            >
              <Plus /> Add figure
            </Button>
            <Button type="submit" disabled={isPending || !dirty}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save figures"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function MetricFields({
  draft,
  number,
  questions,
  disabled,
  onChange,
  onRemove,
}: {
  draft: MetricDraft;
  number: number;
  questions: PersonQuestion[];
  disabled?: boolean;
  onChange: (next: MetricDraft) => void;
  onRemove: () => void;
}) {
  const id = `profile-metric-${draft.id}`;
  const readable = metricQuestions(questions, draft);
  const choices = metricOptionChoices(questions, draft.questionIds);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {draft.label.trim() || `Figure ${number}`}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Remove ${draft.label.trim() || `figure ${number}`}`}
        >
          <Trash2 /> Remove
        </Button>
      </div>

      <Field>
        <FieldLabel htmlFor={`${id}-label`}>Name</FieldLabel>
        <Input
          id={`${id}-label`}
          value={draft.label}
          maxLength={80}
          placeholder="Beginner participants"
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, label: event.target.value })
          }
        />
      </Field>

      <FieldSet>
        <FieldLegend variant="label">Questions it reads</FieldLegend>
        {readable.map((question) => {
          const questionId = `${id}-question-${question.id}`;
          return (
            <Field key={question.id} orientation="horizontal">
              <Checkbox
                id={questionId}
                checked={draft.questionIds.includes(question.id)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange(
                    withQuestions(
                      questions,
                      draft,
                      // In the page's order, whatever order they were ticked in.
                      readable
                        .map((other) => other.id)
                        .filter((other) =>
                          other === question.id
                            ? checked === true
                            : draft.questionIds.includes(other),
                        ),
                    ),
                  )
                }
              />
              <FieldLabel htmlFor={questionId}>
                {answerColumnLabel(question)}
                {question.archived_at !== null ? " (archived)" : ""}
                {!question.snapshot_at_checkin ? (
                  <span className="app-muted font-normal">
                    {" "}
                    &middot; not copied at check-in
                  </span>
                ) : null}
              </FieldLabel>
            </Field>
          );
        })}
      </FieldSet>

      {draft.questionIds.length > 0 ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-rule`}>Counts someone when</FieldLabel>
            <Select
              value={draft.rule}
              disabled={disabled}
              onValueChange={(rule) =>
                rule && onChange({ ...draft, rule: rule as MetricRule })
              }
            >
              <SelectTrigger id={`${id}-rule`} className="w-full">
                <SelectValue>
                  {(rule: MetricRule) => METRIC_RULE_LABELS[rule].label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {METRIC_RULES.map((rule) => (
                  <SelectItem key={rule} value={rule}>
                    {METRIC_RULE_LABELS[rule].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {METRIC_RULE_LABELS[draft.rule].description}
            </FieldDescription>
          </Field>

          <FieldSet>
            <FieldLegend variant="label">Answers it counts</FieldLegend>
            <FieldDescription>
              An answer two questions share, like “Beginner” on both levels, is
              one choice here.
            </FieldDescription>
            {choices.map((choice) => {
              const choiceId = `${id}-option-${choice.key}`;
              return (
                <Field key={choice.key} orientation="horizontal">
                  <Checkbox
                    id={choiceId}
                    checked={draft.optionKeys.includes(choice.key)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...draft,
                        optionKeys: choices
                          .map((other) => other.key)
                          .filter((other) =>
                            other === choice.key
                              ? checked === true
                              : draft.optionKeys.includes(other),
                          ),
                      })
                    }
                  />
                  <FieldLabel htmlFor={choiceId}>
                    {choice.label}
                    {choice.archived ? " (archived)" : ""}
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldSet>
        </>
      ) : null}
    </div>
  );
}
