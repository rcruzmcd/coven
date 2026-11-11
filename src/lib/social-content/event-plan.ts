import { zonedWallTimeToUtcIso } from "@/lib/time";
import { leadTimeSchedule } from "./pieces";

/**
 * An event's starter post plan (#1798): the posts the Generate plan button
 * offers, each due a whole number of days before (negative) or after the
 * event starts. A tenant's own list is the `content.event_plan_template`
 * setting; these are the seeded defaults, and what a missing or malformed
 * setting falls back to.
 */
export type EventPlanTemplateEntry = { title: string; offset_days: number };

export const EVENT_PLAN_TEMPLATE_SETTING_KEY = "content.event_plan_template";

export const DEFAULT_EVENT_PLAN_TEMPLATE: readonly EventPlanTemplateEntry[] = [
  { title: "Announce", offset_days: -30 },
  { title: "Reminder", offset_days: -7 },
  { title: "Last call", offset_days: -1 },
  { title: "Day-of", offset_days: 0 },
  { title: "Recap / thank-you", offset_days: 2 },
];

/**
 * The stored setting as a template. Entries without a title or a whole-day
 * offset are dropped; a value with none left is no template at all, so the
 * defaults apply rather than a button that offers nothing.
 */
export function parseEventPlanTemplate(
  value: unknown,
): EventPlanTemplateEntry[] {
  const entries = Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { title, offset_days } = entry as Record<string, unknown>;
        if (typeof title !== "string" || !title.trim()) return [];
        if (typeof offset_days !== "number" || !Number.isInteger(offset_days))
          return [];
        return [{ title: title.trim(), offset_days }];
      })
    : [];
  return entries.length > 0 ? entries : [...DEFAULT_EVENT_PLAN_TEMPLATE];
}

/**
 * `iso` moved by whole calendar days in `timeZone`, keeping its wall-clock
 * time: a post 7 days before a 6pm event is due at 6pm, even when a DST change
 * falls in between and that is 7 days and an hour earlier in UTC.
 */
export function addDaysInZone(
  iso: string,
  days: number,
  timeZone: string,
): string {
  // The instant itself, not its wall-clock reading rebuilt: in the hour a DST
  // change repeats, that reading names two instants and may pick the other.
  if (days === 0) return new Date(iso).toISOString();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  // Date.UTC rolls an out-of-range day into the next or previous month.
  const day = new Date(
    Date.UTC(get("year"), get("month") - 1, get("day") + days),
  );
  return zonedWallTimeToUtcIso(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    get("hour"),
    get("minute"),
    get("second"),
    timeZone,
  );
}

/** Titles compared the way a person would: case and outer spaces aside. */
export function planTitleKey(title: string) {
  return title.trim().toLocaleLowerCase();
}

export type PlannedEventPost = {
  title: string;
  offsetDays: number;
  publishDueAt: string;
  reviewDueAt: string;
  draftDueAt: string;
  /** The event already has a post with this title, so it is not offered. */
  exists: boolean;
};

/**
 * The template laid out against one event's start, in the tenant's time zone.
 * Draft and review dates count back from each publish date by the tenant's
 * default lead time, as a post added by hand would.
 */
export function planEventPosts({
  template,
  startsAt,
  timeZone,
  leadTimeDays,
  existingTitles,
}: {
  template: readonly EventPlanTemplateEntry[];
  startsAt: string;
  timeZone: string;
  leadTimeDays: number;
  existingTitles: readonly string[];
}): PlannedEventPost[] {
  const existing = new Set(existingTitles.map(planTitleKey));
  const seen = new Set<string>();
  return template.flatMap((entry) => {
    // A template naming one title twice still plans it once.
    const key = planTitleKey(entry.title);
    if (seen.has(key)) return [];
    seen.add(key);
    const publishDueAt = addDaysInZone(startsAt, entry.offset_days, timeZone);
    const { draftDueAt, reviewDueAt } = leadTimeSchedule(
      new Date(publishDueAt),
      leadTimeDays,
    );
    return [
      {
        title: entry.title,
        offsetDays: entry.offset_days,
        publishDueAt,
        reviewDueAt: reviewDueAt.toISOString(),
        draftDueAt: draftDueAt.toISOString(),
        exists: existing.has(key),
      },
    ];
  });
}
