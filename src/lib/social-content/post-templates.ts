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
    if (field.kind === "photo") continue;
    const value = clean(input[field.key]);
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
