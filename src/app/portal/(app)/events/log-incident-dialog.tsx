"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventIncidentAction } from "./incidents-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { useEventDateDefaults } from "./event-date-defaults";
import { nowDatetimeLocalInBrowser } from "@/lib/time";

const SEVERITIES = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "serious", label: "Serious" },
];

export function LogIncidentDialog({
  eventId,
  triggerLabel = "+ Log incident",
  onSaved,
}: {
  eventId: string;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Incidents are usually written up after the fact, so the field opens on
  // the event's own start rather than on the moment of typing. "Now" is only
  // right for an incident logged as it happens, and that reader is editing
  // the time either way.
  const eventDates = useEventDateDefaults();
  const defaultOccurredAt = () =>
    eventDates.startsAt || nowDatetimeLocalInBrowser();
  const [occurredAt, setOccurredAt] = useState(defaultOccurredAt);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [peopleInvolved, setPeopleInvolved] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOccurredAt(defaultOccurredAt());
    setDescription("");
    setSeverity("minor");
    setPeopleInvolved("");
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    // Converted here, in the browser, so the recorded instant is fixed
    // using the user's own timezone rather than the server's.
    formData.set("occurredAt", new Date(occurredAt).toISOString());
    formData.set("description", description);
    formData.set("severity", severity);
    formData.set("peopleInvolved", peopleInvolved);

    startTransition(async () => {
      const result = await createEventIncidentAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Incident logged.");
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
        >
          {triggerLabel}
        </Button>
      }
      title="Log an incident"
      description="Record an incident that occurred at this event."
      onSubmit={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Log incident"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="incident-occurredAt">When</FieldLabel>
            <Input
              id="incident-occurredAt"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="incident-severity">Severity</FieldLabel>
            <Select
              value={severity}
              onValueChange={(value) => setSeverity(value ?? "minor")}
            >
              <SelectTrigger id="incident-severity" className="w-full">
                <SelectValue placeholder="Select severity">
                  {(value: string) =>
                    SEVERITIES.find((option) => option.value === value)
                      ?.label ?? "Select severity"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="incident-description" required>
            Description
          </FieldLabel>
          <MarkdownTextarea
            id="incident-description"
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="incident-peopleInvolved">
            People involved
          </FieldLabel>
          <Textarea
            id="incident-peopleInvolved"
            value={peopleInvolved}
            onChange={(event) => setPeopleInvolved(event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
