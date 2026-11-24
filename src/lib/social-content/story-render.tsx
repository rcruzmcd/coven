import "server-only";

import { ImageResponse } from "next/og";
import { StoryFrameView } from "@/app/api/social-posts/[pieceId]/story/[frame]/story-frame-view";
import { loadStoryFonts } from "./story-fonts";
import type { StorySource } from "./story-data";
import { inlineStoryImages } from "./story-data";
import { POST_TEMPLATES } from "./post-templates";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type StoryFrameNumber,
} from "./story-frames";

/**
 * One story frame as a 1080x1920 PNG response (#1908), built by the post's
 * template (#1924): what the renderer route answers with, and what "Generate
 * story images" (#1909) uploads.
 */
export async function renderStoryFrame(
  source: StorySource,
  frame: StoryFrameNumber,
  requestUrl: string,
  headers?: HeadersInit,
): Promise<ImageResponse> {
  const input = await inlineStoryImages(source, frame, requestUrl);
  const model = POST_TEMPLATES[source.templateKey].build({
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
