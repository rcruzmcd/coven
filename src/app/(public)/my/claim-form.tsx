"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { trackForm, useFormStarted } from "@/lib/analytics/form-events";
import { submitClaimAction } from "./claim-actions";

/**
 * Both of the things this form can end in, said once and used twice (#1182).
 *
 * The form is a claim *and* an enrollment: `review_person_claim()` with no
 * candidate chosen inserts a `people` row from what was typed here. The staff
 * side has always said so out loud; the claimant side described only the
 * linking half, which left the other half a surprise.
 *
 * One exported constant because the intro and the confirmation have to keep
 * saying the same thing, and because the test pins the confirmation to it. A
 * later, well-meant edit that varied either by whether anything matched would
 * answer "is this person a donor here?" for anybody who cared to ask -- which
 * is the question this whole flow is built not to answer.
 */
export const CLAIM_OUTCOMES =
  "If we cannot find you, we will start a record from what you tell us here. Either way, a person checks this and you will hear back from us.";

const CLAIM_INTRO =
  "Tell us who you are and we will look for you in our records.";

const CLAIM_SUBMITTED_TITLE = "Thanks — we have your request";

/**
 * Ask to be linked to an existing record (#1162).
 *
 * The two fieldsets are the honest version of what the matcher does.
 * `person_claim_candidates()` proposes people on three things: the address
 * GoTrue has verified for this account, the normalized Instagram handle, and
 * trigram similarity on the name. Only two of those are typed here, so only
 * two fields belong under "What we match on". The phone, the note and any
 * second email are evidence for whoever reviews it and nothing else -- the
 * query never reads them.
 *
 * The verified address is a read-only line rather than a prefilled input for
 * the same reason. Prefilling it implied that typing an address is what finds
 * you, when changing it changes nothing about who gets proposed.
 *
 * The legends say which fields do the matching without saying whether anything
 * matched, which is the line this screen has to hold: describing the mechanism
 * is safe, describing an outcome is not. Every string below is a constant or a
 * static literal, and the only thing that varies is whether the request is in
 * flight.
 */
export function ClaimForm({ defaultEmail }: { defaultEmail: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTracking = useFormStarted("my_claim", {});

  useEffect(() => {
    trackForm("my_claim", "form_viewed", {});
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    trackForm("my_claim", "form_submitted", {});

    const result = await submitClaimAction(new FormData(event.currentTarget));
    setIsSubmitting(false);

    if ("error" in result) {
      setError(result.error);
      trackForm("my_claim", "form_failed", {
        error_code: result.code ?? "INVALID_FORM",
      });
      return;
    }
    trackForm("my_claim", "form_completed", {});
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Alert>
        <div className="rainbow-accent mb-2 w-10" />
        <AlertTitle>{CLAIM_SUBMITTED_TITLE}</AlertTitle>
        <AlertDescription>{CLAIM_OUTCOMES}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate {...startTracking}>
      <div className="mb-5 space-y-2">
        <p className="app-muted text-sm leading-relaxed">{CLAIM_INTRO}</p>
        <p className="app-muted text-sm leading-relaxed">{CLAIM_OUTCOMES}</p>
        {/* Not an input. This is whatever GoTrue confirmed for the session,
            and it is the one identifier on this screen that the claimant
            cannot change by typing. */}
        {defaultEmail && (
          <p className="app-muted text-sm leading-relaxed break-words">
            Signed in as {defaultEmail}
          </p>
        )}
      </div>

      <FieldGroup>
        <RequiredFieldsNote />

        <FieldSet>
          <FieldLegend>What we match on</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="claim-name" required>
                Your name
              </FieldLabel>
              <Input
                id="claim-name"
                name="name"
                required
                autoComplete="name"
                // The name we would have them under, which is not always the
                // name they go by now.
                placeholder="The name we would have you under"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="claim-instagram">Instagram</FieldLabel>
              <Input
                id="claim-instagram"
                name="instagram"
                autoComplete="off"
                placeholder="handle, with or without the @"
              />
              <FieldDescription>
                Often the only thing on a record we made from an event
                registration, so it is worth filling in.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSeparator />

        <FieldSet>
          <FieldLegend>For the person reviewing</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="claim-email">
                Another email you may have used
              </FieldLabel>
              <Input
                id="claim-email"
                name="email"
                type="email"
                autoComplete="email"
              />
              <FieldDescription>
                If you have given us a different address in the past, it helps
                whoever reads this.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="claim-phone">Phone</FieldLabel>
              <Input
                id="claim-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="claim-note">
                Anything that would help us find you
              </FieldLabel>
              <Textarea
                id="claim-note"
                name="note"
                rows={3}
                placeholder="An event you came to, something you donated, who you know."
              />
            </Field>
          </FieldGroup>
        </FieldSet>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner /> Sending...
            </>
          ) : (
            "Send request"
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
