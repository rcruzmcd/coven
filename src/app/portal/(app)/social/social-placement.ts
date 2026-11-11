import type { ContentPieceRow } from "@/lib/social-content/pieces";
import { utcIsoToDateInZone } from "@/lib/time";

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
