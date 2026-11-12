"use client";

import { useState, useTransition } from "react";
import { setRegistrationContactAction } from "./registrants-actions";
import type { EventRegistrant } from "./registrants-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Spinner } from "@/components/ui/spinner";
import { InstagramOrContactFields } from "@/components/instagram-or-contact-fields";
import { instagramUrl } from "@/components/instagram-link";
import { runAction } from "@/components/portal/action-toast";
import {
  contactError,
  contactValuesFrom,
  formatRegistrationContact,
  REGISTRATION_CONTACT_HEADING,
  type ContactValues,
} from "@/lib/registration-contact";

/**
 * The registrant's Instagram handle, or the contact they gave in its place
 * (#1647), in the detail sheet -- and, for `events: manage`, the one place
 * staff change either. Never required here: an organizer records what they
 * know, the way they answer registration questions for a walk-in.
 */
export function RegistrantContact({
  registrant,
  canManage,
  onSaved,
}: {
  registrant: EventRegistrant;
  canManage: boolean;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<ContactValues>(() =>
    contactValuesFrom(registrant),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEditing() {
    setValues(contactValuesFrom(registrant));
    setError(null);
    setEditing(true);
  }

  function handleSave() {
    const problem = contactError(values, false);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(
        () => setRegistrationContactAction(registrant.id, values),
        { success: "Saved.", onError: setError },
      );
      if (outcome.ok) {
        setEditing(false);
        onSaved?.();
      }
    });
  }

  if (editing) {
    return (
      <FieldGroup>
        <InstagramOrContactFields
          idPrefix="registrant-contact"
          values={values}
          onChange={setValues}
          required={false}
          offerNoInstagram
          disabled={isPending}
          emailDescription="Blank means the email they registered with."
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            focusableWhenDisabled
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending}
            focusableWhenDisabled
            onClick={handleSave}
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
      </FieldGroup>
    );
  }

  const edit = canManage ? (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto p-0 align-baseline"
      onClick={startEditing}
    >
      Edit
    </Button>
  ) : null;

  if (registrant.has_no_instagram) {
    return (
      <ReadOnlyField
        label={REGISTRATION_CONTACT_HEADING}
        htmlFor="registrant-contact"
      >
        {formatRegistrationContact(registrant, {
          detail: canManage,
          ownEmail: "their registration email",
        })}{" "}
        <span className="app-muted text-xs">(no Instagram)</span> {edit}
      </ReadOnlyField>
    );
  }

  return (
    <ReadOnlyField label="Instagram" htmlFor="registrant-instagram">
      {registrant.instagram_handle ? (
        <a
          href={instagramUrl(registrant.instagram_handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          @{registrant.instagram_handle}
        </a>
      ) : (
        "—"
      )}{" "}
      {edit}
    </ReadOnlyField>
  );
}
