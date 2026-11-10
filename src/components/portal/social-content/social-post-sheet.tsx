"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import {
  createContentPieceAction,
  deleteContentPieceAction,
  listSocialContentLinkOptionsAction,
  updateContentPieceAction,
  type SocialContentLinkOption,
  type SocialContentLinkOptions,
} from "@/lib/social-content/piece-actions";
import {
  CONTENT_STATUSES,
  leadTimeSchedule,
  type ContentPieceRow,
} from "@/lib/social-content/pieces";
import { ContentStatusBadge } from "./content-status-badge";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ownerOptions,
  type CalendarOwner,
} from "@/app/portal/(app)/calendar/calendar-shared";
import { PersonSelect } from "@/app/portal/(app)/people/person-select";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime, formatInstantDate } from "@/lib/format";
import { utcIsoToDatetimeLocalInBrowser } from "@/lib/time";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

const INTERNAL_NOTES_POLICY =
  "Staff-only working notes. Never record specific personal, medical, legal, or confidential case details here.";

const NONE = "none";

/**
 * What a new post starts out with when it is added from somewhere: the item
 * or event it is added from is its Related to link, and a publish date to
 * suggest (the item's or event's start). All optional -- a post added from
 * `/portal/social` starts related to nothing and unscheduled.
 */
export type SocialPostDefaults = {
  calendarItemId?: string | null;
  eventId?: string | null;
  publishDueAt?: string | null;
};

/** One opening of the sheet: the post shown, or `null` for a new one. */
export type SocialPostSheetSession = {
  key: number;
  piece: ContentPieceRow | null;
  mode: "view" | "edit";
};

function formStateFor(
  piece: ContentPieceRow | null,
  defaultLeadTimeDays: number,
  defaults: SocialPostDefaults,
) {
  return {
    title: piece?.title ?? "",
    content: piece?.content ?? "",
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
  };
}

type FormState = ReturnType<typeof formStateFor>;

function optionLabel(option: SocialContentLinkOption) {
  return `${option.label} · ${formatInstantDate(option.starts_at)}`;
}

/** Loads what the Related to picker offers, once per opening of the sheet. */
function useLinkOptions() {
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
function linkedLabel(
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
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={noneLabel}>
            {(selected: string) =>
              selected === NONE
                ? noneLabel
                : linkedLabel(options, selected, unknownLabel)
            }
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
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SocialPostSheetBody({
  piece,
  initialMode,
  onClose,
  owners,
  defaultLeadTimeDays,
  canManage,
  defaults,
  newPostDescription,
}: {
  piece: ContentPieceRow | null;
  initialMode: "view" | "edit";
  onClose: () => void;
  owners: CalendarOwner[];
  defaultLeadTimeDays: number;
  canManage: boolean;
  defaults: SocialPostDefaults;
  newPostDescription: string;
}) {
  const router = useRouter();
  const linkOptions = useLinkOptions();
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState<FormState>(() =>
    formStateFor(piece, defaultLeadTimeDays, defaults),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formId = "social-post-form";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyLeadTimeDefaults() {
    if (!form.publishDueAt) return;
    const leadTimeDays = Number(form.leadTimeDays);
    if (!Number.isInteger(leadTimeDays) || leadTimeDays <= 0) {
      setError("Set a valid lead time before applying defaults.");
      return;
    }
    const { draftDueAt, reviewDueAt } = leadTimeSchedule(
      new Date(form.publishDueAt),
      leadTimeDays,
    );
    setError(null);
    setForm((prev) => ({
      ...prev,
      draftDueAt: utcIsoToDatetimeLocalInBrowser(draftDueAt.toISOString()),
      reviewDueAt: utcIsoToDatetimeLocalInBrowser(reviewDueAt.toISOString()),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("title", form.title);
    formData.set("content", form.content);
    formData.set("contentStatus", form.contentStatus);
    formData.set("skipReason", form.skipReason);
    formData.set("internalNotes", form.internalNotes);
    formData.set("ownerId", form.ownerId);
    formData.set("reviewerId", form.reviewerId);
    formData.set("leadTimeDays", form.leadTimeDays);
    formData.set("calendarItemId", form.calendarItemId);
    formData.set("eventId", form.eventId);
    // Converted here, in the browser, so each due instant is fixed using the
    // user's own timezone rather than the server's.
    for (const key of ["publishDueAt", "reviewDueAt", "draftDueAt"] as const) {
      formData.set(key, form[key] ? new Date(form[key]).toISOString() : "");
    }

    startTransition(async () => {
      await runAction(
        () =>
          piece
            ? updateContentPieceAction(piece.id, formData)
            : createContentPieceAction(formData),
        {
          success: piece ? "Social post saved." : "Social post added.",
          onError: setError,
          onSuccess: () => {
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
          router.refresh();
        },
      });
    });
  }

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

  return (
    <>
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
              {[relatedEvent, relatedItem].filter(Boolean).join("; ") ||
                "Nothing"}
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
            <ReadOnlyField label="Content" htmlFor="piece-view-content">
              <span className="whitespace-pre-wrap">
                {piece.content || "—"}
              </span>
            </ReadOnlyField>
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
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <RequiredFieldsNote />
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

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

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Related to</legend>
                <Field orientation="responsive">
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
                </Field>
                <FieldDescription>
                  An event, a community date, both, or neither.
                </FieldDescription>
              </fieldset>

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
                          CONTENT_STATUSES.find(
                            (option) => option.value === value,
                          )?.label
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
                  <FieldLabel htmlFor="piece-skipReason">
                    Skip reason
                  </FieldLabel>
                  <Input
                    id="piece-skipReason"
                    placeholder={
                      form.contentStatus === "skipped"
                        ? "Reason (required)"
                        : "Only used when skipped"
                    }
                    value={form.skipReason}
                    onChange={(event) =>
                      update("skipReason", event.target.value)
                    }
                  />
                </Field>
              </Field>

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
                    onChange={(personId) =>
                      update("reviewerId", personId ?? "")
                    }
                    noneLabel="No reviewer"
                  />
                </Field>
              </Field>

              <Field orientation="responsive">
                <Field>
                  <FieldLabel htmlFor="piece-publishDueAt">
                    Publish date
                  </FieldLabel>
                  <Input
                    id="piece-publishDueAt"
                    type="datetime-local"
                    value={form.publishDueAt}
                    onChange={(event) =>
                      update("publishDueAt", event.target.value)
                    }
                  />
                  <FieldDescription>
                    Leave empty to keep it unscheduled.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="piece-leadTimeDays">
                    Lead time (days)
                  </FieldLabel>
                  <Input
                    id="piece-leadTimeDays"
                    type="number"
                    min={1}
                    step={1}
                    value={form.leadTimeDays}
                    onChange={(event) =>
                      update("leadTimeDays", event.target.value)
                    }
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
                    onChange={(event) =>
                      update("draftDueAt", event.target.value)
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="piece-reviewDueAt">
                    Review due
                  </FieldLabel>
                  <Input
                    id="piece-reviewDueAt"
                    type="datetime-local"
                    value={form.reviewDueAt}
                    onChange={(event) =>
                      update("reviewDueAt", event.target.value)
                    }
                  />
                </Field>
              </Field>

              <Field>
                <FieldLabel htmlFor="piece-internalNotes">
                  Internal notes
                </FieldLabel>
                <Textarea
                  id="piece-internalNotes"
                  value={form.internalNotes}
                  onChange={(event) =>
                    update("internalNotes", event.target.value)
                  }
                />
                <FieldDescription>{INTERNAL_NOTES_POLICY}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="piece-content">Content</FieldLabel>
                <Textarea
                  id="piece-content"
                  className="min-h-64"
                  placeholder="The angle, the channels, the call to action, what's still outstanding — whatever order you think in."
                  value={form.content}
                  onChange={(event) => update("content", event.target.value)}
                />
              </Field>
            </FieldGroup>
          </div>
        </form>
      )}

      {mode === "edit" && (
        <SheetFooter className="items-center justify-between">
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
          <Button type="submit" form={formId} disabled={isPending}>
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
        </SheetFooter>
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
