import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveImageUrl } from "@/lib/inventory";
import { parseImageCrop, type ImageCrop } from "@/lib/image-crop";
import { EVENT_MEDIA_BUCKET } from "@/lib/storage/event-media-files";
import {
  chosenRecapPhotos,
  eventPhotoChoice,
  loadEventTemplateRecord,
  recapPhotoOptions,
  type EventTemplateRecord,
} from "./event-post-data";
import {
  GEAR_SPOTLIGHT,
  ITEM_PHOTO,
  EVENT_RECAP,
  NO_PHOTO,
  POST_TEMPLATES,
  RECAP_PHOTO_LIMITS,
  SPONSOR_THANK_YOU,
  TOGGLE_ON,
  gearPostDetails,
  isEventTemplateKey,
  parseTemplateText,
  postTemplate,
  templateFormat,
  templatesFor,
  type EventTemplateKey,
  type PostTemplateKey,
  type TemplateFormat,
  type TemplateRecordKind,
  type TemplateText,
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

/** An option that is on or off (#1926), e.g. "Show logo". */
export type TemplateToggleField = {
  key: string;
  label: string;
  /** The record's default, what Reset goes back to. */
  start: boolean;
  value: boolean;
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

/**
 * Several photos picked in order (#1927): a recap's. The first is its cover;
 * on a carousel, each further one is a slide of its own.
 */
export type TemplatePhotosField = {
  key: string;
  label: string;
  /** The event's public gallery; never "No photo", which is none ticked. */
  options: TemplatePhotoOption[];
  /** Ticked until someone chooses: what Reset goes back to. */
  start: string[];
  value: string[];
  /** The most the format holds: 4 in a story's collage, 20 in a carousel. */
  limit: number;
  /** One frame per photo (a post), rather than one collage (a story). */
  carousel: boolean;
};

/** What the post page's template card shows. */
export type PostTemplateEditor = {
  /** The template the post is drawn with, or null. */
  templateKey: PostTemplateKey | null;
  /** Templates the picker offers: those that fit the post and are on. */
  choices: { key: PostTemplateKey; label: string }[];
  /** The post's template is switched off for the tenant; names it. */
  switchedOff: string | null;
  /** What the template adds, said under the picker. */
  description: string | null;
  /** Story or 4:5 post: the preview's shape. */
  format: TemplateFormat | null;
  frames: readonly number[];
  fields: TemplateTextField[];
  toggles: TemplateToggleField[];
  photo: TemplatePhotoField | null;
  photos: TemplatePhotosField | null;
  /** Something the record lacks or asks of whoever posts (#1927). */
  notice: string | null;
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
      description: null,
      format: null,
      frames: [],
      fields: [],
      toggles: [],
      photo: null,
      photos: null,
      notice: null,
      storyImages: null,
    };
  }

  const format = templateFormat(post.post_format);
  const storyImages =
    format !== null
      ? await loadStoryImagesState(supabase, admin, post.id)
      : null;

  if (isEventTemplateKey(template.key)) {
    if (!post.event_id) return null;
    const event = await loadEventEditor(
      admin,
      tenantId,
      post.event_id,
      template.key,
      parseTemplateText(post.template_text),
      format,
    );
    if (!event) return null;
    return {
      templateKey: template.key,
      choices,
      switchedOff: null,
      description: POST_TEMPLATES[template.key].description,
      format,
      frames: template.frames,
      ...event,
      storyImages,
    };
  }

  // Gear Spotlight: its record is the item.
  const gear = GEAR_SPOTLIGHT;
  const saved = parseTemplateText(post.template_text);
  const details = gearPostDetails(post);
  const fields: TemplateTextField[] = gear.fields.flatMap((field) =>
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

  const photoField = gear.fields.find((field) => field.kind === "photo");
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
    description: null,
    format,
    frames: template.frames,
    fields,
    toggles: [],
    photo,
    photos: null,
    notice: null,
    storyImages,
  };
}

/** Thumbnails in the photo choice are signed for an hour. */
const PHOTO_URL_TTL_SECONDS = 60 * 60;

/**
 * An event template's boxes, options and photo choice (#1926), each starting
 * from the event. The photos are its flyer and its public gallery's, signed
 * with the service role after the post was read with the user's own client,
 * as the frames themselves are drawn.
 */
async function loadEventEditor(
  admin: Client,
  tenantId: string,
  eventId: string,
  key: EventTemplateKey,
  saved: TemplateText,
  format: TemplateFormat | null,
): Promise<Pick<
  PostTemplateEditor,
  "fields" | "toggles" | "photo" | "photos" | "notice"
> | null> {
  const loaded = await loadEventTemplateRecord(admin, tenantId, eventId, key);
  if (!loaded) return null;
  const template = POST_TEMPLATES[key];
  const { record } = loaded;

  const fields: TemplateTextField[] = [];
  const toggles: TemplateToggleField[] = [];
  for (const field of template.fields) {
    if (field.kind === "toggle") {
      const start = field.start(record) === TOGGLE_ON;
      toggles.push({
        key: field.key,
        label: field.label,
        start,
        value: saved[field.key] ? saved[field.key] === TOGGLE_ON : start,
      });
    } else if (
      (field.kind === "line" || field.kind === "paragraph") &&
      field.max !== null
    ) {
      const start = field.start(record) ?? "";
      fields.push({
        key: field.key,
        label: field.label,
        kind: field.kind,
        max: field.max,
        start,
        value: saved[field.key] ?? start,
      });
    }
  }

  const urls = new Map<string, string>();
  if (loaded.photos.length > 0) {
    const { data, error } = await admin.storage
      .from(EVENT_MEDIA_BUCKET)
      .createSignedUrls(
        loaded.photos.map((photo) => photo.path),
        PHOTO_URL_TTL_SECONDS,
      );
    if (error) console.error("Could not sign event photos", error);
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
    }
  }
  let n = 0;
  const options: TemplatePhotoOption[] = [
    ...loaded.photos.map((photo) => ({
      id: eventPhotoChoice(photo),
      label: photo.isFlyer ? "The flyer" : `Event photo ${++n}`,
      src: urls.get(photo.path) ?? null,
      crop: null,
    })),
    { id: NO_PHOTO, label: "No photo", src: null, crop: null },
  ];
  const photoField = template.fields.find((field) => field.kind === "photo");
  const start = options[0].id;
  const chosen = photoField ? saved[photoField.key] : undefined;
  return {
    fields,
    toggles,
    photos: recapPhotosField(loaded, saved, format, urls),
    notice: eventNotice(key, loaded),
    photo: photoField
      ? {
          key: photoField.key,
          label: photoField.label,
          options,
          start,
          value: options.some((option) => option.id === chosen)
            ? (chosen as string)
            : start,
        }
      : null,
  };
}

/**
 * A recap's photos (#1927): the event's public gallery, never its flyer --
 * the photos the event photo agreement covers, as in Choose from event.
 */
function recapPhotosField(
  loaded: EventTemplateRecord,
  saved: TemplateText,
  format: TemplateFormat | null,
  urls: ReadonlyMap<string, string>,
): TemplatePhotosField | null {
  const field = EVENT_RECAP.fields.find((f) => f.kind === "photos");
  if (!field || !format) return null;
  const options = recapPhotoOptions(loaded.photos).map((photo, i) => ({
    id: eventPhotoChoice(photo),
    label: `Event photo ${i + 1}`,
    src: urls.get(photo.path) ?? null,
    crop: null,
  }));
  if (options.length === 0) return null;
  const ids = (choice: string | undefined) =>
    chosenRecapPhotos(loaded.photos, choice, format).map(eventPhotoChoice);
  return {
    key: field.key,
    label: field.label,
    options,
    start: ids(undefined),
    value: ids(saved[field.key]),
    limit: RECAP_PHOTO_LIMITS[format],
    carousel: format === "post",
  };
}

/** What a recap or sponsor thank-you should say before it is posted. */
function eventNotice(
  key: EventTemplateKey,
  loaded: EventTemplateRecord,
): string | null {
  if (key === EVENT_RECAP.key) {
    const notes: string[] = [];
    if (recapPhotoOptions(loaded.photos).length === 0) {
      notes.push(
        "This event has no photos in its public gallery yet, so the recap is words only. Show photos in the event's Media card to offer them here.",
      );
    }
    const objections = loaded.photoObjections ?? 0;
    if (objections > 0) {
      notes.push(
        `${objections} ${objections === 1 ? "registrant" : "registrants"} asked not to be photographed. Only photos shown in the public gallery are offered; check each before posting.`,
      );
    }
    return notes.length > 0 ? notes.join(" ") : null;
  }
  if (key === SPONSOR_THANK_YOU.key && !loaded.record.sponsors?.length) {
    return "No sponsors are credited publicly on this event yet. Add them, or mark them public, in the event's Sponsors card.";
  }
  return null;
}
