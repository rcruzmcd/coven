"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import {
  parseCalendarImportCsv,
  type CalendarImportRow,
} from "./calendar-import-row";
import { bulkImportCalendarItemsAction } from "./actions";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { GoogleDriveButton } from "@/components/portal/google-drive-button";

export function CsvImportPanel({
  categoryKeys,
}: {
  /**
   * The tenant's category keys, for validating the pasted CSV before it is
   * submitted (#834). The server re-validates against the same list -- this is
   * the preview step, not the gate.
   */
  categoryKeys: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [source, setSource] = useState("");
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<
    ({ data: CalendarImportRow } | { error: string })[]
  >([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validRows = rows.filter(
    (row): row is { data: CalendarImportRow } => "data" in row,
  );
  const errorRows = rows.filter(
    (row): row is { error: string } => "error" in row,
  );

  function handleParse() {
    setSubmitError(null);
    const { rows: parsedRows } = parseCalendarImportCsv(csvText, categoryKeys);
    setRows(parsedRows);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await loadFile(file);
  }

  /** A local pick or a Drive one (#1636): the same preview either way. */
  async function loadFile(file: File) {
    const text = await file.text();
    setCsvText(text);
    setSubmitError(null);
    const { rows: parsedRows } = parseCalendarImportCsv(text, categoryKeys);
    setRows(parsedRows);
  }

  function handleSubmit() {
    setSubmitError(null);
    const skipped = rows.length - validRows.length;
    startTransition(async () => {
      await runAction(
        () =>
          bulkImportCalendarItemsAction(
            source,
            validRows.map((row) => row.data),
          ),
        {
          success: (result) =>
            `Imported ${result.insertedCount} item${result.insertedCount === 1 ? "" : "s"} as drafts.`,
          description:
            skipped > 0
              ? `${skipped} row${skipped === 1 ? "" : "s"} skipped for errors.`
              : undefined,
          onError: setSubmitError,
          onSuccess: () => {
            setRows([]);
            setCsvText("");
            router.refresh();
          },
        },
      );
    });
  }

  const canSubmit =
    source.trim().length > 0 && validRows.length > 0 && !isPending;

  // Nothing in a parsed CSV row is unique -- two rows may be identical --
  // so the position in the file is the key. It stays put while the preview
  // is sorted, since the list itself is only rebuilt by a fresh parse.
  const previewRows = useMemo(
    () =>
      validRows.map((row, index) => ({ key: String(index), item: row.data })),
    [validRows],
  );

  const columns = useMemo<
    PortalDataTableColumn<{ key: string; item: CalendarImportRow }>[]
  >(
    () => [
      {
        key: "title",
        label: "Title",
        sortValue: (row) => row.item.title,
        render: (row) => row.item.title,
      },
      {
        key: "startsAt",
        label: "Starts",
        // ISO timestamps, so string order is chronological even though the
        // cell shows only the date part.
        sortValue: (row) => row.item.startsAt,
        render: (row) => row.item.startsAt.slice(0, 10),
      },
      {
        key: "priorityTier",
        label: "Priority",
        // Numeric, so tier 1 -- the most urgent -- leads an ascending sort.
        sortValue: (row) => row.item.priorityTier,
        render: (row) => `Tier ${row.item.priorityTier}`,
      },
      {
        key: "category",
        label: "Category",
        sortValue: (row) => row.item.category,
        render: (row) => row.item.category,
      },
      {
        key: "region",
        label: "Region",
        sortValue: (row) => row.item.region,
        render: (row) => row.item.region ?? "—",
      },
    ],
    [],
  );

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="import-source">Source</FieldLabel>
        <Input
          id="import-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="e.g. GLAAD 2027 calendar"
        />
        <p className="app-muted text-xs">
          Applied to every row in this upload — traceable provenance for where
          the list came from.
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor="import-file">CSV file</FieldLabel>
        <Input
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
        />
        <GoogleDriveButton
          accept=".csv,text/csv"
          hint="A Google Sheet comes in as CSV: its first sheet only."
          onFiles={([file]) => void loadFile(file)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="import-textarea">Or paste CSV</FieldLabel>
        <Textarea
          id="import-textarea"
          rows={6}
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          placeholder="title,item_type,starts_at,ends_at,time_zone,recurrence_rule,priority_tier,category,region"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleParse}
        >
          Parse
        </Button>
      </Field>

      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="app-muted text-sm">
            {validRows.length} valid row{validRows.length === 1 ? "" : "s"}
            {errorRows.length > 0 &&
              `, ${errorRows.length} row${errorRows.length === 1 ? "" : "s"} skipped`}
          </p>

          {errorRows.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-inside list-disc">
                  {errorRows.map((row) => (
                    <li key={row.error}>{row.error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {previewRows.length > 0 && (
            <PortalDataTable
              columns={columns}
              rows={previewRows}
              getRowKey={(row) => row.key}
              // No default sort: the preview opens in the file's own order,
              // which is how a reader checks it against the CSV they
              // uploaded, and sorts from there.
              emptyMessage="No rows to preview."
              // This panel sits in a form, not on a card of its own.
              shell="bare"
            />
          )}
        </div>
      )}

      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
        {isPending ? (
          <>
            <Spinner /> Importing…
          </>
        ) : (
          `Import ${validRows.length} item${validRows.length === 1 ? "" : "s"} as drafts`
        )}
      </Button>
    </FieldGroup>
  );
}
