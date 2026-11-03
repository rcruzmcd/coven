"use client";

import { useState } from "react";
import { updateEventAutoAssignAction } from "./actions";
import type { EventRow } from "./event-badges";
import { EventCardSettingsDialog } from "./event-card-settings-dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

/**
 * #1781. Auto-assign, on the Discount codes card beside the codes it hands
 * out rather than on Registration.
 */
export function AutoAssignSettingsDialog({
  event,
  onSaved,
}: {
  event: EventRow;
  onSaved?: () => void;
}) {
  const [enabled, setEnabled] = useState(event.auto_assign_discount_codes);

  return (
    <EventCardSettingsDialog
      title="Discount code settings"
      success="Discount code settings saved."
      onOpen={() => setEnabled(event.auto_assign_discount_codes)}
      buildFormData={() => {
        const formData = new FormData();
        formData.set("autoAssignDiscountCodes", enabled ? "on" : "off");
        return formData;
      }}
      save={(formData) => updateEventAutoAssignAction(event.id, formData)}
      onSaved={onSaved}
    >
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="discount-codes-autoAssign">
            Auto-assign discount codes to new registrants
          </FieldLabel>
          <FieldDescription>
            Hands each new registrant one of this event&apos;s unassigned codes.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="discount-codes-autoAssign"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </Field>
    </EventCardSettingsDialog>
  );
}
