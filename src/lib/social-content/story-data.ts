import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRemoteIcon } from "@/app/api/app-icon/[size]/icon-source";
import { resolvedTypography } from "@/lib/branding";
import type { Database } from "@/lib/database.types";
import { resolveTenantOrigin } from "@/lib/email/identity";
import { categoryStop } from "@/lib/inventory-category-colors";
import { resolveSiteContent } from "@/lib/site-content";
import { getTenantBranding } from "@/lib/tenant-branding";
import { lexiconForTenant } from "@/lib/tenant-lexicon";
import { occurrenceNumber, isSeriesCadence } from "./series";
import { gearPhotoSource, gearPostDetails } from "./series-gear-fill";
import {
  displayHost,
  type StoryFrameNumber,
  type StoryInput,
} from "./story-frames";

type Client = SupabaseClient<Database>;

/**
 * Everything one Gear Spotlight frame is drawn from (#1908).
 *
 * Who may see it is decided by the signed-in user's own client: the post is
 * read through `content_opportunities`' RLS (content_calendar view, the post
 * page's check), so a post the user cannot open is a 404 here too. Only then
 * is the tenant's row data read with the service role -- the item, its
 * category, the published story copy and the tenant's host -- because
 * content_calendar may be granted without inventory or site_content, and the
 * post page already shows this item to the same user (`social_post_gear_items`
 * is a definer function for the same reason). Every service-role read is
 * filtered by the post's own tenant.
 */

type StoryTypography = ReturnType<typeof resolvedTypography>;

/**
 * What a post's story is drawn from, before any image is fetched: the logo is
 * still its URL and the photo its storage source. Hashed for the post page's
 * "out of date" check (#1909), so it changes exactly when a frame would.
 */
export type StorySource = {
  input: Omit<StoryInput, "frame" | "headingTracking" | "photo">;
  photoSource: string | null;
  typography: StoryTypography;
};

export type StorySourceLoad =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "ok"; source: StorySource };

export type StoryLoad =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      status: "ok";
      input: Omit<StoryInput, "frame" | "headingTracking">;
      typography: StoryTypography;
    };

/** Gear photos are stored up to this size (series-gear-fill.ts). */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const COPY_KEYS = [
  "gears.spotlight_headline",
  "gears.spotlight_item_line",
  "gears.spotlight_steps",
];

export async function loadStorySource(
  supabase: Client,
  admin: Client,
  postId: string,
): Promise<StorySourceLoad> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const { data: post } = await supabase
    .from("content_opportunities")
    .select(
      "id, tenant_id, featured_inventory_item_id, gear_brand, gear_best_for, gear_why, occurrence_date, series:social_post_series!content_opportunities_series_id_fkey(cadence, anchor_date)",
    )
    .eq("id", postId)
    .maybeSingle();
  // A malformed id is a cast error, which is a 404 like any other miss.
  if (!post?.featured_inventory_item_id) return { status: "not_found" };
  const tenantId = post.tenant_id;

  const { data: item } = await admin
    .from("inventory_items")
    .select(
      "description, size, condition, category_id, photo_url, status, intended_use",
    )
    .eq("id", post.featured_inventory_item_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!item) return { status: "not_found" };

  const [category, groups, tenant, lexicon, copyRows, branding] =
    await Promise.all([
      item.category_id
        ? admin
            .from("inventory_categories")
            .select("label, group_id, accent_stop")
            .eq("id", item.category_id)
            .eq("tenant_id", tenantId)
            .maybeSingle()
            .then(({ data }) => data)
        : null,
      admin
        .from("inventory_category_groups")
        .select("id, sort_order, accent_stop")
        .eq("tenant_id", tenantId)
        .then(({ data }) => data ?? []),
      admin
        .from("tenants")
        .select("name, custom_domain")
        .eq("id", tenantId)
        .maybeSingle()
        .then(({ data }) => data),
      lexiconForTenant(admin, tenantId),
      admin
        .from("site_content")
        .select("key, value")
        .eq("tenant_id", tenantId)
        .in("key", COPY_KEYS)
        .not("value", "is", null)
        .then(({ data }) => data ?? []),
      getTenantBranding(supabase),
    ]);

  const content = resolveSiteContent(copyRows, lexicon);

  const series = Array.isArray(post.series) ? post.series[0] : post.series;
  const number =
    series && post.occurrence_date && isSeriesCadence(series.cadence)
      ? occurrenceNumber(
          { cadence: series.cadence, anchor_date: series.anchor_date },
          post.occurrence_date,
        )
      : null;

  return {
    status: "ok",
    source: {
      typography: resolvedTypography(branding),
      photoSource: item.photo_url ? gearPhotoSource(item.photo_url) : null,
      input: {
        item: {
          description: item.description,
          size: item.size,
          condition: item.condition,
          category_label: category?.label ?? null,
          // public_gear_catalog's criteria.
          in_catalog:
            item.status === "available" && item.intended_use === "gear_library",
        },
        details: gearPostDetails(post),
        categoryStop: category ? categoryStop(category, groups) : null,
        series:
          series && number !== null && isSeriesCadence(series.cadence)
            ? { cadence: series.cadence, number }
            : null,
        branding,
        orgName: tenant?.name ?? "",
        host: displayHost(
          resolveTenantOrigin(
            tenant?.custom_domain ?? null,
            process.env.NEXT_PUBLIC_SITE_URL ?? "",
          ),
        ),
        copy: {
          headline: content.text("gears.spotlight_headline"),
          itemLine: content.text("gears.spotlight_item_line"),
          steps: content
            .list<{ text: string }>("gears.spotlight_steps")
            .map((step) => step.text),
          collection: lexicon.collection ?? "",
        },
      },
    },
  };
}

/** A stable hash of everything a frame is drawn from (#1909). */
export function storyFingerprint(source: StorySource): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        input: source.input,
        photo: source.photoSource,
        typography: source.typography,
      }),
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * One frame's input with its images fetched and inlined: the photo on frame 1
 * only, the logo on every frame.
 */
export async function inlineStoryImages(
  source: StorySource,
  frame: StoryFrameNumber,
  requestUrl: string,
): Promise<Omit<StoryInput, "frame" | "headingTracking">> {
  const [photo, logo] = await Promise.all([
    loadRemoteIcon(frame === 1 ? source.photoSource : null, requestUrl, {
      maxBytes: MAX_PHOTO_BYTES,
    }),
    loadRemoteIcon(source.input.branding.logoUrl, requestUrl),
  ]);
  return {
    ...source.input,
    photo,
    // Inlined, so a dead logo link drops the logo rather than the image.
    branding: { ...source.input.branding, logoUrl: logo },
  };
}

export async function loadStoryFrame(
  supabase: Client,
  admin: Client,
  postId: string,
  frame: StoryFrameNumber,
  requestUrl: string,
): Promise<StoryLoad> {
  const load = await loadStorySource(supabase, admin, postId);
  if (load.status !== "ok") return load;
  return {
    status: "ok",
    typography: load.source.typography,
    input: await inlineStoryImages(load.source, frame, requestUrl),
  };
}
