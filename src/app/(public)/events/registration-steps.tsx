"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { trackForm, useFormStarted } from "@/lib/analytics/form-events";
import { useCloseRegistration } from "./event-registration-disclosure";
import { REGISTRATION_STEPS, type RegistrationStep } from "./registration-step";

type Validatable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The first control under `root` that would block a submission, if any. */
function firstInvalid(root: HTMLElement | null): Validatable | null {
  if (!root) return null;
  const controls = root.querySelectorAll<Validatable>(
    "input, select, textarea",
  );
  for (const control of controls) {
    if (control.willValidate && !control.checkValidity()) return control;
  }
  return null;
}

/** One answer in the review step's summary. */
export type RegistrationSummaryRow = { label: string; value: ReactNode };

const LEGENDS: Record<RegistrationStep, string> = {
  about: "About you",
  event: "This event",
  review: "Review and agree",
};

/**
 * The frame both registration forms share (#1403, #1413): "About you", then
 * "This event", then "Review and agree" with the button in a bar pinned
 * beneath them.
 *
 * **Three steps at every width** (#1413). #1403 stepped on a phone only and
 * showed a wider screen one long page; a wider screen gets the same steps now,
 * so there is one flow to design, test and support rather than two, and the
 * button is only ever beside the summary and the agreement it acts on.
 *
 * **No URL per step**, for #1256's reason: "I am halfway through a form" is
 * not worth a history entry, and Back belongs to the page. The other steps
 * are `hidden` rather than unmounted, and the values live in the form's own
 * state either way, so going back and forth keeps everything typed.
 *
 * **Validation is done here, not by the browser** (`noValidate`). The browser
 * would refuse to submit over a required field on a hidden step and could not
 * show it, which is a button that silently does nothing. So "Next" checks the
 * step it leaves, submitting checks all of them, and an invalid field brings
 * its own step back into view before the browser's message is shown. A server
 * error does the same through `error.step`.
 *
 * **The pinned bar (#1404).** Opaque, full width, with a rule above it, so
 * what scrolls beneath is covered rather than half-visible. It is the last
 * child of the tall `FieldGroup`, which is what it travels within, so at full
 * scroll it settles into place below the last field and never covers one for
 * good. The fields carry a bottom scroll margin of the bar's height, so a
 * field that focus or a validation message scrolls into view lands above the
 * bar rather than beneath it.
 *
 * **The bar's buttons sit on the right** (#1427), the primary action last:
 * Cancel where the disclosure the form is in can be closed, Back after the
 * first step, then Next or "Complete registration".
 */
export function RegistrationSteps({
  eventId,
  about,
  event,
  review,
  summary,
  error,
  isPending,
  onSubmit,
  submitVariant = "default",
  eventLegend = LEGENDS.event,
}: {
  /** The event being registered for, which every funnel event names (#1480). */
  eventId: string;
  /** "About you": the questions about the registrant. */
  about: ReactNode;
  /** "This event": the questions about this attendance and the party. */
  event: ReactNode;
  /**
   * The notices and the agreement, under the summary on "Review and agree".
   * Null when a form has none, which leaves the summary on its own.
   */
  review: ReactNode;
  /**
   * What was answered on the first two steps, shown on the last with an Edit
   * button back to each. Unanswered questions are left out rather than listed
   * as blank.
   */
  summary: { about: RegistrationSummaryRow[]; event: RegistrationSummaryRow[] };
  /** The last server error, placed on the step that owns it. */
  error: { message: string; step: RegistrationStep } | null;
  isPending: boolean;
  /** Called once every field on every step is valid. */
  onSubmit: () => void;
  submitVariant?: "default" | "rainbow";
  /**
   * The second step's name. "Your riding" where the tenant asks the riding
   * questions there (#1415), which then make up most of it.
   */
  eventLegend?: string;
}) {
  const [step, setStep] = useState<RegistrationStep>("about");
  const close = useCloseRegistration();
  const formRef = useRef<HTMLFormElement>(null);
  const stepRefs = useRef<Record<RegistrationStep, HTMLFieldSetElement | null>>(
    { about: null, event: null, review: null },
  );
  const errorRef = useRef<HTMLDivElement>(null);
  const startTracking = useFormStarted("event_registration", {
    event_id: eventId,
  });
  const legends = { ...LEGENDS, event: eventLegend };
  const index = REGISTRATION_STEPS.indexOf(step);
  const isLast = index === REGISTRATION_STEPS.length - 1;

  // A new server error moves the reader to its step, during render rather than
  // in an effect, so the scroll below finds the alert already on screen.
  const [shownError, setShownError] = useState(error);
  if (error !== shownError) {
    setShownError(error);
    if (error) setStep(error.step);
  }

  useEffect(() => {
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [shownError]);

  /** Shows `next` and hands it focus, so a screen reader hears its legend. */
  function goTo(next: RegistrationStep) {
    flushSync(() => setStep(next));
    trackForm("event_registration", "form_step_viewed", {
      event_id: eventId,
      step: next,
    });
    const target = stepRefs.current[next];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start" });
  }

  function handleNext() {
    const invalid = firstInvalid(stepRefs.current[step]);
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    goTo(REGISTRATION_STEPS[index + 1]);
  }

  /**
   * Enter in a text field before the last step means "Next". The browser
   * will not do it: those steps have no submit button, and without one a form
   * with more than one field does not submit on Enter at all.
   */
  function handleKeyDown(keyEvent: KeyboardEvent<HTMLFormElement>) {
    if (isLast || keyEvent.key !== "Enter" || keyEvent.nativeEvent.isComposing)
      return;
    const target = keyEvent.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (["button", "checkbox", "radio", "submit"].includes(target.type)) return;
    keyEvent.preventDefault();
    handleNext();
  }

  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    // Only the last step has a submit button, so nothing the reader does
    // submits before it; anything that does is ignored.
    if (!isLast) return;

    const invalid = firstInvalid(formRef.current);
    if (invalid) {
      const owner =
        REGISTRATION_STEPS.find((candidate) =>
          stepRefs.current[candidate]?.contains(invalid),
        ) ?? step;
      if (owner !== step) flushSync(() => setStep(owner));
      invalid.reportValidity();
      return;
    }

    trackForm("event_registration", "form_submitted", { event_id: eventId });
    onSubmit();
  }

  const errorAlert = (owner: RegistrationStep) =>
    error?.step === owner && (
      <div ref={errorRef} className="scroll-my-24">
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );

  const fieldSet = (owner: RegistrationStep, children: ReactNode) => (
    <FieldSet
      ref={(element) => {
        stepRefs.current[owner] = element;
      }}
      tabIndex={-1}
      hidden={step !== owner}
      className="scroll-mt-24 outline-none"
    >
      <FieldLegend>
        <span className="app-muted block text-xs font-normal">
          Step {REGISTRATION_STEPS.indexOf(owner) + 1} of{" "}
          {REGISTRATION_STEPS.length}
        </span>
        {legends[owner]}
      </FieldLegend>
      {errorAlert(owner)}
      <FieldGroup>{children}</FieldGroup>
    </FieldSet>
  );

  const summarySection = (
    owner: "about" | "event",
    rows: RegistrationSummaryRow[],
  ) => (
    <section
      aria-labelledby={`registration-summary-${owner}`}
      className="rounded-lg border p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id={`registration-summary-${owner}`}
          className="text-sm font-medium"
        >
          {legends[owner]}
        </h3>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => goTo(owner)}
          disabled={isPending}
          aria-label={`Edit ${legends[owner].toLowerCase()}`}
        >
          Edit
        </Button>
      </div>
      {/* A question's prompt (#1501) is a sentence, not a word: on a phone the
          label sits above its answer, and beside it the label column is
          capped so a long prompt cannot squeeze the answer to a sliver. */}
      <dl className="mt-2 grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-[fit-content(14rem)_minmax(0,1fr)] sm:gap-y-1 [&>div:last-child>dd]:mb-0">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="app-muted min-w-0 break-words">{row.label}</dt>
            <dd className="mb-2 min-w-0 break-words whitespace-pre-line sm:mb-0">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );

  return (
    <form
      ref={formRef}
      data-registration-steps=""
      {...startTracking}
      noValidate
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      // The bar's height, give or take, so nothing focus or a validation
      // message scrolls to lands underneath it (#1404).
      className="[&_button]:scroll-mb-24 [&_input]:scroll-mb-24 [&_textarea]:scroll-mb-24"
    >
      <FieldGroup>
        {fieldSet("about", about)}
        {fieldSet("event", event)}
        {fieldSet(
          "review",
          <>
            {summarySection("about", summary.about)}
            {summarySection("event", summary.event)}
            {review}
          </>,
        )}

        {/* The last child of the outer `FieldGroup`, which is its containing
            block and what it travels within -- see the comment above. `-mx-4
            px-4` carries the backdrop out to the edges of the card the form
            sits in, whose content has that padding, so text does not show at
            either side of it. The `env()` resolves to 0 until a layout
            exports `viewport-fit=cover`. */}
        <div className="bg-card sticky bottom-0 z-10 -mx-4 flex justify-end gap-3 border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {close && (
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={isPending}
            >
              Cancel
            </Button>
          )}
          {index > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => goTo(REGISTRATION_STEPS[index - 1])}
              disabled={isPending}
            >
              Back
            </Button>
          )}
          {/* Keyed apart: were Next reused as the submit button, its `type`
              would change under the click that pressed it, and the click's
              default action would then submit the form from the step before
              the review. */}
          {isLast ? (
            // Not "Register": that is the disclosure's trigger above the form
            // (#1256), and two buttons of the same name in one section are
            // one for the reader to disambiguate and one for a test to pick
            // the wrong one of.
            <Button
              key="submit"
              type="submit"
              variant={submitVariant}
              disabled={isPending}
              className="flex-1 sm:flex-none"
            >
              {isPending ? "Registering…" : "Complete registration"}
            </Button>
          ) : (
            <Button
              key="next"
              type="button"
              variant={submitVariant}
              onClick={handleNext}
              className="flex-1 sm:flex-none"
            >
              Next
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
