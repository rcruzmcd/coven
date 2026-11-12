"use client";

import { useTransition } from "react";
import {
  setRegistrationsGroupChatAction,
  type EventRegistrant,
} from "./registrants-actions";
import { Button } from "@/components/ui/button";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { runAction } from "@/components/portal/action-toast";
import { formatInstantDate } from "@/lib/format";
import type { EventGroupChat } from "@/lib/registration-group-chat";

/**
 * Whether this registrant has been added to the event's group chat (#1648),
 * in the detail sheet, and for `events: manage` the toggle. Staff only: the
 * registrant never sees it. Shown on a cancelled registration too, which is
 * how staff know to take somebody back out.
 */
export function RegistrantGroupChat({
  registrant,
  groupChat,
  canManage,
  onSaved,
}: {
  registrant: EventRegistrant;
  groupChat: NonNullable<EventGroupChat>;
  canManage: boolean;
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const added = registrant.group_chat_added_at !== null;

  function toggle() {
    startTransition(async () => {
      const outcome = await runAction(
        () =>
          setRegistrationsGroupChatAction({
            eventId: registrant.event_id,
            registrationIds: [registrant.id],
            added: !added,
          }),
        {
          success: added
            ? `${registrant.name} marked not in ${groupChat.label}.`
            : `${registrant.name} marked added to ${groupChat.label}.`,
        },
      );
      if (outcome.ok) onSaved?.();
    });
  }

  return (
    <ReadOnlyField label={groupChat.label} htmlFor="registrant-group-chat">
      {registrant.group_chat_added_at
        ? `Added ${formatInstantDate(registrant.group_chat_added_at)}${
            registrant.group_chat_added_by_name
              ? ` by ${registrant.group_chat_added_by_name}`
              : ""
          }`
        : "Not added"}{" "}
      {canManage && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 align-baseline"
          disabled={isPending}
          focusableWhenDisabled
          onClick={toggle}
        >
          {added ? "Mark not added" : "Mark added"}
        </Button>
      )}
    </ReadOnlyField>
  );
}
