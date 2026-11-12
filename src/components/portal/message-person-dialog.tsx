"use client";

import {
  useId,
  useState,
  useTransition,
  type FormEvent,
  type ReactElement,
} from "react";
import { useRouter } from "next/navigation";
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
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MESSAGE_SUBJECT_LENGTH,
} from "@/lib/outbound-messages";

/**
 * Write one message to one person, about the record in front of you (#1203).
 *
 * Shared from the start, unlike the history card beside it: the composer has
 * the same shape whatever the record is, so #1204's volunteer applications and
 * contact messages pass a different `sendMessage` and change nothing else.
 *
 * Three things it deliberately is not. It takes no address — the action
 * resolves the recipient from the record, so this component cannot be talked
 * into mailing somebody else. It sends to one person, with no audience picker:
 * the free Resend plan allows a hundred emails a day, and anything
 * broadcast-shaped is a different feature. And it is not a thread; the help
 * text says where a reply actually lands, because replies leave the platform
 * for the organization's own mailbox.
 */
export function MessagePersonDialog({
  recipientName,
  toEmail,
  defaultSubject,
  replyTo,
  sendMessage,
  trigger,
  actionLabel = "Contact requester",
  disabledReason,
}: {
  /** For the dialog's own copy only; the action re-resolves the recipient. */
  recipientName: string;
  toEmail: string;
  defaultSubject: string;
  /** The tenant's Reply-To, or null when only the platform default applies. */
  replyTo: string | null;
  sendMessage: (input: {
    messageId: string;
    subject: string;
    body: string;
  }) => Promise<{ error: string } | { success: true }>;
  trigger?: ReactElement;
  /**
   * What the default trigger says, and what the disabled one says in its
   * place. Each queue names the person in its own terms -- a requester, an
   * applicant, somebody who wrote in -- and #1204's callers are why this is a
   * prop rather than the gear request's wording baked in.
   */
  actionLabel?: string;
  /** When set, the trigger is disabled and this says why. */
  disabledReason?: string;
}) {
  const router = useRouter();
  // Minted rather than fixed: this composer opens inside records' own detail
  // sheets, and #1204's contact message sheet already labels a field
  // `message-body`. Two elements sharing an id hand the label to whichever
  // comes first, which left the message box with no accessible name at all.
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /**
   * Minted per composition, not per send, and that is the whole idempotency
   * story: the action claims a delivery row keyed on it, so a double-click or
   * a Server Action the framework retries loses the unique-constraint race and
   * sends nothing.
   *
   * A *failed* send mints a new one, keeping what was typed. Retrying under
   * the spent id would lose that same race and report "already sent" for a
   * message that never left.
   */
  const [messageId, setMessageId] = useState(() => crypto.randomUUID());
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setMessageId(crypto.randomUUID());
      setSubject(defaultSubject);
      setBody("");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await sendMessage({ messageId, subject, body });
      // Updates after an `await` are not part of the transition until they are
      // wrapped again. Unwrapped, the error rendered urgently while `isPending`
      // only cleared in a later transition render, so the alert showed beside a
      // still-disabled Send and a retry click in that gap was swallowed (#1716).
      // Wrapped, the error and the re-enabled button land in one commit.
      startTransition(() => {
        if ("error" in result) {
          setError(result.error);
          setMessageId(crypto.randomUUID());
          return;
        }
        toast.success(`Message sent to ${recipientName || toEmail}.`);
        setOpen(false);
        router.refresh();
      });
    });
  }

  if (disabledReason) {
    return (
      <div className="flex flex-col gap-1">
        <Button type="button" variant="secondary" size="sm" disabled>
          {actionLabel}
        </Button>
        <p className="app-muted text-xs">{disabledReason}</p>
      </div>
    );
  }

  const canSend =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    subject.length <= MAX_MESSAGE_SUBJECT_LENGTH &&
    body.length <= MAX_MESSAGE_BODY_LENGTH;

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        trigger ?? (
          <Button type="button" variant="secondary" size="sm">
            {actionLabel}
          </Button>
        )
      }
      title={`Message ${recipientName || toEmail}`}
      description={`This goes to ${toEmail} from your organization's own address.`}
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
            Send message
          </Button>
        </>
      }
    >
      <div className="py-2">
        <FieldGroup>
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
              {`${body.length} / ${MAX_MESSAGE_BODY_LENGTH} characters. Your line breaks are kept. The sign-off is added for you.`}
            </FieldDescription>
          </Field>

          <p className="app-muted text-xs">
            {replyTo
              ? `Replies go to ${replyTo} — this isn't an inbox in the portal.`
              : "Replies go to your organization's reply-to mailbox — this isn't an inbox in the portal."}
          </p>

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
