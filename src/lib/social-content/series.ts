import {
  daysInMonth,
  utcIsoToDatetimeLocalInZone,
  zonedWallTimeToUtcIso,
} from "@/lib/time";

/**
 * Recurring social posts (#1839): how often a series repeats and which dates
 * that gives. Pure, so the generator (#1840) and the post page agree on every
 * date. A date here is a "YYYY-MM-DD" day in the series' own time zone.
 */
export const SERIES_CADENCES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
] as const;

export type SeriesCadence = (typeof SERIES_CADENCES)[number]["value"];

export function isSeriesCadence(value: unknown): value is SeriesCadence {
  return SERIES_CADENCES.some((option) => option.value === value);
}

/** The columns the dates are computed from. */
export type SeriesSchedule = {
  cadence: SeriesCadence;
  anchor_date: string;
  /** "HH:MM" or "HH:MM:SS", as Postgres returns a `time`. */
  publish_time: string;
  time_zone: string;
  ends_on: string | null;
};

/** The row as `/portal/social` reads it. */
export type SocialPostSeriesRow = SeriesSchedule & {
  id: string;
  lead_time_days: number;
  auto_approve: boolean;
  paused_at: string | null;
  ended_at: string | null;
  title: string;
};

export const SERIES_COLUMNS =
  "id, cadence, anchor_date, publish_time, time_zone, ends_on, lead_time_days, auto_approve, paused_at, ended_at, title";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function parseDay(day: string): { year: number; month: number; date: number } {
  const [year, month, date] = day.split("-").map(Number);
  return { year, month, date };
}

function formatDay(year: number, month: number, date: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

function addDaysToDay(day: string, days: number): string {
  const { year, month, date } = parseDay(day);
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return formatDay(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}

/**
 * The series' `index`th date, counting the anchor as 0. A monthly series
 * anchored on the 29th-31st takes the last day of a shorter month, and goes
 * back to its own day the month after.
 */
export function occurrenceDate(
  schedule: Pick<SeriesSchedule, "cadence" | "anchor_date">,
  index: number,
): string {
  if (schedule.cadence === "weekly")
    return addDaysToDay(schedule.anchor_date, 7 * index);
  if (schedule.cadence === "biweekly")
    return addDaysToDay(schedule.anchor_date, 14 * index);

  const { year, month, date } = parseDay(schedule.anchor_date);
  const monthIndex = month - 1 + index;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = (((monthIndex % 12) + 12) % 12) + 1;
  return formatDay(
    targetYear,
    targetMonth,
    Math.min(date, daysInMonth(targetYear, targetMonth)),
  );
}

/**
 * The series' dates on or after `fromDay`, up to `count` of them, stopping
 * at `ends_on`. Never earlier than the anchor.
 */
export function occurrencesFrom(
  schedule: SeriesSchedule,
  fromDay: string,
  count: number,
): string[] {
  const dates: string[] = [];
  // Skip whole periods to near `fromDay` instead of walking from the anchor.
  const { year: ay, month: am } = parseDay(schedule.anchor_date);
  const { year: fy, month: fm } = parseDay(fromDay);
  const daysBetween =
    (Date.parse(`${fromDay}T00:00:00Z`) -
      Date.parse(`${schedule.anchor_date}T00:00:00Z`)) /
    86_400_000;
  let index = 0;
  if (daysBetween > 0) {
    if (schedule.cadence === "weekly") index = Math.floor(daysBetween / 7);
    else if (schedule.cadence === "biweekly")
      index = Math.floor(daysBetween / 14);
    else index = Math.max(0, (fy - ay) * 12 + (fm - am) - 1);
  }
  while (dates.length < count) {
    const day = occurrenceDate(schedule, index);
    if (schedule.ends_on && day > schedule.ends_on) break;
    if (day >= fromDay) dates.push(day);
    index += 1;
  }
  return dates;
}

/** When the occurrence on `day` is published, as a UTC ISO instant. */
export function occurrencePublishAt(
  schedule: Pick<SeriesSchedule, "publish_time" | "time_zone">,
  day: string,
): string {
  const { year, month, date } = parseDay(day);
  const [hour, minute] = schedule.publish_time.split(":").map(Number);
  return zonedWallTimeToUtcIso(
    year,
    month,
    date,
    hour,
    minute,
    0,
    schedule.time_zone,
  );
}

/**
 * The anchor a post's publish date gives a new series: its day and time in
 * `timeZone`.
 */
export function anchorFromPublishAt(
  publishAt: string,
  timeZone: string,
): { anchor_date: string; publish_time: string } {
  const local = utcIsoToDatetimeLocalInZone(publishAt, timeZone);
  return { anchor_date: local.slice(0, 10), publish_time: local.slice(11, 16) };
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

/**
 * How a cadence reads for a given anchor, e.g. "Every 2 weeks on Tuesday" or
 * "Monthly on the 31st (or the last day)". Used by the repeat picker before
 * a series exists, so it takes only the anchor.
 */
export function cadenceLabel(
  cadence: SeriesCadence,
  anchorDate: string,
): string {
  const { year, month, date } = parseDay(anchorDate);
  if (cadence === "monthly") {
    return date > 28
      ? `Monthly on the ${ordinal(date)} (or the last day)`
      : `Monthly on the ${ordinal(date)}`;
  }
  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
  return cadence === "weekly"
    ? `Weekly on ${weekday}`
    : `Every 2 weeks on ${weekday}`;
}

export type SeriesState = "active" | "paused" | "ended";

export function seriesState(
  series: Pick<SocialPostSeriesRow, "paused_at" | "ended_at">,
): SeriesState {
  if (series.ended_at) return "ended";
  if (series.paused_at) return "paused";
  return "active";
}
