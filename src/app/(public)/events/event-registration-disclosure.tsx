"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trackForm } from "@/lib/analytics/form-events";

/** Fields, in document order, ignoring the honeypot and anything hidden. */
const FIRST_FIELD_SELECTOR =
  'input:not([type="hidden"]):not([tabindex="-1"]), select, textarea';

/**
 * How a form inside the disclosure closes it again: the steps' Cancel button
 * (#1427). Null outside a disclosure, where there is nothing to cancel back
 * to, and the steps render no Cancel at all.
 */
const CloseRegistrationContext = createContext<(() => void) | null>(null);

/** The disclosure's close, for the form's Cancel button. */
export function useCloseRegistration() {
  return useContext(CloseRegistrationContext);
}

/**
 * Registering is a decision, so the form waits to be asked for (#1256).
 *
 * Once asked for, the Register button gives way to the form rather than
 * standing above it (#1427): a second call to the same action over a form
 * already open is one thing too many to read past, and "press Register again
 * to put it away" was nobody's guess. The form sits in a card, and its own
 * footer carries Cancel, which collapses it and hands focus back to Register.
 *
 * Local state, not a route. An event is worth a URL (#847); "I have started
 * filling in a form" is not, and pushing history for it would put Back
 * between the reader and the listing.
 *
 * The panel is hidden rather than unmounted so that cancelling does not throw
 * away what has been typed.
 */
export function EventRegistrationDisclosure({
  eventId,
  eventName,
  children,
}: {
  eventId: string;
  eventName: string;
  children: ReactNode;
}) {
  const panelId = useId();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Focus first, so a keyboard or screen-reader user is not left standing at
    // the bottom of a page that silently grew; scroll second, so the field
    // lands somewhere deliberate rather than wherever focus dragged it.
    panel.querySelector<HTMLElement>(FIRST_FIELD_SELECTOR)?.focus({
      preventScroll: true,
    });
    panel.scrollIntoView({ block: "nearest" });
  }, [open]);

  function close() {
    // Synchronously, so the Register button exists to take focus: the one
    // that was pressed is about to be hidden with the rest of the form.
    flushSync(() => setOpen(false));
    triggerRef.current?.focus();
  }

  return (
    <div>
      {!open && (
        <Button
          ref={triggerRef}
          type="button"
          variant="rainbow"
          aria-expanded={false}
          aria-controls={panelId}
          onClick={() => {
            setOpen(true);
            trackForm("event_registration", "form_viewed", {
              event_id: eventId,
            });
          }}
          className="w-full sm:w-fit"
        >
          Register
        </Button>
      )}
      <section
        ref={panelRef}
        id={panelId}
        hidden={!open}
        aria-labelledby={headingId}
      >
        {/* No bottom padding while the steps are showing: their pinned bar is
            the card's footer, and meets its bottom edge. The confirmation that
            replaces them keeps the padding. `CardContent`'s `px-4` is the
            padding the bar's `-mx-4 px-4` reaches back across. */}
        <Card className="has-data-registration-steps:pb-0">
          <CardHeader>
            <CardTitle>
              <h2 id={headingId}>Register for {eventName}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CloseRegistrationContext value={close}>
              {children}
            </CloseRegistrationContext>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
