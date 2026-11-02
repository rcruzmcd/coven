"use server";

// The per-kind reads behind the record preview sheet (#1225).
//
// Two things make these separate actions rather than one with a `kind`
// parameter. Each authorizes on the **record's own** resource -- `events:view`
// and `content_calendar:view`, never the `governance:view` of the meeting the
// link was on -- so a board member holding governance and nothing else is
// refused here rather than handed a record their role does not cover. And a
// third kind is a third function answering the same `RecordPreview`, which is
// what keeps the sheet from growing a branch per module.
//
// Read-only on purpose. The write from the minutes is an action item, and that
// dialog already exists.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import {
  actionError,
  fromGuard,
  type ActionFailure,
} from "@/lib/portal/action-result";
import type {
  RecordPreview,
  RecordPreviewFigure,
} from "@/lib/portal/record-preview";
import { formatCurrency, formatNumber } from "@/lib/format";
import { humanizeStatus } from "@/components/portal/status-badge";
import { CALENDAR_STATUS_STYLES, EVENT_STATUS_STYLES } from "./calendar-badges";
import { calendarItemHref, eventHref } from "./calendar-entries";
import { ITEM_TYPES, labelFor } from "./calendar-shared";

type EventPreviewRow = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  status: string;
  description: string | null;
  budget_amount: number | null;
};

type CalendarItemPreviewRow = {
  id: string;
  title: string;
  item_type: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string | null;
  summary: string | null;
  calendar_status: string;
};

type RegistrationRow = { party_size: number };

const GONE = "That record no longer exists.";

/**
 * An event as a board asks about it: when and where it is, and the three
 * numbers that come up -- how many are registered, how many are volunteering,
 * what it is budgeted at.
 *
 * `event_registrations` and `event_volunteers` both select under
 * `events:view`, the same gate this action passes, so a zero here is a real
 * zero rather than a row the caller cannot see. A read that *failed* drops its
 * figure instead of reporting one, because "0 registered" is a sentence
 * somebody writes into the minutes.
 */
export async function getEventPreviewAction(
  id: string,
): Promise<{ data: RecordPreview } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, name, location, starts_at, ends_at, timezone, status, description, budget_amount",
    )
    .eq("id", id)
    .maybeSingle<EventPreviewRow>();

  if (error) {
    return actionError(
      "server_error",
      "Could not load this event. Please try again.",
    );
  }
  if (!data) return actionError("conflict", GONE);

  const [registrations, volunteers] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("party_size")
      .eq("event_id", id)
      .is("cancelled_at", null)
      // #1764. A test registration holds no place.
      .eq("is_test", false),
    supabase
      .from("event_volunteers")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id),
  ]);

  const figures: RecordPreviewFigure[] = [];
  if (!registrations.error) {
    const rows = (registrations.data ?? []) as RegistrationRow[];
    figures.push({
      label: "Registered",
      // Party size, not row count: one registration for a family of four is
      // four people through the door, which is the number a board hears.
      value: formatNumber(
        rows.reduce((total, row) => total + (row.party_size ?? 0), 0),
      ),
    });
  }
  if (!volunteers.error) {
    figures.push({
      label: "Volunteers",
      value: formatNumber(volunteers.count ?? 0),
    });
  }
  if (data.budget_amount !== null) {
    figures.push({
      label: "Budget",
      value: formatCurrency(data.budget_amount),
    });
  }

  return {
    data: {
      kind: "event",
      id: data.id,
      title: data.name,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      timeZone: data.timezone || "UTC",
      location: data.location,
      statusLabel: humanizeStatus(data.status),
      statusTone: EVENT_STATUS_STYLES[data.status] ?? "neutral",
      summary: data.description,
      figures,
      href: eventHref(data.id),
    },
  };
}

/**
 * A calendar item as the agenda refers to it. No counts: the editorial
 * workflow behind one -- priority tier, decision, sensitive review -- is the
 * calendar workspace's job, and the footer link is where it is done.
 *
 * The item's type is the one thing a reader needs that its title may not say,
 * so it stands in for the location an item has no column for.
 */
export async function getCalendarItemPreviewAction(
  id: string,
): Promise<{ data: RecordPreview } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "view",
  );
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { data, error } = await supabase
    .from("calendar_items")
    .select(
      "id, title, item_type, starts_at, ends_at, time_zone, summary, calendar_status",
    )
    .eq("id", id)
    .maybeSingle<CalendarItemPreviewRow>();

  if (error) {
    return actionError(
      "server_error",
      "Could not load this calendar item. Please try again.",
    );
  }
  if (!data) return actionError("conflict", GONE);

  return {
    data: {
      kind: "calendar_item",
      id: data.id,
      title: data.title,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      timeZone: data.time_zone || "UTC",
      location: null,
      statusLabel: humanizeStatus(data.calendar_status),
      statusTone: CALENDAR_STATUS_STYLES[data.calendar_status] ?? "neutral",
      summary: data.summary,
      figures: [{ label: "Type", value: labelFor(ITEM_TYPES, data.item_type) }],
      href: calendarItemHref(data.id),
    },
  };
}
