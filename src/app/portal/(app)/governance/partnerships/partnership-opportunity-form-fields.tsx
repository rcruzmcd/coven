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
import {
  PARTNERSHIP_STAGE_LABELS,
  type PartnershipStage,
} from "./partnership-opportunity-form";

// Defined beside the stage list so server code can read it too (#1658).
export { PARTNERSHIP_STAGE_LABELS };

export type PartnershipOpportunityFormState = {
  stage: PartnershipStage;
  nextStepDate: string;
  notes: string;
};

export function emptyPartnershipOpportunityForm(): PartnershipOpportunityFormState {
  return {
    stage: "prospecting",
    nextStepDate: "",
    notes: "",
  };
}

export function PartnershipOpportunityFormFields({
  form,
  update,
  idPrefix,
}: {
  form: PartnershipOpportunityFormState;
  update: <K extends keyof PartnershipOpportunityFormState>(
    key: K,
    value: PartnershipOpportunityFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-stage`}>Stage</FieldLabel>
          <Select
            value={form.stage}
            onValueChange={(value) =>
              update("stage", value as PartnershipStage)
            }
          >
            <SelectTrigger id={`${idPrefix}-stage`}>
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PARTNERSHIP_STAGE_LABELS).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-next-step-date`}>
            Next step date
          </FieldLabel>
          <Input
            id={`${idPrefix}-next-step-date`}
            type="date"
            value={form.nextStepDate}
            onChange={(event) => update("nextStepDate", event.target.value)}
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

export function packPartnershipOpportunityFormData(
  form: PartnershipOpportunityFormState,
) {
  const formData = new FormData();
  formData.set("stage", form.stage);
  formData.set("nextStepDate", form.nextStepDate);
  formData.set("notes", form.notes);
  return formData;
}
