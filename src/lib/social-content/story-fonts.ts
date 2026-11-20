import "server-only";

import type { TypographyFamily, TypographySet } from "@/lib/branding";

/**
 * The tenant's typography as font files, for the story renderer (#1908).
 *
 * Satori (under `ImageResponse`) takes TTF, OTF or WOFF bytes, not CSS
 * `@font-face`, and `next/font` only emits CSS and WOFF2 -- so the families
 * are fetched from Google Fonts' CSS API, which answers a client that does
 * not advertise WOFF2 support with static TrueType files per weight. Every
 * family in `TYPOGRAPHY_SETS` is a Google Fonts family by construction.
 *
 * Cached per family and weight for the life of the function instance, and
 * through the fetch cache across instances, so a tenant's second frame costs
 * no download.
 */

/** The three roles the frames name; Satori matches on these names. */
export const STORY_FONT = {
  heading: "story-heading",
  body: "story-body",
  script: "story-script",
} as const;

type FontWeight = 400 | 500 | 600 | 700;

export type StoryFont = {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
  style: "normal";
};

const FETCH_TIMEOUT_MS = 8000;
const cache = new Map<string, Promise<ArrayBuffer | null>>();

function cssUrl(family: TypographyFamily, weight: FontWeight | null): string {
  const name = family.name.replaceAll(" ", "+");
  // A single-weight family (Rock Salt) has no weight axis to ask for, and the
  // API refuses the request if one is named.
  return weight === null
    ? `https://fonts.googleapis.com/css2?family=${name}`
    : `https://fonts.googleapis.com/css2?family=${name}:wght@${weight}`;
}

/** The TrueType file the stylesheet points at, or null. Exported for tests. */
export function truetypeUrl(css: string): string | null {
  const match = css.match(
    /src:\s*url\((https:\/\/[^)]+)\)\s*format\('truetype'\)/,
  );
  return match?.[1] ?? null;
}

async function download(url: string): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "force-cache",
  });
}

function loadFile(
  family: TypographyFamily,
  weight: FontWeight | null,
): Promise<ArrayBuffer | null> {
  const key = `${family.name}:${weight ?? "default"}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const css = await download(cssUrl(family, weight));
        if (!css.ok) return null;
        const url = truetypeUrl(await css.text());
        if (!url) return null;
        const file = await download(url);
        return file.ok ? await file.arrayBuffer() : null;
      } catch (error) {
        console.error(`Could not load the ${family.name} font`, error);
        return null;
      }
    })();
    // A failure is not cached: the next frame tries again.
    pending.then((data) => {
      if (!data) cache.delete(key);
    });
    cache.set(key, pending);
  }
  return pending;
}

/**
 * The fonts a story frame is set in. A set with no script accent sets the
 * script lines in its heading face. A family that fails to load is left out,
 * and Satori falls back to its own default for that role rather than failing
 * the image.
 */
export async function loadStoryFonts(
  typography: TypographySet,
): Promise<StoryFont[]> {
  const wanted: {
    name: string;
    family: TypographyFamily;
    weight: FontWeight;
    request: FontWeight | null;
  }[] = [
    ...([600, 700] as const).map((weight) => ({
      name: STORY_FONT.heading,
      family: typography.heading,
      weight,
      request: weight,
    })),
    ...([500, 600, 700] as const).map((weight) => ({
      name: STORY_FONT.body,
      family: typography.sans,
      weight,
      request: weight,
    })),
    typography.accent
      ? {
          name: STORY_FONT.script,
          family: typography.accent,
          weight: 400 as const,
          request: null,
        }
      : {
          name: STORY_FONT.script,
          family: typography.heading,
          weight: 600 as const,
          request: 600 as const,
        },
  ];
  const files = await Promise.all(
    wanted.map((font) => loadFile(font.family, font.request)),
  );
  return wanted.flatMap((font, index) => {
    const data = files[index];
    return data
      ? [{ name: font.name, data, weight: font.weight, style: "normal" }]
      : [];
  });
}
