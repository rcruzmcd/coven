import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveImageUrl } from "@/lib/inventory";
import { parseImageCrop, type ImageCrop } from "@/lib/image-crop";
import {
  ITEM_PHOTO,
  NO_PHOTO,
  POST_TEMPLATES,
  gearPostDetails,
  parseTemplateText,
  postTemplate,
  templatesFor,
  type PostTemplateKey,
  type TemplateRecordKind,
} from "./post-templates";
import { loadPostTemplatesOff } from "./story-data";
import { loadStoryImagesState, type StoryImagesState } from "./story-images";

type Client = SupabaseClient<Database>;

/** One text box on the post's template card (#1925). */
export type TemplateTextField = {
  key: string;
  label: string;
  kind: "line" | "paragraph";
  max: number;
  /** The record's value, what Reset goes back to. */
  start: string;
  /** What the post shows now: the saved text, else `start`. */
  value: string;
};

export type TemplatePhotoOption = {
  id: string;
  label: string;
  /** A thumbnail to show, or null for "No photo". */
  src: string | null;
  crop: ImageCrop | null;
};

export type TemplatePhotoField = {
  key: string;
  label: string;
  options: TemplatePhotoOption[];
  /** The record's default, what Reset goes back to. */
  start: string;
  value: string;
};

/** What the post page's template card shows. */
export type PostTemplateEditor = {
  /** The template the post is drawn with, or null. */
  templateKey: PostTemplateKey | null;
  /** Templates the picker offers: those that fit the post and are on. */
  choices: { key: PostTemplateKey; label: string }[];
  /** The post's template is switched off for the tenant; names it. */
  switchedOff: string | null;
  frames: readonly number[];
  fields: TemplateTextField[];
  photo: TemplatePhotoField | null;
  storyImages: StoryImagesState | null;
};

type EditorPost = {
  id: string;
  post_format: string | null;
  event_id: string | null;
  featured_inventory_item_id?: string | null;
  template_key?: string | null;
  template_text?: Database["public"]["Tables"]["content_opportunities"]["Row"]["template_text"];
  gear_brand?: string | null;
  gear_best_for?: string | null;
  gear_why?: string | null;
};

/** The records a post can be drawn from. */
export function postRecordKinds(post: {
  event_id: string | null;
  featured_inventory_item_id?: string | null;
}): TemplateRecordKind[] {
  const kinds: TemplateRecordKind[] = [];
  if (post.featured_inventory_item_id) kinds.push("inventory_item");
  if (post.event_id) kinds.push("event");
  return kinds;
}

/**
 * The template card's state, or null when the post has no template and none
 * fits it. The item's photo is read with the service role filtered by the
 * post's tenant, as the story itself is (`story-data.ts`): the user can
 * already open the post, and content_calendar may come without inventory.
 */
export async function loadPostTemplateEditor(
  supabase: Client,
  admin: Client,
  post: EditorPost,
): Promise<PostTemplateEditor | null> {
  const { data: tenantId } = await supabase.rpc("current_tenant_id");
  if (!tenantId) return null;
  const off = await loadPostTemplatesOff(admin, tenantId);

  const choices = templatesFor({
    recordKinds: postRecordKinds(post),
    postFormat: post.post_format,
    off,
  }).map((key) => ({ key, label: POST_TEMPLATES[key].label }));

  const template = postTemplate(post.template_key);
  const switchedOff =
    template && off.includes(template.key) ? template.label : null;
  if (!template || switchedOff) {
    if (choices.length === 0 && !switchedOff) return null;
    return {
      templateKey: null,
      choices,
      switchedOff,
      frames: [],
      fields: [],
      photo: null,
      storyImages: null,
    };
  }

  // Gear Spotlight is the only template so far, so its record is the item.
  const saved = parseTemplateText(post.template_text);
  const details = gearPostDetails(post);
  const fields: TemplateTextField[] = template.fields.flatMap((field) =>
    field.kind === "photo" || field.max === null
      ? []
      : [
          {
            key: field.key,
            label: field.label,
            kind: field.kind,
            max: field.max,
            start: "",
            value: details[field.key as keyof typeof details] ?? "",
          },
        ],
  );

  const photoField = template.fields.find((field) => field.kind === "photo");
  let photo: TemplatePhotoField | null = null;
  if (photoField && post.featured_inventory_item_id) {
    const { data: item } = await admin
      .from("inventory_items")
      .select("photo_url")
      .eq("id", post.featured_inventory_item_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const options: TemplatePhotoOption[] = [];
    if (item?.photo_url) {
      const { src, crop } = parseImageCrop(item.photo_url);
      options.push({
        id: ITEM_PHOTO,
        label: "The item's photo",
        src: resolveImageUrl(src),
        crop,
      });
    }
    options.push({ id: NO_PHOTO, label: "No photo", src: null, crop: null });
    const start = options[0].id;
    const chosen = saved[photoField.key];
    photo = {
      key: photoField.key,
      label: photoField.label,
      options,
      start,
      value: options.some((option) => option.id === chosen) ? chosen : start,
    };
  }

  return {
    templateKey: template.key,
    choices,
    switchedOff: null,
    frames: template.frames,
    fields,
    photo,
    storyImages:
      post.post_format === "instagram_story"
        ? await loadStoryImagesState(supabase, admin, post.id)
        : null,
  };
}
