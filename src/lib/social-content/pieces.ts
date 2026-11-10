import { addDays } from "@/lib/time";

export const CONTENT_STATUSES = [
  { value: "not_planned", label: "Not planned" },
  { value: "idea", label: "Idea" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "skipped", label: "Skipped" },
] as const;

/**
 * The social content module shared by the calendar, events and `/portal/social`
 * (#1793): status vocabulary, the row shape and the date helpers. The form
 * parser is `./piece-form`, the Server Actions `./piece-actions`.
 */

/**
 * One social post or story (#1231). Since #1792 a piece stands on its own and
 * may be related to a calendar item (a community date), an event, both or
 * neither -- deleting either clears the link and keeps the piece.
 *
 * Stored in `content_opportunities`, which kept its name through the reshape
 * so its audit history and RLS policies carried over; everything a person
 * reads calls these social posts.
 */
export type ContentPieceRow = {
  id: string;
  calendar_item_id: string | null;
  event_id: string | null;
  title: string;
  content: string | null;
  content_status: string;
  skip_reason: string | null;
  internal_notes: string | null;
  owner_id: string | null;
  reviewer_id: string | null;
  lead_time_days: number;
  publish_due_at: string | null;
  review_due_at: string | null;
  draft_due_at: string | null;
  status_changed_by: string | null;
  status_changed_at: string | null;
};

/** Statuses a piece needs no more work in. */
const TERMINAL_STATUSES = new Set(["published", "skipped"]);

const STATUS_ORDER: readonly string[] = CONTENT_STATUSES.map(
  (option) => option.value,
);

/**
 * The one status that stands for a whole calendar item's content, for the
 * badge the list and agenda views show beside an item.
 *
 * The least-advanced piece still needing work, because that is what says how
 * far the item as a whole actually is: an item with one published post and one
 * untouched idea is not published. Once every piece is terminal the item is
 * done, and `published` is the truer summary of a mixed published/skipped set
 * than `skipped` would be.
 */
export function summaryContentStatus(
  pieces: Pick<ContentPieceRow, "content_status">[],
): string | null {
  if (pieces.length === 0) return null;

  const open = pieces.filter(
    (piece) => !TERMINAL_STATUSES.has(piece.content_status),
  );
  if (open.length > 0) {
    return open.reduce((least, piece) =>
      STATUS_ORDER.indexOf(piece.content_status) <
      STATUS_ORDER.indexOf(least.content_status)
        ? piece
        : least,
    ).content_status;
  }
  return pieces.some((piece) => piece.content_status === "published")
    ? "published"
    : "skipped";
}

/**
 * The deadline a piece is working towards: the earliest of its draft, review
 * and publish dates still ahead. Once they have all passed there is nothing
 * left to count down to, so the last of them -- normally the publish date --
 * is what the list shows.
 */
export function nextDueAt(
  piece: Pick<
    ContentPieceRow,
    "draft_due_at" | "review_due_at" | "publish_due_at"
  >,
  now: Date = new Date(),
): string | null {
  const due = [piece.draft_due_at, piece.review_due_at, piece.publish_due_at]
    .filter((value): value is string => Boolean(value))
    .sort();
  return due.find((value) => new Date(value) >= now) ?? due.at(-1) ?? null;
}

/**
 * Only meaningful once a piece has a publish date: a piece with none sits
 * unscheduled, and there is nothing to count back from.
 *
 * 21-day lead time -> draft T-14, review T-7 (the issue's worked example):
 * the draft period is the first two-thirds of the lead time, the review
 * period is the last third.
 */
export function leadTimeSchedule(
  publishDueAt: Date,
  leadTimeDays: number,
): { draftDueAt: Date; reviewDueAt: Date } {
  return {
    draftDueAt: addDays(publishDueAt, -Math.round((leadTimeDays * 2) / 3)),
    reviewDueAt: addDays(publishDueAt, -Math.round(leadTimeDays / 3)),
  };
}
