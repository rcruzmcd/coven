"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, UserCheck } from "lucide-react";
import { setQueueItemClaimAction } from "@/app/portal/(app)/queue-claim-actions";
import {
  PersonPicker,
  type PickedPerson,
} from "@/app/portal/(app)/people/person-picker";
import { personDisplayName } from "@/lib/format";
import { NO_PERSON_RECORD_MESSAGE, type QueueKey } from "@/lib/queue-claims";
import type { ClaimStaffMember } from "@/lib/portal/queue-claim-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { useActionToast, runAction } from "@/components/portal/action-toast";

export type Claimant = {
  id: string;
  name: string | null;
  preferred_name: string | null;
} | null;

/** Who is working an item (#1668), or a muted "Unclaimed". */
export function ClaimedByCell({ claimant }: { claimant: Claimant }) {
  if (!claimant) return <span className="app-muted">Unclaimed</span>;
  return <span>{personDisplayName(claimant)}</span>;
}

/**
 * Claim / Unclaim / Assign to… for one queue row (#1668).
 *
 * What is offered follows the queue's two permissions -- claiming yourself and
 * assigning someone else -- which set_queue_item_claim() checks again. A
 * resolved item offers nothing but releasing a claim, which the database
 * clears on resolution anyway.
 */
export function ClaimRowActions({
  queue,
  itemId,
  itemLabel,
  claimant,
  myPersonId,
  canClaim,
  canAssign,
  resolved,
  staff,
}: {
  queue: QueueKey;
  itemId: string;
  /** Names the row for the menu's accessible label. */
  itemLabel: string;
  claimant: Claimant;
  myPersonId: string | null;
  canClaim: boolean;
  canAssign: boolean;
  resolved: boolean;
  staff: ClaimStaffMember[];
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [assignOpen, setAssignOpen] = useState(false);

  const isMine = claimant !== null && claimant.id === myPersonId;
  const showClaim = canClaim && !resolved && !isMine;
  const showUnclaim = claimant !== null && (isMine ? canClaim : canAssign);
  const showAssign = canAssign && !resolved;
  if (!showClaim && !showUnclaim && !showAssign) return null;

  function claim(assignee: "self" | null) {
    run(() => setQueueItemClaimAction({ queue, id: itemId, assignee }), {
      success: assignee ? "Claimed." : "Unclaimed.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              focusableWhenDisabled
              aria-label={`Claim options for ${itemLabel}`}
            />
          }
        >
          {isPending ? <Spinner /> : <UserCheck className="size-4" />}
          Claim
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {showClaim ? (
            <DropdownMenuItem
              disabled={!myPersonId}
              onClick={() => claim("self")}
            >
              <span className="flex flex-col">
                {claimant ? "Claim from them" : "Claim"}
                {!myPersonId ? (
                  <span className="app-muted text-xs">
                    {NO_PERSON_RECORD_MESSAGE}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          ) : null}
          {showUnclaim ? (
            <DropdownMenuItem onClick={() => claim(null)}>
              Unclaim
            </DropdownMenuItem>
          ) : null}
          {showAssign ? (
            <DropdownMenuItem onClick={() => setAssignOpen(true)}>
              Assign to…
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {showAssign ? (
        <AssignDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          queue={queue}
          itemId={itemId}
          itemLabel={itemLabel}
          claimant={claimant}
          staff={staff}
          onAssigned={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

function AssignDialog({
  open,
  onOpenChange,
  queue,
  itemId,
  itemLabel,
  claimant,
  staff,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: QueueKey;
  itemId: string;
  itemLabel: string;
  claimant: Claimant;
  staff: ClaimStaffMember[];
  onAssigned: () => void;
}) {
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setPerson(null);
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!person) {
      setError("Choose who to assign this to.");
      return;
    }
    setIsPending(true);
    const outcome = await runAction(
      () => setQueueItemClaimAction({ queue, id: itemId, assignee: person.id }),
      {
        success: `Assigned to ${personDisplayName(person)}.`,
        onError: setError,
      },
    );
    setIsPending(false);
    if (outcome.ok) {
      handleOpenChange(false);
      onAssigned();
    }
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      title="Assign to…"
      description={
        claimant
          ? `${itemLabel} is claimed by ${personDisplayName(claimant)}.`
          : `${itemLabel} is unclaimed.`
      }
      size="md"
      onSubmit={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} focusableWhenDisabled>
            {isPending ? <Spinner /> : "Assign"}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`assign-${itemId}`}>Person</FieldLabel>
          <PersonPicker
            id={`assign-${itemId}`}
            people={staff}
            selected={person}
            onSelect={setPerson}
            onPersonCreated={() => {}}
            allowCreate={false}
            placeholder="Search staff"
          />
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </FieldGroup>
    </PortalFormSurface>
  );
}
