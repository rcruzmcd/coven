// Integration test: a social post taking media from its event (#1827) and the
// event flyer, against a real local Supabase stack -- references through
// add_social_post_event_media(), what deleting the event media leaves behind,
// the flyer's foreign key and its exemption from the retention purge.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";
import {
  EVENT_MEDIA_BUCKET,
  eventMediaPath,
} from "@/lib/storage/event-media-files";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createContentPieceAction, deleteContentPieceAction } =
  await import("./piece-actions");
const {
  addSocialPostEventMediaAction,
  deleteSocialPostMediaAction,
  getSocialPostExtrasAction,
} = await import("./post-content-actions");

const service = serviceRoleClient();
let tenantId: string;
let event: Awaited<ReturnType<typeof createPublishedEvent>>;
let otherEvent: Awaited<ReturnType<typeof createPublishedEvent>>;
const createdPostIds: string[] = [];
const objects: string[] = [];

beforeAll(async () => {
  const { data } = await adminClient.rpc("current_tenant_id");
  tenantId = data as string;
  event = await createPublishedEvent();
  otherEvent = await createPublishedEvent();
});

afterAll(async () => {
  currentSupabase = adminClient;
  for (const id of createdPostIds) await deleteContentPieceAction(id);
  if (objects.length) {
    await service.storage.from(EVENT_MEDIA_BUCKET).remove(objects);
  }
  await event?.cleanup();
  await otherEvent?.cleanup();
});

/** An event photo: a real object, so signing can be checked, and its row. */
async function eventPhoto(eventId: string, name = "photo.jpg") {
  const path = eventMediaPath(tenantId, eventId, "jpg");
  objects.push(path);
  const { error: uploadError } = await service.storage
    .from(EVENT_MEDIA_BUCKET)
    .upload(path, new Blob([new Uint8Array(4)], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
    });
  if (uploadError) throw uploadError;
  const { data, error } = await service
    .from("event_media")
    .insert({
      tenant_id: tenantId,
      event_id: eventId,
      storage_path: path,
      original_filename: name,
      content_type: "image/jpeg",
      size_bytes: 4,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function createPost(eventId: string | null) {
  currentSupabase = adminClient;
  const fd = new FormData();
  const title = `#1827 post ${crypto.randomUUID().slice(0, 8)}`;
  fd.set("title", title);
  fd.set("contentStatus", "idea");
  fd.set("leadTimeDays", "21");
  if (eventId) fd.set("eventId", eventId);
  expect(await createContentPieceAction(fd)).toEqual({ success: true });
  const { data } = await adminClient
    .from("content_opportunities")
    .select("id")
    .eq("title", title)
    .single();
  createdPostIds.push(data!.id);
  return data!.id as string;
}

describe("a post's media from its event", () => {
  test("references the event's files in order, skips repeats, and signs them", async () => {
    const first = await eventPhoto(event.id, "first.jpg");
    const second = await eventPhoto(event.id, "second.jpg");
    const post = await createPost(event.id);

    expect(
      await addSocialPostEventMediaAction(post, [second, first, second]),
    ).toEqual({ added: 2 });
    expect(await addSocialPostEventMediaAction(post, [first])).toEqual({
      added: 0,
    });

    const extras = await getSocialPostExtrasAction(post, event.id);
    expect(extras.media.map((item) => item.original_filename)).toEqual([
      "second.jpg",
      "first.jpg",
    ]);
    expect(extras.media.map((item) => item.event_media_id)).toEqual([
      second,
      first,
    ]);
    expect(
      extras.media.every((item) => item.url?.includes(EVENT_MEDIA_BUCKET)),
    ).toBe(true);
    expect(extras.media.some((item) => item.missing)).toBe(false);

    // No copy: the post's bucket holds nothing for it.
    const { data: copies } = await service.storage
      .from("social-post-media")
      .list(`${tenantId}/${post}`);
    expect(copies ?? []).toEqual([]);
  });

  test("refuses another event's media, a post with no event, and a viewer", async () => {
    const foreign = await eventPhoto(otherEvent.id);
    const post = await createPost(event.id);
    expect(await addSocialPostEventMediaAction(post, [foreign])).toEqual({
      error:
        "Some of those files aren't this event's anymore. Reopen the picker and try again.",
    });

    const loose = await createPost(null);
    const own = await eventPhoto(event.id);
    expect(await addSocialPostEventMediaAction(loose, [own])).toEqual({
      error: "This post isn't related to an event. Save the event first.",
    });

    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(await addSocialPostEventMediaAction(post, [own])).toHaveProperty(
      "error",
    );
    const { data } = await service
      .from("social_post_media")
      .select("id")
      .eq("content_opportunity_id", post);
    expect(data).toEqual([]);
  });

  test("holds at most ten files, references included", async () => {
    const post = await createPost(event.id);
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) ids.push(await eventPhoto(event.id));
    expect(await addSocialPostEventMediaAction(post, ids)).toEqual({
      error: "A post holds up to 10 photos or videos.",
    });
    expect(await addSocialPostEventMediaAction(post, ids.slice(0, 10))).toEqual(
      { added: 10 },
    );
  });

  test("deleting the event media leaves the item, shown as missing, and removable", async () => {
    const photo = await eventPhoto(event.id, "gone.jpg");
    const post = await createPost(event.id);
    await addSocialPostEventMediaAction(post, [photo]);

    await service.from("event_media").delete().eq("id", photo);

    currentSupabase = adminClient;
    const [item] = (await getSocialPostExtrasAction(post, event.id)).media;
    expect(item).toMatchObject({
      original_filename: "gone.jpg",
      event_media_id: null,
      missing: true,
      url: null,
    });

    expect(await deleteSocialPostMediaAction(item.id)).toEqual({
      success: true,
    });
    expect((await getSocialPostExtrasAction(post, event.id)).media).toEqual([]);
  });

  test("removing a reference leaves the event's file alone", async () => {
    const photo = await eventPhoto(event.id);
    const post = await createPost(event.id);
    await addSocialPostEventMediaAction(post, [photo]);
    const [item] = (await getSocialPostExtrasAction(post, event.id)).media;

    expect(await deleteSocialPostMediaAction(item.id)).toEqual({
      success: true,
    });
    const { data } = await service
      .from("event_media")
      .select("id")
      .eq("id", photo);
    expect(data).toHaveLength(1);
  });
});

describe("the event flyer", () => {
  test("must be the event's own media, and clears when that media is deleted", async () => {
    const foreign = await eventPhoto(otherEvent.id);
    const { error: refused } = await adminClient
      .from("events")
      .update({ flyer_media_id: foreign })
      .eq("id", event.id);
    expect(refused?.code).toBe("23503");

    const flyer = await eventPhoto(event.id, "flyer.jpg");
    const { error } = await adminClient
      .from("events")
      .update({ flyer_media_id: flyer })
      .eq("id", event.id);
    expect(error).toBeNull();

    await service.from("event_media").delete().eq("id", flyer);
    const { data } = await adminClient
      .from("events")
      .select("flyer_media_id")
      .eq("id", event.id)
      .single();
    expect(data?.flyer_media_id).toBeNull();
  });

  test("is never purged by the retention setting", async () => {
    const flyer = await eventPhoto(event.id, "flyer.jpg");
    const photo = await eventPhoto(event.id, "crowd.jpg");
    await adminClient
      .from("events")
      .update({ flyer_media_id: flyer })
      .eq("id", event.id);

    const { error: settingError } = await adminClient.rpc(
      "set_event_media_retention_days",
      { p_days: 30 },
    );
    expect(settingError).toBeNull();
    try {
      const { data: expired, error } = await service.rpc(
        "expired_event_media",
        { p_now: "2100-01-01T00:00:00Z" },
      );
      expect(error).toBeNull();
      const ids = (expired ?? []).map((row: { id: string }) => row.id);
      expect(ids).toContain(photo);
      expect(ids).not.toContain(flyer);

      const { data: rows } = await adminClient
        .from("event_media")
        .select("id, expires_at")
        .in("id", [flyer, photo]);
      const byId = new Map(rows?.map((row) => [row.id, row.expires_at]));
      expect(byId.get(flyer)).toBeNull();
      expect(byId.get(photo)).not.toBeNull();
    } finally {
      await adminClient.rpc("set_event_media_retention_days", {
        p_days: null,
      });
      await adminClient
        .from("events")
        .update({ flyer_media_id: null })
        .eq("id", event.id);
    }
  });
});
