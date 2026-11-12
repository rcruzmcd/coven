"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { CircleCheck } from "lucide-react";
import { GearAsIsNotice } from "@/components/gear-as-is-notice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { AcknowledgementView } from "@/lib/distribution-acknowledgement";
import { GEAR_AS_IS_CONSENT_LABEL } from "@/lib/gear-as-is";
import { applyLexicon, DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";

export type AcknowledgeInput = { typedName: string; acknowledged: boolean };

/** The sentence above the items: a handout is in front of them; a request's
 *  items may already be on their way, or with them (#1518). */
function acknowledgementIntro(view: AcknowledgementView): string {
  if (view.kind === "gear_request") {
    return "You asked for these before we started asking everyone to read this note, so please read it now.";
  }
  if (view.kind === "handout_link") {
    return view.eventName
      ? `You took these from ${view.eventName} before reading this note, so please read it now.`
      : "You took these before reading this note, so please read it now.";
  }
  return view.eventName
    ? `Before you take these from ${view.eventName}, please read this.`
    : "Before you take these, please read this.";
}

/**
 * The recipient's as-is acknowledgement (#1519): the same summary and the same
 * required box as the public gear request (#1367), plus their name typed by
 * them. Rendered on the recipient's own phone behind the handout's one-time
 * QR code (`AsIsAcknowledgementForm`), and on the staff device when it is
 * handed over (inside the checkout's own form surface) -- one set of fields,
 * so the two cannot show different words.
 *
 * The words shown come from `gearAsIsSummary()`; the words *stored* are
 * resolved again by the server action, never sent from here.
 *
 * Controlled, with no `<form>` of its own, so each caller owns its submit.
 */
export function AsIsAcknowledgementFields({
  view,
  lexicon = DEFAULT_LEXICON,
  termsInForce = false,
  value,
  onChange,
  disabled = false,
}: {
  view: AcknowledgementView;
  lexicon?: Lexicon;
  termsInForce?: boolean;
  value: AcknowledgeInput;
  onChange: (next: AcknowledgeInput) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p>
          {view.firstName ? `Hi ${view.firstName}. ` : ""}
          {acknowledgementIntro(view)}
        </p>
        {view.items.length > 0 && (
          <ul className="list-disc pl-5 text-sm">
            {view.items.map((item, index) => (
              <li key={index}>
                {item.size
                  ? `${item.description} (${item.size})`
                  : item.description}
              </li>
            ))}
          </ul>
        )}
      </div>

      <GearAsIsNotice lexicon={lexicon} termsInForce={termsInForce} />

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-name`} required>
            Your name
          </FieldLabel>
          <Input
            id={`${id}-name`}
            autoComplete="name"
            required
            maxLength={200}
            value={value.typedName}
            onChange={(event) =>
              onChange({ ...value, typedName: event.target.value })
            }
            disabled={disabled}
          />
        </Field>
        {/* Unticked, and `required` rather than a disabled submit, as on the
            gear request: the browser says what is missing, and the database
            refuses it independently. */}
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-as-is`}
            checked={value.acknowledged}
            onCheckedChange={(next) =>
              onChange({ ...value, acknowledged: next === true })
            }
            disabled={disabled}
            required
          />
          <FieldLabel htmlFor={`${id}-as-is`} required>
            {applyLexicon(GEAR_AS_IS_CONSENT_LABEL, lexicon)}
          </FieldLabel>
        </Field>
      </FieldGroup>
    </div>
  );
}

/** The fields with their own submit, for the recipient's phone. */
export function AsIsAcknowledgementForm({
  view,
  lexicon = DEFAULT_LEXICON,
  termsInForce = false,
  onAcknowledge,
}: {
  view: AcknowledgementView;
  lexicon?: Lexicon;
  termsInForce?: boolean;
  onAcknowledge: (
    input: AcknowledgeInput,
  ) => Promise<{ success: true } | { error: string }>;
}) {
  const [value, setValue] = useState<AcknowledgeInput>({
    typedName: "",
    acknowledged: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onAcknowledge(value);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <Alert>
        <CircleCheck />
        <AlertDescription>
          {view.kind !== "handout"
            ? `Thank you, ${value.typedName.trim()}. We've recorded it — there's nothing else you need to do.`
            : `Thank you, ${value.typedName.trim()}. You're all set — the person handing you the items can see it now.`}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <AsIsAcknowledgementFields
        view={view}
        lexicon={lexicon}
        termsInForce={termsInForce}
        value={value}
        onChange={setValue}
        disabled={isPending}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        disabled={isPending}
        focusableWhenDisabled
        className="w-full sm:w-fit"
      >
        {isPending ? (
          <>
            <Spinner /> Saving...
          </>
        ) : (
          "I understand"
        )}
      </Button>
    </form>
  );
}
