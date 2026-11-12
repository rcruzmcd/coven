// Integration test: a recurring series that features a random Gear Library
// item (#1841) against a real local Supabase stack -- only available gear with
// a photo is picked, recent repeats are avoided (and allowed once every item
// was featured), a date with nothing to pick is skipped and noted, the caption
// is filled in, and swapping refuses a published post or an ineligible item.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`.
//
// The seed has no gear with a photo, so the items this file gives photos to
// are the only candidates, and each test removes its own before the next.
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  adminClient,
  createAvailableGearItems,
  serviceRoleClient,
  signInAs,
  SEEDED_USERS,
} from "../../../test/integration-setup";
import { generateSeriesPosts, loadActiveSeries } from "./series-generator";

const service = serviceRoleClient() as unknown as SupabaseClient<Database>;
const admin = adminClient as unknown as SupabaseClient<Database>;

const seriesIds: string[] = [];
let cleanups: (() => Promise<void>)[] = [];

// 2030-03-05 is a Tuesday; 09:00 in Denver is 16:00Z.
const ANCHOR = "2030-03-05";
const T0 = new Date("2030-02-26T00:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);
// No network in a test: a photo that can't be fetched leaves the post
// without one, which is the path the generator must survive anyway.
const PHOTO = "https://photos.invalid/gear.jpg";

afterEach(async () => {
  if (seriesIds.length > 0) {
    await service
      .from("content_opportunities")
      .delete()
      .in("series_id", seriesIds);
  }
  for (const cleanup of cleanups) await cleanup();
  cleanups = [];
});

afterAll(async () => {
  if (seriesIds.length > 0) {
    await service.from("social_post_series").delete().in("id", seriesIds);
  }
});

async function gear(count: number, fields: Record<string, unknown> = {}) {
  const { itemIds, cleanup } = await createAvailableGearItems(count);
  cleanups.push(async () => {
    await service
      .from("content_opportunities")
      .update({ featured_inventory_item_id: null })
      .in("featured_inventory_item_id", itemIds);
    await cleanup();
  });
  const { error } = await service
    .from("inventory_items")
    .update({ photo_url: PHOTO, ...fields })
    .in("id", itemIds);
  if (error) throw error;
  return itemIds;
}

async function createSeries(recent = 8) {
  const { data: tenantId } = await admin.rpc("current_tenant_id");
  const { data, error } = await service
    .from("social_post_series")
    .insert({
      tenant_id: tenantId!,
      cadence: "weekly",
      anchor_date: ANCHOR,
      publish_time: "09:00",
      time_zone: "America/Denver",
      lead_time_days: 14,
      title: `#1841 series ${crypto.randomUUID().slice(0, 8)}`,
      content: "Gear of the week!",
      content_source: "random_gear_item",
      recent_exclusion_count: recent,
    })
    .select("id")
    .single();
  if (error) throw error;
  seriesIds.push(data.id);
  return data.id;
}

async function run(seriesId: string, now: Date) {
  const series = (await loadActiveSeries(service)).filter(
    (s) => s.id === seriesId,
  );
  return generateSeriesPosts(service, series, now);
}

async function postsOf(seriesId: string) {
  const { data, error } = await service
    .from("content_opportunities")
    .select("id, occurrence_date, content, featured_inventory_item_id")
    .eq("series_id", seriesId)
    .order("occurrence_date");
  if (error) throw error;
  return data;
}

describe("random Gear Library item series (#1841)", () => {
  test("picks only available gear-library items with a photo and fills the caption", async () => {
    const [eligible] = await gear(1);
    await gear(1, { photo_url: null });
    await gear(1, { status: "distributed" });
    await gear(1, { intended_use: "giveaway" });
    const series = await createSeries();

    const result = await run(series, T0);
    expect(result.created).toBe(1);
    const [post] = await postsOf(series);
    expect(post.featured_inventory_item_id).toBe(eligible);
    expect(post.content).toStartWith(
      "Gear of the week!\n\nIntegration test item",
    );
    expect(post.content).toContain(`/inventory?item=${eligible}`);
  });

  test("avoids items featured in the last N posts, then allows the oldest", async () => {
    const items = await gear(2);
    const series = await createSeries(8);

    // One date per run: 03-05, then 03-12, then 03-19.
    for (const now of [T0, days(7), days(14)]) await run(series, now);
    const picks = (await postsOf(series)).map(
      (p) => p.featured_inventory_item_id,
    );
    expect(picks).toHaveLength(3);
    expect(new Set(picks.slice(0, 2))).toEqual(new Set(items));
    // Both were featured recently: the one featured longest ago comes back.
    expect(picks[2]).toBe(picks[0]);
  });

  test("with nothing to pick, the date is skipped and noted on the series", async () => {
    const series = await createSeries();
    const result = await run(series, T0);
    expect(result.created).toBe(0);
    expect(await postsOf(series)).toEqual([]);

    const { data } = await service
      .from("social_post_series")
      .select("no_gear_occurrences, generated_through")
      .eq("id", series)
      .single();
    expect(data?.no_gear_occurrences).toEqual([ANCHOR]);
    expect(data?.generated_through).toBe(ANCHOR);
  });

  test("swapping keeps the status, refuses ineligible items and published posts", async () => {
    const [first, second] = await gear(2);
    const [unavailable] = await gear(1, { status: "distributed" });
    const series = await createSeries();
    await service
      .from("social_post_series")
      .update({ auto_approve: true })
      .eq("id", series);
    await run(series, T0);
    const [post] = await postsOf(series);

    const { data: picked, error } = await admin.rpc(
      "set_social_post_featured_gear",
      { p_post_id: post.id },
    );
    expect(error).toBeNull();
    expect(picked).toBe(
      post.featured_inventory_item_id === first ? second : first,
    );

    const { error: chooseError } = await admin.rpc(
      "set_social_post_featured_gear",
      { p_post_id: post.id, p_item_id: first },
    );
    expect(chooseError).toBeNull();
    const { data: after } = await service
      .from("content_opportunities")
      .select("content_status, featured_inventory_item_id")
      .eq("id", post.id)
      .single();
    expect(after).toEqual({
      content_status: "approved",
      featured_inventory_item_id: first,
    });

    const { error: ineligible } = await admin.rpc(
      "set_social_post_featured_gear",
      { p_post_id: post.id, p_item_id: unavailable },
    );
    expect(ineligible?.message).toContain("ITEM_NOT_ELIGIBLE");

    await service
      .from("content_opportunities")
      .update({ content_status: "published" })
      .eq("id", post.id);
    const { error: published } = await admin.rpc(
      "set_social_post_featured_gear",
      { p_post_id: post.id },
    );
    expect(published?.message).toContain("POST_PUBLISHED");
  });

  test("swapping needs content_calendar manage", async () => {
    await gear(1);
    const series = await createSeries();
    await run(series, T0);
    const [post] = await postsOf(series);

    const finance = await signInAs(SEEDED_USERS.finance);
    const { error } = await finance.rpc("set_social_post_featured_gear", {
      p_post_id: post.id,
    });
    expect(error?.message).toContain("PERMISSION_DENIED");
  });
});
