"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrgTimeZoneAction, type SettingActionResult } from "./actions";
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
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { TIMEZONE_OPTIONS } from "@/lib/time";

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function TimeZonePanel({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  const [zone, setZone] = useState(timeZone);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateOrgTimeZoneAction(formData),
        {
          success: "Time zone updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time zone</CardTitle>
        {/* The evening-sale example and what the zone drives are in the help
            sheet (#1482). */}
        <CardDescription>
          Where a reporting day begins and ends. Every change is recorded in the
          audit log.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="org-time-zone">
                This organization is in
              </FieldLabel>
              <select
                id="org-time-zone"
                name="timeZone"
                className={selectClassName}
                value={zone}
                onChange={(event) => setZone(event.target.value)}
                disabled={isPending}
              >
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldDescription>
                It does <strong>not</strong> change how times are shown:
                everyone sees their own browser&apos;s zone.
              </FieldDescription>
            </Field>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={isPending} focusableWhenDisabled>
                {isPending ? <Spinner className="size-4" /> : null}
                Save time zone
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
