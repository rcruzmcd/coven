"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import {
  createGiveawayPrizeAction,
  updateGiveawayPrizeAction,
  listAvailableGiveawaySourcesAction,
  type AvailableInventoryItemSource,
  type AvailableMonetaryDonationSource,
  type Giveaway,
  type GiveawayPrize,
} from "../giveaway-actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PrizeWinnerSection } from "./winners";
import {
  setGiveawayPrizeBucketAction,
  type GiveawayBucket,
} from "../giveaway-tier-actions";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

const NO_SOURCE = "none";

function sourceKeyFor(kind: "item" | "donation", id: string) {
  return `${kind}:${id}`;
}

function initialSourceKey(prize?: GiveawayPrize) {
  if (prize?.source_inventory_item_id) {
    return sourceKeyFor("item", prize.source_inventory_item_id);
  }
  if (prize?.source_monetary_donation_id) {
    return sourceKeyFor("donation", prize.source_monetary_donation_id);
  }
  return NO_SOURCE;
}

/**
 * Add or edit a prize. `prize` switches it to edit mode -- the fields start
 * from that prize and saving updates it in place instead of inserting.
 */
export function PrizeForm({
  giveawayId,
  eventId,
  prize,
  people,
  onPersonCreated,
  onSaved,
  onCancel,
}: {
  giveawayId: string;
  eventId: string;
  prize?: GiveawayPrize;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = prize !== undefined;
  const [prizeName, setPrizeName] = useState(prize?.prize_name ?? "");
  const [selectedDonor, setSelectedDonor] = useState<PickedPerson | null>(
    prize?.donor ?? null,
  );
  const [estimatedValue, setEstimatedValue] = useState(
    prize?.estimated_value === null || prize?.estimated_value === undefined
      ? ""
      : String(prize.estimated_value),
  );
  const [notes, setNotes] = useState(prize?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [sources, setSources] = useState<{
    inventoryItems: AvailableInventoryItemSource[];
    monetaryDonations: AvailableMonetaryDonationSource[];
  } | null>(null);
  const [selectedSourceKey, setSelectedSourceKey] = useState(() =>
    initialSourceKey(prize),
  );

  const prizeId = prize?.id ?? null;
  const idPrefix = isEdit ? `prize-${prize.id}` : "prize-new";
  useEffect(() => {
    let cancelled = false;
    // Passing the prize id keeps its own current source in the list; without
    // it the RPC filters out everything already linked, including this one.
    listAvailableGiveawaySourcesAction(eventId, prizeId).then((result) => {
      if (cancelled) return;
      if ("data" in result) setSources(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, prizeId]);

  function handleSourceChange(key: string | null) {
    if (!key) return;
    setSelectedSourceKey(key);
    if (key === NO_SOURCE) return;

    const [kind, id] = key.split(":");
    if (kind === "item") {
      const item = sources?.inventoryItems.find((i) => i.id === id);
      if (!item) return;
      setPrizeName(item.description);
      setEstimatedValue(
        item.face_value === null ? "" : String(item.face_value),
      );
      if (item.donor) setSelectedDonor(item.donor);
    } else if (kind === "donation") {
      const donation = sources?.monetaryDonations.find((d) => d.id === id);
      if (!donation) return;
      setPrizeName("Cash contribution");
      setEstimatedValue(String(donation.amount));
      if (donation.donor) setSelectedDonor(donation.donor);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("prizeName", prizeName);
    formData.set("estimatedValue", estimatedValue);
    formData.set("notes", notes);

    const [kind, id] =
      selectedSourceKey === NO_SOURCE
        ? [null, null]
        : selectedSourceKey.split(":");

    startTransition(async () => {
      await runAction(
        () =>
          isEdit
            ? updateGiveawayPrizeAction(
                prize.id,
                selectedDonor?.id ?? null,
                formData,
                kind === "item" ? id : null,
                kind === "donation" ? id : null,
              )
            : createGiveawayPrizeAction(
                giveawayId,
                selectedDonor?.id ?? null,
                formData,
                kind === "item" ? id : null,
                kind === "donation" ? id : null,
              ),
        {
          success: isEdit
            ? `Prize "${prizeName}" updated.`
            : `Prize "${prizeName}" added.`,
          onError: setError,
          onSuccess: onSaved,
        },
      );
    });
  }

  // In edit mode the picker stays visible even with nothing else to pick, so
  // an existing link can always be seen and cleared.
  const hasSources =
    (sources?.inventoryItems.length ?? 0) > 0 ||
    (sources?.monetaryDonations.length ?? 0) > 0 ||
    selectedSourceKey !== NO_SOURCE;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <RequiredFieldsNote />
        {hasSources && (
          <Field>
            <FieldLabel>Link to an existing donation</FieldLabel>
            <Select
              value={selectedSourceKey}
              onValueChange={handleSourceChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Enter prize details manually" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SOURCE}>
                  Enter prize details manually
                </SelectItem>
                {(sources?.inventoryItems.length ?? 0) > 0 && (
                  <SelectGroup>
                    <SelectLabel>In-kind donations</SelectLabel>
                    {sources!.inventoryItems.map((item) => (
                      <SelectItem
                        key={item.id}
                        value={sourceKeyFor("item", item.id)}
                      >
                        {item.description}
                        {item.donor?.name ? ` — ${item.donor.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {(sources?.monetaryDonations.length ?? 0) > 0 && (
                  <SelectGroup>
                    <SelectLabel>Cash donations</SelectLabel>
                    {sources!.monetaryDonations.map((donation) => (
                      <SelectItem
                        key={donation.id}
                        value={sourceKeyFor("donation", donation.id)}
                      >
                        {formatCurrency(donation.amount)}
                        {donation.donor?.name
                          ? ` — ${donation.donor.name}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor={`${idPrefix}-name`} required>
            Prize name
          </FieldLabel>
          <Input
            id={`${idPrefix}-name`}
            required
            value={prizeName}
            onChange={(e) => setPrizeName(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="prizes-prize-donor">Prize donor</FieldLabel>
          <PersonPicker
            id="prizes-prize-donor"
            people={people}
            selected={selectedDonor}
            onSelect={setSelectedDonor}
            onPersonCreated={onPersonCreated}
            newPersonRole="is_donor"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${idPrefix}-value`}>
            Estimated value ($)
          </FieldLabel>
          <Input
            id={`${idPrefix}-value`}
            type="number"
            min="0"
            step="0.01"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
          <Textarea
            id={`${idPrefix}-notes`}
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
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : isEdit ? (
              "Save prize"
            ) : (
              "Add prize"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function PrizesSection({
  giveaway,
  people,
  canEdit,
  isDeleting,
  editingWinnerId,
  editingPrizeId,
  showAddPrize,
  onPersonCreated,
  onDeletePrize,
  onEditPrize,
  onPrizeSaved,
  onCancelPrizeEdit,
  onEditWinner,
  onWinnerSaved,
  onCancelWinnerEdit,
  onToggleAddPrize,
  onPrizeAdded,
  buckets,
  onBucketAssigned,
}: {
  giveaway: Giveaway;
  people: PersonListItem[];
  canEdit: boolean;
  /** Draw buckets for this giveaway (issue #5); empty when it isn't tiered. */
  buckets: GiveawayBucket[];
  onBucketAssigned: () => void;
  isDeleting: boolean;
  editingWinnerId: string | null;
  editingPrizeId: string | null;
  showAddPrize: boolean;
  onPersonCreated: (person: PickedPerson) => void;
  onDeletePrize: (id: string) => void;
  onEditPrize: (prizeId: string) => void;
  onPrizeSaved: () => void;
  onCancelPrizeEdit: () => void;
  onEditWinner: (prizeId: string) => void;
  onWinnerSaved: () => void;
  onCancelWinnerEdit: () => void;
  onToggleAddPrize: (show: boolean) => void;
  onPrizeAdded: () => void;
}) {
  function handleBucketChange(prizeId: string, bucketId: string | null) {
    runAction(() => setGiveawayPrizeBucketAction(prizeId, bucketId), {
      success: bucketId ? "Prize assigned to bucket." : "Prize unassigned.",
      error: "Could not assign the prize. Please try again.",
      onSuccess: onBucketAssigned,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Prizes</h3>
      {giveaway.giveaway_prizes.length === 0 && (
        <EmptyState
          title="No prizes added yet"
          description={
            canEdit
              ? "Add the first one with + Add prize below."
              : "Prizes appear here once they are added while editing the giveaway."
          }
        />
      )}
      {giveaway.giveaway_prizes.map((prize) =>
        editingPrizeId === prize.id ? (
          <PrizeForm
            key={prize.id}
            giveawayId={giveaway.id}
            eventId={giveaway.event_id}
            prize={prize}
            people={people}
            onPersonCreated={onPersonCreated}
            onSaved={onPrizeSaved}
            onCancel={onCancelPrizeEdit}
          />
        ) : (
          <div
            key={prize.id}
            className="rounded-md border border-[var(--line)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{prize.prize_name}</p>
                <p className="app-muted text-xs">
                  {prize.donor?.name ? `Donated by ${prize.donor.name} · ` : ""}
                  {formatCurrency(prize.estimated_value)}
                </p>
                {(prize.source_item || prize.source_donation) && (
                  <p className="app-muted text-xs">
                    Sourced from:{" "}
                    {prize.source_item?.description ??
                      formatCurrency(prize.source_donation?.amount ?? null)}
                  </p>
                )}
                {buckets.length > 0 &&
                  (canEdit ? (
                    <div className="mt-2 w-52">
                      <Select
                        value={prize.bucket_id}
                        onValueChange={(value) =>
                          handleBucketChange(prize.id, value)
                        }
                      >
                        <SelectTrigger
                          aria-label={`Draw bucket for ${prize.prize_name}`}
                          className="w-full"
                        >
                          <SelectValue placeholder="No bucket">
                            {(value: string) =>
                              buckets.find((bucket) => bucket.id === value)
                                ?.name ?? "No bucket"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {buckets.map((bucket) => (
                            <SelectItem key={bucket.id} value={bucket.id}>
                              {bucket.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <p className="app-muted text-xs">
                      Bucket:{" "}
                      {buckets.find((bucket) => bucket.id === prize.bucket_id)
                        ?.name ?? "None"}
                    </p>
                  ))}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditPrize(prize.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => onDeletePrize(prize.id)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
            <PrizeWinnerSection
              prize={prize}
              editing={editingWinnerId === prize.id}
              canEdit={canEdit}
              onEdit={() => onEditWinner(prize.id)}
              onSaved={onWinnerSaved}
              onCancel={onCancelWinnerEdit}
            />
          </div>
        ),
      )}

      {canEdit &&
        (showAddPrize ? (
          <PrizeForm
            giveawayId={giveaway.id}
            eventId={giveaway.event_id}
            people={people}
            onPersonCreated={onPersonCreated}
            onSaved={onPrizeAdded}
            onCancel={() => onToggleAddPrize(false)}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onToggleAddPrize(true)}
            >
              + Add prize
            </Button>
          </div>
        ))}
    </div>
  );
}
