import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOCIAL_POST_MEDIA_BUCKET } from "@/lib/social-content/pieces";

/**
 * Sweeps social-post-media objects that no `social_post_media` row points at
 * (#1922).
 *
 * Every writer stores the object first and records it after, and every
 * removal deletes the row before the object, logging a failed `remove()`
 * rather than failing the action. So an object outlives its row when:
 *
 * - an upload to a signed slot is abandoned, or its record call fails;
 * - story-image generation (#1909) dies between uploading frames and
 *   `replace_social_post_story_images()` attaching them, a function timeout
 *   included, so `discard()` never runs;
 * - the replaced story frames, a removed file, a swapped gear photo (#1841)
 *   or a deleted post's files fail to remove;
 * - a post is deleted other than through its delete action: its
 *   `social_post_media` rows cascade, its objects do not.
 *
 * Same terms as the other sweeps on the daily cron: the Storage API rather
 * than SQL on `storage.objects`, the live set read before anything is listed,
 * a failure to read it throwing rather than reading as "nothing is
 * referenced", and nothing younger than a day touched -- a long reel is still
 * uploading against its slot, and story frames sit unattached until the
 * generation finishes.
 *
 * Paths are `{tenant}/{post}/{uuid}.{ext}` for uploads, story frames and
 * copied gear photos alike. A row referencing event media (#1827) has no
 * `storage_path` and nothing in this bucket.
 */

/** How long an object is left alone before it counts as abandoned. */
const DEFAULT_OLDER_THAN_HOURS = 24;

/** Storage caps a list page; delete calls are batched to the same size. */
const PAGE_SIZE = 100;

/** PostgREST's default row cap. */
const ROW_PAGE = 1000;

export type SocialPostMediaPurgeSummary = {
  /** Tenant prefixes examined. */
  tenants: number;
  /** Objects seen across every prefix. */
  scanned: number;
  /** Objects deleted. */
  deleted: number;
  /** Objects left because they are still referenced or not yet old enough. */
  kept: number;
};

type StorageObject = {
  name: string;
  id?: string | null;
  created_at?: string | null;
};

type FoundObject = { path: string; created_at?: string | null };

/**
 * Every object under `prefix`, walking down into folders: `.list()` returns
 * one level, and a folder comes back with a null `id`.
 */
async function listTree(
  supabase: SupabaseClient,
  prefix: string,
): Promise<FoundObject[]> {
  const found: FoundObject[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(SOCIAL_POST_MEDIA_BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`Could not list ${prefix}: ${error.message}`);

    const page = (data ?? []) as StorageObject[];
    for (const entry of page) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) found.push({ path, created_at: entry.created_at });
      else found.push(...(await listTree(supabase, path)));
    }
    if (page.length < PAGE_SIZE) return found;
  }
}

/**
 * Every recorded path, across every tenant, since this runs on the
 * service-role client. Throws rather than returning a partial set: a missing
 * page would read as "delete it".
 */
export async function liveSocialPostMediaPaths(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const paths = new Set<string>();
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await supabase
      .from("social_post_media")
      .select("id, storage_path")
      .not("storage_path", "is", null)
      .order("id")
      .range(from, from + ROW_PAGE - 1);
    if (error) {
      throw new Error(`Could not read social_post_media: ${error.message}`);
    }
    const page = (data ?? []) as { storage_path: string | null }[];
    for (const row of page) {
      if (row.storage_path) paths.add(row.storage_path);
    }
    if (page.length < ROW_PAGE) return paths;
  }
}

async function removeAll(
  supabase: SupabaseClient,
  paths: string[],
): Promise<number> {
  let removed = 0;
  for (let at = 0; at < paths.length; at += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(SOCIAL_POST_MEDIA_BUCKET)
      .remove(paths.slice(at, at + PAGE_SIZE));
    if (error) {
      throw new Error(`Could not remove social post media: ${error.message}`);
    }
    removed += (data ?? []).length;
  }
  return removed;
}

export async function runSocialPostMediaPurge(
  supabase: SupabaseClient,
  options: { olderThanHours?: number } = {},
): Promise<SocialPostMediaPurgeSummary> {
  const olderThanHours = options.olderThanHours ?? DEFAULT_OLDER_THAN_HOURS;
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

  // Read the live set first. If this throws, nothing has been deleted.
  const live = await liveSocialPostMediaPaths(supabase);

  const { data: tenantRows, error: tenantError } = await supabase
    .from("tenants")
    .select("id");
  if (tenantError) {
    throw new Error(`Could not read tenants: ${tenantError.message}`);
  }
  const tenants = (tenantRows ?? []) as { id: string }[];

  const summary: SocialPostMediaPurgeSummary = {
    tenants: tenants.length,
    scanned: 0,
    deleted: 0,
    kept: 0,
  };

  for (const tenant of tenants) {
    const objects = await listTree(supabase, tenant.id);
    summary.scanned += objects.length;

    const orphaned: string[] = [];
    for (const object of objects) {
      const createdAt = object.created_at
        ? Date.parse(object.created_at)
        : Number.NaN;
      const old = Number.isFinite(createdAt) && createdAt < cutoff;
      if (old && !live.has(object.path)) orphaned.push(object.path);
      else summary.kept += 1;
    }

    summary.deleted += await removeAll(supabase, orphaned);
  }

  return summary;
}
