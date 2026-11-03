import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How the public site is arranged, for the parts that are neither copy nor
 * colour (#846).
 *
 * Page visibility decides whether a section exists at all; these decide how
 * much of it a page shows. Same approach as `PUBLIC_PAGE_SLOTS` in
 * `@/lib/page-visibility` and `BRAND_COLOR_TOKENS` in `@/lib/branding`: adding
 * an entry below is enough to wire a setting up in the admin UI and in the
 * public read, because every slot is just a keyed row in app_settings. The
 * `public_site_layout` view already exposes the whole `layout.*` prefix, so a
 * new slot needs no migration.
 */
/**
 * Stored in app_settings as-is, so it has to be something jsonb round-trips
 * unchanged and `===` compares correctly. Numbers, strings and booleans all
 * do; anything structural would need a deep compare in `isLayoutValue`.
 */
export type LayoutValue = number | string | boolean;

export type LayoutOption = {
  value: LayoutValue;
  label: string;
  /** Shown beside the label in the picker, when the label alone is thin. */
  hint?: string;
};

export type LayoutSlot = {
  /** The suffix after `layout.`, and the column the public view exposes. */
  key: string;
  label: string;
  description: string;
  /**
   * How the panel renders it. A two-value slot reads better as a switch, and
   * `switch` requires exactly two options, the first of which is the "on"
   * position.
   */
  control: "select" | "switch";
  options: readonly LayoutOption[];
  /**
   * Applied when no row exists, when the row is unreadable, and when it holds
   * a value no longer on offer. Production is seeded with no rows at all, so
   * this is what actually decides the layout on a fresh deploy.
   */
  defaultValue: LayoutValue;
};

export const HOME_UPCOMING_COUNT_SLOT = "home_upcoming_count";
export const HOME_UPCOMING_CARDS_SLOT = "home_upcoming_cards";
export const HOME_UPCOMING_COMMUNITY_SLOT = "home_upcoming_community";
export const PROGRAMS_SOURCE_SLOT = "programs_source";
export const TEAM_LAYOUT_SLOT = "team_layout";
export const TEAM_SOURCE_SLOT = "team_source";
export const SPONSOR_WALL_LAYOUT_SLOT = "sponsor_wall_layout";

/** The two ways the home page can present an upcoming event. */
export type HomeUpcomingCards = "fliers" | "compact";

/**
 * Where the public Programs page gets its program cards (#898).
 *
 * `content` is the copy in `programs.items`, where it has always come from,
 * and stays the default. `module` reads the tenant's own `programs` rows --
 * the ones it marked for the public site -- so an operator maintaining that
 * list in Programs is not also maintaining it in Site Content. The pillars
 * themselves are copy either way.
 */
export type ProgramsSource = "content" | "module";

/**
 * How the Meet the Team page arranges its members (#917).
 *
 * `cards` is the three-across grid the page has always been, and stays the
 * default: a tenant that has said nothing must not have its published team
 * page restructured by a deploy -- the same argument `programs_source` makes
 * one type up.
 *
 * `rows` is for the tenant whose bios are long. A card column is about 300px,
 * which sets prose at roughly 30 characters a line, so a 1,200-character bio
 * runs some forty lines while the two members beside it end near the top of
 * the row. Rows give the bio a full-width column at a readable measure and
 * clip it to three lines with an expander, which is a different answer rather
 * than a better one -- a team with two-line bios reads better as cards.
 *
 * `portraits` is for the tenant with more people than either of those can
 * hold (#1012). Both of them put every bio on the page at once, so a sixteen
 * seat board is six rows of tall cards or some six thousand pixels of roster.
 * At that size the page stops being "read about the team" and becomes "find
 * one person", and a bio for everyone is in the way of that: portraits show
 * the faces, and one bio at a time underneath them.
 */
export type TeamLayout = "cards" | "rows" | "portraits";

/**
 * Where the Meet the Team page gets its members (#1014).
 *
 * `content` is the copy in `about_team.members`, where it has always come
 * from, and stays the default. `people` reads the tenant's own
 * `public_team_members` rows -- the people it put on the page from their
 * records in People -- so an operator maintaining the team in People is not
 * also maintaining it in Site Content. The heading, hero photo and missing-bio
 * text are copy either way. The People twin of `ProgramsSource`.
 */
export type TeamSource = "content" | "people";
/** How /support/sponsorship presents the tenant-wide sponsor wall (#1013).
 *
 * `cards` is the bordered tile grid the section has been since #914, and stays
 * the default, for the reason the two types above stay where they were: a
 * tenant that has said nothing must not have its published page restructured
 * by a deploy.
 *
 * `band` is for the tenant whose wall is short or quiet. Two bordered cards in
 * a four-column grid read as an unfinished section rather than as social
 * proof, and a long tail of individually framed local businesses competes with
 * the donate call to action the wall sits above. A band drops the frames and
 * sets the same logos as one centered row at a single height, which is a
 * different answer rather than a better one -- a dozen logos still read better
 * as a wall.
 */
export type SponsorWallLayout = "cards" | "band";

export const LAYOUT_SLOTS: LayoutSlot[] = [
  {
    key: HOME_UPCOMING_COUNT_SLOT,
    label: "Upcoming events on the home page",
    description:
      "How many of the soonest events the home page lists. When fewer than this are upcoming, it shows the ones there are.",
    control: "select",
    defaultValue: 3,
    options: [
      { value: 1, label: "1 event", hint: "A single feature card" },
      { value: 2, label: "2 events" },
      { value: 3, label: "3 events", hint: "Default" },
      { value: 6, label: "6 events", hint: "Two rows" },
    ],
  },
  {
    key: HOME_UPCOMING_CARDS_SLOT,
    label: "How events are shown",
    description:
      "Flier cards lead with each event's artwork. Choose the compact list if your events don't usually have a flier -- it puts the date first instead, and fits more events in less space.",
    control: "select",
    defaultValue: "fliers",
    options: [
      { value: "fliers", label: "Flier cards", hint: "Default" },
      { value: "compact", label: "Compact list" },
    ],
  },
  {
    key: HOME_UPCOMING_COMMUNITY_SLOT,
    label: "Fill empty slots from the community calendar",
    description:
      "When you have fewer events than the number above, show what other organizations have published on the community calendar. Turn this off and the home page shows only your own events -- and no events section at all when you have none upcoming.",
    control: "switch",
    defaultValue: true,
    options: [
      { value: true, label: "Included" },
      { value: false, label: "Not included" },
    ],
  },
  {
    key: PROGRAMS_SOURCE_SLOT,
    label: "Where the Programs page gets its programs",
    description:
      "Site Content keeps the program cards as copy you write on the Site Content page. The Programs module reads the programs you manage in Programs, showing only the ones marked for the public site. Either way, the pillar headings stay in Site Content.",
    control: "select",
    defaultValue: "content",
    options: [
      { value: "content", label: "Site Content", hint: "Default" },
      { value: "module", label: "Programs module" },
    ],
  },
  {
    key: TEAM_LAYOUT_SLOT,
    label: "How team members are shown",
    description:
      "Cards put each person in a column of their own, which suits a short introduction. Rows give each person the full width of the page -- portrait on the left, name, role and biography on the right -- and clip a long biography to three lines with a Read more. Portraits show everyone's face at once with their name and role, and one biography at a time underneath; choose it when your team is bigger than a dozen and the page is for finding a person rather than reading about all of them.",
    control: "select",
    defaultValue: "cards",
    options: [
      { value: "cards", label: "Cards", hint: "Default" },
      { value: "rows", label: "Rows", hint: "For long bios" },
      { value: "portraits", label: "Portraits", hint: "For a large team" },
    ],
  },
  {
    key: TEAM_SOURCE_SLOT,
    label: "Where Meet the Team gets its members",
    description:
      "Site Content keeps the team members as copy you write on the Site Content page. People reads the people you have added to the team page from their records in People, showing only those. Either way, the heading, the hero photo and the missing-bio text stay in Site Content.",
    control: "select",
    defaultValue: "content",
    options: [
      { value: "content", label: "Site Content", hint: "Default" },
      { value: "people", label: "People" },
    ],
  },
  {
    key: SPONSOR_WALL_LAYOUT_SLOT,
    label: "How sponsors are shown",
    description:
      "Cards frame each sponsor in a bordered tile, which suits a wall of logos. Band sets the same logos as one quiet centered row at a single height, with no frames. Choose band if you have a handful of sponsors, or if they should support the donate button below them rather than compete with it.",
    control: "select",
    defaultValue: "cards",
    options: [
      { value: "cards", label: "Cards", hint: "Default" },
      { value: "band", label: "Band", hint: "For a few logos" },
    ],
  },
];

const SLOTS_BY_KEY = new Map(LAYOUT_SLOTS.map((slot) => [slot.key, slot]));

/**
 * The largest value any slot offers for the home page's event count. The home
 * page queries this many rows and slices to the tenant's setting, so reading
 * the setting doesn't have to happen before the query and serialise the two.
 */
export const MAX_HOME_UPCOMING_COUNT = Math.max(
  ...(SLOTS_BY_KEY.get(HOME_UPCOMING_COUNT_SLOT)?.options ?? []).map((option) =>
    Number(option.value),
  ),
);

/** The reserved `app_settings` namespace these rows live in (#888). */
export const LAYOUT_PREFIX = "layout.";

export function layoutSettingKey(slot: string): string {
  return `${LAYOUT_PREFIX}${slot}`;
}

/** Whether a value is one this slot actually offers. */
export function isLayoutValue(slot: LayoutSlot, value: unknown): boolean {
  return slot.options.some((option) => option.value === value);
}

/** What the public site reads. One field per slot, always populated. */
export type SiteLayout = {
  homeUpcomingCount: number;
  homeUpcomingCards: HomeUpcomingCards;
  /** Whether unfilled slots may be topped up from the community calendar. */
  homeUpcomingCommunity: boolean;
  /** Whether the Programs page renders copy or the tenant's own program rows. */
  programsSource: ProgramsSource;
  /** Whether Meet the Team is a card grid or full-width roster rows. */
  teamLayout: TeamLayout;
  /** Whether Meet the Team renders copy or the tenant's own people rows. */
  teamSource: TeamSource;
  /** Whether the sponsor wall is a grid of tiles or one quiet row of logos. */
  sponsorWallLayout: SponsorWallLayout;
};

export type LayoutRow = { slot: string; value: unknown };

/**
 * Folds the tenant's rows over the registry defaults. Pure.
 *
 * Anything that isn't a value the slot offers -- a missing row, a null, a
 * number someone typed straight into the table, a value retired from the
 * options since it was saved -- falls back to the default rather than reaching
 * a page as a layout nobody designed.
 */
export function resolveLayoutValues(
  rows: readonly LayoutRow[],
): Record<string, LayoutValue> {
  const values: Record<string, LayoutValue> = {};
  for (const slot of LAYOUT_SLOTS) {
    const row = rows.find((candidate) => candidate.slot === slot.key);
    values[slot.key] = isLayoutValue(slot, row?.value)
      ? (row?.value as LayoutValue)
      : slot.defaultValue;
  }
  return values;
}

export function resolveLayout(rows: readonly LayoutRow[]): SiteLayout {
  const values = resolveLayoutValues(rows);
  return {
    homeUpcomingCount: values[HOME_UPCOMING_COUNT_SLOT] as number,
    homeUpcomingCards: values[HOME_UPCOMING_CARDS_SLOT] as HomeUpcomingCards,
    homeUpcomingCommunity: values[HOME_UPCOMING_COMMUNITY_SLOT] as boolean,
    programsSource: values[PROGRAMS_SOURCE_SLOT] as ProgramsSource,
    teamLayout: values[TEAM_LAYOUT_SLOT] as TeamLayout,
    teamSource: values[TEAM_SOURCE_SLOT] as TeamSource,
    sponsorWallLayout: values[SPONSOR_WALL_LAYOUT_SLOT] as SponsorWallLayout,
  };
}

export const DEFAULT_SITE_LAYOUT: SiteLayout = resolveLayout([]);

/**
 * Every `layout.*` row for the tenant the request host resolved to, cached per
 * request -- `getSiteLayout` and the structured settings below (the menu,
 * #1726) share one query.
 */
const getPublicLayoutRows = cache(
  async (supabase: SupabaseClient): Promise<LayoutRow[]> => {
    const { data, error } = await supabase
      .from("public_site_layout")
      .select("slot, value");

    if (error) {
      console.error(
        "[site-layout] could not read public_site_layout; every setting is falling back to its registry default",
        error,
      );
    }

    return data ?? [];
  },
);

/**
 * The layout for the tenant the request host resolved to, cached per request
 * the way `getPageVisibility` and `getPublicSite` are -- a page that reads two
 * of these settings should still cost one query.
 */
export const getSiteLayout = cache(
  async (supabase: SupabaseClient): Promise<SiteLayout> =>
    resolveLayout(await getPublicLayoutRows(supabase)),
);

/**
 * The raw stored value of one structured `layout.*` setting -- one that is not
 * a `LAYOUT_SLOTS` pick-from-options slot, like the menu (#1726). `undefined`
 * when there is no row; the caller's resolver owns every fallback.
 */
export async function getPublicLayoutSetting(
  supabase: SupabaseClient,
  slot: string,
): Promise<unknown> {
  const rows = await getPublicLayoutRows(supabase);
  return rows.find((row) => row.slot === slot)?.value;
}

/**
 * The same settings for the tenant the signed-in user has selected, for the
 * admin panel. Read straight from `app_settings` -- RLS scopes it to the
 * current tenant -- rather than through `public_site_layout`, which answers for
 * the request host and so would show a portal admin whichever tenant owns
 * `portal.<domain>` rather than the one they are editing.
 */
export const getTenantLayoutValues = cache(
  async (supabase: SupabaseClient): Promise<Record<string, LayoutValue>> => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .like("key", "layout.%");

    if (error) {
      console.error(
        "[site-layout] could not read layout.* from app_settings; the panel is showing registry defaults",
        error,
      );
    }

    return resolveLayoutValues(
      (data ?? []).map((row) => ({
        slot: String(row.key).slice("layout.".length),
        value: row.value,
      })),
    );
  },
);

/**
 * The admin-side twin of `getPublicLayoutSetting`: the selected tenant's own
 * row, read from `app_settings` for the reason `getTenantLayoutValues` gives.
 */
export async function getTenantLayoutSetting(
  supabase: SupabaseClient,
  slot: string,
): Promise<unknown> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", layoutSettingKey(slot))
    .maybeSingle();

  if (error) {
    console.error(
      `[site-layout] could not read ${layoutSettingKey(slot)} from app_settings; the panel is showing the default`,
      error,
    );
  }
  return data?.value;
}
