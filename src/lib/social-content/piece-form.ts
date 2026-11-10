import { CONTENT_STATUSES } from "./pieces";
import type { ParseResult } from "@/lib/forms";

const CONTENT_STATUS_VALUES = CONTENT_STATUSES.map((option) => option.value);

export type ContentPieceFormData = {
  title: string;
  content: string | null;
  contentStatus: (typeof CONTENT_STATUS_VALUES)[number];
  skipReason: string | null;
  internalNotes: string | null;
  ownerId: string | null;
  reviewerId: string | null;
  leadTimeDays: number;
  publishDueAt: string | null;
  reviewDueAt: string | null;
  draftDueAt: string | null;
  /** What the piece is related to (#1793): either, both or neither. */
  calendarItemId: string | null;
  eventId: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseContentPieceForm(
  formData: FormData,
): ParseResult<ContentPieceFormData> {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const contentStatus = String(formData.get("contentStatus") ?? "");
  const skipReason = String(formData.get("skipReason") ?? "").trim();
  const internalNotes = String(formData.get("internalNotes") ?? "").trim();
  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const reviewerId = String(formData.get("reviewerId") ?? "").trim();
  const leadTimeDaysRaw = String(formData.get("leadTimeDays") ?? "");
  const publishDueAt = String(formData.get("publishDueAt") ?? "");
  const reviewDueAt = String(formData.get("reviewDueAt") ?? "");
  const draftDueAt = String(formData.get("draftDueAt") ?? "");
  const calendarItemId = String(formData.get("calendarItemId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();

  if (!title) {
    return { error: "Give this post a title." };
  }
  if (
    !CONTENT_STATUS_VALUES.includes(
      contentStatus as (typeof CONTENT_STATUS_VALUES)[number],
    )
  ) {
    return { error: "Select a valid content status." };
  }
  if (contentStatus === "skipped" && !skipReason) {
    return { error: "A reason is required when content is skipped." };
  }

  // The composite foreign keys refuse another tenant's item or event; this
  // only keeps a malformed id from reaching Postgres as a cast error.
  if (calendarItemId && !UUID_PATTERN.test(calendarItemId)) {
    return { error: "Select a valid community date.", field: "calendarItemId" };
  }
  if (eventId && !UUID_PATTERN.test(eventId)) {
    return { error: "Select a valid event.", field: "eventId" };
  }

  const leadTimeDays = Number(leadTimeDaysRaw);
  if (!Number.isInteger(leadTimeDays) || leadTimeDays <= 0) {
    return {
      error: "Lead time must be a whole number of days greater than zero.",
    };
  }

  const publishDueAtIso = publishDueAt
    ? new Date(publishDueAt).toISOString()
    : null;
  const reviewDueAtIso = reviewDueAt
    ? new Date(reviewDueAt).toISOString()
    : null;
  const draftDueAtIso = draftDueAt ? new Date(draftDueAt).toISOString() : null;

  if (draftDueAtIso && reviewDueAtIso && draftDueAtIso > reviewDueAtIso) {
    return {
      error: "Draft due date must be on or before the review due date.",
    };
  }
  if (reviewDueAtIso && publishDueAtIso && reviewDueAtIso > publishDueAtIso) {
    return {
      error: "Review due date must be on or before the publish due date.",
    };
  }

  return {
    data: {
      title,
      content: content || null,
      contentStatus: contentStatus as (typeof CONTENT_STATUS_VALUES)[number],
      skipReason: contentStatus === "skipped" ? skipReason : null,
      internalNotes: internalNotes || null,
      ownerId: ownerId || null,
      reviewerId: reviewerId || null,
      leadTimeDays,
      publishDueAt: publishDueAtIso,
      reviewDueAt: reviewDueAtIso,
      draftDueAt: draftDueAtIso,
      calendarItemId: calendarItemId || null,
      eventId: eventId || null,
    },
  };
}
