// Integration test: the `/portal/social` read (#1794) against a real local
// Supabase stack -- the linked-to filters, the embedded event and community
// date names, and a post with no date coming back for the Unscheduled tray.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createCalendarItem,
  createPublishedEvent,
  signInAs,
} from "../../../test/integration-setup";
import { getSocialPiece, listSocialPieces } from "./queries";
import { parseSocialFilters } from "./social-filters";

const tag = `social-query-${crypto.randomUUID()}`;
let event: Awaited<ReturnType<typeof createPublishedEvent>>;
let item: Awaited<ReturnType<typeof createCalendarItem>>;
const ids: Record<"event" | "item" | "standalone", string> = {
  event: "",
  item: "",
  standalone: "",
};
let reader: SupabaseClient;

async function insertPiece(
  title: string,
  links: { event_id?: string; calendar_item_id?: string },
  publishDueAt: string | null,
) {
  const { data, error } = await adminClient
    .from("content_opportunities")
    .insert({
      title: `${tag} ${title}`,
      content_status: "idea",
      lead_time_days: 14,
      publish_due_at: publishDueAt,
      ...links,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Only this file's posts, whatever else the seeded tenant holds. */
async function titles(params: Record<string, string>) {
  const { pieces, error } = await listSocialPieces(
    reader,
    parseSocialFilters(params),
  );
  expect(error).toBe(false);
  return pieces
    .filter((piece) => piece.title.startsWith(tag))
    .map((piece) => piece.title.slice(tag.length + 1))
    .sort();
}

beforeAll(async () => {
  event = await createPublishedEvent();
  item = await createCalendarItem();
  ids.event = await insertPiece(
    "event post",
    { event_id: event.id },
    new Date().toISOString(),
  );
  ids.item = await insertPiece(
    "item post",
    { calendar_item_id: item.id },
    new Date().toISOString(),
  );
  ids.standalone = await insertPiece("standalone post", {}, null);
  // content_calendar view is enough to read every post.
  reader = await signInAs(SEEDED_USERS.board);
});

afterAll(async () => {
  await adminClient
    .from("content_opportunities")
    .delete()
    .in("id", Object.values(ids));
  await item.cleanup();
  await event.cleanup();
});

describe("listSocialPieces (integration)", () => {
  test("returns every post, the undated one included", async () => {
    expect(await titles({})).toEqual([
      "event post",
      "item post",
      "standalone post",
    ]);
  });

  test("narrows by what a post is related to", async () => {
    expect(await titles({ linked: "event" })).toEqual(["event post"]);
    expect(await titles({ linked: "community_date" })).toEqual(["item post"]);
    expect(await titles({ linked: "standalone" })).toEqual(["standalone post"]);
    expect(await titles({ event: event.id })).toEqual(["event post"]);
  });

  test("names the related record and keeps an undated post unscheduled", async () => {
    const { piece } = await getSocialPiece(reader, ids.item);
    expect(piece?.calendar_item?.id).toBe(item.id);
    expect(piece?.event).toBeNull();

    // Board holds no events access: the link is still there, the name is not.
    const { piece: eventPost } = await getSocialPiece(reader, ids.event);
    expect(eventPost?.event_id).toBe(event.id);
    expect(eventPost?.event).toBeNull();

    const { piece: standalone } = await getSocialPiece(reader, ids.standalone);
    expect(standalone?.publish_due_at).toBeNull();
  });

  test("a post that does not exist is not an error", async () => {
    expect(await getSocialPiece(reader, crypto.randomUUID())).toEqual({
      piece: null,
      error: false,
    });
    expect(await getSocialPiece(reader, "not-a-uuid")).toEqual({
      piece: null,
      error: false,
    });
  });
});
