"use client";

import { type ComponentProps, FormEvent, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  INTERNAL_NOTES_POLICY,
  PostContentFields,
  PostInternalNotesField,
  PostMediaEditor,
  PostRelatedToFields,
  PostScheduleFields,
  PostStatusFields,
  PostTeamFields,
  PostTitleField,
  buildPostFormData,
  linkedLabel,
  postFormStateFor,
  useLinkOptions,
  type PostFormState,
  type SocialPostDefaults,
} from "./post-form";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import {
  createContentPieceAction,
  deleteContentPieceAction,
  updateContentPieceAction,
} from "@/lib/social-content/piece-actions";
import type { ContentPieceRow } from "@/lib/social-content/pieces";
import type { SocialPostTag } from "@/lib/social-content/post-content-actions";
import { ContentStatusBadge } from "./content-status-badge";
import { ShareToInstagram } from "./share-to-instagram";
import { PostContentSummary, usePostExtras } from "./post-content-fields";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  calendarActorName,
  ownerName,
  type CalendarOwner,
} from "@/app/portal/(app)/calendar/calendar-shared";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

export type { SocialPostDefaults } from "./post-form";

/** One opening of the sheet: the post shown, or `null` for a new one. */
export type SocialPostSheetSession = {
  key: number;
  piece: ContentPieceRow | null;
  mode: "view" | "edit";
};

/**
 * The sheet behind one social post (#1231, shared since #1793): read it, edit
 * it, or add a new one. The calendar item card, event detail and
 * `/portal/social` all open this one sheet.
 */
export function SocialPostSheet({
  open,
  session,
  onClose,
  owners,
  defaultLeadTimeDays,
  canManage,
  defaults = {},
  newPostDescription = "One social post or story.",
  onDeleted,
}: {
  open: boolean;
  /** Kept by the caller after closing, so the closing sheet keeps its content. */
  session: SocialPostSheetSession | null;
  onClose: () => void;
  owners: CalendarOwner[];
  defaultLeadTimeDays: number;
  canManage: boolean;
  defaults?: SocialPostDefaults;
  newPostDescription?: string;
  /**
   * Called instead of refreshing once the post is deleted, for a page that is
   * about the post itself and so has nothing left to show (#1794).
   */
  onDeleted?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" showCloseButton={false}>
        {session && (
          <SocialPostSheetBody
            key={session.key}
            piece={session.piece}
            initialMode={session.mode}
            onClose={onClose}
            owners={owners}
            defaultLeadTimeDays={defaultLeadTimeDays}
            canManage={canManage}
            defaults={defaults}
            newPostDescription={newPostDescription}
            onDeleted={onDeleted}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The new-post form as a page of its own (`/portal/social/new`), the form the
 * sheet shows for a new post. Cancel goes back to `cancelHref`; adding the post
 * opens it, where its media can be added.
 */
export function NewSocialPostForm({
  owners,
  defaultLeadTimeDays,
  defaults = {},
  cancelHref,
}: {
  owners: CalendarOwner[];
  defaultLeadTimeDays: number;
  defaults?: SocialPostDefaults;
  cancelHref: string;
}) {
  const router = useRouter();
  return (
    <SocialPostSheetBody
      layout="page"
      piece={null}
      initialMode="edit"
      onClose={() => router.push(cancelHref)}
      onCreated={(id) => router.push(`/portal/social/${id}`)}
      owners={owners}
      defaultLeadTimeDays={defaultLeadTimeDays}
      canManage
      defaults={defaults}
      newPostDescription=""
    />
  );
}

function SocialPostSheetBody({
  layout = "sheet",
  piece,
  initialMode,
  onClose,
  onCreated,
  owners,
  defaultLeadTimeDays,
  canManage,
  defaults,
  newPostDescription,
  onDeleted,
}: {
  /** `page` drops the sheet's header and lets the form flow with the page. */
  layout?: "sheet" | "page";
  piece: ContentPieceRow | null;
  initialMode: "view" | "edit";
  onClose: () => void;
  /** Called instead of closing once a new post is added. */
  onCreated?: (id: string) => void;
  owners: CalendarOwner[];
  defaultLeadTimeDays: number;
  canManage: boolean;
  defaults: SocialPostDefaults;
  newPostDescription: string;
  onDeleted?: () => void;
}) {
  const isPage = layout === "page";
  const router = useRouter();
  const linkOptions = useLinkOptions();
  const { extras, reload: reloadExtras } = usePostExtras(
    piece?.id ?? null,
    piece ? piece.event_id : (defaults.eventId ?? null),
  );
  // Null until the saved tags arrive, so a save can never send an empty list
  // over tags it has not read yet.
  const [editedTags, setTags] = useState<SocialPostTag[] | null>(null);
  const tags = editedTags ?? extras?.tags ?? null;
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState<PostFormState>(() =>
    postFormStateFor(piece, defaultLeadTimeDays, defaults),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formId = "social-post-form";

  function update<K extends keyof PostFormState>(
    key: K,
    value: PostFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (tags === null) {
      setError("Still loading this post's tags. Try again in a moment.");
      return;
    }
    const formData = buildPostFormData(form, tags);

    startTransition(async () => {
      await runAction(
        () =>
          piece
            ? updateContentPieceAction(piece.id, formData)
            : createContentPieceAction(formData),
        {
          success: piece ? "Social post saved." : "Social post added.",
          description: (result) => result.warning,
          onError: setError,
          onSuccess: (result) => {
            if (!piece && onCreated && result.id) {
              onCreated(result.id);
              return;
            }
            onClose();
            router.refresh();
          },
        },
      );
    });
  }

  function handleDelete() {
    if (!piece) return;
    startTransition(async () => {
      await runAction(() => deleteContentPieceAction(piece.id), {
        success: "Social post deleted.",
        onError: (message) => {
          setConfirmDelete(false);
          setError(message);
        },
        onSuccess: () => {
          setConfirmDelete(false);
          onClose();
          if (onDeleted) onDeleted();
          else router.refresh();
        },
      });
    });
  }

  const Footer = isPage ? PageFooter : SheetFooter;

  const relatedEvent = linkedLabel(
    linkOptions?.events,
    piece?.event_id ?? null,
    "An event",
  );
  const relatedItem = linkedLabel(
    linkOptions?.calendarItems,
    piece?.calendar_item_id ?? null,
    "A community date",
  );
  const relatedProgram = linkedLabel(
    linkOptions?.programs,
    piece?.program_id ?? null,
    "A program",
  );

  return (
    <>
      {!isPage && (
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  onClick={onClose}
                />
              }
            >
              <ArrowLeft />
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
          <div className="flex flex-1 flex-col gap-0.5">
            <SheetTitle>
              {piece
                ? mode === "edit"
                  ? "Edit social post"
                  : "Social post"
                : "Add social post"}
            </SheetTitle>
            <SheetDescription>
              {piece?.title ?? newPostDescription}
            </SheetDescription>
          </div>
          {piece && mode === "view" && canManage && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit social post"
                    onClick={() => setMode("edit")}
                  />
                }
              >
                <Pencil />
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          )}
        </SheetHeader>
      )}

      {mode === "view" && piece ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <FieldGroup>
            <ContentStatusBadge status={piece.content_status} />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {piece.content_status === "skipped" && piece.skip_reason && (
              <ReadOnlyField
                label="Skip reason"
                htmlFor="piece-view-skip-reason"
              >
                {piece.skip_reason}
              </ReadOnlyField>
            )}
            <ReadOnlyField label="Related to" htmlFor="piece-view-related">
              {[relatedEvent, relatedItem, relatedProgram]
                .filter(Boolean)
                .join("; ") || "Nothing"}
            </ReadOnlyField>
            <Field orientation="responsive">
              <ReadOnlyField label="Owner" htmlFor="piece-view-owner">
                {ownerName(owners, piece.owner_id)}
              </ReadOnlyField>
              <ReadOnlyField label="Reviewer" htmlFor="piece-view-reviewer">
                {ownerName(owners, piece.reviewer_id)}
              </ReadOnlyField>
            </Field>
            <ReadOnlyField label="Lead time" htmlFor="piece-view-lead-time">
              {piece.lead_time_days} days
            </ReadOnlyField>
            <Field orientation="responsive">
              <ReadOnlyField label="Draft due" htmlFor="piece-view-draft">
                {formatDateTime(piece.draft_due_at)}
              </ReadOnlyField>
              <ReadOnlyField label="Review due" htmlFor="piece-view-review">
                {formatDateTime(piece.review_due_at)}
              </ReadOnlyField>
              <ReadOnlyField label="Publish date" htmlFor="piece-view-publish">
                {piece.publish_due_at
                  ? formatDateTime(piece.publish_due_at)
                  : "Unscheduled"}
              </ReadOnlyField>
            </Field>
            <Field>
              <ReadOnlyField
                label="Internal notes"
                htmlFor="piece-view-internal-notes"
              >
                {piece.internal_notes || "—"}
              </ReadOnlyField>
              <FieldDescription>{INTERNAL_NOTES_POLICY}</FieldDescription>
            </Field>
            <PostContentSummary
              piece={piece}
              extras={extras}
              idPrefix="piece-view"
            />
            <ShareToInstagram piece={piece} extras={extras} />
            {piece.status_changed_at && (
              <p className="app-muted text-xs">
                Status last changed {formatDateTime(piece.status_changed_at)} by{" "}
                {calendarActorName(
                  owners,
                  piece.status_changed_by,
                  "someone no longer listed",
                )}
              </p>
            )}
          </FieldGroup>
        </div>
      ) : (
        <form
          id={formId}
          onSubmit={handleSubmit}
          className={isPage ? "flex flex-col" : "flex min-h-0 flex-1 flex-col"}
        >
          <div
            className={isPage ? undefined : "flex-1 overflow-y-auto px-4 pb-4"}
          >
            <FieldGroup>
              <RequiredFieldsNote />
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <PostTitleField form={form} update={update} />
              <PostRelatedToFields
                form={form}
                update={update}
                linkOptions={linkOptions}
              />
              <fieldset className="flex min-w-0 flex-col gap-4">
                <legend className="mb-2 text-sm font-medium">Content</legend>
                <PostContentFields
                  form={form}
                  update={update}
                  tags={tags}
                  onTagsChange={setTags}
                  extras={extras}
                  media={
                    !piece ? (
                      <FieldDescription id="piece-media">
                        Add the post first, then open it to add photos and
                        videos.
                      </FieldDescription>
                    ) : extras ? (
                      <div id="piece-media">
                        <PostMediaEditor
                          postId={piece.id}
                          eventId={piece.event_id}
                          media={extras.media}
                          format={form.postFormat || null}
                          onChanged={reloadExtras}
                          onError={setError}
                        />
                      </div>
                    ) : (
                      <Spinner />
                    )
                  }
                />
              </fieldset>
              <PostStatusFields form={form} update={update} />
              <PostTeamFields form={form} update={update} owners={owners} />
              <PostScheduleFields
                form={form}
                update={update}
                onError={setError}
              />
              <PostInternalNotesField form={form} update={update} />
            </FieldGroup>
          </div>
        </form>
      )}

      {mode === "edit" && (
        <Footer className="items-center justify-between">
          {piece ? (
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            form={formId}
            disabled={isPending || tags === null}
          >
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : piece ? (
              "Save changes"
            ) : (
              "Add social post"
            )}
          </Button>
        </Footer>
      )}

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(next) => !next && setConfirmDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{piece?.title}&rdquo;?
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

/** The sheet footer's place on a page: the actions under the form. */
function PageFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-6 flex flex-row gap-2 border-t pt-4", className)}
      {...props}
    />
  );
}
