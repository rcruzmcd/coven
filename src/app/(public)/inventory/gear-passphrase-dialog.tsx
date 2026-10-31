"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { checkGearPassphraseAction } from "./gear-cart-request-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { trackGear } from "@/lib/analytics/form-events";
import { Spinner } from "@/components/ui/spinner";
import {
  GEAR_PASSPHRASE_TITLE,
  gearPassphraseIntro,
} from "@/lib/gear-passphrase";
import type { Lexicon } from "@/lib/lexicon";

/**
 * Where the dialog sends somebody without the passphrase: the contact page
 * where the tenant serves one, otherwise its public email, otherwise nowhere
 * -- the sentence still stands without a link.
 */
export type GearPassphraseContact =
  { kind: "page"; href: string } | { kind: "email"; address: string } | null;

/**
 * Asks for the tenant's passphrase before the first Add to cart (#1536).
 *
 * Only the UX: the word is checked here so a visitor finds out at once, and
 * checked again by the database on every submit, which is what actually
 * refuses a request without it.
 */
export function GearPassphraseDialog({
  open,
  onOpenChange,
  onUnlocked,
  organizationName,
  lexicon,
  helpText,
  contact,
  notice = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked: () => void;
  organizationName: string | null;
  lexicon: Lexicon;
  /** The tenant's own words on how to get the passphrase, if any. */
  helpText: string;
  contact: GearPassphraseContact;
  /** Why it is asking again, when a submit was refused. */
  notice?: string | null;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPassphrase("");
      setError(null);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const entered = passphrase;
    startTransition(async () => {
      const result = await checkGearPassphraseAction(entered);
      if ("error" in result) {
        setError(result.error);
        if (result.wrong) trackGear("gear_passphrase_rejected");
        return;
      }
      setPassphrase("");
      onUnlocked();
    });
  }

  const contactLink =
    contact?.kind === "page" ? (
      <Link href={contact.href} className="font-medium underline">
        Contact us
      </Link>
    ) : contact?.kind === "email" ? (
      <a href={`mailto:${contact.address}`} className="font-medium underline">
        Contact us
      </a>
    ) : (
      "Contact us"
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{GEAR_PASSPHRASE_TITLE}</DialogTitle>
            <DialogDescription>
              {gearPassphraseIntro(organizationName, lexicon)}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="mt-4">
            {notice ? (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            ) : null}
            <RequiredFieldsNote />
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="gear-passphrase-entry" required>
                Passphrase
              </FieldLabel>
              <Input
                id="gear-passphrase-entry"
                autoComplete="off"
                spellCheck={false}
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "gear-passphrase-error" : undefined}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              {error ? (
                <FieldError id="gear-passphrase-error">{error}</FieldError>
              ) : null}
            </Field>
            <p className="app-muted text-sm leading-relaxed">
              Don&apos;t have it? {contactLink} for the passphrase or for more
              details.
            </p>
            {helpText ? (
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {helpText}
              </p>
            ) : null}
          </FieldGroup>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !passphrase.trim()}>
              {isPending ? <Spinner className="size-4" /> : null}
              Continue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
