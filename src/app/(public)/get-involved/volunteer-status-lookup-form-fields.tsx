"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { lookupVolunteerApplicationStatusAction } from "./volunteer-status-lookup-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { trackForm, useFormStarted } from "@/lib/analytics/form-events";

export function VolunteerStatusLookupForm() {
  const [email, setEmail] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const startTracking = useFormStarted("volunteer_status_lookup", {});

  useEffect(() => {
    trackForm("volunteer_status_lookup", "form_viewed", {});
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatusLabel(null);
    trackForm("volunteer_status_lookup", "form_submitted", {});

    const formData = new FormData();
    formData.set("email", email);
    formData.set("referenceCode", referenceCode);

    startTransition(async () => {
      const result = await lookupVolunteerApplicationStatusAction(formData);
      if ("error" in result) {
        setError(result.error);
        trackForm("volunteer_status_lookup", "form_failed", {
          error_code: result.code ?? "INVALID_FORM",
        });
        return;
      }
      trackForm("volunteer_status_lookup", "form_completed", {});
      setStatusLabel(result.statusLabel);
    });
  }

  return (
    <form onSubmit={handleSubmit} {...startTracking}>
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="volunteer-status-email" required>
            Email
          </FieldLabel>
          <Input
            id="volunteer-status-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="volunteer-status-reference-code" required>
            Reference code
          </FieldLabel>
          <Input
            id="volunteer-status-reference-code"
            required
            autoComplete="off"
            value={referenceCode}
            onChange={(event) => setReferenceCode(event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {statusLabel && (
          <Alert>
            <AlertDescription>Status: {statusLabel}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isPending} className="w-full sm:w-fit">
          {isPending ? "Checking..." : "Check status"}
        </Button>
      </FieldGroup>
    </form>
  );
}
