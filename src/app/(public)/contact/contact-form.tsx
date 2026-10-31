"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { submitContactMessageAction } from "./contact-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PrivacyNotice } from "@/components/privacy-notice";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { trackForm, useFormStarted } from "@/lib/analytics/form-events";
import { contactTopics } from "@/lib/contact-topics";
import { DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";

export function ContactForm({
  lexicon = DEFAULT_LEXICON,
}: {
  /**
   * This organization's words (#896). The topics used to be a second
   * hardcoded list here; they are the registry in `@/lib/contact-topics`
   * now, because one of the labels is the organization's own word and the
   * portal has to file the message under the same one.
   */
  lexicon?: Lexicon;
}) {
  const CONTACT_TOPICS = contactTopics(lexicon);
  const searchParams = useSearchParams();
  const requestedTopic = searchParams.get("topic");
  const initialTopic = CONTACT_TOPICS.some(
    (option) => option.value === requestedTopic,
  )
    ? (requestedTopic as string)
    : CONTACT_TOPICS[0].value;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(initialTopic);
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const startTracking = useFormStarted("contact", {});

  // The contact funnel (#1712): one step, so viewed -> started -> submitted
  // -> completed or failed.
  useEffect(() => {
    trackForm("contact", "form_viewed", {});
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    trackForm("contact", "form_submitted", {});

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", email);
    formData.set("topic", topic);
    formData.set("message", message);
    formData.set("company", company);

    startTransition(async () => {
      const result = await submitContactMessageAction(formData);
      if ("error" in result) {
        setError(result.error);
        trackForm("contact", "form_failed", {
          error_code: result.code ?? "INVALID_FORM",
        });
        return;
      }
      // A filled honeypot "succeeds" with nothing saved, so a bot is not
      // counted as a message.
      if (!company) trackForm("contact", "form_completed", {});
      setSuccess(true);
    });
  }

  if (success) {
    return (
      <Alert>
        <div className="rainbow-accent mb-2 w-10" />
        <AlertDescription>
          Thanks for reaching out! We&apos;ll get back to you soon.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} {...startTracking}>
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="contact-name" required>
            Name
          </FieldLabel>
          <Input
            id="contact-name"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="contact-email" required>
            Email
          </FieldLabel>
          <Input
            id="contact-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="contact-topic">Topic</FieldLabel>
          <Select
            value={topic}
            onValueChange={(value) =>
              setTopic(value ?? CONTACT_TOPICS[0].value)
            }
          >
            <SelectTrigger id="contact-topic">
              <SelectValue placeholder="Topic" />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_TOPICS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="contact-message" required>
            Message
          </FieldLabel>
          <Textarea
            id="contact-message"
            required
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>

        {/* Honeypot: hidden from sighted/keyboard users, but bots that
            autofill every field will fill this and get silently rejected
            server-side. Not type="hidden" -- bots skip those. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="contact-company">Company</label>
          <input
            id="contact-company"
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

        <PrivacyNotice surface="contact" />

        <Button type="submit" disabled={isPending} className="w-full sm:w-fit">
          {isPending ? "Sending..." : "Send message"}
        </Button>
      </FieldGroup>
    </form>
  );
}
