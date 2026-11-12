"use client";

import { useId, useState, useTransition } from "react";
import { X } from "lucide-react";
import { categoryLabelFor, flattenCategory } from "@/lib/inventory";
import { TagScanner } from "@/components/portal/tag-scanner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  scanWarning,
  type DistributionDraft,
} from "@/lib/inventory-distribution-draft";
import {
  addToDistributionDraftAction,
  lookupScannedItemsAction,
  removeFromDistributionDraftAction,
  type ScannedItem,
} from "./distribution-draft-actions";
import type { AvailableInventoryItem } from "./distribution-actions";

/** How many matches the search offers at once. */
const SEARCH_LIMIT = 8;

function itemLabel(item: { description: string; size?: string | null }) {
  return item.size ? `${item.description} (${item.size})` : item.description;
}

/**
 * Scan mode of RecordDistributionModal (#1420 part 3): each scan adds one
 * piece to the person's server-side list for this event, so a tag opened in
 * another tab (an iPhone NFC tap) can add to the same list. A piece that
 * cannot go out -- already distributed, retired, not gear-library stock -- is
 * named and left off rather than added silently.
 *
 * Gear without a label is found by name instead (#1443), from available
 * gear-library stock. The pick-from-a-list input adds to the same list
 * (#1519), so every handout goes through one checkout.
 */
export function ScannedDistributionList({
  eventId,
  draft,
  recipientId,
  availableItems,
  conflictItemId,
  onChanged,
  releasesCodes = true,
  inputMode = "scan",
}: {
  /** Scan tags (with a search for unlabelled gear), or pick from a list. */
  inputMode?: "scan" | "pick";
  eventId: string | null;
  draft: DistributionDraft | null;
  /** Who the distribution is for, so a piece held for someone else is named. */
  recipientId: string | null;
  /** Available gear-library stock, for the search. */
  availableItems: AvailableInventoryItem[];
  /** The piece the last submit was refused over. */
  conflictItemId: string | null;
  /** Re-read the list from the server. */
  onChanged: () => Promise<void>;
  /** Recording marks the pieces distributed, which frees their numbered
   *  codes (#1444) -- so each one's tag has to come off. */
  releasesCodes?: boolean;
}) {
  const [message, setMessage] = useState<{
    tone: "info" | "warning";
    text: string;
  } | null>(null);
  const [choices, setChoices] = useState<ScannedItem[]>([]);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const searchId = useId();
  const items = draft?.items ?? [];

  const query = search.trim().toLowerCase();
  const matches = query
    ? availableItems
        .filter(
          (item) =>
            item.description.toLowerCase().includes(query) &&
            !items.some((listed) => listed.id === item.id),
        )
        .slice(0, SEARCH_LIMIT)
    : [];

  function add(item: ScannedItem) {
    setChoices([]);
    const warning = scanWarning(item, recipientId);
    if (warning) {
      setMessage({ tone: "warning", text: `${itemLabel(item)}: ${warning}` });
      return;
    }
    if (items.some((existing) => existing.id === item.id)) {
      setMessage({
        tone: "info",
        text: `${itemLabel(item)} is already listed.`,
      });
      return;
    }
    startTransition(async () => {
      const result = await addToDistributionDraftAction(item.id, eventId);
      if ("error" in result) {
        setMessage({ tone: "warning", text: result.error });
        return;
      }
      setMessage({ tone: "info", text: `Added ${itemLabel(item)}.` });
      await onChanged();
    });
  }

  function handleScan(scanned: string) {
    setMessage(null);
    setChoices([]);
    startTransition(async () => {
      const result = await lookupScannedItemsAction(scanned);
      if ("error" in result) {
        setMessage({ tone: "warning", text: result.error });
        return;
      }
      if (result.data.length === 0) {
        setMessage({
          tone: "warning",
          text: `No item has the tag “${scanned}”.`,
        });
        return;
      }
      if (result.data.length === 1) {
        add(result.data[0]);
        return;
      }
      // A manufacturer barcode shared by several pieces: ask which.
      setChoices(result.data);
    });
  }

  // Search only offers available gear-library stock, which nothing warns
  // about, so a pick goes straight onto the list.
  function addPicked(item: AvailableInventoryItem) {
    setSearch("");
    setMessage(null);
    startTransition(async () => {
      const result = await addToDistributionDraftAction(item.id, eventId);
      if ("error" in result) {
        setMessage({ tone: "warning", text: result.error });
        return;
      }
      setMessage({ tone: "info", text: `Added ${itemLabel(item)}.` });
      await onChanged();
    });
  }

  function remove(itemId: string) {
    startTransition(async () => {
      const result = await removeFromDistributionDraftAction(itemId, eventId);
      if ("error" in result) {
        setMessage({ tone: "warning", text: result.error });
        return;
      }
      await onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {inputMode === "pick" ? (
        <Field>
          <FieldLabel htmlFor="dist-item">Add an item</FieldLabel>
          <Select
            value={null}
            onValueChange={(value) => {
              const item = availableItems.find(
                (candidate) => candidate.id === value,
              );
              if (item) addPicked(item);
            }}
          >
            <SelectTrigger id="dist-item" className="w-full">
              <SelectValue placeholder="Select an available item" />
            </SelectTrigger>
            <SelectContent>
              {availableItems
                .filter(
                  (item) => !items.some((listed) => listed.id === item.id),
                )
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {itemLabel(item)} ({categoryLabelFor(flattenCategory(item))}
                    )
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <>
          <TagScanner
            onScan={handleScan}
            busy={isPending}
            idPrefix="dist-scan"
          />

          <Field>
            <FieldLabel htmlFor={searchId}>
              Add an item without a label
            </FieldLabel>
            <Input
              id={searchId}
              type="search"
              autoComplete="off"
              placeholder="Search available gear by name..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              // Enter would submit the modal's form and record the list.
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (matches.length === 1) addPicked(matches[0]);
              }}
            />
            {query && matches.length === 0 && (
              <FieldDescription>No available item matches.</FieldDescription>
            )}
            {matches.length > 0 && (
              <ul className="flex flex-col gap-1">
                {matches.map((item) => (
                  <li key={item.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start py-2 text-left whitespace-normal"
                      disabled={isPending}
                      focusableWhenDisabled
                      onClick={() => addPicked(item)}
                    >
                      Add {itemLabel(item)} ·{" "}
                      {categoryLabelFor(flattenCategory(item))}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </>
      )}

      <div aria-live="polite">
        {message && (
          <Alert
            variant={message.tone === "warning" ? "destructive" : "default"}
          >
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
      </div>

      {choices.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            That barcode is on {choices.length} items. Which one is this?
          </legend>
          {choices.map((item) => {
            const warning = scanWarning(item, recipientId);
            return (
              <Button
                key={item.id}
                type="button"
                variant="secondary"
                className="h-auto justify-start py-2 text-left whitespace-normal"
                onClick={() => add(item)}
              >
                <span>
                  {itemLabel(item)}
                  {warning && (
                    <span className="app-muted block text-xs">{warning}</span>
                  )}
                </span>
              </Button>
            );
          })}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Items ({items.length})</h3>
        {items.length === 0 ? (
          <p className="app-muted text-sm">
            {inputMode === "pick"
              ? "Nothing added yet."
              : "Nothing scanned yet. Each scan adds one item."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
            {items.map((item) => {
              const warning =
                item.id === conflictItemId
                  ? "Already distributed."
                  : scanWarning(item, recipientId);
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{itemLabel(item)}</span>
                    {warning ? (
                      <span className="block text-xs text-destructive">
                        {warning}
                      </span>
                    ) : (
                      releasesCodes &&
                      item.numberedCode && (
                        <span className="app-muted block text-xs">
                          Remove tag {item.numberedCode} before it goes out.
                        </span>
                      )
                    )}
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${itemLabel(item)}`}
                          disabled={isPending}
                          focusableWhenDisabled
                          onClick={() => remove(item.id)}
                        />
                      }
                    >
                      <X />
                    </TooltipTrigger>
                    <TooltipContent>{`Remove ${itemLabel(item)}`}</TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
