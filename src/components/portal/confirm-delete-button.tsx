"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { keepFocusOnRemoval } from "@/lib/focus-on-removal";

/**
 * The row-level delete affordance, with the confirmation step that fourteen
 * hand-rolled copies of it were missing. These sit in dense tables next to an
 * edit button, they destroy records with real consequences (a board decision,
 * logged volunteer hours that feed grant reporting, an event sponsor), and the
 * portal has no undo -- so a mis-tap was permanent.
 *
 * Modelled on `DeleteAssetButton`, which already got this right: name the
 * record in the title, state the consequence, say it can't be undone, and
 * disable both buttons while the action is in flight.
 */
export function ConfirmDeleteButton({
  label,
  title,
  description,
  confirmLabel = "Delete",
  pending = false,
  disabled = false,
  onConfirm,
}: {
  /** Accessible name for the trigger, e.g. "Remove sponsor". */
  label: string;
  /** Names the specific record, e.g. `Remove Ada Lovelace as a sponsor?`. */
  title: string;
  /** What this destroys, and that it can't be undone. */
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              disabled={disabled || pending}
              // Pending keeps it focusable, and the row it deletes takes it
              // away on success: focus moves on to the next row (#1862).
              focusableWhenDisabled
              ref={keepFocusOnRemoval}
              onClick={() => setOpen(true)}
            />
          }
        >
          {pending ? <Spinner /> : <Trash2 />}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
