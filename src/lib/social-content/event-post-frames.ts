import type { Branding } from "@/lib/branding";
import type { EventTemplateValues } from "./post-templates";
import {
  fitText,
  readableOn,
  STORY_HEIGHT,
  STORY_SAFE_BOTTOM,
  STORY_SAFE_TOP,
  STORY_WIDTH,
  storyTheme,
  type FittedText,
  type StoryTheme,
} from "./story-frames";

/**
 * The event templates (#1926, #1927) -- announcement, reminder, recap and
 * sponsor thank-you: what a frame shows, in a story or a 4:5 post. Pure, like `story-frames.ts`;
 * `event-post-view.tsx` draws the result and decides nothing.
 *
 * Flyer first. An event's flyer is designer-made and different every time, so
 * with one the frame is the flyer, fitted whole and never cropped, on bands of
 * its own dominant colour; the bands carry the few words the template adds.
 * Without one it is the tenant's brand: title, date, place and a photo.
 */

export const POST_WIDTH = 1080;
export const POST_HEIGHT = 1350;

export type EventPostKind = "announcement" | "reminder" | "recap" | "sponsors";
export type EventPostFormat = "story" | "post";

/** Where a format's frame may put anything, and how much room it has. */
export type FrameBox = {
  width: number;
  height: number;
  /** Kept clear at the top and bottom: Instagram's bars on a story. */
  padTop: number;
  padBottom: number;
  side: number;
};

export function frameBox(format: EventPostFormat): FrameBox {
  return format === "story"
    ? {
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        padTop: STORY_SAFE_TOP,
        padBottom: STORY_SAFE_BOTTOM,
        side: 72,
      }
    : // The grid shows a 4:5 post cropped to 3:4, about 34px off each side;
      // the 72px side margin keeps every word inside that.
      {
        width: POST_WIDTH,
        height: POST_HEIGHT,
        padTop: 64,
        padBottom: 64,
        side: 72,
      };
}

/* ------------------------------------------------------------------------ */
/* When                                                                      */
/* ------------------------------------------------------------------------ */

/** The calendar date of an instant in `timeZone`, as days since the epoch. */
function dayNumber(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return Math.round(Date.parse(`${parts}T00:00:00Z`) / 86_400_000);
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/**
 * When the event is, said from `now`, both read in the event's own zone:
 * "Today", "Tomorrow", "This Saturday" within the week, "Next Saturday" the
 * week after, and the date beyond that or once it has passed.
 */
export function relativeDay(
  startsAt: string,
  timeZone: string,
  now: Date,
): string {
  const zone = safeZone(timeZone);
  const start = new Date(startsAt);
  const days = dayNumber(start, zone) - dayNumber(now, zone);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
  }).format(start);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days >= 2 && days <= 6) return `This ${weekday}`;
  if (days >= 7 && days <= 13) return `Next ${weekday}`;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(start);
}

/** "Sat, Dec 6 · 6:00 PM MST": in the event's zone, and labelled with it. */
export function eventWhenLine(startsAt: string, timeZone: string): string {
  const zone = safeZone(timeZone);
  const start = new Date(startsAt);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(start);
  return `${date} · ${time}`;
}

/* ------------------------------------------------------------------------ */
/* Input and model                                                           */
/* ------------------------------------------------------------------------ */

/** The event, as the templates read it: only what its public page shows. */
export type EventPostRecord = {
  name: string;
  starts_at: string;
  timezone: string;
  location: string | null;
  registration_enabled: boolean;
  /** The event has a flyer; it decides the options' defaults. */
  has_flyer: boolean;
  /** The tenant's public host, e.g. "chattersnow.org". */
  host: string;
  /**
   * How many people were checked in, party sizes counted (#1927). Read for a
   * recap only, so no other template goes out of date as people check in.
   */
  attended?: number;
  /**
   * The sponsors credited publicly on the event, by name (#1927). Read for a
   * sponsor thank-you only. Sponsors, never donors.
   */
  sponsors?: EventSponsor[];
};

export type EventSponsor = { name: string; logo_url: string | null };

/** A photo fetched for drawing: a data URL and its size in pixels. */
export type DrawnImage = {
  src: string;
  width: number;
  height: number;
};

export type EventPostInput = {
  kind: EventPostKind;
  format: EventPostFormat;
  event: EventPostRecord;
  /** The template's words and options, after the post's typed text. */
  text: EventTemplateValues;
  /** Which frame: a recap post's carousel has one per photo (#1927). */
  frame?: number;
  /**
   * A recap's photos for this frame (#1927): the cover's, or the one photo
   * a carousel slide shows.
   */
  photos?: DrawnImage[];
  /** A sponsor thank-you's sponsors, their logos inlined or null (#1927). */
  sponsors?: { name: string; logo: string | null }[];
  /**
   * The flyer, when the post shows it, with its dominant colour; or null for
   * the brand layout.
   */
  flyer: (DrawnImage & { color: string }) | null;
  /** The brand layout's event photo, or null to let the words fill the frame. */
  photo: DrawnImage | null;
  /** When the image is made, for the reminder's "Tomorrow". */
  now: Date;
  branding: Branding;
  headingTracking: string;
  orgName: string;
};

/** The flyer, the words above and below it, on its own colour. */
export type FlyerLayout = {
  layout: "flyer";
  band: string;
  /** Text on the band: black or white, whichever reads (`readableOn`). */
  bandText: string;
  /** The flyer's drawn size, fitted whole between the bands. */
  flyer: DrawnImage;
  /** Small, or left out. */
  logoUrl: string | null;
  /** The reminder's "Tomorrow"; null on an announcement. */
  when: FittedText | null;
  line: FittedText | null;
  details: string[];
  cta: FittedText | null;
};

/** The tenant's brand: no flyer to frame. */
export type BrandLayout = {
  layout: "brand";
  theme: StoryTheme;
  logoUrl: string | null;
  orgName: string;
  /** "Tomorrow" on a reminder, "Coming up" on an announcement. */
  eyebrow: string;
  photo: DrawnImage | null;
  /** The photo's height. */
  photoHeight: number;
  title: FittedText;
  /** The template's line, when it says more than the title. */
  line: FittedText | null;
  details: string[];
  cta: FittedText | null;
};

/** A recap's cover (#1927): the words over a collage of its photos. */
export type RecapLayout = {
  layout: "recap";
  theme: StoryTheme;
  logoUrl: string | null;
  orgName: string;
  /** "Recap" and the event's date. */
  eyebrow: string;
  title: FittedText;
  line: FittedText | null;
  /** "120 people came", when switched on and anyone was checked in. */
  attendance: string | null;
  /** One to four, laid out by the view by how many. */
  photos: DrawnImage[];
  photosHeight: number;
};

/** A recap carousel's later slide: one photo, filling the frame. */
export type SlideLayout = { layout: "slide"; photo: DrawnImage };

export type SponsorTile = {
  /** Shown when there is no logo, or logos are switched off. */
  name: FittedText;
  logo: string | null;
};

/** A sponsor thank-you (#1927): the line, the event, and a tile each. */
export type SponsorsLayout = {
  layout: "sponsors";
  theme: StoryTheme;
  logoUrl: string | null;
  orgName: string;
  eyebrow: string;
  title: FittedText;
  tiles: SponsorTile[];
  columns: number;
  tileWidth: number;
  tileHeight: number;
  /** Sponsors past the tiles the frame holds: "and N more". */
  more: number;
};

export type EventPostModel = {
  box: FrameBox;
  frame: FlyerLayout | BrandLayout | RecapLayout | SlideLayout | SponsorsLayout;
};

/* ------------------------------------------------------------------------ */
/* Building a frame                                                          */
/* ------------------------------------------------------------------------ */

/** The gap between the flyer and the words above and below it. */
export const FLYER_GAP = 40;
/** The small logo above a flyer, and the brand layout's. */
export const FLYER_LOGO_HEIGHT = 64;
export const BRAND_LOGO_HEIGHT = 96;

/** Rough heights of a fitted text block and a details line, for the flyer's room. */
const lineHeight = (size: number) => Math.ceil(size * 1.15);

function blockHeight(text: FittedText | null, width: number): number {
  if (!text) return 0;
  const lines = Math.max(
    1,
    Math.ceil((text.text.length * text.fontSize * 0.56) / width),
  );
  return lines * lineHeight(text.fontSize);
}

/** Lays the words out in a column; the gaps between present ones only. */
function stackHeight(heights: number[], gap: number): number {
  const present = heights.filter((h) => h > 0);
  if (present.length === 0) return 0;
  return present.reduce((a, b) => a + b, 0) + gap * (present.length - 1);
}

/** `image` scaled to fit `width` x `height` whole, never cropped. */
export function fitWhole(
  image: DrawnImage,
  width: number,
  height: number,
): DrawnImage {
  const scale = Math.min(width / image.width, height / image.height);
  return {
    src: image.src,
    width: Math.max(1, Math.floor(image.width * scale)),
    height: Math.max(1, Math.floor(image.height * scale)),
  };
}

function detailsLines(input: EventPostInput): string[] {
  if (!input.text.details) return [];
  const location = input.event.location?.trim().replace(/\s+/g, " ") ?? "";
  return [
    eventWhenLine(input.event.starts_at, input.event.timezone),
    ...(location ? [location] : []),
  ];
}

function flyerFrame(
  input: EventPostInput,
  flyer: DrawnImage & { color: string },
  box: FrameBox,
): FlyerLayout {
  const width = box.width - 2 * box.side;
  const when =
    input.kind === "reminder"
      ? fitText(
          relativeDay(input.event.starts_at, input.event.timezone, input.now),
          {
            width,
            maxSize: box.height > POST_HEIGHT ? 104 : 88,
            minSize: 64,
            maxLines: 1,
          },
        )
      : null;
  const line = input.text.line
    ? fitText(input.text.line, {
        width,
        maxSize: input.kind === "reminder" ? 48 : 64,
        minSize: 36,
        maxLines: 2,
      })
    : null;
  const cta = input.text.cta
    ? fitText(input.text.cta, { width, maxSize: 44, minSize: 32, maxLines: 1 })
    : null;
  const details = detailsLines(input);
  const logoUrl = input.text.logo ? input.branding.logoUrl : null;

  const above = stackHeight(
    [
      logoUrl ? FLYER_LOGO_HEIGHT : 0,
      blockHeight(when, width),
      blockHeight(line, width),
    ],
    16,
  );
  const below = stackHeight(
    [details.length * lineHeight(34), blockHeight(cta, width)],
    16,
  );
  const room =
    box.height -
    box.padTop -
    box.padBottom -
    above -
    below -
    (above ? FLYER_GAP : 0) -
    (below ? FLYER_GAP : 0);

  return {
    layout: "flyer",
    band: flyer.color,
    bandText: readableOn(flyer.color, []),
    // The flyer may run to the frame's edges sideways: it's the design.
    flyer: fitWhole(flyer, box.width - 2 * 24, Math.max(200, room)),
    logoUrl,
    when,
    line,
    details,
    cta,
  };
}

function brandFrame(input: EventPostInput, box: FrameBox): BrandLayout {
  const width = box.width - 2 * box.side;
  const theme = storyTheme(input.branding, null, input.headingTracking);
  const name = input.event.name.trim().replace(/\s+/g, " ");
  const story = box.height > POST_HEIGHT;
  // Without a photo the title has the room to itself.
  const title = fitText(name, {
    width,
    maxSize: (story ? 96 : 80) + (input.photo ? 0 : 24),
    minSize: 52,
    maxLines: 3,
  });
  const lineText = input.text.line.trim();
  const line =
    lineText && lineText.toLowerCase() !== name.toLowerCase()
      ? fitText(lineText, { width, maxSize: 44, minSize: 32, maxLines: 2 })
      : null;
  return {
    layout: "brand",
    theme,
    logoUrl: input.text.logo ? input.branding.logoUrl : null,
    orgName: input.orgName,
    eyebrow:
      input.kind === "reminder"
        ? relativeDay(input.event.starts_at, input.event.timezone, input.now)
        : "Coming up",
    photo: input.photo,
    // A post has less height to give; a story's photo is the bigger share.
    photoHeight: story ? 720 : 440,
    title,
    line,
    details: detailsLines(input),
    cta: input.text.cta
      ? fitText(input.text.cta, {
          width,
          maxSize: 40,
          minSize: 30,
          maxLines: 1,
        })
      : null,
  };
}

/** "120 people came", or null with no one checked in. */
export function attendanceLine(attended: number | undefined): string | null {
  if (!attended || attended < 1) return null;
  return attended === 1
    ? "1 person came"
    : `${attended.toLocaleString("en-US")} people came`;
}

/** "Saturday, December 6", in the event's zone. */
function eventDate(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(timeZone),
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(startsAt));
}

function recapFrame(input: EventPostInput, box: FrameBox): RecapLayout {
  const width = box.width - 2 * box.side;
  const story = box.height > POST_HEIGHT;
  const photos = (input.photos ?? []).slice(0, 4);
  const name = input.event.name.trim().replace(/\s+/g, " ");
  const lineText = input.text.line.trim();
  return {
    layout: "recap",
    theme: storyTheme(input.branding, null, input.headingTracking),
    logoUrl: input.text.logo ? input.branding.logoUrl : null,
    orgName: input.orgName,
    eyebrow: `Recap · ${eventDate(input.event.starts_at, input.event.timezone)}`,
    title: fitText(name, {
      width,
      maxSize: (story ? 88 : 72) + (photos.length ? 0 : 24),
      minSize: 48,
      maxLines: 3,
    }),
    line: lineText
      ? fitText(lineText, { width, maxSize: 44, minSize: 32, maxLines: 2 })
      : null,
    attendance: input.text.attendance
      ? attendanceLine(input.event.attended)
      : null,
    photos,
    // A story's collage is most of the frame; a post's cover leaves the
    // words their room.
    photosHeight: story ? 900 : 560,
  };
}

/** Columns for `n` sponsor tiles: one, two up to four, three beyond. */
export function sponsorColumns(n: number): number {
  if (n <= 1) return 1;
  return n <= 4 ? 2 : 3;
}

export const SPONSOR_TILE_GAP = 24;
/** Sponsor tiles a frame holds; past it, "and N more". */
export const SPONSOR_TILE_LIMIT = 12;

function sponsorsFrame(input: EventPostInput, box: FrameBox): SponsorsLayout {
  const width = box.width - 2 * box.side;
  const story = box.height > POST_HEIGHT;
  const all = input.sponsors ?? [];
  const shown = all.slice(0, SPONSOR_TILE_LIMIT);
  const columns = sponsorColumns(shown.length);
  const rows = Math.max(1, Math.ceil(shown.length / columns));
  const tileWidth = Math.floor(
    (width - (columns - 1) * SPONSOR_TILE_GAP) / columns,
  );
  // The room under the header and the line, split between the rows.
  const area = story ? 1000 : 640;
  const tileHeight = Math.min(
    columns === 1 ? 320 : 240,
    Math.floor((area - (rows - 1) * SPONSOR_TILE_GAP) / rows),
  );
  return {
    layout: "sponsors",
    theme: storyTheme(input.branding, null, input.headingTracking),
    logoUrl: input.text.logo ? input.branding.logoUrl : null,
    orgName: input.orgName,
    eyebrow: input.event.name.trim().replace(/\s+/g, " "),
    title: fitText(input.text.line.trim() || "Thank you", {
      width,
      maxSize: story ? 88 : 72,
      minSize: 48,
      maxLines: 2,
    }),
    tiles: shown.map((sponsor) => ({
      name: fitText(sponsor.name.trim().replace(/\s+/g, " "), {
        width: tileWidth - 40,
        maxSize: columns === 1 ? 56 : 40,
        minSize: 22,
        maxLines: 2,
      }),
      logo: input.text.sponsorLogos ? sponsor.logo : null,
    })),
    columns,
    tileWidth,
    tileHeight,
    more: all.length - shown.length,
  };
}

/** What an event template's frame shows. */
export function buildEventPostFrame(input: EventPostInput): EventPostModel {
  const box = frameBox(input.format);
  if (input.kind === "recap") {
    const slide = (input.frame ?? 1) > 1 ? input.photos?.[0] : undefined;
    return {
      box,
      frame: slide ? { layout: "slide", photo: slide } : recapFrame(input, box),
    };
  }
  if (input.kind === "sponsors") {
    return { box, frame: sponsorsFrame(input, box) };
  }
  return {
    box,
    frame: input.flyer
      ? flyerFrame(input, input.flyer, box)
      : brandFrame(input, box),
  };
}
