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
  MAX_PERSON_ROLE_LABEL_LENGTH,
  PERSON_ROLES,
  personRoleLabelField,
  type PersonRoleKey,
  type PersonRoleLabel,
} from "@/lib/person-roles";
import {
  updatePersonRoleLabelsAction,
  type SettingActionResult,
} from "./actions";

type StoredLabels = Partial<Record<PersonRoleKey, Partial<PersonRoleLabel>>>;

const FORMS = ["singular", "plural"] as const;

/**
 * What this organization calls the people in its directory (#911).
 *
 * Every field is optional and a blank one means the platform's own word, which
 * is why each placeholder is that word rather than a piece of help text -- the
 * same contract the branding and wording panels have. `stored` rather than the
 * resolved labels, so an organization can tell at a glance which of the twelve
 * are its own.
 *
 * Two fields per role because the plural is rarely the singular plus an "s"
 * once an organization picks it, and both are on screen at once: a "New
 * Donor" button above a page titled "Donors".
 */
export function PersonRolesPanel({ stored }: { stored: StoredLabels }) {
  const router = useRouter();
  const [labels, setLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      PERSON_ROLES.flatMap((role) =>
        FORMS.map((form) => [
          personRoleLabelField(role.key, form),
          stored[role.key]?.[form] ?? "",
        ]),
      ),
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
        () => updatePersonRoleLabelsAction(formData),
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
          <CardTitle>What you call the people you work with</CardTitle>
          {/* Where these words appear, and that only the words change, is in
              the help sheet (#1482). */}
          <CardDescription>
            Leave a field blank to keep the platform&rsquo;s word.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {PERSON_ROLES.map((role) => (
              <Field key={role.key}>
                <FieldLabel
                  htmlFor={personRoleLabelField(role.key, "singular")}
                >{`${role.default.singular} / ${role.default.plural}`}</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FORMS.map((form) => {
                    const name = personRoleLabelField(role.key, form);
                    return (
                      <Input
                        key={name}
                        id={name}
                        name={name}
                        aria-label={`${role.default.singular}, ${form}`}
                        placeholder={role.default[form]}
                        maxLength={MAX_PERSON_ROLE_LABEL_LENGTH}
                        value={labels[name]}
                        onChange={(event) =>
                          setLabels({ ...labels, [name]: event.target.value })
                        }
                      />
                    );
                  })}
                </div>
                <FieldDescription>{role.description}</FieldDescription>
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
                setLabels(
                  Object.fromEntries(
                    PERSON_ROLES.flatMap((role) =>
                      FORMS.map((form) => [
                        personRoleLabelField(role.key, form),
                        "",
                      ]),
                    ),
                  ),
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
