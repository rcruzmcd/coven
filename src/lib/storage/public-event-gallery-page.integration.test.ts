// Integration coverage for the public Gallery page's reads (#1655), against a
// real local Supabase stack: public_event_gallery() lists an event with public
// media for its own tenant only, with counts and thumbnail paths and nothing
// about who sent them; a video counts only once public; a private, draft or
// gallery-off event drops out; and only the service role may call either read.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";
import { EVENT_MEDIA_BUCKET, eventMediaPath } from "./event-media-files";

const GALLERY_KEY = "events.public_gallery_enabled";

const service = serviceRoleClient();
const anon = anonClient();

let admin: SupabaseClient;
let tenantId: string;
let event: Awaited<ReturnType<typeof createPublishedEvent>>;
let videoId: string;
const created: string[] = [];

async function record(ext: string, contentType: string): Promise<string> {
  const objectPath = eventMediaPath(tenantId, event.id, ext);
  created.push(objectPath);
  const { error: uploadError } = await admin.storage
    .from(EVENT_MEDIA_BUCKET)
    .upload(objectPath, new Blob([new Uint8Array(4)], { type: contentType }), {
      contentType,
    });
  if (uploadError) throw uploadError;
  const { data, error } = await admin.rpc("record_event_media", {
    p_path: objectPath,
    p_original_filename: `secret-name.${ext}`,
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

async function galleryRows(tenant = tenantId) {
  const { data, error } = await service.rpc("public_event_gallery", {
    p_tenant_id: tenant,
    p_limit: 50,
    p_offset: 0,
    p_thumbs: 6,
  });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

async function ourRow(tenant = tenantId) {
  return (await galleryRows(tenant)).find((row) => row.event_id === event.id);
}

async function hasMedia(tenant = tenantId) {
  const { data, error } = await service.rpc("public_event_gallery_has_media", {
    p_tenant_id: tenant,
  });
  if (error) throw error;
  return data;
}

async function resetGallerySetting() {
  await service
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", GALLERY_KEY);
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

  admin = await signInAs(SEEDED_USERS.admin);
  event = await createPublishedEvent();
  await resetGallerySetting();

  await record("jpg", "image/jpeg");
  await record("png", "image/png");
  videoId = await record("mp4", "video/mp4");
});

afterAll(async () => {
  await resetGallerySetting();
  if (created.length) {
    await service.storage.from(EVENT_MEDIA_BUCKET).remove(created);
  }
  if (event) {
    await service.from("event_media").delete().eq("event_id", event.id);
    await event.cleanup();
  }
});

describe("public_event_gallery", () => {
  test("is not callable by anon or a signed-in user", async () => {
    const args = {
      p_tenant_id: tenantId,
      p_limit: 1,
      p_offset: 0,
      p_thumbs: 1,
    };
    expect((await anon.rpc("public_event_gallery", args)).error).not.toBeNull();
    expect(
      (await admin.rpc("public_event_gallery", args)).error,
    ).not.toBeNull();
    const hasArgs = { p_tenant_id: tenantId };
    expect(
      (await anon.rpc("public_event_gallery_has_media", hasArgs)).error,
    ).not.toBeNull();
    expect(
      (await admin.rpc("public_event_gallery_has_media", hasArgs)).error,
    ).not.toBeNull();
  });

  test("lists the event with its public photos and nothing about who sent them", async () => {
    const row = await ourRow();
    expect(row).toBeDefined();
    expect(row!.photo_count).toBe(2);
    expect(row!.video_count).toBe(0);
    expect(row!.thumb_paths as string[]).toHaveLength(2);
    expect(row!.total_events as number).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(row)).not.toContain("secret-name");
    expect(await hasMedia()).toBe(true);
  });

  test("counts a video only once it is public", async () => {
    await admin.rpc("set_event_media_public", {
      p_ids: [videoId],
      p_public: true,
    });
    expect((await ourRow())!.video_count).toBe(1);
    await admin.rpc("set_event_media_public", {
      p_ids: [videoId],
      p_public: false,
    });
  });

  test("caps the thumbnails at the number asked for", async () => {
    const { data } = await service.rpc("public_event_gallery", {
      p_tenant_id: tenantId,
      p_limit: 50,
      p_offset: 0,
      p_thumbs: 1,
    });
    const row = ((data ?? []) as Record<string, unknown>[]).find(
      (r) => r.event_id === event.id,
    );
    expect(row!.thumb_paths).toHaveLength(1);
  });

  test("answers nothing for another tenant", async () => {
    const other = crypto.randomUUID();
    expect(await galleryRows(other)).toEqual([]);
    expect(await hasMedia(other)).toBe(false);
  });

  test("drops a private or draft event", async () => {
    await service
      .from("events")
      .update({ visibility: "private" })
      .eq("id", event.id);
    expect(await ourRow()).toBeUndefined();
    await service
      .from("events")
      .update({ visibility: "public", status: "draft" })
      .eq("id", event.id);
    expect(await ourRow()).toBeUndefined();
    await service
      .from("events")
      .update({ status: "published" })
      .eq("id", event.id);
    expect(await ourRow()).toBeDefined();
  });

  test("answers nothing while the gallery setting is off", async () => {
    const off = await admin.rpc("set_event_public_gallery_enabled", {
      p_enabled: false,
    });
    expect(off.error).toBeNull();
    expect(await galleryRows()).toEqual([]);
    expect(await hasMedia()).toBe(false);
    await resetGallerySetting();
    expect(await ourRow()).toBeDefined();
  });
});
