"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { InstagramOrContactFields } from "@/components/instagram-or-contact-fields";
import {
  contactError,
  contactValuesFrom,
  formatRegistrationContact,
  REGISTRATION_CONTACT_HEADING,
  type RegistrationContact,
} from "@/lib/registration-contact";
import {
  setMyRegistrationContactAction,
  submitRegistrationContactByLinkAction,
} from "./registration-contact-actions";

/**
 * "How we reach you" (#1647): the registrant's own Instagram handle, or the
 * contact they gave in its place, and the way to change it. Renders only where
 * the organization requires one.
 *
 * Two homes, one card. On `/my/registration/[id]` the reader is signed in and
 * the registration is theirs, so everything is prefilled. On the answers link
 * nobody is signed in and the link may have been forwarded, so the handle --
 * a public handle -- is prefilled but a phone number or address never is:
 * the card says which method is on file and asks for the detail again to
 * change it, which keeps #1502's rule that the page shows no contact details.
 */
export function RegistrationContactCard({
  target,
  contact,
  editable = true,
}: {
  target:
    { kind: "my"; registrationId: string } | { kind: "link"; token: string };
  /** On the link, `preferred_contact_detail` is never sent and is null. */
  contact: RegistrationContact;
  editable?: boolean;
}) {
  const [values, setValues] = useState(() => contactValuesFrom(contact));
  const [onFile, setOnFile] = useState(contact);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The link never knows the detail, so what is on file is the method alone.
  const onFileLabel = formatRegistrationContact(onFile, {
    detail: target.kind === "my",
  });

  function handleSave() {
    setError(null);
    setMessage(null);
    const problem = contactError(values, true);
    if (problem) {
      setError(problem);
      return;
    }
    startTransition(async () => {
      const result =
        target.kind === "my"
          ? await setMyRegistrationContactAction(target.registrationId, values)
          : await submitRegistrationContactByLinkAction(target.token, values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOnFile({
        instagram_handle: values.hasNoInstagram
          ? null
          : values.instagramHandle.trim().replace(/^@/, "").toLowerCase(),
        has_no_instagram: values.hasNoInstagram,
        preferred_contact_method: values.hasNoInstagram ? values.method : null,
        preferred_contact_detail:
          values.hasNoInstagram && target.kind === "my"
            ? values.detail.trim() || null
            : null,
      });
      // On the link the detail goes back to blank: it is not this page's to
      // show, even straight after typing it.
      if (target.kind === "link")
        setValues((prev) => ({ ...prev, detail: "" }));
      setMessage("Saved.");
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="text-base font-medium">
          {REGISTRATION_CONTACT_HEADING}
        </h2>
        {onFileLabel && (
          <p className="app-muted text-sm">
            {onFile.has_no_instagram ? "Contact on file" : "Instagram on file"}:{" "}
            {onFileLabel}
          </p>
        )}
        {editable ? (
          <>
            {target.kind === "link" && onFile.has_no_instagram && (
              <p className="app-muted text-sm">
                To change it, choose how to reach you and enter the number or
                address again.
              </p>
            )}
            <FieldGroup>
              <InstagramOrContactFields
                idPrefix={`${target.kind}-registration-contact`}
                values={values}
                onChange={(next) => {
                  setMessage(null);
                  setValues(next);
                }}
                required
                disabled={isPending}
              />
            </FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                focusableWhenDisabled
              >
                {isPending ? "Saving…" : "Save"}
              </Button>
              {message && (
                <p className="app-muted text-sm" role="status">
                  {message}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="app-muted text-sm">
            This event has ended, so this can&apos;t be changed any more.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
