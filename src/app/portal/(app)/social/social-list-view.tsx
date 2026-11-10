import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/portal/empty-state";
import { ContentStatusBadge } from "@/components/portal/social-content/content-status-badge";
import { ViewerTime } from "@/components/viewer-time";
import { socialPieceHref } from "@/lib/social-content/social-filters";
import type { SocialPieceRow } from "@/lib/social-content/queries";
import { ownerName, type CalendarOwner } from "../calendar/calendar-shared";
import { RelatedChips } from "./related-chips";

/** The scheduled posts in publish-date order (#1794); undated ones are in the tray. */
export function SocialListView({
  pieces,
  owners,
}: {
  pieces: SocialPieceRow[];
  owners: CalendarOwner[];
}) {
  return (
    <Card>
      <CardContent>
        {pieces.length === 0 ? (
          <EmptyState
            className="py-4"
            title="No scheduled social posts"
            description="Posts with a publish date that match these filters show here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Publish date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead hideBelow="sm">Owner</TableHead>
                <TableHead hideBelow="xl">Reviewer</TableHead>
                <TableHead hideBelow="md">Related to</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pieces.map((piece) => (
                <TableRow key={piece.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={socialPieceHref(piece.id)}
                      className="hover:underline"
                    >
                      {piece.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ViewerTime iso={piece.publish_due_at} fallbackZone="UTC" />
                  </TableCell>
                  <TableCell>
                    <ContentStatusBadge status={piece.content_status} />
                  </TableCell>
                  <TableCell hideBelow="sm">
                    {ownerName(owners, piece.owner_id, "No owner")}
                  </TableCell>
                  <TableCell hideBelow="xl">
                    {ownerName(owners, piece.reviewer_id, "No reviewer")}
                  </TableCell>
                  <TableCell hideBelow="md">
                    <RelatedChips piece={piece} showStandalone />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Posts with no publish date yet (#1794): nothing to place them on. */
export function UnscheduledTray({
  pieces,
  owners,
}: {
  pieces: SocialPieceRow[];
  owners: CalendarOwner[];
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          Unscheduled{" "}
          <span className="app-muted font-normal">({pieces.length})</span>
        </h2>
        {pieces.length === 0 ? (
          <p className="app-muted text-xs">
            Every post that matches these filters has a publish date.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {pieces.map((piece) => (
              <li key={piece.id} className="flex flex-col gap-1 py-2">
                <Link
                  href={socialPieceHref(piece.id)}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {piece.title}
                </Link>
                <span className="flex flex-wrap items-center gap-2">
                  <ContentStatusBadge status={piece.content_status} />
                  <span className="app-muted text-xs">
                    {ownerName(owners, piece.owner_id, "No owner")}
                  </span>
                  <RelatedChips piece={piece} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
