"use client";

import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SITE_LOGO_ACCEPT } from "@/lib/storage/site-photos";
import {
  ImagePreviewBox,
  OpenPictureLink,
  useImagePreview,
} from "./image-preview";
import { SitePhotoFileInput, useSitePhotoUpload } from "./site-photo-upload";

const BROKEN_LINK_MESSAGE =
  "That link did not load as a picture. A Google Drive link has to be a file rather than a folder, and shared with anyone who has the link.";

/**
 * A logo field: an upload beside the link box, and the picture on both a
 * light and a dark background (#1488). Shared by a sponsor's logo on a
 * person's record and the Branding panel's logo and app icon.
 *
 * The upload keeps transparency (`kind: "logo"`, WebP or PNG), and the two
 * backgrounds are what show whether it did: a logo whose transparent corners
 * came out white is invisible on the light swatch and a white block on the
 * dark one, which is how the site header draws it in dark mode.
 *
 * Contained rather than cropped, because nothing on the site crops a logo.
 * `ratio` is the box the caller's surface draws it in.
 */
export function LogoField({
  id,
  uploadLabel,
  label,
  value,
  onChange,
  ratio,
  name,
  allowPaths = false,
  description,
}: {
  id: string;
  /** The file picker's label: "Upload a logo". */
  uploadLabel: string;
  /** The link box's label, which is also what its errors call it: "Logo URL". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The aspect of the box the preview is contained in, as a CSS ratio. */
  ratio: string;
  /** The link box's form name, for a form read with `new FormData(form)`. */
  name?: string;
  /**
   * Accept a path this site serves (`/chatter-logo-transparent.png`), which
   * `type="url"` would refuse -- see the Branding panel (#1267).
   */
  allowPaths?: boolean;
  description: ReactNode;
}) {
  const preview = useImagePreview(value.trim() || null);
  const upload = useSitePhotoUpload({ value, onChange, kind: "logo" });

  return (
    <Field>
      <FieldLabel htmlFor={id}>{uploadLabel}</FieldLabel>
      <SitePhotoFileInput
        id={id}
        describedBy={`${id}-help`}
        uploading={upload.uploading}
        onFile={upload.uploadFile}
        accept={SITE_LOGO_ACCEPT}
      />
      <FieldLabel htmlFor={`${id}-url`}>{label}</FieldLabel>
      <Input
        id={`${id}-url`}
        name={name}
        {...(allowPaths ? { inputMode: "url" as const } : { type: "url" })}
        placeholder="https://drive.google.com/file/d/..."
        value={value}
        disabled={upload.uploading}
        onChange={(event) => {
          upload.setError(null);
          onChange(event.target.value);
        }}
      />
      {preview.failed ? (
        <FieldDescription id={`${id}-help`} className="text-destructive">
          {BROKEN_LINK_MESSAGE}
        </FieldDescription>
      ) : (
        <FieldDescription id={`${id}-help`}>
          Upload a PNG or WebP with a transparent background, or give a link.{" "}
          {description}
        </FieldDescription>
      )}
      {upload.error && (
        <Alert variant="destructive">
          <AlertDescription>{upload.error}</AlertDescription>
        </Alert>
      )}
      {preview.url && (
        <>
          <div className="flex flex-wrap gap-2">
            <ImagePreviewBox
              url={preview.url}
              ratio={ratio}
              fit="contain"
              className="h-16 border border-border bg-white"
              onError={preview.markFailed}
            />
            <ImagePreviewBox
              url={preview.url}
              ratio={ratio}
              fit="contain"
              className="h-16 bg-neutral-900"
              onError={preview.markFailed}
            />
          </div>
          <FieldDescription>
            On a light and a dark background, as the site header shows it in
            each theme.
          </FieldDescription>
          <OpenPictureLink url={preview.url} label={label} />
        </>
      )}
    </Field>
  );
}
