import "server-only";

import { ImageResponse } from "next/og";
import { loadRemoteIcon } from "@/app/api/app-icon/[size]/icon-source";
import { EventPostView } from "@/app/api/social-posts/[pieceId]/story/[frame]/event-post-view";
import { StoryFrameView } from "@/app/api/social-posts/[pieceId]/story/[frame]/story-frame-view";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadStoryFonts } from "./story-fonts";
import type { EventPostSource } from "./event-post-data";
import {
  buildEventPostFrame,
  SPONSOR_TILE_LIMIT,
  type DrawnImage,
} from "./event-post-frames";
import { readEventMediaImage } from "./event-media-image";
import { resolveImageUrl } from "@/lib/inventory";
import type { StorySource } from "./story-data";
import { inlineStoryImages, isEventSource } from "./story-data";
import { GEAR_SPOTLIGHT } from "./post-templates";
import { STORY_HEIGHT, STORY_WIDTH, parseStoryFrame } from "./story-frames";

/**
 * One frame of a post's template as a PNG response (#1908), built by the
 * post's template (#1924): a 1080x1920 story, or for an event template
 * (#1926) a story or a 1080x1350 post. What the renderer route answers with,
 * and what "Generate images" (#1909) uploads.
 */
export async function renderStoryFrame(
  source: StorySource,
  frame: number,
  requestUrl: string,
  headers?: HeadersInit,
): Promise<ImageResponse> {
  if (isEventSource(source)) {
    return renderEventPost(source, frame, requestUrl, headers);
  }
  const gearFrame = parseStoryFrame(String(frame));
  if (!gearFrame) throw new Error(`Gear Spotlight has no frame ${frame}`);
  const input = await inlineStoryImages(source, gearFrame, requestUrl);
  const model = GEAR_SPOTLIGHT.build({
    ...input,
    frame: gearFrame,
    headingTracking: source.typography.headingTracking,
  });
  const fonts = await loadStoryFonts(source.typography);
  return new ImageResponse(<StoryFrameView model={model} />, {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    fonts,
    headers,
  });
}

/**
 * The photo is read from the event-media bucket with the service role: the
 * source holds only rows already filtered by the post's tenant. A flyer that
 * can't be read draws the brand layout rather than fail the image.
 */
async function renderEventPost(
  source: EventPostSource,
  frame: number,
  requestUrl: string,
  headers?: HeadersInit,
): Promise<ImageResponse> {
  const admin = createSupabaseAdminClient();
  const [image, photos, sponsors, logo, fonts] = await Promise.all([
    source.photo ? readEventMediaImage(admin, source.photo.path) : null,
    recapImages(source, frame),
    sponsorImages(source, requestUrl),
    loadRemoteIcon(source.branding.logoUrl, requestUrl),
    loadStoryFonts(source.typography),
  ]);
  const isFlyer = Boolean(image && source.photo?.isFlyer);
  const model = buildEventPostFrame({
    kind: source.kind,
    format: source.format,
    event: source.event,
    text: source.values,
    frame,
    photos,
    sponsors,
    flyer:
      image && isFlyer
        ? { ...image, color: source.photo?.color ?? image.color }
        : null,
    photo: image && !isFlyer ? image : null,
    now: source.now,
    branding: { ...source.branding, logoUrl: logo },
    headingTracking: source.typography.headingTracking,
    orgName: source.orgName,
  });
  return new ImageResponse(<EventPostView model={model} />, {
    width: model.box.width,
    height: model.box.height,
    fonts,
    headers,
  });
}

/**
 * A recap's photos for one frame (#1927): a story's collage of up to four,
 * a post's cover photo, or the one photo a later carousel slide shows. A
 * photo that can't be read is left out rather than fail the image.
 */
async function recapImages(
  source: EventPostSource,
  frame: number,
): Promise<DrawnImage[]> {
  if (source.kind !== "recap") return [];
  const wanted =
    frame > 1
      ? source.photos.slice(frame - 1, frame)
      : source.photos.slice(0, source.format === "story" ? 4 : 1);
  const admin = createSupabaseAdminClient();
  const images = await Promise.all(
    wanted.map((photo) => readEventMediaImage(admin, photo.path)),
  );
  return images.flatMap((image) => (image ? [image] : []));
}

/**
 * A sponsor thank-you's sponsors (#1927), with the logos the frame shows
 * inlined. A dead logo link draws the sponsor's name instead.
 */
async function sponsorImages(
  source: EventPostSource,
  requestUrl: string,
): Promise<{ name: string; logo: string | null }[]> {
  if (source.kind !== "sponsors") return [];
  const sponsors = source.event.sponsors ?? [];
  return Promise.all(
    sponsors.map(async (sponsor, i) => ({
      name: sponsor.name,
      logo:
        source.values.sponsorLogos && i < SPONSOR_TILE_LIMIT
          ? await loadRemoteIcon(resolveImageUrl(sponsor.logo_url), requestUrl)
          : null,
    })),
  );
}
