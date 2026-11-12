"use client";

import {
  donationSourceLabel,
  PAYMENT_METHODS,
  paymentMethodLabel,
  type DonationSource,
  type EventOption,
} from "./donations-shared";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { formatCurrency } from "@/lib/format";

export type DonationFormState = {
  donor: PickedPerson | null;
  eventId: string;
  method: string;
  receivedDate: string;
  amount: string;
  notes: string;
};

export function emptyDonationForm(): DonationFormState {
  return {
    donor: null,
    eventId: "",
    method: "",
    receivedDate: new Date().toISOString().slice(0, 10),
    amount: "",
    notes: "",
  };
}

/**
 * What a row's provider reported (#1390), for a gift that did not come from
 * this form. Present exactly when the row's `source` is not `manual`.
 */
export type DonationProvenance = {
  source: DonationSource;
  externalReference: string | null;
  processorLabel: string | null;
  grossAmount: number | string | null;
  feeAmount: number | string | null;
};

/**
 * The provider's own figures, shown wherever an imported gift is. Rendered by
 * both the edit form and the view pane, so the two cannot drift.
 *
 * The gross and the fee are shown only where the file carried them: a platform
 * that passes its cost to the donor reports no fee, and a dash under "Fee"
 * would read as a fee of nothing rather than as no such thing.
 */
export function DonationProvenanceFields({
  provenance,
  idPrefix,
}: {
  provenance: DonationProvenance;
  idPrefix: string;
}) {
  const hasSplit =
    provenance.grossAmount !== null || provenance.feeAmount !== null;
  return (
    <>
      <ReadOnlyField label="Recorded by" htmlFor={`${idPrefix}-source`}>
        {donationSourceLabel(provenance.source)}
        {provenance.processorLabel ? ` — ${provenance.processorLabel}` : ""}
      </ReadOnlyField>
      {provenance.externalReference && (
        <ReadOnlyField
          label="Transaction ID"
          htmlFor={`${idPrefix}-externalReference`}
        >
          <span className="font-mono text-xs">
            {provenance.externalReference}
          </span>
        </ReadOnlyField>
      )}
      {hasSplit && (
        <Field orientation="responsive">
          {provenance.grossAmount !== null && (
            <ReadOnlyField
              label="Gross amount"
              htmlFor={`${idPrefix}-grossAmount`}
            >
              {formatCurrency(provenance.grossAmount)}
            </ReadOnlyField>
          )}
          {provenance.feeAmount !== null && (
            <ReadOnlyField
              label="Processor fee"
              htmlFor={`${idPrefix}-feeAmount`}
            >
              {formatCurrency(provenance.feeAmount)}
            </ReadOnlyField>
          )}
        </Field>
      )}
    </>
  );
}

export function DonationFormFields({
  form,
  update,
  events,
  people,
  onPersonCreated,
  idPrefix,
  provenance,
}: {
  form: DonationFormState;
  update: <K extends keyof DonationFormState>(
    key: K,
    value: DonationFormState[K],
  ) => void;
  events: EventOption[];
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  idPrefix: string;
  /**
   * Set for an imported gift. The figures the provider reported render
   * read-only rather than disabled -- a disabled input still looks like a
   * field somebody failed to fill in -- and the database refuses the edit
   * anyway (`freeze_imported_figures`), so this is the explanation rather
   * than the enforcement.
   */
  provenance?: DonationProvenance;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-donor`}>Donor</FieldLabel>
        <PersonPicker
          id={`${idPrefix}-donor`}
          people={people}
          selected={form.donor}
          onSelect={(person) => update("donor", person)}
          onPersonCreated={onPersonCreated}
          newPersonRole="is_donor"
          placeholder="Search donors by name or email..."
        />
        <FieldDescription>
          Leave empty for an anonymous donation.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-method`} required>
          Payment method
        </FieldLabel>
        <Select
          value={form.method}
          onValueChange={(value) => update("method", value ?? "")}
        >
          <SelectTrigger
            id={`${idPrefix}-method`}
            aria-required="true"
            className="w-full"
          >
            <SelectValue placeholder="Select payment method" />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {paymentMethodLabel(method)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-event`}>Event</FieldLabel>
        <Select
          value={form.eventId || "none"}
          onValueChange={(value) =>
            update("eventId", value === "none" ? "" : (value ?? ""))
          }
        >
          <SelectTrigger id={`${idPrefix}-event`} className="w-full">
            <SelectValue placeholder="No event">
              {(value: string) =>
                value && value !== "none"
                  ? (events.find((event) => event.id === value)?.name ??
                    "No event")
                  : "No event"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No event</SelectItem>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-receivedDate`} required>
            Date
          </FieldLabel>
          <Input
            id={`${idPrefix}-receivedDate`}
            type="date"
            required
            value={form.receivedDate}
            onChange={(event) => update("receivedDate", event.target.value)}
          />
        </Field>
        {provenance ? (
          <ReadOnlyField label="Amount" htmlFor={`${idPrefix}-amount`}>
            {formatCurrency(form.amount)}
          </ReadOnlyField>
        ) : (
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-amount`} required>
              Amount
            </FieldLabel>
            <Input
              id={`${idPrefix}-amount`}
              type="number"
              min="0"
              step="0.01"
              required
              value={form.amount}
              onChange={(event) => update("amount", event.target.value)}
            />
          </Field>
        )}
      </Field>

      {provenance && (
        <DonationProvenanceFields provenance={provenance} idPrefix={idPrefix} />
      )}

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packDonationFormData(form: DonationFormState) {
  const formData = new FormData();
  formData.set("donorId", form.donor?.id ?? "");
  formData.set("eventId", form.eventId);
  formData.set("method", form.method);
  formData.set("receivedDate", form.receivedDate);
  formData.set("amount", form.amount);
  formData.set("notes", form.notes);
  return formData;
}
