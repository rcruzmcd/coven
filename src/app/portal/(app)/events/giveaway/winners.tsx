"use client";

import { FormEvent, useState, useTransition, type ComponentProps } from "react";
import {
  upsertGiveawayWinnerAction,
  type GiveawayPrize,
  type GiveawayWinner,
} from "../giveaway-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { DISTRIBUTION_STATUS_LABELS, DISTRIBUTION_STATUSES } from "./format";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { formatCalendarDate } from "@/lib/format";
import { useEventDateDefaults } from "../event-date-defaults";

export function WinnerForm({
  prize,
  onSaved,
  onCancel,
}: {
  prize: GiveawayPrize;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const winner = prize.giveaway_winners;
  const [winnerName, setWinnerName] = useState(winner?.winner_name ?? "");
  const [winnerContact, setWinnerContact] = useState(
    winner?.winner_contact ?? "",
  );
  const [status, setStatus] = useState(
    winner?.distribution_status ?? "pending",
  );
  // A prize is handed over at the event, so a winner recorded for the first
  // time opens on the event's date; a saved winner keeps whatever was saved,
  // blank included.
  const eventDates = useEventDateDefaults();
  const [distributedAt, setDistributedAt] = useState(
    // A `date` column, so the stored value is already the input's format.
    winner ? (winner.distributed_at ?? "") : eventDates.date,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("winnerName", winnerName);
    formData.set("winnerContact", winnerContact);
    formData.set("distributionStatus", status);
    formData.set("distributedAt", distributedAt);

    startTransition(async () => {
      const result = await upsertGiveawayWinnerAction(prize.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-md bg-muted/40 p-3">
      <FieldGroup>
        <RequiredFieldsNote />
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor={`winner-name-${prize.id}`} required>
              Winner name
            </FieldLabel>
            <Input
              id={`winner-name-${prize.id}`}
              required
              value={winnerName}
              onChange={(e) => setWinnerName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`winner-contact-${prize.id}`}>
              Winner contact
            </FieldLabel>
            <Input
              id={`winner-contact-${prize.id}`}
              value={winnerContact}
              onChange={(e) => setWinnerContact(e.target.value)}
            />
          </Field>
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor={`winner-status-${prize.id}`}>
              Distribution status
            </FieldLabel>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value ?? "pending")}
            >
              <SelectTrigger
                id={`winner-status-${prize.id}`}
                className="w-full"
              >
                <SelectValue placeholder="Select status">
                  {(value: string) =>
                    DISTRIBUTION_STATUS_LABELS[value] ?? "Select status"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DISTRIBUTION_STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`winner-distributedAt-${prize.id}`}>
              Distributed on
            </FieldLabel>
            <Input
              id={`winner-distributedAt-${prize.id}`}
              type="date"
              value={distributedAt}
              onChange={(e) => setDistributedAt(e.target.value)}
            />
          </Field>
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isPending}
            focusableWhenDisabled
          >
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save winner"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

/**
 * How a recorded winner reads once the draw is done: one line. It used to be
 * four stacked label/value pairs in a 2-up grid, which took more vertical room
 * than the prize it belonged to and made a list of prizes unscannable. The
 * status is the one value worth spotting at a glance, so it carries a colour;
 * contact and hand-off date ride along as detail and drop out when empty.
 */
export function WinnerSummary({
  winner,
  onEdit,
  canEdit,
}: {
  winner: GiveawayWinner;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const status = winner.distribution_status;
  const statusLabel = DISTRIBUTION_STATUS_LABELS[status] ?? status;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-muted/40 px-3 py-2">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Winner
        </span>
        <span className="font-medium">{winner.winner_name || "\u2014"}</span>
        {winner.winner_contact && (
          <span className="app-muted">
            <span className="sr-only">Contact: </span>
            {winner.winner_contact}
          </span>
        )}
      </p>

      <div className="flex items-center gap-2">
        <Badge variant={STATUS_BADGE_VARIANTS[status] ?? "outline"}>
          <span className="sr-only">Distribution status: </span>
          {statusLabel}
        </Badge>
        {winner.distributed_at && (
          <span className="app-muted text-sm">
            <span className="sr-only">Distributed on: </span>
            {formatCalendarDate(winner.distributed_at)}
          </span>
        )}
        {canEdit && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit winner"
                  onClick={onEdit}
                />
              }
            >
              <Pencil />
            </TooltipTrigger>
            <TooltipContent>Edit winner</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Unclaimed is the state someone has to act on, so it reads as a problem. */
const STATUS_BADGE_VARIANTS: Record<
  string,
  ComponentProps<typeof Badge>["variant"]
> = {
  pending: "warning",
  distributed: "success",
  unclaimed: "destructive",
};

export function PrizeWinnerSection({
  prize,
  editing,
  canEdit,
  onEdit,
  onSaved,
  onCancel,
}: {
  prize: GiveawayPrize;
  editing: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const winner = prize.giveaway_winners;

  if (editing) {
    return <WinnerForm prize={prize} onSaved={onSaved} onCancel={onCancel} />;
  }

  if (!winner) {
    return canEdit ? (
      <div className="mt-3">
        <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
          + Record winner
        </Button>
      </div>
    ) : null;
  }

  return <WinnerSummary winner={winner} onEdit={onEdit} canEdit={canEdit} />;
}
