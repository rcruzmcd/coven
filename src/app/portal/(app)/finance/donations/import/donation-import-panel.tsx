"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { GoogleDriveButton } from "@/components/portal/google-drive-button";
import { formatCalendarDate, formatCurrency } from "@/lib/format";
import {
  guessMapping,
  IMPORT_FIELDS,
  IMPORT_FIELD_HINTS,
  IMPORT_FIELD_LABELS,
  mappingError,
  parseDonationImportCsv,
  pruneMapping,
  type DonationImportField,
  type DonationImportMapping,
  type DonationImportRow,
} from "./donation-import-row";
import { importDonationsAction } from "./actions";

const NO_COLUMN = "__none__";

type PreviewRow = { key: string; item: DonationImportRow };

export function DonationImportPanel({
  timeZone,
  savedMapping,
  savedProcessorLabel,
}: {
  /**
   * The organization's own reporting zone (#1065). The preview shows the day
   * each gift will report under, computed here so the reader sees it before
   * committing; the RPC recomputes it from the same instant, so this is the
   * preview and not the decision.
   */
  timeZone: string;
  /** What this tenant mapped last time, from `giving.import_mapping`. */
  savedMapping: DonationImportMapping;
  /** `giving.provider_label`, so the usual answer is already filled in. */
  savedProcessorLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<DonationImportMapping>(savedMapping);
  const [processorLabel, setProcessorLabel] = useState(savedProcessorLabel);
  const [parsed, setParsed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { rows, totalRows } = useMemo(() => {
    if (!parsed || !csvText.trim()) {
      return {
        rows: [] as ReturnType<typeof parseDonationImportCsv>["rows"],
        totalRows: 0,
      };
    }
    const result = parseDonationImportCsv(csvText, mapping, timeZone);
    return { rows: result.rows, totalRows: result.totalRows };
  }, [parsed, csvText, mapping, timeZone]);

  const validRows = rows.filter(
    (row): row is { data: DonationImportRow } => "data" in row,
  );
  const errorRows = rows.filter(
    (row): row is { error: string } => "error" in row,
  );
  const problem = parsed ? mappingError(mapping) : null;

  function readHeaders(text: string) {
    const { headers: found } = parseDonationImportCsv(text, {}, timeZone);
    setHeaders(found);
    // A remembered mapping first, pruned to what this file actually has, then
    // a guess for whatever is still unmapped. Neither overrides the other:
    // last month's answer is better evidence than a name match, and a guess is
    // better than an empty picker.
    const kept = pruneMapping(mapping, found);
    const guessed = guessMapping(found);
    setMapping({ ...guessed, ...kept });
    setParsed(true);
    setSubmitError(null);
  }

  function handleParse() {
    readHeaders(csvText);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await loadFile(file);
  }

  /** A local pick or a Drive one (#1636): the same columns step either way. */
  async function loadFile(file: File) {
    const text = await file.text();
    setCsvText(text);
    readHeaders(text);
  }

  function setField(field: DonationImportField, header: string) {
    setMapping((prev) => {
      const next = { ...prev };
      if (header === NO_COLUMN) delete next[field];
      else next[field] = header;
      return next;
    });
  }

  function handleSubmit() {
    setSubmitError(null);
    startTransition(async () => {
      await runAction(
        () => importDonationsAction(csvText, mapping, processorLabel),
        {
          success: (result) =>
            `${result.inserted} donation${result.inserted === 1 ? "" : "s"} imported.`,
          // Both counts, always, when either is non-zero: "3 imported" with no
          // word about the other 17 rows is the sentence that gets a treasurer
          // reconciling the same file twice.
          description: (result) => {
            const parts: string[] = [];
            if (result.duplicates > 0) {
              parts.push(`${result.duplicates} already recorded`);
            }
            if (result.invalid > 0) {
              parts.push(
                `${result.invalid} row${result.invalid === 1 ? "" : "s"} skipped`,
              );
            }
            return parts.length > 0 ? `${parts.join(", ")}.` : undefined;
          },
          onError: setSubmitError,
          onSuccess: () => {
            setCsvText("");
            setHeaders([]);
            setParsed(false);
            router.refresh();
          },
        },
      );
    });
  }

  const previewRows = useMemo<PreviewRow[]>(
    // The transaction id is unique in a valid file, but this preview also
    // shows a file that is not yet valid, so the position keeps its place.
    () =>
      validRows.map((row, index) => ({ key: String(index), item: row.data })),
    [validRows],
  );

  const columns = useMemo<PortalDataTableColumn<PreviewRow>[]>(
    () => [
      {
        key: "receivedDate",
        label: "Date",
        sortValue: (row) => row.item.receivedDate,
        render: (row) => formatCalendarDate(row.item.receivedDate),
      },
      {
        key: "amount",
        label: "Received",
        sortValue: (row) => row.item.amount,
        render: (row) => formatCurrency(row.item.amount),
      },
      {
        key: "grossAmount",
        label: "Gross",
        sortValue: (row) => row.item.grossAmount ?? 0,
        render: (row) =>
          row.item.grossAmount === null
            ? "—"
            : formatCurrency(row.item.grossAmount),
      },
      {
        key: "feeAmount",
        label: "Fee",
        sortValue: (row) => row.item.feeAmount ?? 0,
        render: (row) =>
          row.item.feeAmount === null
            ? "—"
            : formatCurrency(row.item.feeAmount),
      },
      {
        key: "externalReference",
        label: "Transaction ID",
        sortValue: (row) => row.item.externalReference,
        render: (row) => (
          <span className="font-mono text-xs">
            {row.item.externalReference}
          </span>
        ),
      },
      {
        key: "notes",
        label: "Notes",
        sortValue: (row) => row.item.notes,
        render: (row) => row.item.notes ?? "—",
      },
    ],
    [],
  );

  const canSubmit = !problem && validRows.length > 0 && !isPending;

  return (
    <FieldGroup>
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
        <FieldLabel htmlFor="import-textarea">Or paste the export</FieldLabel>
        <Textarea
          id="import-textarea"
          rows={6}
          value={csvText}
          onChange={(event) => {
            setCsvText(event.target.value);
            setParsed(false);
          }}
          placeholder="Paste the whole export, header row and all."
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleParse}
          disabled={!csvText.trim()}
        >
          Read columns
        </Button>
      </Field>

      {parsed && headers.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            No header row found. The first line of the file has to name the
            columns.
          </AlertDescription>
        </Alert>
      )}

      {headers.length > 0 && (
        <>
          <Field>
            <FieldLabel htmlFor="import-processor-label">
              Where it came from
            </FieldLabel>
            <Input
              id="import-processor-label"
              value={processorLabel}
              maxLength={60}
              onChange={(event) => setProcessorLabel(event.target.value)}
              placeholder="e.g. Donorbox"
            />
            <FieldDescription>
              Recorded on every row in this import, so a figure can be traced
              back to the export it came from.
            </FieldDescription>
          </Field>

          <div className="flex flex-col gap-4">
            <p className="app-muted text-sm">
              Which of your columns holds what. We remember this, so next
              month&apos;s file is one paste.
            </p>
            {IMPORT_FIELDS.map((field) => (
              <Field key={field}>
                <FieldLabel htmlFor={`import-map-${field}`}>
                  {IMPORT_FIELD_LABELS[field]}
                </FieldLabel>
                <Select
                  value={mapping[field] ?? NO_COLUMN}
                  onValueChange={(value) => setField(field, value ?? NO_COLUMN)}
                >
                  <SelectTrigger id={`import-map-${field}`} className="w-full">
                    <SelectValue placeholder="Not in this file" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COLUMN}>Not in this file</SelectItem>
                    {headers.map((header) => (
                      <SelectItem key={header} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{IMPORT_FIELD_HINTS[field]}</FieldDescription>
              </Field>
            ))}
          </div>
        </>
      )}

      {problem && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}

      {parsed && !problem && totalRows > 0 && (
        <div className="flex flex-col gap-3">
          <p className="app-muted text-sm">
            {validRows.length} row{validRows.length === 1 ? "" : "s"} ready
            {errorRows.length > 0 && `, ${errorRows.length} skipped`}. Dates are
            the day your organization reports them under.
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
              emptyMessage="No rows to preview."
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
          `Import ${validRows.length} donation${validRows.length === 1 ? "" : "s"}`
        )}
      </Button>
    </FieldGroup>
  );
}
