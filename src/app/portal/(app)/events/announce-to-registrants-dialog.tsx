"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";
import {
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MESSAGE_SUBJECT_LENGTH,
} from "@/lib/outbound-messages";
import {
  ANNOUNCEMENT_AUDIENCES,
  announcementAudienceLabel,
  announcementRefusal,
  describeAnnouncementAudience,
  MAX_ANNOUNCEMENT_RECIPIENTS,
  resolveAnnouncementAudience,
  type AnnouncementAudience,
  type AudienceRegistration,
} from "@/lib/event-announcements";
import { sendEventAnnouncementAction } from "./registrants-actions";
import {
  announcementSubject,
  photosMessage,
  photosSubject,
} from "./registrant-messaging";

/**
 * One notice, to everybody registered for this event (#1317).
 *
 * The composer's own shape is the one-to-one dialog's, with one addition that
 * changes everything about it: an audience, and the resolved count of what
 * that audience comes to, stated before the send. The count is the part that
 * cannot be undone, so it is not a detail in the confirmation toast -- it is
 * on screen while the staffer is still deciding, and it accounts for every
 * registration that is not in it.
 *
 * The audience is resolved twice, here and in the action, from the same pure
 * function. That is deliberate: the browser's copy is what makes the count
 * honest, and the server's is what makes it safe -- this dialog sends an
 * audience *name*, never a recipient list, so it cannot be talked into mailing
 * anyone who is not registered.
 */
export function AnnounceToRegistrantsDialog({
  eventId,
  eventName,
  registrations,
  replyTo,
  disabledReason,
  photos,
  onSent,
  open: controlledOpen,
  onOpenChange,
  withTrigger,
}: ControlledOpenProps & {
  eventId: string;
  eventName: string;
  /** The tab's own list, so the count matches what is on screen. */
  registrations: readonly AudienceRegistration[];
  replyTo: string | null;
  /** Set when nothing can be sent: org email is switched off. */
  disabledReason?: string;
  /**
   * Send photos (#1555): the same composer, started from the tenant's message
   * and the event's public gallery link. Everyone registered by default, not
   * only those checked in -- check-in is often skipped on the day -- and a
   * photo objection (#1376) is about being photographed, so it excludes
   * nobody.
   */
  photos?: { url: string; body: readonly string[] };
  onSent?: () => void;
}) {
  const fieldId = useId();
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /**
   * Minted per composition, and shared by every copy of this announcement. It
   * is half of each recipient's dedupe key, so a double-click or a Server
   * Action the framework retries loses the unique-constraint race once per
   * registration and mails nobody twice.
   */
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [audience, setAudience] = useState<AnnouncementAudience>("everyone");
  const initialSubject = () =>
    photos ? photosSubject(eventName) : announcementSubject(eventName);
  const initialBody = () =>
    photos ? photosMessage(photos.body, photos.url) : "";
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const label = photos ? "Send photos" : "Message registrants";

  const resolved = useMemo(
    () => resolveAnnouncementAudience(registrations, audience),
    [registrations, audience],
  );
  const refusal = announcementRefusal(resolved);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setBatchId(crypto.randomUUID());
      setAudience("everyone");
      setSubject(initialSubject());
      setBody(initialBody());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await sendEventAnnouncementAction({
        batchId,
        eventId,
        audience,
        subject,
        body,
      });
      if ("error" in result) {
        setError(result.error);
        // A failed send mints a new id, keeping what was typed: retrying under
        // the spent one would lose the same race and report "already sent" for
        // an announcement that never left.
        setBatchId(crypto.randomUUID());
        return;
      }
      toast.success(
        `Sending to ${result.recipients} ${result.recipients === 1 ? "person" : "people"}.`,
        {
          description:
            "The announcements card shows how many arrived once the send finishes.",
        },
      );
      setOpen(false);
      onSent?.();
    });
  }

  if (disabledReason) {
    return (
      <div className="flex flex-col gap-1">
        <Button type="button" variant="secondary" size="sm" disabled>
          {label}
        </Button>
        <p className="app-muted text-xs">{disabledReason}</p>
      </div>
    );
  }

  const canSend =
    !refusal &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    subject.length <= MAX_MESSAGE_SUBJECT_LENGTH &&
    body.length <= MAX_MESSAGE_BODY_LENGTH;

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      withTrigger={withTrigger}
      trigger={
        <Button type="button" variant="secondary" size="sm">
          {label}
        </Button>
      }
      title={
        photos
          ? `Send the photos from ${eventName}`
          : `Message everyone registered for ${eventName}`
      }
      description="One email each, from your organization's own address."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending || !canSend}>
            {isPending ? <Spinner /> : null}
            {photos ? "Send photos" : "Send announcement"}
          </Button>
        </>
      }
    >
      <div className="py-2">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-audience`} required>
              Who it goes to
            </FieldLabel>
            {/* A native select, like the filters elsewhere in the portal: three
                fixed options that decide a send, in a dialog that already
                carries two overlays' worth of focus management. */}
            <select
              id={`${fieldId}-audience`}
              name="audience"
              value={audience}
              onChange={(event) =>
                setAudience(event.target.value as AnnouncementAudience)
              }
              className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {ANNOUNCEMENT_AUDIENCES.map((option) => (
                <option key={option} value={option}>
                  {announcementAudienceLabel(option)}
                </option>
              ))}
            </select>
            <FieldDescription>
              {describeAnnouncementAudience(resolved)}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${fieldId}-subject`} required>
              Subject
            </FieldLabel>
            <Input
              id={`${fieldId}-subject`}
              name="subject"
              required
              maxLength={MAX_MESSAGE_SUBJECT_LENGTH}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
            <FieldDescription>
              {`${subject.length} / ${MAX_MESSAGE_SUBJECT_LENGTH} characters. Sent as typed — nothing is added in front of it.`}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${fieldId}-body`} required>
              Message
            </FieldLabel>
            <Textarea
              id={`${fieldId}-body`}
              name="body"
              required
              rows={10}
              maxLength={MAX_MESSAGE_BODY_LENGTH}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <FieldDescription>
              {`${body.length} / ${MAX_MESSAGE_BODY_LENGTH} characters. Each person gets their own copy, headed with the event's name and a link to its page.`}
            </FieldDescription>
          </Field>

          <p className="app-muted text-xs">
            {replyTo
              ? `Replies go to ${replyTo} — this isn't an inbox in the portal.`
              : "Replies go to your organization's reply-to mailbox — this isn't an inbox in the portal."}
          </p>
          <p className="app-muted text-xs">
            {`An announcement reaches ${MAX_ANNOUNCEMENT_RECIPIENTS} people at most. This is correspondence with people who registered, not a mailing list.`}
          </p>

          {refusal ? (
            <Alert variant="destructive">
              <AlertDescription>{refusal}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </div>
    </PortalFormSurface>
  );
}
