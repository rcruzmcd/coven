import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { AdultsOnlyBadge } from "@/components/adults-only-badge";
import { parseMinimumAge } from "@/lib/adults-only";
import { Badge } from "@/components/ui/badge";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { HomeUpcomingCards } from "@/lib/site-layout";
import {
  eventProgramsLabel,
  type PublicEventProgram,
} from "../events/event-card";
import { checkRegistrationWindow } from "../events/event-registration-form";
import { EventFlierTile } from "../events/event-flier";
import { publicEventPath } from "../events/event-path";

/**
 * Matches the events listing and the event page, which both format in the
 * event's own zone. The home page used to format in the viewer's zone, so a
 * Vermont start time read differently here than everywhere else (#846).
 */

/** The compact style splits the same instant into a date block and a time. */
const MONTH_OPTIONS: Intl.DateTimeFormatOptions = { month: "short" };
const DAY_OPTIONS: Intl.DateTimeFormatOptions = { day: "numeric" };
const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/**
 * The columns of the event `public_events` exposes that the home page needs.
 * Narrower than the events listing's `PublicEvent`: the home card shows no
 * description, capacity or sponsors.
 */
export type HomeUpcomingEvent = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  flier_url: string | null;
  registration_enabled: boolean;
  registration_deadline: string | null;
  /** #1782. The age requirement (18, 21), or null for none. */
  minimum_age: number | null;
  programs: PublicEventProgram[];
};

/** The columns above, as a PostgREST select list. */
export const HOME_UPCOMING_EVENT_COLUMNS =
  "id, name, location, starts_at, ends_at, timezone, flier_url, registration_enabled, registration_deadline, minimum_age";

/**
 * A community calendar item filling a slot the organization's own events
 * didn't. It belongs to somebody else, which is what every difference in how
 * it renders is for.
 */
export type HomeCommunityItem = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
  summary: string | null;
  /** Already resolved against the tenant's own vocabulary (#834). */
  categoryLabel: string | null;
  public_url: string | null;
};

export const HOME_COMMUNITY_ITEM_COLUMNS =
  "id, title, starts_at, ends_at, time_zone, summary, categories, public_url";

/** One slot of the section, in `starts_at` order regardless of source. */
export type HomeUpcomingItem =
  | { kind: "event"; event: HomeUpcomingEvent }
  | { kind: "community"; item: HomeCommunityItem };

function itemKey(entry: HomeUpcomingItem): string {
  return entry.kind === "event" ? entry.event.id : `community-${entry.item.id}`;
}

function formatRange(
  startsAt: string,
  endsAt: string | null,
  timeZone: string,
): string {
  const starts = formatDateTimeInZone(
    startsAt,
    timeZone,
    DATE_TIME_WITH_ZONE,
    "en-US",
  );
  if (!endsAt) return starts;
  return `${starts} – ${formatDateTimeInZone(endsAt, timeZone, DATE_TIME_WITH_ZONE, "en-US")}`;
}

/**
 * The off-site link on a community item. `public_url` can be anyone's site, so
 * it carries the same protections `CalendarItemCard` gives it -- including
 * naming the item in the label, since "Learn more" alone tells a screen reader
 * nothing about which of three cards it is on.
 */
function CommunityLink({ item }: { item: HomeCommunityItem }) {
  const external = Boolean(item.public_url);

  if (!external) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--purple-deep)]">
        See the community calendar
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--purple-deep)]">
      Learn more
      <ExternalLink className="size-3" aria-hidden />
    </span>
  );
}

function communityHref(item: HomeCommunityItem): string {
  return item.public_url ?? "/events/community";
}

function communityLinkProps(item: HomeCommunityItem) {
  if (!item.public_url) return {};
  return {
    target: "_blank",
    rel: "noopener noreferrer",
    "aria-label": `Learn more about ${item.title} (opens in new tab)`,
  } as const;
}

const CARD_CLASSNAME =
  "rainbow-ring-hover flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function NextUpRibbon({ label }: { label: string }) {
  return (
    <span
      style={{ backgroundImage: "var(--rainbow)" }}
      className="absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 text-[0.625rem] font-bold tracking-[0.16em] text-white uppercase shadow-sm"
    >
      {label}
    </span>
  );
}

/**
 * A card is a link to the event's own page, not a button that opens a sheet.
 * `/events/e/[id]` has been live but unlinked since #178 moved the listing to a
 * detail sheet, so this is the only route to it from the site's own pages --
 * which is also what makes an event on the home page shareable (#846).
 */
function UpcomingEventCard({
  event,
  now,
  nextUpLabel,
}: {
  event: HomeUpcomingEvent;
  now: number;
  nextUpLabel?: string;
}) {
  const registration = checkRegistrationWindow(event, new Date(now));

  return (
    <Link href={publicEventPath(event.id)} className={CARD_CLASSNAME}>
      <EventFlierTile
        flierUrl={event.flier_url}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      >
        {nextUpLabel && <NextUpRibbon label={nextUpLabel} />}
      </EventFlierTile>

      <div className="space-y-1 px-4 py-3">
        <p className="app-eyebrow">{eventProgramsLabel(event.programs)}</p>
        <p className="text-base font-semibold tracking-[-0.01em]">
          {event.name}
          <AdultsOnlyBadge
            minimumAge={parseMinimumAge(event.minimum_age)}
            className="ml-2"
          />
        </p>
        <p className="app-muted text-xs">
          {formatRange(event.starts_at, event.ends_at, event.timezone)}
        </p>
        {event.location && (
          <p className="text-xs text-muted-foreground">{event.location}</p>
        )}
        {event.registration_enabled && (
          // Badge rather than a hand-rolled pill: its variants are the shape
          // the status colours in globals.css were contrast-measured against.
          <Badge
            variant={registration.open ? "success" : "muted"}
            className="mt-2"
          >
            {registration.open ? "Registration open" : "Registration closed"}
          </Badge>
        )}
      </div>
    </Link>
  );
}

/**
 * A community item has no flier and no registration, so the tile carries its
 * category instead of artwork and the call to action is the off-site link.
 * The eyebrow is muted rather than the brand accent, which is the difference
 * that has to survive sitting next to an event card.
 */
function CommunityCard({
  item,
  nextUpLabel,
}: {
  item: HomeCommunityItem;
  nextUpLabel?: string;
}) {
  return (
    <Link
      href={communityHref(item)}
      {...communityLinkProps(item)}
      className={CARD_CLASSNAME}
    >
      <div className="relative aspect-[16/9] w-full">
        <div
          style={{ backgroundImage: "var(--rainbow-soft)" }}
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-secondary px-4 py-3 text-center"
        >
          <span className="rainbow-accent w-1/4 max-w-12" aria-hidden />
          {item.categoryLabel && (
            <p className="app-eyebrow">{item.categoryLabel}</p>
          )}
          <p className="text-xs text-muted-foreground">
            From the community calendar
          </p>
        </div>
        {nextUpLabel && <NextUpRibbon label={nextUpLabel} />}
      </div>

      <div className="space-y-1 px-4 py-3">
        <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          Community calendar
        </p>
        <p className="text-base font-semibold tracking-[-0.01em]">
          {item.title}
        </p>
        <p className="app-muted text-xs">
          {formatRange(item.starts_at, item.ends_at, item.time_zone)}
        </p>
        {item.summary && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {item.summary}
          </p>
        )}
        <span className="mt-2 inline-block">
          <CommunityLink item={item} />
        </span>
      </div>
    </Link>
  );
}

const ROW_CLASSNAME =
  "flex items-center gap-4 px-4 py-3.5 outline-none focus-visible:bg-muted/60";

/**
 * The compact style's date block. Filled for the organization's own events,
 * outlined for a community item -- the same "not yours" signal the muted
 * eyebrow gives a card, in the one place a row has room for it.
 */
function DateBlock({
  startsAt,
  timeZone,
  community,
}: {
  startsAt: string;
  timeZone: string;
  community?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "w-13 shrink-0 rounded-lg py-1.5 text-center",
        community
          ? "ring-1 ring-[var(--line)] ring-inset"
          : "bg-[var(--purple-soft)]",
      )}
    >
      <span className="block text-[0.625rem] font-bold tracking-[0.12em] text-[var(--purple)] uppercase">
        {formatDateTimeInZone(startsAt, timeZone, MONTH_OPTIONS, "en-US")}
      </span>
      <span className="block text-xl leading-tight font-semibold">
        {formatDateTimeInZone(startsAt, timeZone, DAY_OPTIONS, "en-US")}
      </span>
    </span>
  );
}

function UpcomingEventRow({
  event,
  now,
  nextUpLabel,
}: {
  event: HomeUpcomingEvent;
  now: number;
  nextUpLabel?: string;
}) {
  const registration = checkRegistrationWindow(event, new Date(now));

  return (
    <Link href={publicEventPath(event.id)} className={ROW_CLASSNAME}>
      <DateBlock startsAt={event.starts_at} timeZone={event.timezone} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="app-eyebrow">
            {eventProgramsLabel(event.programs)}
          </span>
          {nextUpLabel && (
            <span
              style={{ backgroundImage: "var(--rainbow)" }}
              className="rounded-full px-1.5 py-px text-[0.5625rem] font-bold tracking-[0.14em] text-white uppercase"
            >
              {nextUpLabel}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[0.9375rem] font-semibold tracking-[-0.01em]">
          {event.name}
        </span>
        <span className="app-muted mt-0.5 block text-xs">
          {formatDateTimeInZone(
            event.starts_at,
            event.timezone,
            TIME_OPTIONS,
            "en-US",
          )}
          {event.location ? ` · ${event.location}` : ""}
        </span>
      </span>
      {event.registration_enabled && (
        <Badge
          variant={registration.open ? "success" : "muted"}
          className="hidden shrink-0 sm:inline-flex"
        >
          {registration.open ? "Registration open" : "Registration closed"}
        </Badge>
      )}
    </Link>
  );
}

function CommunityRow({ item }: { item: HomeCommunityItem }) {
  return (
    <Link
      href={communityHref(item)}
      {...communityLinkProps(item)}
      className={ROW_CLASSNAME}
    >
      <DateBlock
        startsAt={item.starts_at}
        timeZone={item.time_zone}
        community
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.625rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          Community calendar
          {item.categoryLabel ? ` · ${item.categoryLabel}` : ""}
        </span>
        <span className="mt-0.5 block text-[0.9375rem] font-semibold tracking-[-0.01em]">
          {item.title}
        </span>
        <span className="app-muted mt-0.5 block text-xs">
          {formatDateTimeInZone(
            item.starts_at,
            item.time_zone,
            TIME_OPTIONS,
            "en-US",
          )}
        </span>
      </span>
      <span className="hidden shrink-0 sm:inline-flex">
        <CommunityLink item={item} />
      </span>
    </Link>
  );
}

/**
 * Columns are capped at the number of items so the row is always full, and a
 * lone card is held to card width rather than stretched the width of the page.
 */
function gridClassName(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-sm";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
}

export function UpcomingEvents({
  items,
  now,
  cards,
  eyebrow,
  heading,
  ctaLabel,
  nextUpLabel,
}: {
  items: HomeUpcomingItem[];
  now: number;
  cards: HomeUpcomingCards;
  eyebrow: string;
  heading: string;
  ctaLabel: string;
  nextUpLabel: string;
}) {
  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-fit">
          <span className="app-eyebrow">{eyebrow}</span>
          <h2 className="brand-display mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            {heading}
          </h2>
        </div>
        <Link
          href="/events"
          className="rainbow-underline inline-flex items-center gap-1 text-sm font-semibold text-[var(--purple)]"
        >
          {ctaLabel}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {cards === "compact" ? (
        <div className="mt-6 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          {/* The one piece of colour the compact style keeps, standing in for
              the flier the row no longer has. */}
          <div className="rainbow-strip" aria-hidden />
          <div className="divide-y divide-[var(--line)]">
            {items.map((entry, index) =>
              entry.kind === "event" ? (
                <UpcomingEventRow
                  key={itemKey(entry)}
                  event={entry.event}
                  now={now}
                  nextUpLabel={index === 0 ? nextUpLabel : undefined}
                />
              ) : (
                <CommunityRow key={itemKey(entry)} item={entry.item} />
              ),
            )}
          </div>
        </div>
      ) : (
        <div className={cn("mt-6 grid gap-4", gridClassName(items.length))}>
          {items.map((entry, index) =>
            entry.kind === "event" ? (
              <UpcomingEventCard
                key={itemKey(entry)}
                event={entry.event}
                now={now}
                nextUpLabel={index === 0 ? nextUpLabel : undefined}
              />
            ) : (
              <CommunityCard
                key={itemKey(entry)}
                item={entry.item}
                nextUpLabel={index === 0 ? nextUpLabel : undefined}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}
