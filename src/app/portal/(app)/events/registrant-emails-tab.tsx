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
import { updateEventRegistrantEmailsAction } from "./actions";
import type { EventRow } from "./event-badges";
import { CONFIRMATION_NOTE_MAX_LENGTH } from "./event-form";
import {
  ReminderPreviewButton,
  ReminderStatusLine,
} from "./event-reminder-settings";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/components/portal/action-toast";
import {
  DEFAULT_REMINDER_INTRO,
  REMINDER_DAYS_DEFAULT,
  REMINDER_DAYS_MAX,
  REMINDER_DAYS_MIN,
  REMINDER_INTRO_MAX_LENGTH,
  reminderIntro,
} from "@/lib/event-reminders";

function formStateFor(event: EventRow) {
  return {
    confirmationNote: event.confirmation_note ?? "",
    reminderEnabled: event.reminder_enabled ?? false,
    reminderDaysBefore: String(
      event.reminder_days_before ?? REMINDER_DAYS_DEFAULT,
    ),
    // Prefilled with the platform default, so staff edit words rather than
    // write them from nothing; saved unchanged, it is stored as null.
    reminderIntro: reminderIntro(event.reminder_intro),
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, event: EventRow) {
  const baseline = formStateFor(event);
  return (Object.keys(baseline) as (keyof FormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

export type RegistrantEmailsTabHandle = {
  discard: () => void;
};

/**
 * #1779. What is emailed to registrants: the note added to their
 * confirmation, and the reminder before the event. Listed whether or not
 * registration is on, so the emails can be written before it opens; a note
 * says they go out only once it is.
 */
export function RegistrantEmailsTab({
  event,
  formId,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  event: EventRow;
  formId: string;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<RegistrantEmailsTabHandle>;
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

    const formData = new FormData();
    formData.set("confirmationNote", form.confirmationNote);
    formData.set("reminderEnabled", form.reminderEnabled ? "on" : "off");
    formData.set("reminderDaysBefore", form.reminderDaysBefore);
    formData.set("reminderIntro", form.reminderIntro);

    startTransition(async () => {
      await runAction(
        () => updateEventRegistrantEmailsAction(event.id, formData),
        {
          success: "Registrant emails saved.",
          onError: setError,
          onSuccess: () => {
            router.refresh();
            onSaved();
          },
        },
      );
    });
  }

  const registrationOffNote = !event.registration_enabled && (
    <Alert>
      <AlertDescription>
        Registration is off for this event, so these emails are not sent until
        it is turned on in the Registration card.
      </AlertDescription>
    </Alert>
  );

  const locked = event.report_status === "submitted";

  if (mode === "view" || locked) {
    return (
      <FieldGroup>
        {registrationOffNote}
        <ReadOnlyField
          label="Confirmation email note"
          htmlFor="registrant-emails-confirmationNote"
        >
          {form.confirmationNote ? (
            <span className="whitespace-pre-line">{form.confirmationNote}</span>
          ) : (
            "—"
          )}
        </ReadOnlyField>
        <ReadOnlyField
          label="Reminder email"
          htmlFor="registrant-emails-reminderEnabled"
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
      </FieldGroup>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        {registrationOffNote}

        <Field>
          <FieldLabel htmlFor="registrant-emails-confirmationNote">
            Confirmation email note
          </FieldLabel>
          <Textarea
            id="registrant-emails-confirmationNote"
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

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="registrant-emails-reminderEnabled">
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
            id="registrant-emails-reminderEnabled"
            checked={form.reminderEnabled}
            onCheckedChange={(checked) => update("reminderEnabled", checked)}
          />
        </Field>

        {form.reminderEnabled && (
          <>
            <Field>
              <FieldLabel htmlFor="registrant-emails-reminderDaysBefore">
                Days before the event
              </FieldLabel>
              <Input
                id="registrant-emails-reminderDaysBefore"
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
              <FieldLabel htmlFor="registrant-emails-reminderIntro">
                Reminder intro
              </FieldLabel>
              <Textarea
                id="registrant-emails-reminderIntro"
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
