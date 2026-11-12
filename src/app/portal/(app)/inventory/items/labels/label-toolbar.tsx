"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import {
  LABEL_LAYOUTS,
  labelsPerPage,
  type LabelCodeKind,
  type LabelLayoutKey,
} from "@/lib/inventory-labels";
import { createAssetTagsAction } from "../actions";
import { recordLabelsPrintedAction } from "./actions";

const LAYOUT_ITEMS = LABEL_LAYOUTS.map((layout) => ({
  value: layout.key,
  label: layout.name,
}));

const CODE_ITEMS: { value: LabelCodeKind; label: string }[] = [
  { value: "numbered", label: "Numbered code" },
  { value: "tag", label: "Tag code" },
];

/**
 * The print options, kept in the URL: a reprint of the same sheet is the same
 * link, and the page redraws on the server with the new geometry.
 */
export function LabelToolbar({
  layout,
  skip,
  barcode,
  codeKind = null,
  printable,
  tagIds,
  backHref = "/portal/inventory/items",
  backLabel = "Back to items",
}: {
  layout: LabelLayoutKey;
  skip: number;
  barcode: boolean;
  /**
   * Which of the items' codes the labels carry, offered only when the items
   * have both kinds to choose from.
   */
  codeKind?: LabelCodeKind | null;
  /** False when there is nothing to print yet, which disables Print. */
  printable: boolean;
  /** The codes on these sheets, recorded as printed when Print is pressed
   *  (#1450). Opening the page records nothing. */
  tagIds: readonly string[];
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isRecording, setIsRecording] = useState(false);
  const current = LABEL_LAYOUTS.find((option) => option.key === layout)!;
  const perPage = labelsPerPage(current);
  // A Katasymbol label is printed from its own panel, not the print dialog.
  const viaDialog = current.printer === "browser";

  function setParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={backHref} />}
        >
          <ArrowLeft /> {backLabel}
        </Button>
        {viaDialog && (
          <Button
            type="button"
            className="ml-auto"
            disabled={!printable || isPending || isRecording}
            onClick={async () => {
              // Recorded first, since the dialog can hold the page until it
              // closes; the labels print whether or not it was saved.
              setIsRecording(true);
              await recordLabelsPrintedAction(tagIds).catch(() => null);
              setIsRecording(false);
              window.print();
            }}
          >
            <Printer /> Print labels
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="label-layout">Paper</Label>
          <Select
            items={LAYOUT_ITEMS}
            value={layout}
            onValueChange={(next) =>
              // A skip counted against one sheet means nothing on another.
              next && next !== layout && setParams({ layout: next, skip: null })
            }
          >
            <SelectTrigger id="label-layout" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LABEL_LAYOUTS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="app-muted text-xs">{current.description}</p>
        </div>

        {codeKind && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label-code">Code</Label>
            <Select
              items={CODE_ITEMS}
              value={codeKind}
              onValueChange={(next) =>
                next && next !== codeKind && setParams({ code: next })
              }
            >
              <SelectTrigger id="label-code" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODE_ITEMS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="app-muted text-xs">
              {codeKind === "numbered"
                ? "Reusable: the code alone, for the next item too."
                : "Permanent: with the item’s name."}
            </p>
          </div>
        )}

        {perPage > 1 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label-skip">Skip used labels</Label>
            <Input
              id="label-skip"
              type="number"
              inputMode="numeric"
              min={0}
              max={perPage - 1}
              defaultValue={skip}
              key={`${layout}-${skip}`}
              className="w-24"
              onBlur={(event) => {
                const value = event.currentTarget.value;
                if (value !== String(skip)) setParams({ skip: value || null });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <p className="app-muted text-xs">
              Start partway down a part-used sheet.
            </p>
          </div>
        )}

        {viaDialog && (
          <div className="flex items-center gap-2 pb-5">
            <Checkbox
              id="label-barcode"
              checked={barcode}
              onCheckedChange={(checked) =>
                setParams({ barcode: checked ? "1" : null })
              }
            />
            <Label htmlFor="label-barcode">Add a 1D barcode</Label>
          </div>
        )}

        {isPending && <Spinner className="mb-5" />}
      </div>

      {viaDialog && (
        <p className="app-muted text-sm">
          In the print dialog, set the scale to 100% (“Actual size”) and the
          margins to None, or the labels will drift off the sheet’s cut lines.
        </p>
      )}
    </div>
  );
}

/** Gives the listed items codes, then redraws the page with their labels. */
export function CreateCodesButton({ itemIds }: { itemIds: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      disabled={isPending}
      focusableWhenDisabled
      onClick={() =>
        startTransition(async () => {
          await runAction(() => createAssetTagsAction(itemIds), {
            success: (result) =>
              `${result.created} code${result.created === 1 ? "" : "s"} created.`,
            onSuccess: () => router.refresh(),
          });
        })
      }
    >
      {isPending && <Spinner />} Create {itemIds.length} code
      {itemIds.length === 1 ? "" : "s"}
    </Button>
  );
}
