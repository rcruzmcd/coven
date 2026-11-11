"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import {
  OVERDUE_STAGE_LABELS,
  isOpenPiece,
  overdueStage,
  type ContentPieceRow,
} from "@/lib/social-content/pieces";
import { socialPieceHref } from "@/lib/social-content/social-filters";
import { ContentStatusBadge } from "@/components/portal/social-content/content-status-badge";
import {
  SocialPostSheet,
  type SocialPostSheetSession,
} from "@/components/portal/social-content/social-post-sheet";
import { EmptyState } from "@/components/portal/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ViewerTime } from "@/components/viewer-time";
import { addDays } from "@/lib/time";
import { ownerName, type CalendarOwner } from "../calendar/calendar-shared";
import type { EventRow } from "./event-badges";
import type { EventPlanTemplateEntry } from "@/lib/social-content/event-plan";
import { GenerateEventPlanDialog } from "./generate-event-plan-dialog";
import { CancelledEventPostsBanner } from "./cancelled-event-posts-banner";

/**
 * What the Social content section shows (#1795), read on the server beside the
 * event so the rail's outstanding badge and the section agree. Null for a
 * reader without `content_calendar: view`, who has no such section.
 */
export type EventSocialContent = {
  pieces: ContentPieceRow[];
  owners: CalendarOwner[];
  defaultLeadTimeDays: number;
  /** The tenant's starter plan (#1798); empty for a reader who cannot manage. */
  planTemplate: EventPlanTemplateEntry[];
  /** The tenant's `org.timezone`, which the plan's day offsets count in. */
  orgTimeZone: string;
  /** `content_calendar: manage`, not `events: manage`: the posts are the calendar's rows. */
  canManage: boolean;
  error: boolean;
};

const EventSocialContentContext = createContext<EventSocialContent | null>(
  null,
);

export const EventSocialContentProvider = EventSocialContentContext.Provider;

/** The event's social posts, or null outside the event page or without access. */
export function useEventSocialContent() {
  return useContext(EventSocialContentContext);
}

/**
 * The posts that follow the event when its start moves (#1799): dated, and
 * neither published nor skipped. Only a manager may move them.
 */
export function movableEventPieces(social: EventSocialContent | null) {
  if (!social?.canManage) return [];
  return social.pieces.filter(
    (piece) => piece.publish_due_at !== null && isOpenPiece(piece),
  );
}

/**
 * How long before the event a new post is suggested to go out: an event's
 * posts promote it, so the default lands ahead of it rather than on the day.
 */
export const EVENT_POST_DAYS_BEFORE = 7;

export function defaultEventPublishDueAt(startsAt: string | null) {
  return startsAt
    ? addDays(new Date(startsAt), -EVENT_POST_DAYS_BEFORE).toISOString()
    : null;
}

/**
 * The social posts planned for one event (#1795). They are the same rows
 * `/portal/social` shows, so a post added here appears there and each one
 * links to its own page.
 */
export function SocialContentTab({ event }: { event: EventRow }) {
  const social = useContext(EventSocialContentContext);
  const [open, setOpen] = useState(false);
  // Kept after closing so the sheet keeps its content while it animates out.
  const [session, setSession] = useState<SocialPostSheetSession | null>(null);

  if (!social) return null;
  if (social.error) {
    return (
      <p className="app-muted text-sm">
        Could not load social posts. Please try again.
      </p>
    );
  }

  const { pieces, owners, canManage } = social;
  const scheduled = pieces.filter((piece) => piece.publish_due_at !== null);
  const unscheduled = pieces.filter((piece) => piece.publish_due_at === null);

  function openSheet(piece: ContentPieceRow | null, mode: "view" | "edit") {
    setSession((prev) => ({ key: (prev?.key ?? 0) + 1, piece, mode }));
    setOpen(true);
  }

  const addButton = canManage ? (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => openSheet(null, "edit")}
      >
        <Plus /> Add social post
      </Button>
      <GenerateEventPlanDialog
        eventId={event.id}
        startsAt={event.starts_at}
        template={social.planTemplate}
        timeZone={social.orgTimeZone}
        leadTimeDays={social.defaultLeadTimeDays}
        existingTitles={pieces.map((piece) => piece.title)}
      />
    </div>
  ) : undefined;

  const openPieces = pieces.filter(isOpenPiece);

  return (
    <div className="flex flex-col gap-4">
      {event.status === "cancelled" && openPieces.length > 0 && (
        <CancelledEventPostsBanner
          eventId={event.id}
          pieces={openPieces}
          canManage={canManage}
        />
      )}
      {pieces.length === 0 ? (
        <EmptyState
          className="py-4"
          title="No social posts planned for this event yet"
          description={
            canManage
              ? "Add a social post for each post or story that should promote or cover this event."
              : "Social posts appear here once a content manager plans them."
          }
          action={addButton}
        />
      ) : (
        <>
          {addButton}
          <PieceList
            pieces={scheduled}
            owners={owners}
            timeZone={event.timezone}
            onView={(piece) => openSheet(piece, "view")}
          />
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              Unscheduled{" "}
              <span className="app-muted font-normal">
                ({unscheduled.length})
              </span>
            </h3>
            {unscheduled.length === 0 ? (
              <p className="app-muted text-xs">
                Every post for this event has a publish date.
              </p>
            ) : (
              <PieceList
                pieces={unscheduled}
                owners={owners}
                timeZone={event.timezone}
                onView={(piece) => openSheet(piece, "view")}
              />
            )}
          </section>
        </>
      )}

      <SocialPostSheet
        open={open}
        session={session}
        onClose={() => setOpen(false)}
        owners={owners}
        defaultLeadTimeDays={social.defaultLeadTimeDays}
        canManage={canManage}
        defaults={{
          eventId: event.id,
          publishDueAt: defaultEventPublishDueAt(event.starts_at),
        }}
        newPostDescription="One social post or story for this event."
      />
    </div>
  );
}

function PieceList({
  pieces,
  owners,
  timeZone,
  onView,
}: {
  pieces: ContentPieceRow[];
  owners: CalendarOwner[];
  /** What the dates render in on the server: the event's own zone (#1057). */
  timeZone: string;
  onView: (piece: ContentPieceRow) => void;
}) {
  if (pieces.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {pieces.map((piece) => {
        const overdue = overdueStage(piece);
        return (
          <li
            key={piece.id}
            className="flex items-start justify-between gap-3 py-2"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <Link
                href={socialPieceHref(piece.id)}
                className="truncate font-medium hover:underline"
                title={piece.title}
              >
                {piece.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <ContentStatusBadge status={piece.content_status} />
                {overdue && (
                  <Badge variant="destructive">
                    {OVERDUE_STAGE_LABELS[overdue]}
                  </Badge>
                )}
                <span className="app-muted text-xs">
                  Owner: {ownerName(owners, piece.owner_id, "None")}
                </span>
                <span className="app-muted text-xs">
                  Reviewer: {ownerName(owners, piece.reviewer_id, "None")}
                </span>
              </div>
              <dl className="app-muted flex flex-wrap gap-x-3 text-xs">
                <DueDate
                  label="Draft"
                  iso={piece.draft_due_at}
                  timeZone={timeZone}
                />
                <DueDate
                  label="Review"
                  iso={piece.review_due_at}
                  timeZone={timeZone}
                />
                <DueDate
                  label="Publish"
                  iso={piece.publish_due_at}
                  timeZone={timeZone}
                />
              </dl>
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`View ${piece.title}`}
                    onClick={() => onView(piece)}
                  />
                }
              >
                <Eye />
              </TooltipTrigger>
              <TooltipContent>View or edit here</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function DueDate({
  label,
  iso,
  timeZone,
}: {
  label: string;
  iso: string | null;
  timeZone: string;
}) {
  if (!iso) return null;
  return (
    <div className="flex gap-1">
      <dt>{label}</dt>
      <dd>
        <ViewerTime iso={iso} fallbackZone={timeZone} />
      </dd>
    </div>
  );
}
