import "server-only";

import { ImageResponse } from "next/og";
import { loadRemoteIcon } from "@/app/api/app-icon/[size]/icon-source";
import { EventPostView } from "@/app/api/social-posts/[pieceId]/story/[frame]/event-post-view";
import { StoryFrameView } from "@/app/api/social-posts/[pieceId]/story/[frame]/story-frame-view";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadStoryFonts } from "./story-fonts";
import type { EventPostSource } from "./event-post-data";
import { buildEventPostFrame } from "./event-post-frames";
import { readEventMediaImage } from "./event-media-image";
import type { StorySource } from "./story-data";
import { inlineStoryImages, isEventSource } from "./story-data";
import { GEAR_SPOTLIGHT } from "./post-templates";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryFrameNumber,
} from "./story-frames";

/**
 * One frame of a post's template as a PNG response (#1908), built by the
 * post's template (#1924): a 1080x1920 story, or for an event template
 * (#1926) a story or a 1080x1350 post. What the renderer route answers with,
 * and what "Generate images" (#1909) uploads.
 */
export async function renderStoryFrame(
  source: StorySource,
  frame: StoryFrameNumber,
  requestUrl: string,
  headers?: HeadersInit,
): Promise<ImageResponse> {
  if (isEventSource(source)) {
    return renderEventPost(source, requestUrl, headers);
  }
  const input = await inlineStoryImages(source, frame, requestUrl);
  const model = GEAR_SPOTLIGHT.build({
    ...input,
    frame,
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
  requestUrl: string,
  headers?: HeadersInit,
): Promise<ImageResponse> {
  const [image, logo, fonts] = await Promise.all([
    source.photo
      ? readEventMediaImage(createSupabaseAdminClient(), source.photo.path)
      : null,
    loadRemoteIcon(source.branding.logoUrl, requestUrl),
    loadStoryFonts(source.typography),
  ]);
  const isFlyer = Boolean(image && source.photo?.isFlyer);
  const model = buildEventPostFrame({
    kind: source.kind,
    format: source.format,
    event: source.event,
    text: source.values,
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
