"use client";

import { CardEditButton } from "@/components/portal/card-edit-button";
import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  removePublicTeamMemberAction,
  savePublicTeamMemberAction,
} from "../actions";
import { PUBLIC_ROLE_MAX_LENGTH } from "../public-team-form";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { runAction } from "@/components/portal/action-toast";
import { ImageCropField } from "@/components/portal/image-crop-field";
import { ImagePreviewBox, useImagePreview } from "../../website/image-preview";
import {
  SitePhotoFileInput,
  useSitePhotoUpload,
} from "../../website/site-photo-upload";
import { parseImageCrop, withTypedSrc } from "@/lib/image-crop";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/** The person's `public_team_members` row, or null when they are not listed. */
export type PublicTeamMembership = {
  id: string;
  public_role: string | null;
  photo_url: string | null;
  bio: string | null;
  sort_order: number | null;
};

type FormState = {
  publicRole: string;
  photoUrl: string;
  bio: string;
  sortOrder: string;
};

function formStateFor(membership: PublicTeamMembership | null): FormState {
  return {
    publicRole: membership?.public_role ?? "",
    photoUrl: membership?.photo_url ?? "",
    bio: membership?.bio ?? "",
    sortOrder:
      membership?.sort_order === null || membership?.sort_order === undefined
        ? ""
        : String(membership.sort_order),
  };
}

function packFormData(form: FormState): FormData {
  const fd = new FormData();
  fd.set("publicRole", form.publicRole);
  fd.set("photoUrl", form.photoUrl);
  fd.set("bio", form.bio);
  fd.set("sortOrder", form.sortOrder);
  return fd;
}

/**
 * The consequence, stated where the control is: this is the one card on a
 * person's record whose contents are for the public internet, and it says so
 * before anything is typed into it (#1014). Rendered in both modes so the
 * reader of a listing knows what visitors see without opening the editor.
 */
function PublicConsequence() {
  return (
    <FieldDescription>
      Puts this person on the public Meet the Team page, if that page is set to
      read People in{" "}
      <Link
        href="/portal/website/page-layout"
        className="underline underline-offset-4"
      >
        Website › Layout
      </Link>
      . Visitors see their name (the preferred name first), and only the role,
      photo and biography entered here — nothing else on this record.
    </FieldDescription>
  );
}

/**
 * The photo at the aspect the team page draws it: a square, which is what
 * `SiteImage` renders by default and so what this row has no registry entry
 * for.
 *
 * Read-only in view mode and the crop control in the editor, where `onChange`
 * puts the whole string -- crop fragment and all -- back into the form.
 */
function PhotoField({
  url,
  onChange,
}: {
  url: string;
  onChange?: (url: string) => void;
}) {
  const preview = useImagePreview(url);
  if (!preview.url || !preview.src) return null;
  if (!onChange) {
    return (
      <ImagePreviewBox
        url={preview.src}
        ratio="1/1"
        crop={preview.crop}
        onError={preview.markFailed}
        className="h-20"
      />
    );
  }
  return (
    <ImageCropField
      url={url}
      ratio="1/1"
      label="their photo"
      onError={preview.markFailed}
      onChange={onChange}
    />
  );
}

export function PublicTeamCard({
  personId,
  personName,
  membership,
  canManage,
}: {
  personId: string;
  personName: string | null;
  membership: PublicTeamMembership | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const formId = `public-team-form-${personId}`;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(membership));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRemoving, startRemoveTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Uploaded to the same bucket as the Website photos, so the team page reads
  // it like any other link (#1486). A photo uploaded and then cancelled is left
  // for the site-photos sweep.
  const upload = useSitePhotoUpload({
    value: form.photoUrl,
    onChange: (url) => update("photoUrl", url),
  });

  function cancel() {
    setForm(formStateFor(membership));
    setError(null);
    upload.setError(null);
    setMode("view");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      await runAction(
        () => savePublicTeamMemberAction(personId, packFormData(form)),
        {
          success: membership
            ? "Team page listing saved."
            : "Added to the team page.",
          onError: setError,
          onSuccess: () => {
            setMode("view");
            router.refresh();
          },
        },
      );
    });
  }

  function remove() {
    startRemoveTransition(async () => {
      await runAction(() => removePublicTeamMemberAction(personId), {
        success: "Removed from the team page.",
        onError: (message) => toast.error(message),
        onSuccess: () => router.refresh(),
      });
    });
  }

  const listed = membership !== null;
  const bioParagraphs = (membership?.bio ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Public team page
        </CardTitle>
        {canManage && listed && (
          <CardEditButton
            label={"Edit team page listing"}
            editing={mode !== "view"}
            onEdit={() => setMode("edit")}
          />
        )}
      </CardHeader>
      <CardContent>
        {mode === "view" ? (
          <div className="flex flex-col gap-3 text-sm">
            {listed ? (
              <>
                <p>
                  <span className="app-muted">Role:</span>{" "}
                  {membership.public_role ?? "—"}
                </p>
                {membership.photo_url && (
                  <PhotoField url={membership.photo_url} />
                )}
                <p className="break-all">
                  <span className="app-muted">Photo:</span>{" "}
                  {parseImageCrop(membership.photo_url).src ?? "—"}
                </p>
                <div>
                  <span className="app-muted">Biography:</span>{" "}
                  {bioParagraphs.length === 0 ? (
                    "—"
                  ) : (
                    <div className="mt-1 flex flex-col gap-2">
                      {bioParagraphs.map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>
                  )}
                </div>
                <p>
                  <span className="app-muted">Order:</span>{" "}
                  {membership.sort_order ?? "—"}
                </p>
                <PublicConsequence />
                {canManage && (
                  <div className="flex items-center gap-1">
                    <span className="app-muted text-sm">
                      Take them off the page?
                    </span>
                    <ConfirmDeleteButton
                      label="Remove from the team page"
                      title={`Remove ${personName ?? "this person"} from the team page?`}
                      description="They stop appearing on the public Meet the Team page as soon as it next loads. The role, photo and biography entered here are deleted; the rest of their record is untouched."
                      confirmLabel="Remove"
                      pending={isRemoving}
                      onConfirm={remove}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="app-muted">
                  Not on the public Meet the Team page.
                </p>
                <PublicConsequence />
                {canManage && (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMode("edit")}
                    >
                      Add to the team page
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <form id={formId} onSubmit={handleSubmit}>
            <FieldGroup>
              <PublicConsequence />
              <Field>
                <FieldLabel htmlFor={`${formId}-role`}>
                  Role shown publicly
                </FieldLabel>
                <Input
                  id={`${formId}-role`}
                  value={form.publicRole}
                  maxLength={PUBLIC_ROLE_MAX_LENGTH}
                  placeholder="Board chair, Programs lead…"
                  onChange={(event) => update("publicRole", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-photo`}>Photo</FieldLabel>
                <SitePhotoFileInput
                  id={`${formId}-photo`}
                  describedBy={`${formId}-photo-help`}
                  uploading={upload.uploading}
                  onFile={upload.uploadFile}
                />
                <FieldLabel
                  htmlFor={`${formId}-photo-url`}
                  className="font-normal"
                >
                  Or paste a link
                </FieldLabel>
                <Input
                  id={`${formId}-photo-url`}
                  type="url"
                  value={parseImageCrop(form.photoUrl).src ?? ""}
                  placeholder="https://..."
                  disabled={upload.uploading}
                  onChange={(event) => {
                    upload.setError(null);
                    update(
                      "photoUrl",
                      withTypedSrc(form.photoUrl, event.target.value),
                    );
                  }}
                />
                <FieldDescription id={`${formId}-photo-help`}>
                  Upload a photo, or give a Google Drive share link or a direct
                  image URL, as the Site Content photos take. An uploaded photo
                  is resized for the web automatically. Blank shows the
                  site&apos;s team member photo instead.
                </FieldDescription>
                {upload.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{upload.error}</AlertDescription>
                  </Alert>
                )}
                {form.photoUrl && (
                  <PhotoField
                    url={form.photoUrl}
                    onChange={(url) => update("photoUrl", url)}
                  />
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-bio`}>
                  Public biography
                </FieldLabel>
                <Textarea
                  id={`${formId}-bio`}
                  value={form.bio}
                  rows={6}
                  onChange={(event) => update("bio", event.target.value)}
                />
                <FieldDescription>
                  Blank lines start a new paragraph. This is public.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-order`}>Order</FieldLabel>
                <Input
                  id={`${formId}-order`}
                  type="number"
                  inputMode="numeric"
                  step={1}
                  value={form.sortOrder}
                  onChange={(event) => update("sortOrder", event.target.value)}
                />
                <FieldDescription>
                  Lower numbers come first. People without one are listed after
                  those with one, by name.
                </FieldDescription>
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </form>
        )}
      </CardContent>
      {mode === "edit" && (
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isPending || upload.uploading}
          >
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : listed ? (
              "Save changes"
            ) : (
              "Add to the team page"
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
