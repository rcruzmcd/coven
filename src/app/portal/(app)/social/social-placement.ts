import type { ContentPieceRow } from "@/lib/social-content/pieces";
import { utcIsoToDateInZone } from "@/lib/time";

/**
 * `YYYY-MM-DD` of a `Date` built from calendar parts (a grid cell), read with
 * the local getters it was built with. Not for instants: those go through
 * `placePieces`'s explicit zone.
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

/**
 * Splits posts into the ones the grid places, keyed by the day of their
 * publish date in `timeZone`, and the ones with no publish date yet, which go
 * in the Unscheduled tray (#1794). Order within a day and within the tray is
 * the order they arrived in.
 *
 * The zone is explicit rather than the process's own so the server render and
 * the browser's first render place a post in the same cell: callers pass the
 * viewer's zone once it is known and `UTC` until then (`useViewerTimeZone`).
 */
export function placePieces<
  Piece extends Pick<ContentPieceRow, "publish_due_at">,
>(
  pieces: Piece[],
  timeZone: string,
): { byDay: Map<string, Piece[]>; unscheduled: Piece[] } {
  const byDay = new Map<string, Piece[]>();
  const unscheduled: Piece[] = [];
  for (const piece of pieces) {
    if (!piece.publish_due_at) {
      unscheduled.push(piece);
      continue;
    }
    const key = utcIsoToDateInZone(piece.publish_due_at, timeZone);
    const list = byDay.get(key);
    if (list) list.push(piece);
    else byDay.set(key, [piece]);
  }
  return { byDay, unscheduled };
}
