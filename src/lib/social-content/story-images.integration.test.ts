// Integration test: replace_social_post_story_images() (#1909) against a real
// local Supabase stack -- the generated set goes first in frame order, a
// regenerate replaces only it (never media added by hand) and hands back the
// old objects, and a published post, a non-story or a path outside the post
// is refused. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createAvailableGearItems,
} from "../../../test/integration-setup";
import { SOCIAL_POST_MEDIA_BUCKET } from "./pieces";

let tenantId: string;
let gear: Awaited<ReturnType<typeof createAvailableGearItems>>;
const postIds: string[] = [];
const objects: string[] = [];

beforeAll(async () => {
  const { data } = await adminClient.rpc("current_tenant_id");
  tenantId = data as string;
  gear = await createAvailableGearItems(1);
});

afterAll(async () => {
  if (objects.length) {
    await adminClient.storage.from(SOCIAL_POST_MEDIA_BUCKET).remove(objects);
  }
  if (postIds.length) {
    await adminClient.from("content_opportunities").delete().in("id", postIds);
  }
  await gear?.cleanup();
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

  test("refuses a post that is not a story", async () => {
    const post = await storyPost();
    await adminClient
      .from("content_opportunities")
      .update({ post_format: "instagram_post" })
      .eq("id", post);
    const { error } = await adminClient.rpc(
      "replace_social_post_story_images",
      { p_post_id: post, p_paths: await frames(post), p_fingerprint: "a" },
    );
    expect(error?.message).toBe("NOT_GEAR_STORY");
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
