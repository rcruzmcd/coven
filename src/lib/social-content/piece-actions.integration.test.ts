// Integration test: exercises the real content-piece Server Actions against a
// real local Supabase stack (checkPermission, then real
// `content_opportunities` RLS -- same content_calendar resource as
// calendar_items: admin/event_coordinator manage, finance/board/volunteer
// view). Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createCalendarItem,
  createPublishedEvent,
  signInAs,
} from "../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createContentPieceAction,
  updateContentPieceAction,
  deleteContentPieceAction,
  listSocialContentLinkOptionsAction,
  updateContentPieceStatusAction,
  generateEventPlanAction,
} = await import("./piece-actions");
const { listEventPieces, listSocialPieces } = await import("./queries");
const { parseSocialFilters } = await import("./social-filters");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function pieceForm(
  overrides: {
    title?: string;
    internalNotes?: string;
    calendarItemId?: string;
    eventId?: string;
  } = {},
) {
  const fd = new FormData();
  fd.set("title", overrides.title ?? "Instagram carousel");
  fd.set("contentStatus", "idea");
  fd.set("leadTimeDays", "21");
  if (overrides.internalNotes) fd.set("internalNotes", overrides.internalNotes);
  if (overrides.calendarItemId)
    fd.set("calendarItemId", overrides.calendarItemId);
  if (overrides.eventId) fd.set("eventId", overrides.eventId);
  return fd;
}

/** As the calendar item card submits it: related to the item it is on. */
const itemForm = (
  calendarItemId: string,
  overrides: Parameters<typeof pieceForm>[0] = {},
) => pieceForm({ ...overrides, calendarItemId });

const DENIED = { error: "You don't have permission to perform this action." };

describe("social post actions (integration)", () => {
  test("requires a signed-in user to add a social post", async () => {
    currentSupabase = anonClient();
    expect(await createContentPieceAction(pieceForm())).toEqual({
      error: "You must be signed in to add a social post.",
    });
  });

  test("admin role (content_calendar manage) can add, update and delete pieces", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Two pieces on the one item: what the dropped unique constraint used to
    // refuse, and the whole point of #1231.
    expect(await createContentPieceAction(itemForm(item.id))).toEqual({
      success: true,
    });
    expect(
      await createContentPieceAction(
        itemForm(item.id, { title: "Email to past participants" }),
      ),
    ).toEqual({ success: true });

    const { data: created } = await adminClient
      .from("content_opportunities")
      .select("id, title, content_status")
      .eq("calendar_item_id", item.id)
      .order("created_at", { ascending: true });
    expect(created?.map((piece) => piece.title)).toEqual([
      "Instagram carousel",
      "Email to past participants",
    ]);
    expect(created?.[0].content_status).toBe("idea");

    expect(
      await updateContentPieceAction(
        created![0].id,
        itemForm(item.id, { internalNotes: "Updated in integration test" }),
      ),
    ).toEqual({ success: true });

    const { data: updated } = await adminClient
      .from("content_opportunities")
      .select("internal_notes")
      .eq("id", created![0].id)
      .single();
    expect(updated?.internal_notes).toBe("Updated in integration test");

    expect(await deleteContentPieceAction(created![1].id)).toEqual({
      success: true,
    });
    const { count } = await adminClient
      .from("content_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("calendar_item_id", item.id);
    expect(count).toBe(1);

    await item.cleanup();
  });

  test("relates a post to an event, an item, both or nothing, and moves it (#1793)", async () => {
    const item = await createCalendarItem();
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const title = `Related-to ${crypto.randomUUID()}`;

    expect(
      await createContentPieceAction(
        pieceForm({ title, calendarItemId: item.id, eventId: event.id }),
      ),
    ).toEqual({ success: true });
    const { data: created } = await adminClient
      .from("content_opportunities")
      .select("id, calendar_item_id, event_id")
      .eq("title", title)
      .single();
    expect(created).toMatchObject({
      calendar_item_id: item.id,
      event_id: event.id,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/portal/events/${event.id}`,
    );

    // Unlinked from both: a standalone post, publish date and all optional.
    revalidatePathMock.mockClear();
    expect(
      await updateContentPieceAction(created!.id, pieceForm({ title })),
    ).toEqual({ success: true });
    const { data: standalone } = await adminClient
      .from("content_opportunities")
      .select("calendar_item_id, event_id, publish_due_at")
      .eq("id", created!.id)
      .single();
    expect(standalone).toEqual({
      calendar_item_id: null,
      event_id: null,
      publish_due_at: null,
    });
    // The event it left is refreshed too.
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/portal/events/${event.id}`,
    );

    expect(await deleteContentPieceAction(created!.id)).toEqual({
      success: true,
    });
    await item.cleanup();
    await event.cleanup();
  });

  test("a post added from an event's Social content section is the event's and /portal/social's (#1795)", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const title = `Event section ${crypto.randomUUID()}`;

    // As the section submits it: related to the event it is on.
    expect(
      await createContentPieceAction(pieceForm({ title, eventId: event.id })),
    ).toEqual({ success: true });

    const forEvent = await listEventPieces(currentSupabase, event.id);
    expect(forEvent.error).toBe(false);
    const created = forEvent.pieces.find((piece) => piece.title === title);
    expect(created).toMatchObject({ event_id: event.id });

    // The same row on /portal/social, under its event filter and unfiltered.
    for (const params of [{ event: event.id }, {}]) {
      const social = await listSocialPieces(
        currentSupabase,
        parseSocialFilters(params),
      );
      expect(social.error).toBe(false);
      const row = social.pieces.find((piece) => piece.id === created!.id);
      expect(row?.event).toMatchObject({ id: event.id, name: event.name });
    }

    expect(await deleteContentPieceAction(created!.id)).toEqual({
      success: true,
    });
    await event.cleanup();
  });

  test("moves only the status, and asks for a reason to skip (#1794)", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(
      await createContentPieceAction(
        pieceForm({ eventId: event.id, internalNotes: "keep me" }),
      ),
    ).toEqual({ success: true });
    const { data: created } = await adminClient
      .from("content_opportunities")
      .select("id")
      .eq("event_id", event.id)
      .single();

    expect(
      await updateContentPieceStatusAction(created!.id, "skipped"),
    ).toEqual({ error: "A reason is required when content is skipped." });
    expect(await updateContentPieceStatusAction(created!.id, "bogus")).toEqual({
      error: "Select a valid content status.",
    });
    expect(
      await updateContentPieceStatusAction(created!.id, "in_review"),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/portal/events/${event.id}`,
    );

    const { data: row } = await adminClient
      .from("content_opportunities")
      .select("content_status, internal_notes, event_id, status_changed_at")
      .eq("id", created!.id)
      .single();
    expect(row).toMatchObject({
      content_status: "in_review",
      internal_notes: "keep me",
      event_id: event.id,
    });
    expect(row!.status_changed_at).not.toBeNull();

    // View-only cannot move it; an unknown id is reported, not silently ok.
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(
      await updateContentPieceStatusAction(created!.id, "approved"),
    ).toEqual(DENIED);
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(
      await updateContentPieceStatusAction(crypto.randomUUID(), "approved"),
    ).toEqual({ error: "Could not find the social post to update." });

    await deleteContentPieceAction(created!.id);
    await event.cleanup();
  });

  test("refuses a link to a record that does not exist", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(
      await createContentPieceAction(
        pieceForm({ eventId: crypto.randomUUID() }),
      ),
    ).toEqual({ error: "Could not add the social post. Please try again." });
  });

  test("offers events and community dates to relate a post to", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const options = await listSocialContentLinkOptionsAction();
    expect(options.calendarItems.map((option) => option.id)).toContain(item.id);
    expect(options.events.length).toBeGreaterThan(0);

    currentSupabase = anonClient();
    expect(await listSocialContentLinkOptionsAction()).toEqual({
      events: [],
      calendarItems: [],
    });

    await item.cleanup();
  });

  test("event_coordinator role (content_calendar manage) can add a piece", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await createContentPieceAction(itemForm(item.id))).toEqual({
      success: true,
    });

    await item.cleanup();
  });

  test("finance role (content_calendar view only) cannot add, update or delete a piece", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect(await createContentPieceAction(itemForm(item.id))).toEqual(DENIED);
    expect(
      await updateContentPieceAction(crypto.randomUUID(), pieceForm()),
    ).toEqual(DENIED);
    expect(await deleteContentPieceAction(crypto.randomUUID())).toEqual(DENIED);

    await item.cleanup();
  });

  test("board role (content_calendar view only) cannot add a piece", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await createContentPieceAction(itemForm(item.id))).toEqual(DENIED);

    await item.cleanup();
  });

  test("volunteer role (content_calendar view only) cannot add a piece", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect(await createContentPieceAction(itemForm(item.id))).toEqual(DENIED);

    await item.cleanup();
  });

  test("a deactivated (former) account cannot add a piece", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(await createContentPieceAction(pieceForm())).toEqual(DENIED);
  });
});

describe("generateEventPlanAction (integration, #1798)", () => {
  const ALL = [
    "Announce",
    "Reminder",
    "Last call",
    "Day-of",
    "Recap / thank-you",
  ];

  test("creates the ticked posts once, however many times it runs", async () => {
    const event = await createPublishedEvent({
      startsAt: "2099-06-15T22:00:00.000Z",
    });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await generateEventPlanAction(event.id, ["Announce", "Reminder"]),
    ).toEqual({ success: true, created: 2 });
    expect(await generateEventPlanAction(event.id, ALL)).toEqual({
      success: true,
      created: 3,
    });
    expect(await generateEventPlanAction(event.id, ALL)).toEqual({
      success: true,
      created: 0,
    });

    const { pieces } = await listEventPieces(adminClient, event.id);
    expect(pieces.map((piece) => piece.title).sort()).toEqual([...ALL].sort());
    const reminder = pieces.find((piece) => piece.title === "Reminder")!;
    expect(reminder.content_status).toBe("idea");
    expect(new Date(reminder.publish_due_at!).getTime()).toBe(
      new Date("2099-06-08T22:00:00.000Z").getTime(),
    );
    expect(reminder.review_due_at).not.toBeNull();
    expect(reminder.draft_due_at).not.toBeNull();
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/portal/events/${event.id}`,
    );

    await adminClient
      .from("content_opportunities")
      .delete()
      .eq("event_id", event.id);
    await event.cleanup();
  });

  test("view-only roles cannot generate a plan", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(await generateEventPlanAction(event.id, ["Announce"])).toEqual(
      DENIED,
    );
    await event.cleanup();
  });
});
