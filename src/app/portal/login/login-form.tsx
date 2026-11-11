"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safePortalDestination } from "@/lib/auth/next-destination";
import { platformGoogleStartPath } from "@/lib/auth/platform-google";
import { IDLE_SIGNOUT_REASON } from "@/lib/auth/idle-timeout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

function urlErrorMessage(reason: string | null) {
  if (reason === "oauth_failed")
    return "Google sign-in failed. Please try again.";
  if (reason === "invite_failed")
    return "This invite link is invalid or has expired. Ask an administrator for a new one.";
  return null;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A signed-in account with no roles is bounced here. Without a way out,
  // "Continue with Google" reuses the cached session and lands straight back
  // -- and the likeliest cause is being signed into a personal Google account
  // rather than an org one, which is exactly the case that needs to switch.
  const isNoAccess = searchParams.get("error") === "no_access";
  // Separate from `error`: being signed out for inactivity is the portal
  // working as intended, not something that went wrong, so it gets a neutral
  // notice rather than the destructive one.
  const wasIdle = searchParams.get("reason") === IDLE_SIGNOUT_REASON;
  // Where the portal layout wanted this person to be before it bounced them
  // here. Sanitized, since it decides a redirect target.
  const destination = safePortalDestination(searchParams.get("next"));
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() =>
    urlErrorMessage(searchParams.get("error")),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!isNoAccess) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setSignedInEmail(data.user?.email ?? null));
  }, [isNoAccess]);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    // Local scope for the same reason as signOutAndRedirect: clearing the
    // no-access banner here must not revoke the account's sessions elsewhere.
    await supabase.auth.signOut({ scope: "local" });
    // Back to a clean login with the banner cleared, so the page stops
    // describing a session that has just ended.
    router.replace("/portal/login");
    router.refresh();
  }

  async function handleReset() {
    if (!email) {
      setError("Enter your email address first, then choose Forgot password.");
      return;
    }
    setError(null);
    setIsResetting(true);
    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/confirm?next=/portal/set-password`,
      },
    );
    setIsResetting(false);
    if (resetError) {
      setError("Could not send a reset link right now. Please try again.");
      return;
    }
    // Deliberately not conditioned on whether the address has an account:
    // saying so would let anyone test which emails are registered.
    setResetSent(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Those login details could not be verified.");
      setIsSubmitting(false);
      return;
    }

    router.replace(destination);
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleSubmitting(true);

    // Through the platform host when configured, so Google names Coven
    // rather than the Supabase project (#1249).
    const platformPath = platformGoogleStartPath(destination, isNoAccess);
    if (platformPath) {
      window.location.assign(platformPath);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
        // Force the account chooser when the current session is the problem:
        // Google would otherwise silently re-authorise the same account and
        // return the user to this screen.
        ...(isNoAccess ? { queryParams: { prompt: "select_account" } } : {}),
      },
    });

    if (signInError) {
      setError("Google sign-in is not available right now.");
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <>
      {wasIdle && (
        <Alert>
          <AlertTitle>Signed out for inactivity</AlertTitle>
          <AlertDescription>
            You were signed out after a period of inactivity. Sign in again to
            pick up where you left off.
          </AlertDescription>
        </Alert>
      )}

      {isNoAccess && (
        <Alert variant="destructive">
          <AlertTitle>Portal access not granted yet</AlertTitle>
          <AlertDescription>
            <p>
              {signedInEmail
                ? `You're signed in as ${signedInEmail}, but that account hasn't been granted portal access.`
                : "You're signed in, but this account hasn't been granted portal access."}{" "}
              Ask an administrator to grant it, or sign out and use a different
              account.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-full"
            >
              {isSigningOut ? (
                <>
                  <Spinner /> Signing out...
                </>
              ) : (
                "Sign out"
              )}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="secondary"
        onClick={handleGoogleSignIn}
        disabled={isGoogleSubmitting || isSubmitting}
        className="w-full"
      >
        <span className="text-base font-bold" aria-hidden="true">
          G
        </span>
        {isGoogleSubmitting ? (
          <>
            <Spinner /> Connecting to Google...
          </>
        ) : (
          "Continue with Google"
        )}
      </Button>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="app-muted text-xs font-semibold uppercase tracking-[0.16em]">
          or
        </span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <RequiredFieldsNote />
          <Field>
            <FieldLabel htmlFor="email" required>
              Email
            </FieldLabel>
            <Input
              id="email"
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field>
            <div className="flex items-baseline justify-between gap-3">
              <FieldLabel htmlFor="password" required>
                Password
              </FieldLabel>
              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting || isSubmitting || isGoogleSubmitting}
                className="text-sm text-[var(--purple)] underline underline-offset-3 disabled:opacity-50"
              >
                {isResetting ? "Sending..." : "Forgot password?"}
              </button>
            </div>
            <Input
              id="password"
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {resetSent && (
            <Alert>
              <AlertDescription>
                If that address has an account, a reset link is on its way.
                Check your inbox.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={isSubmitting || isGoogleSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Spinner /> Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </FieldGroup>
      </form>
    </>
  );
}
