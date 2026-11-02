"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeMyDestination } from "@/lib/constituent/paths";
import { navigateAfterSessionChange } from "@/lib/constituent/session-navigation";
import { trackForm, useFormStarted } from "@/lib/analytics/form-events";

type Mode = "sign-in" | "sign-up";

function urlErrorMessage(reason: string | null) {
  if (reason === "oauth_failed")
    return "Google sign-in failed. Please try again.";
  return null;
}

/**
 * Sign in or create an account for the constituent area (#1161).
 *
 * The same two methods the portal offers, against the same accounts: this is
 * not a separate consumer login, and an administrator signing in here with
 * their portal account is the intended case, not an edge one. What is new is
 * `signUp` -- the first in the codebase -- because until now every account was
 * created by an administrator's invite.
 *
 * Sign-up deliberately promises nothing about the resulting account's history.
 * Linking it to a directory record is a reviewed claim (#1162), so the most
 * this can honestly say is that the account exists.
 */
export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = safeMyDestination(searchParams.get("next"));

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() =>
    urlErrorMessage(searchParams.get("error")),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // The funnel (#1713). Still no identify() once signed in: a signed-in
  // visitor is counted exactly like an anonymous one.
  const startTracking = useFormStarted("my_sign_in", {});

  useEffect(() => {
    trackForm("my_sign_in", "form_viewed", {});
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    trackForm("my_sign_in", "form_submitted", {
      method: mode === "sign-up" ? "sign_up" : "password",
    });

    const supabase = createSupabaseBrowserClient();

    if (mode === "sign-up") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
        },
      });
      setIsSubmitting(false);

      if (signUpError) {
        // Not the provider's message: it distinguishes "already registered"
        // from "weak password", and the first of those answers "does this
        // address have an account here?" for anyone who asks.
        setError("We could not create that account. Please try again.");
        trackForm("my_sign_in", "form_failed", {
          error_code: "SIGN_UP_FAILED",
        });
        return;
      }
      trackForm("my_sign_in", "form_completed", {});

      // No session back means confirmation is on and the link has been sent.
      // The same wording covers an address that already had an account, which
      // is what stops this being a way to enumerate them.
      if (!data.session) {
        setNotice(
          "Check your email for a link to finish setting up your account.",
        );
        return;
      }

      navigateAfterSessionChange(router, destination);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Those sign-in details could not be verified.");
      setIsSubmitting(false);
      trackForm("my_sign_in", "form_failed", { error_code: "SIGN_IN_FAILED" });
      return;
    }
    trackForm("my_sign_in", "form_completed", {});

    navigateAfterSessionChange(router, destination);
  }

  async function handleGoogle() {
    setError(null);
    setNotice(null);
    setIsGoogleSubmitting(true);
    // Completion happens at Google and the auth callback, out of sight of
    // this page, so this method's funnel ends at the submit.
    trackForm("my_sign_in", "form_submitted", { method: "google" });

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });

    if (signInError) {
      setError("Google sign-in is not available right now.");
      setIsGoogleSubmitting(false);
      trackForm("my_sign_in", "form_failed", { error_code: "GOOGLE_FAILED" });
    }
  }

  async function handleReset() {
    if (!email) {
      setError("Enter your email address first, then choose Forgot password.");
      return;
    }
    setError(null);
    setNotice(null);
    setIsResetting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        // Back to `/my` afterwards, not the portal dashboard: the shared
        // set-password page takes its destination as a parameter for exactly
        // this, since a constituent finishing at /portal/home would be bounced
        // to the no-access screen (#1161).
        redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/portal/set-password?next=/my")}`,
      },
    );
    setIsResetting(false);

    if (resetError) {
      setError("Could not send a reset link right now. Please try again.");
      return;
    }
    // Unconditional, like the portal's: confirming that an address is
    // registered would let anyone test a list of them.
    setNotice("If that address has an account, a reset link is on its way.");
  }

  const busy = isSubmitting || isGoogleSubmitting || isResetting;

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert className="mb-6">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogle}
        disabled={busy}
      >
        {isGoogleSubmitting ? <Spinner /> : null}
        Continue with Google
      </Button>

      <Separator className="my-6" />

      <form onSubmit={handleSubmit} noValidate {...startTracking}>
        <FieldGroup>
          <RequiredFieldsNote />
          <Field>
            <FieldLabel htmlFor="my-email" required>
              Email
            </FieldLabel>
            <Input
              id="my-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="my-password" required>
              Password
            </FieldLabel>
            <Input
              id="my-password"
              type="password"
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {isSubmitting ? <Spinner /> : null}
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        {mode === "sign-in" ? (
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={() => switchMode("sign-up")}
          >
            Create an account
          </button>
        ) : (
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={() => switchMode("sign-in")}
          >
            I already have an account
          </button>
        )}

        {mode === "sign-in" && (
          <button
            type="button"
            className="app-muted underline hover:text-foreground"
            onClick={handleReset}
            disabled={busy}
          >
            {isResetting ? "Sending..." : "Forgot password"}
          </button>
        )}
      </div>
    </>
  );
}
