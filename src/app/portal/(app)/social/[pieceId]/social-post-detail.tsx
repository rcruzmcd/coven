"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { runAction } from "@/components/portal/action-toast";
import { ContentStatusBadge } from "@/components/portal/social-content/content-status-badge";
import {
  PostContentSummary,
  usePostExtras,
} from "@/components/portal/social-content/post-content-fields";
import {
  SocialPostSheet,
  type SocialPostSheetSession,
} from "@/components/portal/social-content/social-post-sheet";
import { CONTENT_STATUSES } from "@/lib/social-content/pieces";
import { updateContentPieceStatusAction } from "@/lib/social-content/piece-actions";
import type { SocialPieceRow } from "@/lib/social-content/queries";
import { ViewerTime } from "@/components/viewer-time";
import {
  calendarActorName,
  ownerName,
  type CalendarOwner,
} from "../../calendar/calendar-shared";
import { RelatedChips } from "../related-chips";
import { RepeatMarker } from "@/components/portal/social-content/repeat-marker";
import { cadenceLabel } from "@/lib/social-content/series";

export function SocialPostDetail({
  piece,
  owners,
  defaultLeadTimeDays,
  canManage,
}: {
  piece: SocialPieceRow;
  owners: CalendarOwner[];
  defaultLeadTimeDays: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [session, setSession] = useState<SocialPostSheetSession | null>(null);
  const { extras, reload: reloadExtras } = usePostExtras(
    piece.id,
    piece.event_id,
  );

  function openEdit() {
    setSession((prev) => ({ key: (prev?.key ?? 0) + 1, piece, mode: "edit" }));
    setSheetOpen(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="brand-display text-3xl font-semibold tracking-brand sm:text-4xl">
            {piece.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <ContentStatusBadge status={piece.content_status} />
            <RelatedChips piece={piece} showStandalone />
            {piece.series && (
              <span className="app-muted inline-flex items-center gap-1 text-xs">
                <RepeatMarker seriesId={piece.series_id} />
                {cadenceLabel(piece.series.cadence, piece.series.anchor_date)}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <Button type="button" variant="secondary" onClick={openEdit}>
            <Pencil /> Edit
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field orientation="responsive">
                <ReadOnlyField label="Owner" htmlFor="post-owner">
                  {ownerName(owners, piece.owner_id, "No owner")}
                </ReadOnlyField>
                <ReadOnlyField label="Reviewer" htmlFor="post-reviewer">
                  {ownerName(owners, piece.reviewer_id, "No reviewer")}
                </ReadOnlyField>
              </Field>
              <Field orientation="responsive">
                <ReadOnlyField label="Draft due" htmlFor="post-draft">
                  <ViewerTime iso={piece.draft_due_at} fallbackZone="UTC" />
                </ReadOnlyField>
                <ReadOnlyField label="Review due" htmlFor="post-review">
                  <ViewerTime iso={piece.review_due_at} fallbackZone="UTC" />
                </ReadOnlyField>
                <ReadOnlyField label="Publish date" htmlFor="post-publish">
                  {piece.publish_due_at ? (
                    <ViewerTime iso={piece.publish_due_at} fallbackZone="UTC" />
                  ) : (
                    "Unscheduled"
                  )}
                </ReadOnlyField>
              </Field>
              <ReadOnlyField label="Lead time" htmlFor="post-lead-time">
                {piece.lead_time_days} days
              </ReadOnlyField>
              {piece.content_status === "skipped" && piece.skip_reason && (
                <ReadOnlyField label="Skip reason" htmlFor="post-skip-reason">
                  {piece.skip_reason}
                </ReadOnlyField>
              )}
              <ReadOnlyField label="Internal notes" htmlFor="post-notes">
                {piece.internal_notes || "—"}
              </ReadOnlyField>
              <PostContentSummary
                piece={piece}
                extras={extras}
                idPrefix="post"
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {canManage ? (
              // Keyed on what is saved, so an edit through the sheet that
              // moves the status resets this control's draft rather than
              // leaving it on the old value, one click from undoing the save.
              <StatusControl
                key={`${piece.content_status}:${piece.skip_reason ?? ""}`}
                piece={piece}
              />
            ) : (
              <ContentStatusBadge status={piece.content_status} />
            )}
            {piece.status_changed_at && (
              <p className="app-muted text-xs">
                Last changed{" "}
                <ViewerTime iso={piece.status_changed_at} fallbackZone="UTC" />{" "}
                by{" "}
                {calendarActorName(
                  owners,
                  piece.status_changed_by,
                  "someone no longer listed",
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <SocialPostSheet
          open={sheetOpen}
          session={session}
          onClose={() => {
            setSheetOpen(false);
            // Tags and media may have changed in the sheet.
            reloadExtras();
          }}
          owners={owners}
          defaultLeadTimeDays={defaultLeadTimeDays}
          canManage={canManage}
          onDeleted={() => router.push("/portal/social")}
        />
      )}
    </>
  );
}

/**
 * Moves the post along without opening the full form. Skipping asks for the
 * reason first, as the form does.
 */
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
        <FieldLabel htmlFor="post-status">Status</FieldLabel>
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
