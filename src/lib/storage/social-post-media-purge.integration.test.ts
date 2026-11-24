// Integration coverage for the social-post-media orphan sweep (#1922), against
// a real local Supabase stack: real objects under a real post's folder, real
// `social_post_media` rows, and the Storage API's own `created_at`.
//
// Objects can't be backdated through the Storage API, so the run that should
// delete passes a negative `olderThanHours`, which puts the cutoff in the
// future and makes everything count as old. That also sweeps any other
// unrecorded object in the local bucket, which is what the sweep is for.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { serviceRoleClient } from "../../../test/integration-setup";
import { SOCIAL_POST_MEDIA_BUCKET } from "@/lib/social-content/pieces";

// social-post-media-purge.ts imports "server-only", which throws outside a
// real Next.js server build.
mock.module("server-only", () => ({}));

const { runSocialPostMediaPurge } = await import("./social-post-media-purge");

const service = serviceRoleClient();

/** Everything old: the cutoff is an hour from now. */
const EVERYTHING_OLD = { olderThanHours: -1 };

let tenantId: string;
let postId: string;
const paths: Record<"recorded" | "orphan", string> = {} as never;

async function upload(): Promise<string> {
  const path = `${tenantId}/${postId}/${crypto.randomUUID()}.png`;
  const { error } = await service.storage
    .from(SOCIAL_POST_MEDIA_BUCKET)
    .upload(path, new Blob([new Uint8Array(8)], { type: "image/png" }), {
      contentType: "image/png",
    });
  if (error) throw error;
  return path;
}

async function objectExists(path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await service.storage
    .from(SOCIAL_POST_MEDIA_BUCKET)
    .list(folder, { search: name });
  if (error) throw error;
  return (data ?? []).some((object) => object.name === name);
}

beforeAll(async () => {
  const { data: tenant, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  tenantId = tenant.id as string;

  const { data: post, error: postError } = await service
    .from("content_opportunities")
    .insert({
      tenant_id: tenantId,
      title: `#1922 purge ${crypto.randomUUID().slice(0, 8)}`,
      content_status: "draft",
      post_format: "instagram_post",
    })
    .select("id")
    .single();
  if (postError) throw postError;
  postId = post.id as string;

  paths.recorded = await upload();
  paths.orphan = await upload();
  const { error: mediaError } = await service.from("social_post_media").insert({
    tenant_id: tenantId,
    content_opportunity_id: postId,
    storage_path: paths.recorded,
    original_filename: "purge-test.png",
    content_type: "image/png",
    size_bytes: 8,
    position: 0,
  });
  if (mediaError) throw mediaError;
});

afterAll(async () => {
  await service.storage
    .from(SOCIAL_POST_MEDIA_BUCKET)
    .remove(Object.values(paths));
  if (postId) {
    await service.from("content_opportunities").delete().eq("id", postId);
  }
});

describe("runSocialPostMediaPurge", () => {
  test("leaves a new unrecorded object alone", async () => {
    await runSocialPostMediaPurge(service);
    expect(await objectExists(paths.orphan)).toBe(true);
  });

  test("deletes an old unrecorded object and keeps a recorded one", async () => {
    const summary = await runSocialPostMediaPurge(service, EVERYTHING_OLD);

    expect(summary.deleted).toBeGreaterThanOrEqual(1);
    expect(await objectExists(paths.orphan)).toBe(false);
    expect(await objectExists(paths.recorded)).toBe(true);
  });

  // A post deleted outside its delete action: the rows cascade, the object
  // stays until the sweep.
  test("deletes the objects of a post whose rows cascaded away", async () => {
    await service.from("content_opportunities").delete().eq("id", postId);
    await runSocialPostMediaPurge(service, EVERYTHING_OLD);
    expect(await objectExists(paths.recorded)).toBe(false);
  });
});
