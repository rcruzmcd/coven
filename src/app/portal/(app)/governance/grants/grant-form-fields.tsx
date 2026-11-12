"use client";

import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GrantStatus } from "./grant-form";

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  planned: "Planned",
  submitted: "Submitted",
  awarded: "Awarded",
  declined: "Declined",
};

export type GrantFormState = {
  funderName: string;
  amount: string;
  applicationDeadline: string;
  status: GrantStatus;
  notes: string;
};

export function emptyGrantForm(): GrantFormState {
  return {
    funderName: "",
    amount: "",
    applicationDeadline: "",
    status: "planned",
    notes: "",
  };
}

export function GrantFormFields({
  form,
  update,
  idPrefix,
}: {
  form: GrantFormState;
  update: <K extends keyof GrantFormState>(
    key: K,
    value: GrantFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-funder-name`} required>
          Funder name
        </FieldLabel>
        <Input
          id={`${idPrefix}-funder-name`}
          required
          value={form.funderName}
          onChange={(event) => update("funderName", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-amount`}>Amount ($)</FieldLabel>
          <Input
            id={`${idPrefix}-amount`}
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(event) => update("amount", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-application-deadline`} required>
            Application deadline
          </FieldLabel>
          <Input
            id={`${idPrefix}-application-deadline`}
            type="date"
            required
            value={form.applicationDeadline}
            onChange={(event) =>
              update("applicationDeadline", event.target.value)
            }
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-status`}>Status</FieldLabel>
        <Select
          value={form.status}
          onValueChange={(value) => update("status", value as GrantStatus)}
        >
          <SelectTrigger id={`${idPrefix}-status`}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(GRANT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <MarkdownTextarea
          id={`${idPrefix}-notes`}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packGrantFormData(form: GrantFormState) {
  const formData = new FormData();
  formData.set("funderName", form.funderName);
  formData.set("amount", form.amount);
  formData.set("applicationDeadline", form.applicationDeadline);
  formData.set("status", form.status);
  formData.set("notes", form.notes);
  return formData;
}
