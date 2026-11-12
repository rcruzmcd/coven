"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionToast } from "@/components/portal/action-toast";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import type { ClaimStaffMember } from "@/lib/portal/queue-claim-context";
import {
  ClaimRowActions,
  ClaimedByCell,
} from "@/components/portal/queue-claims";
import {
  reviewVolunteerHoursAction,
  type PendingVolunteerHours,
} from "./actions";

type ClaimProps = {
  canManage: boolean;
  myPersonId: string | null;
  staff: ClaimStaffMember[];
};

/**
 * The review queue for hours volunteers logged themselves (#1165).
 *
 * A list rather than a PortalDataTable: there is one action per row and it is
 * a decision, not a navigation, and the queue is meant to be short. If it is
 * ever long, that is the thing to fix rather than the table to add.
 *
 * The hours field is editable in place because a volunteer typing 8 for a
 * six-hour shift is the ordinary correction, and the alternative -- decline,
 * explain, wait for them to resubmit -- reads as a rejection of the person
 * rather than of a number. What they claimed stays on the submission either
 * way.
 *
 * Who is working each entry (#1669) is a line under it rather than a column,
 * for the same reason the queue is a list.
 */
function PendingRow({
  entry,
  canManage,
  myPersonId,
  staff,
}: { entry: PendingVolunteerHours } & ClaimProps) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [hours, setHours] = useState(String(entry.hours));

  const name = personDisplayName(entry.person);

  function decide(confirm: boolean) {
    const parsed = Number(hours);
    run(
      () =>
        reviewVolunteerHoursAction(entry.id, confirm, {
          hours: confirm && Number.isFinite(parsed) ? parsed : undefined,
        }),
      {
        success: confirm
          ? `${hours}h confirmed for ${name}.`
          : `Hours from ${name} were not confirmed.`,
        onSuccess: () => router.refresh(),
      },
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] px-4 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="app-muted truncate text-sm">
          {formatCalendarDate(entry.logged_date)}
          {entry.event?.name ? ` · ${entry.event.name}` : ""}
          {entry.volunteer_role_type?.name
            ? ` · ${entry.volunteer_role_type.name}`
            : ""}
        </p>
        {entry.notes ? (
          <p className="app-muted mt-1 text-sm leading-relaxed">
            {entry.notes}
          </p>
        ) : null}
        <p className="mt-1 text-xs">
          <span className="app-muted">Claimed by: </span>
          <ClaimedByCell claimant={entry.claimant} />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Both of the queue's claim permissions are volunteers:manage today;
            set_queue_item_claim() checks them separately. Only pending
            entries are listed, so none is resolved. */}
        <ClaimRowActions
          queue="volunteer_hours"
          itemId={entry.id}
          itemLabel={`Hours from ${name}`}
          claimant={entry.claimant}
          myPersonId={myPersonId}
          canClaim={canManage}
          canAssign={canManage}
          resolved={false}
          staff={staff}
        />
        <Input
          aria-label={`Hours for ${name}`}
          className="w-20"
          type="number"
          min="0.25"
          max="24"
          step="0.25"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          disabled={isPending}
        />
        <Button
          size="sm"
          onClick={() => decide(true)}
          disabled={isPending}
          focusableWhenDisabled
        >
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => decide(false)}
          disabled={isPending}
          focusableWhenDisabled
        >
          Decline
        </Button>
      </div>
    </li>
  );
}

export function PendingHours({
  entries,
  ...claimProps
}: {
  entries: PendingVolunteerHours[];
} & ClaimProps) {
  return (
    <ul className="flex flex-col">
      {entries.map((entry) => (
        <PendingRow key={entry.id} entry={entry} {...claimProps} />
      ))}
    </ul>
  );
}
