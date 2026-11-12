"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import {
  LEXICON_TERMS,
  MAX_LEXICON_TERM_LENGTH,
  type Lexicon,
} from "@/lib/lexicon";
import { updateLexiconAction, type SettingActionResult } from "./actions";

/**
 * The words this organization uses for what it lends (#896).
 *
 * Every field is optional, and a blank one means the platform's own word --
 * the same contract the branding panel has, and the reason each input's
 * placeholder is the default rather than a piece of help text.
 *
 * `stored` rather than the resolved lexicon: a field has to show blank where
 * the tenant has set nothing, or every organization would arrive to find four
 * words apparently already chosen for it and no way to tell which it had
 * chosen itself.
 */
export function LexiconPanel({ stored }: { stored: Lexicon }) {
  const router = useRouter();
  const [terms, setTerms] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      LEXICON_TERMS.map((term) => [term.key, stored[term.key] ?? ""]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateLexiconAction(formData),
        {
          success: "Wording updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <form onSubmit={handleSubmit} className="h-full">
      <Card className="h-full">
        <CardHeader>
          <CardTitle>What you call what you lend</CardTitle>
          {/* Where these words appear is in the help sheet (#1482); each
              field says which of them it is. */}
          <CardDescription>
            Leave a field blank to keep the platform&rsquo;s word.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {LEXICON_TERMS.map((term) => (
              <Field key={term.key}>
                <FieldLabel htmlFor={`lexicon-${term.key}`}>
                  {term.label}
                </FieldLabel>
                <Input
                  id={`lexicon-${term.key}`}
                  name={term.key}
                  placeholder={term.default}
                  maxLength={MAX_LEXICON_TERM_LENGTH}
                  value={terms[term.key]}
                  onChange={(event) =>
                    setTerms({ ...terms, [term.key]: event.target.value })
                  }
                />
                <FieldDescription>{term.description}</FieldDescription>
              </Field>
            ))}
          </FieldGroup>
          {error && (
            <Alert variant="destructive" className="mt-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending} focusableWhenDisabled>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save wording"
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              focusableWhenDisabled
              onClick={() =>
                setTerms(
                  Object.fromEntries(LEXICON_TERMS.map((t) => [t.key, ""])),
                )
              }
            >
              Reset to defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
