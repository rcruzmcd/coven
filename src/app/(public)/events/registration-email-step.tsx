"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { trackSite } from "@/lib/analytics/form-events";
import { EmailCodeForm } from "@/app/(public)/my/sign-in/email-code-form";

/**
 * Email-first registration (#1765): the address, before the form.
 *
 * A returning rider asks for a code, enters it, and is signed in; the page
 * then refreshes and the server renders the signed-in path it already has --
 * their own record prefilled through `register_myself_for_event()` when
 * linked, their account's name and address and the claim offer when not
 * (#1257, #1401). Nothing about the address is looked up before the code is
 * verified, and nothing on this step differs for an address we know.
 *
 * "Continue without it" shows `children`, today's anonymous form, exactly as
 * it was.
 */
export function RegistrationEmailStep({
  eventId,
  children,
}: {
  eventId: string;
  /** The anonymous registration form. */
  children: ReactNode;
}) {
  const router = useRouter();
  const [skipped, setSkipped] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // The button that was pressed is gone, so focus would fall to the page:
  // hand it to the form's first field, as opening the disclosure does.
  useEffect(() => {
    if (!skipped) return;
    formRef.current
      ?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")
      ?.focus();
  }, [skipped]);

  if (skipped) return <div ref={formRef}>{children}</div>;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Start with your email</h3>
        <p className="app-muted text-sm">
          Registered with us before? We can email you a code to fill in your
          details.
        </p>
      </div>
      <EmailCodeForm
        idPrefix="registration-code"
        sendLabel="Send me a code to fill in my details"
        verifyLabel="Fill in my details"
        secondaryAction={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              trackSite("registration_code_skipped", { event_id: eventId });
              setSkipped(true);
            }}
          >
            Continue without it
          </Button>
        }
        onSent={() =>
          trackSite("registration_code_sent", { event_id: eventId })
        }
        onVerified={() => {
          trackSite("registration_code_verified", { event_id: eventId });
          // The server reads the new session and renders the signed-in form.
          router.refresh();
        }}
      />
    </div>
  );
}
