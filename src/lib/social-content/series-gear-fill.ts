import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveTenantOrigin } from "@/lib/email/identity";
import { eventMediaPath } from "@/lib/storage/event-media-files";
import {
  GEAR_PHOTOS_BUCKET,
  gearPhotoPathFromUrl,
} from "@/lib/storage/gear-photos";
import { SOCIAL_POST_MEDIA_BUCKET } from "./pieces";
import {
  gearCaptionEdited,
  gearCaptionToTemplate,
  gearItemLink,
  type FeaturedGear,
} from "./series-gear";

type Client = SupabaseClient<Database>;

/** An item a post can feature, as social_post_gear_items() returns it. */
export type GearItemOption = FeaturedGear & {
  photo_url: string | null;
  status: string;
  qualifies: boolean;
  featured: boolean;
};

/**
 * Filling a gear post in (#1841): the item link for a tenant, and the copy of
 * the item's photo in the post's own media, so later edits to the item don't
 * change the post. Used by the generator (service role) and the swap action
 * (the signed-in manager's client).
 */

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** The public origin of a tenant's site: its domain, or the platform's. */
export async function tenantSiteOrigin(
  client: SupabaseClient<Database>,
  tenantId: string,
): Promise<string> {
  const { data } = await client
    .from("tenants")
    .select("custom_domain")
    .eq("id", tenantId)
    .maybeSingle();
  return resolveTenantOrigin(
    data?.custom_domain ?? null,
    process.env.NEXT_PUBLIC_SITE_URL ?? "",
  );
}

/**
 * Where to read an item photo from. A gear-photos object is read from this
 * project's own storage, whatever origin the stored URL names; anything else
 * (an older external link) only over https.
 */
export function gearPhotoSource(photoUrl: string): string | null {
  const objectPath = gearPhotoPathFromUrl(photoUrl);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (objectPath && supabaseUrl) {
    return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${GEAR_PHOTOS_BUCKET}/${objectPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
  }
  try {
    const url = new URL(photoUrl);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

type Photo = { body: ArrayBuffer; contentType: string; extension: string };

async function fetchGearPhoto(photoUrl: string): Promise<Photo | null> {
  const source = gearPhotoSource(photoUrl);
  if (!source) return null;
  try {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extension = PHOTO_TYPES[contentType];
    if (!extension) return null;
    if (Number(response.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES)
      return null;
    const body = await response.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_PHOTO_BYTES) return null;
    return { body, contentType, extension };
  } catch (error) {
    console.error("Could not read the gear photo", error);
    return null;
  }
}

export type CopiedPhoto = {
  path: string;
  contentType: string;
  size: number;
  filename: string;
};

/**
 * Copies an item's photo into `social-post-media` under the post. Null when
 * the photo can't be read or stored; the post keeps its item either way.
 */
export async function copyGearPhotoToPost(
  client: SupabaseClient<Database>,
  tenantId: string,
  postId: string,
  item: Pick<FeaturedGear, "description"> & { photo_url: string | null },
): Promise<CopiedPhoto | null> {
  if (!item.photo_url) return null;
  const photo = await fetchGearPhoto(item.photo_url);
  if (!photo) return null;

  const path = eventMediaPath(tenantId, postId, photo.extension);
  const { error } = await client.storage
    .from(SOCIAL_POST_MEDIA_BUCKET)
    .upload(path, photo.body, {
      contentType: photo.contentType,
      upsert: false,
    });
  if (error) {
    console.error("Could not store the gear photo on the post", error);
    return null;
  }
  const base =
    item.description
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "gear";
  return {
    path,
    contentType: photo.contentType,
    size: photo.body.byteLength,
    filename: `${base}.${photo.extension}`,
  };
}

/** The items a post can feature, and the one it features now; null on error. */
export async function loadGearItems(
  supabase: Client,
  postId: string,
): Promise<GearItemOption[] | null> {
  const { data, error } = await supabase.rpc("social_post_gear_items", {
    p_post_id: postId,
  });
  if (error) {
    console.error("Could not list the post's gear items", error);
    return null;
  }
  return data ?? [];
}

/**
 * The series caption a gear post's caption stands for, for "Use this post
 * for future posts": its item taken back out. Null when the post features
 * nothing, so the caption is used as it is.
 */
export async function gearTemplateFromPost(
  supabase: Client,
  postId: string,
): Promise<string | null> {
  const { data: post } = await supabase
    .from("content_opportunities")
    .select("tenant_id, content, featured_inventory_item_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post?.featured_inventory_item_id) return null;
  const items = await loadGearItems(supabase, postId);
  const item = items?.find((option) => option.featured);
  if (!item) return null;
  const origin = await tenantSiteOrigin(supabase, post.tenant_id);
  return gearCaptionToTemplate(
    post.content,
    item,
    gearItemLink(origin, item.id),
  );
}

export type PostFeaturedGear = {
  /** Every item the post could feature now. */
  options: GearItemOption[];
  /** The item it features, qualifying or not; null when none. */
  featured: GearItemOption | null;
  /** Whether its caption was changed after it was filled in. */
  captionEdited: boolean;
};

/** What the post page shows about a gear post's item (#1841). */
export async function loadPostFeaturedGear(
  supabase: Client,
  post: { id: string; content: string | null; series_id: string | null },
): Promise<PostFeaturedGear | null> {
  if (!post.series_id) return null;
  const [items, { data: series }] = await Promise.all([
    loadGearItems(supabase, post.id),
    supabase
      .from("social_post_series")
      .select("content")
      .eq("id", post.series_id)
      .maybeSingle(),
  ]);
  const template = series?.content ?? null;
  if (!items) return null;
  const featured = items.find((item) => item.featured) ?? null;
  let link: string | null = null;
  if (featured) {
    const { data: tenantId } = await supabase.rpc("current_tenant_id");
    link = tenantId
      ? gearItemLink(await tenantSiteOrigin(supabase, tenantId), featured.id)
      : null;
  }
  return {
    options: items.filter((item) => item.qualifies),
    featured,
    captionEdited: gearCaptionEdited(post.content, template, featured, link),
  };
}
