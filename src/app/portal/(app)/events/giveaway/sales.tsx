"use client";

import { FormEvent, useState, useTransition } from "react";
import { upsertEventGiveawayAction, type Giveaway } from "../giveaway-actions";
import type { GiveawayTierConfig } from "../giveaway-tier-actions";
import { GiveawaySummaryStrip } from "./summary-strip";
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
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/portal/empty-state";
import { useEventDateDefaults } from "../event-date-defaults";

export function GiveawaySalesForm({
  eventId,
  giveaway,
  onSaved,
  onCancel,
}: {
  eventId: string;
  giveaway: Giveaway | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(giveaway?.name ?? "");
  // The drawing happens at the event, so a giveaway being set up for the first
  // time opens on the event's date; an existing one keeps what was saved.
  const eventDates = useEventDateDefaults();
  const [drawingDate, setDrawingDate] = useState(
    // A `date` column, so the stored value is already the input's format.
    giveaway ? (giveaway.drawing_date ?? "") : eventDates.date,
  );
  const [notes, setNotes] = useState(giveaway?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("drawingDate", drawingDate);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await upsertEventGiveawayAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="giveaway-name">Giveaway name</FieldLabel>
          <Input
            id="giveaway-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="giveaway-drawingDate">Drawing date</FieldLabel>
          <Input
            id="giveaway-drawingDate"
            type="date"
            value={drawingDate}
            onChange={(e) => setDrawingDate(e.target.value)}
          />
          <FieldDescription>
            Tickets sold and revenue are counted from the sales recorded under
            Ticket packages, so there is nothing to type here.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="giveaway-notes">Notes</FieldLabel>
          <Textarea
            id="giveaway-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isPending} focusableWhenDisabled>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : giveaway ? (
              "Save giveaway"
            ) : (
              "Set up giveaway"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function SalesSection({
  eventId,
  giveaway,
  config,
  canEdit,
  onSaved,
  onCancel,
}: {
  eventId: string;
  giveaway: Giveaway | null;
  config: GiveawayTierConfig | null;
  canEdit: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  if (canEdit) {
    return (
      <GiveawaySalesForm
        eventId={eventId}
        giveaway={giveaway}
        onSaved={onSaved}
        onCancel={onCancel}
      />
    );
  }

  if (giveaway) {
    return <GiveawaySummaryStrip giveaway={giveaway} config={config} />;
  }

  return (
    <EmptyState
      title="No giveaway set up yet"
      description="Open the editor with Edit giveaway (the pencil above) and choose Set up giveaway to record ticket sales and prizes."
    />
  );
}
