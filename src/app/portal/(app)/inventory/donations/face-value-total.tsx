"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/format";
import { unvaluedLabel } from "./donation-shared";

/**
 * A face-value total that says when some items were never valued, rather than
 * quietly counting them as $0. `—` when nothing was valued at all.
 */
export function FaceValueTotal({
  count,
  totalValue,
  unvaluedCount,
}: {
  count: number;
  totalValue: number;
  unvaluedCount: number;
}) {
  if (count === 0 || unvaluedCount === count) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {formatCurrency(totalValue)}
      {unvaluedCount > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={unvaluedLabel(unvaluedCount)}
              />
            }
          >
            <CircleAlert className="text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>{unvaluedLabel(unvaluedCount)}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
