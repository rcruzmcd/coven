"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  claimFromGearRequestAction,
  claimFromRegistrationAction,
} from "@/app/(public)/my/claim-actions";
import type { AccountOffer } from "@/lib/constituent/account-offer";
import {
  myGearRequestSignInPath,
  myRegistrationSignInPath,
} from "@/lib/constituent/paths";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";

export type { AccountOffer };

/**
 * A public write somebody can ask to keep (#1258, #1359).
 *
 * Two so far, and the list is closed on purpose: each one needs an RPC that
 * mints a claim from that row and a `/my` route that survives a sign-up, so a
 * third is a decision rather than a string.
 */
export type ClaimableRecord = {
  kind: "registration" | "gear-request";
  id: string;
};

/** What each record is called in the one sentence that names it. */
const RECORD_NOUN: Record<ClaimableRecord["kind"], string> = {
  registration: "registration",
  "gear-request": "request",
};

const SIGN_IN_PATH: Record<ClaimableRecord["kind"], (id: string) => string> = {
  registration: myRegistrationSignInPath,
  "gear-request": myGearRequestSignInPath,
};

const CLAIM_ACTION: Record<
  ClaimableRecord["kind"],
  (id: string) => Promise<{ error: string } | { submitted: true }>
> = {
  registration: claimFromRegistrationAction,
  "gear-request": claimFromGearRequestAction,
};

/**
 * The one sentence this is allowed to promise, in either state.
 *
 * It does not promise history, and it never says "we found you": the offer
 * reads identically whether the record matched a directory row, matched
 * nobody, or the account already had a claim open, because anything that
 * varied would answer "do you have a record of this person?" for anybody who
 * can make an account (§5.23).
 */
const PROMISE =
  "You'll be able to see this on your account once we've confirmed who you are.";

/** The same confirmation for every outcome, for the same reason. */
const SENT = "Thanks — someone will check this. Nothing else for you to do.";

/**
 * Keeping what you just told us: the offer in the post-write slot (#1258).
 *
 * It is never a gate. The registration or request was saved before this
 * rendered, the confirmation email is already on its way, and skipping is one
 * click that changes nothing -- which is also why the failure messages below
 * are quiet: there is nothing here for a reader to fix.
 *
 * Two states, decided on the server, because only the server can see the
 * module and the session:
 *
 *   * `sign-up` -- signed out. A link to `/my/sign-in` carrying this record,
 *     so that whatever the account costs (a password, a Google round trip, an
 *     email confirmation opened tomorrow) the claim is still waiting on the
 *     other side.
 *   * `claim` -- signed in with no record linked yet. One button, nothing to
 *     retype: the row already holds what they told us.
 *
 * A reader whose account is already linked is offered nothing at all, and does
 * not reach this component -- it is already on their record.
 *
 * One component for both records rather than one per surface, so that the two
 * promises cannot drift: `PROMISE` and `SENT` are the copy §5.23 constrains,
 * and only the noun changes.
 */
export function RecordAccountOffer({
  offer,
  record,
  /** Where "No thanks" goes. Absent, it simply dismisses the offer. */
  skipHref,
  /**
   * The level its heading takes, so it does not skip one. It sits under the
   * event sheet's `h2`, inside the gear cart, and under a `/my` page's `h1`,
   * and a fixed `h3` is wrong in one of those places whichever one it is
   * fixed at.
   */
  headingLevel = "h3",
}: {
  offer: AccountOffer;
  record: ClaimableRecord;
  skipHref?: string;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const [sent, setSent] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClaim() {
    setError(null);
    startTransition(async () => {
      const result = await CLAIM_ACTION[record.kind](record.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  if (skipped) return null;

  if (sent) {
    return (
      <Alert>
        <AlertDescription>{SENT}</AlertDescription>
      </Alert>
    );
  }

  const noun = RECORD_NOUN[record.kind];

  // No outer margin: this renders inside a confirmation panel on the event,
  // inside the gear cart's receipt, and inside a card on the `/my` hand-off
  // pages, and only the caller knows what it is sitting next to.
  return (
    <div className="space-y-3">
      <div>
        <Heading className="font-heading text-lg">Keep this</Heading>
        <p className="app-muted text-sm leading-relaxed">
          {offer === "sign-up"
            ? `Make an account and we'll add this ${noun} to it. ${PROMISE}`
            : `Add this ${noun} to your account. ${PROMISE}`}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {offer === "sign-up" ? (
          // A link wearing the button's clothes, rather than a `Button` with a
          // link inside it: this navigates, so it keeps link semantics -- open
          // in a new tab, copy the address, and the role a screen reader
          // announces. `buttonVariants` is the same appearance either way.
          <Link
            href={SIGN_IN_PATH[record.kind](record.id)}
            className={buttonVariants({ variant: "rainbow" })}
          >
            Make an account
          </Link>
        ) : (
          <Button
            variant="rainbow"
            onClick={handleClaim}
            disabled={isPending}
            focusableWhenDisabled
          >
            {isPending ? "Sending..." : "Add to my account"}
          </Button>
        )}

        {skipHref ? (
          <Link
            href={skipHref}
            className={buttonVariants({ variant: "ghost" })}
          >
            No thanks
          </Link>
        ) : (
          <Button variant="ghost" onClick={() => setSkipped(true)}>
            No thanks
          </Button>
        )}
      </div>
    </div>
  );
}
