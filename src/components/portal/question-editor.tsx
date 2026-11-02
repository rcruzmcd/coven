"use client";

import type { ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MAX_QUESTION_OPTIONS,
  PLACE_GRANULARITIES,
  PLACE_GRANULARITY_LABELS,
  QUESTION_COLUMN_LABEL_MAX_LENGTH,
  QUESTION_HELP_MAX_LENGTH,
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
  conditionParents,
  newOption,
  normalizeConditions,
  type QuestionDraft,
} from "@/lib/question-drafts";

/**
 * The question editor #1501 wrote for an event's registration questions,
 * shared with the tenant's person profile questions (#1743): the same kinds,
 * options, conditions and limits, so the two editors cannot drift. Each owner
 * wraps the list in its own words and adds its own fields through
 * `QuestionCard`'s children.
 */

/** The condition picker's value for a question that is always shown. */
const ALWAYS = "always";

/** The column-name field's words, which name the list the column heads. */
export type QuestionColumnLabelCopy = {
  label: string;
  description: string;
  /** For a follow-up question, if it reads differently. */
  followUp?: string;
};

/**
 * The questions as an ordered list of cards, every change normalized so a
 * condition an edit made impossible is dropped at once rather than refused
 * on save.
 */
export function QuestionList<D extends QuestionDraft>({
  value,
  onChange,
  idPrefix,
  kinds,
  columnLabel,
  disabled,
  renderExtras,
}: {
  value: D[];
  onChange: (value: D[]) => void;
  idPrefix: string;
  kinds: readonly QuestionKind[];
  columnLabel: QuestionColumnLabelCopy;
  disabled?: boolean;
  /** This owner's own fields for one question. */
  renderExtras?: (
    question: D,
    update: (patch: Partial<D>) => void,
  ) => ReactNode;
}) {
  function setQuestions(next: D[]) {
    onChange(normalizeConditions(next));
  }

  function update(index: number, patch: Partial<D>) {
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

  if (value.length === 0) return null;

  return (
    <ol className="flex flex-col gap-3">
      {value.map((question, index) => (
        <QuestionCard
          key={question.id}
          questions={value}
          index={index}
          idPrefix={idPrefix}
          kinds={kinds}
          columnLabel={columnLabel}
          disabled={disabled}
          // The card edits the shared fields only, so its patch is one of D's.
          onUpdate={(patch) => update(index, patch as Partial<D>)}
          onMove={(by) => move(index, by)}
          onRemove={() => setQuestions(value.filter((_, i) => i !== index))}
        >
          {renderExtras?.(question, (patch) => update(index, patch))}
        </QuestionCard>
      ))}
    </ol>
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

export function QuestionCard({
  questions,
  index,
  idPrefix,
  kinds,
  columnLabel,
  disabled,
  onUpdate,
  onMove,
  onRemove,
  children,
}: {
  questions: readonly QuestionDraft[];
  index: number;
  /** Prefixes every control's id, so two editors never share one. */
  idPrefix: string;
  /** The kinds this owner offers, in order. */
  kinds: readonly QuestionKind[];
  /** Where the column name shows, in this owner's words. */
  columnLabel: QuestionColumnLabelCopy;
  disabled?: boolean;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  /** What this owner adds to a question, above its condition. */
  children?: ReactNode;
}) {
  const question = questions[index];
  const number = index + 1;
  const id = `${idPrefix}-question-${question.id}`;

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
          {columnLabel.label}
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
            ? (columnLabel.followUp ?? columnLabel.description)
            : columnLabel.description}
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
            {kinds.map((kind) => (
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

      {children}

      <ConditionField
        questions={questions}
        index={index}
        idPrefix={idPrefix}
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
  idPrefix,
  disabled,
  onUpdate,
}: {
  questions: readonly QuestionDraft[];
  index: number;
  idPrefix: string;
  disabled?: boolean;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
}) {
  const question = questions[index];
  const id = `${idPrefix}-question-${question.id}-show-if`;
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
