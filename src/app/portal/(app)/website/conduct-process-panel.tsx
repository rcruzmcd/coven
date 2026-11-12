"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { CONDUCT_PROCESS_SETTINGS } from "@/lib/conduct";
import { updateConductProcessAction } from "./settings-actions";

/**
 * What this organization's code of conduct promises about handling a report,
 * as numbers the portal can measure a case against (#687).
 *
 * Here rather than in the Conduct section because what these restate is the
 * document above them. The platform has no defaults to fall back on and writes
 * none: blank is a complete answer, and the panel says so, because a deadline
 * nobody agreed to would be a commitment made on an organization's behalf.
 */
export function ConductProcessPanel({
  values,
}: {
  values: Record<string, number | boolean | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CONDUCT_PROCESS_SETTINGS.filter(
        (setting) => setting.kind === "number",
      ).map((setting) => [
        setting.key,
        values[setting.key] === null || values[setting.key] === undefined
          ? ""
          : String(values[setting.key]),
      ]),
    ),
  );
  const [isPending, startTransition] = useTransition();

  function save(key: string, value: number | boolean | null) {
    setError(null);
    startTransition(async () => {
      const result = await updateConductProcessAction(key, value);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Saved.");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="space-y-2">
          <h2 className="font-semibold">Handling a report</h2>
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            If your code of conduct commits you to a timescale, a number of
            reviewers or an appeal window, record it here and{" "}
            <Link
              href="/portal/conduct"
              className="underline underline-offset-4"
            >
              Conduct
            </Link>{" "}
            measures every case against it. Leaving one blank is a complete
            answer: no deadline is shown, and none is invented. These numbers do
            not publish anything &mdash; they follow what your document already
            says, so change the text first and then match it here.
          </p>
        </div>

        {CONDUCT_PROCESS_SETTINGS.map((setting) =>
          setting.kind === "boolean" ? (
            <Field key={setting.key} orientation="horizontal">
              <Checkbox
                id={`conduct-${setting.key}`}
                checked={values[setting.key] === true}
                disabled={isPending}
                onCheckedChange={(checked) =>
                  save(setting.key, checked === true)
                }
              />
              <div>
                <FieldLabel htmlFor={`conduct-${setting.key}`}>
                  {setting.label}
                </FieldLabel>
                <p className="app-muted text-xs">{setting.help}</p>
              </div>
            </Field>
          ) : (
            <Field key={setting.key}>
              <FieldLabel htmlFor={`conduct-${setting.key}`}>
                {setting.label}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={`conduct-${setting.key}`}
                  type="number"
                  min={1}
                  step={1}
                  className="w-28"
                  placeholder="None"
                  value={drafts[setting.key] ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [setting.key]: event.target.value,
                    }))
                  }
                />
                {setting.unit && (
                  <span className="app-muted text-sm">{setting.unit}</span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  focusableWhenDisabled
                  onClick={() => {
                    const raw = (drafts[setting.key] ?? "").trim();
                    save(setting.key, raw === "" ? null : Number(raw));
                  }}
                >
                  Save
                </Button>
              </div>
              <p className="app-muted text-xs">{setting.help}</p>
            </Field>
          ),
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
