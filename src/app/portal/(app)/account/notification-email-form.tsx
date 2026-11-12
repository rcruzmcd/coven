"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { formatInstantDate } from "@/lib/format";
import type { NotificationEmailResult } from "@/lib/notifications/notification-email-core";
import {
  resendMyNotificationEmailConfirmationAction,
  updateMyNotificationEmailAction,
} from "./actions";

/**
 * Where this person's portal email is delivered (#1042), and the address
 * waiting to prove itself (#1049).
 *
 * Sits above the switches rather than beside the preferred name, because it
 * answers the same question they do -- what reaches me, and where -- and
 * because leaving it with the identity fields invites reading it as a second
 * way to sign in.
 *
 * Three states, and the difference between them is the point: what is being
 * used, what has been asked for, and what happens if the link is never
 * followed. A save that reports "saved" and then quietly keeps sending
 * elsewhere would be the worst of the three to read.
 */
export function NotificationEmailForm({
  notificationEmail,
  pendingEmail,
  pendingExpiresAt,
  signInEmail,
  orgEmailEnabled,
}: {
  /** Confirmed, and in use. */
  notificationEmail: string | null;
  /** Asked for, not yet proved; mail still goes to the confirmed address. */
  pendingEmail: string | null;
  pendingExpiresAt: string | null;
  /** The address on the account, shown as the placeholder it falls back to. */
  signInEmail: string;
  orgEmailEnabled: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(notificationEmail ?? "");
  // Baseline for the dirty check, in state rather than read off the prop, so a
  // save settles the form without waiting for router.refresh() -- the same
  // reason AccountForm keeps one.
  const [baseline, setBaseline] = useState(value);
  const [pending, setPending] = useState<{
    email: string;
    expiresAt: string | null;
  } | null>(
    pendingEmail ? { email: pendingEmail, expiresAt: pendingExpiresAt } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = value.trim() !== baseline.trim();
  const inUse = notificationEmail ?? signInEmail;

  function submit(run: () => Promise<NotificationEmailResult>, saved: string) {
    setError(null);
    startTransition(async () => {
      await runAction(run, {
        // A pending address is not a save, and saying "saved" would be the one
        // message that leaves somebody expecting mail somewhere it is not
        // going yet.
        success: (result) =>
          result.outcome === "pending"
            ? `Check ${result.pendingEmail} for a link to confirm it.`
            : saved,
        onError: setError,
        onSuccess: (result) => {
          setPending(
            result.outcome === "pending" && result.pendingEmail
              ? { email: result.pendingEmail, expiresAt: null }
              : null,
          );
          setBaseline(value);
          router.refresh();
        },
      });
    });
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(
            () => updateMyNotificationEmailAction(value),
            value.trim()
              ? `Notifications will go to ${value.trim()}.`
              : `Notifications will go to ${signInEmail}.`,
          );
        }}
        className="space-y-3"
      >
        <Field>
          <FieldLabel htmlFor="notificationEmail">Send them to</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="notificationEmail"
              name="notificationEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              className="max-w-xs"
              value={value}
              placeholder={signInEmail}
              disabled={isPending}
              onChange={(event) => setValue(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={isPending || !isDirty}
            >
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
          <FieldDescription>
            A new address has to be confirmed from a link sent to it, so mail
            keeps going to {inUse} until then. Leave it empty to use{" "}
            {signInEmail}, the address you sign in with. This only changes where
            email arrives — you still sign in the same way.
          </FieldDescription>
        </Field>
      </form>

      {pending && (
        <Alert>
          <AlertDescription>
            <span className="font-medium">{pending.email}</span> is waiting to
            be confirmed.{" "}
            {pending.expiresAt
              ? `The link expires ${formatInstantDate(pending.expiresAt)}.`
              : "Follow the link in the email we sent it."}{" "}
            {!orgEmailEnabled &&
              "Your organization has email turned off, so nothing is being sent — including that link. "}
            Until then, mail goes to {inUse}.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-1 h-7 px-2 underline underline-offset-4"
              disabled={isPending}
              focusableWhenDisabled
              onClick={() =>
                submit(
                  () =>
                    resendMyNotificationEmailConfirmationAction(pending.email),
                  `Sent another link to ${pending.email}.`,
                )
              }
            >
              Send another link
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
