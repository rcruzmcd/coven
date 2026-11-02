"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArtworkUploadField,
  type ArtworkItem,
} from "@/components/public/artwork-upload-field";
import { PrivacyNotice } from "@/components/privacy-notice";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { trackForm, useFormStarted } from "@/lib/analytics/form-events";
import { submitArtworkAction } from "./artwork-actions";

const STATEMENT_MAX = 2000;

export function ArtworkSubmissionForm({
  code,
  maxImages,
  rightsNote,
}: {
  code: string;
  maxImages: number;
  /** The call's stated terms (#876), when it has any. The consent box points
   * at them rather than restating them, so what an artist agrees to is the
   * text the organization actually published above. */
  rightsNote: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creditName, setCreditName] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("");
  const [statement, setStatement] = useState("");
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [items, setItems] = useState<ArtworkItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  // No call code on any event (#1713): the code in this page's address is
  // what lets somebody submit at all.
  const startTracking = useFormStarted("artwork_submission", {});

  useEffect(() => {
    trackForm("artwork_submission", "form_viewed", {});
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError("Add at least one image of your work.");
      return;
    }
    trackForm("artwork_submission", "form_submitted", {});

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", email);
    formData.set("creditName", creditName);
    formData.set("portfolio", portfolio);
    formData.set("title", title);
    formData.set("medium", medium);
    formData.set("statement", statement);
    // The FormData is built by hand rather than from the form element, so the
    // checkbox's own name never reaches it -- this line is what the parser
    // reads.
    formData.set("consent", consent ? "on" : "");
    formData.set("company", company);
    // Paths and tokens only: the files themselves went straight to Storage, so
    // nothing here is anywhere near a Server Action's body limit.
    formData.set("images", JSON.stringify(items.map((item) => item.image)));

    startTransition(async () => {
      const result = await submitArtworkAction(code, formData);
      if ("error" in result) {
        setError(result.error);
        trackForm("artwork_submission", "form_failed", {
          error_code: result.code ?? "INVALID_FORM",
        });
        return;
      }
      if (!company) trackForm("artwork_submission", "form_completed", {});
      setSuccess(true);
    });
  }

  if (success) {
    return (
      <Alert>
        <div className="rainbow-accent mb-2 w-10" />
        <AlertDescription>
          Thank you — we have your work. The team reviews every submission, and
          you&apos;ll hear from us at {email} about what makes the zine.
        </AlertDescription>
      </Alert>
    );
  }

  const creditedAs = creditName.trim() || name.trim();

  return (
    <form onSubmit={handleSubmit} {...startTracking}>
      <FieldGroup>
        <RequiredFieldsNote />
        <ArtworkUploadField
          code={code}
          items={items}
          onChange={setItems}
          maxImages={maxImages}
          disabled={isPending}
        />

        <Field>
          <FieldLabel htmlFor="artwork-name" required>
            Your name
          </FieldLabel>
          <Input
            id="artwork-name"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldDescription>
            How we address you in email. It is not what gets printed unless you
            leave the next field empty.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="artwork-email" required>
            Email
          </FieldLabel>
          <Input
            id="artwork-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        {/*
          Separate from the contact name on purpose. Artists routinely want the
          two to differ -- a legal name for correspondence, a chosen name or a
          handle in print -- and one field cannot be both. Getting that wrong
          means printing someone's legal name in a queer community zine, which
          is not a mistake worth risking to save a form field.
        */}
        <Field>
          <FieldLabel htmlFor="artwork-credit">Name to credit</FieldLabel>
          <Input
            id="artwork-credit"
            value={creditName}
            onChange={(event) => setCreditName(event.target.value)}
            aria-describedby="artwork-credit-help"
          />
          <FieldDescription id="artwork-credit-help">
            {creditedAs
              ? `This is the name we print. Right now that would be "${creditedAs}".`
              : "This is the name we print. Leave it empty to be credited by the name above."}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="artwork-portfolio">
            Portfolio or Instagram
          </FieldLabel>
          <Input
            id="artwork-portfolio"
            inputMode="url"
            placeholder="@yourhandle, or a link to your work"
            value={portfolio}
            onChange={(event) => setPortfolio(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="artwork-title">Title of the piece</FieldLabel>
          <Input
            id="artwork-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="artwork-medium">Medium</FieldLabel>
          <Input
            id="artwork-medium"
            placeholder="Ink on paper, digital, photography…"
            value={medium}
            onChange={(event) => setMedium(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="artwork-statement">
            Tell us about your work
          </FieldLabel>
          <Textarea
            id="artwork-statement"
            rows={5}
            maxLength={STATEMENT_MAX}
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            aria-describedby="artwork-statement-count"
          />
          {/*
            Described-by rather than a live region: the count changes on every
            keystroke, and announcing it each time would make the field
            unusable with a screen reader. It is read when the field is
            entered, and the number is there for anyone watching the box fill
            up -- which is the actual problem, since maxLength stops accepting
            keystrokes silently.
          */}
          <FieldDescription id="artwork-statement-count">
            {statement.length} of {STATEMENT_MAX} characters.
          </FieldDescription>
        </Field>

        {/* Above the box rather than below it (#684's order of accumulation):
            the notice is the thing to read first, and the box that carries a
            real choice stays next to the button that acts on it. */}
        <PrivacyNotice surface="artworkSubmission" />

        <Field orientation="horizontal">
          <Checkbox
            id="artwork-consent"
            required
            checked={consent}
            onCheckedChange={(checked) => setConsent(checked === true)}
            disabled={isPending}
          />
          <FieldLabel htmlFor="artwork-consent" required>
            This is my own work and I have the right to submit it
            {rightsNote
              ? ", and I agree to the rights and credit terms above."
              : "."}
          </FieldLabel>
        </Field>

        {/* Honeypot: hidden from sighted/keyboard users, but bots that
            autofill every field will fill this and get silently rejected
            server-side. Not type="hidden" -- bots skip those. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="artwork-company">Company</label>
          <input
            id="artwork-company"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isPending} className="w-full sm:w-fit">
          {isPending ? "Sending..." : "Submit my artwork"}
        </Button>
      </FieldGroup>
    </form>
  );
}
