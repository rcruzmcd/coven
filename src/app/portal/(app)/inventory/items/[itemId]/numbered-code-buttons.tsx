"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hash, Unlink } from "lucide-react";
import { TagScanner } from "@/components/portal/tag-scanner";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  assignNumberedCodeAction,
  unassignNumberedCodeAction,
} from "../codes/actions";

type Held = { code: string; scanned: string; holder: string };

/** The toast once a numbered code is on the item. */
export function assignedMessage(result: {
  outcome: "assigned" | "already";
  code: string;
  retiredTagCodes: string[];
}): string {
  const assigned =
    result.outcome === "already"
      ? `${result.code} is already on this item.`
      : `${result.code} is on this item now.`;
  if (result.retiredTagCodes.length === 0) return assigned;
  return `${assigned} ${result.retiredTagCodes.join(", ")} ${
    result.retiredTagCodes.length === 1 ? "is" : "are"
  } retired: take the old label off.`;
}

/**
 * Puts the numbered code in hand on this item (#1444): type it, or scan its
 * label or tag. A code another item holds is moved only after the person
 * says so. The item's current code, if any, comes off. An item that also has
 * a random tag code is offered to retire it at the same time (#1544), on by
 * default when the organization uses numbered codes only.
 */
export function AssignNumberedCodeButton({
  itemId,
  current,
  tagCode = null,
  numberedOnly = false,
}: {
  itemId: string;
  current: string | null;
  /** The item's random asset-tag code, if it has one. */
  tagCode?: string | null;
  numberedOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [retireTagCode, setRetireTagCode] = useState(numberedOnly);
  const [isPending, startTransition] = useTransition();

  function reset(next: boolean) {
    setOpen(next);
    setMessage(null);
    setHeld(null);
    setRetireTagCode(numberedOnly);
  }

  function assign(scanned: string, move = false) {
    setMessage(null);
    startTransition(async () => {
      const result = await assignNumberedCodeAction(
        itemId,
        scanned,
        move,
        !!tagCode && retireTagCode,
      );
      if ("error" in result) {
        setMessage(result.error);
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
      toast.success(assignedMessage(result));
      if (result.retireError) toast.error(result.retireError);
      reset(false);
      router.refresh();
    });
  }

  return (
    <>
      <TooltipIconButton
        label={current ? "Change numbered code" : "Assign numbered code"}
        onClick={() => reset(true)}
      >
        <Hash />
      </TooltipIconButton>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {current ? "Change numbered code" : "Assign numbered code"}
            </DialogTitle>
            <DialogDescription>
              Type the number on the tag you have, like 17, or scan its label or
              NFC tag.
              {current && ` ${current} comes off this item.`}
            </DialogDescription>
          </DialogHeader>
          {held ? (
            <div className="flex flex-col gap-3" aria-live="polite">
              <p>
                {held.code} is on <strong>{held.holder}</strong>. Move it here?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={isPending}
                  focusableWhenDisabled
                  onClick={() => assign(held.scanned, true)}
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
              </div>
            </div>
          ) : (
            open && (
              <TagScanner
                onScan={(scanned) => assign(scanned)}
                busy={isPending}
                idPrefix="assign-code"
              />
            )
          )}
          {tagCode && (
            <Field orientation="horizontal">
              <Checkbox
                id="assign-code-retire-tag"
                checked={retireTagCode}
                onCheckedChange={(checked) =>
                  setRetireTagCode(checked === true)
                }
              />
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="assign-code-retire-tag">
                  Retire its tag code too
                </FieldLabel>
                <FieldDescription>
                  {tagCode} stops working, so the item has one code. Take its
                  old label off.
                </FieldDescription>
              </div>
            </Field>
          )}
          <div aria-live="polite">
            {message && (
              <Alert variant="destructive">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Takes the numbered code off by hand; it goes back in the pool. */
export function UnassignNumberedCodeButton({
  itemId,
  code,
}: {
  itemId: string;
  code: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function unassign() {
    startTransition(async () => {
      const result = await unassignNumberedCodeAction(itemId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`${code} is free. Take the tag off this item.`);
      router.refresh();
    });
  }

  return (
    <TooltipIconButton
      label={`Unassign code ${code}`}
      onClick={unassign}
      disabled={isPending}
    >
      {isPending ? <Spinner /> : <Unlink />}
    </TooltipIconButton>
  );
}
