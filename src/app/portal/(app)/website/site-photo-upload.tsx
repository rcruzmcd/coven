"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { GoogleDriveButton } from "@/components/portal/google-drive-button";
import { parseImageCrop, withTypedSrc } from "@/lib/image-crop";
import {
  deleteSitePhoto,
  sitePhotoPathFromUrl,
  sitePictureFormat,
  uploadSitePhoto,
  type SitePictureKind,
} from "@/lib/storage/site-photos";
import { createSitePhotoPathAction } from "./site-photo-actions";

/**
 * Uploading one picture to `site-photos` for a field that stores its URL: an
 * image slot (#921), a list row's photo or a person's team card (#1486), an
 * event flier (#1487), or a logo or app icon (#1488).
 *
 * `onChange` receives the stored value, `#crop=` fragment and all, so the
 * caller decides what blank means (`null` for a slot, `""` for a row field).
 * `kind: "logo"` keeps the picture's transparency (`sitePictureFormat`).
 */
export function useSitePhotoUpload({
  value,
  onChange,
  kind = "photo",
}: {
  value: string | null;
  onChange: (value: string) => void;
  kind?: SitePictureKind;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Object paths uploaded during *this* editing session, and the only ones
   * ever deleted when the field's photo is replaced.
   *
   * A URL that arrived as the field's stored value is never touched, even when
   * it points into this bucket: `site_content` holds a draft value and a
   * published one, so the photo being replaced on screen may still be the one
   * the live site is serving. A stale object costs a few hundred kilobytes; a
   * deleted live one takes the picture off the website.
   */
  const uploadedPaths = useRef<Set<string>>(new Set());

  function discard(url: string | null) {
    const path = sitePhotoPathFromUrl(parseImageCrop(url).src);
    if (path && uploadedPaths.current.has(path)) {
      uploadedPaths.current.delete(path);
      void deleteSitePhoto(path);
    }
  }

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      // Path first, so somebody without permission is told immediately rather
      // than after the browser has spent several seconds re-encoding a 12 MP
      // photo.
      const format = sitePictureFormat(kind);
      const pathResult = await createSitePhotoPathAction(format.extension);
      if ("error" in pathResult) {
        setError(pathResult.error);
        return;
      }

      const result = await uploadSitePhoto(file, pathResult.path, format);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      uploadedPaths.current.add(result.path);
      const previous = value;
      // Through `withTypedSrc` rather than set directly, so the one rule about
      // what happens to a crop when the photo changes lives in one place: a
      // different picture needs a different crop and gets none.
      onChange(withTypedSrc(previous, result.url));
      discard(previous);
    } finally {
      setUploading(false);
    }
  }

  return { uploading, error, setError, uploadFile };
}

/**
 * The file picker the upload hook drives: the device, or **From Google Drive**
 * (#1633), both handing one `File` to `onFile` (the hook's `uploadFile`).
 *
 * A visible native file input rather than a Button over a hidden one: one tab
 * stop, a real <label> (the field's own, which points here), a native focus
 * ring, and nothing for axe's aria-hidden-focus rule to catch. Same control as
 * gear intake uses (#781).
 */
export function SitePhotoFileInput({
  id,
  describedBy,
  uploading,
  onFile,
  accept = "image/*",
}: {
  id: string;
  describedBy?: string;
  uploading: boolean;
  onFile: (file: File) => void;
  /** Narrowed for a logo, which may not be an SVG (`SitePictureKind`). */
  accept?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared straight away so picking the same file twice in a row
          // still fires a change event.
          event.target.value = "";
          if (file) onFile(file);
        }}
        aria-describedby={describedBy}
        className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      />
      {uploading && <Spinner aria-label="Uploading photo" />}
      <GoogleDriveButton
        accept={accept}
        disabled={uploading}
        onFiles={([file]) => onFile(file)}
      />
    </div>
  );
}
