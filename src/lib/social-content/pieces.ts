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
 * What a post is on its platform (#1826). The value names the platform so a
 * second one can be added beside Instagram without a rename.
 */
export const POST_FORMATS = [
  { value: "instagram_post", label: "Instagram post" },
  { value: "instagram_reel", label: "Instagram reel" },
  { value: "instagram_story", label: "Instagram story" },
] as const;

export type PostFormat = (typeof POST_FORMATS)[number]["value"];

export function isPostFormat(value: unknown): value is PostFormat {
  return POST_FORMATS.some((option) => option.value === value);
}

export function postFormatLabel(format: string | null): string | null {
  return POST_FORMATS.find((option) => option.value === format)?.label ?? null;
}

/** The private bucket a post's photos and videos are stored in (#1826). */
export const SOCIAL_POST_MEDIA_BUCKET = "social-post-media";

/** Instagram's caption limit, shown as a count rather than enforced. */
export const CAPTION_MAX_LENGTH = 2200;

/** Instagram's collaborator limit, on posts and reels only. */
export const MAX_COLLABORATORS = 3;

/** What one post may hold, Instagram's carousel limit; the database agrees. */
export const MAX_POST_MEDIA = 10;

/** Stories take no caption and no collaborators. */
export function formatTakesCaption(format: PostFormat | null) {
  return format !== "instagram_story";
}

export function formatTakesCollaborators(format: PostFormat | null) {
  return format !== "instagram_story";
}

/**
 * How many more files a post can take, and of what kind, given its format
 * and what it already holds: a reel is one video, a story one file, anything
 * else up to the carousel limit. What the event media picker (#1827) lets
 * someone tick; `mediaFormatIssue` is the warning for what is already there.
 */
export function mediaRoom(
  format: PostFormat | null,
  held: number,
): { count: number; videoOnly: boolean } {
  const max =
    format === "instagram_reel" || format === "instagram_story"
      ? 1
      : MAX_POST_MEDIA;
  return {
    count: Math.max(0, max - held),
    videoOnly: format === "instagram_reel",
  };
}

/**
 * Why a post's media does not fit its format, or null when it does (or when
 * there is nothing yet to judge). A warning, not a refusal: media is added
 * one file at a time and the format can change after it.
 */
export function mediaFormatIssue(
  format: PostFormat | null,
  media: { kind: string }[],
): string | null {
  if (!format || media.length === 0) return null;
  if (format === "instagram_reel") {
    if (media.length > 1) return "A reel is one video. Remove the extra files.";
    if (media[0].kind !== "video") return "A reel is a video, not a photo.";
    return null;
  }
  if (format === "instagram_story") {
    return media.length > 1
      ? "A story is one photo or video. Add each file as its own story."
      : null;
  }
  return media.length > MAX_POST_MEDIA
    ? `A post holds up to ${MAX_POST_MEDIA} photos or videos.`
    : null;
}

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
  /** The caption since #1826 ("Story text" on a story); the column kept its name. */
  content: string | null;
  post_format: PostFormat | null;
  collaborator_handles: string[];
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

/** Whether a piece still needs work: neither published nor skipped. */
export function isOpenPiece(piece: Pick<ContentPieceRow, "content_status">) {
  return !TERMINAL_STATUSES.has(piece.content_status);
}

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

export type OverdueStage = "draft" | "review" | "publish";

/** Statuses still short of each deadline: the work that date was for is not done. */
const SHORT_OF: Record<OverdueStage, ReadonlySet<string>> = {
  draft: new Set(["not_planned", "idea", "draft"]),
  review: new Set([
    "not_planned",
    "idea",
    "draft",
    "in_review",
    "changes_requested",
  ]),
  publish: new Set(
    STATUS_ORDER.filter((status) => !TERMINAL_STATUSES.has(status)),
  ),
};

/**
 * The furthest deadline a piece has missed, or null when it is on time (#1795).
 * A deadline counts as missed once it has passed and the piece is still short
 * of the stage it was for: a draft date passed with the piece already in
 * review is not overdue. Published and skipped pieces owe nothing.
 */
export function overdueStage(
  piece: Pick<
    ContentPieceRow,
    "content_status" | "draft_due_at" | "review_due_at" | "publish_due_at"
  >,
  now: Date = new Date(),
): OverdueStage | null {
  const missed = (stage: OverdueStage, due: string | null) =>
    due !== null &&
    new Date(due) < now &&
    SHORT_OF[stage].has(piece.content_status);
  if (missed("publish", piece.publish_due_at)) return "publish";
  if (missed("review", piece.review_due_at)) return "review";
  if (missed("draft", piece.draft_due_at)) return "draft";
  return null;
}

export const OVERDUE_STAGE_LABELS: Record<OverdueStage, string> = {
  draft: "Draft overdue",
  review: "Review overdue",
  publish: "Publish overdue",
};

/**
 * One outstanding-task label per overdue piece, for the event rail's badge on
 * its Social content section (#1795).
 */
export function overduePieceTaskLabels(
  pieces: (Parameters<typeof overdueStage>[0] &
    Pick<ContentPieceRow, "title">)[],
  now: Date = new Date(),
): string[] {
  return pieces.flatMap((piece) => {
    const stage = overdueStage(piece, now);
    return stage
      ? [`${piece.title}: ${OVERDUE_STAGE_LABELS[stage].toLowerCase()}`]
      : [];
  });
}
