"use client";

import { FormEvent, useState, useTransition, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArchiveRestore,
  Ban,
  Hash,
  History,
  MoreHorizontal,
  Nfc,
  Printer,
  Unlink,
} from "lucide-react";
import { IconLink } from "@/components/portal/icon-link";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { ViewerTime } from "@/components/viewer-time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { runAction } from "@/components/portal/action-toast";
import {
  RETIRE_REASONS,
  codesPrintHref,
  formatCount,
  retireReasonLabel,
  type CodeTarget,
  type RetireReason,
} from "@/lib/inventory-codes";
import { TAG_PATH_PREFIX } from "@/lib/inventory-tags";
import { itemHref } from "../inventory-shared";
import {
  codeHistoryAction,
  retireCodesAction,
  setNfcWrittenAction,
  unassignNumberedCodeAction,
  unretireCodeAction,
  type CodeHistoryEntry,
  type RetireResult,
} from "./actions";
import { CopyTagUrlButton } from "./copy-tag-url-button";
import type { CodeRow } from "./codes-table";

/** A code we print and write: not an NFC serial, and not retired. */
export function isLabelCode(row: CodeRow): boolean {
  return row.kind !== "nfc" && row.state !== "retired";
}

/**
 * Any code we print can be retired: one on an item comes off it (#1544), and
 * an item's last code only after the person confirms.
 */
export function isRetirable(row: CodeRow): boolean {
  return (
    row.state !== "retired" &&
    (row.kind === "numbered" || row.kind === "asset_tag")
  );
}

/**
 * One row's actions (#1450). Copy tag URL, Print label, Mark written to NFC
 * and History are the reprinting person's tools, on `inventory:view`, so
 * they sit on the row as icons with tooltips, like the item page's toolbar.
 * Assigning, unassigning, retiring and restoring are `inventory:manage`, and
 * wait in one menu so a phone row keeps its width.
 */
export function CodeActions({
  row,
  canManage,
}: {
  row: CodeRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [retiring, setRetiring] = useState(false);
  const written = !!row.nfcWrittenAt;

  function run<T extends object>(
    action: () => Promise<T | { error: string }>,
    success: (result: T) => string,
  ) {
    startTransition(async () => {
      await runAction(action, {
        success: (result) => success(result as T),
        onSuccess: () => router.refresh(),
      });
    });
  }

  const manageItems: ReactElement[] = [];
  if (canManage && row.kind === "numbered" && row.state === "free") {
    manageItems.push(
      <DropdownMenuItem
        key="assign"
        render={
          <Link href={`${TAG_PATH_PREFIX}${encodeURIComponent(row.value)}`} />
        }
      >
        <Hash /> Assign to an item
      </DropdownMenuItem>,
    );
  }
  if (canManage && row.kind === "numbered" && row.itemId) {
    const itemId = row.itemId;
    manageItems.push(
      <DropdownMenuItem
        key="unassign"
        onClick={() =>
          run(
            () => unassignNumberedCodeAction(itemId),
            () => `${row.value} is free now.`,
          )
        }
      >
        <Unlink /> Unassign
      </DropdownMenuItem>,
    );
  }
  if (canManage && isRetirable(row)) {
    manageItems.push(
      <DropdownMenuItem key="retire" onClick={() => setRetiring(true)}>
        <Ban /> Retire…
      </DropdownMenuItem>,
    );
  }
  if (canManage && row.state === "retired") {
    manageItems.push(
      <DropdownMenuItem
        key="restore"
        onClick={() =>
          run(
            () => unretireCodeAction(row.id),
            (result) => `${result.code} is restored.`,
          )
        }
      >
        <ArchiveRestore /> Restore
      </DropdownMenuItem>,
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {isLabelCode(row) && (
        <>
          <CopyTagUrlButton code={row.value} />
          <IconLink
            href={codesPrintHref({ ids: [row.id] })}
            label={`Print label for ${row.value}`}
          >
            <Printer />
          </IconLink>
          <TooltipIconButton
            label={
              written
                ? `Unmark ${row.value} as written to NFC`
                : `Mark ${row.value} written to NFC`
            }
            aria-pressed={written}
            disabled={isPending}
            className={written ? "text-primary" : undefined}
            onClick={() =>
              run(
                () => setNfcWrittenAction({ ids: [row.id] }, !written),
                () =>
                  written
                    ? `${row.value} is no longer marked as written.`
                    : `${row.value} is marked as written to NFC.`,
              )
            }
          >
            <Nfc />
          </TooltipIconButton>
        </>
      )}
      <CodeHistoryButton row={row} />
      {manageItems.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`More actions for ${row.value}`}
                disabled={isPending}
                focusableWhenDisabled
              />
            }
          >
            {isPending ? <Spinner /> : <MoreHorizontal />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{manageItems}</DropdownMenuContent>
        </DropdownMenu>
      )}
      {retiring && (
        <RetireCodesDialog
          target={{ ids: [row.id] }}
          count={1}
          heldBy={row.itemId ? row.itemDescription : null}
          code={row.value}
          defaultReason={
            row.kind === "asset_tag" && row.itemId ? "replaced" : "damaged"
          }
          open={retiring}
          onOpenChange={setRetiring}
        />
      )}
    </div>
  );
}

/** The toast after a retirement: how many, and what came off which item. */
export function retiredMessage(result: RetireResult): string {
  const parts = [`${formatCount(result.retired, "code")} retired.`];
  for (const released of result.released) {
    parts.push(`${released.code} came off ${released.description}.`);
  }
  return parts.join(" ");
}

/**
 * Why a code is retired, and a note. A code on an item comes off it; a
 * numbered code's number is never given out again, since printed copies may
 * still be out there. An item's last code is held back and asked about
 * again (#1544), so nothing is left untagged by accident. Used for one row,
 * and for a selection.
 */
export function RetireCodesDialog({
  target,
  count,
  code,
  heldBy = null,
  defaultReason = "damaged",
  trigger,
  open,
  onOpenChange,
  onDone,
}: {
  target: CodeTarget;
  count: number;
  /** The one code, when there is one. */
  code?: string;
  /** The item a single code is on now. */
  heldBy?: string | null;
  defaultReason?: RetireReason;
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<string>(defaultReason);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Codes held back because each is its item's last: retired only once the
  // person confirms, with the same reason and note.
  const [lastTags, setLastTags] = useState<RetireResult["lastTag"]>([]);
  const [isPending, startTransition] = useTransition();
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const confirming = lastTags.length > 0;

  function setOpen(next: boolean) {
    setInnerOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setError(null);
      setLastTags([]);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = confirming
        ? await retireCodesAction(
            { ids: lastTags.map((tag) => tag.tagId) },
            reason,
            note,
            true,
          )
        : await retireCodesAction(target, reason, note);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.retired > 0) toast.success(retiredMessage(result));
      router.refresh();
      if (result.lastTag.length > 0) {
        setLastTags(result.lastTag);
        return;
      }
      setOpen(false);
      onDone?.();
    });
  }

  const name = code ?? formatCount(count, "code");

  return (
    <PortalFormSurface
      title={`Retire ${name}`}
      description="For a tag that is damaged or lost, or a tag code replaced by a numbered code. A retired code can't be put on an item, and scanning it finds nothing. Restore it if the tag turns up."
      trigger={trigger}
      withTrigger={!!trigger}
      open={isOpen}
      onOpenChange={setOpen}
      size="md"
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="outline" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button
            type="submit"
            variant="destructive"
            disabled={isPending}
            focusableWhenDisabled
          >
            {isPending && <Spinner />} {confirming ? "Retire anyway" : "Retire"}
          </Button>
        </>
      }
    >
      <FieldGroup>
        {confirming ? (
          <Alert variant="destructive" aria-live="polite">
            <AlertDescription>
              {lastTags.length === 1
                ? `${lastTags[0].code} is the only code on ${lastTags[0].description}.`
                : `These are the only code on their items: ${lastTags
                    .map((tag) => `${tag.code} on ${tag.description}`)
                    .join(", ")}.`}{" "}
              Retiring leaves {lastTags.length === 1 ? "it" : "them"} with no
              code to scan. To replace a damaged label, reprint it instead.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {heldBy && (
              <Alert>
                <AlertDescription>
                  {code} is on {heldBy}. Retiring it takes it off.
                </AlertDescription>
              </Alert>
            )}
            {!code && (
              <p className="text-sm">
                A code on an item comes off it. If it is the item&apos;s only
                code, you&apos;re asked again first.
              </p>
            )}
          </>
        )}
        <Field>
          <FieldLabel htmlFor="retire-reason">Reason</FieldLabel>
          <select
            id="retire-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {RETIRE_REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="retire-note">Note</FieldLabel>
          <Textarea
            id="retire-note"
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Where it was last seen, what happened…"
          />
          <FieldDescription>Optional.</FieldDescription>
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}

const RELEASE_REASONS: Record<string, string> = {
  distributed: "the item was distributed",
  retired: "retired",
  lost: "the item was lost",
  moved: "moved to another item",
  replaced: "the item was given another code",
  unassigned: "unassigned by hand",
  code_retired: "the code was retired",
};

function describe(entry: CodeHistoryEntry) {
  const item = entry.itemDescription ?? "an item";
  switch (entry.event) {
    case "created":
      return entry.itemId ? `Created on ${item}` : "Created";
    case "bound":
      return `Put on ${item} at intake`;
    case "assigned":
      return `Assigned to ${item}`;
    case "released":
      return `Came off ${item}${
        entry.detail
          ? ` (${RELEASE_REASONS[entry.detail] ?? entry.detail})`
          : ""
      }`;
    case "printed":
      return "Label printed";
    case "nfc_written":
      return "Written to NFC";
    case "nfc_cleared":
      return "NFC mark removed";
    case "retired": {
      const [reason, ...note] = (entry.detail ?? "").split(": ");
      return `Retired: ${retireReasonLabel(reason)}${
        note.length ? ` — ${note.join(": ")}` : ""
      }`;
    }
    case "unretired":
      return "Restored";
    default:
      return entry.event;
  }
}

/**
 * Where a code has been (#1450): each item it was on and why it came off,
 * and when its label was printed, written, retired or restored. Loaded when
 * opened, not with the list.
 */
function CodeHistoryButton({ row }: { row: CodeRow }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<CodeHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function show() {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      const result = await codeHistoryAction(row.id);
      if ("error" in result) setError(result.error);
      else setEntries(result.data);
    });
  }

  return (
    <>
      <TooltipIconButton label={`History of ${row.value}`} onClick={show}>
        <History />
      </TooltipIconButton>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" size="sm">
          <SheetHeader>
            <SheetTitle>
              History of <span className="font-mono">{row.value}</span>
            </SheetTitle>
            <SheetDescription>Newest first.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            {isPending && !entries ? (
              <Spinner />
            ) : error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : entries && entries.length > 0 ? (
              <ol className="flex flex-col divide-y divide-[var(--line)]">
                {entries.map((entry, index) => (
                  <li key={index} className="flex flex-col gap-0.5 py-2.5">
                    <span className="text-sm font-medium">
                      {entry.itemId &&
                      ["created", "bound", "assigned", "released"].includes(
                        entry.event,
                      ) ? (
                        <Link
                          href={itemHref(entry.itemId)}
                          className="underline-offset-2 hover:underline"
                        >
                          {describe(entry)}
                        </Link>
                      ) : (
                        describe(entry)
                      )}
                    </span>
                    <span className="app-muted text-xs">
                      <ViewerTime iso={entry.occurredAt} fallbackZone="UTC" />
                      {entry.actorName && ` · ${entry.actorName}`}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="app-muted text-sm">Nothing recorded yet.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
