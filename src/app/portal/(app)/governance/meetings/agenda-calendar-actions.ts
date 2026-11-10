"use server";

// The Community & Partnerships section's own rows (#1242), and the calendar
// reader the Marketing & Social section (#1243) shares with it.
//
// **One reader, parameterized by the section's source.** Both sections are
// `{kind: "calendar"}` with different category keys and item types, so the
// difference between them is data on the template row, not a second query.
// `listAgendaCalendarItemsAction` therefore takes the section's own
// `AgendaSectionSource` and answers for whichever section asked.
//
// The partnerships feed sits beside it because it is the other half of the
// same section: the Calendar holds the dated items, Governance → Partnerships
// holds the relationships, and a board asking "where are we with partners"
// wants both at once. Two reads, one section, and no third module file for
// four columns.
//
// Neither read is an error the caller has to act on. The content calendar is
// its own entitlement and a board member commonly holds governance at manage
// and the calendar at none; `unavailable` says which of the two happened so
// the section can put a quiet line where the rows would have been and keep
// its Discussion box, which is the part that has to work in the meeting.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { personDisplayName } from "@/lib/format";
import { todayInZone } from "@/lib/time";
import { hasStructuredRecurrence } from "../../calendar/calendar-recurrence";
import type { CalendarCategory } from "../../calendar/calendar-shared";
import { listCalendarCategories } from "../../calendar/queries";
import {
  CLOSED_PARTNERSHIP_STAGES,
  type PartnershipStage,
} from "../partnerships/partnership-opportunity-form";
import {
  calendarSectionSource,
  sourceShowsContentState,
} from "./agenda-template-shared";
import { nextInstanceInWindow } from "./meeting-context-shared";
import {
  resolveAgendaCalendarWindow,
  type MeetingWindow,
} from "./meeting-context-window";

export type AgendaCalendarItem = {
  id: string;
  title: string;
  item_type: string;
  /**
   * The occurrence's start, which for a recurring item is **not** the row's
   * own `starts_at`: an annual observance is stored once, dated in the year it
   * was first entered, and projected into the window it falls in.
   */
  starts_at: string;
  /** The item's own zone, which is the one its day is read in. */
  time_zone: string;
  calendar_status: string;
  priority_tier: number;
  owner_id: string | null;
  /** Already resolved through `personDisplayName`; null when nobody owns it. */
  owner_name: string | null;
  /** `calendar_categories.key` values, labelled by the tenant's own words. */
  categories: string[];
  /**
   * The item's content pieces (#1231), for a section whose source says it is
   * about making content -- only as much of each as the row says out loud.
   * Always empty for a section that does not show content work state, because
   * its read does not join them at all.
   */
  content_pieces: AgendaContentPiece[];
  /**
   * The soonest publish deadline still owed: the earliest `publish_due_at`
   * among the pieces nobody has published or skipped yet. Null when the item
   * has no pieces, none of them carry a publish date, or the work is done --
   * "nothing outstanding" is what the column should say once it is.
   */
  publish_due_at: string | null;
  /**
   * `publish_due_at` is already behind the moment this was read. This is the
   * row the section exists for: a list of marketing dates that does not say
   * which of them have nothing published is one the board cannot act on.
   */
  content_overdue: boolean;
};

/** As much of a content piece as an agenda row says out loud. */
export type AgendaContentPiece = {
  content_status: string;
};

export type AgendaCalendarFeed = {
  /** The organization's zone, which is where the window was cut. */
  timeZone: string;
  /** The window, as the block labels it: two inclusive days in that zone. */
  window: Pick<MeetingWindow, "fromDate" | "toDate">;
  items: AgendaCalendarItem[];
  /**
   * The tenant's active categories, so the block can show its own words for
   * them rather than the seeded keys.
   */
  categoryOptions: CalendarCategory[];
  /**
   * Null when the rows above are the whole truth. `forbidden` means the
   * caller's tenant is not entitled to the content calendar, or their roles do
   * not reach it -- `my_permissions()` reports both as `none`. `error` means
   * the read failed.
   */
  unavailable: "forbidden" | "error" | null;
};

const AGENDA_CALENDAR_ITEM_SELECT =
  "id, title, item_type, starts_at, time_zone, calendar_status, priority_tier, owner_id, series_key, recurrence_start_month, recurrence_start_day, recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end, owner:people!calendar_items_owner_id_fkey(name, preferred_name, email), calendar_item_categories(category)";

// The same read with the content pieces attached, for a source that shows
// content work state. A second constant rather than one join everybody pays
// for: Community & Partnerships never shows a content column, and rows it
// would only throw away are rows its section should not wait for. The table
// kept its `content_opportunities` name through #1231's reshape.
//
// Item-scoped on purpose (#1796): a row here is a community date, and these
// are the posts planned against it. A standalone or event-only post has no
// such row to sit on, and is planned on `/portal/social` and on its event's
// Social content section instead -- see §5.20.
const AGENDA_CALENDAR_ITEM_WITH_CONTENT_SELECT = `${AGENDA_CALENDAR_ITEM_SELECT}, content_opportunities(content_status, publish_due_at)`;

type RawAgendaCalendarRow = {
  id: string;
  title: string;
  item_type: string;
  starts_at: string;
  time_zone: string;
  calendar_status: string;
  priority_tier: number;
  owner_id: string | null;
  series_key: string | null;
  recurrence_start_month: number | null;
  recurrence_start_day: number | null;
  recurrence_end_month: number | null;
  recurrence_end_day: number | null;
  recurrence_end_is_month_end: boolean;
  owner: {
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
  calendar_item_categories: { category: string }[] | null;
  /** Absent unless the section's source asked for content work state. */
  content_opportunities?:
    { content_status: string; publish_due_at: string | null }[] | null;
};

/** Statuses a piece needs no more work in, so nothing is owed for it. */
const TERMINAL_CONTENT_STATUSES = new Set(["published", "skipped"]);

/**
 * What an item still owes, out of the pieces planned against it.
 *
 * Measured against `now` rather than against the organization's today, because
 * `publish_due_at` is a `timestamptz` -- a deadline at an instant. The
 * partnerships feed below reads its `next_step_date` in the org's zone for the
 * opposite reason: that column is a `date`, and a UTC comparison lands it on
 * the wrong day near the boundary.
 *
 * A skipped piece owes nothing: dropping a post deliberately is a decision,
 * not a miss, and flagging it would put noise in the column the board is
 * meant to read down.
 */
function contentWorkState(
  row: RawAgendaCalendarRow,
  now: number,
): Pick<
  AgendaCalendarItem,
  "content_pieces" | "publish_due_at" | "content_overdue"
> {
  const pieces = row.content_opportunities ?? [];
  const outstanding = pieces
    .filter(
      (piece) =>
        !TERMINAL_CONTENT_STATUSES.has(piece.content_status) &&
        piece.publish_due_at !== null,
    )
    .map((piece) => piece.publish_due_at as string)
    .sort();
  const publishDueAt = outstanding[0] ?? null;

  return {
    content_pieces: pieces.map((piece) => ({
      content_status: piece.content_status,
    })),
    publish_due_at: publishDueAt,
    content_overdue: publishDueAt !== null && Date.parse(publishDueAt) < now,
  };
}

function toAgendaCalendarItem(
  row: RawAgendaCalendarRow,
  startsAt: string,
  now: number,
): AgendaCalendarItem {
  return {
    id: row.id,
    title: row.title,
    item_type: row.item_type,
    starts_at: startsAt,
    time_zone: row.time_zone,
    calendar_status: row.calendar_status,
    priority_tier: row.priority_tier,
    owner_id: row.owner_id,
    // `people` is not readable by every role that reaches this section; where
    // it is not, the embed comes back null and the row still says what it is.
    owner_name: row.owner ? personDisplayName(row.owner, "") || null : null,
    categories: (row.calendar_item_categories ?? []).map(
      (link) => link.category,
    ),
    // A projected occurrence carries the row's own pieces: the content work
    // belongs to the item, not to the year the window happens to show it in.
    ...contentWorkState(row, now),
  };
}

/**
 * The dated items a calendar-sourced agenda section covers.
 *
 * `source` arrives from the template row the browser is already rendering, and
 * is re-validated here: it chooses which rows are filtered *in*, never which
 * rows the caller may see. RLS does that, so there is no tenant filter below.
 */
export async function listAgendaCalendarItemsAction(
  meetingId: string,
  meetingDate: string,
  source: unknown,
): Promise<{ data: AgendaCalendarFeed } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsedSource = calendarSectionSource(source);
  if (!parsedSource) {
    return { error: "That agenda section does not read from the calendar." };
  }

  const [timeZone, permissions, agendaResult] = await Promise.all([
    getOrgTimeZone(supabase),
    getCurrentUserPermissions(supabase),
    supabase
      .from("agendas")
      .select("next_meeting_date")
      .eq("meeting_id", meetingId)
      .maybeSingle(),
  ]);

  const window = resolveAgendaCalendarWindow({
    meetingDate,
    nextMeetingDate:
      (agendaResult.data?.next_meeting_date as string | null) ?? null,
    timeZone,
  });
  const base = {
    timeZone,
    window: { fromDate: window.fromDate, toDate: window.toDate },
    items: [] as AgendaCalendarItem[],
    categoryOptions: [] as CalendarCategory[],
  };

  if (agendaResult.error) return { data: { ...base, unavailable: "error" } };
  if (!hasPermission(permissions, "content_calendar", "view")) {
    return { data: { ...base, unavailable: "forbidden" } };
  }

  // One decision, taken off the source, for both reads and for the table that
  // renders them: a section showing content columns is a section whose rows
  // carry the pieces behind them.
  const itemSelect = sourceShowsContentState(parsedSource)
    ? AGENDA_CALENDAR_ITEM_WITH_CONTENT_SELECT
    : AGENDA_CALENDAR_ITEM_SELECT;

  const [dated, series, categoryOptions] = await Promise.all([
    supabase
      .from("calendar_items")
      .select(itemSelect)
      // `calendar_items` has no cancelled state -- its vocabulary is
      // idea/active/complete/archived -- so `archived` is the one that means
      // "put away", and it is the exclusion every other calendar read makes.
      .neq("calendar_status", "archived")
      .gte("starts_at", window.fromInstant)
      .lte("starts_at", window.toInstant),
    // Every live series, whatever year its anchor row is dated in: the window
    // filter above cannot see a 2024 row that recurs this March. Bounded by
    // how few structured-recurrence rows exist, not by a range -- the same
    // read the "Next 30 days" block makes (#1223).
    supabase
      .from("calendar_items")
      .select(itemSelect)
      .neq("calendar_status", "archived")
      .not("series_key", "is", null),
    listCalendarCategories(supabase),
  ]);

  if (dated.error || series.error) {
    return { data: { ...base, unavailable: "error" } };
  }

  // A key the tenant has deactivated (or never had) drops out of the filter
  // rather than out of the section: the item types beside it still match, and
  // deactivating a category must not empty somebody's agenda. An unreadable
  // `calendar_categories` comes back empty from `listCalendarCategories`, so
  // the same narrowing covers it.
  const activeKeys = new Set(categoryOptions.map((option) => option.value));
  const wantedCategories = new Set(
    (parsedSource.categories ?? []).filter((key) => activeKeys.has(key)),
  );
  const wantedItemTypes = new Set(parsedSource.item_types ?? []);

  // Either side matches on its own: a partner event tagged with no category at
  // all still belongs in Community & Partnerships, and so does a categorised
  // item of some other type. A source naming neither matches nothing, which is
  // an empty section rather than the whole calendar poured into one.
  const matches = (row: RawAgendaCalendarRow): boolean =>
    wantedItemTypes.has(row.item_type) ||
    (row.calendar_item_categories ?? []).some((link) =>
      wantedCategories.has(link.category),
    );

  const items: AgendaCalendarItem[] = [];
  const datedIds = new Set<string>();
  // One reading of the clock for the whole feed: two rows with the same
  // deadline must not disagree about whether it has passed.
  const now = Date.now();

  for (const row of (dated.data ?? []) as unknown as RawAgendaCalendarRow[]) {
    datedIds.add(row.id);
    if (matches(row)) {
      items.push(toAgendaCalendarItem(row, row.starts_at, now));
    }
  }

  for (const row of (series.data ?? []) as unknown as RawAgendaCalendarRow[]) {
    // Already in the window on its own date: listing the projection too would
    // show an annual observance twice in the year it was entered.
    if (datedIds.has(row.id)) continue;
    if (!hasStructuredRecurrence(row)) continue;
    if (!matches(row)) continue;
    const instance = nextInstanceInWindow(row, window);
    if (!instance) continue;
    items.push(toAgendaCalendarItem(row, instance.startsAt, now));
  }

  return {
    data: {
      ...base,
      // Sorted here rather than by the query: a projected occurrence carries a
      // date no `order` ever saw, and the two reads arrive separately.
      items: items.sort(
        (a, b) =>
          Date.parse(a.starts_at) - Date.parse(b.starts_at) ||
          a.id.localeCompare(b.id),
      ),
      categoryOptions,
      unavailable: null,
    },
  };
}

export type AgendaPartnership = {
  id: string;
  organization: string;
  stage: PartnershipStage;
  next_step_date: string | null;
  owner_name: string | null;
  /**
   * The next step is already behind the organization's today. This is the row
   * a board is there to say out loud, the way the Events section flags an
   * event that still owes its report.
   */
  overdue: boolean;
};

export type AgendaPartnershipsFeed = {
  partnerships: AgendaPartnership[];
  /**
   * `partnership_opportunities` is read under the same `governance` resource
   * this action already gated on, so past that gate the read can only fail --
   * there is no `forbidden` case to distinguish here.
   */
  unavailable: "error" | null;
};

const AGENDA_PARTNERSHIP_SELECT =
  "id, stage, next_step_date, organization:people!partnership_opportunities_organization_person_id_fkey(name, preferred_name, email), owner:people!partnership_opportunities_owner_person_id_fkey(name, preferred_name, email)";

type RawAgendaPartnershipRow = {
  id: string;
  stage: string;
  next_step_date: string | null;
  organization: {
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
  owner: {
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
};

/**
 * Partnerships still in play, soonest next step first.
 *
 * Ordered by `next_step_date` with nulls last, which is the Partnerships
 * page's own order: a board reading this section is looking for the
 * relationships that need a push, and a dated one needs it before an undated
 * one does. The closed stages never appear -- a won or lost partnership is
 * history, and this list is the work in front of the board.
 */
export async function listOpenPartnershipsAction(): Promise<
  { data: AgendaPartnershipsFeed } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const [timeZone, result] = await Promise.all([
    getOrgTimeZone(supabase),
    supabase
      .from("partnership_opportunities")
      .select(AGENDA_PARTNERSHIP_SELECT)
      .not("stage", "in", `(${CLOSED_PARTNERSHIP_STAGES.join(",")})`)
      .order("next_step_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true }),
  ]);

  if (result.error) {
    return { data: { partnerships: [], unavailable: "error" } };
  }

  // The organization's day, not the server's: `next_step_date` is a Postgres
  // `date`, and comparing it against a UTC "today" makes every row near the
  // boundary overdue a few hours early or late.
  const today = todayInZone(timeZone);

  return {
    data: {
      partnerships: (
        (result.data ?? []) as unknown as RawAgendaPartnershipRow[]
      ).map((row) => ({
        id: row.id,
        organization: personDisplayName(
          row.organization,
          "Partner organization",
        ),
        stage: row.stage as PartnershipStage,
        next_step_date: row.next_step_date,
        owner_name: row.owner ? personDisplayName(row.owner, "") || null : null,
        overdue: row.next_step_date !== null && row.next_step_date < today,
      })),
      unavailable: null,
    },
  };
}
