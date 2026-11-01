"use client";

import { useState, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
  QUESTION_OPTION_HINT_MAX_LENGTH,
  QUESTION_OPTION_KEY_MAX_LENGTH,
  QUESTION_OPTION_LABEL_MAX_LENGTH,
  QUESTION_PROMPT_MAX_LENGTH,
  isChoiceKind,
  type ConditionClause,
  type PlaceGranularity,
  type QuestionKind,
  type QuestionOption,
} from "@/lib/registration-questions";
import {
  listEventOptionsAction,
  listCopyableRegistrationQuestionsAction,
  type EventOption,
} from "./actions";
import {
  conditionParents,
  copyQuestions,
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

  function updateOption(optionId: string, patch: Partial<QuestionOption>) {
    onUpdate({
      options: question.options.map((option) =>
        option.id === optionId ? { ...option, ...patch } : option,
      ),
    });
  }

  const offered = question.options.filter((option) => !option.archived).length;

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
          {question.showIf?.any.length === 1 && question.kind !== "consent"
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
          {/* #1742. A hint reads under the label; a code names the option
              for anything that must survive a relabel. Archiving keeps an
              option for the answers that chose it but stops offering it. */}
          <FieldDescription>
            A hint shows under the option. A code is an optional stable name,
            like first_time. Archive an option people have chosen rather than
            removing it.
          </FieldDescription>
          <ol className="flex flex-col gap-3">
            {question.options.map((option, optionIndex) => {
              const name = `Question ${number} option ${optionIndex + 1}`;
              return (
                <li key={option.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${id}-option-${option.id}`}
                      aria-label={name}
                      value={option.label}
                      maxLength={QUESTION_OPTION_LABEL_MAX_LENGTH}
                      required
                      disabled={disabled}
                      onChange={(event) =>
                        updateOption(option.id, { label: event.target.value })
                      }
                    />
                    <IconAction
                      label={
                        option.archived ? `Restore ${name}` : `Archive ${name}`
                      }
                      icon={option.archived ? <ArchiveRestore /> : <Archive />}
                      disabled={disabled || (!option.archived && offered <= 2)}
                      onClick={() =>
                        updateOption(option.id, { archived: !option.archived })
                      }
                    />
                    <IconAction
                      label={`Remove ${name}`}
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id={`${id}-option-${option.id}-hint`}
                      aria-label={`${name} hint`}
                      className="min-w-48 flex-1"
                      value={option.hint ?? ""}
                      maxLength={QUESTION_OPTION_HINT_MAX_LENGTH}
                      placeholder="Hint (optional)"
                      disabled={disabled}
                      onChange={(event) =>
                        updateOption(option.id, { hint: event.target.value })
                      }
                    />
                    <Input
                      id={`${id}-option-${option.id}-key`}
                      aria-label={`${name} code`}
                      className="w-40 font-mono"
                      value={option.key ?? ""}
                      maxLength={QUESTION_OPTION_KEY_MAX_LENGTH}
                      placeholder="Code (optional)"
                      disabled={disabled}
                      onChange={(event) =>
                        updateOption(option.id, { key: event.target.value })
                      }
                    />
                    {option.archived && (
                      <span className="text-xs text-muted-foreground">
                        Archived: no longer offered
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
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

      {question.kind === "single_choice" && (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${id}-other`}>
              Allow &ldquo;Other&rdquo;
            </FieldLabel>
            <FieldDescription>
              Adds an &ldquo;Other&rdquo; choice with a short text, up to 200
              characters.
            </FieldDescription>
          </FieldContent>
          <Switch
            id={`${id}-other`}
            checked={question.allowOther}
            disabled={disabled}
            onCheckedChange={(checked) => onUpdate({ allowOther: checked })}
          />
        </Field>
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
 * When a question is shown (#1501): always, or for some answers to any of a
 * few earlier single-choice questions (#1742), which may be conditional
 * themselves. A hidden question counts as unanswered.
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
  const clauses = question.showIf?.any ?? [];

  if (parents.length === 0) return null;

  const promptOf = (candidate: QuestionDraft) =>
    candidate.prompt.trim() ||
    `Question ${questions.findIndex((other) => other.id === candidate.id) + 1}`;
  const unused = parents.filter(
    (candidate) =>
      !clauses.some((clause) => clause.question_id === candidate.id),
  );

  function setClauses(next: ConditionClause[]) {
    onUpdate({ showIf: next.length > 0 ? { any: next } : null });
  }

  if (clauses.length === 0) {
    return (
      <Field>
        <FieldLabel htmlFor={id}>Show this question</FieldLabel>
        <Select
          value={ALWAYS}
          disabled={disabled}
          onValueChange={(next) =>
            next &&
            next !== ALWAYS &&
            setClauses([{ question_id: next as string, option_ids: [] }])
          }
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue>{() => "Always"}</SelectValue>
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
    );
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">Show this question</FieldLegend>
      <FieldDescription>
        {clauses.length > 1
          ? "When any of these answers is given."
          : "Only for these answers."}
      </FieldDescription>
      {clauses.map((clause, clauseIndex) => (
        <ConditionClauseField
          key={clause.question_id}
          id={`${id}-${clauseIndex}`}
          clause={clause}
          // This clause's own question, and any not named by another.
          parents={parents.filter(
            (candidate) =>
              candidate.id === clause.question_id || unused.includes(candidate),
          )}
          promptOf={promptOf}
          disabled={disabled}
          onChange={(next) =>
            setClauses(
              next === null
                ? clauses.filter((_, i) => i !== clauseIndex)
                : clauses.map((other, i) => (i === clauseIndex ? next : other)),
            )
          }
        />
      ))}
      {unused.length > 0 && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() =>
              setClauses([
                ...clauses,
                { question_id: unused[0].id, option_ids: [] },
              ])
            }
          >
            <Plus /> Or after another answer
          </Button>
        </div>
      )}
    </FieldSet>
  );
}

/** One "after this question, for these answers" of a condition. */
function ConditionClauseField({
  id,
  clause,
  parents,
  promptOf,
  disabled,
  onChange,
}: {
  id: string;
  clause: ConditionClause;
  parents: QuestionDraft[];
  promptOf: (question: QuestionDraft) => string;
  disabled?: boolean;
  /** Null removes the clause. */
  onChange: (clause: ConditionClause | null) => void;
}) {
  const parent = parents.find(
    (candidate) => candidate.id === clause.question_id,
  );
  const label = parent ? `Only after “${promptOf(parent)}”` : "";

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Select
          value={clause.question_id}
          disabled={disabled}
          onValueChange={(next) =>
            next && onChange({ question_id: next as string, option_ids: [] })
          }
        >
          <SelectTrigger id={id} aria-label="After question" className="w-full">
            <SelectValue>{() => label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {parents.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {`Only after “${promptOf(candidate)}”`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <IconAction
          label={`Remove condition ${label}`}
          icon={<X />}
          disabled={disabled}
          onClick={() => onChange(null)}
        />
      </div>
      {parent && (
        <FieldSet>
          <FieldLegend variant="label">When the answer is</FieldLegend>
          {parent.options.map((option, optionIndex) => {
            const optionId = `${id}-${option.id}`;
            return (
              <Field key={option.id} orientation="horizontal">
                <Checkbox
                  id={optionId}
                  checked={clause.option_ids.includes(option.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      question_id: parent.id,
                      // In the parent's order, whatever order they were
                      // ticked in.
                      option_ids: parent.options
                        .map((other) => other.id)
                        .filter((other) =>
                          other === option.id
                            ? checked === true
                            : clause.option_ids.includes(other),
                        ),
                    })
                  }
                />
                <FieldLabel htmlFor={optionId}>
                  {option.label.trim() || `Option ${optionIndex + 1}`}
                  {option.archived && " (archived)"}
                </FieldLabel>
              </Field>
            );
          })}
        </FieldSet>
      )}
    </div>
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
