"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  reminderStatusText,
  type EventReminderStatus,
} from "@/lib/event-reminders";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";
import {
  loadEventReminderStatusAction,
  previewEventReminderAction,
} from "./reminder-actions";

/**
 * Planning's reminder status and preview (#1652). The status is read on
 * mount rather than with the event row, so the detail page pays for it only
 * where Planning is open; the send time is shown in the event's zone,
 * labelled, because that is the zone it is scheduled in.
 */

export function ReminderStatusLine({
  eventId,
  timeZone,
  version,
}: {
  eventId: string;
  timeZone: string;
  /** Changes when a save may have moved the send time, to read it again. */
  version: string;
}) {
  const [status, setStatus] = useState<EventReminderStatus | null>(null);

  useEffect(() => {
    let live = true;
    loadEventReminderStatusAction(eventId).then((result) => {
      if (live && "success" in result) setStatus(result.status);
    });
    return () => {
      live = false;
    };
  }, [eventId, version]);

  if (!status) return null;
  const sendAt = formatDateTimeInZone(
    status.sendAt,
    timeZone,
    DATE_TIME_WITH_ZONE,
    "en-US",
  );
  return (
    <p className="app-muted text-sm" data-testid="reminder-status">
      {reminderStatusText(status, sendAt)}
    </p>
  );
}

export function ReminderPreviewButton({
  eventId,
  intro,
}: {
  eventId: string;
  intro: string;
}) {
  const [preview, setPreview] = useState<{
    subject: string;
    html: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      const result = await previewEventReminderAction({ eventId, intro });
      if ("success" in result) {
        setPreview({ subject: result.subject, html: result.html });
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isPending}
        focusableWhenDisabled
        onClick={open}
      >
        {isPending ? <Spinner /> : <Eye />}
        Preview reminder
      </Button>
      <Dialog
        open={preview !== null}
        onOpenChange={(next) => {
          if (!next) setPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.subject ?? "Reminder"}</DialogTitle>
            <DialogDescription>
              As a registrant named Alex would get it. Each registrant&apos;s
              own email has their carpool and their own link.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <iframe
              title="The reminder, as it would be received"
              sandbox=""
              srcDoc={`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>html { background: #f5f5f4; } body { margin: 0; padding: 24px; background: #ffffff; }</style></head><body>${preview.html}</body></html>`}
              className="h-[28rem] w-full rounded-lg border border-[var(--line)] bg-white"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
