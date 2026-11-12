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
  createProgram,
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
  countProgramPiecesAction,
  updateContentPieceStatusAction,
  generateEventPlanAction,
  shiftEventPostsAction,
  skipEventPostsAction,
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
    programId?: string;
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
  if (overrides.programId) fd.set("programId", overrides.programId);
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

  test("links a post to a program, filters by it, counts it and unlinks it (#1838)", async () => {
    const program = await createProgram();
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const title = `Program link ${crypto.randomUUID()}`;

    // Independent of the other links: a program and an event together.
    expect(
      await createContentPieceAction(
        pieceForm({ title, programId: program.id, eventId: event.id }),
      ),
    ).toEqual({ success: true });
    const { data: created } = await adminClient
      .from("content_opportunities")
      .select("id, program_id, event_id")
      .eq("title", title)
      .single();
    expect(created).toMatchObject({
      program_id: program.id,
      event_id: event.id,
    });

    // `?program=` narrows /portal/social to it, with the program's name.
    const filtered = await listSocialPieces(
      currentSupabase,
      parseSocialFilters({ program: program.id }),
    );
    expect(filtered.error).toBe(false);
    expect(filtered.pieces.map((piece) => piece.id)).toEqual([created!.id]);
    expect(filtered.pieces[0].program).toMatchObject({ id: program.id });
    expect(await countProgramPiecesAction(program.id)).toBe(1);

    // Linked to something, so not standalone.
    const standalone = await listSocialPieces(
      currentSupabase,
      parseSocialFilters({ linked: "standalone" }),
    );
    expect(standalone.pieces.map((piece) => piece.id)).not.toContain(
      created!.id,
    );

    // Unlinked: the program has no posts left.
    expect(
      await updateContentPieceAction(
        created!.id,
        pieceForm({ title, eventId: event.id }),
      ),
    ).toEqual({ success: true });
    expect(await countProgramPiecesAction(program.id)).toBe(0);

    // The count is for readers of social posts only.
    currentSupabase = anonClient();
    expect(await countProgramPiecesAction(program.id)).toBeNull();

    await adminClient
      .from("content_opportunities")
      .delete()
      .eq("id", created!.id);
    await program.cleanup();
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

  test("offers events, community dates and programs to relate a post to", async () => {
    const item = await createCalendarItem();
    const program = await createProgram();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const options = await listSocialContentLinkOptionsAction();
    expect(options.calendarItems.map((option) => option.id)).toContain(item.id);
    expect(options.programs.map((option) => option.id)).toContain(program.id);
    expect(options.events.length).toBeGreaterThan(0);

    currentSupabase = anonClient();
    expect(await listSocialContentLinkOptionsAction()).toEqual({
      events: [],
      calendarItems: [],
      programs: [],
    });

    await item.cleanup();
    await program.cleanup();
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

  test("two runs at once still create each post once", async () => {
    const event = await createPublishedEvent({
      startsAt: "2099-07-15T22:00:00.000Z",
    });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const results = await Promise.all([
      generateEventPlanAction(event.id, ALL),
      generateEventPlanAction(event.id, ALL),
    ]);
    const created = results.map((result) =>
      "created" in result ? result.created : -1,
    );
    expect(created.sort()).toEqual([0, 5]);

    const { pieces } = await listEventPieces(adminClient, event.id);
    expect(pieces).toHaveLength(5);

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

describe("moving and skipping an event's posts (integration, #1799)", () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function seedPosts(eventId: string) {
    const rows = [
      {
        title: "Open",
        content_status: "draft",
        publish_due_at: "2099-06-01T15:00:00.000Z",
        review_due_at: "2099-05-25T15:00:00.000Z",
        draft_due_at: "2099-05-18T15:00:00.000Z",
      },
      {
        title: "Published",
        content_status: "published",
        publish_due_at: "2099-06-02T15:00:00.000Z",
      },
      {
        title: "Skipped",
        content_status: "skipped",
        skip_reason: "Not needed",
        publish_due_at: "2099-06-03T15:00:00.000Z",
      },
      { title: "Undated", content_status: "idea", publish_due_at: null },
    ];
    const { error } = await adminClient
      .from("content_opportunities")
      .insert(
        rows.map((row) => ({ ...row, event_id: eventId, lead_time_days: 21 })),
      );
    if (error) throw error;
  }

  async function postsByTitle(eventId: string) {
    const { pieces } = await listEventPieces(adminClient, eventId);
    return Object.fromEntries(pieces.map((piece) => [piece.title, piece]));
  }

  const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

  /** Saves a new start for the event, as the Overview form does. */
  async function reschedule(eventId: string, byMs: number) {
    const { data, error } = await adminClient
      .from("events")
      .select("starts_at, ends_at")
      .eq("id", eventId)
      .single();
    if (error) throw error;
    const from = new Date(data.starts_at).toISOString();
    const to = new Date(Date.parse(data.starts_at) + byMs).toISOString();
    const { error: updateError } = await adminClient
      .from("events")
      .update({
        starts_at: to,
        ends_at: data.ends_at
          ? new Date(Date.parse(data.ends_at) + byMs).toISOString()
          : null,
      })
      .eq("id", eventId);
    if (updateError) throw updateError;
    return { from, to };
  }

  test("moving the event 3 days later moves only the unpublished posts", async () => {
    const event = await createPublishedEvent();
    await seedPosts(event.id);
    const before = await postsByTitle(event.id);
    const { from, to } = await reschedule(event.id, 3 * DAY);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await shiftEventPostsAction(event.id, from, to)).toEqual({
      success: true,
      moved: 1,
    });

    const after = await postsByTitle(event.id);
    for (const key of [
      "publish_due_at",
      "review_due_at",
      "draft_due_at",
    ] as const) {
      expect(ms(after.Open[key])).toBe(ms(before.Open[key])! + 3 * DAY);
    }
    for (const title of ["Published", "Skipped", "Undated"]) {
      expect(after[title].publish_due_at).toBe(before[title].publish_due_at);
    }

    // Each moved row is in the audit log.
    const { data: audit } = await adminClient
      .from("audit_log")
      .select("record_id, action")
      .eq("table_name", "content_opportunities")
      .eq("record_id", before.Open.id)
      .eq("action", "update");
    expect(audit?.length).toBeGreaterThan(0);

    await adminClient
      .from("content_opportunities")
      .delete()
      .eq("event_id", event.id);
    await event.cleanup();
  });

  test("a second accept of the same reschedule moves nothing", async () => {
    const event = await createPublishedEvent();
    await seedPosts(event.id);
    const before = await postsByTitle(event.id);
    const { from, to } = await reschedule(event.id, 3 * DAY);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Two managers both saw the event at `from` and saved `to`.
    const [first, second] = await Promise.all([
      shiftEventPostsAction(event.id, from, to),
      shiftEventPostsAction(event.id, from, to),
    ]);
    const results = [first, second];
    expect(results).toContainEqual({ success: true, moved: 1 });
    expect(results).toContainEqual({
      error: "These social posts were already moved for this date change.",
    });

    const after = await postsByTitle(event.id);
    expect(ms(after.Open.publish_due_at)).toBe(
      ms(before.Open.publish_due_at)! + 3 * DAY,
    );

    await adminClient
      .from("content_opportunities")
      .delete()
      .eq("event_id", event.id);
    await event.cleanup();
  });

  test("a delta the event never moved by is refused", async () => {
    const event = await createPublishedEvent();
    await seedPosts(event.id);
    const before = await postsByTitle(event.id);
    const { from } = await reschedule(event.id, DAY);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const forged = new Date(Date.parse(from) + 30 * DAY).toISOString();
    expect(await shiftEventPostsAction(event.id, from, forged)).toEqual({
      error: "These social posts were already moved for this date change.",
    });
    const after = await postsByTitle(event.id);
    expect(after.Open.publish_due_at).toBe(before.Open.publish_due_at);

    await adminClient
      .from("content_opportunities")
      .delete()
      .eq("event_id", event.id);
    await event.cleanup();
  });

  test("view-only roles cannot move posts", async () => {
    const event = await createPublishedEvent();
    const { from, to } = await reschedule(event.id, DAY);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(await shiftEventPostsAction(event.id, from, to)).toEqual(DENIED);
    await event.cleanup();
  });

  test("Skip all on a cancelled event sets the reason on each open post", async () => {
    const event = await createPublishedEvent();
    await seedPosts(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Not while the event is still on.
    expect(await skipEventPostsAction(event.id)).toEqual({
      error: "Only a cancelled event's posts can be skipped together.",
    });

    await adminClient
      .from("events")
      .update({ status: "cancelled" })
      .eq("id", event.id);
    expect(await skipEventPostsAction(event.id)).toEqual({
      success: true,
      skipped: 2,
    });

    const after = await postsByTitle(event.id);
    for (const title of ["Open", "Undated"]) {
      expect(after[title].content_status).toBe("skipped");
      expect(after[title].skip_reason).toBe("Event cancelled");
    }
    expect(after.Published.content_status).toBe("published");
    expect(after.Skipped.skip_reason).toBe("Not needed");

    await adminClient
      .from("content_opportunities")
      .delete()
      .eq("event_id", event.id);
    await event.cleanup();
  });
});
