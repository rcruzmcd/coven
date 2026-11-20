import {
  BRAND_COLOR_TOKENS,
  DEFAULT_ACCENT_STOPS,
  type Branding,
} from "@/lib/branding";
import { contrastRatio } from "@/lib/color-contrast";

/**
 * Category colours (#1907): each inventory category maps to one of the
 * tenant's accent stops, so the Gear Spotlight story's category pill is drawn
 * in the tenant's own palette and no colour lives in platform code.
 *
 * What is stored is an index into `brand.accent_stops`, not a hex
 * (`accent_stop` on both category tables), and it resolves in three steps:
 *
 *   the category's own stop -> its group's stop -> the group's place in
 *   sort_order, cycling through the stops
 *
 * so a tenant that sets nothing still gets one colour per group, and Chatter
 * Snow can split Skis and Boards, which share Hardgoods.
 */

export type AccentGroup = {
  id: string;
  sort_order: number;
  accent_stop: number | null;
};

export type AccentCategory = {
  group_id: string;
  accent_stop: number | null;
};

export type CategoryAccent = {
  /** The index into the tenant's stops, already wrapped to their count. */
  stop: number;
  /** The pill's background. */
  color: string;
  /** The pill's text: white or the tenant's deep colour, whichever reads. */
  text: string;
};

/** WCAG AA for normal text, which the pill's label is held to. */
export const PILL_TEXT_CONTRAST = 4.5;

const WHITE = "#ffffff";

/** The stops a tenant's colours are drawn from, default included. */
export function tenantAccentStops(branding: Branding): readonly string[] {
  return branding.accentStops ?? DEFAULT_ACCENT_STOPS;
}

/**
 * An index wrapped into `[0, count)`. A palette can shrink after a colour was
 * picked from it, and a stop past the end should land on a real colour rather
 * than nothing.
 */
export function wrapStop(stop: number, count: number): number {
  if (count <= 0) return 0;
  return ((Math.trunc(stop) % count) + count) % count;
}

/**
 * A group's stop, before wrapping: its own, or its position among all the
 * tenant's groups in `sort_order`. Retired groups count, so retiring one does
 * not repaint every group after it. Ties break on id, so the cycle is the
 * same on every read.
 */
export function groupStop(
  group: AccentGroup,
  groups: readonly AccentGroup[],
): number {
  if (group.accent_stop !== null) return group.accent_stop;
  const ordered = [...groups].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
  );
  const position = ordered.findIndex((g) => g.id === group.id);
  return Math.max(position, 0);
}

/** A category's stop, before wrapping: its own, else its group's. */
export function categoryStop(
  category: AccentCategory,
  groups: readonly AccentGroup[],
): number {
  if (category.accent_stop !== null) return category.accent_stop;
  const group = groups.find((g) => g.id === category.group_id);
  return group ? groupStop(group, groups) : 0;
}

/**
 * White or the tenant's deep colour, whichever reaches 4.5:1 against the
 * stop, white first. A stop neither reaches (a mid-tone red can sit just
 * under 4.5 against both) gets whichever is closer, rather than a colour
 * hard-coded per stop.
 */
export function pillTextColor(background: string, deep: string): string {
  const candidates = [WHITE, deep];
  const readable = candidates.find(
    (color) => contrastRatio(color, background) >= PILL_TEXT_CONTRAST,
  );
  if (readable) return readable;
  return contrastRatio(WHITE, background) >= contrastRatio(deep, background)
    ? WHITE
    : deep;
}

function deepColor(branding: Branding): string {
  return (
    branding.colors.primary_deep ??
    BRAND_COLOR_TOKENS.find((token) => token.key === "primary_deep")!
      .defaultValue
  );
}

/** The resolved colour for a stop index in this tenant's palette. */
export function accentForStop(
  stop: number,
  branding: Branding,
): CategoryAccent {
  const stops = tenantAccentStops(branding);
  const index = wrapStop(stop, stops.length);
  const color = stops[index];
  return {
    stop: index,
    color,
    text: pillTextColor(color, deepColor(branding)),
  };
}

/**
 * The pill colour for a category. An uncategorized item has no group to fall
 * back to, so it takes the first stop.
 */
export function categoryAccent(
  category: AccentCategory | null,
  groups: readonly AccentGroup[],
  branding: Branding,
): CategoryAccent {
  return accentForStop(category ? categoryStop(category, groups) : 0, branding);
}
