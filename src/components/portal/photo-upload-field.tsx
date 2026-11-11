"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { GoogleDriveButton } from "@/components/portal/google-drive-button";
import { isRenderableImageSrc, resolveImageUrl } from "@/lib/inventory";
import {
  deleteGearPhoto,
  gearPhotoPathFromUrl,
  uploadGearPhoto,
} from "@/lib/storage/gear-photos";
import { createGearPhotoPathAction } from "@/app/portal/(app)/gear-photo-actions";

type PhotoUploadFieldProps = {
  /** The stored photo URL, or "" when there isn't one. Controlled. */
  value: string;
  onChange: (url: string) => void;
  /** Suffixed onto every id, so item cards can render several of these. */
  idPrefix: string;
  label?: string;
  description?: string;
  disabled?: boolean;
};

const PHOTO_ACCEPT = "image/*";

/**
 * Attach one photo to a gear item, from the device it's being recorded on
 * (#781). Shared by donation intake and the inventory item editor.
 *
 * The upload happens on file select, not on form save. A volunteer holds
 * `inventory_intake:manage` and nothing else, so a donation that saved without
 * its photo is one they cannot go back and repair -- they can't reach the
 * donation or the item afterwards. The cost is an orphaned object whenever an
 * intake is abandoned, which the daily purge job sweeps.
 *
 * The link box below stays on purpose: it's how a legacy Google Drive URL is
 * still editable, and the escape hatch when a device produces an image this
 * browser can't decode.
 *
 * **From Google Drive** (#1631) hands its `File` to the same upload as the
 * native input. The public artwork form has its own field and no Drive.
 */
export function PhotoUploadField({
  value,
  onChange,
  idPrefix,
  label = "Photo",
  description = "Take one now, choose from your library, or paste a link.",
  disabled = false,
}: PhotoUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Object paths uploaded during *this* editing session. Only these are ever
   * deleted when the value is replaced or cleared -- a URL that arrived as the
   * item's persisted `photo_url` may be shared by another row, and removing a
   * live gear-library photo is far worse than leaving a stale object for the
   * purge job.
   */
  const uploadedPaths = useRef<Set<string>>(new Set());

  // Guarded, not just resolved: the link box below is typed into a character at
  // a time, and next/image throws the whole page away on a half-typed URL.
  const resolved = resolveImageUrl(value || null);
  const previewUrl = isRenderableImageSrc(resolved) ? resolved : null;

  function discard(url: string) {
    const path = gearPhotoPathFromUrl(url);
    if (path && uploadedPaths.current.has(path)) {
      uploadedPaths.current.delete(path);
      void deleteGearPhoto(path);
    }
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear the input straight away so picking the same file twice in a row
    // still fires a change event.
    event.target.value = "";
    if (file) void uploadFile(file);
  }

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      // Path first, so a signed-out or unpermitted user is told immediately
      // rather than after the phone has spent several seconds re-encoding.
      const pathResult = await createGearPhotoPathAction();
      if ("error" in pathResult) {
        setError(pathResult.error);
        return;
      }

      const result = await uploadGearPhoto(file, pathResult.path);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      uploadedPaths.current.add(result.path);
      if (value) discard(value);
      onChange(result.url);
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    if (value) discard(value);
    setError(null);
    onChange("");
    inputRef.current?.focus();
  }

  return (
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-photo`}>{label}</FieldLabel>

      {previewUrl && (
        <div className="relative size-24 overflow-hidden rounded-lg bg-muted">
          <Image
            src={previewUrl}
            alt=""
            fill
            sizes="96px"
            className="object-cover"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/*
          A visible native file input rather than a Button over a hidden one:
          one tab stop, a real <label>, a native focus ring, and nothing for
          axe's aria-hidden-focus rule to catch.

          No `capture` attribute, deliberately. It forces the camera and takes
          away the photo-library option on iOS and Android, while plain
          accept="image/*" already offers "Take Photo" in the chooser.
        */}
        <input
          ref={inputRef}
          id={`${idPrefix}-photo`}
          type="file"
          accept={PHOTO_ACCEPT}
          disabled={disabled || uploading}
          onChange={handleFile}
          aria-describedby={`${idPrefix}-photo-help`}
          className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
        {uploading && <Spinner aria-label="Uploading photo" />}
        {value && !uploading && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={handleRemove}
          >
            Remove photo
          </Button>
        )}
      </div>

      <GoogleDriveButton
        accept={PHOTO_ACCEPT}
        disabled={disabled || uploading}
        onFiles={([file]) => void uploadFile(file)}
      />

      <FieldDescription id={`${idPrefix}-photo-help`}>
        {description}
      </FieldDescription>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Use a link instead
        </summary>
        <div className="pt-2">
          <FieldLabel htmlFor={`${idPrefix}-photoUrl`} className="sr-only">
            {label} link
          </FieldLabel>
          <Input
            id={`${idPrefix}-photoUrl`}
            type="url"
            placeholder="https://..."
            value={value}
            disabled={disabled || uploading}
            onChange={(event) => {
              setError(null);
              onChange(event.target.value);
            }}
          />
        </div>
      </details>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </Field>
  );
}
