"use client";

import {
  FormEvent,
  Ref,
  useEffect,
  useImperativeHandle,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { updateEventPlanningAction } from "./actions";
import type { EventRow } from "./event-badges";
import { PersonPicker } from "../people/person-picker";
import type { PersonListItem } from "../people/actions";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  datetimeLocalToUtcIsoInBrowser,
  utcIsoToDatetimeLocalInBrowser,
} from "@/lib/time";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";
import { CONFIRMATION_NOTE_MAX_LENGTH } from "./event-form";
import {
  RegistrationOptionsEditor,
  registrationOptionsDraft,
  sameRegistrationOptions,
} from "./registration-options-editor";
import { RegistrationQuestionsEditor } from "./registration-questions-editor";
import {
  REGISTRATION_QUESTIONS_FIELD,
  questionDrafts,
  questionsDraftError,
  questionsPayload,
  sameQuestions,
  type QuestionDraft,
} from "./registration-questions-draft";
import { QUESTION_KIND_LABELS } from "@/lib/registration-questions";
import {
  DEFAULT_GROUP_CHAT_LABEL,
  GROUP_CHAT_LABEL_MAX_LENGTH,
  groupChatLabel,
} from "@/lib/registration-group-chat";
import {
  DEFAULT_REMINDER_INTRO,
  REMINDER_DAYS_DEFAULT,
  REMINDER_DAYS_MAX,
  REMINDER_DAYS_MIN,
  REMINDER_INTRO_MAX_LENGTH,
  reminderIntro,
} from "@/lib/event-reminders";
import {
  ReminderPreviewButton,
  ReminderStatusLine,
} from "./event-reminder-settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_SEATS_QUESTION = "__typed__";

function carpoolsSummary(
  event: EventRow,
  enabled: boolean,
  seatsQuestionId: string,
): string {
  if (!enabled) return "Off";
  const question = seatsQuestionChoices(event).find(
    (row) => row.id === seatsQuestionId,
  );
  return question ? `On · seats from “${question.prompt}”` : "On";
}

/**
 * #1649. The saved, live `number` questions a new car's seats can come from.
 * Saved only: the pointer names a stored row, so a question added in this same
 * edit can be picked after it is saved.
 */
function seatsQuestionChoices(event: EventRow) {
  return (event.registration_questions ?? []).filter(
    (question) =>
      question.kind === "number" &&
      !(question as { archived_at?: string | null }).archived_at,
  );
}

function toDatetimeLocalValue(iso: string | null) {
  // The browser's zone, so the prefill and the save agree (#1063).
  return utcIsoToDatetimeLocalInBrowser(iso);
}

function formStateFor(event: EventRow) {
  return {
    eventLead: event.event_lead,
    capacity: event.capacity === null ? "" : String(event.capacity),
    registrationEnabled: event.registration_enabled,
    registrationDeadline: toDatetimeLocalValue(event.registration_deadline),
    autoAssignDiscountCodes: event.auto_assign_discount_codes,
    adultsOnly: event.adults_only ?? false,
    confirmationNote: event.confirmation_note ?? "",
    groupChatEnabled: event.group_chat_enabled ?? false,
    groupChatLabel: event.group_chat_label ?? "",
    carpoolsEnabled: event.carpools_enabled ?? false,
    carpoolSeatsQuestionId: event.carpool_seats_question_id ?? "",
    reminderEnabled: event.reminder_enabled ?? false,
    reminderDaysBefore: String(
      event.reminder_days_before ?? REMINDER_DAYS_DEFAULT,
    ),
    // Prefilled with the platform default, so staff edit words rather than
    // write them from nothing; saved unchanged, it is stored as null.
    reminderIntro: reminderIntro(event.reminder_intro),
    budgetAmount:
      event.budget_amount === null ? "" : String(event.budget_amount),
    registrationOptions: registrationOptionsDraft(
      event.registration_options_prompt,
      event.registration_options,
    ),
    registrationQuestions: questionDrafts(event.registration_questions),
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, event: EventRow) {
  const baseline = formStateFor(event);
  return (Object.keys(baseline) as (keyof FormState)[]).some((key) => {
    if (key === "eventLead") {
      return (form.eventLead?.id ?? null) !== (baseline.eventLead?.id ?? null);
    }
    if (key === "registrationOptions") {
      return !sameRegistrationOptions(
        form.registrationOptions,
        baseline.registrationOptions,
      );
    }
    if (key === "registrationQuestions") {
      return !sameQuestions(
        form.registrationQuestions,
        baseline.registrationQuestions,
      );
    }
    return form[key] !== baseline[key];
  });
}

export type PlanningTabHandle = {
  discard: () => void;
};

export function PlanningTab({
  event,
  formId,
  people,
  onPersonCreated,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  event: EventRow;
  formId: string;
  people: PersonListItem[];
  onPersonCreated: (person: PersonListItem) => void;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<PlanningTabHandle>;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => formStateFor(event));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    onDirtyChange?.(isDirty(form, event));
  }, [form, event, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discard: () => {
      setError(null);
      setForm(formStateFor(event));
    },
  }));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    const questionsError = questionsDraftError(form.registrationQuestions);
    if (questionsError) {
      setError(questionsError);
      return;
    }

    const formData = new FormData();
    formData.set("eventLeadId", form.eventLead?.id ?? "");
    formData.set("capacity", form.capacity);
    formData.set(
      "registrationEnabled",
      form.registrationEnabled ? "on" : "off",
    );
    // Converted here, in the browser, from the typist's own clock -- and it
    // round-trips with `toDatetimeLocalValue` above, which now seeds from the
    // same zone (#1063).
    const registrationDeadlineIso = form.registrationDeadline
      ? datetimeLocalToUtcIsoInBrowser(form.registrationDeadline)
      : "";
    formData.set("registrationDeadline", registrationDeadlineIso ?? "");
    formData.set(
      "autoAssignDiscountCodes",
      form.autoAssignDiscountCodes ? "on" : "off",
    );
    formData.set("adultsOnly", form.adultsOnly ? "on" : "off");
    formData.set("budgetAmount", form.budgetAmount);
    formData.set("confirmationNote", form.confirmationNote);
    formData.set("groupChatEnabled", form.groupChatEnabled ? "on" : "off");
    formData.set("groupChatLabel", form.groupChatLabel);
    formData.set("carpoolsEnabled", form.carpoolsEnabled ? "on" : "off");
    formData.set("carpoolSeatsQuestionId", form.carpoolSeatsQuestionId);
    formData.set("reminderEnabled", form.reminderEnabled ? "on" : "off");
    formData.set("reminderDaysBefore", form.reminderDaysBefore);
    formData.set("reminderIntro", form.reminderIntro);
    // Only when changed, so saving a budget does not rewrite every option
    // (and the audit log with it).
    const baselineOptions = formStateFor(event).registrationOptions;
    if (!sameRegistrationOptions(form.registrationOptions, baselineOptions)) {
      formData.set(
        "registrationOptions",
        JSON.stringify({
          prompt: form.registrationOptions.prompt,
          options: form.registrationOptions.options.map(
            ({ id, label, cap, price }) => ({ id, label, cap, price }),
          ),
        }),
      );
    }

    // #1501, the same way.
    if (
      !sameQuestions(
        form.registrationQuestions,
        formStateFor(event).registrationQuestions,
      )
    ) {
      formData.set(
        REGISTRATION_QUESTIONS_FIELD,
        JSON.stringify(questionsPayload(form.registrationQuestions)),
      );
    }

    startTransition(async () => {
      await runAction(() => updateEventPlanningAction(event.id, formData), {
        success: "Planning details saved.",
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onSaved();
        },
      });
    });
  }

  // Registration can't run past the event itself; events without an end time
  // are bounded by their start instead.
  const registrationCutoff = toDatetimeLocalValue(
    event.ends_at ?? event.starts_at,
  );

  function toggleRegistration(enabled: boolean) {
    setForm((prev) => ({
      ...prev,
      registrationEnabled: enabled,
      // Default a blank deadline to the cutoff on enable, but never overwrite
      // a date the user already picked.
      registrationDeadline: enabled
        ? prev.registrationDeadline || registrationCutoff
        : "",
    }));
  }

  const locked = event.report_status === "submitted";

  if (mode === "view" || locked) {
    return (
      <FieldGroup>
        <ReadOnlyField label="Event lead" htmlFor="planning-eventLeadId">
          {form.eventLead?.name ?? form.eventLead?.email ?? "—"}
        </ReadOnlyField>
        <Field orientation="responsive">
          <ReadOnlyField label="Capacity" htmlFor="planning-capacity">
            {form.capacity || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Budget" htmlFor="planning-budgetAmount">
            {formatCurrency(event.budget_amount)}
          </ReadOnlyField>
        </Field>
        <Field orientation="responsive">
          <ReadOnlyField
            label="Registration"
            htmlFor="planning-registrationEnabled"
          >
            {form.registrationEnabled ? "Enabled" : "Disabled"}
          </ReadOnlyField>
          <ReadOnlyField
            label="Registration deadline"
            htmlFor="planning-registrationDeadline"
          >
            {formatDateTime(event.registration_deadline)}
          </ReadOnlyField>
        </Field>
        <ReadOnlyField
          label="Auto-assign discount codes"
          htmlFor="planning-autoAssignDiscountCodes"
        >
          {form.autoAssignDiscountCodes ? "On" : "Off"}
        </ReadOnlyField>
        <ReadOnlyField label="Adults only (18+)" htmlFor="planning-adultsOnly">
          {form.adultsOnly ? "On" : "Off"}
        </ReadOnlyField>
        <ReadOnlyField
          label="Organize carpools"
          htmlFor="planning-carpoolsEnabled"
        >
          {carpoolsSummary(
            event,
            form.carpoolsEnabled,
            form.carpoolSeatsQuestionId,
          )}
        </ReadOnlyField>
        <ReadOnlyField label="Group chat" htmlFor="planning-groupChatEnabled">
          {form.groupChatEnabled
            ? `On · ${groupChatLabel(form.groupChatLabel)}`
            : "Off"}
        </ReadOnlyField>
        <ReadOnlyField
          label="Reminder email"
          htmlFor="planning-reminderEnabled"
        >
          {form.reminderEnabled ? (
            <>
              <span className="block">
                On · {reminderDaysText(form.reminderDaysBefore)} before
              </span>
              <ReminderStatusLine
                eventId={event.id}
                timeZone={event.timezone}
                version={reminderVersion(event)}
              />
            </>
          ) : (
            "Off"
          )}
        </ReadOnlyField>
        <ReadOnlyField
          label="Confirmation email note"
          htmlFor="planning-confirmationNote"
        >
          {form.confirmationNote ? (
            <span className="whitespace-pre-line">{form.confirmationNote}</span>
          ) : (
            "—"
          )}
        </ReadOnlyField>
        <ReadOnlyField
          label="Registration question"
          htmlFor="planning-options-prompt"
        >
          {form.registrationOptions.options.length === 0 ? (
            "—"
          ) : (
            <>
              <span className="block">{form.registrationOptions.prompt}</span>
              {form.registrationOptions.options.map((option) => (
                <span key={option.key} className="app-muted block text-xs">
                  {option.label}
                  {option.cap ? ` (cap ${option.cap})` : ""}
                  {option.price ? ` · ${formatCurrency(option.price)}` : ""}
                </span>
              ))}
            </>
          )}
        </ReadOnlyField>
        <ReadOnlyField
          label="Registration questions"
          htmlFor="planning-registration-questions"
        >
          <QuestionsSummary questions={form.registrationQuestions} />
        </ReadOnlyField>
      </FieldGroup>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="planning-eventLeadId">Event lead</FieldLabel>
          <PersonPicker
            people={people}
            selected={form.eventLead}
            onSelect={(person) => update("eventLead", person)}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="planning-capacity">Capacity</FieldLabel>
            <Input
              id="planning-capacity"
              type="number"
              min={0}
              step={1}
              value={form.capacity}
              onChange={(changeEvent) =>
                update("capacity", changeEvent.target.value)
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="planning-budgetAmount">Budget ($)</FieldLabel>
            <Input
              id="planning-budgetAmount"
              type="number"
              min="0"
              step="0.01"
              value={form.budgetAmount}
              onChange={(changeEvent) =>
                update("budgetAmount", changeEvent.target.value)
              }
            />
          </Field>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="planning-registrationEnabled"
            checked={form.registrationEnabled}
            onCheckedChange={(checked) => toggleRegistration(Boolean(checked))}
          />
          <FieldLabel htmlFor="planning-registrationEnabled">
            Registration enabled
          </FieldLabel>
        </Field>

        <Field>
          <FieldLabel htmlFor="planning-registrationDeadline">
            Registration deadline
          </FieldLabel>
          <Input
            id="planning-registrationDeadline"
            type="datetime-local"
            disabled={!form.registrationEnabled}
            max={registrationCutoff || undefined}
            value={form.registrationDeadline}
            onChange={(changeEvent) =>
              update("registrationDeadline", changeEvent.target.value)
            }
          />
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="planning-autoAssignDiscountCodes"
            checked={form.autoAssignDiscountCodes}
            onCheckedChange={(checked) =>
              update("autoAssignDiscountCodes", Boolean(checked))
            }
          />
          <FieldLabel htmlFor="planning-autoAssignDiscountCodes">
            Auto-assign discount codes to new registrants
          </FieldLabel>
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="planning-adultsOnly">
              Adults only (18+)
            </FieldLabel>
            <FieldDescription>
              Shows an 18+ badge on the event and asks each registrant to
              confirm everyone in their party is 18 or over.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="planning-adultsOnly"
            checked={form.adultsOnly}
            onCheckedChange={(checked) => update("adultsOnly", checked)}
          />
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="planning-groupChatEnabled">
              This event has a group chat
            </FieldLabel>
            <FieldDescription>
              Adds a column to the registrants list for marking who has been
              added to the chat. Only staff see it.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="planning-groupChatEnabled"
            checked={form.groupChatEnabled}
            onCheckedChange={(checked) => update("groupChatEnabled", checked)}
          />
        </Field>

        {form.groupChatEnabled && (
          <Field>
            <FieldLabel htmlFor="planning-groupChatLabel">
              Group chat name
            </FieldLabel>
            <Input
              id="planning-groupChatLabel"
              maxLength={GROUP_CHAT_LABEL_MAX_LENGTH}
              placeholder={DEFAULT_GROUP_CHAT_LABEL}
              value={form.groupChatLabel}
              onChange={(changeEvent) =>
                update("groupChatLabel", changeEvent.target.value)
              }
            />
            <FieldDescription>
              What the registrants list calls it, such as “Instagram group
              chat”. Optional.
            </FieldDescription>
          </Field>
        )}

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="planning-carpoolsEnabled">
              Organize carpools
            </FieldLabel>
            <FieldDescription>
              Adds a Carpools section for planning cars, drivers and passengers,
              and who has paid their driver. Only staff see it.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="planning-carpoolsEnabled"
            checked={form.carpoolsEnabled}
            onCheckedChange={(checked) => update("carpoolsEnabled", checked)}
          />
        </Field>

        {form.carpoolsEnabled && seatsQuestionChoices(event).length > 0 && (
          <Field>
            <FieldLabel htmlFor="planning-carpoolSeatsQuestionId">
              Seats come from
            </FieldLabel>
            <Select
              value={form.carpoolSeatsQuestionId || NO_SEATS_QUESTION}
              onValueChange={(value) =>
                update(
                  "carpoolSeatsQuestionId",
                  value === NO_SEATS_QUESTION || value === null
                    ? ""
                    : String(value),
                )
              }
            >
              <SelectTrigger
                id="planning-carpoolSeatsQuestionId"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SEATS_QUESTION}>
                  Typed for each car
                </SelectItem>
                {seatsQuestionChoices(event).map((question) => (
                  <SelectItem key={question.id} value={question.id}>
                    {question.prompt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              A number question whose answer fills in a new car&apos;s seats
              when its driver is chosen.
            </FieldDescription>
          </Field>
        )}

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="planning-reminderEnabled">
              Reminder email
            </FieldLabel>
            <FieldDescription>
              Emails everyone registered the event details, their carpool and a
              fresh link to change their answers, once, at 9:00 in the
              event&apos;s time zone. People who register after it goes are not
              sent one.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="planning-reminderEnabled"
            checked={form.reminderEnabled}
            onCheckedChange={(checked) => update("reminderEnabled", checked)}
          />
        </Field>

        {form.reminderEnabled && (
          <>
            <Field>
              <FieldLabel htmlFor="planning-reminderDaysBefore">
                Days before the event
              </FieldLabel>
              <Input
                id="planning-reminderDaysBefore"
                type="number"
                min={REMINDER_DAYS_MIN}
                max={REMINDER_DAYS_MAX}
                step={1}
                value={form.reminderDaysBefore}
                onChange={(changeEvent) =>
                  update("reminderDaysBefore", changeEvent.target.value)
                }
              />
              <ReminderStatusLine
                eventId={event.id}
                timeZone={event.timezone}
                version={reminderVersion(event)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="planning-reminderIntro">
                Reminder intro
              </FieldLabel>
              <Textarea
                id="planning-reminderIntro"
                rows={3}
                maxLength={REMINDER_INTRO_MAX_LENGTH}
                placeholder={DEFAULT_REMINDER_INTRO}
                value={form.reminderIntro}
                onChange={(changeEvent) =>
                  update("reminderIntro", changeEvent.target.value)
                }
              />
              <FieldDescription>
                The opening paragraph, above the event details. Left blank, it
                reads the default.
              </FieldDescription>
              <div>
                <ReminderPreviewButton
                  eventId={event.id}
                  intro={form.reminderIntro}
                />
              </div>
            </Field>
          </>
        )}

        <Field>
          <FieldLabel htmlFor="planning-confirmationNote">
            Confirmation email note
          </FieldLabel>
          <Textarea
            id="planning-confirmationNote"
            rows={3}
            maxLength={CONFIRMATION_NOTE_MAX_LENGTH}
            value={form.confirmationNote}
            onChange={(changeEvent) =>
              update("confirmationNote", changeEvent.target.value)
            }
          />
          <FieldDescription>
            Added to the confirmation email everyone who registers for this
            event receives, under the event details. Use it for anything
            everyone needs, like what to bring. A shared discount code goes on
            the Discount codes card instead, which adds it to the email. Not
            shown on the public event page.
          </FieldDescription>
        </Field>

        <RegistrationOptionsEditor
          value={form.registrationOptions}
          onChange={(next) => update("registrationOptions", next)}
          disabled={isPending}
        />

        <RegistrationQuestionsEditor
          eventId={event.id}
          value={form.registrationQuestions}
          onChange={(next) => update("registrationQuestions", next)}
          disabled={isPending}
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
}

function reminderDaysText(days: string): string {
  return days === "1" ? "1 day" : `${days} days`;
}

/** What moves the reminder's send time or recipients, to read its status again. */
function reminderVersion(event: EventRow): string {
  return [
    event.starts_at,
    event.timezone,
    event.reminder_enabled,
    event.reminder_days_before,
  ].join("|");
}

/** The read-only view of an event's questions (#1501), one per line. */
function QuestionsSummary({ questions }: { questions: QuestionDraft[] }) {
  if (questions.length === 0) return <>—</>;
  return (
    <>
      {questions.map((question) => {
        // #1742. Any of a few earlier questions.
        const parents = (question.showIf?.any ?? []).flatMap(
          (clause) =>
            questions.find((other) => other.id === clause.question_id) ?? [],
        );
        const details = [
          QUESTION_KIND_LABELS[question.kind],
          question.kind !== "consent" && question.required ? "required" : null,
          question.kind === "consent" && question.sharesContact
            ? "shares contact details in the answers export"
            : null,
          parents.length > 0
            ? `only after ${parents.map((parent) => `“${parent.prompt}”`).join(" or ")}`
            : null,
        ].filter(Boolean);
        return (
          <span key={question.id} className="block">
            {question.prompt}
            <span className="app-muted block text-xs">
              {details.join(" · ")}
            </span>
          </span>
        );
      })}
    </>
  );
}
