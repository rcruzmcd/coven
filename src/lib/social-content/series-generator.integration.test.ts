// Integration test: the recurring social post generator (#1840) against a
// real local Supabase stack -- one post per period when run twice for weekly,
// every-2-weeks and monthly series, auto-approve, the template and tags,
// missed dates, paused and ended series, and tenant isolation. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`.
//
// The dates are in 2030 and `now` is passed in, so nothing here depends on
// today. Only this file's series are generated: the job's loader runs over
// every series, and the generator is given just the ones made here.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { serviceRoleClient } from "../../../test/integration-setup";
import {
  generateSeriesPosts,
  loadActiveSeries,
  type GeneratorSeries,
} from "./series-generator";

const service = serviceRoleClient() as unknown as SupabaseClient<Database>;

let homeTenantId: string;
let foreignTenantId: string;
const seriesIds: string[] = [];

// 2030-03-05 is a Tuesday; 09:00 in Denver is 16:00Z (before DST).
const ANCHOR = "2030-03-05";
const T0 = new Date("2030-02-26T00:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

beforeAll(async () => {
  const { data: home, error: homeError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (homeError) throw homeError;
  homeTenantId = home.id;

  const { data, error } = await service
    .from("tenants")
    .insert({
      name: "Integration Test Series Org",
      slug: `it-series-${crypto.randomUUID().slice(0, 8)}`,
      plan: "white_label",
    })
    .select("id")
    .single();
  if (error) throw error;
  foreignTenantId = data.id;
});

afterAll(async () => {
  if (seriesIds.length > 0) {
    await service
      .from("content_opportunities")
      .delete()
      .in("series_id", seriesIds);
    await service.from("social_post_series").delete().in("id", seriesIds);
  }
  if (foreignTenantId) {
    await service
      .from("retention_policies")
      .delete()
      .eq("tenant_id", foreignTenantId);
    await service.from("tenants").delete().eq("id", foreignTenantId);
  }
});

type SeriesInsert =
  Database["public"]["Tables"]["social_post_series"]["Insert"];

async function createSeries(fields: Partial<SeriesInsert> = {}) {
  const { data, error } = await service
    .from("social_post_series")
    .insert({
      tenant_id: homeTenantId,
      cadence: "weekly",
      anchor_date: ANCHOR,
      publish_time: "09:00",
      time_zone: "America/Denver",
      lead_time_days: 14,
      title: `#1840 series ${crypto.randomUUID().slice(0, 8)}`,
      content: "Caption",
      collaborator_handles: ["partner"],
      tags: [{ handle: "someone" }, { person_id: crypto.randomUUID() }],
      ...fields,
    })
    .select("id")
    .single();
  if (error) throw error;
  seriesIds.push(data.id);
  return data.id;
}

/** Runs the generator at `now` over this file's active series only. */
async function run(now: Date, ids: string[] = seriesIds) {
  const active = await loadActiveSeries(service);
  const mine: GeneratorSeries[] = active.filter((s) => ids.includes(s.id));
  return generateSeriesPosts(service, mine, now);
}

async function postsOf(seriesId: string) {
  const { data, error } = await service
    .from("content_opportunities")
    .select(
      "id, tenant_id, title, content, collaborator_handles, content_status, status_changed_by, created_by, occurrence_date, publish_due_at, review_due_at, draft_due_at",
    )
    .eq("series_id", seriesId)
    .order("occurrence_date");
  if (error) throw error;
  return data;
}

describe("social post series generator (#1840)", () => {
  test("weekly, every-2-weeks and monthly create exactly one post per period, run twice", async () => {
    const weekly = await createSeries({ cadence: "weekly" });
    const biweekly = await createSeries({ cadence: "biweekly" });
    const monthly = await createSeries({ cadence: "monthly" });
    const ids = [weekly, biweekly, monthly];
    const dates = async (id: string) =>
      (await postsOf(id)).map((p) => p.occurrence_date);

    for (const now of [T0, T0, days(7), days(7), days(14), days(14)]) {
      await run(now, ids);
    }

    expect(await dates(weekly)).toEqual([
      "2030-03-05",
      "2030-03-12",
      "2030-03-19",
    ]);
    expect(await dates(biweekly)).toEqual(["2030-03-05", "2030-03-19"]);
    expect(await dates(monthly)).toEqual(["2030-03-05"]);
  });

  test("each post copies the template and its dates, and starts as draft", async () => {
    const id = await createSeries();
    const result = await run(T0, [id]);
    expect(result.created).toBe(1);

    const [post] = await postsOf(id);
    expect(post).toMatchObject({
      tenant_id: homeTenantId,
      content: "Caption",
      collaborator_handles: ["partner"],
      content_status: "draft",
      status_changed_by: null,
      created_by: null,
      publish_due_at: "2030-03-05T16:00:00+00:00",
      review_due_at: "2030-02-28T16:00:00+00:00",
      draft_due_at: "2030-02-24T16:00:00+00:00",
    });

    // The deleted person's tag is dropped, not the post.
    const { data: tags } = await service
      .from("social_post_tags")
      .select("handle, person_id, position")
      .eq("content_opportunity_id", post.id);
    expect(tags).toEqual([{ handle: "someone", person_id: null, position: 0 }]);
  });

  test("auto-approve creates approved posts, attributed to the system", async () => {
    const id = await createSeries({ auto_approve: true });
    await run(T0, [id]);
    const [post] = await postsOf(id);
    expect(post.content_status).toBe("approved");

    const { data: audit } = await service
      .from("audit_log")
      .select("action, actor_id, new_data")
      .eq("table_name", "content_opportunities")
      .eq("record_id", post.id);
    expect(audit).toHaveLength(1);
    expect(audit![0]).toMatchObject({ action: "insert", actor_id: null });
    expect(audit![0].new_data).toMatchObject({
      series_id: id,
      content_status: "approved",
    });
  });

  test("dates already past are recorded as missed, not created", async () => {
    const id = await createSeries();
    await run(days(15), [id]); // 2030-03-13: 03-05 and 03-12 have passed.

    expect((await postsOf(id)).map((p) => p.occurrence_date)).toEqual([
      "2030-03-19",
      "2030-03-26",
    ]);
    const { data } = await service
      .from("social_post_series")
      .select("generated_through, missed_occurrences")
      .eq("id", id)
      .single();
    expect(data).toEqual({
      generated_through: "2030-03-26",
      missed_occurrences: ["2030-03-05", "2030-03-12"],
    });
  });

  test("paused and ended series create nothing", async () => {
    const paused = await createSeries({ paused_at: T0.toISOString() });
    const ended = await createSeries({ ended_at: T0.toISOString() });

    const loaded = (await loadActiveSeries(service)).map((s) => s.id);
    expect(loaded).not.toContain(paused);
    expect(loaded).not.toContain(ended);

    // A series paused after the cron read it: the function re-checks.
    const { data: created, error } = await service.rpc(
      "generate_social_post_series_posts",
      {
        p_series_id: paused,
        p_posts: [
          {
            occurrence_date: ANCHOR,
            publish_due_at: "2030-03-05T16:00:00Z",
            review_due_at: "2030-02-28T16:00:00Z",
            draft_due_at: "2030-02-24T16:00:00Z",
          },
        ],
        p_missed: [],
        p_through: ANCHOR,
      },
    );
    expect(error).toBeNull();
    expect(created).toEqual([]);
    expect(await postsOf(paused)).toEqual([]);
    expect(await postsOf(ended)).toEqual([]);
  });

  test("each series' posts land in its own tenant", async () => {
    const home = await createSeries();
    const foreign = await createSeries({ tenant_id: foreignTenantId });
    await run(T0, [home, foreign]);

    expect((await postsOf(home)).map((p) => p.tenant_id)).toEqual([
      homeTenantId,
    ]);
    expect((await postsOf(foreign)).map((p) => p.tenant_id)).toEqual([
      foreignTenantId,
    ]);
  });

  test("a suspended tenant's series is not loaded", async () => {
    const id = await createSeries({ tenant_id: foreignTenantId });
    await service
      .from("tenants")
      .update({ status: "suspended" })
      .eq("id", foreignTenantId);
    try {
      const loaded = (await loadActiveSeries(service)).map((s) => s.id);
      expect(loaded).not.toContain(id);
    } finally {
      await service
        .from("tenants")
        .update({ status: "active" })
        .eq("id", foreignTenantId);
    }
  });

  test("signed-in users cannot call the generator function", async () => {
    const { adminClient } = await import("../../../test/integration-setup");
    const { error } = await adminClient.rpc(
      "generate_social_post_series_posts",
      {
        p_series_id: seriesIds[0],
        p_posts: [],
        p_missed: [],
        p_through: ANCHOR,
      },
    );
    expect(error).not.toBeNull();
  });
});
