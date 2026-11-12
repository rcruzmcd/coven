import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marks a post that belongs to a recurring series (#1839), beside its title.
 * Named for screen readers, since the icon is all a sighted reader sees.
 */
export function RepeatMarker({
  seriesId,
  className,
}: {
  seriesId: string | null;
  className?: string;
}) {
  if (!seriesId) return null;
  return (
    <Repeat
      role="img"
      aria-label="Repeats"
      className={cn("inline size-3 shrink-0 align-[-0.1em]", className)}
    />
  );
}
