import type { Json } from "@/lib/database.types";
import {
  buildEventPostFrame,
  type EventPostInput,
  type EventPostModel,
  type EventPostRecord,
} from "./event-post-frames";
import { MAX_POST_MEDIA } from "./pieces";
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

/**
 * A one-line box, a wrapping box, a photo chosen from the record's media,
 * several photos chosen in order (#1927), or an option that is on or off
 * (#1926), stored as "on" / "off".
 */
export type TemplateFieldKind =
  "line" | "paragraph" | "photo" | "photos" | "toggle";

export type TemplateField<Record> = {
  key: string;
  label: string;
  kind: TemplateFieldKind;
  /** Characters the layout holds at a readable size; null for a photo or toggle. */
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
  /** A line under the picker on what the template adds, if it needs one. */
  description?: string;
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
/** An event photo's choice (#1926): `event_media:<uuid>`. */
export const EVENT_PHOTO_PREFIX = "event_media:";

/**
 * Several photos (#1927): `none`, or their `event_media:<uuid>` choices
 * joined with commas, in the order they were picked. Left unset, the
 * template's default photos.
 */
const PHOTO_LIST_ITEM = /^event_media:[0-9a-f-]{36}$/;
export const PHOTO_LIST_SEPARATOR = ",";

/** A photo list's choices, in order, without repeats; [] for none or unset. */
export function parsePhotoList(value: string | undefined): string[] {
  if (!value || value === NO_PHOTO) return [];
  return [
    ...new Set(
      value
        .split(PHOTO_LIST_SEPARATOR)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export const TOGGLE_ON = "on";
export const TOGGLE_OFF = "off";

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
/* Event announcement and reminder (#1926)                                   */
/* ------------------------------------------------------------------------ */

/**
 * Caps sized against the layouts: the line holds two lines at its smallest
 * size in both formats, the call to action one.
 */
export const EVENT_TEXT_LIMITS = { line: 60, cta: 40 } as const;

const eventLine: TemplateField<EventPostRecord> = {
  key: "line",
  label: "Line",
  kind: "line",
  max: EVENT_TEXT_LIMITS.line,
  start: (event) => event.name,
};

/**
 * Date, time and place: a flyer usually says them, so they start off with
 * one and on without. The logo starts on, drawn small beside a flyer.
 */
const eventOptions: readonly TemplateField<EventPostRecord>[] = [
  {
    key: "details",
    label: "Show date, time and place",
    kind: "toggle",
    max: null,
    start: (event) => (event.has_flyer ? TOGGLE_OFF : TOGGLE_ON),
  },
  {
    key: "logo",
    label: "Show logo",
    kind: "toggle",
    max: null,
    start: () => TOGGLE_ON,
  },
  {
    key: "photo",
    label: "Image",
    kind: "photo",
    max: null,
    // Left unset, the flyer, else the event's first public photo.
    start: typedOnly,
  },
];

export const EVENT_ANNOUNCEMENT = {
  key: "event_announcement",
  label: "Event announcement",
  recordKind: "event",
  formats: ["story", "post"],
  frames: [1],
  description:
    "Frames the event's flyer on its own colour, with a line and a call to action. Without a flyer, your brand with the event's title, date, place and a photo.",
  fields: [
    eventLine,
    {
      key: "cta",
      label: "Call to action",
      kind: "line",
      max: EVENT_TEXT_LIMITS.cta,
      start: (event) =>
        `${event.registration_enabled ? "Register at" : "More at"} ${event.host}`,
    },
    ...eventOptions,
  ],
  build: buildEventPostFrame,
} as const satisfies Template<EventPostRecord, EventPostInput, EventPostModel>;

export const EVENT_REMINDER = {
  key: "event_reminder",
  label: "Event reminder",
  recordKind: "event",
  formats: ["story", "post"],
  frames: [1],
  description:
    'Says when the event is from the day the image is made ("Tomorrow", "This Saturday"), over the event\'s flyer or your brand.',
  fields: [eventLine, ...eventOptions],
  build: buildEventPostFrame,
} as const satisfies Template<EventPostRecord, EventPostInput, EventPostModel>;

/* ------------------------------------------------------------------------ */
/* Event recap and sponsor thank-you (#1927)                                 */
/* ------------------------------------------------------------------------ */

/**
 * The photos an event recap may show. A story is one frame, a collage of up
 * to four. A 4:5 post is a carousel: the first photo under the recap's words,
 * then each further photo a slide of its own, up to Instagram's limit -- the
 * most a post holds.
 */
export const RECAP_PHOTO_LIMITS = {
  story: 4,
  post: MAX_POST_MEDIA,
} as const satisfies Record<TemplateFormat, number>;

/** Picked for a recap until someone chooses: the gallery's first four. */
export const RECAP_DEFAULT_PHOTOS = 4;

export const EVENT_RECAP = {
  key: "event_recap",
  label: "Event recap",
  recordKind: "event",
  formats: ["story", "post"],
  frames: [1],
  description:
    "Thanks everyone who came, over photos from the event's public gallery. A story is one collage of up to four; a post is a carousel of up to 20, the first photo under the words and each further one a slide of its own.",
  fields: [
    {
      key: "line",
      label: "Line",
      kind: "line",
      max: EVENT_TEXT_LIMITS.line,
      start: () => "Thank you to everyone who came",
    },
    {
      key: "attendance",
      label: "Show how many came",
      kind: "toggle",
      max: null,
      // From check-ins: on once anyone has been checked in.
      start: (event) => ((event.attended ?? 0) > 0 ? TOGGLE_ON : TOGGLE_OFF),
    },
    {
      key: "logo",
      label: "Show logo",
      kind: "toggle",
      max: null,
      start: () => TOGGLE_ON,
    },
    {
      key: "photos",
      label: "Photos",
      kind: "photos",
      max: null,
      // Left unset, the gallery's first photos.
      start: typedOnly,
    },
  ],
  build: buildEventPostFrame,
} as const satisfies Template<EventPostRecord, EventPostInput, EventPostModel>;

export const SPONSOR_THANK_YOU = {
  key: "sponsor_thank_you",
  label: "Sponsor thank-you",
  recordKind: "event",
  formats: ["story", "post"],
  frames: [1],
  description:
    "Thanks the event's sponsors by name or logo. Only sponsors credited publicly on the event are shown, never donors.",
  fields: [
    {
      key: "line",
      label: "Line",
      kind: "line",
      max: EVENT_TEXT_LIMITS.line,
      start: () => "Thank you to our sponsors",
    },
    {
      key: "sponsor_logos",
      label: "Show sponsors' logos",
      kind: "toggle",
      max: null,
      start: (event) =>
        event.sponsors?.some((sponsor) => sponsor.logo_url)
          ? TOGGLE_ON
          : TOGGLE_OFF,
    },
    {
      key: "logo",
      label: "Show logo",
      kind: "toggle",
      max: null,
      start: () => TOGGLE_ON,
    },
  ],
  build: buildEventPostFrame,
} as const satisfies Template<EventPostRecord, EventPostInput, EventPostModel>;

export const EVENT_TEMPLATES = [
  EVENT_ANNOUNCEMENT,
  EVENT_REMINDER,
  EVENT_RECAP,
  SPONSOR_THANK_YOU,
] as const;
export type EventTemplateKey = (typeof EVENT_TEMPLATES)[number]["key"];

export function isEventTemplateKey(value: unknown): value is EventTemplateKey {
  return EVENT_TEMPLATES.some((template) => template.key === value);
}

/** An event template's words and options, after what was typed. */
export type EventTemplateValues = {
  line: string;
  cta: string | null;
  details: boolean;
  logo: boolean;
  /** A recap's head count (#1927). */
  attendance: boolean;
  /** A sponsor thank-you's logos rather than names (#1927). */
  sponsorLogos: boolean;
};

/** An event template's words and options for `event`, after what was typed. */
export function eventTemplateValues(
  template: (typeof EVENT_TEMPLATES)[number],
  event: EventPostRecord,
  text: TemplateText,
): EventTemplateValues {
  const value = (key: string) => {
    const field = template.fields.find((f) => f.key === key);
    return field ? templateFieldValue(field, event, text) : null;
  };
  return {
    line: value("line") ?? "",
    cta: value("cta"),
    details: value("details") === TOGGLE_ON,
    logo: value("logo") === TOGGLE_ON,
    attendance: value("attendance") === TOGGLE_ON,
    sponsorLogos: value("sponsor_logos") === TOGGLE_ON,
  };
}

/* ------------------------------------------------------------------------ */
/* Registry                                                                  */
/* ------------------------------------------------------------------------ */

export const POST_TEMPLATES = {
  [GEAR_SPOTLIGHT.key]: GEAR_SPOTLIGHT,
  [EVENT_ANNOUNCEMENT.key]: EVENT_ANNOUNCEMENT,
  [EVENT_REMINDER.key]: EVENT_REMINDER,
  [EVENT_RECAP.key]: EVENT_RECAP,
  [SPONSOR_THANK_YOU.key]: SPONSOR_THANK_YOU,
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
    if (field.kind === "photos") {
      if (!value) continue;
      if (value === NO_PHOTO) {
        text[field.key] = NO_PHOTO;
        continue;
      }
      const items = parsePhotoList(value);
      if (items.some((item) => !PHOTO_LIST_ITEM.test(item))) {
        return { error: `Choose ${field.label.toLowerCase()} from the list.` };
      }
      if (items.length > MAX_POST_MEDIA) {
        return {
          error: `Choose at most ${MAX_POST_MEDIA} ${field.label.toLowerCase()}.`,
        };
      }
      if (items.length > 0) text[field.key] = items.join(PHOTO_LIST_SEPARATOR);
      continue;
    }
    if (field.kind === "toggle") {
      if (!value) continue;
      if (value !== TOGGLE_ON && value !== TOGGLE_OFF) {
        return { error: `${field.label} is on or off.` };
      }
      if (record === null || value !== field.start(record)) {
        text[field.key] = value;
      }
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
