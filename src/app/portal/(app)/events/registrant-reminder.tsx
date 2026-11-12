"use client";

import { useTransition } from "react";
import type { EventRegistrant } from "./registrants-actions";
import { sendEventReminderNowAction } from "./reminder-actions";
import { Button } from "@/components/ui/button";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { runAction } from "@/components/portal/action-toast";
import { formatInstantDate } from "@/lib/format";

/**
 * The event reminder (#1652) in the detail sheet: when it went, and for
 * `events: manage` "Send reminder now", which sends it straight away -- again,
 * if it already went -- and stops the hourly job sending it later.
 */
export function RegistrantReminder({
  registrant,
  canManage,
  orgEmailEnabled,
  onSent,
}: {
  registrant: EventRegistrant;
  canManage: boolean;
  orgEmailEnabled: boolean;
  onSent?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const sendable =
    canManage &&
    orgEmailEnabled &&
    !registrant.cancelled_at &&
    Boolean(registrant.email?.trim());

  function send() {
    startTransition(async () => {
      const outcome = await runAction(
        () =>
          sendEventReminderNowAction({
            eventId: registrant.event_id,
            registrationId: registrant.id,
          }),
        { success: `Reminder sent to ${registrant.name}.` },
      );
      if (outcome.ok) onSent?.();
    });
  }

  return (
    <ReadOnlyField label="Reminder email" htmlFor="registrant-reminder">
      {registrant.reminder_sent_at
        ? `Sent ${formatInstantDate(registrant.reminder_sent_at)}`
        : "Not sent"}{" "}
      {sendable && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 align-baseline"
          disabled={isPending}
          focusableWhenDisabled
          onClick={send}
        >
          Send reminder now
        </Button>
      )}
    </ReadOnlyField>
  );
}
