"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
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
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MAX_QUESTIONS,
  MAX_QUESTION_OPTIONS,
  PLACE_GRANULARITIES,
  PLACE_GRANULARITY_LABELS,
  QUESTION_COLUMN_LABEL_MAX_LENGTH,
  QUESTION_HELP_MAX_LENGTH,
  QUESTION_KINDS,
  QUESTION_KIND_LABELS,
  QUESTION_OPTION_LABEL_MAX_LENGTH,
  QUESTION_PROMPT_MAX_LENGTH,
  isChoiceKind,
  type PlaceGranularity,
  type QuestionKind,
} from "@/lib/registration-questions";
import {
  listEventOptionsAction,
  listCopyableRegistrationQuestionsAction,
  type EventOption,
} from "./actions";
import {
  conditionParents,
  copyQuestions,
  hasDependents,
  newOption,
  newQuestionDraft,
  normalizeConditions,
  type QuestionDraft,
} from "./registration-questions-draft";

/** The condition picker's value for a question that is always shown. */
const ALWAYS = "always";

/**
 * An event's registration questions (#1501), edited on the Planning tab under
 * the #1407 options question and saved with the rest of the tab. Unlike those
 * options, there is no tenant default copied onto new events: questions are
 * specific to an event (and often to a partner running part of it), so the
 * reuse path is "Copy from another event" here, which staff review and save
 * like anything typed in by hand.
 */
export function RegistrationQuestionsEditor({
  eventId,
  value,
  onChange,
  disabled,
}: {
  eventId: string;
  value: QuestionDraft[];
  onChange: (value: QuestionDraft[]) => void;
  disabled?: boolean;
}) {
  // Every change goes through here, so a condition an edit made impossible is
  // dropped at once rather than refused on save.
  function setQuestions(next: QuestionDraft[]) {
    onChange(normalizeConditions(next));
  }

  function update(index: number, patch: Partial<QuestionDraft>) {
    setQuestions(
      value.map((question, i) =>
        i === index ? { ...question, ...patch } : question,
      ),
    );
  }

  function move(index: number, by: -1 | 1) {
    const next = [...value];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    setQuestions(next);
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">Registration questions</FieldLegend>
      <FieldDescription>
        Optional. Asked once per registration, after the details above. Removing
        a question someone has already answered archives it, so their answers
        stay on the registration; a question nobody has answered is deleted.
      </FieldDescription>

      {value.length > 0 && (
        <ol className="flex flex-col gap-3">
          {value.map((question, index) => (
            <QuestionCard
              key={question.id}
              questions={value}
              index={index}
              disabled={disabled}
              onUpdate={(patch) => update(index, patch)}
              onMove={(by) => move(index, by)}
              onRemove={() => setQuestions(value.filter((_, i) => i !== index))}
            />
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || value.length >= MAX_QUESTIONS}
          onClick={() => setQuestions([...value, newQuestionDraft()])}
        >
          <Plus /> Add question
        </Button>
        <CopyQuestionsDialog
          eventId={eventId}
          disabled={disabled}
          onCopy={(copied) => setQuestions([...value, ...copied])}
        />
      </div>
    </FieldSet>
  );
}

function IconAction({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function QuestionCard({
  questions,
  index,
  disabled,
  onUpdate,
  onMove,
  onRemove,
}: {
  questions: QuestionDraft[];
  index: number;
  disabled?: boolean;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const question = questions[index];
  const number = index + 1;
  const id = `planning-question-${question.id}`;

  function changeKind(kind: QuestionKind) {
    // A choice needs two options; give a question that never had any the two
    // blanks a new one starts with.
    onUpdate(
      isChoiceKind(kind) && question.options.length === 0
        ? { kind, options: [newOption(), newOption()] }
        : { kind },
    );
  }

  function updateOption(optionId: string, label: string) {
    onUpdate({
      options: question.options.map((option) =>
        option.id === optionId ? { ...option, label } : option,
      ),
    });
  }

  return (
    <li className="flex flex-col gap-4 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-medium">Question {number}</span>
        <IconAction
          label={`Move question ${number} up`}
          icon={<ArrowUp />}
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
        />
        <IconAction
          label={`Move question ${number} down`}
          icon={<ArrowDown />}
          disabled={disabled || index === questions.length - 1}
          onClick={() => onMove(1)}
        />
        <IconAction
          label={`Remove question ${number}`}
          icon={<Trash2 />}
          disabled={disabled}
          onClick={onRemove}
        />
      </div>

      <Field>
        <FieldLabel htmlFor={`${id}-prompt`} required>
          Prompt
        </FieldLabel>
        <Input
          id={`${id}-prompt`}
          value={question.prompt}
          maxLength={QUESTION_PROMPT_MAX_LENGTH}
          required
          disabled={disabled}
          onChange={(event) => onUpdate({ prompt: event.target.value })}
        />
      </Field>

      {/* #1512. The prompt is a sentence; the registrants list needs a word
          or two to head a column with. */}
      <Field>
        <FieldLabel htmlFor={`${id}-column-label`}>
          Column name in the registrants list
        </FieldLabel>
        <Input
          id={`${id}-column-label`}
          value={question.columnLabel}
          maxLength={QUESTION_COLUMN_LABEL_MAX_LENGTH}
          placeholder="Optional"
          disabled={disabled}
          aria-describedby={`${id}-column-label-description`}
          onChange={(event) => onUpdate({ columnLabel: event.target.value })}
        />
        <FieldDescription id={`${id}-column-label-description`}>
          {question.showIf && question.kind !== "consent"
            ? "A follow-up shows in the column of the question it depends on, after its answer. For a number, this is its unit, like “seats”."
            : "A word or two, like “Carpool”. Left blank, the list shows the start of the prompt."}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${id}-kind`}>Answer type</FieldLabel>
        <Select
          value={question.kind}
          disabled={disabled}
          onValueChange={(kind) => kind && changeKind(kind as QuestionKind)}
        >
          <SelectTrigger id={`${id}-kind`} className="w-full">
            <SelectValue>
              {(kind: QuestionKind) => QUESTION_KIND_LABELS[kind]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {QUESTION_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {QUESTION_KIND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${id}-help`}>Help text</FieldLabel>
        <Input
          id={`${id}-help`}
          value={question.help}
          maxLength={QUESTION_HELP_MAX_LENGTH}
          placeholder="Optional"
          disabled={disabled}
          onChange={(event) => onUpdate({ help: event.target.value })}
        />
      </Field>

      {isChoiceKind(question.kind) && (
        <FieldSet>
          <FieldLegend variant="label">Options</FieldLegend>
          <ol className="flex flex-col gap-2">
            {question.options.map((option, optionIndex) => (
              <li key={option.id} className="flex items-center gap-2">
                <Input
                  id={`${id}-option-${option.id}`}
                  aria-label={`Question ${number} option ${optionIndex + 1}`}
                  value={option.label}
                  maxLength={QUESTION_OPTION_LABEL_MAX_LENGTH}
                  required
                  disabled={disabled}
                  onChange={(event) =>
                    updateOption(option.id, event.target.value)
                  }
                />
                <IconAction
                  label={`Remove question ${number} option ${optionIndex + 1}`}
                  icon={<X />}
                  disabled={disabled || question.options.length <= 2}
                  onClick={() =>
                    onUpdate({
                      options: question.options.filter(
                        (other) => other.id !== option.id,
                      ),
                    })
                  }
                />
              </li>
            ))}
          </ol>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={
                disabled || question.options.length >= MAX_QUESTION_OPTIONS
              }
              onClick={() =>
                onUpdate({ options: [...question.options, newOption()] })
              }
            >
              <Plus /> Add option
            </Button>
          </div>
        </FieldSet>
      )}

      {question.kind === "number" && (
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor={`${id}-min`}>Minimum</FieldLabel>
            <Input
              id={`${id}-min`}
              type="number"
              step={1}
              placeholder="None"
              value={question.min}
              disabled={disabled}
              onChange={(event) => onUpdate({ min: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-max`}>Maximum</FieldLabel>
            <Input
              id={`${id}-max`}
              type="number"
              step={1}
              placeholder="None"
              value={question.max}
              disabled={disabled}
              onChange={(event) => onUpdate({ max: event.target.value })}
            />
          </Field>
        </Field>
      )}

      {question.kind === "place" && (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-granularity`}>Granularity</FieldLabel>
            <Select
              value={question.placeGranularity}
              disabled={disabled}
              onValueChange={(next) =>
                next && onUpdate({ placeGranularity: next as PlaceGranularity })
              }
            >
              <SelectTrigger id={`${id}-granularity`} className="w-full">
                <SelectValue>
                  {(value: PlaceGranularity) => PLACE_GRANULARITY_LABELS[value]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PLACE_GRANULARITIES.map((granularity) => (
                  <SelectItem key={granularity} value={granularity}>
                    {PLACE_GRANULARITY_LABELS[granularity]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Neighborhoods are listed for New York City; everywhere else this
              asks for the city or town. Places in your service area (Events →
              Registration) are suggested first.
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${id}-allow-other`}>
                Allow &ldquo;Not listed&rdquo;
              </FieldLabel>
              <FieldDescription>
                Lets someone type a place that isn&apos;t in the list, up to 200
                characters.
              </FieldDescription>
            </FieldContent>
            <Switch
              id={`${id}-allow-other`}
              checked={question.placeAllowOther}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onUpdate({ placeAllowOther: checked })
              }
            />
          </Field>
        </>
      )}

      {question.kind === "consent" ? (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${id}-shares-contact`}>
              Share contact details in the answers export
            </FieldLabel>
            <FieldDescription>
              The answers export includes a registrant&apos;s email and phone
              only when they ticked this box. A consent box is never required:
              leaving it unticked is the answer no.
            </FieldDescription>
          </FieldContent>
          <Switch
            id={`${id}-shares-contact`}
            checked={question.sharesContact}
            disabled={disabled}
            onCheckedChange={(checked) => onUpdate({ sharesContact: checked })}
          />
        </Field>
      ) : (
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-required`}
            checked={question.required}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onUpdate({ required: checked === true })
            }
          />
          <FieldLabel htmlFor={`${id}-required`}>Required</FieldLabel>
        </Field>
      )}

      <ConditionField
        questions={questions}
        index={index}
        disabled={disabled}
        onUpdate={onUpdate}
      />
    </li>
  );
}

/**
 * The one condition a question may have (#1501): shown only for some answers
 * to an earlier, always-shown single-choice question. One level deep, so a
 * question others depend on cannot be conditional itself.
 */
function ConditionField({
  questions,
  index,
  disabled,
  onUpdate,
}: {
  questions: QuestionDraft[];
  index: number;
  disabled?: boolean;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
}) {
  const question = questions[index];
  const id = `planning-question-${question.id}-show-if`;
  const parents = conditionParents(questions, index);
  const parent = parents.find(
    (candidate) => candidate.id === question.showIf?.question_id,
  );

  if (hasDependents(questions, question.id)) {
    return (
      <FieldDescription>
        Always shown, because other questions depend on its answer.
      </FieldDescription>
    );
  }
  if (parents.length === 0) return null;

  const promptOf = (candidate: QuestionDraft) =>
    candidate.prompt.trim() ||
    `Question ${questions.findIndex((other) => other.id === candidate.id) + 1}`;

  return (
    <>
      <Field>
        <FieldLabel htmlFor={id}>Show this question</FieldLabel>
        <Select
          value={question.showIf?.question_id ?? ALWAYS}
          disabled={disabled}
          onValueChange={(next) =>
            onUpdate({
              showIf:
                !next || next === ALWAYS
                  ? null
                  : { question_id: next as string, option_ids: [] },
            })
          }
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue>
              {(selected: string) => {
                const match = parents.find(
                  (candidate) => candidate.id === selected,
                );
                return match ? `Only after “${promptOf(match)}”` : "Always";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALWAYS}>Always</SelectItem>
            {parents.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {`Only after “${promptOf(candidate)}”`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {parent && question.showIf && (
        <FieldSet>
          <FieldLegend variant="label">When the answer is</FieldLegend>
          {parent.options.map((option, optionIndex) => {
            const optionId = `${id}-${option.id}`;
            const chosen = question.showIf?.option_ids ?? [];
            return (
              <Field key={option.id} orientation="horizontal">
                <Checkbox
                  id={optionId}
                  checked={chosen.includes(option.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onUpdate({
                      showIf: {
                        question_id: parent.id,
                        // In the parent's order, whatever order they were
                        // ticked in.
                        option_ids: parent.options
                          .map((other) => other.id)
                          .filter((other) =>
                            other === option.id
                              ? checked === true
                              : chosen.includes(other),
                          ),
                      },
                    })
                  }
                />
                <FieldLabel htmlFor={optionId}>
                  {option.label.trim() || `Option ${optionIndex + 1}`}
                </FieldLabel>
              </Field>
            );
          })}
        </FieldSet>
      )}
    </>
  );
}

/**
 * Picks another event and appends copies of its current questions. Nothing is
 * saved here: the copies land in the editor for staff to review, and the
 * Planning tab's Save writes them like any other edit.
 */
function CopyQuestionsDialog({
  eventId,
  disabled,
  onCopy,
}: {
  eventId: string;
  disabled?: boolean;
  onCopy: (questions: QuestionDraft[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSourceId(null);
      setError(null);
      return;
    }
    // Loaded on open rather than with the page: most visits never copy.
    if (events === null) {
      listEventOptionsAction().then((result) => {
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setEvents(result.data.filter((event) => event.id !== eventId));
      });
    }
  }

  async function handleCopy() {
    if (!sourceId) return;
    setError(null);
    setLoading(true);
    const result = await listCopyableRegistrationQuestionsAction(sourceId);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (result.data.length === 0) {
      setError("That event asks no registration questions.");
      return;
    }
    onCopy(copyQuestions(result.data));
    handleOpenChange(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
      >
        <Copy /> Copy from another event
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy questions from another event</DialogTitle>
            <DialogDescription>
              Its current questions are added below this event&apos;s, with
              their conditions. Nothing is saved until you save the Planning
              tab.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="planning-copy-questions-event">
              Event
            </FieldLabel>
            <Select
              value={sourceId}
              disabled={events === null}
              onValueChange={(next) => setSourceId((next as string) ?? null)}
            >
              <SelectTrigger
                id="planning-copy-questions-event"
                className="w-full"
              >
                <SelectValue>
                  {(selected: string | null) =>
                    events === null
                      ? "Loading…"
                      : (events.find((event) => event.id === selected)?.name ??
                        "Pick an event")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(events ?? []).map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!sourceId || loading}
              onClick={handleCopy}
            >
              {loading ? (
                <>
                  <Spinner /> Copying...
                </>
              ) : (
                "Copy questions"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
