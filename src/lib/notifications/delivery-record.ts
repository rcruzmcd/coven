/**
 * The vocabulary of one row in `notification_deliveries` (#1310): its four
 * statuses, the reasons a send was skipped, and what a reader should be told
 * each of them means.
 *
 * Separate from the sender (`deliver.ts`, which is `server-only`) and from the
 * kinds registry, and with zero runtime imports of its own, for the same
 * reason `@/lib/notifications/kinds` has none: the delivery log's detail sheet
 * is a client component and must be able to say "this was skipped because they
 * opted out" without a Supabase client following it into the browser bundle.
 */

/** Every value the table's status check constraint allows (20260906140000). */
export const DELIVERY_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * Why a send was skipped, as stored in `skip_reason` (20260919060000).
 *
 * Only `opted_out` is written today -- it is the one decision `deliverEmail()`
 * makes for itself. The other three are made by the caller before a delivery
 * row is claimed, so they leave no row at all; they are listed here because
 * the column's check constraint accepts them, and because the screen has to
 * name them as the explanation for mail that appears in the log nowhere.
 */
export const DELIVERY_SKIP_REASONS = [
  "opted_out",
  "no_address",
  "org_email_off",
  "auto_reply_off",
] as const;

export type DeliverySkipReason = (typeof DELIVERY_SKIP_REASONS)[number];

export const DELIVERY_SKIP_REASON_LABELS: Record<DeliverySkipReason, string> = {
  opted_out: "The recipient turned this kind of email off",
  no_address: "No email address on file for the recipient",
  org_email_off: "Email is switched off for the whole organization",
  auto_reply_off: "This automatic reply is switched off",
};

export function deliverySkipReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return (
    DELIVERY_SKIP_REASON_LABELS[reason as DeliverySkipReason] ??
    // A reason the check constraint accepts but this build has no copy for --
    // a deployment mid-migration, not a bug worth blanking the cell over.
    reason
  );
}

/**
 * What the provider reported after accepting a message (#1921), as stored in
 * `provider_event`. Both mean the address should not be mailed this way again;
 * a complaint has also switched this kind off for the recipient.
 */
export const DELIVERY_PROVIDER_EVENT_LABELS: Record<string, string> = {
  bounced: "Bounced: the recipient's mail server refused it permanently",
  complained:
    "Marked as spam by the recipient, so this kind of email is now off for them",
};

export function deliveryProviderEventLabel(
  event: string | null,
): string | null {
  if (!event) return null;
  return DELIVERY_PROVIDER_EVENT_LABELS[event] ?? event;
}

/**
 * How long a claimed row may sit at 'pending' before it should be read as
 * stuck rather than as in flight.
 *
 * A row is inserted, the provider is called, and the row is updated -- the
 * whole sequence is one request. Anything still pending an hour later is a
 * crash between the claim and the finalize, or a finalize that failed on its
 * own (deliverEmail() logs that case and leaves the row alone, deliberately,
 * because a finalize failure must not be reported as a failed send). An hour
 * is generous on purpose: the cost of calling a live send stuck is a reader
 * chasing nothing, and the cost of calling a stuck row live is the bug this
 * screen exists to surface.
 */
export const DELIVERY_PENDING_STUCK_MS = 60 * 60 * 1000;

/**
 * Whether a pending row has been pending long enough to be worth pointing at.
 * Anything that is not 'pending' is never stuck: it finished.
 */
export function isDeliveryStuck(
  status: string,
  createdAt: string | null,
  now: Date = new Date(),
): boolean {
  if (status !== "pending" || !createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created >= DELIVERY_PENDING_STUCK_MS;
}

/**
 * How long ago something happened, in the coarsest unit that still says
 * something: "4 minutes", "3 hours", "2 days".
 *
 * Only used for a stuck row's age, where the point is the order of magnitude
 * -- half an hour is a slow request and a week is a row nobody will ever
 * finalize. Computed on the server and passed down as a string, because a
 * client component re-deriving it from `Date.now()` would disagree with the
 * markup it is hydrating.
 */
export function formatDeliveryAge(
  createdAt: string,
  now: Date = new Date(),
): string {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return "an unknown time";

  const minutes = Math.max(0, Math.floor((now.getTime() - created) / 60000));
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return plural(hours, "hour");
  return plural(Math.floor(hours / 24), "day");
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
