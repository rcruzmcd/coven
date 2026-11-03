"use client";

import { useState } from "react";
import { updateEventCarpoolSettingsAction } from "./actions";
import type { EventRow } from "./event-badges";
import { EventCardSettingsDialog } from "./event-card-settings-dialog";
import {
  EVENT_CARPOOL_NOTICE_MAX_LENGTH,
  carpoolNoticeMode,
  carpoolNoticeText,
  toEventCarpoolNotice,
  type CarpoolNoticeMode,
} from "@/lib/event-carpools";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NO_SEATS_QUESTION = "__typed__";

const CARPOOL_NOTICE_MODE_LABELS: Record<CarpoolNoticeMode, string> = {
  organization: "Your organization's notice",
  custom: "A notice for this event",
  hidden: "Don't show a notice",
};

/**
 * #1649. The saved, live `number` questions a new car's seats can come from.
 * Saved only: the pointer names a stored row.
 */
export function seatsQuestionChoices(event: EventRow) {
  return (event.registration_questions ?? []).filter(
    (question) =>
      question.kind === "number" &&
      !(question as { archived_at?: string | null }).archived_at,
  );
}

function formStateFor(event: EventRow) {
  return {
    seatsQuestionId: event.carpool_seats_question_id ?? "",
    noticeMode: carpoolNoticeMode(event.carpool_cost_notice),
    noticeText: carpoolNoticeText(
      toEventCarpoolNotice(event.carpool_cost_notice) ?? [],
    ),
  };
}

/**
 * #1780. The Carpools card's settings, moved off Registration: where a new
 * car's seats come from and the cost notice registrants are shown.
 */
export function CarpoolSettingsDialog({
  event,
  onSaved,
}: {
  event: EventRow;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState(() => formStateFor(event));
  const choices = seatsQuestionChoices(event);

  return (
    <EventCardSettingsDialog
      title="Carpool settings"
      success="Carpool settings saved."
      onOpen={() => setForm(formStateFor(event))}
      buildFormData={() => {
        const formData = new FormData();
        formData.set("carpoolSeatsQuestionId", form.seatsQuestionId);
        formData.set("carpoolNoticeMode", form.noticeMode);
        formData.set("carpoolNoticeText", form.noticeText);
        return formData;
      }}
      save={(formData) => updateEventCarpoolSettingsAction(event.id, formData)}
      onSaved={onSaved}
    >
      {choices.length > 0 && (
        <Field>
          <FieldLabel htmlFor="carpools-seatsQuestionId">
            Seats come from
          </FieldLabel>
          <Select
            value={form.seatsQuestionId || NO_SEATS_QUESTION}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                seatsQuestionId:
                  value === NO_SEATS_QUESTION || value === null
                    ? ""
                    : String(value),
              }))
            }
          >
            <SelectTrigger id="carpools-seatsQuestionId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SEATS_QUESTION}>
                Typed for each car
              </SelectItem>
              {choices.map((question) => (
                <SelectItem key={question.id} value={question.id}>
                  {question.prompt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            A number question whose answer fills in a new car&apos;s seats when
            its driver is chosen.
          </FieldDescription>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="carpools-noticeMode">
          Carpool cost notice
        </FieldLabel>
        <Select
          value={form.noticeMode}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              noticeMode: (value ?? "organization") as CarpoolNoticeMode,
            }))
          }
        >
          <SelectTrigger id="carpools-noticeMode" className="w-full">
            <SelectValue>
              {(value: CarpoolNoticeMode) => CARPOOL_NOTICE_MODE_LABELS[value]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              Object.keys(CARPOOL_NOTICE_MODE_LABELS) as CarpoolNoticeMode[]
            ).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {CARPOOL_NOTICE_MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          How carpool costs are shared, shown on the registration form, the
          confirmation and reminder emails, and wherever registrants see their
          car. Your organization&apos;s notice is edited in Site content.
        </FieldDescription>
      </Field>

      {form.noticeMode === "custom" && (
        <Field>
          <FieldLabel htmlFor="carpools-noticeText">
            This event&apos;s notice
          </FieldLabel>
          <Textarea
            id="carpools-noticeText"
            rows={4}
            maxLength={EVENT_CARPOOL_NOTICE_MAX_LENGTH}
            value={form.noticeText}
            onChange={(changeEvent) =>
              setForm((prev) => ({
                ...prev,
                noticeText: changeEvent.target.value,
              }))
            }
          />
          <FieldDescription>
            Separate paragraphs with a blank line. Keep saying that the people
            in a car see each other&apos;s first name and Instagram handle.
          </FieldDescription>
        </Field>
      )}
    </EventCardSettingsDialog>
  );
}
