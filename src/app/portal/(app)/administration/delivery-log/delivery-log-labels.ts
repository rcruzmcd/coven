import {
  ARTWORK_SUBMISSION_CONFIRMATION_KIND,
  CONTACT_MESSAGE_CONFIRMATION_KIND,
  NOTIFICATION_KINDS,
} from "@/lib/notifications/kinds";
import { AUTO_REPLIES } from "@/lib/notifications/auto-replies";

/**
 * What each `notification_deliveries.kind` is called on the delivery log
 * (#1310).
 *
 * `kind` is free text, not an enum, on purpose: adding a kind is a constant
 * and a sender, never a migration. That leaves nowhere central to read a label
 * from, so this module assembles one from the two registries that already hold
 * labels and fills the gap with a map of its own:
 *
 *   * `AUTO_REPLIES` first, because its labels are written as names of
 *     messages -- "Event registration confirmation" -- which is what a log row
 *     is.
 *   * `NOTIFICATION_KINDS` next, whose labels are written as names of
 *     *switches* -- "Daily task reminders" -- and read acceptably as a kind.
 *   * `UNREGISTERED_KIND_LABELS` for everything neither registry holds: the
 *     kinds that are correspondence rather than a subscription
 *     (`staff_message`), addressed to an inbox rather than a person
 *     (`ops_report`), or part of an account flow nobody can switch off.
 *
 * Those nine keys are written out as literals rather than imported from the
 * senders that define them, because three of those senders are `server-only`
 * and this module is on the path of a plain URL-parsing test. The spellings
 * are pinned against the real constants in delivery-log-labels.test.ts, which
 * pays the cost of that import once and in one place.
 */
const UNREGISTERED_KIND_LABELS: Record<string, string> = {
  staff_message: "Message from staff",
  ops_report: "Leadership operations report",
  email_change_confirmation: "Sign-in email change confirmation",
  email_changed: "Sign-in email changed notice",
  notification_email_confirmation: "Notification address confirmation",
  notification_email_changed: "Notification address changed notice",
  sign_in_code: "Sign-in code",
  auto_reply_test: "Automatic reply test send",
  event_access_granted: "Event access given",
  event_media_upload_link: "Event media upload link",
};

/**
 * Every kind a reader can filter by, in the order the filter offers them:
 * whatever a person can subscribe to, then the rest.
 */
export const DELIVERY_KIND_VALUES: readonly string[] = [
  ...NOTIFICATION_KINDS.map((kind) => kind.key),
  ...Object.keys(UNREGISTERED_KIND_LABELS),
];

function humanize(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function deliveryKindLabel(kind: string): string {
  const autoReply = AUTO_REPLIES.find((reply) => reply.kind === kind);
  if (autoReply) return autoReply.label;

  const registered = NOTIFICATION_KINDS.find((entry) => entry.key === kind);
  if (registered) return registered.label;

  // A kind from a newer deploy than this map, rendered readably rather than as
  // raw snake_case.
  return UNREGISTERED_KIND_LABELS[kind] ?? humanize(kind);
}

/**
 * Who a row with no `person_id` went to (#1310).
 *
 * The ledger stores no address of its own -- deliberately, because widening it
 * would widen what a retention purge has to clear, for a screen whose question
 * is "did it go?" rather than "what did it say?". So a row addressed to
 * somebody outside the directory is named by what the send was, which is the
 * one thing the row does know. Three kinds can produce one:
 *
 *   * `ops_report` always, because the recipients are an app_settings list of
 *     inboxes (20260907120000).
 *   * the contact-message and artwork receipts when the sender's address
 *     matched no `people` row -- both forms accept a stranger, and neither
 *     mints a directory record for one.
 */
const ANONYMOUS_RECIPIENT_LABELS: Record<string, string> = {
  ops_report: "The organization's ops report inbox",
  [CONTACT_MESSAGE_CONFIRMATION_KIND]: "The person who wrote in",
  [ARTWORK_SUBMISSION_CONFIRMATION_KIND]: "The person who submitted artwork",
};

export function anonymousRecipientLabel(kind: string): string {
  return ANONYMOUS_RECIPIENT_LABELS[kind] ?? "Someone outside the directory";
}
