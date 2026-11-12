"use client";

import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { DocumentField } from "@/components/portal/document-field";
import { Input } from "@/components/ui/input";

export type BylawsFormState = {
  version: string;
  effectiveDate: string;
  amendmentSummary: string;
  externalLink: string;
  documentPath: string;
  bodyText: string;
};

export function emptyBylawsForm(): BylawsFormState {
  return {
    version: "",
    effectiveDate: "",
    amendmentSummary: "",
    externalLink: "",
    documentPath: "",
    bodyText: "",
  };
}

export function BylawsFormFields({
  form,
  update,
  idPrefix,
  documentUrl = null,
}: {
  form: BylawsFormState;
  update: <K extends keyof BylawsFormState>(
    key: K,
    value: BylawsFormState[K],
  ) => void;
  idPrefix: string;
  /** The signed URL for the saved `documentPath`, when editing a record. */
  documentUrl?: string | null;
}) {
  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-version`} required>
            Version
          </FieldLabel>
          <Input
            id={`${idPrefix}-version`}
            required
            placeholder="e.g. 2024 Restatement, Amendment 3"
            value={form.version}
            onChange={(event) => update("version", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-effective-date`} required>
            Effective date
          </FieldLabel>
          <Input
            id={`${idPrefix}-effective-date`}
            type="date"
            required
            value={form.effectiveDate}
            onChange={(event) => update("effectiveDate", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-amendment-summary`}>
          What changed
        </FieldLabel>
        <MarkdownTextarea
          id={`${idPrefix}-amendment-summary`}
          placeholder="Summary of this amendment (leave blank for the original bylaws)"
          value={form.amendmentSummary}
          onChange={(event) => update("amendmentSummary", event.target.value)}
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
        <FieldLabel htmlFor={`${idPrefix}-body-text`}>Bylaws text</FieldLabel>
        <MarkdownTextarea
          id={`${idPrefix}-body-text`}
          value={form.bodyText}
          onChange={(event) => update("bodyText", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packBylawsFormData(form: BylawsFormState) {
  const formData = new FormData();
  formData.set("version", form.version);
  formData.set("effectiveDate", form.effectiveDate);
  formData.set("amendmentSummary", form.amendmentSummary);
  formData.set("externalLink", form.externalLink);
  formData.set("documentPath", form.documentPath);
  formData.set("bodyText", form.bodyText);
  return formData;
}
