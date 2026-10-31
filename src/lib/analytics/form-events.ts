import { useRef, type SyntheticEvent } from "react";
import type { RegistrationStep } from "@/app/(public)/events/registration-step";

/**
 * Every event the public site sends to PostHog about a form (#1710), and the
 * only properties each may carry. One generic set for every form, told apart
 * by `form`, so a single PostHog funnel -- `form_viewed` -> `form_started` ->
 * `form_completed`, filtered on `form` -- works for all of them.
 *
 * This file is where the no-PII rule lives. Public forms hold names, phone
 * numbers, addresses and, on some tenants, a minor's and an emergency
 * contact's, so nothing about the person is ever a property here -- no name,
 * email, phone, record id of theirs or free text. What is allowed is the form,
 * the step, an RPC error *code* (never its message) and the per-form context
 * in `FORM_CONTEXT_PROPERTIES` below. `tenant` is not passed per call: the
 * provider registers it once for every event the page sends, `$pageview`
 * included.
 *
 * The maps are the allowlist. An object literal with a key outside them is a
 * type error at the call site, and anything that slips past the types is
 * dropped below before it leaves the browser.
 */

/** The steps of each form, `never` for a form without steps. */
export type FormSteps = {
  event_registration: RegistrationStep;
};

/** Every form that sends events: a closed list, so a typo is a type error. */
export type FormName = keyof FormSteps;

/**
 * Properties a form sends on every one of its events, typed per form.
 *
 * `event_id` is here on purpose (#1707): it is the event's id, not anybody's,
 * and per-event funnels are the main reason to count registrations at all.
 * This map is the only place it is allowed.
 */
export type FormContext = {
  event_registration: { event_id: string };
};

const FORM_CONTEXT_PROPERTIES: {
  [F in FormName]: readonly (keyof FormContext[F])[];
} = {
  event_registration: ["event_id"],
};

export type FormEvents<F extends FormName> = {
  /** The form is shown: its sheet or disclosure opened, or it came into view. */
  form_viewed: Record<never, never>;
  /** The first input or pick in the form, once per form instance. */
  form_started: Record<never, never>;
  /** A step is reached, after the first (multi-step forms only). */
  form_step_viewed: { step: FormSteps[F] };
  /** Submit was pressed and the form passed the browser's validation. */
  form_submitted: Record<never, never>;
  /** The server accepted it. */
  form_completed: Record<never, never>;
  /** The server refused it. */
  form_failed: { step: FormSteps[F]; error_code: string };
};

export type FormEventName = keyof FormEvents<FormName>;

const EVENT_PROPERTIES: Record<FormEventName, readonly string[]> = {
  form_viewed: [],
  form_started: [],
  form_step_viewed: ["step"],
  form_submitted: [],
  form_completed: [],
  form_failed: ["step", "error_code"],
};

type Capture = (event: string, properties: Record<string, string>) => void;

/**
 * Set by the provider once PostHog has loaded, and null everywhere it has not:
 * a tenant without the `form_analytics` module, any deploy that is not
 * production, the portal. Holding the function rather than importing
 * `posthog-js` here keeps the library out of the bundle of every page that
 * merely renders a form.
 */
let capture: Capture | null = null;

export function setFormCapture(next: Capture | null): void {
  capture = next;
}

/** Sends one form event, or does nothing when analytics is off. */
export function trackForm<F extends FormName, E extends FormEventName>(
  form: F,
  event: E,
  properties: FormContext[F] & FormEvents<F>[E],
): void {
  // A form or event outside the maps, past the types, is not sent at all.
  const context = FORM_CONTEXT_PROPERTIES[form] as
    readonly string[] | undefined;
  const extra = EVENT_PROPERTIES[event];
  if (!capture || !context || !extra) return;
  const sent: Record<string, string> = { form };
  for (const key of [...context, ...extra]) {
    const value = (properties as Record<string, unknown>)[key];
    if (typeof value === "string") sent[key] = value;
  }
  capture(event, sent);
}

/**
 * Controls whose pick fires no native `input` or `change` on the form: Base
 * UI's checkbox, radio, switch and select draw their own buttons.
 */
const PICK_SELECTOR =
  '[role="checkbox"], [role="radio"], [role="switch"], [role="option"]';

/**
 * Sends `form_started` the first time someone types or picks something in a
 * form, once per mounted form. Spread the result onto the `<form>`:
 *
 *     <form {...useFormStarted("event_registration", { event_id })}>
 *
 * Capture-phase handlers, so a field that stops propagation still counts.
 */
export function useFormStarted<F extends FormName>(
  form: F,
  context: FormContext[F],
) {
  const started = useRef(false);

  function start() {
    if (started.current) return;
    started.current = true;
    trackForm(
      form,
      "form_started",
      context as FormContext[F] & FormEvents<F>["form_started"],
    );
  }

  return {
    onInputCapture: start,
    onChangeCapture: start,
    onClickCapture: (clickEvent: SyntheticEvent) => {
      if (
        clickEvent.target instanceof Element &&
        clickEvent.target.closest(PICK_SELECTOR)
      )
        start();
    },
  };
}
