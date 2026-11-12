"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";
import {
  EVENT_MEDIA_BUCKET,
  EVENT_MEDIA_SIGNED_URL_TTL_SECONDS,
  eventMediaPath,
  planEventMediaFile,
  type EventMediaKind,
  type EventMediaSlot,
} from "@/lib/storage/event-media-files";
import { MAX_POST_MEDIA, SOCIAL_POST_MEDIA_BUCKET } from "./pieces";

/**
 * A social post's tags and media (#1826): read when the post sheet opens,
 * media written one file at a time as it uploads. The post's own columns --
 * format, caption, collaborators -- and its tag list are saved with the form
 * in `./piece-actions`.
 */

/** Someone a post can tag, or already tags. */
export type SocialPostTagPerson = {
  id: string;
  name: string | null;
  preferred_name: string | null;
  instagram_handle: string | null;
  declined_photo_consent: boolean;
};

/** One saved tag, in order. */
export type SocialPostTag = { personId: string } | { handle: string };

export type SocialPostMedia = {
  id: string;
  kind: EventMediaKind;
  original_filename: string;
  /** Short-lived; null when it could not be signed. */
  url: string | null;
  /**
   * The event photo or video this item references rather than holds (#1827);
   * null for an upload, or for a reference whose event media was deleted.
   */
  event_media_id: string | null;
  /** It referenced event media that has since been deleted. */
  missing: boolean;
};

export type SocialPostExtras = {
  tags: SocialPostTag[];
  people: SocialPostTagPerson[];
  media: SocialPostMedia[];
};

function revalidateSocial() {
  revalidatePath("/portal/social", "layout");
}

/**
 * Everything the post sheet shows beyond the post's own row: its tags, the
 * people it can tag (with whether they declined photo consent, for
 * `eventId` first), and its media with signed URLs. `postId` is null for a
 * post not yet saved, which has no tags or media.
 */
export async function getSocialPostExtrasAction(
  postId: string | null,
  eventId: string | null,
): Promise<SocialPostExtras> {
  const empty: SocialPostExtras = { tags: [], people: [], media: [] };
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "view",
  );
  if (permissionError) return empty;

  const [tagsResult, mediaResult] = postId
    ? await Promise.all([
        supabase
          .from("social_post_tags")
          .select("person_id, handle")
          .eq("content_opportunity_id", postId)
          .order("position", { ascending: true }),
        supabase
          .from("social_post_media")
          .select("id, kind, original_filename, storage_path, event_media_id")
          .eq("content_opportunity_id", postId)
          .order("position", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];

  const tags = (tagsResult.data ?? []).flatMap((row): SocialPostTag[] =>
    row.person_id
      ? [{ personId: row.person_id }]
      : row.handle
        ? [{ handle: row.handle }]
        : [],
  );

  const { data: people, error: peopleError } = await supabase.rpc(
    "social_post_tag_people",
    {
      p_event_id: eventId ?? undefined,
      p_person_ids: tags.flatMap((tag) =>
        "personId" in tag ? [tag.personId] : [],
      ),
    },
  );
  if (peopleError) {
    console.error("Could not list the people a post can tag", peopleError);
  }

  const rows = mediaResult.data ?? [];
  const urls = await signUploads(
    supabase,
    rows.flatMap((row) => (row.storage_path ? [row.storage_path] : [])),
  );
  const eventUrls = await signEventMedia(
    supabase,
    rows.flatMap((row) => (row.event_media_id ? [row.event_media_id] : [])),
  );

  return {
    tags,
    people: (people ?? []).map((person) => ({
      id: person.person_id,
      name: person.name,
      preferred_name: person.preferred_name,
      instagram_handle: person.instagram_handle,
      declined_photo_consent: person.declined_photo_consent === true,
    })),
    media: rows.map((row) => ({
      id: row.id,
      kind: row.kind as EventMediaKind,
      original_filename: row.original_filename,
      url: row.storage_path
        ? (urls.get(row.storage_path) ?? null)
        : row.event_media_id
          ? (eventUrls.get(row.event_media_id) ?? null)
          : null,
      event_media_id: row.event_media_id,
      missing: !row.storage_path && !row.event_media_id,
    })),
  };
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function signUploads(supabase: Supabase, paths: string[]) {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await supabase.storage
    .from(SOCIAL_POST_MEDIA_BUCKET)
    .createSignedUrls(paths, EVENT_MEDIA_SIGNED_URL_TTL_SECONDS);
  if (error) console.error("Could not sign social post media URLs", error);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/**
 * Signed URLs for referenced event media, by event media id: a photo's
 * 2048px thumbnail where it has one, as the event's Media card shows. Read and
 * signed with the reader's own session, so someone without events access gets
 * no rows and no URLs -- the item still shows, by name.
 */
async function signEventMedia(supabase: Supabase, ids: string[]) {
  const byId = new Map<string, string>();
  if (ids.length === 0) return byId;
  const { data: rows } = await supabase
    .from("event_media")
    .select("id, storage_path, thumb_path")
    .in("id", ids);
  const pathById = new Map(
    (rows ?? []).map((row) => [row.id, row.thumb_path ?? row.storage_path]),
  );
  if (pathById.size === 0) return byId;
  const { data, error } = await supabase.storage
    .from(EVENT_MEDIA_BUCKET)
    .createSignedUrls(
      [...pathById.values()],
      EVENT_MEDIA_SIGNED_URL_TTL_SECONDS,
    );
  if (error) console.error("Could not sign referenced event media", error);
  const urlByPath = new Map(
    (data ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : [],
    ),
  );
  for (const [id, path] of pathById) {
    const url = urlByPath.get(path);
    if (url) byId.set(id, url);
  }
  return byId;
}

async function signedInManager(message: string) {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, message);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;
  return { supabase };
}

/**
 * Signed upload slots for a saved post's media. The storage insert policy
 * checks the post again, and `record_social_post_media()` the ten-file limit.
 */
export async function createSocialPostMediaSlotsAction(
  postId: string,
  files: { name: string; type: string; size: number }[],
): Promise<{ slots: EventMediaSlot[] } | { error: string }> {
  const context = await signedInManager(
    "You must be signed in to upload photos and videos.",
  );
  if ("error" in context) return context;
  const { supabase } = context;

  // A Server Action's arguments are whatever the caller sent.
  if (!Array.isArray(files) || files.length === 0) return { slots: [] };

  const [{ data: tenantId }, { count }] = await Promise.all([
    supabase.rpc("current_tenant_id"),
    supabase
      .from("social_post_media")
      .select("id", { count: "exact", head: true })
      .eq("content_opportunity_id", postId),
  ]);
  if (!tenantId) {
    return { error: "You don't have permission to upload to this post." };
  }
  const room = MAX_POST_MEDIA - (count ?? 0);
  if (files.length > room) {
    return {
      error:
        room <= 0
          ? `This post already has ${MAX_POST_MEDIA} files, the most it can hold.`
          : `This post has room for ${room} more ${room === 1 ? "file" : "files"}.`,
    };
  }

  const slots: EventMediaSlot[] = [];
  for (const file of files) {
    const plan = planEventMediaFile({
      name: String(file?.name ?? ""),
      type: String(file?.type ?? ""),
      size: Number(file?.size ?? 0),
    });
    if ("error" in plan) return plan;
    // Every photo goes up as a JPEG, never the WebP event media keeps for a
    // PNG's transparency: the file is headed for Instagram, which has no
    // transparency to keep and does not reliably take WebP.
    const contentType =
      plan.kind === "photo" ? ("image/jpeg" as const) : plan.contentType;
    const extension = plan.kind === "photo" ? "jpg" : plan.extension;
    const path = eventMediaPath(tenantId, postId, extension);
    const { data, error } = await supabase.storage
      .from(SOCIAL_POST_MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error("Could not mint a social post upload slot", error);
      return { error: "Uploads aren't available right now. Please try again." };
    }
    slots.push({
      path,
      token: data.token,
      kind: plan.kind,
      contentType,
      bucket: SOCIAL_POST_MEDIA_BUCKET,
    });
  }
  return { slots };
}

export async function recordSocialPostMediaAction(
  path: string,
  originalFilename: string,
): Promise<{ ok: true } | { error: string }> {
  const context = await signedInManager(
    "You must be signed in to upload photos and videos.",
  );
  if ("error" in context) return context;

  const { error } = await context.supabase.rpc("record_social_post_media", {
    p_path: String(path),
    p_original_filename: String(originalFilename),
  });
  if (error) {
    console.error("Could not record the social post upload", error);
    return {
      error:
        error.message === "TOO_MANY_MEDIA"
          ? `A post holds up to ${MAX_POST_MEDIA} photos or videos.`
          : error.message === "MEDIA_NOT_FOUND"
            ? "The upload didn't arrive. Try again."
            : "The file uploaded but couldn't be added to the post. Try again.",
    };
  }
  revalidateSocial();
  return { ok: true };
}

/**
 * Adds event photos and videos to a post by reference (#1827), in the order
 * given: the post shows the event's file rather than a copy. Each must be
 * media of the event the post is related to; ones already on the post are
 * skipped.
 */
export async function addSocialPostEventMediaAction(
  postId: string,
  mediaIds: string[],
): Promise<{ added: number } | { error: string }> {
  const context = await signedInManager(
    "You must be signed in to add photos and videos.",
  );
  if ("error" in context) return context;
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) return { added: 0 };

  const { data, error } = await context.supabase.rpc(
    "add_social_post_event_media",
    { p_post_id: String(postId), p_media_ids: mediaIds.map(String) },
  );
  if (error) {
    console.error("Could not add event media to the post", error);
    const messages: Record<string, string> = {
      PERMISSION_DENIED:
        "You need access to this event's media to add it to a post.",
      POST_HAS_NO_EVENT:
        "This post isn't related to an event. Save the event first.",
      MEDIA_NOT_IN_EVENT:
        "Some of those files aren't this event's anymore. Reopen the picker and try again.",
      TOO_MANY_MEDIA: `A post holds up to ${MAX_POST_MEDIA} photos or videos.`,
    };
    return {
      error:
        messages[error.message] ??
        "Could not add the files to the post. Please try again.",
    };
  }
  revalidateSocial();
  return { added: Number(data ?? 0) };
}

/**
 * Removes one file: its row, then its object. A reference to event media
 * removes only the reference.
 */
export async function deleteSocialPostMediaAction(
  mediaId: string,
): Promise<{ success: true } | { error: string }> {
  const context = await signedInManager(
    "You must be signed in to remove a file.",
  );
  if ("error" in context) return context;
  const { supabase } = context;

  const { data: deleted, error } = await supabase
    .from("social_post_media")
    .delete()
    .eq("id", mediaId)
    .select("storage_path");
  if (error || !deleted || deleted.length === 0) {
    return { error: "Could not remove the file. Please try again." };
  }

  // A reference to event media (#1827) has no object of its own: the event
  // keeps its file.
  const paths = deleted.flatMap((row) =>
    row.storage_path ? [row.storage_path] : [],
  );
  if (paths.length === 0) {
    revalidateSocial();
    return { success: true };
  }
  const { error: storageError } = await supabase.storage
    .from(SOCIAL_POST_MEDIA_BUCKET)
    .remove(paths);
  if (storageError) {
    // The row is gone, so nothing shows it; the object is only orphaned.
    console.error("Could not remove the social post object", storageError);
  }
  revalidateSocial();
  return { success: true };
}

/** Sets the carousel order; `mediaIds` must name every file the post holds. */
export async function reorderSocialPostMediaAction(
  postId: string,
  mediaIds: string[],
): Promise<{ success: true } | { error: string }> {
  const context = await signedInManager(
    "You must be signed in to reorder files.",
  );
  if ("error" in context) return context;

  const { error } = await context.supabase.rpc("reorder_social_post_media", {
    p_post_id: postId,
    p_media_ids: mediaIds,
  });
  if (error) {
    return {
      error:
        error.message === "MEDIA_LIST_CHANGED"
          ? "The files changed while you were reordering. Reopen the post and try again."
          : "Could not reorder the files. Please try again.",
    };
  }
  revalidateSocial();
  return { success: true };
}
