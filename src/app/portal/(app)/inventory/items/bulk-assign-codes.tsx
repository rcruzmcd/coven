"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hash } from "lucide-react";
import { TagScanner } from "@/components/portal/tag-scanner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  assignNumberedCodeAction,
  freeNumberedCodesAction,
} from "./codes/actions";
import {
  itemCount,
  nextSuggestion,
  planBulkAssign,
  skipReasonText,
  type BulkAssigned,
  type BulkAssignItem,
  type BulkSkipped,
} from "./bulk-assign";

type Held = { code: string; scanned: string; holder: string };

type Run = {
  queue: BulkAssignItem[];
  index: number;
  assigned: BulkAssigned[];
  skipped: BulkSkipped[];
};

/**
 * Assigns numbered codes to the selected items one at a time (#1542): the
 * dialog shows each item in turn, and the person scans or types the code on
 * the tag they are putting on it. It may suggest the next free code, but
 * never binds one the person didn't give it (#1444). Items that already have
 * a numbered code, or have left inventory, are passed over and listed at the
 * end with everything else that was skipped.
 */
export function BulkAssignCodesButton({
  items,
  onDone,
}: {
  items: BulkAssignItem[];
  /** After the dialog closes on a run that changed something. */
  onDone: () => void;
}) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [free, setFree] = useState<string[]>([]);
  const [held, setHeld] = useState<Held | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = run ? (run.queue[run.index] ?? null) : null;
  const suggestion = nextSuggestion(
    free,
    run?.assigned.map((entry) => entry.code) ?? [],
  );

  function start() {
    const plan = planBulkAssign(items);
    setRun({
      queue: plan.queue,
      index: 0,
      assigned: [],
      skipped: plan.skipped,
    });
    setHeld(null);
    setMessage(null);
    setFree([]);
    if (plan.queue.length > 0) {
      void freeNumberedCodesAction(plan.queue.length).then((result) => {
        if ("codes" in result) setFree(result.codes);
      });
    }
  }

  function close() {
    const changed = (run?.assigned.length ?? 0) > 0;
    setRun(null);
    if (changed) {
      onDone();
      router.refresh();
    }
  }

  function advance(update: (prev: Run) => Partial<Run>) {
    setHeld(null);
    setMessage(null);
    setRun((prev) =>
      prev ? { ...prev, ...update(prev), index: prev.index + 1 } : prev,
    );
  }

  function skip(entry: BulkSkipped) {
    advance((prev) => ({ skipped: [...prev.skipped, entry] }));
  }

  function stop() {
    setHeld(null);
    setMessage(null);
    setRun((prev) =>
      prev
        ? {
            ...prev,
            skipped: [
              ...prev.skipped,
              ...prev.queue.slice(prev.index).map((item) => ({
                id: item.id,
                description: item.description,
                reason: "not_reached" as const,
              })),
            ],
            index: prev.queue.length,
          }
        : prev,
    );
  }

  function assign(item: BulkAssignItem, scanned: string, move = false) {
    setMessage(null);
    startTransition(async () => {
      const result = await assignNumberedCodeAction(item.id, scanned, move);
      if ("error" in result) {
        if (result.reason === "item_gone") {
          skip({
            id: item.id,
            description: item.description,
            reason: "left_inventory",
          });
        } else {
          setMessage(result.error);
        }
        return;
      }
      if (result.outcome === "held") {
        setHeld({
          code: result.code,
          scanned,
          holder: result.holder.description,
        });
        return;
      }
      advance((prev) => ({
        assigned: [
          ...prev.assigned,
          { id: item.id, description: item.description, code: result.code },
        ],
      }));
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={start}>
        <Hash /> Assign numbered codes
      </Button>
      <Dialog
        open={run !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent>
          {run && current ? (
            <>
              <DialogHeader>
                <DialogTitle>Assign numbered codes</DialogTitle>
                <DialogDescription>
                  Item {run.index + 1} of {run.queue.length}. Put a tag on it,
                  then type its number, like 17, or scan its label or NFC tag.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1">
                <p className="font-medium">{current.description}</p>
                {current.assetTag && (
                  <p className="app-muted text-sm">
                    Tag code {current.assetTag}
                  </p>
                )}
                {suggestion && (
                  <p className="app-muted text-sm">
                    Next free code: {suggestion}
                  </p>
                )}
              </div>
              {held ? (
                <div className="flex flex-col gap-3" aria-live="polite">
                  <p>
                    {held.code} is on <strong>{held.holder}</strong>. Move it
                    here?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={isPending}
                      focusableWhenDisabled
                      onClick={() => assign(current, held.scanned, true)}
                    >
                      {isPending && <Spinner />} Move {held.code} here
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setHeld(null)}
                    >
                      Use another code
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        skip({
                          id: current.id,
                          description: current.description,
                          reason: "code_taken",
                          code: held.code,
                          holder: held.holder,
                        })
                      }
                    >
                      Skip this item
                    </Button>
                  </div>
                </div>
              ) : (
                <TagScanner
                  key={current.id}
                  onScan={(scanned) => assign(current, scanned)}
                  busy={isPending}
                  idPrefix="bulk-assign-code"
                />
              )}
              <div aria-live="polite">
                {message && (
                  <Alert variant="destructive">
                    <AlertDescription>{message}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={stop}>
                  Stop here
                </Button>
                {!held && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending}
                    focusableWhenDisabled
                    onClick={() =>
                      skip({
                        id: current.id,
                        description: current.description,
                        reason: "by_hand",
                      })
                    }
                  >
                    Skip this item
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : (
            run && <BulkAssignSummary run={run} onClose={close} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkAssignSummary({
  run,
  onClose,
}: {
  run: Run;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Numbered codes assigned</DialogTitle>
        <DialogDescription>
          {itemCount(run.assigned.length)} got a code
          {run.skipped.length > 0 &&
            `, ${itemCount(run.skipped.length)} skipped`}
          .
        </DialogDescription>
      </DialogHeader>
      <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto">
        {run.assigned.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">Assigned</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {run.assigned.map((entry) => (
                <li key={entry.id}>
                  <span className="font-medium">{entry.code}</span> —{" "}
                  {entry.description}
                </li>
              ))}
            </ul>
          </section>
        )}
        {run.skipped.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">Skipped</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {run.skipped.map((entry) => (
                <li key={entry.id}>
                  {entry.description}{" "}
                  <span className="app-muted">{skipReasonText(entry)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
