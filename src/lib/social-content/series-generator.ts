import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { activeTenantIds } from "@/lib/notifications/active-tenants";
import { leadTimeSchedule } from "./pieces";
import {
  addDaysToDay,
  occurrencePublishAt,
  occurrencesFrom,
  type SeriesCadence,
  type SeriesSchedule,
} from "./series";

/**
 * The scheduled generator for recurring social posts (#1840). Run daily by
 * /api/cron/social-post-series on the service-role client.
 *
 * A series' date is due once `publish time - lead_time_days <= now`. Each run
 * deals with the dates after `generated_through` (or from the anchor) up to
 * the last due one: a date whose publish time is still ahead becomes a post,
 * one whose publish time has passed (a missed run, or a pause) is recorded on
 * the series instead. The write is generate_social_post_series_posts(), which
 * skips a date that already has a post, so a re-run creates nothing twice.
 */

const LOG_PREFIX = "[social-post-series]";
const DAY_MS = 86_400_000;
/** Dates one run deals with per series; the rest wait for the next run. */
const MAX_DATES_PER_RUN = 400;
const PAGE_SIZE = 500;

export type GeneratorSeries = SeriesSchedule & {
  id: string;
  lead_time_days: number;
  generated_through: string | null;
};

const GENERATOR_COLUMNS =
  "id, cadence, anchor_date, publish_time, time_zone, ends_on, lead_time_days, generated_through";

export type PlannedPost = {
  occurrence_date: string;
  publish_due_at: string;
  review_due_at: string;
  draft_due_at: string;
};

export type SeriesRunPlan = {
  posts: PlannedPost[];
  /** Due dates whose publish time had already passed. */
  missed: string[];
  /** The last date dealt with, or null when nothing is due yet. */
  through: string | null;
};

/** What one run of `series` should create and record at `now`. Pure. */
export function planSeriesRun(
  series: GeneratorSeries,
  now: Date,
): SeriesRunPlan {
  const plan: SeriesRunPlan = { posts: [], missed: [], through: null };
  const leadMs = series.lead_time_days * DAY_MS;
  let from = series.generated_through
    ? addDaysToDay(series.generated_through, 1)
    : series.anchor_date;
  let dealt = 0;

  while (dealt < MAX_DATES_PER_RUN) {
    const batch = occurrencesFrom(series, from, 20);
    if (batch.length === 0) return plan;
    for (const day of batch) {
      const publishDueAt = occurrencePublishAt(series, day);
      const publishMs = Date.parse(publishDueAt);
      if (publishMs - leadMs > now.getTime()) return plan;
      if (dealt >= MAX_DATES_PER_RUN) return plan;

      dealt += 1;
      plan.through = day;
      if (publishMs <= now.getTime()) {
        plan.missed.push(day);
      } else {
        const { draftDueAt, reviewDueAt } = leadTimeSchedule(
          new Date(publishDueAt),
          series.lead_time_days,
        );
        plan.posts.push({
          occurrence_date: day,
          publish_due_at: publishDueAt,
          review_due_at: reviewDueAt.toISOString(),
          draft_due_at: draftDueAt.toISOString(),
        });
      }
    }
    from = addDaysToDay(batch[batch.length - 1], 1);
  }
  return plan;
}

/**
 * Every series the generator should run: not paused, not ended, in an active
 * tenant (a suspended tenant is meant to stop acting).
 */
export async function loadActiveSeries(
  admin: SupabaseClient<Database>,
): Promise<GeneratorSeries[]> {
  const tenants = await activeTenantIds(admin, LOG_PREFIX);
  if (tenants.size === 0) return [];

  const rows: GeneratorSeries[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("social_post_series")
      .select(GENERATOR_COLUMNS)
      .is("paused_at", null)
      .is("ended_at", null)
      .in("tenant_id", [...tenants])
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      rows.push({ ...row, cadence: row.cadence as SeriesCadence });
    }
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export type GeneratorResult = {
  series: number;
  created: number;
  failed: number;
};

/**
 * Creates each series' due posts. One series failing is logged and counted,
 * and the rest still run.
 */
export async function generateSeriesPosts(
  admin: SupabaseClient<Database>,
  series: GeneratorSeries[],
  now: Date,
): Promise<GeneratorResult> {
  const result: GeneratorResult = {
    series: series.length,
    created: 0,
    failed: 0,
  };
  for (const row of series) {
    const plan = planSeriesRun(row, now);
    if (!plan.through) continue;
    const { data, error } = await admin.rpc(
      "generate_social_post_series_posts",
      {
        p_series_id: row.id,
        p_posts: plan.posts,
        p_missed: plan.missed,
        p_through: plan.through,
      },
    );
    if (error) {
      console.error(`${LOG_PREFIX} series ${row.id} failed`, error);
      result.failed += 1;
      continue;
    }
    result.created += data ?? 0;
  }
  return result;
}

export async function runSocialPostSeriesGenerator(
  admin: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<GeneratorResult> {
  return generateSeriesPosts(admin, await loadActiveSeries(admin), now);
}
