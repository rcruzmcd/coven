import { todayInZone } from "@/lib/time";
import { CONTENT_STATUSES } from "./pieces";

/**
 * What `/portal/social` (#1794) is showing, read from and written back to the
 * URL so a reload, a shared link or the back button lands on the same view.
 */
export type SocialView = "month" | "list";

/**
 * What a post is related to. `event`, `community_date` and `program` mean
 * "has one" (a post related to several matches each); `standalone` means
 * none of them.
 */
export const SOCIAL_LINKED_TO = [
  { value: "all", label: "Anything" },
  { value: "event", label: "An event" },
  { value: "community_date", label: "A community date" },
  { value: "program", label: "A program" },
  { value: "standalone", label: "Nothing (standalone)" },
] as const;

export type SocialLinkedTo = (typeof SOCIAL_LINKED_TO)[number]["value"];

export type SocialFilters = {
  view: SocialView;
  /** `YYYY-MM`, the month the month view shows. */
  month: string;
  /** A content status, or `all`. */
  status: string;
  /** A person id, `none` (no owner) or `all`. */
  owner: string;
  /** A person id, `none` (no reviewer) or `all`. */
  reviewer: string;
  linkedTo: SocialLinkedTo;
  /** One event's id, narrowing `linkedTo: event` to that event (#1795), or `all`. */
  event: string;
  /** One program's id, narrowing `linkedTo: program` to that program (#1838), or `all`. */
  program: string;
  /** Draw events and community dates on the month view for context. */
  overlay: boolean;
};

type RawParams = Record<string, string | string[] | undefined>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATUS_VALUES: readonly string[] = CONTENT_STATUSES.map((s) => s.value);
const LINKED_VALUES: readonly string[] = SOCIAL_LINKED_TO.map((l) => l.value);

export function monthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** `now`'s month as `timeZone` reads it, as a `month` param. */
export function monthInZone(timeZone: string, now: Date = new Date()): string {
  return todayInZone(timeZone, now).slice(0, 7);
}

/**
 * Whether the URL names a month itself. When it does not, the server's
 * fallback is the server's own month, which the page corrects to the
 * viewer's once the browser reports its zone.
 */
export function hasMonthParam(params: RawParams): boolean {
  const month = first(params, "month");
  return !!month && MONTH_PATTERN.test(month);
}

function first(params: RawParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** A person filter: an id, `none`, or `all` for anything else. */
function personParam(value: string | undefined): string {
  if (value === "none") return "none";
  return value && UUID_PATTERN.test(value) ? value : "all";
}

/**
 * Reads the URL. Anything unrecognised falls back to its default rather than
 * erroring, so a hand-edited or stale link still opens the page.
 */
export function parseSocialFilters(
  params: RawParams,
  now: Date = new Date(),
): SocialFilters {
  const view = first(params, "view") === "list" ? "list" : "month";
  const month = first(params, "month");
  const status = first(params, "status");
  const linkedTo = first(params, "linked");
  const event = first(params, "event");
  const program = first(params, "program");

  // A single event only makes sense under "linked to an event", so naming
  // one implies it; likewise a program. The event wins if a link names both.
  const eventId = event && UUID_PATTERN.test(event) ? event : "all";
  const programId =
    eventId === "all" && program && UUID_PATTERN.test(program)
      ? program
      : "all";

  return {
    view,
    month: month && MONTH_PATTERN.test(month) ? month : monthParam(now),
    status: status && STATUS_VALUES.includes(status) ? status : "all",
    owner: personParam(first(params, "owner")),
    reviewer: personParam(first(params, "reviewer")),
    linkedTo:
      eventId !== "all"
        ? "event"
        : programId !== "all"
          ? "program"
          : linkedTo && LINKED_VALUES.includes(linkedTo)
            ? (linkedTo as SocialLinkedTo)
            : "all",
    event: eventId,
    program: programId,
    overlay: first(params, "overlay") === "1",
  };
}

/** The URL for a set of filters. Defaults are left out to keep links short. */
export function socialHref(filters: SocialFilters): string {
  const sp = new URLSearchParams();
  if (filters.view !== "month") sp.set("view", filters.view);
  sp.set("month", filters.month);
  if (filters.status !== "all") sp.set("status", filters.status);
  if (filters.owner !== "all") sp.set("owner", filters.owner);
  if (filters.reviewer !== "all") sp.set("reviewer", filters.reviewer);
  if (filters.event !== "all") sp.set("event", filters.event);
  else if (filters.program !== "all") sp.set("program", filters.program);
  else if (filters.linkedTo !== "all") sp.set("linked", filters.linkedTo);
  if (filters.overlay) sp.set("overlay", "1");
  return `/portal/social?${sp.toString()}`;
}

/** How many of the narrowing filters are set, for the Filters button's count. */
export function activeSocialFilterCount(filters: SocialFilters): number {
  return [
    filters.status !== "all",
    filters.owner !== "all",
    filters.reviewer !== "all",
    filters.linkedTo !== "all" ||
      filters.event !== "all" ||
      filters.program !== "all",
  ].filter(Boolean).length;
}

/** Where a post on `/portal/social` opens. The one place this route is written. */
export function socialPieceHref(id: string): string {
  return `/portal/social/${id}`;
}

/** The posts linked to one program (#1838). */
export function programSocialHref(programId: string): string {
  return `/portal/social?program=${programId}`;
}

/** An event's Social content section (#1795). */
export function eventSocialHref(eventId: string): string {
  return `/portal/events/${eventId}?tab=social`;
}
