"use client";

import { useState, useTransition } from "react";
import {
  deleteGiveawayBucketAction,
  upsertGiveawayBucketAction,
  type GiveawayTierConfig,
} from "../giveaway-tier-actions";
import type { GiveawayPrize } from "../giveaway-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";

/**
 * Draw containers (issue #5). A bucket belongs to one ticket colour and carries
 * one or more prizes, which covers both ways the draw is run: a bucket per
 * prize, or one bucket pulled several times. Which prizes sit in a bucket is
 * set on the prize itself, so this view shows the count and leaves the linking
 * to the prizes section.
 */
export function BucketsSection({
  giveawayId,
  config,
  prizes,
  canEdit,
  onChanged,
}: {
  giveawayId: string;
  config: GiveawayTierConfig;
  prizes: GiveawayPrize[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [tierId, setTierId] = useState("");

  const { tiers, buckets } = config;

  function prizeCount(bucketId: string) {
    return prizes.filter((prize) => prize.bucket_id === bucketId).length;
  }

  function handleAdd() {
    if (!name.trim() || !tierId) return;
    startTransition(async () => {
      await runAction(
        () =>
          upsertGiveawayBucketAction(giveawayId, {
            tierId,
            name,
            rank: buckets.length,
          }),
        {
          success: "Bucket added.",
          error: "Could not add the bucket. Please try again.",
          onSuccess: () => {
            setName("");
            setTierId("");
            setShowAdd(false);
            onChanged();
          },
        },
      );
    });
  }

  function handleDelete(bucketId: string) {
    startTransition(async () => {
      await runAction(() => deleteGiveawayBucketAction(bucketId), {
        success: "Bucket removed.",
        description: "Any prizes in it are now unassigned.",
        error: "Could not remove the bucket. Please try again.",
        onSuccess: onChanged,
      });
    });
  }

  if (!tiers.length) return null;

  return (
    <div className="flex flex-col gap-4">
      {canEdit && !showAdd && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowAdd(true)}
          >
            Add bucket
          </Button>
        </div>
      )}

      {buckets.length ? (
        <ul className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
          {buckets.map((bucket) => {
            const tier = tiers.find(
              (candidate) => candidate.id === bucket.tier_id,
            );
            const count = prizeCount(bucket.id);
            return (
              <li
                key={bucket.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{bucket.name}</p>
                  <p className="app-muted text-sm">
                    {tier?.label ?? "—"} tickets ·{" "}
                    {count === 1 ? "1 prize" : `${count} prizes`}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    focusableWhenDisabled
                    onClick={() => handleDelete(bucket.id)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No buckets yet"
          description="Add a bucket per prize, or one bucket you pull from several times."
        />
      )}

      {canEdit && showAdd && (
        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-4">
          <Field className="w-56">
            <FieldLabel htmlFor="bucket-name" required>
              Bucket name
            </FieldLabel>
            <Input
              id="bucket-name"
              required
              placeholder="e.g. Snowboard bucket"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field className="w-40">
            <FieldLabel htmlFor="bucket-tier">Ticket colour</FieldLabel>
            <Select
              value={tierId || null}
              onValueChange={(value) => setTierId(value ?? "")}
            >
              <SelectTrigger id="bucket-tier" className="w-full">
                <SelectValue placeholder="Select a colour">
                  {(value: string) =>
                    tiers.find((tier) => tier.id === value)?.label ??
                    "Select a colour"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tiers.map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {tier.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !name.trim() || !tierId}
          >
            Add
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowAdd(false)}
            disabled={isPending}
            focusableWhenDisabled
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
