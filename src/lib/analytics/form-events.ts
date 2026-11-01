import { useRef, type SyntheticEvent } from "react";
import type { RegistrationStep } from "@/app/(public)/events/registration-step";

/**
 * Every event the public site sends to PostHog about a form (#1710), and the
 * only properties each may carry. One generic set for every form, told apart
 * by `form`, so a single PostHog funnel -- `form_viewed` -> `form_started` ->
 * `form_completed`, filtered on `form` -- works for all of them. The gear
 * cart's few steps before its checkout form are here too (`GearEvents`), as
 * are the few signals beyond forms (`SiteEvents`, #1714), so the allowlist
 * stays in one file.
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

/**
 * `leaving` marks an event sent as the page navigates away (a link out, a
 * donate button), so it goes by beacon rather than wait for the next batch.
 */
type Capture = (
  event: string,
  properties: Record<string, string>,
  options?: { leaving?: boolean },
) => void;

/**
 * Set by the provider once PostHog has loaded, and null everywhere it has not:
 * a tenant without the `form_analytics` module, any deploy that is not
 * production, the portal. Holding the function rather than importing
 * `posthog-js` here keeps the library out of the bundle of every page that
 * merely renders a form.
 */
let capture: Capture | null = null;

/**
 * Events sent while PostHog is still loading, or null when nothing is. A form
 * that sends `form_viewed` on mount, or a page-not-found, fires before the
 * dynamic import resolves on a page's first load, and would otherwise be
 * dropped. Capped, since a load that never finishes must not grow it.
 */
type Pending = [string, Record<string, string>, { leaving?: boolean }?];
let pending: Pending[] | null = null;
const PENDING_LIMIT = 50;

/**
 * Called by the provider as it starts loading PostHog, and only then, so a
 * page with analytics off holds nothing. It sits above the page in the public
 * layout, so its effect runs before any form's.
 */
export function holdFormEvents(): void {
  pending ??= [];
}

export function setFormCapture(next: Capture | null): void {
  capture = next;
  const held = pending ?? [];
  pending = null;
  if (next) for (const args of held) next(...args);
}

/** What `send` hands on: to PostHog once loaded, to the queue while loading. */
function deliver(
  event: string,
  sent: Record<string, string>,
  options?: { leaving?: boolean },
): void {
  if (capture) capture(event, sent, options);
  else if (pending && pending.length < PENDING_LIMIT)
    pending.push([event, sent, options]);
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
  if (!context || !extra) return;
  const submitted =
    event === "form_submitted"
      ? (FORM_SUBMITTED_PROPERTIES[form] as readonly string[])
      : [];
  send(event, { form }, [...context, ...extra, ...submitted], properties);
}

function send(
  event: string,
  sent: Record<string, string>,
  allowed: readonly string[],
  properties: object,
  options?: { leaving?: boolean },
): void {
  for (const key of allowed) {
    const value = (properties as Record<string, unknown>)[key];
    if (typeof value === "string") sent[key] = value;
  }
  deliver(event, sent, options);
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
  if (!allowed) return;
  send(event, {}, allowed, properties ?? {});
}

/**
 * Signals beyond forms (#1714), each needing the privacy policy's wording
 * about "a few clicks and dead ends". None says who: a donate button's
 * placement is one of the fixed names in `DONATE_PLACEMENTS`, an outbound link
 * is its host alone, a missing page is its first path segment at most
 * (`notFoundPath()`), and a catalog filter is its name, never the value
 * picked.
 */
export type SiteEvents = {
  donate_clicked: { placement: DonatePlacement };
  outbound_clicked: { host: string };
  not_found: { path: string };
  gear_filter_applied: { filter: "type" | "condition" | "gender" };
};

export type SiteEventName = keyof SiteEvents;

const SITE_EVENT_PROPERTIES: Record<SiteEventName, readonly string[]> = {
  donate_clicked: ["placement"],
  outbound_clicked: ["host"],
  not_found: ["path"],
  gear_filter_applied: ["filter"],
};

/** Clicks that leave the page, so they go by beacon. */
const LEAVING: ReadonlySet<SiteEventName> = new Set([
  "donate_clicked",
  "outbound_clicked",
]);

/** Sends one site event, or does nothing when analytics is off. */
export function trackSite<E extends SiteEventName>(
  event: E,
  properties: SiteEvents[E],
): void {
  const allowed = SITE_EVENT_PROPERTIES[event];
  if (!allowed) return;
  send(event, {}, allowed, properties, {
    leaving: LEAVING.has(event),
  });
}

/**
 * Where on the site a donate button sits, set on the link as
 * `data-analytics-placement`. A link without one, or with a value not listed
 * here, is counted as `other` -- the attribute is markup, not an allowlist.
 */
export const DONATE_PLACEMENTS = [
  "support_page",
  "give_card",
  "give_card_amount",
  "other",
] as const;

export type DonatePlacement = (typeof DONATE_PLACEMENTS)[number];

/** Where `/support/donate` redirects to the giving provider. */
const DONATE_PATH = "/support/donate";

/**
 * What a click on a link sends, if anything (#1714): `donate_clicked` for the
 * donate redirect, `outbound_clicked` with the host alone for a web link to
 * another host, and nothing for anything else -- a link within the site, a
 * `mailto:`, a `tel:`.
 */
export function linkClickEvent(
  href: string,
  placement: string | undefined,
  here: string,
):
  | { event: "donate_clicked"; properties: SiteEvents["donate_clicked"] }
  | { event: "outbound_clicked"; properties: SiteEvents["outbound_clicked"] }
  | null {
  let url: URL;
  let origin: URL;
  try {
    origin = new URL(here);
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.host !== origin.host) {
    return { event: "outbound_clicked", properties: { host: url.hostname } };
  }
  if (url.pathname === DONATE_PATH) {
    const known = (DONATE_PLACEMENTS as readonly string[]).includes(
      placement ?? "",
    );
    return {
      event: "donate_clicked",
      properties: {
        placement: known ? (placement as DonatePlacement) : "other",
      },
    };
  }
  return null;
}

/**
 * A missing page's path, cut to something that cannot hold a token (#1714):
 * the first segment, and only when it reads as a route name -- lowercase
 * letters and hyphens. Anything else, a code or a mistyped id, is `/:other`.
 * `/artwork/AB12CD` is `/artwork`; `/Xk93jd` is `/:other`.
 */
export function notFoundPath(pathname: string): string {
  const first = pathname.split("/").find((segment) => segment !== "");
  if (first === undefined) return "/";
  return /^[a-z][a-z-]{0,39}$/.test(first) ? `/${first}` : "/:other";
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
