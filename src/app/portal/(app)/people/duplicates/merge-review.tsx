"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { personDisplayName } from "@/lib/format";
import { mergePeopleAction } from "./actions";
import {
  MERGEABLE_FIELDS,
  type DuplicatePerson,
  type MergeableField,
  type MergeBlocker,
  type MergePreviewRow,
} from "./merge-shared";

const FIELD_LABELS: Record<MergeableField, string> = {
  name: "Name",
  preferred_name: "Preferred name",
  email: "Email",
  phone: "Phone",
  pronouns: "Pronouns",
  instagram_handle: "Instagram",
  notes: "Notes",
  logo_url: "Logo URL",
  website: "Website",
  person_type: "Type",
  source_type: "Source",
  address_line1: "Address line 1",
  address_line2: "Address line 2",
  address_city: "City",
  address_region: "State or region",
  address_postal_code: "Postal code",
  address_country: "Country",
};

type Side = "survivor" | "duplicate";

/**
 * Blockers and the record preview are resolved on the server and handed in,
 * rather than fetched from an effect here: they depend only on the two ids in
 * the URL, so a client round-trip would buy nothing but a loading state.
 */
export function MergeReview({
  survivorId,
  duplicateId,
  people,
  blockers,
  preview,
}: {
  survivorId: string;
  duplicateId: string;
  people: DuplicatePerson[];
  blockers: MergeBlocker[];
  preview: MergePreviewRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Partial<Record<MergeableField, Side>>>({});

  const survivor = people.find((p) => p.id === survivorId);
  const duplicate = people.find((p) => p.id === duplicateId);

  if (!survivor || !duplicate) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertDescription>
          Those records are no longer listed as duplicates.{" "}
          <Link href="/portal/people/duplicates" className="underline">
            Back to duplicates
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const hardBlockers = blockers.filter((b) => b.kind === "blocker");
  const advisories = blockers.filter((b) => b.kind === "advisory");
  const blocked = hardBlockers.length > 0;

  function valueFor(person: DuplicatePerson, field: MergeableField) {
    return (person as unknown as Record<string, string | null>)[field] ?? null;
  }

  function handleMerge() {
    setError(null);
    startTransition(async () => {
      const overrides: Partial<Record<MergeableField, string | null>> = {};
      for (const field of MERGEABLE_FIELDS) {
        if (picks[field] === "duplicate") {
          overrides[field] = valueFor(duplicate!, field);
        }
      }
      const result = await mergePeopleAction(
        survivorId,
        duplicateId,
        overrides,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Records merged.");
      router.push("/portal/people/duplicates");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Keep {personDisplayName(survivor)}, merge in{" "}
            {personDisplayName(duplicate)}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {hardBlockers.map((blocker) => (
            <Alert key={blocker.detail} variant="destructive">
              <AlertDescription>{blocker.detail}</AlertDescription>
            </Alert>
          ))}

          {advisories.map((advisory) => (
            <Alert key={advisory.detail}>
              <AlertDescription>
                {advisory.detail}{" "}
                <Link
                  href={`/portal/people/${survivorId}`}
                  className="underline"
                >
                  Open {personDisplayName(survivor)}
                </Link>{" "}
                to link them instead.
              </AlertDescription>
            </Alert>
          ))}

          {preview.length > 0 && (
            <div>
              <h2 className="text-sm font-medium">Records that will move</h2>
              <ul className="app-muted mt-2 grid gap-1 text-sm">
                {preview
                  .filter((row) => row.duplicate_count > 0)
                  .map((row) => (
                    <li key={`${row.table_name}.${row.column_name}`}>
                      {row.duplicate_count} × {row.table_name}
                      <span className="opacity-60"> ({row.column_name})</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="text-sm font-medium">
              Details — pick which record wins
            </h2>
            <div className="mt-2 grid gap-2">
              {MERGEABLE_FIELDS.map((field) => {
                const survivorValue = valueFor(survivor, field);
                const duplicateValue = valueFor(duplicate, field);
                // Nothing to choose between when they agree, or when only the
                // survivor has a value: merge_people already coalesces a
                // missing field from the record being absorbed.
                if (
                  !duplicateValue ||
                  survivorValue === duplicateValue ||
                  !survivorValue
                ) {
                  return null;
                }
                const picked = picks[field] ?? "survivor";
                return (
                  <div
                    key={field}
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[10rem_1fr_1fr] sm:items-center"
                  >
                    <span className="text-sm font-medium">
                      {FIELD_LABELS[field]}
                    </span>
                    {(["survivor", "duplicate"] as const).map((side) => (
                      <label
                        key={side}
                        className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${
                          picked === side ? "border-primary" : "border-input"
                        }`}
                      >
                        <input
                          type="radio"
                          name={field}
                          className="mt-1"
                          checked={picked === side}
                          onChange={() =>
                            setPicks((prev) => ({ ...prev, [field]: side }))
                          }
                        />
                        <span className="min-w-0 break-words">
                          {side === "survivor" ? survivorValue : duplicateValue}
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleMerge} disabled={pending || blocked}>
              {pending ? "Merging…" : "Merge records"}
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/portal/people/duplicates" />}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
