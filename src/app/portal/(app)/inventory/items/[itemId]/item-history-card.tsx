import { MarkdownText } from "@/components/portal/markdown-text";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatCalendarDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ViewerTime } from "@/components/viewer-time";
import type {
  DonatedEntry,
  HistoryEntry,
  MovementEntry,
  TagEntry,
} from "./item-history";

const DATE_ONLY: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const MOVEMENT_BADGE: Record<
  string,
  "progress" | "success" | "warning" | "destructive" | "muted"
> = {
  received: "success",
  distributed: "progress",
  reserved: "warning",
  damaged: "destructive",
  lost: "destructive",
};

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

/** A label and value, left out entirely when there is no value. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === false) return null;
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="app-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DonatedItem({ entry }: { entry: DonatedEntry }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">Donated</Badge>
        <span className="app-muted text-sm">
          {entry.donatedOn ? (
            formatCalendarDate(entry.donatedOn)
          ) : (
            <ViewerTime
              iso={entry.occurredAt}
              fallbackZone="UTC"
              options={DATE_ONLY}
            />
          )}
        </span>
      </div>
      <dl className="mt-2 flex flex-col gap-1 text-sm">
        <Detail label="Donor">
          {entry.donor && (
            <>
              <TextLink href={entry.donor.href}>{entry.donor.label}</TextLink>
              {entry.donor.kind && (
                <span className="app-muted"> · {entry.donor.kind}</span>
              )}
            </>
          )}
        </Detail>
        <Detail label="Event">
          {entry.event && (
            <TextLink href={entry.event.href}>{entry.event.label}</TextLink>
          )}
        </Detail>
        <Detail label="Came in by">{entry.intakeRoute}</Detail>
        <Detail label="Recorded by">{entry.recordedBy}</Detail>
        <Detail label="Notes">
          {entry.notes && <MarkdownText>{entry.notes}</MarkdownText>}
        </Detail>
      </dl>
    </>
  );
}

function MovementItem({ entry }: { entry: MovementEntry }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={MOVEMENT_BADGE[entry.type] ?? "muted"}>
          {entry.typeLabel}
        </Badge>
        {entry.quantity && <span className="text-sm">× {entry.quantity}</span>}
        <span className="app-muted text-sm">
          {entry.href ? (
            <TextLink href={entry.href}>
              <ViewerTime iso={entry.occurredAt} fallbackZone="UTC" />
            </TextLink>
          ) : (
            <ViewerTime iso={entry.occurredAt} fallbackZone="UTC" />
          )}
        </span>
      </div>
      <dl className="mt-2 flex flex-col gap-1 text-sm">
        <Detail label="Event">
          {entry.event && (
            <TextLink href={entry.event.href}>{entry.event.label}</TextLink>
          )}
        </Detail>
        <Detail label="Recipient">
          {entry.recipient && (
            <TextLink href={entry.recipient.href}>
              {entry.recipient.label}
            </TextLink>
          )}
        </Detail>
        <Detail label="Request">
          {entry.gearRequest && (
            <TextLink href={entry.gearRequest.href}>
              {entry.gearRequest.label}
            </TextLink>
          )}
        </Detail>
        <Detail label="Reason">{entry.reason}</Detail>
        <Detail label="Notes">
          {entry.notes && <MarkdownText>{entry.notes}</MarkdownText>}
        </Detail>
        <Detail label="As-is">{entry.acknowledgement}</Detail>
        <Detail label="Recorded by">{entry.recordedBy}</Detail>
      </dl>
    </>
  );
}

function TagItem({ entry }: { entry: TagEntry }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted">
          {entry.action === "assigned" ? "Tag assigned" : "Tag freed"}
        </Badge>
        <span className="font-mono text-sm tracking-wider">{entry.code}</span>
        <span className="app-muted text-sm">
          <ViewerTime iso={entry.occurredAt} fallbackZone="UTC" />
        </span>
      </div>
      <dl className="mt-2 flex flex-col gap-1 text-sm">
        <Detail label="Why">{entry.releaseReason}</Detail>
        <Detail label="Recorded by">{entry.recordedBy}</Detail>
      </dl>
    </>
  );
}

/**
 * The item's history (#1442): where it came from and everything that has
 * happened to it since, newest first, ending at the donation it arrived in.
 */
export function ItemHistoryCard({ entries }: { entries: HistoryEntry[] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="app-muted text-sm">No history recorded yet.</p>
        ) : (
          <ol aria-label="Item history" className="flex flex-col gap-4">
            {entries.map((entry) => (
              <li
                key={entry.key}
                className="border-l-2 border-[var(--line)] pl-4"
              >
                {entry.kind === "donated" ? (
                  <DonatedItem entry={entry} />
                ) : entry.kind === "tag" ? (
                  <TagItem entry={entry} />
                ) : (
                  <MovementItem entry={entry} />
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
