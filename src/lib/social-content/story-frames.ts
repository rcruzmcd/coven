import { BRAND_COLOR_TOKENS, type Branding } from "@/lib/branding";
import { contrastRatio } from "@/lib/color-contrast";
import { CONDITIONS } from "@/lib/inventory";
import {
  accentForStop,
  tenantAccentStops,
  type CategoryAccent,
} from "@/lib/inventory-category-colors";
import type { GearPostDetails } from "./series-gear";
import type { SeriesCadence } from "./series";
import { SPOTLIGHT_ITEM_PLACEHOLDER } from "@/lib/site-content";

/**
 * The Gear Spotlight story (#1905, #1908): what each of its three 1080x1920
 * frames shows, from the post, its item and the tenant's branding. Pure, so
 * the rules -- a blank detail tile is left out, no photo becomes a tinted
 * panel, long text shrinks before it is cut -- are tested without rendering.
 * `story-frame-view.tsx` draws the result and decides nothing.
 *
 * Every colour and word comes from the tenant: the palette from its brand
 * tokens, the pill from its category colours (#1907), the last frame's copy
 * from its `gears:spotlight` Site Content. The script lines and tile labels
 * are the platform's, as plain as a tile label in the portal.
 */

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
/** Instagram draws its own chrome over these; nothing of ours goes there. */
export const STORY_SAFE_TOP = 250;
export const STORY_SAFE_BOTTOM = 340;
export const STORY_SIDE = 72;
/** The width text may take between the side margins. */
export const STORY_CONTENT_WIDTH = STORY_WIDTH - 2 * STORY_SIDE;

export const STORY_FRAMES = [1, 2, 3] as const;
export type StoryFrameNumber = (typeof STORY_FRAMES)[number];

export function parseStoryFrame(value: string): StoryFrameNumber | null {
  const n = Number(value);
  return STORY_FRAMES.find((frame) => frame === n) ?? null;
}

/** Text at the size that fits, and what is left of it if nothing did. */
export type FittedText = { text: string; fontSize: number };

/** WCAG AA, for every piece of text on every frame. */
export const STORY_TEXT_CONTRAST = 4.5;

export type StoryTheme = {
  /** The page behind everything: the tenant's tint. */
  page: string;
  /** Tiles and the no-photo panel: the tenant's page background. */
  panel: string;
  /** Titles and body text, on the page. */
  text: string;
  /** Eyebrows and script lines, on the page. */
  accent: string;
  /** Body text on a panel. */
  panelText: string;
  /** Tile labels on a panel. */
  panelAccent: string;
  /** The accent bar, left to right. */
  stops: readonly string[];
  /** The featured item's category colour: pill, step numbers, page dots. */
  category: CategoryAccent;
  /** Display letter-spacing, from the typography set. */
  headingTracking: string;
};

export type StoryHeader = {
  logoUrl: string | null;
  /** The tenant's name, drawn when it has no logo. */
  orgName: string;
  /** "Week 12"; null outside a series. */
  occurrenceLabel: string | null;
  /** "Gear Spotlight", in the tenant's word for its collection. */
  eyebrow: string;
};

export type DetailTile = {
  label: string;
  value: FittedText;
  /** A lone last tile takes the whole row rather than leave half of it empty. */
  wide: boolean;
};

export type SpotlightFrame = {
  frame: 1;
  script: string;
  /** A data URL, or null for the tinted panel naming the category. */
  photo: string | null;
  categoryLabel: string | null;
  title: FittedText;
  brand: FittedText | null;
};

export type DetailsFrame = {
  frame: 2;
  heading: string;
  /** A data URL, or null to leave the photo out: the tiles need no panel. */
  photo: string | null;
  tiles: DetailTile[];
  categoryLabel: string | null;
  script: string | null;
  why: FittedText | null;
};

export type GetItFrame = {
  frame: 3;
  /** Left out when the headline already asks it. */
  script: string | null;
  headline: FittedText;
  itemLine: FittedText | null;
  steps: FittedText[];
  /** The tenant's public host, e.g. "chattersnow.org". */
  host: string;
};

export type StoryFrame = SpotlightFrame | DetailsFrame | GetItFrame;

export type StoryModel = {
  theme: StoryTheme;
  header: StoryHeader;
  frame: StoryFrame;
};

/** The featured item, as the route reads it. */
export type StoryItem = {
  description: string;
  size: string | null;
  condition: string | null;
  category_label: string | null;
  /** Whether it is in the public Gear Library now (`public_gear_catalog`). */
  in_catalog: boolean;
};

export type StoryCopy = {
  headline: string;
  /** May name the item with `{item_name}`. */
  itemLine: string;
  steps: readonly string[];
  /** The tenant's word for its collection, for the eyebrow. */
  collection: string;
};

export type StoryInput = {
  frame: StoryFrameNumber;
  item: StoryItem;
  details: GearPostDetails;
  /** The category's stop index (#1907), or null for an uncategorized item. */
  categoryStop: number | null;
  photo: string | null;
  series: { cadence: SeriesCadence; number: number } | null;
  branding: Branding;
  headingTracking: string;
  orgName: string;
  host: string;
  copy: StoryCopy;
};

export const STORY_MAX_STEPS = 3;

/* ------------------------------------------------------------------------ */
/* Colour                                                                    */
/* ------------------------------------------------------------------------ */

function token(branding: Branding, key: string): string {
  return (
    branding.colors[key] ??
    BRAND_COLOR_TOKENS.find((t) => t.key === key)!.defaultValue
  );
}

/**
 * The first preferred colour that reads at 4.5:1 on `background`, else black
 * or white, whichever reads better. A tenant can pick an accent that is too
 * light for its own tint, and its story should still be legible.
 */
export function readableOn(
  background: string,
  preferred: readonly string[],
): string {
  const found = preferred.find(
    (color) => contrastRatio(color, background) >= STORY_TEXT_CONTRAST,
  );
  if (found) return found;
  return contrastRatio("#000000", background) >=
    contrastRatio("#ffffff", background)
    ? "#000000"
    : "#ffffff";
}

export function storyTheme(
  branding: Branding,
  categoryStop: number | null,
  headingTracking: string,
): StoryTheme {
  const page = token(branding, "primary_soft");
  const panel = token(branding, "background");
  const deep = token(branding, "primary_deep");
  const primary = token(branding, "primary");
  const category = accentForStop(categoryStop ?? 0, branding);
  return {
    page,
    panel,
    text: readableOn(page, [deep]),
    accent: readableOn(page, [primary, deep]),
    panelText: readableOn(panel, [deep]),
    panelAccent: readableOn(panel, [primary, deep]),
    stops: tenantAccentStops(branding),
    // The pill picks white or the deep colour (#1907) and settles for the
    // closer when neither reads; an image has no hover state to rescue it.
    category: {
      ...category,
      text: readableOn(category.color, [category.text]),
    },
    headingTracking,
  };
}

/* ------------------------------------------------------------------------ */
/* Fitting text                                                              */
/* ------------------------------------------------------------------------ */

/**
 * The average advance of a glyph, as a fraction of the font size. Satori
 * measures real glyphs, but the size has to be chosen before it runs; this is
 * on the wide side of the eight families (Quicksand and Fraunces run widest),
 * so an estimate errs toward a smaller size rather than a clipped line.
 */
export const GLYPH_WIDTH = 0.56;

/** Lines `text` wraps to at `fontSize` in `width`, breaking between words. */
export function wrappedLines(
  text: string,
  fontSize: number,
  width: number,
): number {
  const perLine = Math.max(1, Math.floor(width / (fontSize * GLYPH_WIDTH)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    // A word longer than a line breaks across lines of its own.
    if (word.length > perLine) {
      if (used > 0) lines += 1;
      lines += Math.ceil(word.length / perLine) - 1;
      used = word.length % perLine || perLine;
      continue;
    }
    const needed = used === 0 ? word.length : used + 1 + word.length;
    if (needed > perLine) {
      lines += 1;
      used = word.length;
    } else {
      used = needed;
    }
  }
  return lines;
}

type FitOptions = {
  width: number;
  maxSize: number;
  minSize: number;
  maxLines: number;
};

/**
 * The largest size, stepping down by 2px, at which `text` fits `maxLines`.
 * If it doesn't fit even at `minSize`, it is cut at a word and ends in an
 * ellipsis -- shortened, never clipped mid-glyph by the frame's edge.
 */
export function fitText(text: string, options: FitOptions): FittedText {
  const clean = text.trim().replace(/\s+/g, " ");
  for (let size = options.maxSize; size >= options.minSize; size -= 2) {
    if (wrappedLines(clean, size, options.width) <= options.maxLines) {
      return { text: clean, fontSize: size };
    }
  }
  const words = clean.split(" ");
  while (words.length > 1) {
    words.pop();
    const candidate = `${words.join(" ").replace(/[\s,.;:–—-]+$/, "")}…`;
    if (
      wrappedLines(candidate, options.minSize, options.width) <=
      options.maxLines
    ) {
      return { text: candidate, fontSize: options.minSize };
    }
  }
  // One word longer than every line: cut it to what fits.
  const perLine = Math.floor(options.width / (options.minSize * GLYPH_WIDTH));
  return {
    text: `${clean.slice(0, Math.max(1, perLine * options.maxLines - 1))}…`,
    fontSize: options.minSize,
  };
}

/* ------------------------------------------------------------------------ */
/* Frames                                                                    */
/* ------------------------------------------------------------------------ */

function clean(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function occurrenceLabel(series: StoryInput["series"]): string | null {
  if (!series) return null;
  if (series.cadence === "weekly") return `Week ${series.number}`;
  if (series.cadence === "monthly") return `Month ${series.number}`;
  return `No. ${series.number}`;
}

/** Two tiles a row; the padding inside a tile. */
const TILE_GAP = 24;
const TILE_PADDING = 40;

export function detailTiles(
  item: StoryItem,
  details: GearPostDetails,
): DetailTile[] {
  const entries = [
    { label: "Size", value: clean(item.size) },
    {
      label: "Condition",
      value:
        CONDITIONS.find((option) => option.value === item.condition)?.label ??
        "",
    },
    { label: "Best for", value: clean(details.best_for) },
    {
      label: "Status",
      value: item.in_catalog ? "Available" : "No longer available",
    },
  ].filter((entry) => entry.value !== "");
  const half = (STORY_CONTENT_WIDTH - TILE_GAP) / 2 - 2 * TILE_PADDING;
  const full = STORY_CONTENT_WIDTH - 2 * TILE_PADDING;
  // Three lines and a smaller size before a tile takes a whole row: "Best
  // for" at its 40-character cap fits half a row that way, and a wide tile
  // would leave Status alone on a third row.
  const fit = (text: string, width: number) =>
    fitText(text, { width, maxSize: 52, minSize: 30, maxLines: 3 });
  // A value too long even for that gets the whole row...
  const wide = entries.map(
    (entry) => fit(entry.value, half).text !== entry.value,
  );
  // ...and so does a half tile left without a partner, between wide ones or
  // at the end, rather than leave half a row empty.
  let run: number[] = [];
  const closeRun = () => {
    if (run.length % 2 === 1) wide[run[run.length - 1]] = true;
    run = [];
  };
  wide.forEach((isWide, index) => (isWide ? closeRun() : run.push(index)));
  closeRun();
  return entries.map((entry, index) => ({
    label: entry.label,
    value: fit(entry.value, wide[index] ? full : half),
    wide: wide[index],
  }));
}

function spotlightFrame(input: StoryInput): SpotlightFrame {
  const brand = clean(input.details.brand);
  return {
    frame: 1,
    script: "this week's find",
    photo: input.photo,
    categoryLabel: clean(input.item.category_label) || null,
    title: fitText(input.item.description, {
      width: STORY_CONTENT_WIDTH,
      maxSize: 96,
      minSize: 56,
      maxLines: 2,
    }),
    brand: brand
      ? fitText(brand, {
          width: STORY_CONTENT_WIDTH,
          maxSize: 42,
          minSize: 32,
          // The 60-character cap needs two lines at a readable size.
          maxLines: 2,
        })
      : null,
  };
}

function detailsFrame(input: StoryInput): DetailsFrame {
  const why = clean(input.details.why);
  return {
    frame: 2,
    heading: "The details",
    photo: input.photo,
    tiles: detailTiles(input.item, input.details),
    categoryLabel: clean(input.item.category_label) || null,
    script: why ? "why we love it" : null,
    why: why
      ? fitText(why, {
          width: STORY_CONTENT_WIDTH,
          maxSize: 44,
          minSize: 34,
          maxLines: 4,
        })
      : null,
  };
}

function getItFrame(input: StoryInput): GetItFrame {
  const headline = clean(input.copy.headline);
  const itemLine = clean(
    input.copy.itemLine.replaceAll(
      SPOTLIGHT_ITEM_PLACEHOLDER,
      clean(input.item.description),
    ),
  );
  return {
    frame: 3,
    // The script line asks the question; a headline that already asks it
    // ("Want it? Here's how.", the platform default) would say it twice.
    script: /\bwant it\b/i.test(headline) ? null : "want it?",
    headline: fitText(headline, {
      width: STORY_CONTENT_WIDTH,
      maxSize: 96,
      minSize: 60,
      maxLines: 3,
    }),
    itemLine: itemLine
      ? fitText(itemLine, {
          width: STORY_CONTENT_WIDTH,
          maxSize: 42,
          minSize: 32,
          maxLines: 3,
        })
      : null,
    steps: input.copy.steps
      .map(clean)
      .filter(Boolean)
      .slice(0, STORY_MAX_STEPS)
      .map((step) =>
        fitText(step, {
          // Beside the 76px number and its 28px gap.
          width: STORY_CONTENT_WIDTH - 104,
          maxSize: 40,
          minSize: 30,
          maxLines: 2,
        }),
      ),
    host: input.host,
  };
}

/** What one frame of a post's story shows. */
export function buildStoryFrame(input: StoryInput): StoryModel {
  const theme = storyTheme(
    input.branding,
    input.categoryStop,
    input.headingTracking,
  );
  const header: StoryHeader = {
    logoUrl: input.branding.logoUrl,
    orgName: input.orgName,
    occurrenceLabel: occurrenceLabel(input.series),
    eyebrow: `${clean(input.copy.collection) || "Gear"} Spotlight`,
  };
  const frame =
    input.frame === 1
      ? spotlightFrame(input)
      : input.frame === 2
        ? detailsFrame(input)
        : getItFrame(input);
  return { theme, header, frame };
}

/** "https://www.chattersnow.org" -> "chattersnow.org", for the last frame. */
export function displayHost(origin: string): string {
  try {
    return new URL(origin).host.replace(/^www\./, "");
  } catch {
    return origin.replace(/^https?:\/\//, "").replace(/^www\./, "");
  }
}
