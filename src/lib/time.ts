export function nowMs() {
  return Date.now();
}

export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (America/New_York)" },
  { value: "America/Chicago", label: "Central Time (America/Chicago)" },
  { value: "America/Denver", label: "Mountain Time (America/Denver)" },
  {
    value: "America/Phoenix",
    label: "Mountain Time, no DST (America/Phoenix)",
  },
  {
    value: "America/Los_Angeles",
    label: "Pacific Time (America/Los_Angeles)",
  },
  { value: "America/Anchorage", label: "Alaska Time (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Pacific/Honolulu)" },
] as const;

export type EventWindow = {
  starts_at: string;
  ends_at: string | null;
  timezone: string;
};

/**
 * The house format for an instant that names its own zone: "Mar 14, 2026,
 * 6:00 PM MDT".
 *
 * `timeZoneName: "short"` is the labelling half of #1057 -- every displayed
 * time says which zone it is in, so a reader elsewhere is never guessing. It
 * was five identical `DATE_FORMAT_OPTIONS` consts across the portal and the
 * public site before this; one place to change means the label cannot be
 * added to four surfaces and forgotten on the fifth.
 */
export const DATE_TIME_WITH_ZONE: Intl.DateTimeFormatOptions = {
  // Spelled out rather than `dateStyle: "medium", timeStyle: "short"`, which
  // is what this replaced: Intl forbids either style alongside `timeZoneName`
  // and throws. These components are that pair's equivalent -- "Mar 14, 2026,
  // 6:00 PM MDT".
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

export function formatDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Formats an ISO instant in the event's own timezone rather than the
 * rendering environment's. Falls back to the given options without a zone
 * if `timeZone` turns out not to be a valid IANA identifier.
 */
export function formatDateTimeInZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
      new Date(iso),
    );
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(new Date(iso));
  }
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * `YYYY-MM-DD` of a `Date` read with local getters: for a grid cell built from
 * calendar parts, its own date; for an instant, its day in the process's zone.
 * Where the zone must be explicit, so server and browser agree, use
 * `utcIsoToDateInZone` instead, as `placePieces` does.
 */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The days a month grid shows: whole Sunday-to-Saturday weeks covering the
 * month (`monthIndex` 0-11). Calendar-day arithmetic rather than `addDays`,
 * which steps 24 hours and so lands on the same date twice across a
 * daylight-saving fall-back.
 */
export function monthGridDays(year: number, monthIndex: number): Date[] {
  const leading = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from(
    { length: cellCount },
    (_, index) => new Date(year, monthIndex, 1 - leading + index),
  );
}

/** Number of days in `month` (1-12) of `year`, leap-year-aware. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `instantMs`'s wall-clock reading in `timeZone`, as if that reading were UTC. */
function wallClockAsUtcMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/**
 * Converts a wall-clock date/time in `timeZone` to the UTC instant it
 * represents, as an ISO string. There's no date/timezone library in this
 * project (only `Intl`, per `formatDateInZone` above), so this does the
 * conversion the other direction: guess the UTC instant by treating the
 * wall-clock values as UTC, then correct the guess by however far off that
 * guess's wall-clock reading in `timeZone` turns out to be. One correction
 * pass is enough except right at a DST transition, where a second pass
 * converges.
 *
 * A wall time a spring-forward change skips (00:30 on the night Santiago
 * jumps from midnight to 1am) does not exist; it resolves forward through the
 * gap, by the offset in force before it, to the same day's 01:30 -- never
 * back onto the previous date.
 */
export function zonedWallTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): string {
  const wallTimeAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guessMs = wallTimeAsUtcMs;

  for (let i = 0; i < 2; i++) {
    const deltaMs = wallTimeAsUtcMs - wallClockAsUtcMs(guessMs, timeZone);
    if (deltaMs === 0) break;
    guessMs += deltaMs;
  }

  if (wallClockAsUtcMs(guessMs, timeZone) !== wallTimeAsUtcMs) {
    // In a gap: read the wall time with the offset from before the change.
    const DAY = 24 * 60 * 60 * 1000;
    const offsetBeforeMs =
      wallClockAsUtcMs(wallTimeAsUtcMs - DAY, timeZone) -
      (wallTimeAsUtcMs - DAY);
    guessMs = wallTimeAsUtcMs - offsetBeforeMs;
  }

  return new Date(guessMs).toISOString();
}

/*
 * Converting between a `<input type="datetime-local">` value and a stored
 * instant, in the two directions and the two zones (#1057).
 *
 * A datetime-local value is a naive "YYYY-MM-DDTHH:mm" wall-clock string with
 * no offset of its own, so turning it into an instant always means choosing a
 * timezone to read it in. `new Date(value)` makes that choice silently -- it
 * uses whatever zone the *running process* is in, which is the browser's in a
 * client component and UTC on Vercel in a server action. Every function below
 * names its zone instead, so the choice is visible at the call site.
 *
 * The platform convention is the `...InBrowser` pair: a time someone types is
 * in their browser's timezone, it is stored in UTC, and it is displayed in the
 * viewer's browser timezone. The `...InZone` pair exists for the records that
 * carry an explicit timezone field of their own (`events.timezone`,
 * `calendar_items.time_zone`, `artwork_calls.timezone`); it is the exception,
 * and adding a new caller needs a reason.
 *
 * The browser functions read the running environment's offset, so they answer
 * differently on a server than in a browser. Call them only from client
 * components, and prefer values that are rendered after mount -- a form default
 * baked into the server-rendered HTML will hydrate to a different string.
 */

/**
 * Converts a `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm" or
 * "...:ss"), which carries no UTC offset of its own, into the UTC instant it
 * represents when read as wall-clock time in `timeZone`. Use this instead of
 * `new Date(value).toISOString()` for any datetime-local value paired with
 * an explicit timezone field -- `new Date` on a naive string is parsed in
 * whatever timezone the running process happens to be in, which differs
 * between local dev and production. Returns null if `value` isn't in the
 * expected shape.
 */
export function datetimeLocalToUtcIsoInZone(
  value: string,
  timeZone: string,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return zonedWallTimeToUtcIso(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
    timeZone,
  );
}

/**
 * Formats a UTC instant as a wall-clock "YYYY-MM-DDTHH:mm" string in
 * `timeZone`, for seeding a `<input type="datetime-local">` value edited
 * alongside an explicit timezone field. Pairs with
 * `datetimeLocalToUtcIsoInZone` --
 * using the viewer's browser offset here instead would show the wrong
 * wall-clock time whenever the viewer isn't in the record's own timezone,
 * and silently shift the stored instant if re-saved unchanged.
 */
export function utcIsoToDatetimeLocalInZone(
  iso: string,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Formats a UTC instant as "YYYY-MM-DD" in `timeZone`, for seeding an
 * `<input type="date">` from a record that carries its own timezone. Taking
 * the first ten characters of the ISO string instead reads the date in UTC,
 * which is the previous day for any evening event west of Greenwich.
 */
export function utcIsoToDateInZone(iso: string, timeZone: string): string {
  return utcIsoToDatetimeLocalInZone(iso, timeZone).slice(0, 10);
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Formats a `Date` as the wall-clock "YYYY-MM-DDTHH:mm" string a
 * `<input type="datetime-local">` wants, read in the browser's own timezone.
 *
 * Uses the local getters rather than the `getTimezoneOffset()`-and-`toISOString`
 * trick the eight hand-rolled copies of this used before #1057. Both are
 * correct, including across a DST boundary, but only one of them says what it
 * is doing.
 */
export function dateToDatetimeLocalInBrowser(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Seeds a `<input type="datetime-local">` from a stored instant, in the
 * browser's timezone. Pairs with `datetimeLocalToUtcIsoInBrowser`, so a value
 * loaded and re-saved unchanged stores the same instant it started as.
 *
 * Returns "" for a null/blank instant, which is what an empty optional
 * datetime field wants, and for an unparseable one rather than rendering
 * "NaN-aN-aNTaN:aN" into the input.
 */
export function utcIsoToDatetimeLocalInBrowser(
  iso: string | null | undefined,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return dateToDatetimeLocalInBrowser(date);
}

/**
 * Seeds an `<input type="date">` from a stored instant, in the browser's
 * timezone -- the calendar day the viewer would say that instant fell on.
 *
 * Slicing the ISO string instead reads the day in UTC, which is the previous
 * one for any evening instant west of Greenwich (#1053).
 */
export function utcIsoToDateInBrowser(iso: string | null | undefined): string {
  return utcIsoToDatetimeLocalInBrowser(iso).slice(0, 10);
}

/** Now, as a `<input type="datetime-local">` value in the browser's timezone. */
export function nowDatetimeLocalInBrowser(): string {
  return dateToDatetimeLocalInBrowser(new Date());
}

/**
 * Today as "YYYY-MM-DD" in the browser's timezone, for seeding an
 * `<input type="date">` or naming the day a `date` column should record.
 *
 * `new Date().toISOString().slice(0, 10)` is already tomorrow for anyone west
 * of Greenwich working in the evening, which is when most of this gets typed
 * (#1053).
 */
export function todayInBrowser(): string {
  return nowDatetimeLocalInBrowser().slice(0, 10);
}

/**
 * Today as "YYYY-MM-DD" in a named zone -- the organization's, when a report
 * or a dashboard tile has to choose a default period (#1065).
 *
 * The server process runs in UTC, so `new Date().toISOString().slice(0, 10)`
 * is already tomorrow for anyone west of Greenwich working in the evening.
 * Read off a preset range that is a rendered figure rather than a typed value,
 * that shows up as a month tile rolling over to the next month at 6pm on the
 * last day of the current one.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return formatDateInZone(now, timeZone);
}

/**
 * A "YYYY-MM-DD" day as the Date that reads back as that day in UTC.
 *
 * The fiscal-year helpers do their arithmetic with `getUTC*`, so this is how a
 * day chosen in some other zone is handed to them without the local-time
 * parsing of `new Date("2026-08-31")` sliding it a day (#1053, #1065).
 */
export function utcDateFromIsoDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/**
 * Converts a `<input type="datetime-local">` value to the UTC instant it
 * represents when read in the browser's timezone -- the platform convention,
 * and the conversion that has to happen in the *client* so that the server
 * action receives an instant rather than a naive string to parse in its own
 * zone (#1054).
 *
 * Returns null for a blank or unparseable value so a caller can tell "the user
 * left it empty" from "the user typed a time", rather than storing an
 * "Invalid Date".
 */
export function datetimeLocalToUtcIsoInBrowser(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * "Due today" / "Due in N days" / "N days overdue", rounding to whole days
 * so a due time earlier today doesn't read as "overdue" and one later today
 * doesn't read as "in 1 day".
 */
export function formatDueRelative(
  dueAt: string | Date,
  now: Date = new Date(),
): string {
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((due.getTime() - now.getTime()) / dayMs);

  if (days === 0) return "Due today";
  if (days > 0) return `Due in ${days} day${days === 1 ? "" : "s"}`;
  const overdueDays = Math.abs(days);
  return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
}

/**
 * True if the event shares today's calendar date in its own timezone, or is
 * currently between starts_at and ends_at (for events that started on a
 * prior day and are still running, or have no ends_at).
 */
export function isEventActiveToday(
  event: EventWindow,
  now: Date = new Date(),
): boolean {
  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;

  let sameLocalDay: boolean;
  try {
    sameLocalDay =
      formatDateInZone(startsAt, event.timezone) ===
      formatDateInZone(now, event.timezone);
  } catch {
    sameLocalDay =
      formatDateInZone(startsAt, "UTC") === formatDateInZone(now, "UTC");
  }
  if (sameLocalDay) return true;

  return startsAt <= now && (endsAt === null || endsAt >= now);
}

/**
 * True once an event is over: its `ends_at` has passed, or, with no `ends_at`,
 * its `starts_at` has. The same rule as the public site's upcoming/past split.
 */
export function eventHasEnded(
  event: Pick<EventWindow, "starts_at" | "ends_at">,
  now: Date = new Date(),
): boolean {
  return new Date(event.ends_at ?? event.starts_at) < now;
}

export type EventTiming = "upcoming" | "today" | "past";

/**
 * Where an event sits in time, derived from its dates rather than a status
 * someone has to set by hand (#1609). "Today" is `isEventActiveToday` in
 * `event.timezone`, so pass the viewer's zone there to get the viewer's today.
 */
export function eventTiming(
  event: EventWindow,
  now: Date = new Date(),
): EventTiming {
  if (eventHasEnded(event, now)) return "past";
  return isEventActiveToday(event, now) ? "today" : "upcoming";
}
