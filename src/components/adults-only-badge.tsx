import { Badge } from "@/components/ui/badge";
import {
  type MinimumAge,
  minimumAgeDescription,
  minimumAgeLabel,
} from "@/lib/adults-only";
import { cn } from "@/lib/utils";

/**
 * The age badge ("18+", "21+") on an event with an age requirement (#1417,
 * #1782): the card, the detail page and the sheet header. Renders nothing for
 * any other event, so a caller passes the age rather than wrapping it in a
 * condition of its own.
 */
export function AdultsOnlyBadge({
  minimumAge,
  className,
}: {
  minimumAge: MinimumAge | null | undefined;
  className?: string;
}) {
  if (!minimumAge) return null;
  const description = minimumAgeDescription(minimumAge);
  return (
    <Badge
      variant="outline"
      className={cn("align-middle", className)}
      title={description}
    >
      <span aria-hidden="true">{minimumAgeLabel(minimumAge)}</span>
      <span className="sr-only">{description}</span>
    </Badge>
  );
}
