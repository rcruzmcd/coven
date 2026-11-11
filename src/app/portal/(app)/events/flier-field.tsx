"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ImagePreviewBox,
  OpenPictureLink,
  useImagePreview,
} from "../website/image-preview";
import {
  SitePhotoFileInput,
  useSitePhotoUpload,
} from "../website/site-photo-upload";

/**
 * A flier is a poster, so the preview box is portrait. The public detail page
 * draws it at its own aspect, uncropped (`EventFlier`), so the picture is
 * contained in that box rather than cropped to it: a landscape flier shows
 * whole, letterboxed, exactly as uncut as the site shows it.
 */
const FLIER_PREVIEW_RATIO = "3 / 4";

const BROKEN_LINK_MESSAGE =
  "That link did not load as a picture. A Google Drive link has to be a file rather than a folder, and shared with anyone who has the link.";

/**
 * The flier as a picture, for the read-only Overview: before #1487 it showed
 * the link as text, so nobody could see whether the flier loaded without
 * opening the public page.
 */
export function FlierPreview({ url }: { url: string }) {
  const preview = useImagePreview(url || null);
  if (preview.failed) {
    return (
      <FieldDescription className="text-destructive">
        {BROKEN_LINK_MESSAGE}
      </FieldDescription>
    );
  }
  if (!preview.url) return <>—</>;
  return (
    <div className="flex flex-col gap-2">
      <ImagePreviewBox
        url={preview.url}
        ratio={FLIER_PREVIEW_RATIO}
        fit="contain"
        className="h-40"
        onError={preview.markFailed}
      />
      <OpenPictureLink url={preview.url} label="Flier" />
    </div>
  );
}

/**
 * The flier control in the New event dialog and the Overview tab's editor
 * (#1487): an upload beside the link box, and a preview of either.
 *
 * The upload goes to `site-photos` and is stored as `flier_url` like any
 * pasted link, so the public event page reads it unchanged. A flier uploaded
 * and then replaced or abandoned is left for the site-photos sweep (#1492).
 */
export function FlierField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const preview = useImagePreview(value || null);
  const upload = useSitePhotoUpload({ value, onChange });

  return (
    <Field>
      <FieldLabel htmlFor={id}>Upload a flier</FieldLabel>
      <SitePhotoFileInput
        id={id}
        describedBy={`${id}-help`}
        uploading={upload.uploading}
        onFile={upload.uploadFile}
      />
      <FieldLabel htmlFor={`${id}-url`}>Flier image URL</FieldLabel>
      <Input
        id={`${id}-url`}
        type="url"
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
          Upload the flier, or give a Google Drive share link or a direct image
          URL. An uploaded flier is resized for the web automatically. Shown on
          the public event page.
        </FieldDescription>
      )}
      {upload.error && (
        <Alert variant="destructive">
          <AlertDescription>{upload.error}</AlertDescription>
        </Alert>
      )}
      {preview.url && (
        <>
          <ImagePreviewBox
            url={preview.url}
            ratio={FLIER_PREVIEW_RATIO}
            fit="contain"
            className="h-40"
            onError={preview.markFailed}
          />
          <OpenPictureLink url={preview.url} label="Flier" />
        </>
      )}
    </Field>
  );
}
