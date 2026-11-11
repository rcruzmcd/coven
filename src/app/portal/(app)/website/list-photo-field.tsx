"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageCropField } from "@/components/portal/image-crop-field";
import { parseImageCrop, withTypedSrc } from "@/lib/image-crop";
import { isRenderableImageSrc } from "@/lib/inventory";
import {
  imageSlotLabel,
  photoSlotChoices,
  resolvePhoto,
  type ListItem,
  type PhotoListField,
} from "@/lib/site-content";
import {
  ImagePreviewBox,
  OpenPictureLink,
  useImagePreview,
} from "./image-preview";
import { SitePhotoFileInput, useSitePhotoUpload } from "./site-photo-upload";

/** The option values the select carries. A slot's own name is namespaced. */
const SHARED = "shared";
const LINK = "link";
const SLOT_PREFIX = "slot:";

/** A row's field as text; a list row may hold paragraphs or a switch too. */
function text(item: ListItem, key: string): string {
  const value = item[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Which source the row is set to use, read back from what it stores.
 *
 * Read through the site's own precedence, so the control opens showing the
 * source the page is actually using rather than a guess: a row carrying both
 * a link and a slot is on its link, because that is what the page renders.
 */
function storedSource(field: PhotoListField, item: ListItem): string {
  if (text(item, field.key)) return LINK;
  const slot = text(item, field.slotField);
  return slot ? `${SLOT_PREFIX}${slot}` : SHARED;
}

/**
 * What the row shows, in a sentence, wherever the picture came from.
 *
 * A borrowed photo that carries a crop says where that crop is set, because it
 * belongs to the slot and is edited there rather than here (#1251). A row on a
 * link of its own needs no such sentence: the frame above is the control.
 */
function sourceLine(
  from: "url" | "slot" | "fallback" | "none",
  slot: string | undefined,
  failed: boolean,
  /** Whether the borrowed photo carries a crop, which is set where that photo is. */
  cropped: boolean,
): string {
  if (failed) return "That picture did not load.";
  const name = (slot && imageSlotLabel(slot)) ?? slot;
  const borrowedCrop = cropped
    ? ` Its crop is set with “${name}”, not here.`
    : "";
  switch (from) {
    case "url":
      return "Showing their own photo.";
    case "slot":
      return `Showing “${name}”.${borrowedCrop}`;
    case "fallback":
      return `No photo of their own, so “${name}” shows.${borrowedCrop}`;
    case "none":
      return "No photo anywhere yet, so the page shows a placeholder icon.";
  }
}

/**
 * One photo control for a list row: the picture the site will use, and the one
 * question of where it comes from.
 *
 * This used to be two free-text boxes side by side -- "Photo URL" and "Image
 * slot" -- both optional, with a precedence stated only in the slot's
 * description and a slot name that had to be typed from memory. A typo fell
 * through to the shared placeholder with no error, and neither box previewed
 * anything, so the only way to see a team member's photo was to open the
 * public page (#922).
 *
 * Both fields are still stored, because a tenant may set a link directly, but
 * only one of them is ever *in effect*: choosing a slot clears the link, and
 * choosing a link clears the slot, so the preview and the sentence under it
 * are the whole truth about what the page will render.
 *
 * A photo of their own can be uploaded as well as linked (#1486). An upload
 * goes to `site-photos` the way an image slot's does and is stored as the
 * row's link, so the page reads it exactly as it reads any other URL.
 */
export function ListPhotoField({
  id,
  field,
  item,
  images,
  onChange,
}: {
  /** The select's id, which the row's field label points at. */
  id: string;
  field: PhotoListField;
  item: ListItem;
  /** The page's image slots as the editor currently has them, by short name. */
  images: Readonly<Record<string, string | null>>;
  onChange: (item: ListItem) => void;
}) {
  const choices = photoSlotChoices(field);
  // Local, because "use a link of their own" is a state the row cannot store:
  // with the link still blank there is nothing to tell it apart from having
  // chosen nothing at all. The preview below stays derived from the row.
  const [source, setSource] = useState(() => storedSource(field, item));
  const photo = resolvePhoto(field, item, images);
  const preview = useImagePreview(photo.url);
  const urlText = text(item, field.key);
  const slotText = text(item, field.slotField);
  const upload = useSitePhotoUpload({
    value: urlText,
    onChange: (next) =>
      onChange({ ...item, [field.key]: next, [field.slotField]: "" }),
  });
  // A name the registry no longer has -- a typo from the old free-text box, or
  // a slot since removed. Offered as an option so it is visible and can be
  // corrected, rather than silently reading as the shared placeholder.
  const orphanSlot =
    slotText && !choices.some((choice) => choice.name === slotText)
      ? slotText
      : null;

  function select(value: string) {
    setSource(value);
    if (value === LINK) {
      // The slot goes, so the link is what the page uses the moment it is
      // typed -- and so the control never has to explain which one wins.
      onChange({ ...item, [field.slotField]: "" });
      return;
    }
    onChange({
      ...item,
      [field.key]: "",
      [field.slotField]:
        value === SHARED ? "" : value.slice(SLOT_PREFIX.length),
    });
  }

  return (
    <>
      {preview.url &&
        // The crop belongs to whatever holds the photo. On a link of its own
        // that is this row, so the picture is the control; borrowed from a
        // slot it is the slot's, and this stays the read-only preview it has
        // always been -- cropped, so the row still shows what the page shows.
        (photo.from === "url" ? (
          <ImageCropField
            url={urlText}
            ratio={field.ratio}
            label={field.label}
            onError={preview.markFailed}
            onChange={(next) => onChange({ ...item, [field.key]: next })}
          />
        ) : (
          <ImagePreviewBox
            url={preview.src ?? preview.url}
            ratio={field.ratio}
            crop={preview.crop}
            onError={preview.markFailed}
          />
        ))}
      <Select value={source} onValueChange={(value) => select(value ?? SHARED)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem
              key={choice.name}
              value={`${SLOT_PREFIX}${choice.name}`}
            >
              {choice.label}
            </SelectItem>
          ))}
          {orphanSlot && (
            <SelectItem value={`${SLOT_PREFIX}${orphanSlot}`}>
              {orphanSlot} (no longer a photo on this page)
            </SelectItem>
          )}
          <SelectItem value={SHARED}>
            {imageSlotLabel(field.fallbackSlot) ?? "Shared photo"} (shared)
          </SelectItem>
          <SelectItem value={LINK}>A photo of their own</SelectItem>
        </SelectContent>
      </Select>
      <FieldDescription
        className={preview.failed ? "text-destructive" : undefined}
      >
        {sourceLine(
          photo.from,
          photo.slot,
          preview.failed,
          preview.crop !== null,
        )}
      </FieldDescription>

      {source === LINK && (
        <>
          <FieldLabel htmlFor={`${id}-file`} className="font-normal">
            Upload a photo
          </FieldLabel>
          <SitePhotoFileInput
            id={`${id}-file`}
            uploading={upload.uploading}
            onFile={upload.uploadFile}
          />
          <FieldLabel htmlFor={`${id}-url`} className="font-normal">
            Or paste a link
          </FieldLabel>
          <Input
            id={`${id}-url`}
            type="url"
            placeholder="https://drive.google.com/file/d/..."
            disabled={upload.uploading}
            value={parseImageCrop(urlText).src ?? ""}
            onChange={(event) => {
              upload.setError(null);
              onChange({
                ...item,
                [field.key]: withTypedSrc(urlText, event.target.value.trim()),
              });
            }}
          />
          {urlText !== "" && !isRenderableImageSrc(urlText) && (
            <FieldDescription className="text-destructive">
              Use a Google Drive share link, a full https:// address, or a path
              on this site starting with /.
            </FieldDescription>
          )}
          {upload.error && (
            <Alert variant="destructive">
              <AlertDescription>{upload.error}</AlertDescription>
            </Alert>
          )}
        </>
      )}
      {preview.url && <OpenPictureLink url={preview.url} label={field.label} />}
    </>
  );
}
