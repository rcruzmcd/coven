// Integration test: recurring social posts (#1839) against a real local
// Supabase stack -- making a series from a post (anchor, template, tags),
// one post per series date, changing the cadence, pause/resume/end,
// auto-approve, copying a post into the template, and the content_calendar
// resource (admin manage, finance view, noAccess nothing). Requires
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

const { createContentPieceAction, deleteContentPieceAction } =
  await import("./piece-actions");
const {
  createSeriesFromPostAction,
  setSeriesAutoApproveAction,
  setSeriesStateAction,
  updateSeriesScheduleAction,
  updateSeriesTemplateFromPostAction,
} = await import("./series-actions");
const { getOrgTimeZone } = await import("@/lib/org-timezone");
const { anchorFromPublishAt } = await import("./series");

const createdPostIds: string[] = [];
const createdSeriesIds: string[] = [];

afterAll(async () => {
  currentSupabase = adminClient;
  for (const id of createdPostIds) await deleteContentPieceAction(id);
  if (createdSeriesIds.length > 0) {
    await adminClient
      .from("social_post_series")
      .delete()
      .in("id", createdSeriesIds);
  }
});

const PUBLISH_AT = "2027-03-09T15:00:00.000Z";

async function createPost(fields: Record<string, string> = {}) {
  currentSupabase = adminClient;
  const fd = new FormData();
  const title = `#1839 post ${crypto.randomUUID().slice(0, 8)}`;
  fd.set("title", title);
  fd.set("contentStatus", "draft");
  fd.set("leadTimeDays", "14");
  fd.set("publishDueAt", PUBLISH_AT);
  fd.set("content", "Caption");
  fd.set("tags", JSON.stringify([{ handle: "someone" }]));
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  const result = await createContentPieceAction(fd);
  expect(result).toMatchObject({ success: true });
  const { data } = await adminClient
    .from("content_opportunities")
    .select("id")
    .eq("title", title)
    .single();
  createdPostIds.push(data!.id);
  return data!.id as string;
}

async function seriesOf(postId: string) {
  const { data } = await adminClient
    .from("content_opportunities")
    .select(
      "series_id, occurrence_date, series:social_post_series!content_opportunities_series_id_fkey(*)",
    )
    .eq("id", postId)
    .single();
  const row = data as unknown as {
    series_id: string | null;
    occurrence_date: string | null;
    series: Record<string, unknown> | null;
  };
  if (row.series_id) createdSeriesIds.push(row.series_id);
  return row;
}

describe("making a post repeat", () => {
  test("anchors on the publish date in the org's zone and copies the post", async () => {
    const postId = await createPost();
    expect(
      await createSeriesFromPostAction(postId, "biweekly", "2027-06-01"),
    ).toEqual({ success: true });

    const zone = await getOrgTimeZone(adminClient);
    const anchor = anchorFromPublishAt(PUBLISH_AT, zone);
    const row = await seriesOf(postId);
    expect(row.occurrence_date).toBe(anchor.anchor_date);
    expect(row.series).toMatchObject({
      cadence: "biweekly",
      anchor_date: anchor.anchor_date,
      publish_time: `${anchor.publish_time}:00`,
      time_zone: zone,
      ends_on: "2027-06-01",
      lead_time_days: 14,
      auto_approve: false,
      content: "Caption",
      tags: [{ handle: "someone" }],
    });
  });

  test("refuses a post with no publish date, or one already repeating", async () => {
    const undated = await createPost({ publishDueAt: "" });
    expect(await createSeriesFromPostAction(undated, "weekly", null)).toEqual({
      error: "Set a publish date before making this post repeat.",
    });

    const postId = await createPost();
    await createSeriesFromPostAction(postId, "weekly", null);
    await seriesOf(postId);
    expect(await createSeriesFromPostAction(postId, "monthly", null)).toEqual({
      error: "This post already repeats.",
    });
  });

  test("refuses an end date before the first post, and an unknown cadence", async () => {
    const postId = await createPost();
    expect(
      await createSeriesFromPostAction(postId, "weekly", "2027-01-01"),
    ).toEqual({ error: "The end date can't be before the first post." });
    expect(await createSeriesFromPostAction(postId, "daily", null)).toEqual({
      error: "Choose how often it repeats.",
    });
  });

  test("allows one post per series date", async () => {
    const postId = await createPost();
    await createSeriesFromPostAction(postId, "weekly", null);
    const { series_id, occurrence_date } = await seriesOf(postId);

    const { error } = await adminClient.from("content_opportunities").insert({
      title: "#1839 duplicate occurrence",
      content_status: "draft",
      series_id,
      occurrence_date,
    });
    expect(error?.code).toBe("23505");
  });
});

describe("changing a series", () => {
  test("cadence, auto-approve, pause, resume and end", async () => {
    const postId = await createPost();
    await createSeriesFromPostAction(postId, "weekly", null);
    const { series_id } = await seriesOf(postId);
    const id = series_id!;

    expect(await updateSeriesScheduleAction(id, "monthly", null)).toEqual({
      success: true,
    });
    expect(await setSeriesAutoApproveAction(id, true)).toEqual({
      success: true,
    });
    expect(await setSeriesStateAction(id, "pause")).toEqual({ success: true });
    let { series } = await seriesOf(postId);
    expect(series).toMatchObject({ cadence: "monthly", auto_approve: true });
    expect(series!.paused_at).not.toBeNull();

    expect(await setSeriesStateAction(id, "resume")).toEqual({
      success: true,
    });
    expect(await setSeriesStateAction(id, "end")).toEqual({ success: true });
    ({ series } = await seriesOf(postId));
    expect(series!.paused_at).toBeNull();
    expect(series!.ended_at).not.toBeNull();

    // Ended is final.
    expect(await setSeriesStateAction(id, "resume")).toEqual({
      error: "This series has ended and can't be changed.",
    });
  });

  test("copies a post into the template", async () => {
    const postId = await createPost();
    await createSeriesFromPostAction(postId, "weekly", null);
    await seriesOf(postId);

    await adminClient
      .from("content_opportunities")
      .update({ content: "New caption" })
      .eq("id", postId);
    expect(await updateSeriesTemplateFromPostAction(postId)).toEqual({
      success: true,
    });
    const { series } = await seriesOf(postId);
    expect(series!.content).toBe("New caption");
  });

  test("deleting a series keeps its posts", async () => {
    const postId = await createPost();
    await createSeriesFromPostAction(postId, "weekly", null);
    const { series_id } = await seriesOf(postId);
    await adminClient.from("social_post_series").delete().eq("id", series_id!);
    expect((await seriesOf(postId)).series_id).toBeNull();
  });
});

describe("access", () => {
  test("a viewer reads a series but can't change it; no access sees nothing", async () => {
    const postId = await createPost();
    await createSeriesFromPostAction(postId, "weekly", null);
    const { series_id } = await seriesOf(postId);

    const finance = await signInAs(SEEDED_USERS.finance);
    const { data: seen } = await finance
      .from("social_post_series")
      .select("id")
      .eq("id", series_id!);
    expect(seen).toHaveLength(1);

    currentSupabase = finance;
    expect(await setSeriesAutoApproveAction(series_id!, true)).toHaveProperty(
      "error",
    );
    const other = await createPost();
    currentSupabase = finance;
    expect(
      await createSeriesFromPostAction(other, "weekly", null),
    ).toHaveProperty("error");

    const noAccess = await signInAs(SEEDED_USERS.noAccess);
    const { data: hidden } = await noAccess
      .from("social_post_series")
      .select("id")
      .eq("id", series_id!);
    expect(hidden).toEqual([]);
  });
});
