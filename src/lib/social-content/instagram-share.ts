import { personDisplayName } from "@/lib/format";
import type {
  SocialPostMedia,
  SocialPostTag,
  SocialPostTagPerson,
} from "./post-content-actions";

/**
 * Handing a ready post to Instagram from a phone (#1828): the device share
 * sheet takes the media, the caption goes to the clipboard, and the handles
 * Instagram can only take by hand are listed to copy one at a time. Graph API
 * publishing was deferred; see the issue.
 */

/** The part of `navigator` this needs, so tests can stand one in. */
export type ShareNavigator = {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

/**
 * Whether this browser can share files at all, asked with a tiny stand-in so
 * a desktop browser never downloads a post's media just to find out.
 */
export function canShareFiles(nav: ShareNavigator | undefined): boolean {
  if (!nav?.share || !nav.canShare) return false;
  try {
    const probe = new File([new Uint8Array(1)], "probe.jpg", {
      type: "image/jpeg",
    });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** The media that can be shared, in post order, and how many cannot. */
export function shareableMedia(media: SocialPostMedia[]) {
  const ready = media.filter(
    (item): item is SocialPostMedia & { url: string } => item.url !== null,
  );
  return { ready, unavailable: media.length - ready.length };
}

export class ShareMediaError extends Error {
  constructor(
    message: string,
    readonly filename: string,
  ) {
    super(message);
    this.name = "ShareMediaError";
  }
}

/**
 * Fetches each item into a `File`, keeping the post's order. Done ahead of the
 * click: Safari refuses `navigator.share` once the click handler has awaited
 * a network fetch. A file the phone can't hold in memory -- a long video --
 * fails with an error naming it rather than silently.
 */
export async function loadShareFiles(
  media: (SocialPostMedia & { url: string })[],
  fetchImpl: typeof fetch = fetch,
): Promise<File[]> {
  return Promise.all(
    media.map(async (item) => {
      let response: Response;
      try {
        response = await fetchImpl(item.url);
      } catch {
        throw new ShareMediaError(
          `Couldn't download ${item.original_filename}. Check your connection and try again.`,
          item.original_filename,
        );
      }
      if (!response.ok) {
        throw new ShareMediaError(
          `Couldn't download ${item.original_filename} (${response.status}). Close and reopen the post to try again.`,
          item.original_filename,
        );
      }
      try {
        const blob = await response.blob();
        const type = blob.type || fallbackType(item);
        return new File([blob], shareFilename(item.original_filename, type), {
          type,
        });
      } catch {
        throw new ShareMediaError(
          `${item.original_filename} is too large to load on this device. Save it from the post and add it in Instagram by hand.`,
          item.original_filename,
        );
      }
    }),
  );
}

function fallbackType(item: SocialPostMedia) {
  return item.kind === "video" ? "video/mp4" : "image/jpeg";
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

/**
 * The name to share a file under. Photos are resized to JPEG on upload but
 * keep their original name, so `photo.png` may hold a JPEG; the extension is
 * made to match what the file is, which is what a share target goes by.
 */
export function shareFilename(name: string, type: string) {
  const extension = EXTENSIONS[type];
  if (!extension) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const current = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (current === extension || (extension === "jpg" && current === "jpeg")) {
    return name;
  }
  return `${stem}.${extension}`;
}

/** Where a format is found in Instagram's share sheet. */
export function instagramShareTarget(format: string | null) {
  switch (format) {
    case "instagram_post":
      return "Feed";
    case "instagram_reel":
      return "Reels";
    case "instagram_story":
      return "Stories";
    default:
      return null;
  }
}

/**
 * The handles a person still adds by hand in Instagram: collaborators, then
 * tagged people in order. A tagged person with no handle on record is named
 * so they aren't silently left out.
 */
export function shareHandles(
  collaborators: string[],
  tags: SocialPostTag[],
  people: SocialPostTagPerson[],
) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const tagHandles: string[] = [];
  const tagsWithoutHandle: string[] = [];
  for (const tag of tags) {
    if ("handle" in tag) {
      tagHandles.push(tag.handle);
      continue;
    }
    const person = byId.get(tag.personId);
    if (person?.instagram_handle) tagHandles.push(person.instagram_handle);
    else
      tagsWithoutHandle.push(
        personDisplayName(person, "Someone no longer listed"),
      );
  }
  return {
    collaborators,
    tags: [...new Set(tagHandles)],
    tagsWithoutHandle,
  };
}

/** A share the person backed out of is not an error. */
export function isShareCancel(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
