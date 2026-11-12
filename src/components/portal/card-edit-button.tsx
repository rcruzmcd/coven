"use client";

import { useRef } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardAction } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFocusWhenClosed } from "@/hooks/use-focus-when-closed";

/**
 * The pencil in a card header that swaps the card into its edit form.
 *
 * It stays mounted while the form is open and renders nothing, so it can see
 * the form close: Save or Cancel unmounts the button that had focus, and
 * focus comes back here instead of falling to `<body>` (#1859).
 */
export function CardEditButton({
  label,
  editing,
  onEdit,
}: {
  label: string;
  editing: boolean;
  onEdit: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useFocusWhenClosed(editing, ref);
  if (editing) return null;
  return (
    <CardAction>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              ref={ref}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              onClick={onEdit}
            />
          }
        >
          <Pencil />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </CardAction>
  );
}
