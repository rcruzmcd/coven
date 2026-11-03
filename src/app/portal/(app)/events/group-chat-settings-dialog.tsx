"use client";

import { useState } from "react";
import { updateEventGroupChatAction } from "./actions";
import type { EventRow } from "./event-badges";
import { EventCardSettingsDialog } from "./event-card-settings-dialog";
import {
  DEFAULT_GROUP_CHAT_LABEL,
  GROUP_CHAT_LABEL_MAX_LENGTH,
} from "@/lib/registration-group-chat";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

function formStateFor(event: EventRow) {
  return {
    enabled: event.group_chat_enabled ?? false,
    label: event.group_chat_label ?? "",
  };
}

/**
 * #1781. The group chat setting (#1648), on the Registrants card it adds a
 * column to rather than on Registration.
 */
export function GroupChatSettingsDialog({
  event,
  onSaved,
}: {
  event: EventRow;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState(() => formStateFor(event));

  return (
    <EventCardSettingsDialog
      title="Group chat settings"
      success="Group chat setting saved."
      onOpen={() => setForm(formStateFor(event))}
      buildFormData={() => {
        const formData = new FormData();
        formData.set("groupChatEnabled", form.enabled ? "on" : "off");
        formData.set("groupChatLabel", form.label);
        return formData;
      }}
      save={(formData) => updateEventGroupChatAction(event.id, formData)}
      onSaved={onSaved}
    >
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="registrants-groupChatEnabled">
            This event has a group chat
          </FieldLabel>
          <FieldDescription>
            Adds a column to the registrants list for marking who has been added
            to the chat. Only staff see it.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="registrants-groupChatEnabled"
          checked={form.enabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({ ...prev, enabled: checked }))
          }
        />
      </Field>

      {form.enabled && (
        <Field>
          <FieldLabel htmlFor="registrants-groupChatLabel">
            Group chat name
          </FieldLabel>
          <Input
            id="registrants-groupChatLabel"
            maxLength={GROUP_CHAT_LABEL_MAX_LENGTH}
            placeholder={DEFAULT_GROUP_CHAT_LABEL}
            value={form.label}
            onChange={(changeEvent) =>
              setForm((prev) => ({ ...prev, label: changeEvent.target.value }))
            }
          />
          <FieldDescription>
            What the registrants list calls it, such as “Instagram group chat”.
            Optional.
          </FieldDescription>
        </Field>
      )}
    </EventCardSettingsDialog>
  );
}
