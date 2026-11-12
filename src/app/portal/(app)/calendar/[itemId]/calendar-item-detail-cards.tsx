"use client";

import { FormEvent, ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  datetimeLocalToUtcIsoInBrowser,
  utcIsoToDatetimeLocalInBrowser,
} from "@/lib/time";
import { updateCalendarItemAction } from "../actions";
import {
  CALENDAR_STATUSES,
  DECISIONS,
  ITEM_TYPES,
  PRIORITY_TIERS,
  VISIBILITIES,
  labelFor,
  ownerName,
  ownerOptions,
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "../calendar-shared";
import type { CalendarCategory } from "../calendar-shared";
import { PersonSelect } from "../../people/person-select";
import {
  CalendarStatusBadge,
  CalendarVisibilityBadge,
  CategoryBadges,
  DecisionBadge,
  PriorityTierBadge,
  SensitiveTopicBadge,
} from "../calendar-badges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

// Seeded in the browser's zone so the prefill and the save agree (#1063).
// The item's own `time_zone` is no longer consulted here: it says where the
// item happens and governs the public site, not how a typed time is read.
const toDatetimeLocalValue = utcIsoToDatetimeLocalInBrowser;

function formStateFor(item: CalendarItemRow) {
  return {
    title: item.title,
    itemType: item.item_type,
    startsAt: toDatetimeLocalValue(item.starts_at),
    endsAt: toDatetimeLocalValue(item.ends_at),
    timeZone: item.time_zone,
    recurrenceRule: item.recurrence_rule ?? "",
    summary: item.summary ?? "",
    priorityTier: String(item.priority_tier),
    priorityRationale: item.priority_rationale ?? "",
    calendarStatus: item.calendar_status,
    visibility: item.visibility,
    ownerId: item.owner_id ?? "",
    categories: item.categories,
    programIds: item.program_ids,
    decision: item.decision ?? "",
    decisionNote: item.decision_note ?? "",
    isSensitiveTopic: item.is_sensitive_topic,
    toneGuidance: item.tone_guidance ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

// Every card submits the FULL item form (seeded from the current item, with
// only that card's fields edited) because updateCalendarItemAction replaces
// the whole row — there is no per-field patch action.
function buildFormData(form: FormState) {
  const formData = new FormData();
  formData.set("title", form.title);
  formData.set("itemType", form.itemType);
  // Converted here, in the browser, so the item's instants are fixed from
  // the typist's own clock rather than the server's (#1063).
  formData.set("startsAt", datetimeLocalToUtcIsoInBrowser(form.startsAt) ?? "");
  formData.set(
    "endsAt",
    form.endsAt ? (datetimeLocalToUtcIsoInBrowser(form.endsAt) ?? "") : "",
  );
  formData.set("timeZone", form.timeZone);
  formData.set("recurrenceRule", form.recurrenceRule);
  formData.set("summary", form.summary);
  formData.set("priorityTier", form.priorityTier);
  formData.set("priorityRationale", form.priorityRationale);
  formData.set("calendarStatus", form.calendarStatus);
  formData.set("visibility", form.visibility);
  formData.set("ownerId", form.ownerId);
  for (const category of form.categories)
    formData.append("categories", category);
  for (const programId of form.programIds)
    formData.append("programIds", programId);
  formData.set("decision", form.decision);
  formData.set("decisionNote", form.decisionNote);
  formData.set("isSensitiveTopic", String(form.isSensitiveTopic));
  formData.set("toneGuidance", form.toneGuidance);
  return formData;
}

// `subject` names the card in its own receipt, so the toast says which of
// the three cards on this page actually saved.
function useCalendarItemCardForm(item: CalendarItemRow, subject: string) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(item));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleListValue(key: "categories" | "programIds", value: string) {
    setForm((prev) => {
      const list = prev[key];
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
      return { ...prev, [key]: next };
    });
  }

  function startEditing() {
    // Re-seed from the item on every edit: a save + router.refresh() may
    // have replaced the `item` prop since this component mounted.
    setForm(formStateFor(item));
    setError(null);
    setWarning(null);
    setMode("edit");
  }

  function cancel() {
    setError(null);
    setMode("view");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWarning(null);

    startTransition(async () => {
      await runAction(
        () => updateCalendarItemAction(item.id, buildFormData(form)),
        {
          success: `${subject} saved.`,
          onError: setError,
          onSuccess: (result) => {
            if (result.warning) setWarning(result.warning);
            setMode("view");
            router.refresh();
          },
        },
      );
    });
  }

  return {
    mode,
    form,
    error,
    warning,
    isPending,
    update,
    toggleListValue,
    startEditing,
    cancel,
    handleSubmit,
  };
}

function EditableCard({
  title,
  editLabel,
  canEdit,
  editing,
  onEdit,
  error,
  warning,
  children,
  className,
}: {
  title: string;
  editLabel: string;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  error: string | null;
  warning: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title}
        </CardTitle>
        {canEdit && !editing && (
          <CardAction>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={editLabel}
                    onClick={onEdit}
                  />
                }
              >
                <Pencil />
              </TooltipTrigger>
              <TooltipContent>{editLabel}</TooltipContent>
            </Tooltip>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {warning && (
          <Alert>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

function CardFormActions({
  isPending,
  onCancel,
}: {
  isPending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={isPending} focusableWhenDisabled>
        {isPending ? (
          <>
            <Spinner /> Saving...
          </>
        ) : (
          "Save changes"
        )}
      </Button>
    </div>
  );
}

export function ScheduleDetailsCard({
  item,
  canManage,
}: {
  item: CalendarItemRow;
  canManage: boolean;
}) {
  const card = useCalendarItemCardForm(item, "Schedule & details");
  const { form, update } = card;

  return (
    <EditableCard
      title="Schedule & details"
      editLabel="Edit schedule & details"
      canEdit={canManage}
      editing={card.mode === "edit"}
      onEdit={card.startEditing}
      error={card.error}
      warning={card.warning}
    >
      {card.mode === "view" ? (
        <FieldGroup>
          <ReadOnlyField label="Item type" htmlFor="item-type">
            {labelFor(ITEM_TYPES, item.item_type)}
          </ReadOnlyField>
          <Field orientation="responsive">
            <ReadOnlyField label="Starts" htmlFor="item-starts">
              {formatDateTime(item.starts_at)}
            </ReadOnlyField>
            <ReadOnlyField label="Ends" htmlFor="item-ends">
              {formatDateTime(item.ends_at)}
            </ReadOnlyField>
          </Field>
          <Field orientation="responsive">
            <ReadOnlyField label="Time zone" htmlFor="item-time-zone">
              {item.time_zone}
            </ReadOnlyField>
            <ReadOnlyField label="Recurrence" htmlFor="item-recurrence">
              {item.recurrence_rule || "—"}
            </ReadOnlyField>
          </Field>
          <ReadOnlyField label="Summary" htmlFor="item-summary">
            {item.summary || "—"}
          </ReadOnlyField>
          <Field orientation="responsive">
            <ReadOnlyField label="Source" htmlFor="item-source">
              {item.source || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Region" htmlFor="item-region">
              {item.region || "—"}
            </ReadOnlyField>
          </Field>
          <ReadOnlyField label="Exceptions" htmlFor="item-exceptions">
            {item.exceptions.length > 0
              ? item.exceptions
                  .map((exception) =>
                    exception &&
                    typeof exception === "object" &&
                    "note" in exception
                      ? String((exception as { note: unknown }).note)
                      : JSON.stringify(exception),
                  )
                  .join("; ")
              : "—"}
          </ReadOnlyField>
        </FieldGroup>
      ) : (
        <form onSubmit={card.handleSubmit}>
          <FieldGroup>
            <RequiredFieldsNote />
            <Field>
              <FieldLabel htmlFor="edit-title" required>
                Title
              </FieldLabel>
              <Input
                id="edit-title"
                required
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-itemType">Item type</FieldLabel>
              <Select
                value={form.itemType}
                onValueChange={(value) =>
                  update("itemType", value ?? form.itemType)
                }
              >
                <SelectTrigger id="edit-itemType" className="w-full">
                  <SelectValue placeholder="Select item type">
                    {(value: string) =>
                      ITEM_TYPES.find((option) => option.value === value)?.label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-summary">Summary</FieldLabel>
              <Textarea
                id="edit-summary"
                value={form.summary}
                onChange={(event) => update("summary", event.target.value)}
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="edit-startsAt" required>
                  Starts
                </FieldLabel>
                <Input
                  id="edit-startsAt"
                  required
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => update("startsAt", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-endsAt">Ends</FieldLabel>
                <Input
                  id="edit-endsAt"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => update("endsAt", event.target.value)}
                />
              </Field>
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="edit-timeZone" required>
                  Time zone
                </FieldLabel>
                <Input
                  id="edit-timeZone"
                  required
                  value={form.timeZone}
                  onChange={(event) => update("timeZone", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-recurrenceRule">
                  Recurrence
                </FieldLabel>
                <Input
                  id="edit-recurrenceRule"
                  placeholder="e.g. Annual, March 31"
                  value={form.recurrenceRule}
                  onChange={(event) =>
                    update("recurrenceRule", event.target.value)
                  }
                />
              </Field>
            </Field>
          </FieldGroup>

          <CardFormActions isPending={card.isPending} onCancel={card.cancel} />
        </form>
      )}
    </EditableCard>
  );
}

export function PlanningDecisionCard({
  item,
  owners,
  programs,
  canManage,
  categoryVocabulary,
}: {
  item: CalendarItemRow;
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  canManage: boolean;
  /** The tenant's category vocabulary (#834). */
  categoryVocabulary: CalendarCategory[];
}) {
  const card = useCalendarItemCardForm(item, "Planning & decision");
  const { form, update, toggleListValue } = card;

  const relatedProgramNames = item.program_ids
    .map((id) => programs.find((program) => program.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <EditableCard
      title="Planning & decision"
      editLabel="Edit planning & decision"
      canEdit={canManage}
      editing={card.mode === "edit"}
      onEdit={card.startEditing}
      error={card.error}
      warning={card.warning}
    >
      {card.mode === "view" ? (
        <FieldGroup>
          <Field orientation="responsive">
            <ReadOnlyField label="Priority" htmlFor="item-priority">
              <PriorityTierBadge tier={item.priority_tier} />
            </ReadOnlyField>
            <ReadOnlyField label="Calendar status" htmlFor="item-status">
              <CalendarStatusBadge status={item.calendar_status} />
            </ReadOnlyField>
          </Field>
          <ReadOnlyField
            label="Priority rationale"
            htmlFor="item-priority-rationale"
          >
            {item.priority_rationale || "—"}
          </ReadOnlyField>
          <Field orientation="responsive">
            <ReadOnlyField label="Visibility" htmlFor="item-visibility">
              <CalendarVisibilityBadge visibility={item.visibility} />
            </ReadOnlyField>
            <ReadOnlyField label="Owner" htmlFor="item-owner">
              {ownerName(owners, item.owner_id)}
            </ReadOnlyField>
          </Field>
          <ReadOnlyField label="Categories" htmlFor="item-categories">
            <CategoryBadges
              categories={item.categories}
              vocabulary={categoryVocabulary}
            />
          </ReadOnlyField>
          <ReadOnlyField
            label="Related programs"
            htmlFor="item-related-programs"
          >
            {relatedProgramNames.length > 0
              ? relatedProgramNames.join(", ")
              : "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Decision" htmlFor="item-decision">
            <div className="flex flex-col gap-1">
              <DecisionBadge decision={item.decision} />
              {item.decision_note && (
                <p className="app-muted text-sm">{item.decision_note}</p>
              )}
            </div>
          </ReadOnlyField>
        </FieldGroup>
      ) : (
        <form onSubmit={card.handleSubmit}>
          <FieldGroup>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="edit-priorityTier">Priority</FieldLabel>
                <Select
                  value={form.priorityTier}
                  onValueChange={(value) =>
                    update("priorityTier", value ?? "3")
                  }
                >
                  <SelectTrigger id="edit-priorityTier" className="w-full">
                    <SelectValue placeholder="Select priority">
                      {(value: string) =>
                        PRIORITY_TIERS.find((option) => option.value === value)
                          ?.label
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_TIERS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-calendarStatus">
                  Calendar status
                </FieldLabel>
                <Select
                  value={form.calendarStatus}
                  onValueChange={(value) =>
                    update("calendarStatus", value ?? "idea")
                  }
                >
                  <SelectTrigger id="edit-calendarStatus" className="w-full">
                    <SelectValue placeholder="Select status">
                      {(value: string) =>
                        CALENDAR_STATUSES.find(
                          (option) => option.value === value,
                        )?.label
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CALENDAR_STATUSES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-priorityRationale">
                Priority rationale
              </FieldLabel>
              <Textarea
                id="edit-priorityRationale"
                value={form.priorityRationale}
                onChange={(event) =>
                  update("priorityRationale", event.target.value)
                }
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="edit-visibility">Visibility</FieldLabel>
                <Select
                  value={form.visibility}
                  onValueChange={(value) =>
                    update("visibility", value ?? "internal")
                  }
                >
                  <SelectTrigger id="edit-visibility" className="w-full">
                    <SelectValue placeholder="Select visibility">
                      {(value: string) =>
                        VISIBILITIES.find((option) => option.value === value)
                          ?.label
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {VISIBILITIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-ownerId">Owner</FieldLabel>
                <PersonSelect
                  id="edit-ownerId"
                  people={ownerOptions(owners)}
                  value={form.ownerId || null}
                  onChange={(personId) => update("ownerId", personId ?? "")}
                  noneLabel="No owner"
                />
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-categories-group">
                Categories
              </FieldLabel>
              <div id="edit-categories-group" className="flex flex-col gap-2">
                {categoryVocabulary.map((category) => (
                  <label
                    key={category.value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={form.categories.includes(category.value)}
                      onCheckedChange={() =>
                        toggleListValue("categories", category.value)
                      }
                    />
                    {category.label}
                  </label>
                ))}
              </div>
            </Field>

            {programs.length > 0 && (
              <Field>
                <FieldLabel htmlFor="edit-programs-group">
                  Related programs
                </FieldLabel>
                <div id="edit-programs-group" className="flex flex-col gap-2">
                  {programs.map((program) => (
                    <label
                      key={program.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={form.programIds.includes(program.id)}
                        onCheckedChange={() =>
                          toggleListValue("programIds", program.id)
                        }
                      />
                      {program.name}
                    </label>
                  ))}
                </div>
              </Field>
            )}

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="edit-decision">Decision</FieldLabel>
                <Select
                  value={form.decision || "none"}
                  onValueChange={(value) =>
                    update("decision", value === "none" ? "" : (value ?? ""))
                  }
                >
                  <SelectTrigger id="edit-decision" className="w-full">
                    <SelectValue placeholder="No decision yet">
                      {(value: string) =>
                        value && value !== "none"
                          ? DECISIONS.find((option) => option.value === value)
                              ?.label
                          : "No decision yet"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No decision yet</SelectItem>
                    {DECISIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-decisionNote">
                  Decision note
                </FieldLabel>
                <Input
                  id="edit-decisionNote"
                  placeholder={
                    form.decision === "skip" ? "Reason (required)" : "Optional"
                  }
                  value={form.decisionNote}
                  onChange={(event) =>
                    update("decisionNote", event.target.value)
                  }
                />
              </Field>
            </Field>
          </FieldGroup>

          <CardFormActions isPending={card.isPending} onCancel={card.cancel} />
        </form>
      )}
    </EditableCard>
  );
}

export function SensitiveTopicCard({
  item,
  canManage,
}: {
  item: CalendarItemRow;
  canManage: boolean;
}) {
  const card = useCalendarItemCardForm(item, "Sensitive topic");
  const { form, update } = card;

  return (
    <EditableCard
      title="Sensitive topic"
      editLabel="Edit sensitive topic"
      canEdit={canManage}
      editing={card.mode === "edit"}
      onEdit={card.startEditing}
      error={card.error}
      warning={card.warning}
    >
      {card.mode === "view" ? (
        <div className="flex flex-col gap-2">
          {item.is_sensitive_topic ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SensitiveTopicBadge />
              </div>
              {item.tone_guidance && (
                <p className="app-muted text-sm">{item.tone_guidance}</p>
              )}
            </>
          ) : (
            <span className="app-muted text-sm">Not flagged</span>
          )}
        </div>
      ) : (
        <form onSubmit={card.handleSubmit}>
          <FieldGroup>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isSensitiveTopic}
                onCheckedChange={(checked) =>
                  update("isSensitiveTopic", checked === true)
                }
              />
              Sensitive topic — write about it with care
            </label>

            {form.isSensitiveTopic && (
              <Field>
                <FieldLabel htmlFor="edit-toneGuidance">
                  Tone guidance
                </FieldLabel>
                <Textarea
                  id="edit-toneGuidance"
                  placeholder="How should staff write about this moment?"
                  value={form.toneGuidance}
                  onChange={(event) =>
                    update("toneGuidance", event.target.value)
                  }
                />
              </Field>
            )}
          </FieldGroup>

          <CardFormActions isPending={card.isPending} onCancel={card.cancel} />
        </form>
      )}
    </EditableCard>
  );
}
