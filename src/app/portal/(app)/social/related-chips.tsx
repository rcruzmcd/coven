import Link from "next/link";
import { CalendarDays, CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calendarItemHref } from "../calendar/calendar-entries";
import { eventSocialHref } from "@/lib/social-content/social-filters";
import type { SocialPieceRow } from "@/lib/social-content/queries";

/**
 * What a post is related to, as chips (#1794). An event chip opens that
 * event's Social content section (#1795); a community date opens its calendar
 * item. A link this reader cannot see the record behind (an event, without
 * events access) is still named, generically and without a link.
 */
export function RelatedChips({
  piece,
  showStandalone = false,
}: {
  piece: Pick<
    SocialPieceRow,
    "event_id" | "event" | "calendar_item_id" | "calendar_item"
  >;
  /** Say "Standalone" when there is nothing, rather than rendering nothing. */
  showStandalone?: boolean;
}) {
  const chips = [];

  if (piece.event_id) {
    chips.push(
      piece.event ? (
        <Badge
          key="event"
          variant="secondary"
          render={<Link href={eventSocialHref(piece.event.id)} />}
        >
          <CalendarDays aria-hidden />
          {piece.event.name}
        </Badge>
      ) : (
        <Badge key="event" variant="outline">
          <CalendarDays aria-hidden />
          An event
        </Badge>
      ),
    );
  }

  if (piece.calendar_item_id) {
    chips.push(
      piece.calendar_item ? (
        <Badge
          key="item"
          variant="outline"
          render={<Link href={calendarItemHref(piece.calendar_item.id)} />}
        >
          <CalendarRange aria-hidden />
          {piece.calendar_item.title}
        </Badge>
      ) : (
        <Badge key="item" variant="outline">
          <CalendarRange aria-hidden />A community date
        </Badge>
      ),
    );
  }

  if (chips.length === 0) {
    return showStandalone ? (
      <span className="app-muted text-xs">Standalone</span>
    ) : null;
  }
  return <span className="flex flex-wrap items-center gap-1">{chips}</span>;
}
