"use client";

import { type ReactNode, useEffect, useState, useTransition } from "react";
import {
  listSocialContentLinkOptionsAction,
  type SocialContentLinkOption,
  type SocialContentLinkOptions,
} from "@/lib/social-content/piece-actions";
import {
  CAPTION_MAX_LENGTH,
  CONTENT_STATUSES,
  MAX_COLLABORATORS,
  POST_FORMATS,
  formatTakesCaption,
  formatTakesCollaborators,
  isPostFormat,
  leadTimeSchedule,
  mediaFormatIssue,
  postFormatLabel,
  type ContentPieceRow,
  type PostFormat,
} from "@/lib/social-content/pieces";
import {
  createSocialPostMediaSlotsAction,
  deleteSocialPostMediaAction,
  recordSocialPostMediaAction,
  reorderSocialPostMediaAction,
  type SocialPostExtras,
  type SocialPostMedia,
  type SocialPostTag,
} from "@/lib/social-content/post-content-actions";
import { MediaUploader } from "@/components/event-media/media-uploader";
import { EventMediaPicker } from "./event-media-picker";
import { createVideoUpload, uploadEventPhoto } from "@/lib/storage/event-media";
import type { EventMediaQueueDeps } from "@/lib/storage/event-media-queue";
import {
  HandleListInput,
  PostMediaGrid,
  TagPeopleInput,
} from "./post-content-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  ownerOptions,
  type CalendarOwner,
} from "@/app/portal/(app)/calendar/calendar-shared";
import { PersonSelect } from "@/app/portal/(app)/people/person-select";
import { formatInstantDate } from "@/lib/format";
import {
  datetimeLocalToUtcIsoInBrowser,
  utcIsoToDatetimeLocalInBrowser,
} from "@/lib/time";
import { runAction } from "@/components/portal/action-toast";

/**
 * The social post form's parts (#1794), shared by the post sheet (calendar
 * item card, event detail) and the post's own page, where each card edits one
 * of them in place.
 */

export const INTERNAL_NOTES_POLICY =
  "Staff-only working notes. Never record specific personal, medical, legal, or confidential case details here.";

const NONE = "none";

/**
 * What a new post starts out with when it is added from somewhere: the item,
 * event or program it is added from is its Related to link, and a publish date to
 * suggest (the item's or event's start). All optional -- a post added from
 * `/portal/social` starts related to nothing and unscheduled.
 */
export type SocialPostDefaults = {
  calendarItemId?: string | null;
  eventId?: string | null;
  programId?: string | null;
  publishDueAt?: string | null;
};

export function postFormStateFor(
  piece: ContentPieceRow | null,
  defaultLeadTimeDays: number,
  defaults: SocialPostDefaults = {},
) {
  return {
    title: piece?.title ?? "",
    content: piece?.content ?? "",
    postFormat: (piece?.post_format ?? "") as PostFormat | "",
    collaborators: piece?.collaborator_handles ?? [],
    contentStatus: piece?.content_status ?? "not_planned",
    skipReason: piece?.skip_reason ?? "",
    internalNotes: piece?.internal_notes ?? "",
    ownerId: piece?.owner_id ?? "",
    reviewerId: piece?.reviewer_id ?? "",
    leadTimeDays: String(piece?.lead_time_days ?? defaultLeadTimeDays),
    publishDueAt: utcIsoToDatetimeLocalInBrowser(
      piece ? piece.publish_due_at : (defaults.publishDueAt ?? null),
    ),
    reviewDueAt: utcIsoToDatetimeLocalInBrowser(piece?.review_due_at ?? null),
    draftDueAt: utcIsoToDatetimeLocalInBrowser(piece?.draft_due_at ?? null),
    calendarItemId: piece
      ? (piece.calendar_item_id ?? "")
      : (defaults.calendarItemId ?? ""),
    eventId: piece ? (piece.event_id ?? "") : (defaults.eventId ?? ""),
    programId: piece ? (piece.program_id ?? "") : (defaults.programId ?? ""),
  };
}

export type PostFormState = ReturnType<typeof postFormStateFor>;

export type PostFormUpdate = <K extends keyof PostFormState>(
  key: K,
  value: PostFormState[K],
) => void;

/**
 * The whole post as the create and update actions read it: update replaces
 * the row, so even a form that edits one part sends every field.
 */
export function buildPostFormData(
  form: PostFormState,
  tags: SocialPostTag[],
): FormData {
  const formData = new FormData();
  formData.set("title", form.title);
  formData.set("content", form.content);
  formData.set("postFormat", form.postFormat);
  formData.set("collaborators", JSON.stringify(form.collaborators));
  formData.set("tags", JSON.stringify(tags));
  formData.set("contentStatus", form.contentStatus);
  formData.set("skipReason", form.skipReason);
  formData.set("internalNotes", form.internalNotes);
  formData.set("ownerId", form.ownerId);
  formData.set("reviewerId", form.reviewerId);
  formData.set("leadTimeDays", form.leadTimeDays);
  formData.set("calendarItemId", form.calendarItemId);
  formData.set("eventId", form.eventId);
  formData.set("programId", form.programId);
  // Converted here, in the browser, so each due instant is fixed using the
  // user's own timezone rather than the server's.
  for (const key of ["publishDueAt", "reviewDueAt", "draftDueAt"] as const) {
    formData.set(key, datetimeLocalToUtcIsoInBrowser(form[key]) ?? "");
  }
  return formData;
}

export function optionLabel(option: SocialContentLinkOption) {
  return option.starts_at
    ? `${option.label} · ${formatInstantDate(option.starts_at)}`
    : option.label;
}

/** Loads what the Related to picker offers, once per mount. */
export function useLinkOptions() {
  const [options, setOptions] = useState<SocialContentLinkOptions | null>(null);
  useEffect(() => {
    let cancelled = false;
    listSocialContentLinkOptionsAction().then((next) => {
      if (!cancelled) setOptions(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

/**
 * How a linked record reads. A link to a record this reader cannot see (an
 * event, for someone without events access) is still a link: it is kept on
 * save and named generically rather than dropped.
 */
export function linkedLabel(
  options: SocialContentLinkOption[] | undefined,
  id: string | null,
  fallback: string,
) {
  if (!id) return null;
  const option = options?.find((candidate) => candidate.id === id);
  return option ? optionLabel(option) : fallback;
}

function RelatedToSelect({
  id,
  label,
  noneLabel,
  unknownLabel,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  noneLabel: string;
  unknownLabel: string;
  options: SocialContentLinkOption[] | undefined;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || NONE}
        onValueChange={(next) => onChange(!next || next === NONE ? "" : next)}
      >
        <SelectTrigger id={id} className="w-full min-w-0">
          {/* A long event name plus its date truncates rather than widening
              the trigger past the sheet (#1825); the open list shows it whole. */}
          <SelectValue placeholder={noneLabel} className="min-w-0">
            {(selected: string) => (
              <span className="truncate">
                {selected === NONE
                  ? noneLabel
                  : linkedLabel(options, selected, unknownLabel)}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{noneLabel}</SelectItem>
          {options?.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {optionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

type FieldsProps = { form: PostFormState; update: PostFormUpdate };

export function PostTitleField({ form, update }: FieldsProps) {
  return (
    <Field>
      <FieldLabel htmlFor="piece-title" required>
        Title
      </FieldLabel>
      <Input
        id="piece-title"
        required
        placeholder="e.g. Instagram carousel: how the gear swap works"
        value={form.title}
        onChange={(event) => update("title", event.target.value)}
      />
    </Field>
  );
}

/** Event, community date and program: any of them, or none. */
export function PostRelatedToFields({
  form,
  update,
  linkOptions,
  legend = true,
}: FieldsProps & {
  linkOptions: SocialContentLinkOptions | null;
  /** False where a card's own title already says "Related to". */
  legend?: boolean;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className={legend ? "mb-2 text-sm font-medium" : "sr-only"}>
        Related to
      </legend>
      <RelatedToSelect
        id="piece-eventId"
        label="Event"
        noneLabel="No event"
        unknownLabel="An event"
        options={linkOptions?.events}
        value={form.eventId}
        onChange={(next) => update("eventId", next)}
      />
      <RelatedToSelect
        id="piece-calendarItemId"
        label="Community date"
        noneLabel="No community date"
        unknownLabel="A community date"
        options={linkOptions?.calendarItems}
        value={form.calendarItemId}
        onChange={(next) => update("calendarItemId", next)}
      />
      <RelatedToSelect
        id="piece-programId"
        label="Program"
        noneLabel="No program"
        unknownLabel="A program"
        options={linkOptions?.programs}
        value={form.programId}
        onChange={(next) => update("programId", next)}
      />
      <FieldDescription>Any of these, or none.</FieldDescription>
    </fieldset>
  );
}

/**
 * What gets published: format, caption or story text, collaborators, people
 * to tag. Media saves as it goes rather than with the form, so it is passed
 * in (`media`) by a caller that has a saved post to attach it to.
 */
export function PostContentFields({
  form,
  update,
  tags,
  onTagsChange,
  extras,
  media,
}: FieldsProps & {
  tags: SocialPostTag[] | null;
  onTagsChange: (next: SocialPostTag[]) => void;
  extras: SocialPostExtras | null;
  media: ReactNode;
}) {
  const takesCaption = formatTakesCaption(form.postFormat || null);
  return (
    <>
      <Field>
        <FieldLabel htmlFor="piece-postFormat">Format</FieldLabel>
        <Select
          value={form.postFormat || NONE}
          onValueChange={(next) =>
            update("postFormat", isPostFormat(next) ? next : "")
          }
        >
          <SelectTrigger id="piece-postFormat" className="w-full">
            <SelectValue placeholder="Not chosen">
              {(value: string) => postFormatLabel(value) ?? "Not chosen"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not chosen</SelectItem>
            {POST_FORMATS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="piece-content">
          {takesCaption ? "Caption" : "Story text"}
        </FieldLabel>
        <Textarea
          id="piece-content"
          className="min-h-40"
          aria-describedby="piece-content-count"
          value={form.content}
          onChange={(event) => update("content", event.target.value)}
        />
        <FieldDescription id="piece-content-count">
          {takesCaption ? (
            <span
              className={
                form.content.length > CAPTION_MAX_LENGTH
                  ? "text-destructive"
                  : undefined
              }
            >
              {form.content.length.toLocaleString()} of{" "}
              {CAPTION_MAX_LENGTH.toLocaleString()} characters Instagram allows.
            </span>
          ) : (
            "Stories have no caption. This is the text to put on the story itself."
          )}
        </FieldDescription>
      </Field>

      {formatTakesCollaborators(form.postFormat || null) && (
        <Field>
          <FieldLabel htmlFor="piece-collaborators">Collaborators</FieldLabel>
          <HandleListInput
            id="piece-collaborators"
            values={form.collaborators}
            onChange={(next) => update("collaborators", next)}
            max={MAX_COLLABORATORS}
            describedBy="piece-collaborators-hint"
          />
          <FieldDescription id="piece-collaborators-hint">
            Accounts to invite as co-authors, up to {MAX_COLLABORATORS}.
          </FieldDescription>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="piece-tags">People to tag</FieldLabel>
        {extras && tags !== null ? (
          <TagPeopleInput
            id="piece-tags"
            tags={tags}
            people={extras.people}
            onChange={onTagsChange}
            describedBy="piece-tags-hint"
          />
        ) : (
          <Spinner />
        )}
        <FieldDescription id="piece-tags-hint">
          Pick someone on record to use their handle, or type any handle.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="piece-media">Media</FieldLabel>
        {media}
      </Field>
    </>
  );
}

export function PostStatusFields({ form, update }: FieldsProps) {
  return (
    <Field orientation="responsive">
      <Field>
        <FieldLabel htmlFor="piece-contentStatus">Status</FieldLabel>
        <Select
          value={form.contentStatus}
          onValueChange={(value) =>
            update("contentStatus", value ?? "not_planned")
          }
        >
          <SelectTrigger id="piece-contentStatus" className="w-full">
            <SelectValue placeholder="Select status">
              {(value: string) =>
                CONTENT_STATUSES.find((option) => option.value === value)?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CONTENT_STATUSES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="piece-skipReason">Skip reason</FieldLabel>
        <Input
          id="piece-skipReason"
          placeholder={
            form.contentStatus === "skipped"
              ? "Reason (required)"
              : "Only used when skipped"
          }
          value={form.skipReason}
          onChange={(event) => update("skipReason", event.target.value)}
        />
      </Field>
    </Field>
  );
}

export function PostTeamFields({
  form,
  update,
  owners,
}: FieldsProps & { owners: CalendarOwner[] }) {
  return (
    <Field orientation="responsive">
      <Field>
        <FieldLabel htmlFor="piece-ownerId">Owner</FieldLabel>
        <PersonSelect
          id="piece-ownerId"
          people={ownerOptions(owners)}
          value={form.ownerId || null}
          onChange={(personId) => update("ownerId", personId ?? "")}
          noneLabel="No owner"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="piece-reviewerId">Reviewer</FieldLabel>
        <PersonSelect
          id="piece-reviewerId"
          people={ownerOptions(owners)}
          value={form.reviewerId || null}
          onChange={(personId) => update("reviewerId", personId ?? "")}
          noneLabel="No reviewer"
        />
      </Field>
    </Field>
  );
}

/** Publish date, lead time, and the draft and review dates it suggests. */
export function PostScheduleFields({
  form,
  update,
  onError,
}: FieldsProps & { onError: (message: string | null) => void }) {
  function applyLeadTimeDefaults() {
    if (!form.publishDueAt) return;
    const leadTimeDays = Number(form.leadTimeDays);
    if (!Number.isInteger(leadTimeDays) || leadTimeDays <= 0) {
      onError("Set a valid lead time before applying defaults.");
      return;
    }
    const { draftDueAt, reviewDueAt } = leadTimeSchedule(
      new Date(form.publishDueAt),
      leadTimeDays,
    );
    onError(null);
    update(
      "draftDueAt",
      utcIsoToDatetimeLocalInBrowser(draftDueAt.toISOString()),
    );
    update(
      "reviewDueAt",
      utcIsoToDatetimeLocalInBrowser(reviewDueAt.toISOString()),
    );
  }

  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor="piece-publishDueAt">Publish date</FieldLabel>
          <Input
            id="piece-publishDueAt"
            type="datetime-local"
            value={form.publishDueAt}
            onChange={(event) => update("publishDueAt", event.target.value)}
          />
          <FieldDescription>
            Leave empty to keep it unscheduled.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="piece-leadTimeDays">Lead time (days)</FieldLabel>
          <Input
            id="piece-leadTimeDays"
            type="number"
            min={1}
            step={1}
            value={form.leadTimeDays}
            onChange={(event) => update("leadTimeDays", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!form.publishDueAt}
            aria-describedby="piece-lead-time-hint"
            onClick={applyLeadTimeDefaults}
          >
            Apply lead-time defaults
          </Button>
        </div>
        <FieldDescription id="piece-lead-time-hint">
          {form.publishDueAt
            ? "Sets the draft date two-thirds and the review date one-third of the lead time before publishing."
            : "Set a publish date to apply lead-time defaults."}
        </FieldDescription>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor="piece-draftDueAt">Draft due</FieldLabel>
          <Input
            id="piece-draftDueAt"
            type="datetime-local"
            value={form.draftDueAt}
            onChange={(event) => update("draftDueAt", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="piece-reviewDueAt">Review due</FieldLabel>
          <Input
            id="piece-reviewDueAt"
            type="datetime-local"
            value={form.reviewDueAt}
            onChange={(event) => update("reviewDueAt", event.target.value)}
          />
        </Field>
      </Field>
    </>
  );
}

export function PostInternalNotesField({
  form,
  update,
  hideLabel = false,
}: FieldsProps & {
  /** True where a card's own title already says "Internal notes". */
  hideLabel?: boolean;
}) {
  return (
    <Field>
      <FieldLabel
        htmlFor="piece-internalNotes"
        className={hideLabel ? "sr-only" : undefined}
      >
        Internal notes
      </FieldLabel>
      <Textarea
        id="piece-internalNotes"
        value={form.internalNotes}
        onChange={(event) => update("internalNotes", event.target.value)}
      />
      <FieldDescription>{INTERNAL_NOTES_POLICY}</FieldDescription>
    </Field>
  );
}

/**
 * The media part of the Content section: upload, choose from the related
 * event (#1827), reorder, remove. Files save as they go rather than with the
 * form, so a post must exist first.
 */
export function PostMediaEditor({
  postId,
  eventId,
  media,
  format,
  onChanged,
  onError,
}: {
  postId: string;
  /** The saved post's event, whose media it can choose from. */
  eventId: string | null;
  media: SocialPostMedia[];
  format: PostFormat | null;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, startTransition] = useTransition();
  const [deps] = useState<EventMediaQueueDeps>(() => ({
    mintSlots: (files) => createSocialPostMediaSlotsAction(postId, files),
    uploadPhoto: uploadEventPhoto,
    createVideoUpload,
    record: (slot, name) => recordSocialPostMediaAction(slot.path, name),
  }));
  const issue = mediaFormatIssue(format, media);

  function move(index: number, direction: -1 | 1) {
    const ids = media.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + direction, 0, moved);
    startTransition(async () => {
      const result = await reorderSocialPostMediaAction(postId, ids);
      if ("error" in result) onError(result.error);
      onChanged();
    });
  }

  function remove(item: SocialPostMedia) {
    startTransition(async () => {
      await runAction(() => deleteSocialPostMediaAction(item.id), {
        success: `Removed ${item.original_filename}.`,
        onError,
        onSuccess: onChanged,
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {media.length > 0 && (
        <PostMediaGrid
          media={media}
          busy={busy}
          onMove={move}
          onRemove={remove}
        />
      )}
      {issue && (
        <Alert>
          <AlertDescription>{issue}</AlertDescription>
        </Alert>
      )}
      {eventId && (
        <EventMediaPicker
          postId={postId}
          eventId={eventId}
          format={format}
          held={media.length}
          heldGenerated={media.filter((item) => item.generated).length}
          referencedIds={
            new Set(media.flatMap((item) => item.event_media_id ?? []))
          }
          onAdded={onChanged}
          onError={onError}
        />
      )}
      <MediaUploader
        deps={deps}
        onUploaded={onChanged}
        hint="In the order they'll appear. Photos are resized before upload. Files save as soon as they upload."
      />
    </div>
  );
}
