"use client";

import { ImageCropField } from "@/components/portal/image-crop-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseImageCrop, withTypedSrc } from "@/lib/image-crop";
import { SitePhotoFileInput, useSitePhotoUpload } from "./site-photo-upload";
import { OpenPictureLink, useImagePreview } from "./image-preview";

/**
 * The control for an `image` slot: a picture, a file to upload, and the link
 * box for one that is already somewhere on the web.
 *
 * Upload came second (#921). The slot was a link box alone, which meant
 * setting one photo was six steps outside the app -- open Drive, find the
 * file, Share, change access to "Anyone with the link", Copy link, come back,
 * paste -- across forty-six slots, and three of those steps go wrong in ways
 * the app cannot see: a folder link is a valid URL that serves HTML, and an
 * unshared file resolves to a thumbnail that 403s for every visitor while
 * looking right to the person who pasted it.
 *
 * The link box stays, and is not the lesser half. A photo already on the web,
 * or already in Drive, should not have to be re-uploaded to be used, and every
 * Drive link stored today keeps working exactly as it did -- this adds a way
 * in, it migrates nothing.
 *
 * A blank box is `null`, the slot's default, so "Back to default", the dirty
 * check and the draft that reverts the slot all agree on what empty means.
 *
 * Nothing is drawn while the slot is empty -- there is no crop to judge, and a
 * hole under each of eight unset slots is how Get Involved got long the first
 * time (#792). The section says once what blank does.
 *
 * Once there is a photo the picture is the control, not a thumbnail beside one
 * (#1251): the crop is set by dragging it inside the frame the public site
 * will crop it to. The crop rides on the value as a `#crop=` fragment, so it
 * is an ordinary slot edit as far as the dirty check, the draft and publishing
 * are concerned -- and the link box shows the value without it, because a rect
 * no one can picture has no business being in a box people type in.
 */
export function ImageSlotField({
  id,
  describedBy,
  label,
  ratio,
  value,
  onChange,
}: {
  id: string;
  /** The slot's status badge, which describes the control rather than naming it (#924). */
  describedBy?: string;
  label: string;
  /** The aspect the public site crops this slot to, as a CSS ratio. */
  ratio: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const preview = useImagePreview(value);
  const { uploading, error, setError, uploadFile } = useSitePhotoUpload({
    value,
    onChange: (next) => onChange(next || null),
  });

  return (
    <>
      {preview.url && (
        <ImageCropField
          url={value}
          ratio={ratio}
          label={label}
          onError={preview.markFailed}
          onChange={onChange}
        />
      )}

      <SitePhotoFileInput
        id={id}
        describedBy={describedBy}
        uploading={uploading}
        onFile={uploadFile}
      />

      <FieldLabel htmlFor={`${id}-url`} className="font-normal">
        Or paste a link
      </FieldLabel>
      <Input
        id={`${id}-url`}
        type="url"
        placeholder="https://drive.google.com/file/d/..."
        disabled={uploading}
        // The stored link without its crop: `preview.src` is the *resolved*
        // one, and a Drive share link must come back out of this box as the
        // share link that was pasted into it.
        value={parseImageCrop(value).src ?? ""}
        onChange={(event) => {
          setError(null);
          onChange(withTypedSrc(value, event.target.value.trim()) || null);
        }}
      />
      {preview.failed && (
        <FieldDescription className="text-destructive">
          That link did not load as a picture. A Google Drive link has to be a
          file rather than a folder, and shared with anyone who has the link.
          Uploading the photo avoids both.
        </FieldDescription>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {preview.url && <OpenPictureLink url={preview.url} label={label} />}
    </>
  );
}

/**
 * The hint every image slot shares, said once per section rather than per slot
 * -- eighty-six fields each carrying their own paragraph is most of what made
 * this page three thousand pixels tall (#918).
 */
export function ImageSlotHint() {
  return (
    <FieldDescription>
      Photos can be uploaded, or given as a Google Drive share link or a direct
      image URL; blank shows the placeholder icon. An uploaded photo is resized
      for the web automatically, so there is no size to keep under. Drag a photo
      inside its frame, or use the sliders under it, to choose which part of it
      the page shows.
    </FieldDescription>
  );
}
