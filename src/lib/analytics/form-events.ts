import { useRef, type SyntheticEvent } from "react";
import type { RegistrationStep } from "@/app/(public)/events/registration-step";

/**
 * Every event the public site sends to PostHog about a form (#1710), and the
 * only properties each may carry. One generic set for every form, told apart
 * by `form`, so a single PostHog funnel -- `form_viewed` -> `form_started` ->
 * `form_completed`, filtered on `form` -- works for all of them. The gear
 * cart's few steps before its checkout form are here too (`GearEvents`), so
 * the allowlist stays in one file.
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
  contact: never;
  gear_request: never;
  volunteer_application: never;
  volunteer_status_lookup: never;
  artwork_submission: never;
  registration_answers: never;
  my_sign_in: never;
  my_claim: never;
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
  contact: Record<never, never>;
  gear_request: Record<never, never>;
  volunteer_application: Record<never, never>;
  volunteer_status_lookup: Record<never, never>;
  artwork_submission: Record<never, never>;
  registration_answers: Record<never, never>;
  my_sign_in: Record<never, never>;
  my_claim: Record<never, never>;
};

const FORM_CONTEXT_PROPERTIES: {
  [F in FormName]: readonly (keyof FormContext[F])[];
} = {
  event_registration: ["event_id"],
  contact: [],
  gear_request: [],
  volunteer_application: [],
  volunteer_status_lookup: [],
  artwork_submission: [],
  registration_answers: [],
  my_sign_in: [],
  my_claim: [],
};

/**
 * What a form adds to `form_submitted` alone. A gear request's item count
 * (#1711) is a number of catalog items, nobody's detail. A contact message's
 * topic (#1713) is one of the fixed values in `CONTACT_TOPICS`, never its
 * label -- `topic = gear` is the gear donation funnel, since the donate page
 * has no form of its own and sends people to `/contact?topic=gear`. The `/my`
 * sign-in's `method` says which of its three ways was pressed.
 */
export type FormSubmitted = {
  event_registration: Record<never, never>;
  contact: { topic: string };
  gear_request: { item_count: string };
  volunteer_application: Record<never, never>;
  volunteer_status_lookup: Record<never, never>;
  artwork_submission: Record<never, never>;
  registration_answers: Record<never, never>;
  my_sign_in: { method: "password" | "sign_up" | "google" };
  my_claim: Record<never, never>;
};

const FORM_SUBMITTED_PROPERTIES: {
  [F in FormName]: readonly (keyof FormSubmitted[F])[];
} = {
  event_registration: [],
  contact: ["topic"],
  gear_request: ["item_count"],
  volunteer_application: [],
  volunteer_status_lookup: [],
  artwork_submission: [],
  registration_answers: [],
  my_sign_in: ["method"],
  my_claim: [],
};

/** `step` where a form has steps; a single-step form has none to name. */
type StepOf<F extends FormName> = [FormSteps[F]] extends [never]
  ? Record<never, never>
  : { step: FormSteps[F] };

export type FormEvents<F extends FormName> = {
  /** The form is shown: its sheet or disclosure opened, or it came into view. */
  form_viewed: Record<never, never>;
  /** The first input or pick in the form, once per form instance. */
  form_started: Record<never, never>;
  /** A step is reached, after the first (multi-step forms only). */
  form_step_viewed: { step: FormSteps[F] };
  /** Submit was pressed and the form passed the browser's validation. */
  form_submitted: FormSubmitted[F];
  /** The server accepted it. */
  form_completed: Record<never, never>;
  /** The server refused it. */
  form_failed: StepOf<F> & { error_code: string };
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
  const submitted =
    event === "form_submitted"
      ? (FORM_SUBMITTED_PROPERTIES[form] as readonly string[])
      : [];
  send(
    capture,
    event,
    { form },
    [...context, ...extra, ...submitted],
    properties,
  );
}

function send(
  to: Capture,
  event: string,
  sent: Record<string, string>,
  allowed: readonly string[],
  properties: object,
): void {
  for (const key of allowed) {
    const value = (properties as Record<string, unknown>)[key];
    if (typeof value === "string") sent[key] = value;
  }
  to(event, sent);
}

/**
 * The gear cart's steps before its checkout form (#1711): what is added, the
 * cart being opened, and the passphrase gate. No item id or name -- at most
 * the item's category key, which is the tenant's catalog vocabulary.
 */
export type GearEvents = {
  gear_added_to_cart: { category?: string };
  gear_cart_opened: Record<never, never>;
  /** The passphrase dialog opened, before an add or after a refused submit. */
  gear_passphrase_prompted: Record<never, never>;
  /** A wrong passphrase, in the dialog or held from before and refused. */
  gear_passphrase_rejected: Record<never, never>;
};

export type GearEventName = keyof GearEvents;

const GEAR_EVENT_PROPERTIES: Record<GearEventName, readonly string[]> = {
  gear_added_to_cart: ["category"],
  gear_cart_opened: [],
  gear_passphrase_prompted: [],
  gear_passphrase_rejected: [],
};

/** Sends one gear cart event, or does nothing when analytics is off. */
export function trackGear<E extends GearEventName>(
  event: E,
  properties?: GearEvents[E],
): void {
  const allowed = GEAR_EVENT_PROPERTIES[event];
  if (!capture || !allowed) return;
  send(capture, event, {}, allowed, properties ?? {});
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
