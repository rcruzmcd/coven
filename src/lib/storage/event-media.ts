import { Upload } from "tus-js-client";
import { compressImage } from "./compress-image";
import { putToSignedUrl } from "./signed-upload";
import {
  EVENT_MEDIA_BUCKET,
  EVENT_PHOTO_MAX_EDGE,
  TUS_CHUNK_SIZE,
  eventMediaThumbPath,
  storedAsPickedType,
  type EventMediaSlot,
} from "./event-media-files";

/**
 * The browser half of event media (#1606): the uploads themselves. What a file
 * is stored as, and where, is `event-media-files.ts`, which the server action
 * shares.
 */

export type EventMediaUploadResult = { ok: true } | { error: string };

export function uploadErrorFor(name: string, status: number): string {
  if (status === 413) return `${name} is larger than the upload limit.`;
  if (status === 415 || status === 422) {
    return `${name} is not a type that can be stored here.`;
  }
  if (status === 401 || status === 403) {
    return `You don't have permission to upload to this event.`;
  }
  if (status === 0) return `${name} stopped uploading. Check your connection.`;
  return `${name} could not be uploaded. Try again.`;
}

/**
 * Re-encodes one photo and uploads it in a single request.
 *
 * A photo that can't be decoded -- HEIC on a browser that can't read it -- is
 * refused here rather than uploaded as-is, since the gallery could not show it.
 * A 409 means an earlier attempt of this same slot landed after all, which is
 * success. Never throws.
 */
export async function uploadEventPhoto(
  file: File,
  slot: EventMediaSlot,
  onProgress?: (fraction: number) => void,
): Promise<EventMediaUploadResult> {
  let body: Blob;
  try {
    body = await compressImage(
      file,
      EVENT_PHOTO_MAX_EDGE,
      slot.contentType === "image/webp" ? "image/webp" : "image/jpeg",
    );
  } catch (error) {
    console.error("Could not convert the selected photo", error);
    return {
      error: `${file.name} couldn't be converted in this browser. Export it as a JPEG, or upload it from your phone.`,
    };
  }

  const result = await putToSignedUrl(
    slot.bucket ?? EVENT_MEDIA_BUCKET,
    slot.path,
    slot.token,
    body,
    onProgress,
  );
  if ("ok" in result || result.status === 409) return { ok: true };
  console.error("Could not upload the event photo", slot.path, result.status);
  return { error: uploadErrorFor(file.name, result.status) };
}

/**
 * Past any camera's longest edge: a converted original (HEIC) keeps its size.
 * Browsers cap a canvas at 16384px a side.
 */
const ORIGINAL_MAX_EDGE = 16384;

/**
 * An upload link's photo (#1620): the file as delivered, byte for byte, then a
 * 2048px JPEG thumbnail beside it for the gallery. A type the bucket cannot
 * store (HEIC) is converted to a full-size JPEG first.
 *
 * The thumbnail is best effort: a photo whose thumbnail fails is still stored
 * and recorded, and the gallery shows the original instead. Never throws.
 */
export async function uploadEventPhotoOriginal(
  file: File,
  slot: EventMediaSlot,
  onProgress?: (fraction: number) => void,
): Promise<EventMediaUploadResult> {
  let body: Blob;
  if (storedAsPickedType(file)) {
    // Typed explicitly: a browser that left `file.type` blank would send
    // application/octet-stream, which the bucket refuses.
    body = new Blob([file], { type: slot.contentType });
  } else {
    try {
      body = await compressImage(file, ORIGINAL_MAX_EDGE, "image/jpeg");
    } catch (error) {
      console.error("Could not convert the selected photo", error);
      return {
        error: `${file.name} couldn't be converted in this browser. Export it as a JPEG and upload that.`,
      };
    }
  }

  const result = await putToSignedUrl(
    slot.bucket ?? EVENT_MEDIA_BUCKET,
    slot.path,
    slot.token,
    body,
    onProgress,
  );
  if (!("ok" in result) && result.status !== 409) {
    console.error("Could not upload the event photo", slot.path, result.status);
    return { error: uploadErrorFor(file.name, result.status) };
  }

  if (slot.thumbToken) {
    try {
      const thumb = await compressImage(file, EVENT_PHOTO_MAX_EDGE);
      const thumbResult = await putToSignedUrl(
        slot.bucket ?? EVENT_MEDIA_BUCKET,
        eventMediaThumbPath(slot.path),
        slot.thumbToken,
        thumb,
      );
      if (!("ok" in thumbResult) && thumbResult.status !== 409) {
        console.error("Could not upload the photo's thumbnail", thumbResult);
      }
    } catch (error) {
      console.error("Could not make the photo's thumbnail", error);
    }
  }
  return { ok: true };
}

export type VideoUploadHandlers = {
  onProgress: (fraction: number) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

/** The two things the queue does to a running video upload. */
export type VideoUploadHandle = {
  start: () => void;
  pause: () => void;
};

/**
 * A resumable upload of one video to its signed slot, not yet started.
 *
 * Retries a dropped connection on its own, and `start()` after a pause or a
 * failure carries on from the last chunk the server acknowledged rather than
 * from the beginning. The fingerprint is kept in localStorage, so a reload
 * that picks the same file again resumes too, as long as the token is still
 * valid (two hours).
 */
export function createVideoUpload(
  file: File,
  slot: EventMediaSlot,
  handlers: VideoUploadHandlers,
): VideoUploadHandle {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  const upload = new Upload(file, {
    endpoint: `${base}/storage/v1/upload/resumable/sign`,
    chunkSize: TUS_CHUNK_SIZE,
    retryDelays: [0, 3000, 5000, 10000, 20000, 30000],
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    headers: {
      apikey: key,
      "x-signature": slot.token,
      "x-upsert": "false",
    },
    metadata: {
      bucketName: slot.bucket ?? EVENT_MEDIA_BUCKET,
      objectName: slot.path,
      contentType: slot.contentType,
      cacheControl: "3600",
    },
    onProgress: (sent, total) => {
      if (total > 0) handlers.onProgress(sent / total);
    },
    onSuccess: () => handlers.onSuccess(),
    onError: (error) => {
      console.error("Could not upload the event video", slot.path, error);
      const status =
        "originalResponse" in error && error.originalResponse
          ? error.originalResponse.getStatus()
          : 0;
      handlers.onError(uploadErrorFor(file.name, status));
    },
  });

  return {
    start: () => {
      upload
        .findPreviousUploads()
        .then((previous) => {
          if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
        })
        .catch(() => {
          // No stored fingerprint (private window, blocked storage): start
          // fresh, which is all a first attempt would do anyway.
        })
        .finally(() => upload.start());
    },
    pause: () => {
      void upload.abort();
    },
  };
}
