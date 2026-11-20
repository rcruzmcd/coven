import "server-only";

import { ImageResponse } from "next/og";
import { StoryFrameView } from "@/app/api/social-posts/[pieceId]/story/[frame]/story-frame-view";
import { loadStoryFonts } from "./story-fonts";
import type { StorySource } from "./story-data";
import { inlineStoryImages } from "./story-data";
import {
  buildStoryFrame,
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryFrameNumber,
} from "./story-frames";

/**
 * One Gear Spotlight frame as a 1080x1920 PNG response (#1908): what the
 * renderer route answers with, and what "Generate story images" (#1909)
 * uploads.
 */
export async function renderStoryFrame(
  source: StorySource,
  frame: StoryFrameNumber,
  requestUrl: string,
  headers?: HeadersInit,
): Promise<ImageResponse> {
  const input = await inlineStoryImages(source, frame, requestUrl);
  const model = buildStoryFrame({
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
