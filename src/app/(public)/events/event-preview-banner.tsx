import { EyeIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NO_FORM_ANALYTICS_ATTRIBUTE } from "@/lib/analytics/no-form-analytics";

/**
 * Says the page is a staff preview (#1764). Its marker attribute also keeps
 * the page's form events out of the funnel: a test run is not a visitor.
 */
export function EventPreviewBanner({ eventId }: { eventId: string }) {
  return (
    <Alert
      className="mb-6"
      data-event-preview={eventId}
      {...{ [NO_FORM_ANALYTICS_ATTRIBUTE]: "" }}
    >
      <EyeIcon aria-hidden />
      <AlertTitle>Preview, not public</AlertTitle>
      <AlertDescription>
        Only people who manage events can see this page. A registration made
        here is a test: it holds no place, counts in nothing, and its
        confirmation goes to your own address.
      </AlertDescription>
    </Alert>
  );
}
