import type { Json } from "@/lib/database.types";
import { GEAR_DETAIL_LIMITS, type GearPostDetails } from "./series-gear";
import {
  buildStoryFrame,
  STORY_FRAMES,
  type StoryInput,
  type StoryItem,
  type StoryModel,
} from "./story-frames";

/**
 * Post templates (#1924, part of #1923): a branded image a post is drawn
 * from one of its records with. A template is code, not tenant rows: its
 * frames, its text fields with their caps, and a pure `build()` that says what
 * a frame shows. What someone typed over is the post's `template_text`, and
 * holds only the fields they changed -- the rest show their starting value
 * from the record.
 */

/** The record a template fills itself from. */
export type TemplateRecordKind = "inventory_item" | "event" | "report";

/** Story 1080x1920, post 1080x1350 (4:5). Square is left to Canva. */
export type TemplateFormat = "story" | "post";

/** A one-line box, a wrapping box, or a photo chosen from the record's media. */
export type TemplateFieldKind = "line" | "paragraph" | "photo";

export type TemplateField<Record> = {
  key: string;
  label: string;
  kind: TemplateFieldKind;
  /** Characters the layout holds at a readable size; null for a photo. */
  max: number | null;
  /** What the field shows before anyone types over it. */
  start: (record: Record) => string | null;
};

export type Template<Record, Input, Model> = {
  key: string;
  label: string;
  recordKind: TemplateRecordKind;
  formats: readonly TemplateFormat[];
  frames: readonly number[];
  fields: readonly TemplateField<Record>[];
  /** What one frame shows. Pure: decides everything, draws nothing. */
  build: (input: Input) => Model;
};

/**
 * A photo field's value names one of the record's media: `none` for no
 * photo, `item` for an inventory item's photo, or `<kind>:<uuid>` for a
 * record's media row (an event's, later). Left unset, the record's default.
 */
export const NO_PHOTO = "none";
export const ITEM_PHOTO = "item";
const PHOTO_CHOICE = /^(?:none|item|[a-z_]{1,32}:[0-9a-f-]{36})$/;

/** The fields someone typed over, by field key. */
export type TemplateText = Record<string, string>;

/* ------------------------------------------------------------------------ */
/* Gear Spotlight                                                            */
/* ------------------------------------------------------------------------ */

/** Brand, Best for and Why aren't on the item: they start empty. */
const typedOnly = () => null;

export const GEAR_SPOTLIGHT = {
  key: "gear_spotlight",
  label: "Gear Spotlight",
  recordKind: "inventory_item",
  formats: ["story"],
  frames: STORY_FRAMES,
  fields: [
    {
      key: "brand",
      label: "Brand",
      kind: "line",
      max: GEAR_DETAIL_LIMITS.brand,
      start: typedOnly,
    },
    {
      key: "best_for",
      label: "Best for",
      kind: "line",
      max: GEAR_DETAIL_LIMITS.best_for,
      start: typedOnly,
    },
    {
      key: "why",
      label: "Why we love it",
      kind: "paragraph",
      max: GEAR_DETAIL_LIMITS.why,
      start: typedOnly,
    },
    {
      key: "photo",
      label: "Photo",
      kind: "photo",
      max: null,
      // Left unset, the item's own photo (#1925).
      start: typedOnly,
    },
  ],
  build: buildStoryFrame,
} as const satisfies Template<StoryItem, StoryInput, StoryModel>;

/* ------------------------------------------------------------------------ */
/* Registry                                                                  */
/* ------------------------------------------------------------------------ */

export const POST_TEMPLATES = {
  [GEAR_SPOTLIGHT.key]: GEAR_SPOTLIGHT,
} as const;

export type PostTemplateKey = keyof typeof POST_TEMPLATES;

export function isPostTemplateKey(value: unknown): value is PostTemplateKey {
  return typeof value === "string" && Object.hasOwn(POST_TEMPLATES, value);
}

export function postTemplate(key: unknown) {
  return isPostTemplateKey(key) ? POST_TEMPLATES[key] : null;
}

/** The template format a post format is drawn in; a reel has none. */
export function templateFormat(
  postFormat: string | null,
): TemplateFormat | null {
  if (postFormat === "instagram_story") return "story";
  if (postFormat === "instagram_post") return "post";
  return null;
}

/**
 * The templates a post may be drawn with (#1925): those for one of the records
 * it has, in its format, that the tenant hasn't switched off.
 */
export function templatesFor({
  recordKinds,
  postFormat,
  off,
}: {
  recordKinds: readonly TemplateRecordKind[];
  postFormat: string | null;
  off: readonly string[];
}): PostTemplateKey[] {
  const format = templateFormat(postFormat);
  if (!format) return [];
  return Object.values(POST_TEMPLATES)
    .filter(
      (template) =>
        recordKinds.includes(template.recordKind) &&
        (template.formats as readonly TemplateFormat[]).includes(format) &&
        !off.includes(template.key),
    )
    .map((template) => template.key);
}

/* ------------------------------------------------------------------------ */
/* Switching templates off (#1925)                                           */
/* ------------------------------------------------------------------------ */

/**
 * The templates a tenant has switched off, as an array of keys. A setting,
 * not removal: a post already drawn with one keeps its images, but it can't
 * be drawn again or chosen until it is back on.
 */
export const POST_TEMPLATES_OFF_SETTING_KEY = "content.post_templates_off";

export function parsePostTemplatesOff(value: Json | null | undefined) {
  if (!Array.isArray(value)) return [];
  return value.filter(isPostTemplateKey);
}

/* ------------------------------------------------------------------------ */
/* Template text                                                             */
/* ------------------------------------------------------------------------ */

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** A post's `template_text`, keeping only non-blank strings. */
export function parseTemplateText(
  value: Json | null | undefined,
): TemplateText {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, text]) => [key, clean(text)] as const)
      .filter(([, text]) => text !== ""),
  );
}

/** What a field shows: the typed text, else its starting value. */
export function templateFieldValue<R>(
  field: TemplateField<R>,
  record: R,
  text: TemplateText,
): string | null {
  return text[field.key] ?? field.start(record);
}

/**
 * The `template_text` to store for what someone typed: cleaned, checked
 * against each field's cap, and without fields that are blank or still their
 * starting value. Keys the template doesn't have are dropped.
 */
export function normalizeTemplateText<R>(
  template: { fields: readonly TemplateField<R>[] },
  record: R,
  input: Record<string, unknown>,
): { text: TemplateText } | { error: string } {
  const text: TemplateText = {};
  for (const field of template.fields) {
    const value = clean(input[field.key]);
    if (field.kind === "photo") {
      if (!value) continue;
      if (!PHOTO_CHOICE.test(value)) {
        return {
          error: `Choose a ${field.label.toLowerCase()} from the list.`,
        };
      }
      text[field.key] = value;
      continue;
    }
    if (field.max !== null && value.length > field.max) {
      return {
        error: `${field.label} can be at most ${field.max} characters.`,
      };
    }
    const start = record === null ? "" : clean(field.start(record));
    if (value && value !== start) text[field.key] = value;
  }
  return { text };
}

/**
 * A Gear Spotlight post's Brand / Best for / Why (#1906). `template_text`
 * first; the old columns until main writes it (#1924), which the app keeps
 * in step.
 */
export function gearPostDetails(post: {
  template_text?: Json | null;
  gear_brand?: string | null;
  gear_best_for?: string | null;
  gear_why?: string | null;
}): GearPostDetails {
  const text = parseTemplateText(post.template_text);
  return {
    brand: text.brand ?? post.gear_brand ?? null,
    best_for: text.best_for ?? post.gear_best_for ?? null,
    why: text.why ?? post.gear_why ?? null,
  };
}
