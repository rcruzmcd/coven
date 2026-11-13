"use client";

import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { DocumentField } from "@/components/portal/document-field";
import { Input } from "@/components/ui/input";

export type PolicyFormState = {
  name: string;
  category: string;
  effectiveDate: string;
  version: string;
  externalLink: string;
  documentPath: string;
  bodyText: string;
};

export function emptyPolicyForm(): PolicyFormState {
  return {
    name: "",
    category: "",
    effectiveDate: "",
    version: "",
    externalLink: "",
    documentPath: "",
    bodyText: "",
  };
}

export function PolicyFormFields({
  form,
  update,
  idPrefix,
  documentUrl = null,
}: {
  form: PolicyFormState;
  update: <K extends keyof PolicyFormState>(
    key: K,
    value: PolicyFormState[K],
  ) => void;
  idPrefix: string;
  /** The signed URL for the saved `documentPath`, when editing a record. */
  documentUrl?: string | null;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`} required>
          Policy name
        </FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          required
          placeholder="e.g. Whistleblower Policy"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-category`}>Category</FieldLabel>
          <Input
            id={`${idPrefix}-category`}
            placeholder="e.g. Compliance"
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-version`} required>
            Version
          </FieldLabel>
          <Input
            id={`${idPrefix}-version`}
            required
            placeholder="e.g. 1, 2024 revision"
            value={form.version}
            onChange={(event) => update("version", event.target.value)}
          />
        </Field>
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
        <FieldLabel htmlFor={`${idPrefix}-body-text`}>Policy text</FieldLabel>
        <MarkdownTextarea
          id={`${idPrefix}-body-text`}
          value={form.bodyText}
          onChange={(event) => update("bodyText", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packPolicyFormData(form: PolicyFormState) {
  const formData = new FormData();
  formData.set("name", form.name);
  formData.set("category", form.category);
  formData.set("version", form.version);
  formData.set("effectiveDate", form.effectiveDate);
  formData.set("externalLink", form.externalLink);
  formData.set("documentPath", form.documentPath);
  formData.set("bodyText", form.bodyText);
  return formData;
}
