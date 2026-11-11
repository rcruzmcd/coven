// Integration test: a social post's content parts (#1826) against a real
// local Supabase stack -- format and collaborators on the row, tags through
// set_social_post_tags(), media through the social-post-media bucket and
// record_social_post_media(), all under the content_calendar resource
// (admin manage, finance view, noAccess nothing). Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`.
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  signInAs,
} from "../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createContentPieceAction,
  updateContentPieceAction,
  deleteContentPieceAction,
} = await import("./piece-actions");
const { SOCIAL_POST_MEDIA_BUCKET } = await import("./pieces");
const {
  createSocialPostMediaSlotsAction,
  deleteSocialPostMediaAction,
  getSocialPostExtrasAction,
  recordSocialPostMediaAction,
  reorderSocialPostMediaAction,
} = await import("./post-content-actions");

const createdPostIds: string[] = [];
const createdPersonIds: string[] = [];

afterAll(async () => {
  for (const id of createdPostIds) {
    currentSupabase = adminClient;
    await deleteContentPieceAction(id);
  }
  if (createdPersonIds.length > 0) {
    await adminClient.from("people").delete().in("id", createdPersonIds);
  }
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("title", `#1826 post ${crypto.randomUUID().slice(0, 8)}`);
  fd.set("contentStatus", "idea");
  fd.set("leadTimeDays", "21");
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function createPost(fields: Record<string, string> = {}) {
  currentSupabase = adminClient;
  const fd = form(fields);
  expect(await createContentPieceAction(fd)).toEqual({ success: true });
  const { data } = await adminClient
    .from("content_opportunities")
    .select("id, post_format, collaborator_handles, content")
    .eq("title", String(fd.get("title")))
    .single();
  createdPostIds.push(data!.id);
  return data!;
}

async function createPerson(handle: string) {
  const { data, error } = await adminClient
    .from("people")
    .insert({
      name: `Tag ${handle}`,
      instagram_handle: handle,
      source_type: "individual",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  createdPersonIds.push(data!.id);
  return data!.id as string;
}

/** A 1x1 PNG, a real image the bucket accepts. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  ),
  (char) => char.charCodeAt(0),
);

async function uploadPhoto(postId: string, name = "photo.png") {
  const minted = await createSocialPostMediaSlotsAction(postId, [
    { name, type: "image/png", size: PNG.byteLength },
  ]);
  if ("error" in minted) throw new Error(minted.error);
  const [slot] = minted.slots;
  expect(slot.bucket).toBe(SOCIAL_POST_MEDIA_BUCKET);
  const { error } = await currentSupabase.storage
    .from(SOCIAL_POST_MEDIA_BUCKET)
    .uploadToSignedUrl(
      slot.path,
      slot.token,
      new Blob([PNG], { type: "image/png" }),
    );
  expect(error).toBeNull();
  return { slot, record: await recordSocialPostMediaAction(slot.path, name) };
}

describe("social post content (integration)", () => {
  test("saves format, caption and collaborators on the post", async () => {
    const post = await createPost({
      postFormat: "instagram_post",
      content: "Caption",
      collaborators: JSON.stringify(["@Chatter.Snow", "rider_1"]),
    });
    expect(post.post_format).toBe("instagram_post");
    expect(post.content).toBe("Caption");
    expect(post.collaborator_handles).toEqual(["chatter.snow", "rider_1"]);

    // A story drops them, and the database would refuse them anyway.
    currentSupabase = adminClient;
    expect(
      await updateContentPieceAction(
        post.id,
        form({
          postFormat: "instagram_story",
          collaborators: JSON.stringify(["rider_1"]),
        }),
      ),
    ).toEqual({ success: true });
    const { data } = await adminClient
      .from("content_opportunities")
      .select("collaborator_handles")
      .eq("id", post.id)
      .single();
    expect(data!.collaborator_handles).toEqual([]);
    const { error } = await adminClient
      .from("content_opportunities")
      .update({ collaborator_handles: ["rider_1"] })
      .eq("id", post.id);
    expect(error).not.toBeNull();
  });

  test("replaces tags in order, and reads a person's handle from their record", async () => {
    const handle = `t${crypto.randomUUID().slice(0, 8)}`;
    const personId = await createPerson(handle);
    const post = await createPost({
      tags: JSON.stringify([{ handle: "someone" }, { personId }]),
    });

    currentSupabase = adminClient;
    let extras = await getSocialPostExtrasAction(post.id, null);
    expect(extras.tags).toEqual([{ handle: "someone" }, { personId }]);
    expect(
      extras.people.find((person) => person.id === personId),
    ).toMatchObject({
      instagram_handle: handle,
      declined_photo_consent: false,
    });

    await updateContentPieceAction(
      post.id,
      form({ tags: JSON.stringify([{ personId }]) }),
    );
    extras = await getSocialPostExtrasAction(post.id, null);
    expect(extras.tags).toEqual([{ personId }]);

    // Deleting the person removes the tag rather than keeping their handle.
    await adminClient.from("people").delete().eq("id", personId);
    extras = await getSocialPostExtrasAction(post.id, null);
    expect(extras.tags).toEqual([]);
  });

  test("a viewer reads tags and media but cannot write them", async () => {
    const post = await createPost({ tags: JSON.stringify([{ handle: "a" }]) });
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const extras = await getSocialPostExtrasAction(post.id, null);
    expect(extras.tags).toEqual([{ handle: "a" }]);

    const { error } = await currentSupabase.rpc("set_social_post_tags", {
      p_post_id: post.id,
      p_tags: [],
    });
    expect(error).not.toBeNull();
    expect(
      await createSocialPostMediaSlotsAction(post.id, [
        { name: "x.png", type: "image/png", size: 10 },
      ]),
    ).toMatchObject({ error: expect.any(String) });
  });

  test("no access reads nothing", async () => {
    const post = await createPost({ tags: JSON.stringify([{ handle: "a" }]) });
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    expect(await getSocialPostExtrasAction(post.id, null)).toEqual({
      tags: [],
      people: [],
      media: [],
    });
  });

  test("uploads, orders, reorders and removes media; deleting the post removes the objects", async () => {
    const post = await createPost();
    currentSupabase = adminClient;

    const first = await uploadPhoto(post.id, "first.png");
    const second = await uploadPhoto(post.id, "second.png");
    expect(first.record).toEqual({ ok: true });
    expect(second.record).toEqual({ ok: true });
    // Recording the same path twice is a no-op.
    expect(
      await recordSocialPostMediaAction(first.slot.path, "first.png"),
    ).toEqual({ ok: true });

    let extras = await getSocialPostExtrasAction(post.id, null);
    expect(extras.media.map((item) => item.original_filename)).toEqual([
      "first.png",
      "second.png",
    ]);
    expect(extras.media.every((item) => item.url)).toBe(true);

    expect(
      await reorderSocialPostMediaAction(
        post.id,
        extras.media.map((item) => item.id).reverse(),
      ),
    ).toEqual({ success: true });
    // Naming only some of the files is refused.
    expect(
      await reorderSocialPostMediaAction(post.id, [extras.media[0].id]),
    ).toMatchObject({ error: expect.any(String) });
    extras = await getSocialPostExtrasAction(post.id, null);
    expect(extras.media.map((item) => item.original_filename)).toEqual([
      "second.png",
      "first.png",
    ]);

    expect(await deleteSocialPostMediaAction(extras.media[0].id)).toEqual({
      success: true,
    });
    const { data: gone } = await adminClient.storage
      .from(SOCIAL_POST_MEDIA_BUCKET)
      .list(second.slot.path.split("/").slice(0, 2).join("/"));
    expect(gone?.map((object) => object.name)).toEqual([
      first.slot.path.split("/")[2],
    ]);

    expect(await deleteContentPieceAction(post.id)).toEqual({ success: true });
    const { data: none } = await adminClient.storage
      .from(SOCIAL_POST_MEDIA_BUCKET)
      .list(first.slot.path.split("/").slice(0, 2).join("/"));
    expect(none ?? []).toEqual([]);
  });

  test("a post holds at most ten files", async () => {
    const post = await createPost();
    currentSupabase = adminClient;
    expect(
      await createSocialPostMediaSlotsAction(
        post.id,
        Array.from({ length: 11 }, (_, index) => ({
          name: `${index}.png`,
          type: "image/png",
          size: 10,
        })),
      ),
    ).toEqual({ error: "This post has room for 10 more files." });
  });
});
