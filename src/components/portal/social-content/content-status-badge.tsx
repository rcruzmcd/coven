import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import {
  CONTENT_STATUSES,
  summaryContentStatus,
  type ContentPieceRow,
} from "@/lib/social-content/pieces";

const CONTENT_STATUS_STYLES: Record<string, StatusTone> = {
  not_planned: "neutral",
  idea: "neutral",
  draft: "progress",
  in_review: "progress",
  changes_requested: "danger",
  approved: "success",
  scheduled: "success",
  published: "success",
  skipped: "neutral",
};

export function ContentStatusBadge({ status }: { status: string }) {
  const label =
    CONTENT_STATUSES.find((option) => option.value === status)?.label ?? status;
  return (
    <StatusBadge tone={CONTENT_STATUS_STYLES[status] ?? "neutral"}>
      {label}
    </StatusBadge>
  );
}

/**
 * Where a calendar item's content stands, for the list and agenda views: the
 * status of the least-advanced piece still needing work, and how many pieces
 * there are once there is more than one (#1231). An item with no pieces shows
 * nothing rather than "Not planned" -- there is nothing to be not-planned yet.
 */
export function ContentPiecesBadge({
  pieces,
}: {
  pieces: Pick<ContentPieceRow, "content_status">[];
}) {
  const status = summaryContentStatus(pieces);
  if (!status) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <ContentStatusBadge status={status} />
      {pieces.length > 1 && (
        <span className="app-muted text-xs">{pieces.length} posts</span>
      )}
    </span>
  );
}
