"use client";

import { type FormEvent, type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CardEditButton } from "@/components/portal/card-edit-button";
import { runAction } from "@/components/portal/action-toast";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import { ContentStatusBadge } from "@/components/portal/social-content/content-status-badge";
import {
  PostContentSummary,
  PostMediaGrid,
  usePostExtras,
} from "@/components/portal/social-content/post-content-fields";
import {
  PostContentFields,
  PostInternalNotesField,
  PostMediaEditor,
  PostRelatedToFields,
  PostScheduleFields,
  PostTeamFields,
  PostTitleField,
  buildPostFormData,
  postFormStateFor,
  useLinkOptions,
  type PostFormState,
  type PostFormUpdate,
} from "@/components/portal/social-content/post-form";
import { ShareToInstagram } from "@/components/portal/social-content/share-to-instagram";
import { PostTemplateCard } from "@/components/portal/social-content/post-template-card";
import { RepeatMarker } from "@/components/portal/social-content/repeat-marker";
import { ViewerTime } from "@/components/viewer-time";
import type { PostTemplateEditor } from "@/lib/social-content/post-template-editor";
import { CONTENT_STATUSES } from "@/lib/social-content/pieces";
import {
  deleteContentPieceAction,
  updateContentPieceAction,
  updateContentPieceStatusAction,
} from "@/lib/social-content/piece-actions";
import type {
  SocialPostExtras,
  SocialPostTag,
} from "@/lib/social-content/post-content-actions";
import type { SocialPieceRow } from "@/lib/social-content/queries";
import { cadenceLabel } from "@/lib/social-content/series";
import {
  calendarActorName,
  ownerName,
  type CalendarOwner,
} from "../../calendar/calendar-shared";
import { RelatedChips } from "../related-chips";

/**
 * One social post's page (#1794), edited in place a card at a time, as the
 * calendar item, asset and meeting pages are: what gets published on the
 * left, and the workflow around it (status, schedule and team, what it is
 * related to, internal notes) on the right.
 */
export function SocialPostDetail({
  piece,
  owners,
  canManage,
  templateEditor = null,
  children,
  repeats,
  history = null,
}: {
  piece: SocialPieceRow;
  owners: CalendarOwner[];
  canManage: boolean;
  /** The post's template card (#1925); null when no template fits it. */
  templateEditor?: PostTemplateEditor | null;
  /** More cards about what is published (featured gear). */
  children?: ReactNode;
  /** The post's Repeats card, placed with its schedule. */
  repeats?: ReactNode;
  /** The post's audit history; null for those who cannot read the log. */
  history?: ReactNode;
}) {
  const router = useRouter();
  const { extras, reload: reloadExtras } = usePostExtras(
    piece.id,
    piece.event_id,
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="brand-display text-3xl font-semibold tracking-brand sm:text-4xl">
            {piece.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <ContentStatusBadge status={piece.content_status} />
            {piece.series && (
              <span className="app-muted inline-flex items-center gap-1 text-xs">
                <RepeatMarker seriesId={piece.series_id} />
                {cadenceLabel(piece.series.cadence, piece.series.anchor_date)}
              </span>
            )}
          </div>
        </div>
        {canManage && <DeletePostButton piece={piece} />}
      </div>

      <PostTabs hasHistory={history !== null}>
        <TabsContent value="post" className="flex min-w-0 flex-col gap-4">
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <PostCard
                piece={piece}
                extras={extras}
                reloadExtras={reloadExtras}
                canManage={canManage}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <StatusCard piece={piece} owners={owners} canManage={canManage} />
              <InternalNotesCard
                piece={piece}
                tags={extras?.tags ?? null}
                canManage={canManage}
              />
            </div>
          </div>
          <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ScheduleTeamCard
              piece={piece}
              owners={owners}
              tags={extras?.tags ?? null}
              canManage={canManage}
            />
            {repeats}
            <RelatedToCard
              piece={piece}
              tags={extras?.tags ?? null}
              canManage={canManage}
            />
          </div>
          {templateEditor && (
            <PostTemplateCard
              postId={piece.id}
              editor={templateEditor}
              published={piece.content_status === "published"}
              canManage={canManage}
              onGenerated={() => {
                reloadExtras();
                router.refresh();
              }}
            />
          )}
          {children}
        </TabsContent>
        <TabsContent value="share">
          <ShareCard piece={piece} extras={extras} />
        </TabsContent>
        {history !== null && (
          <TabsContent value="history">{history}</TabsContent>
        )}
      </PostTabs>
    </>
  );
}

/**
 * One card's edit form. The update action replaces the whole row, so a save
 * sends the post as it is saved now with only this card's `fields` taken from
 * the form: another card's save, or a status change, since this one opened is
 * kept rather than written back over.
 */
function usePostCardForm(
  piece: SocialPieceRow,
  subject: string,
  fields: readonly (keyof PostFormState)[],
) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() =>
    postFormStateFor(piece, piece.lead_time_days),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const update: PostFormUpdate = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function startEditing() {
    // Re-seeded on every opening: a save elsewhere may have replaced `piece`.
    setForm(postFormStateFor(piece, piece.lead_time_days));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setError(null);
    setEditing(false);
  }

  function submit(
    event: FormEvent<HTMLFormElement>,
    tags: SocialPostTag[] | null,
    onSaved?: () => void,
  ) {
    event.preventDefault();
    setError(null);
    if (tags === null) {
      setError("Still loading this post's tags. Try again in a moment.");
      return;
    }
    const saved = postFormStateFor(piece, piece.lead_time_days);
    const next = { ...saved };
    for (const key of fields) {
      (next as Record<string, unknown>)[key] = form[key];
    }
    startTransition(async () => {
      await runAction(
        () => updateContentPieceAction(piece.id, buildPostFormData(next, tags)),
        {
          success: `${subject} saved.`,
          description: (result) => result.warning,
          onError: setError,
          onSuccess: () => {
            setEditing(false);
            onSaved?.();
            router.refresh();
          },
        },
      );
    });
  }

  return {
    editing,
    form,
    update,
    error,
    setError,
    isPending,
    startEditing,
    cancel,
    submit,
  };
}

function EditableCard({
  title,
  editLabel,
  canEdit,
  editing,
  onEdit,
  error,
  children,
}: {
  title: string;
  editLabel: string;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title}
        </CardTitle>
        {canEdit && (
          <CardEditButton label={editLabel} editing={editing} onEdit={onEdit} />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

function CardFormActions({
  isPending,
  disabled = false,
  onCancel,
}: {
  isPending: boolean;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={isPending || disabled}
        focusableWhenDisabled
      >
        {isPending ? (
          <>
            <Spinner /> Saving...
          </>
        ) : (
          "Save changes"
        )}
      </Button>
    </div>
  );
}

const POST_FIELDS = [
  "title",
  "postFormat",
  "content",
  "collaborators",
] as const;

/** What gets published: title, format, caption, collaborators, tags, media. */
const POST_TABS = ["post", "share", "history"] as const;
type PostTab = (typeof POST_TABS)[number];

/**
 * Three views of the post, in `?tab=`: the post itself with its workflow
 * cards laid across the width rather than down a rail, how to share it (its
 * media shows there, in order, and only there), and its audit history.
 */
function PostTabs({
  hasHistory,
  children,
}: {
  hasHistory: boolean;
  children: ReactNode;
}) {
  const [tab, setTab] = useUrlTabState<PostTab>({
    fallback: "post",
    isValid: (value): value is PostTab =>
      (POST_TABS as readonly string[]).includes(value) &&
      (hasHistory || value !== "history"),
  });

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as PostTab)}
      className="mt-4 flex min-w-0 flex-col gap-4"
    >
      <TabsList variant="line" aria-label="Post views">
        <TabsTrigger value="post">Post</TabsTrigger>
        <TabsTrigger value="share">Share</TabsTrigger>
        {hasHistory && <TabsTrigger value="history">History</TabsTrigger>}
      </TabsList>
      {children}
    </Tabs>
  );
}

/**
 * What goes out, in the order it goes, and the phone share sheet. A skipped
 * post has nothing to share, so it says so instead of loading its media.
 */
function ShareCard({
  piece,
  extras,
}: {
  piece: SocialPieceRow;
  extras: SocialPostExtras | null;
}) {
  const skipped = piece.content_status === "skipped";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">Share</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReadOnlyField label="Media" htmlFor="share-media">
          {!extras ? (
            <Spinner />
          ) : extras.media.length > 0 ? (
            <PostMediaGrid media={extras.media} />
          ) : (
            "—"
          )}
        </ReadOnlyField>
        {skipped ? (
          <Alert>
            <AlertDescription>
              This post is skipped. Change its status to share it.
            </AlertDescription>
          </Alert>
        ) : (
          <ShareToInstagram piece={piece} extras={extras} />
        )}
      </CardContent>
    </Card>
  );
}

function PostCard({
  piece,
  extras,
  reloadExtras,
  canManage,
}: {
  piece: SocialPieceRow;
  extras: SocialPostExtras | null;
  reloadExtras: () => void;
  canManage: boolean;
}) {
  const card = usePostCardForm(piece, "Post", POST_FIELDS);
  // Null until edited, so the saved tags are what a save sends.
  const [editedTags, setTags] = useState<SocialPostTag[] | null>(null);
  const tags = editedTags ?? extras?.tags ?? null;

  function startEditing() {
    setTags(null);
    card.startEditing();
  }

  return (
    <EditableCard
      title="Post"
      editLabel="Edit post"
      canEdit={canManage}
      editing={card.editing}
      onEdit={startEditing}
      error={card.error}
    >
      {card.editing ? (
        <form onSubmit={(event) => card.submit(event, tags, reloadExtras)}>
          <FieldGroup>
            <PostTitleField form={card.form} update={card.update} />
            <PostContentFields
              form={card.form}
              update={card.update}
              tags={tags}
              onTagsChange={setTags}
              extras={extras}
              media={
                extras ? (
                  <div id="piece-media">
                    <PostMediaEditor
                      postId={piece.id}
                      eventId={piece.event_id}
                      media={extras.media}
                      format={card.form.postFormat || null}
                      onChanged={reloadExtras}
                      onError={card.setError}
                    />
                  </div>
                ) : (
                  <Spinner />
                )
              }
            />
          </FieldGroup>
          <CardFormActions
            isPending={card.isPending}
            disabled={tags === null}
            onCancel={card.cancel}
          />
        </form>
      ) : (
        <FieldGroup>
          <PostContentSummary
            piece={piece}
            extras={extras}
            idPrefix="post"
            showMedia={false}
          />
        </FieldGroup>
      )}
    </EditableCard>
  );
}

/**
 * Moves the post along without opening a form. Skipping asks for the reason
 * first.
 */
function StatusCard({
  piece,
  owners,
  canManage,
}: {
  piece: SocialPieceRow;
  owners: CalendarOwner[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Status
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {canManage ? (
          // Keyed on what is saved, so a save that moves the status resets
          // this control's draft rather than leaving it on the old value.
          <StatusControl
            key={`${piece.content_status}:${piece.skip_reason ?? ""}`}
            piece={piece}
          />
        ) : (
          <>
            <ContentStatusBadge status={piece.content_status} />
            {piece.content_status === "skipped" && piece.skip_reason && (
              <ReadOnlyField label="Skip reason" htmlFor="post-skip-reason">
                {piece.skip_reason}
              </ReadOnlyField>
            )}
          </>
        )}
        {piece.status_changed_at && (
          <p className="app-muted text-xs">
            Last changed{" "}
            <ViewerTime iso={piece.status_changed_at} fallbackZone="UTC" /> by{" "}
            {calendarActorName(
              owners,
              piece.status_changed_by,
              "someone no longer listed",
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusControl({ piece }: { piece: SocialPieceRow }) {
  const router = useRouter();
  const [status, setStatus] = useState(piece.content_status);
  const [skipReason, setSkipReason] = useState(piece.skip_reason ?? "");
  const [isPending, startTransition] = useTransition();

  const dirty =
    status !== piece.content_status ||
    (status === "skipped" && skipReason.trim() !== (piece.skip_reason ?? ""));

  function save() {
    startTransition(async () => {
      await runAction(
        () =>
          updateContentPieceStatusAction(
            piece.id,
            status,
            status === "skipped" ? skipReason : null,
          ),
        {
          success: "Status updated.",
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <FieldGroup>
      <Field>
        {/* The card's title already says Status. */}
        <FieldLabel htmlFor="post-status" className="sr-only">
          Status
        </FieldLabel>
        <Select
          value={status}
          onValueChange={(next) => setStatus(next ?? piece.content_status)}
          disabled={isPending}
        >
          <SelectTrigger id="post-status" className="w-full">
            <SelectValue>
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
      {status === "skipped" && (
        <Field>
          <FieldLabel htmlFor="post-skip" required>
            Skip reason
          </FieldLabel>
          <Input
            id="post-skip"
            value={skipReason}
            onChange={(event) => setSkipReason(event.target.value)}
            disabled={isPending}
          />
        </Field>
      )}
      <div>
        <Button
          type="button"
          size="sm"
          disabled={
            !dirty || isPending || (status === "skipped" && !skipReason.trim())
          }
          onClick={save}
        >
          {isPending ? (
            <>
              <Spinner /> Saving...
            </>
          ) : (
            "Update status"
          )}
        </Button>
      </div>
    </FieldGroup>
  );
}

const SCHEDULE_TEAM_FIELDS = [
  "ownerId",
  "reviewerId",
  "publishDueAt",
  "leadTimeDays",
  "draftDueAt",
  "reviewDueAt",
] as const;

/**
 * Who does it and by when, read as the workflow runs: the owner drafts by the
 * draft date, the reviewer reviews by the review date, then it publishes.
 */
function ScheduleTeamCard({
  piece,
  owners,
  tags,
  canManage,
}: {
  piece: SocialPieceRow;
  owners: CalendarOwner[];
  tags: SocialPostTag[] | null;
  canManage: boolean;
}) {
  const card = usePostCardForm(piece, "Schedule & team", SCHEDULE_TEAM_FIELDS);

  return (
    <EditableCard
      title="Schedule & team"
      editLabel="Edit schedule & team"
      canEdit={canManage}
      editing={card.editing}
      onEdit={card.startEditing}
      error={card.error}
    >
      {card.editing ? (
        <form onSubmit={(event) => card.submit(event, tags)}>
          <FieldGroup>
            <PostTeamFields
              form={card.form}
              update={card.update}
              owners={owners}
            />
            <PostScheduleFields
              form={card.form}
              update={card.update}
              onError={card.setError}
            />
          </FieldGroup>
          <CardFormActions
            isPending={card.isPending}
            disabled={tags === null}
            onCancel={card.cancel}
          />
        </form>
      ) : (
        <FieldGroup>
          <Field orientation="responsive">
            <ReadOnlyField label="Owner" htmlFor="post-owner">
              {ownerName(owners, piece.owner_id, "No owner")}
            </ReadOnlyField>
            <ReadOnlyField label="Draft due" htmlFor="post-draft">
              <ViewerTime iso={piece.draft_due_at} fallbackZone="UTC" />
            </ReadOnlyField>
          </Field>
          <Field orientation="responsive">
            <ReadOnlyField label="Reviewer" htmlFor="post-reviewer">
              {ownerName(owners, piece.reviewer_id, "No reviewer")}
            </ReadOnlyField>
            <ReadOnlyField label="Review due" htmlFor="post-review">
              <ViewerTime iso={piece.review_due_at} fallbackZone="UTC" />
            </ReadOnlyField>
          </Field>
          <Field orientation="responsive">
            <ReadOnlyField label="Publish date" htmlFor="post-publish">
              {piece.publish_due_at ? (
                <ViewerTime iso={piece.publish_due_at} fallbackZone="UTC" />
              ) : (
                "Unscheduled"
              )}
            </ReadOnlyField>
            <ReadOnlyField label="Lead time" htmlFor="post-lead-time">
              {piece.lead_time_days} days
            </ReadOnlyField>
          </Field>
        </FieldGroup>
      )}
    </EditableCard>
  );
}

const RELATED_FIELDS = ["eventId", "calendarItemId", "programId"] as const;

function RelatedToCard({
  piece,
  tags,
  canManage,
}: {
  piece: SocialPieceRow;
  tags: SocialPostTag[] | null;
  canManage: boolean;
}) {
  const card = usePostCardForm(piece, "Related to", RELATED_FIELDS);

  return (
    <EditableCard
      title="Related to"
      editLabel="Edit related to"
      canEdit={canManage}
      editing={card.editing}
      onEdit={card.startEditing}
      error={card.error}
    >
      {card.editing ? (
        <form onSubmit={(event) => card.submit(event, tags)}>
          <RelatedToEditor form={card.form} update={card.update} />
          <CardFormActions
            isPending={card.isPending}
            disabled={tags === null}
            onCancel={card.cancel}
          />
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <RelatedChips piece={piece} showStandalone />
        </div>
      )}
    </EditableCard>
  );
}

/** Mounted only while editing, so the options load only when needed. */
function RelatedToEditor({
  form,
  update,
}: {
  form: PostFormState;
  update: PostFormUpdate;
}) {
  const linkOptions = useLinkOptions();
  return (
    <PostRelatedToFields
      form={form}
      update={update}
      linkOptions={linkOptions}
      legend={false}
    />
  );
}

const NOTES_FIELDS = ["internalNotes"] as const;

function InternalNotesCard({
  piece,
  tags,
  canManage,
}: {
  piece: SocialPieceRow;
  tags: SocialPostTag[] | null;
  canManage: boolean;
}) {
  const card = usePostCardForm(piece, "Internal notes", NOTES_FIELDS);

  return (
    <EditableCard
      title="Internal notes"
      editLabel="Edit internal notes"
      canEdit={canManage}
      editing={card.editing}
      onEdit={card.startEditing}
      error={card.error}
    >
      {card.editing ? (
        <form onSubmit={(event) => card.submit(event, tags)}>
          <PostInternalNotesField
            form={card.form}
            update={card.update}
            hideLabel
          />
          <CardFormActions
            isPending={card.isPending}
            disabled={tags === null}
            onCancel={card.cancel}
          />
        </form>
      ) : (
        <p className="text-sm whitespace-pre-wrap">
          {piece.internal_notes || <span className="app-muted">No notes.</span>}
        </p>
      )}
    </EditableCard>
  );
}

function DeletePostButton({ piece }: { piece: SocialPieceRow }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await runAction(() => deleteContentPieceAction(piece.id), {
        success: "Social post deleted.",
        onError: () => setConfirming(false),
        onSuccess: () => {
          setConfirming(false);
          router.push("/portal/social");
        },
      });
    });
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              aria-label="Delete social post"
              onClick={() => setConfirming(true)}
            />
          }
        >
          <Trash2 />
        </TooltipTrigger>
        <TooltipContent>Delete social post</TooltipContent>
      </Tooltip>
      <AlertDialog
        open={confirming}
        onOpenChange={(next) => !next && setConfirming(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{piece.title}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this social post and everything written
              on it. Whatever it is related to is untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending ? (
                <>
                  <Spinner /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
