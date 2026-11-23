import { GEAR_ITEM_PARAM } from "@/app/(public)/inventory/gear-item-path";
import { CONDITIONS } from "@/lib/inventory";

/**
 * A recurring series that features a random Gear Library item (#1841): what
 * each post's caption says about the item. Pure, so the generator, the swap
 * action and "Use this post for future posts" agree on every caption.
 *
 * The series caption may name the item with placeholders; without any, the
 * item is added after the caption.
 */
export const SERIES_CONTENT_SOURCES = [
  { value: "template", label: "The same post each time" },
  { value: "random_gear_item", label: "A random Gear Library item" },
] as const;

export type SeriesContentSource =
  (typeof SERIES_CONTENT_SOURCES)[number]["value"];

export function isSeriesContentSource(
  value: unknown,
): value is SeriesContentSource {
  return SERIES_CONTENT_SOURCES.some((option) => option.value === value);
}

export const DEFAULT_RECENT_EXCLUSION = 8;
export const MAX_RECENT_EXCLUSION = 52;

export const GEAR_PLACEHOLDERS = {
  item: "{item}",
  size: "{size}",
  details: "{details}",
  link: "{link}",
  brand: "{brand}",
  best_for: "{best_for}",
  why: "{why}",
} as const;

/**
 * What a featured-gear post says about its item beyond the item's own record
 * (#1906): typed on the post, not on the inventory item, and cleared when the
 * post's item changes.
 */
export type GearPostDetails = {
  brand: string | null;
  best_for: string | null;
  why: string | null;
};

export const GEAR_DETAIL_LIMITS = {
  brand: 60,
  best_for: 40,
  why: 160,
} as const satisfies Record<keyof GearPostDetails, number>;

export const NO_GEAR_DETAILS: GearPostDetails = {
  brand: null,
  best_for: null,
  why: null,
};

/** Whether any of a post's gear details is filled in. */
export function hasGearDetails(details: GearPostDetails | null | undefined) {
  return Boolean(
    details &&
    (clean(details.brand) || clean(details.best_for) || clean(details.why)),
  );
}

/** The post-level placeholders, which drop their line when blank. */
const DETAIL_PLACEHOLDERS: [keyof GearPostDetails, string][] = [
  ["brand", GEAR_PLACEHOLDERS.brand],
  ["best_for", GEAR_PLACEHOLDERS.best_for],
  ["why", GEAR_PLACEHOLDERS.why],
];

/** What a caption says about an item. */
export type FeaturedGear = {
  id: string;
  description: string;
  size: string | null;
  condition: string | null;
  category_label: string | null;
};

/** The item's page in the public Gear Library: the catalog with it open. */
export function gearItemLink(origin: string, itemId: string): string {
  return `${origin.replace(/\/+$/, "")}/inventory?${GEAR_ITEM_PARAM}=${encodeURIComponent(itemId)}`;
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** "Size M · Jackets · Like new", leaving out what the item doesn't have. */
export function gearItemDetails(item: FeaturedGear): string {
  const size = clean(item.size);
  return [
    size ? `Size ${size}` : "",
    clean(item.category_label),
    CONDITIONS.find((option) => option.value === item.condition)?.label ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function hasPlaceholder(template: string): boolean {
  return Object.values(GEAR_PLACEHOLDERS).some((p) => template.includes(p));
}

/** The lines added after a caption that names no placeholder. */
function appendedBlock(item: FeaturedGear, link: string): string {
  const details = gearItemDetails(item);
  return [
    details
      ? `${clean(item.description)} (${details})`
      : clean(item.description),
    link,
  ].join("\n");
}

/**
 * Fills the post-level placeholders. A line naming one that is blank is
 * dropped, so "Brand: {brand}" doesn't go out as "Brand: ".
 */
function fillDetails(text: string, details: GearPostDetails): string {
  return text
    .split("\n")
    .filter((line) =>
      DETAIL_PLACEHOLDERS.every(
        ([key, placeholder]) =>
          !line.includes(placeholder) || clean(details[key]) !== "",
      ),
    )
    .map((line) =>
      DETAIL_PLACEHOLDERS.reduce(
        (filled, [key, placeholder]) =>
          filled.replaceAll(placeholder, clean(details[key])),
        line,
      ),
    )
    .join("\n");
}

/** A post's caption: the series caption with the item filled in. */
export function renderGearCaption(
  template: string | null,
  item: FeaturedGear,
  link: string,
  details: GearPostDetails = NO_GEAR_DETAILS,
): string {
  const base = template?.trim() ?? "";
  if (!hasPlaceholder(base)) {
    const block = appendedBlock(item, link);
    return base ? `${base}\n\n${block}` : block;
  }
  return fillDetails(base, details)
    .replaceAll(GEAR_PLACEHOLDERS.item, clean(item.description))
    .replaceAll(GEAR_PLACEHOLDERS.size, clean(item.size))
    .replaceAll(GEAR_PLACEHOLDERS.details, gearItemDetails(item))
    .replaceAll(GEAR_PLACEHOLDERS.link, link);
}

/**
 * Turns a gear post's caption back into a series caption, for "Use this post
 * for future posts": the added item lines are dropped, and where the item was
 * named in the text, its placeholder goes back. Without this, every later
 * post would carry this one's item as well as its own.
 */
export function gearCaptionToTemplate(
  caption: string | null,
  item: FeaturedGear,
  link: string,
  details: GearPostDetails = NO_GEAR_DETAILS,
): string {
  const text = caption?.trim() ?? "";
  const block = appendedBlock(item, link);
  if (text === block) return "";
  if (text.endsWith(`\n\n${block}`)) {
    return text.slice(0, -(block.length + 2)).trimEnd();
  }
  const replacements: [string, string][] = [
    [link, GEAR_PLACEHOLDERS.link],
    [gearItemDetails(item), GEAR_PLACEHOLDERS.details],
    [clean(item.description), GEAR_PLACEHOLDERS.item],
    [clean(details.why), GEAR_PLACEHOLDERS.why],
    [clean(details.best_for), GEAR_PLACEHOLDERS.best_for],
    [clean(details.brand), GEAR_PLACEHOLDERS.brand],
  ];
  // Longest first, so a brand that is part of the item's name ("Burton" in
  // "Burton jacket") doesn't take a piece of it.
  replacements.sort(([a], [b]) => b.length - a.length);
  let template = text;
  for (const [value, placeholder] of replacements) {
    if (value) template = template.replaceAll(value, placeholder);
  }
  return template;
}

/**
 * Whether someone has changed a post's caption since it was filled in for
 * `item`. A caption that is still the series caption -- a post that features
 * nothing yet, or one whose fill-in failed -- counts as unedited.
 */
export function gearCaptionEdited(
  content: string | null,
  template: string | null,
  item: FeaturedGear | null,
  link: string | null,
  details: GearPostDetails = NO_GEAR_DETAILS,
): boolean {
  const current = content?.trim() ?? "";
  // Empty, or still the series caption (never filled in): nothing to lose.
  if (!current || current === (template?.trim() ?? "")) return false;
  if (!item || !link) return true;
  return current !== renderGearCaption(template, item, link, details);
}
