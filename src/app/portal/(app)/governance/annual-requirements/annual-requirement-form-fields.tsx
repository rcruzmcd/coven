"use client";

import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { DocumentField } from "@/components/portal/document-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RequirementStatus } from "./annual-requirement-form";

export type AnnualRequirementFormState = {
  name: string;
  dueDate: string;
  status: RequirementStatus;
  externalLink: string;
  documentPath: string;
  bodyText: string;
};

export function emptyAnnualRequirementForm(): AnnualRequirementFormState {
  return {
    name: "",
    dueDate: "",
    status: "not_started",
    externalLink: "",
    documentPath: "",
    bodyText: "",
  };
}

export function AnnualRequirementFormFields({
  form,
  update,
  idPrefix,
  documentUrl = null,
}: {
  form: AnnualRequirementFormState;
  update: <K extends keyof AnnualRequirementFormState>(
    key: K,
    value: AnnualRequirementFormState[K],
  ) => void;
  idPrefix: string;
  /** The signed URL for the saved `documentPath`, when editing a record. */
  documentUrl?: string | null;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`} required>
          Name
        </FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          required
          placeholder="e.g. IRS Form 990"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-due-date`} required>
            Due date
          </FieldLabel>
          <Input
            id={`${idPrefix}-due-date`}
            type="date"
            required
            value={form.dueDate}
            onChange={(event) => update("dueDate", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-status`}>Status</FieldLabel>
          <Select
            value={form.status}
            onValueChange={(value) =>
              update("status", value as RequirementStatus)
            }
          >
            <SelectTrigger id={`${idPrefix}-status`}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </Field>
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
        <FieldLabel htmlFor={`${idPrefix}-body-text`}>Notes</FieldLabel>
        <MarkdownTextarea
          id={`${idPrefix}-body-text`}
          value={form.bodyText}
          onChange={(event) => update("bodyText", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packAnnualRequirementFormData(
  form: AnnualRequirementFormState,
) {
  const formData = new FormData();
  formData.set("name", form.name);
  formData.set("dueDate", form.dueDate);
  formData.set("status", form.status);
  formData.set("externalLink", form.externalLink);
  formData.set("documentPath", form.documentPath);
  formData.set("bodyText", form.bodyText);
  return formData;
}
