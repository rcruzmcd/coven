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
import { updateEventRegistrationAction } from "./actions";
import type { EventRow } from "./event-badges";
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
import {
  datetimeLocalToUtcIsoInBrowser,
  utcIsoToDatetimeLocalInBrowser,
} from "@/lib/time";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";
import {
  MINIMUM_AGES,
  minimumAgeLabel,
  parseMinimumAge,
} from "@/lib/adults-only";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function toDatetimeLocalValue(iso: string | null) {
  // The browser's zone, so the prefill and the save agree (#1063).
  return utcIsoToDatetimeLocalInBrowser(iso);
}

/** #1782. The Select's value for no age requirement. */
const NO_MINIMUM_AGE = "none";

const MINIMUM_AGE_ITEMS = [
  { value: NO_MINIMUM_AGE, label: "None" },
  ...MINIMUM_AGES.map((age) => ({
    value: String(age),
    label: minimumAgeLabel(age),
  })),
];

function minimumAgeChoice(stored: number | null | undefined): string {
  const age = parseMinimumAge(stored);
  return age === null ? NO_MINIMUM_AGE : String(age);
}

function minimumAgeItemLabel(value: string): string {
  return (
    MINIMUM_AGE_ITEMS.find((item) => item.value === value)?.label ?? "None"
  );
}

function formStateFor(event: EventRow) {
  return {
    capacity: event.capacity === null ? "" : String(event.capacity),
    registrationEnabled: event.registration_enabled,
    registrationDeadline: toDatetimeLocalValue(event.registration_deadline),
    minimumAge: minimumAgeChoice(event.minimum_age),
    carpoolsEnabled: event.carpools_enabled ?? false,
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

export type RegistrationTabHandle = {
  discard: () => void;
};

/**
 * #1778. Who can register and what they are asked. Since #1777 the settings
 * it used to carry live on the cards they affect: auto-assign on Discount
 * codes, group chat on Registrants, carpool details on Carpools, and the
 * confirmation note and reminder on Registrant emails.
 */
export function RegistrationTab({
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
  ref?: Ref<RegistrationTabHandle>;
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
      "minimumAge",
      form.minimumAge === NO_MINIMUM_AGE ? "" : form.minimumAge,
    );
    formData.set("carpoolsEnabled", form.carpoolsEnabled ? "on" : "off");
    // Only when changed, so saving a deadline does not rewrite every option
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
      await runAction(() => updateEventRegistrationAction(event.id, formData), {
        success: "Registration settings saved.",
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
        <Field orientation="responsive">
          <ReadOnlyField
            label="Registration"
            htmlFor="registration-registrationEnabled"
          >
            {form.registrationEnabled ? "Enabled" : "Disabled"}
          </ReadOnlyField>
          <ReadOnlyField
            label="Registration deadline"
            htmlFor="registration-registrationDeadline"
          >
            {formatDateTime(event.registration_deadline)}
          </ReadOnlyField>
        </Field>
        <ReadOnlyField label="Capacity" htmlFor="registration-capacity">
          {form.capacity || "—"}
        </ReadOnlyField>
        <ReadOnlyField
          label="Per-person options"
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
          label="Age requirement"
          htmlFor="registration-minimumAge"
        >
          {minimumAgeItemLabel(form.minimumAge)}
        </ReadOnlyField>
        <ReadOnlyField
          label="Organize carpools"
          htmlFor="registration-carpoolsEnabled"
        >
          {form.carpoolsEnabled ? "On" : "Off"}
        </ReadOnlyField>
        <ReadOnlyField
          label="Additional questions"
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
        <Field orientation="horizontal">
          <Checkbox
            id="registration-registrationEnabled"
            checked={form.registrationEnabled}
            onCheckedChange={(checked) => toggleRegistration(Boolean(checked))}
          />
          <FieldLabel htmlFor="registration-registrationEnabled">
            Registration enabled
          </FieldLabel>
        </Field>

        <Field>
          <FieldLabel htmlFor="registration-registrationDeadline">
            Registration deadline
          </FieldLabel>
          <Input
            id="registration-registrationDeadline"
            type="datetime-local"
            disabled={!form.registrationEnabled}
            max={registrationCutoff || undefined}
            value={form.registrationDeadline}
            onChange={(changeEvent) =>
              update("registrationDeadline", changeEvent.target.value)
            }
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="registration-capacity">Capacity</FieldLabel>
          <Input
            id="registration-capacity"
            type="number"
            min={0}
            step={1}
            value={form.capacity}
            onChange={(changeEvent) =>
              update("capacity", changeEvent.target.value)
            }
          />
        </Field>

        <RegistrationOptionsEditor
          value={form.registrationOptions}
          onChange={(next) => update("registrationOptions", next)}
          disabled={isPending}
        />

        <Field>
          <FieldLabel htmlFor="registration-minimumAge">
            Age requirement
          </FieldLabel>
          <Select
            value={form.minimumAge}
            items={MINIMUM_AGE_ITEMS}
            onValueChange={(value) => {
              if (value !== null) update("minimumAge", String(value));
            }}
          >
            <SelectTrigger id="registration-minimumAge" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINIMUM_AGE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Shows the age as a badge on the event and asks each registrant to
            confirm everyone in their party is that age or over.
          </FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="registration-carpoolsEnabled">
              Organize carpools
            </FieldLabel>
            <FieldDescription>
              Adds a Carpools section for planning cars, drivers and passengers,
              and who has paid their driver. Only staff see it. Seats and the
              cost notice are set on that card.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="registration-carpoolsEnabled"
            checked={form.carpoolsEnabled}
            onCheckedChange={(checked) => update("carpoolsEnabled", checked)}
          />
        </Field>

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
