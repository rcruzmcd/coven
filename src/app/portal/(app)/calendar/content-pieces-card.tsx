"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { nextDueAt, type ContentPieceRow } from "@/lib/social-content/pieces";
import { ContentStatusBadge } from "@/components/portal/social-content/content-status-badge";
import {
  SocialPostSheet,
  type SocialPostSheetSession,
} from "@/components/portal/social-content/social-post-sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ownerName } from "./calendar-shared";
import type { CalendarOwner } from "./calendar-shared";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

/**
 * The social content planned for one calendar item (#1231).
 *
 * A calendar item produces several posts or stories, not one brief, so this is
 * a list of posts with the shared social post sheet (#1793) behind each one.
 * A post added here is related to this item to start with; the sheet's
 * Related to picker can add an event or move it elsewhere.
 */
export function ContentPiecesCard({
  calendarItemId,
  itemStartsAt,
  pieces,
  owners,
  defaultLeadTimeDays,
  canManage,
  isSensitiveTopic,
  toneGuidance,
  className,
}: {
  calendarItemId: string;
  itemStartsAt: string;
  pieces: ContentPieceRow[];
  owners: CalendarOwner[];
  defaultLeadTimeDays: number;
  canManage: boolean;
  isSensitiveTopic: boolean;
  toneGuidance: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Kept after closing so the sheet keeps its content while it animates out.
  const [session, setSession] = useState<SocialPostSheetSession | null>(null);

  function openSheet(piece: ContentPieceRow | null, mode: "view" | "edit") {
    setSession((prev) => ({ key: (prev?.key ?? 0) + 1, piece, mode }));
    setOpen(true);
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Social content
        </CardTitle>
        {canManage && pieces.length > 0 && (
          <CardAction>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => openSheet(null, "edit")}
            >
              <Plus /> Add social post
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isSensitiveTopic && (
          <Alert>
            <AlertDescription>
              <strong>Sensitive topic.</strong>{" "}
              {toneGuidance ??
                "Add tone guidance on this item's Details tab so it's surfaced here for whoever writes this content."}
            </AlertDescription>
          </Alert>
        )}

        {pieces.length === 0 ? (
          <EmptyState
            className="py-4"
            title="No social posts planned for this item yet"
            description={
              canManage
                ? "Add a social post for each post or story this moment should produce."
                : "Social posts appear here once a content manager plans them."
            }
            action={
              canManage ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => openSheet(null, "edit")}
                >
                  <Plus /> Add social post
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {pieces.map((row) => {
              const due = nextDueAt(row);
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium" title={row.title}>
                      {row.title}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <ContentStatusBadge status={row.content_status} />
                      <span className="app-muted text-xs">
                        {ownerName(owners, row.owner_id, "No owner")}
                      </span>
                      <span className="app-muted text-xs">
                        {due ? `Due ${formatDateTime(due)}` : "No dates set"}
                      </span>
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`View ${row.title}`}
                          onClick={() => openSheet(row, "view")}
                        />
                      }
                    >
                      <Pencil />
                    </TooltipTrigger>
                    <TooltipContent>View social post</TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <SocialPostSheet
        open={open}
        session={session}
        onClose={() => setOpen(false)}
        owners={owners}
        defaultLeadTimeDays={defaultLeadTimeDays}
        canManage={canManage}
        defaults={{ calendarItemId, publishDueAt: itemStartsAt }}
        newPostDescription="One social post or story for this calendar item."
      />
    </Card>
  );
}
