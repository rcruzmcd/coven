"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateGearRequestPassphraseAction,
  type GearRequestActionResult,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  MAX_PASSPHRASE_HELP_TEXT_LENGTH,
  MAX_PASSPHRASE_LENGTH,
  type GearRequestSettings,
} from "@/lib/gear-requests";

/**
 * Whether the public cart asks for a passphrase first (#1536), and what it is.
 *
 * Shown in plain text, not masked: it is a shared word staff give out over the
 * phone, not anybody's credential, and the point of storing it readable is
 * that the person answering can read it back.
 */
export function GearRequestPassphrasePanel({
  settings,
}: {
  settings: GearRequestSettings;
}) {
  const router = useRouter();
  const [required, setRequired] = useState(settings.passphraseRequired);
  const [passphrase, setPassphrase] = useState(settings.passphrase);
  const [helpText, setHelpText] = useState(settings.passphraseHelpText);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      await runAction<GearRequestActionResult>(
        () =>
          updateGearRequestPassphraseAction({
            passphraseRequired: required,
            passphrase,
            passphraseHelpText: helpText,
          }),
        {
          success: "Passphrase settings saved.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg font-semibold">Request passphrase</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <RequiredFieldsNote />
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p
                  id="passphrase-required-label"
                  className="text-sm font-medium"
                >
                  Require a passphrase
                </p>
                <p className="app-muted mt-1 text-sm leading-relaxed">
                  When this is on, anyone can still browse, but adding to the
                  cart asks for the passphrase first. Signed-in accounts are
                  asked too. Changing the passphrase means everyone has to enter
                  the new one.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <span className="app-muted w-8 text-right text-xs">
                  {required ? "On" : "Off"}
                </span>
                <Switch
                  checked={required}
                  onCheckedChange={setRequired}
                  disabled={isPending}
                  aria-labelledby="passphrase-required-label"
                />
              </div>
            </div>

            <Field>
              <FieldLabel htmlFor="gear-passphrase" required={required}>
                Passphrase
              </FieldLabel>
              <Input
                id="gear-passphrase"
                autoComplete="off"
                spellCheck={false}
                required={required}
                maxLength={MAX_PASSPHRASE_LENGTH}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              <FieldDescription>
                Share it with the people you serve. Capital letters and spaces
                at either end don&apos;t matter.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="gear-passphrase-help">
                How to get the passphrase
              </FieldLabel>
              <Textarea
                id="gear-passphrase-help"
                rows={2}
                maxLength={MAX_PASSPHRASE_HELP_TEXT_LENGTH}
                value={helpText}
                onChange={(event) => setHelpText(event.target.value)}
              />
              <FieldDescription>
                Optional. Shown when the site asks for the passphrase, below a
                line inviting people to contact you, e.g. &ldquo;Ask your
                caseworker.&rdquo;
              </FieldDescription>
            </Field>

            <div className="flex items-center justify-end gap-2">
              {isPending ? <Spinner className="size-4" /> : null}
              <Button type="submit" disabled={isPending} focusableWhenDisabled>
                Save passphrase
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
