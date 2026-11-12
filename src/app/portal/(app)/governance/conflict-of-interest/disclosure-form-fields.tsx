"use client";

import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { DocumentField } from "@/components/portal/document-field";
import { Input } from "@/components/ui/input";

export type DisclosureFormState = {
  disclosureYear: string;
  onFileDate: string;
  notes: string;
  externalLink: string;
  documentPath: string;
  bodyText: string;
};

/**
 * `defaultYear` is the current *fiscal* year, resolved on the server and passed
 * down -- the fiscal year start month is a setting, so the browser's clock
 * alone can't work out which year a disclosure covers.
 */
export function emptyDisclosureForm(defaultYear: number): DisclosureFormState {
  return {
    disclosureYear: String(defaultYear),
    onFileDate: "",
    notes: "",
    externalLink: "",
    documentPath: "",
    bodyText: "",
  };
}

export function DisclosureFormFields({
  form,
  update,
  idPrefix,
  documentUrl = null,
}: {
  form: DisclosureFormState;
  update: <K extends keyof DisclosureFormState>(
    key: K,
    value: DisclosureFormState[K],
  ) => void;
  idPrefix: string;
  /** The signed URL for the saved `documentPath`, when editing a record. */
  documentUrl?: string | null;
}) {
  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-disclosure-year`} required>
            Disclosure fiscal year
          </FieldLabel>
          <Input
            id={`${idPrefix}-disclosure-year`}
            type="number"
            required
            value={form.disclosureYear}
            onChange={(event) => update("disclosureYear", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-on-file-date`}>
            On-file date
          </FieldLabel>
          <Input
            id={`${idPrefix}-on-file-date`}
            type="date"
            value={form.onFileDate}
            onChange={(event) => update("onFileDate", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <MarkdownTextarea
          id={`${idPrefix}-notes`}
          placeholder="Any noted conflicts..."
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </Field>

      <DocumentField
        value={{ link: form.externalLink, path: form.documentPath }}
        onChange={({ link, path }) => {
          update("externalLink", link);
          update("documentPath", path);
        }}
        signedUrl={documentUrl}
        idPrefix={idPrefix}
        module="governance"
      />

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-body-text`}>
          Disclosure details
        </FieldLabel>
        <MarkdownTextarea
          id={`${idPrefix}-body-text`}
          value={form.bodyText}
          onChange={(event) => update("bodyText", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packDisclosureFormData(form: DisclosureFormState) {
  const formData = new FormData();
  formData.set("disclosureYear", form.disclosureYear);
  formData.set("onFileDate", form.onFileDate);
  formData.set("notes", form.notes);
  formData.set("externalLink", form.externalLink);
  formData.set("documentPath", form.documentPath);
  formData.set("bodyText", form.bodyText);
  return formData;
}
