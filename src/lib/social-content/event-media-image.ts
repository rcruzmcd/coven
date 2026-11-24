import "server-only";

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { EVENT_MEDIA_BUCKET } from "@/lib/storage/event-media-files";
import type { DrawnImage } from "./event-post-frames";

/**
 * An event photo made ready to draw (#1926), with sharp: turned upright, cut
 * down to what a 1080px frame can use, re-encoded as JPEG (Satori draws PNG
 * and JPEG only, and a phone may upload HEIC or WebP), and its dominant
 * colour read -- the colour the event templates paint a flyer's bands with.
 */

/** Longest side kept: a 1080px frame never needs more. */
const MAX_SIDE = 1600;
/** Event media is uploaded up to 50 MB; a flyer's thumbnail is far less. */
const MAX_BYTES = 50 * 1024 * 1024;

export type PreparedImage = DrawnImage & { color: string };

function hex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

/** `{ r, g, b }` as `#rrggbb`. */
export function colorHex(rgb: { r: number; g: number; b: number }): string {
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}

export async function prepareImage(
  bytes: ArrayBuffer | Buffer,
): Promise<PreparedImage> {
  const { data, info } = await sharp(Buffer.from(bytes as ArrayBuffer))
    .rotate()
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 86 })
    .toBuffer({ resolveWithObject: true });
  const { dominant } = await sharp(data).stats();
  return {
    src: `data:image/jpeg;base64,${data.toString("base64")}`,
    width: info.width,
    height: info.height,
    color: colorHex(dominant),
  };
}

/**
 * An event photo from its bucket, prepared; null when it can't be read. The
 * caller has already checked the row is the post's tenant's.
 */
export async function readEventMediaImage(
  admin: SupabaseClient<Database>,
  path: string,
): Promise<PreparedImage | null> {
  try {
    const { data, error } = await admin.storage
      .from(EVENT_MEDIA_BUCKET)
      .download(path);
    if (error || !data || data.size === 0 || data.size > MAX_BYTES) {
      return null;
    }
    return await prepareImage(await data.arrayBuffer());
  } catch (error) {
    console.error("Could not read an event photo for a post template", error);
    return null;
  }
}
