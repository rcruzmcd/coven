"use client";

import { useState, useTransition } from "react";
import {
  addGiveawayTierRuleAction,
  deleteGiveawayTierRuleAction,
  seedGiveawayTiersAction,
  updateGiveawayTierGrantsAction,
  type GiveawayTierConfig,
} from "../giveaway-tier-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { keepFocusOnRemoval } from "@/lib/focus-on-removal";

/**
 * Tier setup for a giveaway (issue #5): the grant matrix that decides how many
 * tickets of each colour a donated item or a bought package earns, plus the
 * keyword hints that preselect a tier at donation intake.
 *
 * The matrix is edited as a grid and saved in one go — a half-applied matrix
 * would silently change everyone's odds.
 */
export function TiersSection({
  giveawayId,
  config,
  canEdit,
  onChanged,
}: {
  giveawayId: string;
  config: GiveawayTierConfig;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newKeyword, setNewKeyword] = useState("");
  const [keywordTierId, setKeywordTierId] = useState<string>("");

  const { tiers, grants, rules } = config;

  function quantityFor(sourceTierId: string, ticketTierId: string) {
    const grant = grants.find(
      (candidate) =>
        candidate.source_tier_id === sourceTierId &&
        candidate.ticket_tier_id === ticketTierId,
    );
    if (!grant) return { id: null, value: "0" };
    return {
      id: grant.id,
      value: draft[grant.id] ?? String(grant.quantity),
    };
  }

  function handleSeed() {
    startTransition(async () => {
      await runAction(() => seedGiveawayTiersAction(giveawayId), {
        success: "Gold, Silver and Bronze tiers set up.",
        error: "Could not set up the tiers. Please try again.",
        onSuccess: onChanged,
      });
    });
  }

  function handleSaveMatrix() {
    const updates = Object.entries(draft).map(([id, value]) => ({
      id,
      quantity: Number(value),
    }));
    if (!updates.length) return;

    startTransition(async () => {
      await runAction(() => updateGiveawayTierGrantsAction(updates), {
        success: "Tier setup saved.",
        error: "Could not save the tier setup. Please try again.",
        onSuccess: () => {
          setDraft({});
          onChanged();
        },
      });
    });
  }

  function handleAddKeyword() {
    if (!keywordTierId || !newKeyword.trim()) return;
    startTransition(async () => {
      await runAction(
        () => addGiveawayTierRuleAction(giveawayId, keywordTierId, newKeyword),
        {
          success: "Keyword added.",
          error: "Could not add the keyword. Please try again.",
          onSuccess: () => {
            setNewKeyword("");
            onChanged();
          },
        },
      );
    });
  }

  function handleRemoveKeyword(ruleId: string) {
    startTransition(async () => {
      await runAction(() => deleteGiveawayTierRuleAction(ruleId), {
        success: "Keyword removed.",
        error: "Could not remove the keyword. Please try again.",
        onSuccess: onChanged,
      });
    });
  }

  if (!tiers.length) {
    return (
      <EmptyState
        title="No tiers set up"
        description="Set up Gold, Silver and Bronze with the standard ticket grants. You can change the numbers afterwards."
        action={
          canEdit ? (
            <Button
              type="button"
              onClick={handleSeed}
              disabled={isPending}
              focusableWhenDisabled
            >
              {isPending ? (
                <>
                  <Spinner /> Setting up...
                </>
              ) : (
                "Set up tiers"
              )}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const hasDraft = Object.keys(draft).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <caption className="sr-only">
            Tickets earned per tier, by ticket colour
          </caption>
          <thead>
            <tr>
              <th scope="col" className="p-2 text-left font-medium">
                Earned at
              </th>
              {tiers.map((tier) => (
                <th
                  key={tier.id}
                  scope="col"
                  className="p-2 text-right font-medium"
                >
                  {tier.label} tickets
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((sourceTier) => (
              <tr key={sourceTier.id} className="border-t border-[var(--line)]">
                <th scope="row" className="p-2 text-left font-normal">
                  {sourceTier.label}
                </th>
                {tiers.map((ticketTier) => {
                  const cell = quantityFor(sourceTier.id, ticketTier.id);
                  const label = `${sourceTier.label} earns ${ticketTier.label} tickets`;
                  return (
                    <td key={ticketTier.id} className="p-2 text-right">
                      {canEdit && cell.id ? (
                        <Input
                          aria-label={label}
                          type="number"
                          min="0"
                          step="1"
                          className="ml-auto w-20 text-right"
                          value={cell.value}
                          onChange={(event) =>
                            setDraft((prev) => ({
                              ...prev,
                              [cell.id as string]: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <span className="tabular-nums">{cell.value}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && hasDraft && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDraft({})}
            disabled={isPending}
            focusableWhenDisabled
          >
            Discard changes
          </Button>
          <Button
            type="button"
            onClick={handleSaveMatrix}
            disabled={isPending}
            focusableWhenDisabled
          >
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save tier setup"
            )}
          </Button>
        </div>
      )}

      <div className="border-t border-[var(--line)] pt-4">
        <h4 className="text-sm font-medium">Item type keywords</h4>
        <p className="app-muted mt-1 text-sm">
          Used to preselect a tier at donation intake. Matched against the item
          type; longest match wins. Staff can always override.
        </p>

        <ul className="mt-3 flex flex-wrap gap-2">
          {rules.map((rule) => {
            const tier = tiers.find(
              (candidate) => candidate.id === rule.tier_id,
            );
            return (
              <li
                key={rule.id}
                className="flex items-center gap-2 rounded-md border border-[var(--line)] px-2 py-1 text-sm"
              >
                <span>
                  {rule.match_text}
                  <span className="app-muted"> → {tier?.label ?? "—"}</span>
                </span>
                {canEdit && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          focusableWhenDisabled
                          aria-label={`Remove keyword ${rule.match_text}`}
                          ref={keepFocusOnRemoval}
                          onClick={() => handleRemoveKeyword(rule.id)}
                        />
                      }
                    >
                      ×
                    </TooltipTrigger>
                    <TooltipContent>{`Remove keyword ${rule.match_text}`}</TooltipContent>
                  </Tooltip>
                )}
              </li>
            );
          })}
          {!rules.length && (
            <li className="app-muted text-sm">
              No keywords yet — every item will need its tier set by hand.
            </li>
          )}
        </ul>

        {canEdit && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Field className="w-48">
              <FieldLabel htmlFor="new-keyword">Keyword</FieldLabel>
              <Input
                id="new-keyword"
                placeholder="e.g. snowboard"
                value={newKeyword}
                onChange={(event) => setNewKeyword(event.target.value)}
              />
            </Field>
            <Field className="w-40">
              <FieldLabel htmlFor="keyword-tier">Tier</FieldLabel>
              <Select
                value={keywordTierId || null}
                onValueChange={(value) => setKeywordTierId(value ?? "")}
              >
                <SelectTrigger id="keyword-tier" className="w-full">
                  <SelectValue placeholder="Select a tier">
                    {(value: string) =>
                      tiers.find((tier) => tier.id === value)?.label ??
                      "Select a tier"
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
              variant="secondary"
              onClick={handleAddKeyword}
              disabled={isPending || !keywordTierId || !newKeyword.trim()}
            >
              Add keyword
            </Button>
          </div>
        )}
      </div>

      {!grants.length && (
        <Alert variant="destructive">
          <AlertDescription>
            These tiers have no ticket grants, so nothing will be issued. Re-run
            the tier setup or add grants.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
