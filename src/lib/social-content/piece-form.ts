import {
  CONTENT_STATUSES,
  MAX_COLLABORATORS,
  formatTakesCollaborators,
  isPostFormat,
  type PostFormat,
} from "./pieces";
import type { ParseResult } from "@/lib/forms";
import { INSTAGRAM_HANDLE_PATTERN } from "@/lib/instagram-handle";

const CONTENT_STATUS_VALUES = CONTENT_STATUSES.map((option) => option.value);

export type ContentPieceFormData = {
  title: string;
  /** The caption (#1826). */
  content: string | null;
  postFormat: PostFormat | null;
  collaboratorHandles: string[];
  /** Who to tag, in order: a person record or a bare handle. */
  tags: SocialPostTagInput[];
  contentStatus: (typeof CONTENT_STATUS_VALUES)[number];
  skipReason: string | null;
  internalNotes: string | null;
  ownerId: string | null;
  reviewerId: string | null;
  leadTimeDays: number;
  publishDueAt: string | null;
  reviewDueAt: string | null;
  draftDueAt: string | null;
  /** What the piece is related to (#1793, #1838): any combination, or none. */
  calendarItemId: string | null;
  eventId: string | null;
  programId: string | null;
};

export type SocialPostTagInput = { personId: string } | { handle: string };

/** The most tags one post saves; `set_social_post_tags()` agrees. */
export const MAX_TAGS = 20;

/**
 * A handle as typed -- `@name`, `name` or a profile URL -- as stored: no @,
 * lowercase (Instagram handles are case-insensitive). Null when it is not a
 * handle at all.
 */
export function normalizeHandle(raw: string): string | null {
  const handle = raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .toLowerCase();
  return INSTAGRAM_HANDLE_PATTERN.test(handle) ? handle : null;
}

function parseJsonArray(raw: FormDataEntryValue | null): unknown[] | null {
  if (raw === null || raw === "") return [];
  try {
    const value: unknown = JSON.parse(String(raw));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseContentPieceForm(
  formData: FormData,
): ParseResult<ContentPieceFormData> {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const postFormatRaw = String(formData.get("postFormat") ?? "");
  const collaboratorsRaw = parseJsonArray(formData.get("collaborators"));
  const tagsRaw = parseJsonArray(formData.get("tags"));
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
  const programId = String(formData.get("programId") ?? "").trim();

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

  if (postFormatRaw && !isPostFormat(postFormatRaw)) {
    return { error: "Select a valid format.", field: "postFormat" };
  }
  const postFormat = isPostFormat(postFormatRaw) ? postFormatRaw : null;

  if (collaboratorsRaw === null) {
    return {
      error: "Collaborators could not be read.",
      field: "collaborators",
    };
  }
  const collaboratorHandles: string[] = [];
  for (const raw of collaboratorsRaw) {
    const handle = normalizeHandle(String(raw ?? ""));
    if (!handle) {
      return {
        error: `"${String(raw)}" is not an Instagram handle.`,
        field: "collaborators",
      };
    }
    if (!collaboratorHandles.includes(handle)) collaboratorHandles.push(handle);
  }
  // A story takes none; switching a post to a story drops them.
  if (!formatTakesCollaborators(postFormat)) collaboratorHandles.length = 0;
  if (collaboratorHandles.length > MAX_COLLABORATORS) {
    return {
      error: `Instagram allows up to ${MAX_COLLABORATORS} collaborators.`,
      field: "collaborators",
    };
  }

  if (tagsRaw === null) {
    return { error: "Tags could not be read.", field: "tags" };
  }
  const tags: SocialPostTagInput[] = [];
  const seen = new Set<string>();
  for (const raw of tagsRaw) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    if (typeof entry.personId === "string") {
      if (!UUID_PATTERN.test(entry.personId)) {
        return { error: "Select a valid person to tag.", field: "tags" };
      }
      if (seen.has(`p:${entry.personId}`)) continue;
      seen.add(`p:${entry.personId}`);
      tags.push({ personId: entry.personId });
      continue;
    }
    const handle = normalizeHandle(String(entry.handle ?? ""));
    if (!handle) {
      return {
        error: `"${String(entry.handle ?? "")}" is not an Instagram handle.`,
        field: "tags",
      };
    }
    if (seen.has(`h:${handle}`)) continue;
    seen.add(`h:${handle}`);
    tags.push({ handle });
  }
  if (tags.length > MAX_TAGS) {
    return { error: `Tag up to ${MAX_TAGS} people.`, field: "tags" };
  }

  // The composite foreign keys refuse another tenant's item, event or
  // program; this only keeps a malformed id from reaching Postgres as a cast
  // error.
  if (calendarItemId && !UUID_PATTERN.test(calendarItemId)) {
    return { error: "Select a valid community date.", field: "calendarItemId" };
  }
  if (eventId && !UUID_PATTERN.test(eventId)) {
    return { error: "Select a valid event.", field: "eventId" };
  }
  if (programId && !UUID_PATTERN.test(programId)) {
    return { error: "Select a valid program.", field: "programId" };
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
      postFormat,
      collaboratorHandles,
      tags,
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
      programId: programId || null,
    },
  };
}
