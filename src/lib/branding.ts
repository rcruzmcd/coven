import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveImageUrl } from "@/lib/inventory";
import { reportQueryError } from "@/lib/observability/query-error";

/**
 * Per-tenant branding (#707 Phase 4), served from the design tokens.
 *
 * globals.css defines the brand as a handful of CSS custom properties, and
 * every component reads those rather than a literal colour -- which is what
 * makes theming a data problem. Each entry below names one of those
 * properties; a tenant sets the ones it wants under `brand.<key>` in
 * app_settings and `brandingCss()` turns them into a `<style>` block that
 * overrides the stylesheet's values. A token that is not set is not emitted,
 * so the stylesheet -- Chatter Snow's palette -- is the default for every
 * tenant, including Chatter Snow's own.
 *
 * Values are validated as six-digit hex before they reach the style block:
 * they come from a database row an admin typed into, and a `<style>` element
 * is the wrong place to trust free text.
 */
export type BrandColorToken = {
  key: string;
  cssVar: string;
  label: string;
  description: string;
  /** What globals.css ships, shown as the placeholder and the reset value. */
  defaultValue: string;
};

export const BRAND_COLOR_TOKENS: readonly BrandColorToken[] = [
  {
    key: "primary",
    cssVar: "--purple",
    label: "Accent",
    description: "Links, icons, focus rings and the eyebrow labels.",
    defaultValue: "#70419a",
  },
  {
    key: "primary_deep",
    cssVar: "--purple-deep",
    label: "Text and buttons",
    description: "Body text, headings and primary buttons.",
    defaultValue: "#32134f",
  },
  {
    key: "primary_soft",
    cssVar: "--purple-soft",
    label: "Tint",
    description: "Secondary buttons, muted surfaces and badges.",
    defaultValue: "#ede1fb",
  },
  {
    key: "background",
    cssVar: "--background",
    label: "Page background",
    description: "The page behind every card.",
    defaultValue: "#f7f0ff",
  },
] as const;

/** The accent bar and strip: the stops of the gradient, left to right. */
export const DEFAULT_ACCENT_STOPS = [
  "#e84855",
  "#f59e42",
  "#f4d35e",
  "#50b878",
  "#38a5db",
  "#8f55ba",
] as const;

export const MAX_ACCENT_STOPS = 8;

export type Branding = {
  /** Hex colour per token key; only the tokens the tenant has set. */
  colors: Record<string, string>;
  /** Null when the tenant has not set its own accent gradient. */
  accentStops: string[] | null;
  /** Resolved, renderable logo URL, or null for the stylesheet's mark. */
  logoUrl: string | null;
  /**
   * Resolved square app-icon URL, or null to draw the generated initials
   * icon (#1083). See `APP_ICON_URL_TOKEN`.
   */
  appIconUrl: string | null;
  /**
   * The tenant's typography set, or null for the stylesheet's default. Null
   * is also what an unknown or malformed stored value resolves to, so nothing
   * outside `TYPOGRAPHY_SETS` can reach a `<style>` block.
   */
  typography: TypographySet | null;
};

export const EMPTY_BRANDING: Branding = {
  colors: {},
  accentStops: null,
  logoUrl: null,
  appIconUrl: null,
  typography: null,
};

/** The reserved `app_settings` namespace these rows live in (#888). */
export const BRAND_PREFIX = "brand.";

/** The `brand.*` tokens that are not colours. */
export const ACCENT_STOPS_TOKEN = "accent_stops";
export const LOGO_URL_TOKEN = "logo_url";
/**
 * The square home-screen icon, uploaded separately from the logo (#1083).
 *
 * Its own field rather than a reuse of `logo_url`, because the two have
 * different jobs and different shapes. A logo is whatever aspect ratio the
 * organization has -- usually a wide wordmark, often transparent -- while a
 * home-screen icon is a square raster that has to survive being masked into a
 * circle. Installing a transparent wordmark as an app icon produces a smudge
 * that reads as a bug rather than as a setting nobody filled in.
 *
 * Unset is the normal state and is not a gap: `/api/app-icon/<size>` draws the
 * organization's initials on its own brand colour, correctly padded, for every
 * tenant that has uploaded nothing.
 */
export const APP_ICON_URL_TOKEN = "app_icon_url";

/** The typography set, keyed into `TYPOGRAPHY_SETS` below (#1260). */
export const TYPOGRAPHY_TOKEN = "typography";

/**
 * Typography, as a set rather than a family name (#1260).
 *
 * Every other brand token is a value an admin types. This one is a key from
 * the registry below, for three reasons, and the first is not negotiable:
 *
 * 1. `next/font/google` resolves at build time. It is a compile-time
 *    transform over literal arguments -- there is no call you can make with a
 *    string read from a database -- so every family the platform offers has to
 *    be declared in `src/app/layout.tsx` and shipped in the bundle. The list is
 *    closed by construction; a sixth set is a deliberate change.
 * 2. A `<style>` block is an injection surface. The colours are validated as
 *    six-digit hex before they reach it, and this gets the equivalent:
 *    membership in the registry, checked here, with an unknown key resolving to
 *    null and reaching no stylesheet at all. Nothing a tenant stored is ever
 *    interpolated -- what `brandingCss()` emits is the `cssVar` below, which
 *    is a literal in this file.
 * 3. Pairings are a design decision. Two families chosen by someone who has
 *    seen them together is a different artifact from two names in a form.
 */
/**
 * The two licences these families ship under, as `google/fonts` records them
 * in each family's `METADATA.pb`. Both let anyone download the family and set
 * a flyer in it, which is what /brand tells an organization (#1262) -- but
 * they are not the same licence, so a family carries its own rather than the
 * page asserting one sentence over all eight.
 */
const OFL = "SIL Open Font License 1.1";
const APACHE = "Apache License 2.0";

export type TypographyFamily = {
  /** The family, as Google Fonts spells it. Shown in the picker (#1261). */
  name: string;
  /** The custom property `src/app/layout.tsx` binds the loaded family to. */
  cssVar: string;
  /** Printed on /brand beside the link to the family's Google Fonts page. */
  license: string;
};

const QUICKSAND: TypographyFamily = {
  name: "Quicksand",
  cssVar: "--font-quicksand",
  license: OFL,
};
const ROCK_SALT: TypographyFamily = {
  name: "Rock Salt",
  cssVar: "--font-rock-salt",
  license: APACHE,
};
const INTER: TypographyFamily = {
  name: "Inter",
  cssVar: "--font-inter",
  license: OFL,
};
const SOURCE_SERIF: TypographyFamily = {
  name: "Source Serif 4",
  cssVar: "--font-source-serif",
  license: OFL,
};
const FRAUNCES: TypographyFamily = {
  name: "Fraunces",
  cssVar: "--font-fraunces",
  license: OFL,
};
const NUNITO_SANS: TypographyFamily = {
  name: "Nunito Sans",
  cssVar: "--font-nunito-sans",
  license: OFL,
};
const FIGTREE: TypographyFamily = {
  name: "Figtree",
  cssVar: "--font-figtree",
  license: OFL,
};
const CAVEAT: TypographyFamily = {
  name: "Caveat",
  cssVar: "--font-caveat",
  license: OFL,
};

/**
 * Where to download a family. Derived rather than stored: `name` is the family
 * as Google Fonts spells it, which is the only thing its specimen URL is built
 * from, so a second field would only be a second chance to be wrong.
 */
export function googleFontsUrl(family: TypographyFamily): string {
  return `https://fonts.google.com/specimen/${family.name.replaceAll(" ", "+")}`;
}

export type TypographySet = {
  key: string;
  /**
   * What a tenant picks it by. These describe the typography and never an
   * organization: "Chatter Snow" is not a choice on anybody else's settings
   * screen, however exactly `rounded` reproduces its site.
   */
  label: string;
  description: string;
  /** Body text -- `--font-sans`, and the `body` rule. */
  sans: TypographyFamily;
  /** Display text -- `--font-heading`, `.brand-display` and `.app-eyebrow`. */
  heading: TypographyFamily;
  /** The script accent (`--font-accent-script`), or null to reuse `heading`. */
  accent: TypographyFamily | null;
  /**
   * The one metric that cannot survive a family swap. `-0.04em` is tuned for
   * Quicksand and is wrong on a serif, so it is carried by the set rather than
   * baked into the twenty-odd components that set it; they read
   * `tracking-brand`, which resolves to this.
   */
  headingTracking: string;
};

/**
 * The five sets. All latin-subset variable fonts, except Rock Salt, which
 * ships at a single weight; each family carries its own licence above.
 *
 * Note which role the eyebrow follows: `heading`, not `accent`. `.app-eyebrow`
 * is uppercase, 12px, at `0.2em` letter-spacing -- a script face set that way
 * is unreadable, and Chatter Snow's eyebrow is Quicksand today. The `accent`
 * family is the script itself, which the design system exposes as
 * `--font-accent-script` for display use.
 */
const NEUTRAL_SET: TypographySet = {
  key: "neutral",
  label: "Neutral",
  description:
    // An em dash rather than the `--` this file writes in its comments: since
    // #1262 these descriptions are printed on the public /brand page, not only
    // in the settings picker.
    "Inter throughout. The platform's own default — a UI typeface that reads as nobody's brand.",
  sans: INTER,
  heading: INTER,
  accent: null,
  headingTracking: "-0.02em",
};

export const TYPOGRAPHY_SETS: readonly TypographySet[] = [
  NEUTRAL_SET,
  {
    key: "rounded",
    label: "Rounded",
    description:
      "Quicksand with a hand-drawn script accent. Soft, informal, community-facing.",
    sans: QUICKSAND,
    heading: QUICKSAND,
    accent: ROCK_SALT,
    headingTracking: "-0.04em",
  },
  {
    key: "editorial",
    label: "Editorial",
    description:
      "Source Serif 4 headings over Inter body text. Reads like a publication.",
    sans: INTER,
    heading: SOURCE_SERIF,
    accent: null,
    headingTracking: "-0.01em",
  },
  {
    key: "statement",
    label: "Statement",
    description:
      "Fraunces headings over Nunito Sans, with a handwritten accent. High contrast, deliberate.",
    sans: NUNITO_SANS,
    heading: FRAUNCES,
    accent: CAVEAT,
    headingTracking: "-0.02em",
  },
  {
    key: "friendly",
    label: "Friendly",
    description:
      "Figtree throughout, with a handwritten accent. Plain and approachable.",
    sans: FIGTREE,
    heading: FIGTREE,
    accent: CAVEAT,
    headingTracking: "-0.02em",
  },
] as const;

/**
 * What globals.css ships, and therefore what a tenant that has set nothing
 * renders. `brandingCss()` emits nothing for this case, exactly as it emits no
 * colour for an unset colour token: the stylesheet is the default.
 */
export const DEFAULT_TYPOGRAPHY: TypographySet = NEUTRAL_SET;

export const DEFAULT_TYPOGRAPHY_KEY = DEFAULT_TYPOGRAPHY.key;

/**
 * The distinct families one set is built from, in role order: body, display,
 * then the script accent where it has one. A set whose display face is also
 * its body face lists it once, which is what /brand shows as the families an
 * organization has to install to rebuild its own materials (#1262).
 */
export function typographyFamilies(
  set: TypographySet,
): readonly TypographyFamily[] {
  return [
    ...new Map(
      [set.sans, set.heading, set.accent]
        .filter((family): family is TypographyFamily => family !== null)
        .map((family) => [family.cssVar, family]),
    ).values(),
  ];
}

/** Every family any set uses, for the loader in `src/app/layout.tsx`. */
export const TYPOGRAPHY_FAMILIES: readonly TypographyFamily[] = [
  ...new Map(
    TYPOGRAPHY_SETS.flatMap(typographyFamilies).map((family) => [
      family.cssVar,
      family,
    ]),
  ).values(),
];

/** The set a stored value names, or null for anything the registry disowns. */
export function typographySet(value: unknown): TypographySet | null {
  if (typeof value !== "string") return null;
  return TYPOGRAPHY_SETS.find((set) => set.key === value) ?? null;
}

/**
 * Every token the registry knows, colours and the three above. `brand.` is a
 * public namespace (#888): `public_branding` serves the whole prefix to
 * `anon`, so this is the list of keys that may exist under it.
 */
export const BRAND_TOKENS: readonly string[] = [
  ...BRAND_COLOR_TOKENS.map((token) => token.key),
  ACCENT_STOPS_TOKEN,
  LOGO_URL_TOKEN,
  APP_ICON_URL_TOKEN,
  TYPOGRAPHY_TOKEN,
];

export function brandSettingKey(token: string): string {
  return `${BRAND_PREFIX}${token}`;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/** Lowercases a hex colour the admin typed, or returns null if it is not one. */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return HEX_COLOR.test(trimmed) ? trimmed : null;
}

export type BrandingRow = { token: string; value: unknown };

/** Folds the `brand.*` rows into a Branding, dropping anything malformed. */
export function brandingFromRows(rows: readonly BrandingRow[]): Branding {
  const branding: Branding = {
    colors: {},
    accentStops: null,
    logoUrl: null,
    appIconUrl: null,
    typography: null,
  };
  for (const row of rows) {
    if (row.token === ACCENT_STOPS_TOKEN) {
      if (Array.isArray(row.value)) {
        const stops = row.value.filter(isHexColor).slice(0, MAX_ACCENT_STOPS);
        if (stops.length > 0) branding.accentStops = stops;
      }
      continue;
    }
    if (row.token === LOGO_URL_TOKEN) {
      if (typeof row.value === "string" && row.value.trim()) {
        branding.logoUrl = resolveImageUrl(row.value.trim());
      }
      continue;
    }
    if (row.token === APP_ICON_URL_TOKEN) {
      if (typeof row.value === "string" && row.value.trim()) {
        branding.appIconUrl = resolveImageUrl(row.value.trim());
      }
      continue;
    }
    if (row.token === TYPOGRAPHY_TOKEN) {
      branding.typography = typographySet(row.value);
      continue;
    }
    const token = BRAND_COLOR_TOKENS.find((t) => t.key === row.token);
    if (token && isHexColor(row.value)) {
      branding.colors[token.key] = row.value;
    }
  }
  return branding;
}

/**
 * The accent gradient's stops, each with the percentage it sits at.
 *
 * Extracted from `gradient()` rather than recomputed beside it, because
 * /brand documents these positions to whoever is rebuilding the gradient in
 * Figma or Canva. Two copies of `index / (length - 1)` is the drift that page
 * exists to end -- a tenant with five stops would have been told six.
 */
export function accentStops(
  branding: Branding,
): { color: string; position: number }[] {
  const stops = branding.accentStops ?? DEFAULT_ACCENT_STOPS;
  const last = Math.max(stops.length - 1, 1);
  return stops.map((color, index) => ({
    color,
    position: Math.round((index / last) * 100),
  }));
}

function gradient(stops: readonly string[], alpha: number | null): string {
  const last = Math.max(stops.length - 1, 1);
  const parts = stops.map((stop, index) => {
    const position = Math.round((index / last) * 100);
    const color =
      alpha === null
        ? stop
        : `color-mix(in srgb, ${stop} ${alpha}%, transparent)`;
    return `${color} ${position}%`;
  });
  // A single stop still has to be a gradient, because `--rainbow` is used as
  // a background-image and a flat colour there would not paint.
  if (parts.length === 1) parts.push(parts[0]);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

/**
 * The `<style>` body that applies a tenant's branding over globals.css, or
 * an empty string when there is nothing to override.
 *
 * The derived tokens follow the stylesheet's own derivations: `--line` and
 * `--muted-foreground` are the deep colour at 14% and 72%, `--foreground` is
 * the deep colour. Dark mode keeps the stylesheet's neutral surfaces and only
 * re-tints the two accents, lightened the way the stylesheet lightens its
 * own so text stays readable on the dark card.
 */
/**
 * The dark-mode form of a brand colour: its own hue, at a fixed lightness and
 * chroma chosen for a dark background.
 *
 * A brand colour is picked to read on white and is far too dark to read on
 * `oklch(0.145 0 0)`, so dark mode needs a lighter relative of it. What it must
 * *not* be is a white mix, which is what this used to do -- mixing toward white
 * in oklch drops chroma as it raises lightness, and no percentage reaches the
 * saturation a hand-picked dark accent has. Sweeping the old
 * `color-mix(... N%, white)` against globals.css's `#c8a8ea` never got closer
 * than 21 in RGB distance, at any N.
 *
 * Setting the lightness and capping the chroma, keeping only the hue, reaches it.
 * The constants below are globals.css's own dark values read back as oklch, so
 * a tenant that sets Chatter Snow's palette reproduces Chatter Snow's dark mode
 * exactly: `--purple` lands on `rgb(200, 168, 234)`, which is the stylesheet's
 * `#c8a8ea` to the byte. `--purple-deep` came out two units off, because the
 * stylesheet's two dark literals carried slightly different hues between them;
 * that one was nudged in globals.css to this derivation's output rather than
 * bent here, so there is one rule and not a rule plus an exception.
 *
 * Relative colour syntax is the mechanism (`oklch(from <colour> L C h)`). A
 * browser without it drops the declaration and falls back to the stylesheet's
 * own `.dark` literals, which is the behaviour every tenant has today anyway.
 */
export const DARK_ACCENT = { lightness: 0.783, maxChroma: 0.098 };
export const DARK_DEEP = { lightness: 0.884, maxChroma: 0.055 };

function darkVariant(
  color: string,
  { lightness, maxChroma }: { lightness: number; maxChroma: number },
): string {
  // `min(c, ...)` rather than a flat chroma (#795 Phase 3). Setting it outright
  // reproduced Chatter Snow's dark palette exactly, because a brand colour is
  // saturated by definition and the cap was always the smaller number. It is
  // wrong for the platform's own neutral default, which is barely chromatic at
  // all: forcing #475569 to 0.098 turns a slate grey into #90bbf7, a blue.
  // Clamping keeps both -- a saturated brand comes down to the cap, a neutral
  // one keeps its own chroma and stays neutral.
  return `oklch(from ${color} ${lightness} min(c, ${maxChroma}) h)`;
}

/* --- oklch, in TypeScript ------------------------------------------------
 *
 * `darkVariant()` hands the browser a relative-colour expression and lets it
 * do the maths. That is right for the stylesheet and wrong for the brand
 * guide, whose whole job is to hand someone a value they can paste into Canva:
 * "oklch(from #70419a 0.783 min(c, 0.098) h)" is not a colour a designer can
 * use, and eyedropping a screenshot is not an answer.
 *
 * So the same derivation is done here as well, and `darkVariantHex()` is
 * pinned by a test to the values globals.css already documents -- the comment
 * on DARK_ACCENT records that Chatter Snow's `--purple` must land on
 * `rgb(200, 168, 234)`. If this drifts from what the browser computes, that
 * test fails rather than the guide quietly publishing a wrong hex.
 *
 * Björn Ottosson's sRGB <-> Oklab matrices, unchanged.
 */

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** Hex to Oklab's lightness, chroma and hue (hue in radians). */
function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255);

  const lCube = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b); // prettier-ignore
  const mCube = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b); // prettier-ignore
  const sCube = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); // prettier-ignore

  const l = 0.2104542553 * lCube + 0.793617785 * mCube - 0.0040720468 * sCube;
  const a = 1.9779984951 * lCube - 2.428592205 * mCube + 0.4505937099 * sCube;
  const bAxis =
    0.0259040371 * lCube + 0.7827717662 * mCube - 0.808675766 * sCube;

  return { l, c: Math.hypot(a, bAxis), h: Math.atan2(bAxis, a) };
}

function oklchToHex({ l, c, h }: { l: number; c: number; h: number }): string {
  const a = c * Math.cos(h);
  const bAxis = c * Math.sin(h);

  const lCube = (l + 0.3963377774 * a + 0.2158037573 * bAxis) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * bAxis) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * bAxis) ** 3;

  const channels = [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ];

  return `#${channels
    .map((channel) => {
      // Clamped, because a hue at this lightness can land outside sRGB. The
      // browser clips the same way when it paints the swatch beside this hex.
      const byte = Math.round(
        Math.min(1, Math.max(0, linearToSrgb(channel))) * 255,
      );
      return byte.toString(16).padStart(2, "0");
    })
    .join("")}`;
}

/** `darkVariant()`'s output as a hex, for anyone who has to reproduce it. */
export function darkVariantHex(
  color: string,
  { lightness, maxChroma }: { lightness: number; maxChroma: number },
): string {
  const { c, h } = hexToOklch(color);
  return oklchToHex({ l: lightness, c: Math.min(c, maxChroma), h });
}

export type BrandColorPair = {
  token: BrandColorToken;
  /** The hex this tenant actually renders: its own, or the stylesheet's. */
  value: string;
  /**
   * The CSS the dark block paints this token with, or null for the two tokens
   * that have no dark form because dark mode keeps the stylesheet's neutral
   * surfaces (see `brandingCss`).
   */
  dark: string | null;
  /** The same colour as a hex, for the guide. Null wherever `dark` is. */
  darkHex: string | null;
};

/**
 * Every brand colour with the value this tenant renders it at, for /brand.
 *
 * Note what this does that `brandingCss()` does not: it falls back to the
 * token's `defaultValue` for a colour the tenant has not set, because the
 * guide documents what a visitor *sees*, not what the tenant has overridden.
 * `brandingCss()` correctly emits nothing there and lets the stylesheet stand.
 * The two agree on what is painted, and the dark derivation is the same
 * function in both.
 */
export function brandColorPairs(branding: Branding): BrandColorPair[] {
  return BRAND_COLOR_TOKENS.map((token) => {
    const value = branding.colors[token.key] ?? token.defaultValue;
    const shape =
      token.key === "primary"
        ? DARK_ACCENT
        : token.key === "primary_deep"
          ? DARK_DEEP
          : null;
    return {
      token,
      value,
      dark: shape ? darkVariant(value, shape) : null,
      darkHex: shape ? darkVariantHex(value, shape) : null,
    };
  });
}

/**
 * The set this tenant's pages actually render in, for the brand guide and the
 * picker -- the tenant's own, or the platform's.
 *
 * The same relationship `brandColorPairs()` has to `brandingCss()`: this falls
 * back to the default because it documents what a visitor *sees*, while
 * `brandingCss()` correctly emits nothing there and lets the stylesheet stand.
 */
export function resolvedTypography(branding: Branding): TypographySet {
  return branding.typography ?? DEFAULT_TYPOGRAPHY;
}

export function brandingCss(branding: Branding): string {
  const fonts: string[] = [];
  const light: string[] = [];
  const dark: string[] = [];

  // Plain `:root`, unlike the palette below, because typography is not a light
  // or a dark thing -- a dark page is set in the same families as a light one.
  // The specificity trap that forced `:root:not(.dark)` on the palette (#819)
  // does not apply: globals.css does not restate any of these four under
  // `.dark`, so there is nothing for a bare `:root` to outrank.
  const typography = branding.typography;
  if (typography) {
    // Every value interpolated here is a literal from TYPOGRAPHY_SETS. The
    // tenant's stored string was spent matching a key in `typographySet()` and
    // never appears in the output.
    fonts.push(`--brand-font-sans: var(${typography.sans.cssVar});`);
    fonts.push(`--brand-font-heading: var(${typography.heading.cssVar});`);
    fonts.push(
      `--brand-font-accent: var(${(typography.accent ?? typography.heading).cssVar});`,
    );
    fonts.push(`--brand-heading-tracking: ${typography.headingTracking};`);
  }

  for (const token of BRAND_COLOR_TOKENS) {
    const value = branding.colors[token.key];
    if (value) light.push(`${token.cssVar}: ${value};`);
  }
  const deep = branding.colors.primary_deep;
  if (deep) {
    light.push(`--foreground: ${deep};`);
    light.push(`--line: color-mix(in srgb, ${deep} 14%, transparent);`);
    light.push(
      `--muted-foreground: color-mix(in srgb, ${deep} 72%, transparent);`,
    );
    dark.push(`--purple-deep: ${darkVariant(deep, DARK_DEEP)};`);
  }
  const primary = branding.colors.primary;
  if (primary) {
    dark.push(`--purple: ${darkVariant(primary, DARK_ACCENT)};`);
  }
  if (branding.accentStops) {
    light.push(`--rainbow: ${gradient(branding.accentStops, null)};`);
    light.push(`--rainbow-soft: ${gradient(branding.accentStops, 12)};`);
    // `--rainbow` is repeated rather than inherited: it is the one brand token
    // globals.css does *not* restate under `.dark`, so with the light block
    // scoped away from dark pages there would be nothing left to override the
    // stylesheet's own gradient, and a tenant's accent would revert to Chatter
    // Snow's colours in dark mode.
    dark.push(`--rainbow: ${gradient(branding.accentStops, null)};`);
    dark.push(`--rainbow-soft: ${gradient(branding.accentStops, 10)};`);
  }

  const blocks: string[] = [];
  if (fonts.length > 0) blocks.push(`:root { ${fonts.join(" ")} }`);
  // `:root:not(.dark)`, never a bare `:root` (#819). Both are specificity
  // (0,1,0), and this block is injected into the document after the
  // stylesheet, so a bare `:root` outranks globals.css's `.dark` on the tie --
  // for every token the dark half below does not restate. `--background` is
  // one of those, so a tenant that set a page background got it on dark pages
  // too: measured `rgb(247, 240, 255)` where the stylesheet says
  // `oklch(0.145 0 0)`. Dark mode went light.
  //
  // Scoping it also states the right rule rather than patching the symptom.
  // A tenant's palette is a *light* palette -- `background`, `foreground`,
  // `line` and `muted-foreground` are all neutral in dark mode by design --
  // so the light block has no business applying to a dark page at all. What a
  // dark page needs from the brand is the accent, which is what the dark block
  // carries.
  if (light.length > 0) blocks.push(`:root:not(.dark) { ${light.join(" ")} }`);
  if (dark.length > 0) blocks.push(`.dark { ${dark.join(" ")} }`);
  return blocks.join("\n");
}

/**
 * The branding for the site the request host resolves to -- what the public
 * layout applies. Read through `public_branding`, so an admin of one tenant
 * looking at another tenant's site sees that site's colours, not their own.
 */
export async function getPublicBranding(
  supabase: SupabaseClient,
): Promise<Branding> {
  const { data, error } = await supabase
    .from("public_branding")
    .select("token, value");
  if (error) {
    reportQueryError(error, {
      source: "branding.public_branding",
      message: "could not read public_branding; rendering the platform's own",
    });
    return EMPTY_BRANDING;
  }
  return brandingFromRows((data ?? []) as BrandingRow[]);
}

export type PublicTenant = {
  id: string;
  name: string;
  slug: string;
  /**
   * The host this tenant claims. Null until an operator sets one, which is the
   * normal state on the local stack and on preview, where the tenant is
   * resolved through TENANT_HOST_OVERRIDE rather than by domain.
   */
  custom_domain: string | null;
  /**
   * The tenant's plan, one of the `tenants_plan_check` values. Here for a
   * single question the portal login has to answer before it renders anything:
   * is this host the public demo's (`plan = 'demo'`)? See `isDemoTenant`.
   */
  plan: string;
};

/**
 * Why this is three outcomes and not a nullable tenant (#795 Phase 4).
 *
 * "No tenant resolved" and "the read failed" are the same `null` to a caller
 * that only asks whether a tenant came back, and they call for opposite
 * responses. An unresolved host belongs to nobody and must 404. A failed read
 * is a database blip on a host that is perfectly well configured, and 404ing
 * it would take every tenant's public site down for the duration.
 *
 * So they are told apart here, at the only place that can tell them apart,
 * rather than reconstructed later from a null.
 */
export type PublicTenantResult =
  /** A tenant owns this host. */
  | { status: "resolved"; tenant: PublicTenant }
  /** The query succeeded and matched nothing: no `custom_domain` matched the
   *  request host, and the sole-active-tenant fallback is off because more
   *  than one tenant is active. This is where a domain pointed at the
   *  deployment before its tenant row exists lands. */
  | { status: "unresolved" }
  /** The read itself failed. Says nothing about whether a tenant exists.
   *  `code` is PostgREST's error code (`PGRST002` and friends), or empty when
   *  the request never got an answer -- a connection error carries none. It
   *  is optional because no caller but `/api/health` (#1894) needs to say
   *  *why*; everything else only branches on the status. */
  | { status: "unavailable"; code?: string };

/**
 * The tenant the public site is being served for, resolved from the host.
 *
 * `retry: false` turns off postgrest-js's own retries (3, backing off 1s, 2s,
 * 4s, on a network error or a 503 -- which is what `PGRST002` returns). Only
 * `/api/health` (#1894) asks for that: an uptime monitor already retries on
 * its own schedule, and needs the first failure's code within its timeout
 * rather than a fourth attempt's seven seconds later.
 */
export async function getPublicTenant(
  supabase: SupabaseClient,
  { retry = true }: { retry?: boolean } = {},
): Promise<PublicTenantResult> {
  const query = supabase
    .from("public_tenant")
    .select("id, name, slug, custom_domain, plan");
  const { data, error } = await (
    retry ? query : query.retry(false)
  ).maybeSingle();
  if (error) {
    // Loudly: this is the branch that keeps a blip from 404ing the site, so a
    // silent one would look exactly like a correctly-refused unknown host.
    reportQueryError(error, {
      source: "branding.public_tenant",
      message:
        "could not read public_tenant; serving the request rather than 404ing it",
    });
    return { status: "unavailable", code: error.code ?? "" };
  }
  if (!data) return { status: "unresolved" };
  return { status: "resolved", tenant: data as PublicTenant };
}
