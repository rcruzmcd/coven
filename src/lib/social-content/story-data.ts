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
import { parseImageCrop, type ImageCrop } from "@/lib/image-crop";
import {
  eventPostFingerprint,
  eventPostFrames,
  eventPostSource,
  loadEventTemplateRecord,
  type EventPostSource,
} from "./event-post-data";
import {
  GEAR_SPOTLIGHT,
  NO_PHOTO,
  POST_TEMPLATES,
  isEventTemplateKey,
  templateFormat,
  POST_TEMPLATES_OFF_SETTING_KEY,
  gearPostDetails,
  normalizeTemplateText,
  parsePostTemplatesOff,
  parseTemplateText,
  type PostTemplateKey,
  type TemplateText,
} from "./post-templates";
import { gearPhotoSource } from "./series-gear-fill";
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
export type GearStorySource = {
  /** The template the post is drawn with (#1924); not hashed, as no frame changes with it alone. */
  templateKey: typeof GEAR_SPOTLIGHT.key;
  input: Omit<StoryInput, "frame" | "headingTracking" | "photo" | "photoCrop">;
  photoSource: string | null;
  /** The photo's stored crop (#1925); hashed only when there is one. */
  photoCrop: ImageCrop | null;
  /** The item has a photo, whether or not the post shows it. */
  itemHasPhoto: boolean;
  typography: StoryTypography;
};

/** What any template's frames are drawn from: Gear Spotlight's, or an event's (#1926). */
export type StorySource = GearStorySource | EventPostSource;

export function isEventSource(source: StorySource): source is EventPostSource {
  return isEventTemplateKey(source.templateKey);
}

export type StorySourceLoad =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  /** Preview text over a field's cap (#1925). */
  | { status: "invalid"; error: string }
  | { status: "ok"; source: StorySource };

/**
 * What a preview draws in place of the post's saved template text (#1925):
 * every field as typed, so a field left out is blank. Never saved.
 */
export type StoryOverrides = { text: Record<string, unknown> };

export type StoryLoad =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "invalid"; error: string }
  | {
      status: "ok";
      input: Omit<StoryInput, "frame" | "headingTracking">;
      typography: StoryTypography;
    };

/** Gear photos are stored up to this size (series-gear-fill.ts). */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/**
 * A photo is up to 10 MB and a Drive thumbnail is a redirect away, so it gets
 * the time the post's own photo copy does rather than an icon's 3s.
 */
const PHOTO_TIMEOUT_MS = 10_000;

const COPY_KEYS = [
  "gears.spotlight_headline",
  "gears.spotlight_item_line",
  "gears.spotlight_steps",
];

export async function loadStorySource(
  supabase: Client,
  admin: Client,
  postId: string,
  overrides?: StoryOverrides,
): Promise<StorySourceLoad> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const { data: post } = await supabase
    .from("content_opportunities")
    .select(
      "id, tenant_id, event_id, post_format, featured_inventory_item_id, template_key, gear_brand, gear_best_for, gear_why, template_text, occurrence_date, series:social_post_series!content_opportunities_series_id_fkey(cadence, anchor_date)",
    )
    .eq("id", postId)
    .maybeSingle();
  // A malformed id is a cast error, which is a 404 like any other miss.
  if (!post) return { status: "not_found" };
  if (isEventTemplateKey(post.template_key)) {
    return loadEventStorySource(supabase, admin, post, overrides);
  }
  if (!post.featured_inventory_item_id) return { status: "not_found" };
  // Gear Spotlight is the only story template that reads an item so far.
  if (post.template_key !== GEAR_SPOTLIGHT.key) return { status: "not_found" };
  const tenantId = post.tenant_id;

  // A preview's text replaces the saved text whole; the old gear columns are
  // only a fallback for saved posts main wrote.
  let text: TemplateText;
  let details;
  if (overrides) {
    const normalized = normalizeTemplateText(
      GEAR_SPOTLIGHT,
      null,
      overrides.text,
    );
    if ("error" in normalized) {
      return { status: "invalid", error: normalized.error };
    }
    text = normalized.text;
    details = gearPostDetails({ template_text: text });
  } else {
    text = parseTemplateText(post.template_text);
    details = gearPostDetails(post);
  }

  const { data: item } = await admin
    .from("inventory_items")
    .select(
      "description, size, condition, category_id, photo_url, status, intended_use",
    )
    .eq("id", post.featured_inventory_item_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!item) return { status: "not_found" };

  const [category, groups, tenant, lexicon, copyRows, branding, off] =
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
      loadPostTemplatesOff(admin, tenantId),
    ]);
  // Switched off for the tenant (#1925): nothing is drawn with it.
  if (off.includes(GEAR_SPOTLIGHT.key)) return { status: "not_found" };

  // The photo is the item's unless the post chose none (#1925).
  const shown =
    item.photo_url && text.photo !== NO_PHOTO ? item.photo_url : null;

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
      templateKey: GEAR_SPOTLIGHT.key,
      typography: resolvedTypography(branding),
      photoSource: shown ? gearPhotoSource(shown) : null,
      photoCrop: shown ? parseImageCrop(shown).crop : null,
      itemHasPhoto: Boolean(item.photo_url),
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
        details,
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

/**
 * An event template's source (#1926): the post's event, its flyer and public
 * photos, and the words typed -- or, for a preview, the words as typed now.
 */
async function loadEventStorySource(
  supabase: Client,
  admin: Client,
  post: {
    tenant_id: string;
    event_id: string | null;
    post_format: string | null;
    template_key: string | null;
    template_text: Database["public"]["Tables"]["content_opportunities"]["Row"]["template_text"];
  },
  overrides?: StoryOverrides,
): Promise<StorySourceLoad> {
  if (!isEventTemplateKey(post.template_key) || !post.event_id) {
    return { status: "not_found" };
  }
  const template = POST_TEMPLATES[post.template_key];
  const format = templateFormat(post.post_format);
  if (!format || !(template.formats as readonly string[]).includes(format)) {
    return { status: "not_found" };
  }
  const [loaded, branding, off] = await Promise.all([
    loadEventTemplateRecord(admin, post.tenant_id, post.event_id, template.key),
    getTenantBranding(supabase),
    loadPostTemplatesOff(admin, post.tenant_id),
  ]);
  if (!loaded || off.includes(template.key)) return { status: "not_found" };

  let text: TemplateText;
  if (overrides) {
    const normalized = normalizeTemplateText(
      template,
      loaded.record,
      overrides.text,
    );
    if ("error" in normalized) {
      return { status: "invalid", error: normalized.error };
    }
    text = normalized.text;
  } else {
    text = parseTemplateText(post.template_text);
  }
  return {
    status: "ok",
    source: eventPostSource({
      templateKey: template.key,
      format,
      loaded,
      text,
      branding,
      now: new Date(),
    }),
  };
}

/**
 * The frames a post's template draws for it: Gear Spotlight's three, an
 * event template's one, or a recap post's one per photo (#1927).
 */
export function sourceFrames(source: StorySource): readonly number[] {
  if (isEventSource(source)) return eventPostFrames(source);
  return POST_TEMPLATES[source.templateKey].frames;
}

/** A stable hash of everything a frame is drawn from (#1909). */
export function storyFingerprint(source: StorySource): string {
  if (isEventSource(source)) return eventPostFingerprint(source);
  return createHash("sha256")
    .update(
      JSON.stringify({
        input: source.input,
        photo: source.photoSource,
        typography: source.typography,
        // Left out without one, so a story drawn before crops were read
        // (#1925) isn't "Out of date" for nothing.
        ...(source.photoCrop ? { crop: source.photoCrop } : {}),
      }),
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * One frame's input with its images fetched and inlined: the photo on the
 * frames that show it (1 and 2), the logo on every frame.
 */
export async function inlineStoryImages(
  source: GearStorySource,
  frame: StoryFrameNumber,
  requestUrl: string,
): Promise<Omit<StoryInput, "frame" | "headingTracking">> {
  const [photo, logo] = await Promise.all([
    loadRemoteIcon(frame === 3 ? null : source.photoSource, requestUrl, {
      maxBytes: MAX_PHOTO_BYTES,
      timeoutMs: PHOTO_TIMEOUT_MS,
    }),
    loadRemoteIcon(source.input.branding.logoUrl, requestUrl),
  ]);
  return {
    ...source.input,
    photo,
    photoCrop: source.photoCrop,
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
  if (isEventSource(load.source)) return { status: "not_found" };
  return {
    status: "ok",
    typography: load.source.typography,
    input: await inlineStoryImages(load.source, frame, requestUrl),
  };
}

/**
 * The templates a tenant has switched off (#1925). Read with the service
 * role, filtered by tenant: app_settings is readable only with a manage
 * permission, and someone who may only view a post still sees it drawn.
 */
export async function loadPostTemplatesOff(
  admin: Client,
  tenantId: string,
): Promise<PostTemplateKey[]> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", POST_TEMPLATES_OFF_SETTING_KEY)
    .maybeSingle();
  return parsePostTemplatesOff(data?.value);
}
