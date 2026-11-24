// Integration test: replace_social_post_story_images() (#1909) against a real
// local Supabase stack -- the generated set goes first in frame order, a
// regenerate replaces only it (never media added by hand) and hands back the
// old objects, and a published post, a reel or a path outside the post is
// refused. An event template's single image (#1926) is taken for a 4:5 post
// and named after the template. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createAvailableGearItems,
  createPublishedEvent,
  deleteEvent,
} from "../../../test/integration-setup";
import { SOCIAL_POST_MEDIA_BUCKET } from "./pieces";

let tenantId: string;
let gear: Awaited<ReturnType<typeof createAvailableGearItems>>;
let eventId: string;
const postIds: string[] = [];
const objects: string[] = [];

beforeAll(async () => {
  const { data } = await adminClient.rpc("current_tenant_id");
  tenantId = data as string;
  gear = await createAvailableGearItems(1);
  eventId = (await createPublishedEvent()).id;
});

afterAll(async () => {
  if (objects.length) {
    await adminClient.storage.from(SOCIAL_POST_MEDIA_BUCKET).remove(objects);
  }
  if (postIds.length) {
    await adminClient.from("content_opportunities").delete().in("id", postIds);
  }
  await gear?.cleanup();
  if (eventId) await deleteEvent(eventId);
});

async function storyPost() {
  const { data, error } = await adminClient
    .from("content_opportunities")
    .insert({
      title: `#1909 story ${crypto.randomUUID().slice(0, 8)}`,
      content_status: "draft",
      post_format: "instagram_story",
      featured_inventory_item_id: gear.itemIds[0],
      lead_time_days: 21,
    })
    .select("id")
    .single();
  if (error) throw error;
  postIds.push(data.id);
  return data.id as string;
}

async function upload(postId: string, type = "image/png") {
  const path = `${tenantId}/${postId}/${crypto.randomUUID()}.${type === "image/png" ? "png" : "jpg"}`;
  objects.push(path);
  const { error } = await adminClient.storage
    .from(SOCIAL_POST_MEDIA_BUCKET)
    .upload(path, new Blob([new Uint8Array(8)], { type }), {
      contentType: type,
    });
  if (error) throw error;
  return path;
}

async function frames(postId: string) {
  return [await upload(postId), await upload(postId), await upload(postId)];
}

async function media(postId: string) {
  const { data } = await adminClient
    .from("social_post_media")
    .select("storage_path, position, generated_frame, original_filename")
    .eq("content_opportunity_id", postId)
    .order("position");
  return data ?? [];
}

describe("replace_social_post_story_images (#1909)", () => {
  test("puts the frames first, then replaces only them", async () => {
    const post = await storyPost();
    const handPath = await upload(post, "image/jpeg");
    const { error: recordError } = await adminClient.rpc(
      "record_social_post_media",
      { p_path: handPath, p_original_filename: "mine.jpg" },
    );
    expect(recordError).toBeNull();

    const first = await frames(post);
    const { data: none, error } = await adminClient.rpc(
      "replace_social_post_story_images",
      { p_post_id: post, p_paths: first, p_fingerprint: "a" },
    );
    expect(error).toBeNull();
    expect(none).toEqual([]);
    expect(await media(post)).toEqual([
      {
        storage_path: first[0],
        position: 0,
        generated_frame: 1,
        original_filename: "gear-spotlight-1.png",
      },
      {
        storage_path: first[1],
        position: 1,
        generated_frame: 2,
        original_filename: "gear-spotlight-2.png",
      },
      {
        storage_path: first[2],
        position: 2,
        generated_frame: 3,
        original_filename: "gear-spotlight-3.png",
      },
      {
        storage_path: handPath,
        position: 3,
        generated_frame: null,
        original_filename: "mine.jpg",
      },
    ]);

    const second = await frames(post);
    const { data: replaced } = await adminClient.rpc(
      "replace_social_post_story_images",
      { p_post_id: post, p_paths: second, p_fingerprint: "b" },
    );
    expect([...(replaced ?? [])].sort()).toEqual([...first].sort());
    expect((await media(post)).map((row) => row.storage_path)).toEqual([
      ...second,
      handPath,
    ]);
  });

  test("refuses a published post", async () => {
    const post = await storyPost();
    await adminClient
      .from("content_opportunities")
      .update({ content_status: "published" })
      .eq("id", post);
    const { error } = await adminClient.rpc(
      "replace_social_post_story_images",
      { p_post_id: post, p_paths: await frames(post), p_fingerprint: "a" },
    );
    expect(error?.message).toBe("POST_PUBLISHED");
  });

  test("refuses a reel", async () => {
    const post = await storyPost();
    await adminClient
      .from("content_opportunities")
      .update({ post_format: "instagram_reel" })
      .eq("id", post);
    const { error } = await adminClient.rpc(
      "replace_social_post_story_images",
      { p_post_id: post, p_paths: await frames(post), p_fingerprint: "a" },
    );
    expect(error?.message).toBe("NOT_GEAR_STORY");
  });

  test("takes an event template's one image on a 4:5 post (#1926)", async () => {
    const { data, error: insertError } = await adminClient
      .from("content_opportunities")
      .insert({
        title: `#1926 post ${crypto.randomUUID().slice(0, 8)}`,
        content_status: "draft",
        post_format: "instagram_post",
        event_id: eventId,
        template_key: "event_reminder",
        lead_time_days: 21,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    postIds.push(data.id);
    const path = await upload(data.id);
    const { error } = await adminClient.rpc(
      "replace_social_post_story_images",
      { p_post_id: data.id, p_paths: [path], p_fingerprint: "a" },
    );
    expect(error).toBeNull();
    expect(await media(data.id)).toEqual([
      {
        storage_path: path,
        position: 0,
        generated_frame: 1,
        original_filename: "event-reminder-1.png",
      },
    ]);
  });

  test("refuses more than three images", async () => {
    const post = await storyPost();
    const { error } = await adminClient.rpc(
      "replace_social_post_story_images",
      {
        p_post_id: post,
        p_paths: [...(await frames(post)), await upload(post)],
        p_fingerprint: "a",
      },
    );
    expect(error?.message).toBe("INVALID_FRAMES");
  });

  test("refuses frames stored under another post", async () => {
    const post = await storyPost();
    const other = await storyPost();
    const { error } = await adminClient.rpc(
      "replace_social_post_story_images",
      { p_post_id: post, p_paths: await frames(other), p_fingerprint: "a" },
    );
    expect(error?.message).toBe("PERMISSION_DENIED");
    expect(await media(post)).toEqual([]);
  });
});
