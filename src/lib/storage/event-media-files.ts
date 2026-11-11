/**
 * The private `event-media` bucket created by 20261020130000 (#1606).
 *
 * Photos are re-encoded in the browser and go up in one request; videos go up
 * by resumable (TUS) upload, because a phone records 100-400 MB a minute and a
 * single request that drops at 90% would start again from nothing. Both go to
 * a signed upload token minted with the uploader's own session, so the
 * bucket's insert policy decides who may upload.
 */
export const EVENT_MEDIA_BUCKET = "event-media";

/** Matching the bucket's own `file_size_limit`: 10 GiB. */
export const EVENT_MEDIA_MAX_BYTES = 10 * 1024 * 1024 * 1024;

/** Longest edge of a stored photo: full-screen on a laptop, a few hundred KB. */
export const EVENT_PHOTO_MAX_EDGE = 2048;

/** Supabase's resumable endpoint takes exactly 6 MB chunks. */
export const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

export type EventMediaKind = "photo" | "video";

export type EventMediaContentType =
  | "video/mp4"
  | "video/quicktime"
  | "video/webm"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

const VIDEO_TYPES: Record<string, EventMediaContentType> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const EXTENSIONS: Record<EventMediaContentType, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Photos an upload link stores byte for byte (#1620); anything else is converted. */
const ORIGINAL_PHOTO_TYPES: Record<string, EventMediaContentType> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

/** What a picked file will be stored as. */
export type EventMediaPlan = {
  kind: EventMediaKind;
  contentType: EventMediaContentType;
  extension: string;
  /** Uploaded as picked, with a thumbnail beside it; see `keepOriginals`. */
  original?: true;
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * The type a photo is stored under byte for byte by an upload link (#1620), or
 * undefined when the bucket cannot take it as picked and it must be converted.
 */
export function storedAsPickedType(
  file: Pick<File, "name" | "type">,
): EventMediaContentType | undefined {
  const type = file.type.toLowerCase();
  if (type !== "" && type !== "application/octet-stream") {
    return ORIGINAL_PHOTO_TYPES[type];
  }
  return ORIGINAL_PHOTO_TYPES[extensionOf(file.name)];
}

/**
 * What a picked file will be stored as, or why it can't be.
 *
 * Read from the declared type and, where a browser leaves that blank (a .mov
 * on Windows, HEIC almost everywhere), the extension. A photo is stored as
 * WebP when it was a PNG or WebP -- `compressImage` keeps transparency that
 * way -- and as JPEG otherwise, HEIC included. Advisory: the bucket's
 * `allowed_mime_types` and `file_size_limit` are what refuse, and the server
 * action runs this again before minting a token.
 *
 * `keepOriginals` is an upload link's rule (#1620): a photographer's JPEG, PNG
 * or WebP is stored exactly as delivered, at full resolution, and gets a
 * thumbnail for the gallery. Anything else (HEIC) the bucket cannot store, so
 * it is still converted to JPEG -- at full size, with a thumbnail too.
 */
export function planEventMediaFile(
  file: Pick<File, "name" | "type" | "size">,
  { keepOriginals = false }: { keepOriginals?: boolean } = {},
): EventMediaPlan | { error: string } {
  const extension = extensionOf(file.name);
  const type = file.type.toLowerCase();

  const videoType = (Object.values(VIDEO_TYPES) as string[]).includes(type)
    ? (type as EventMediaContentType)
    : type === "" || type === "application/octet-stream"
      ? VIDEO_TYPES[extension]
      : undefined;
  if (videoType) {
    if (file.size > EVENT_MEDIA_MAX_BYTES) {
      return { error: `${file.name} is larger than 10 GB.` };
    }
    return {
      kind: "video",
      contentType: videoType,
      extension: EXTENSIONS[videoType],
    };
  }

  if (
    type.startsWith("image/") ||
    ((type === "" || type === "application/octet-stream") &&
      IMAGE_EXTENSIONS.has(extension))
  ) {
    if (keepOriginals) {
      const contentType = storedAsPickedType(file) ?? "image/jpeg";
      if (file.size > EVENT_MEDIA_MAX_BYTES) {
        return { error: `${file.name} is larger than 10 GB.` };
      }
      return {
        kind: "photo",
        contentType,
        extension: EXTENSIONS[contentType],
        original: true,
      };
    }
    const keepsAlpha =
      type === "image/png" ||
      type === "image/webp" ||
      extension === "png" ||
      extension === "webp";
    const contentType = keepsAlpha ? "image/webp" : "image/jpeg";
    return { kind: "photo", contentType, extension: EXTENSIONS[contentType] };
  }

  if (type.startsWith("video/")) {
    return {
      error: `${file.name} is a video format that can't be played here. Use MP4, MOV or WebM.`,
    };
  }
  return { error: `${file.name} is not a photo or a video.` };
}

/** A signed upload slot minted by `createEventMediaUploadSlotsAction`. */
export type EventMediaSlot = {
  path: string;
  token: string;
  kind: EventMediaKind;
  contentType: EventMediaContentType;
  /** An original photo's thumbnail slot (#1620), at `eventMediaThumbPath(path)`. */
  thumbToken?: string;
  /**
   * The bucket the slot was minted in, when it is not `event-media` -- a
   * social post's media (#1826) goes through the same uploader.
   */
  bucket?: string;
};

/**
 * `{tenant uuid}/{event uuid}/{uuid}.{ext}` -- the shape the bucket's policy
 * and `event_media_path_event_id()` accept.
 */
export function eventMediaPath(
  tenantId: string,
  eventId: string,
  extension: string,
): string {
  return `${tenantId}/${eventId}/${crypto.randomUUID()}.${extension}`;
}

/**
 * Where an original photo's 2048px JPEG thumbnail goes (#1620): beside it, as
 * `{uuid}-thumb.jpg`. `record_event_media_by_link()` derives the same path
 * rather than taking one from the client.
 */
export function eventMediaThumbPath(path: string): string {
  return path.replace(/\.[a-z0-9]+$/, "-thumb.jpg");
}

/**
 * A signed read URL that saves as `filename` rather than playing in the tab
 * (#1607). Storage answers `download=` with a Content-Disposition header; the
 * parameter sits outside the signed token, which is why one signature serves
 * both the thumbnail and its download.
 */
export function eventMediaDownloadUrl(
  signedUrl: string,
  filename: string,
): string {
  const url = new URL(signedUrl);
  url.searchParams.set("download", filename);
  return url.toString();
}

/**
 * How long a signed read URL lasts: an hour, as for documents (#1489). Long
 * enough to look through an event's photos or watch a clip, short enough that
 * a copied link is not a way to hand footage on. Never stored.
 */
export const EVENT_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * A URL held with less than this left is signed afresh on the next load, so
 * the lightbox and downloads never reach for one that has run out.
 */
export const EVENT_MEDIA_URL_RENEW_MS = 10 * 60 * 1000;

type SignedMediaUrls = {
  id: string;
  url: string | null;
  display_url: string | null;
  download_url: string | null;
};

/**
 * Merges a fresh load into the rows already on screen (#1653). Every load
 * signs every path again, and a new signature is a new `src`, so the browser
 * would fetch each thumbnail again; a row whose URLs still have
 * EVENT_MEDIA_URL_RENEW_MS to run keeps them instead. `next` decides which
 * rows exist and everything else about them. `signedAt` is when a row's URLs
 * were signed: for the fresh ones, when the request went out.
 */
export function keepSignedUrls<T extends SignedMediaUrls>(
  held: readonly (T & { signedAt: number })[],
  next: readonly T[],
  signedAt: number,
  now: number = Date.now(),
): (T & { signedAt: number })[] {
  const byId = new Map(held.map((row) => [row.id, row]));
  return next.map((row) => {
    const prior = byId.get(row.id);
    const stillGood =
      prior?.url &&
      prior.signedAt + EVENT_MEDIA_SIGNED_URL_TTL_SECONDS * 1000 - now >
        EVENT_MEDIA_URL_RENEW_MS;
    if (!prior || !stillGood) return { ...row, signedAt };
    return {
      ...row,
      url: prior.url,
      display_url: prior.display_url,
      download_url: prior.download_url,
      signedAt: prior.signedAt,
    };
  });
}

/**
 * How long a tenant may keep event media after the event (#1608): the periods
 * the Media sheet offers. `set_event_media_retention_days()` takes any whole
 * number from 30 to 3650; null is "keep indefinitely", which is also where
 * every tenant starts.
 */
export const EVENT_MEDIA_RETENTION_PRESETS = [30, 90, 180, 365, 730, 1825];

/** The Media card lists what expires this soon, so it can be downloaded first. */
export const EVENT_MEDIA_EXPIRY_WARNING_DAYS = 14;

export function eventMediaRetentionLabel(days: number | null): string {
  if (days === null) return "Keep indefinitely";
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} ${years === 1 ? "year" : "years"} after the event`;
  }
  return `${days} days after the event`;
}

/**
 * Whether a file's expiry falls inside the warning window. A date already
 * past counts too: the purge runs once a day, so it is still there until then.
 */
export function eventMediaExpiresSoon(
  expiresAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return (
    Number.isFinite(at) &&
    at - now.getTime() <= EVENT_MEDIA_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000
  );
}
