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
import type { MilestoneStatus } from "./nonprofit-status-form";

export type MilestoneFormState = {
  description: string;
  phase: string;
  status: MilestoneStatus;
  dueDate: string;
  notes: string;
};

export function emptyMilestoneForm(phase: string = ""): MilestoneFormState {
  return {
    description: "",
    phase,
    status: "not_started",
    dueDate: "",
    notes: "",
  };
}

export function NonprofitStatusFormFields({
  form,
  update,
  idPrefix,
  existingPhases,
}: {
  form: MilestoneFormState;
  update: <K extends keyof MilestoneFormState>(
    key: K,
    value: MilestoneFormState[K],
  ) => void;
  idPrefix: string;
  existingPhases: string[];
}) {
  const datalistId = `${idPrefix}-phase-options`;

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-description`} required>
          Description
        </FieldLabel>
        <MarkdownTextarea
          id={`${idPrefix}-description`}
          required
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-phase`} required>
          Phase
        </FieldLabel>
        <Input
          id={`${idPrefix}-phase`}
          list={datalistId}
          required
          value={form.phase}
          onChange={(event) => update("phase", event.target.value)}
        />
        <datalist id={datalistId}>
          {existingPhases.map((phase) => (
            <option key={phase} value={phase} />
          ))}
        </datalist>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-status`}>Status</FieldLabel>
          <Select
            value={form.status}
            onValueChange={(value) =>
              update("status", value as MilestoneStatus)
            }
          >
            <SelectTrigger id={`${idPrefix}-status`}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-due-date`}>Due date</FieldLabel>
          <Input
            id={`${idPrefix}-due-date`}
            type="date"
            value={form.dueDate}
            onChange={(event) => update("dueDate", event.target.value)}
          />
        </Field>
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

export function packMilestoneFormData(form: MilestoneFormState) {
  const formData = new FormData();
  formData.set("description", form.description);
  formData.set("phase", form.phase);
  formData.set("status", form.status);
  formData.set("dueDate", form.dueDate);
  formData.set("notes", form.notes);
  return formData;
}
