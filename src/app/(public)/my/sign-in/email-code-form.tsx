"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  normalizeSignInCode,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_CODE_REJECTED,
} from "@/lib/constituent/sign-in-code";
import { sendSignInCodeAction } from "./sign-in-code-actions";

/**
 * Sign in with an emailed one-time code (#1765): an address, then the code.
 *
 * Shared by the registration form's first step and `/my/sign-in`. The code is
 * verified here, in the browser, with the same client the password sign-in
 * uses, so the session cookie is written the same way and Auth's own
 * per-IP verification limit sees the visitor's address rather than the
 * server's.
 *
 * Nothing on either screen depends on whether the address was known: the
 * "sent" notice is the action's one answer, and a refused code is one
 * sentence whatever the reason. What the caller does once verified --
 * refresh the page so the server reads the new session -- is its own.
 *
 * `preview` (a staff preview of an event, #1764) walks the same two screens
 * without sending a code or signing anyone in: any code of the right length
 * is accepted, and `onVerified` is the caller's to interpret.
 */
export function EmailCodeForm({
  idPrefix,
  sendLabel,
  verifyLabel,
  secondaryAction,
  onSent,
  onVerified,
  onRejected,
  preview = false,
}: {
  /** Prefixes the inputs' ids, so two instances never share one. */
  idPrefix: string;
  /** The primary button on the address step. */
  sendLabel: string;
  /** The primary button on the code step. */
  verifyLabel: string;
  /** Beside the primary button on both steps, e.g. "Continue without it". */
  secondaryAction?: ReactNode;
  onSent?: () => void;
  onVerified: () => void;
  onRejected?: () => void;
  /** Send nothing and verify nothing: the screens only. */
  preview?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function send() {
    setError(null);
    if (preview) {
      setNotice(
        `Preview: no code was sent. Enter any ${SIGN_IN_CODE_LENGTH} digits to continue.`,
      );
      setCode("");
      setPhase("code");
      return;
    }
    setIsPending(true);
    const result = await sendSignInCodeAction(email);
    setIsPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setNotice(result.sent);
    setCode("");
    setPhase("code");
    onSent?.();
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send();
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = normalizeSignInCode(code);
    if (token.length !== SIGN_IN_CODE_LENGTH) {
      setError(`Enter the ${SIGN_IN_CODE_LENGTH}-digit code from the email.`);
      return;
    }
    setError(null);
    if (preview) {
      onVerified();
      return;
    }
    setIsPending(true);
    const { error: verifyError } =
      await createSupabaseBrowserClient().auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
    if (verifyError) {
      setIsPending(false);
      setError(SIGN_IN_CODE_REJECTED);
      onRejected?.();
      return;
    }
    // Left pending: the caller is about to replace this form.
    onVerified();
  }

  function changeEmail() {
    setPhase("email");
    setNotice(null);
    setError(null);
    setCode("");
  }

  const errorAlert = error && (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  if (phase === "email") {
    return (
      <form onSubmit={handleSend} noValidate>
        <FieldGroup>
          {errorAlert}
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-email`} required>
              Email
            </FieldLabel>
            <Input
              id={`${idPrefix}-email`}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isPending || !email.trim()}>
              {isPending ? <Spinner /> : null}
              {sendLabel}
            </Button>
            {secondaryAction}
          </div>
        </FieldGroup>
      </form>
    );
  }

  return (
    <form onSubmit={handleVerify} noValidate>
      <FieldGroup>
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {errorAlert}
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-code`} required>
            Code
          </FieldLabel>
          <Input
            id={`${idPrefix}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={SIGN_IN_CODE_LENGTH + 2}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <FieldDescription>Sent to {email.trim()}.</FieldDescription>
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? <Spinner /> : null}
            {verifyLabel}
          </Button>
          {secondaryAction}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={send}
            disabled={isPending}
          >
            Send a new code
          </button>
          <button
            type="button"
            className="app-muted underline hover:text-foreground"
            onClick={changeEmail}
            disabled={isPending}
          >
            Use a different email
          </button>
        </div>
      </FieldGroup>
    </form>
  );
}
