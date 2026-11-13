"use client";

import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventAction } from "./actions";
import { FlierField } from "./flier-field";
import { listProgramsAction, type Program } from "../programs/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";
import { datetimeLocalToUtcIsoInBrowser } from "@/lib/time";

const VISIBILITIES = [
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

function getInitialFormState() {
  return {
    name: "",
    description: "",
    location: "",
    startsAt: "",
    endsAt: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visibility: "private",
    status: "draft",
    programIds: [] as string[],
    flierUrl: "",
  };
}

export function NewEventDialog({
  programs,
  triggerLabel = "New Event",
  open: controlledOpen,
  onOpenChange,
  withTrigger = true,
}: {
  programs?: Program[];
  triggerLabel?: string;
} & ControlledOpenProps) {
  const router = useRouter();
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  // Callers that already query programs server-side pass them in; the sidebar
  // quick action has no such query, so fall back to loading them on open
  // rather than leaving the picker stuck on "No program".
  const [loadedPrograms, setLoadedPrograms] = useState<Program[]>([]);
  const programOptions = programs ?? loadedPrograms;
  const [form, setForm] = useState(getInitialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || programs) return;
    listProgramsAction().then((result) => {
      if (!("error" in result)) setLoadedPrograms(result.data);
    });
  }, [open, programs]);

  function update<K extends keyof ReturnType<typeof getInitialFormState>>(
    key: K,
    value: ReturnType<typeof getInitialFormState>[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleProgram(programId: string) {
    setForm((prev) => ({
      ...prev,
      programIds: prev.programIds.includes(programId)
        ? prev.programIds.filter((id) => id !== programId)
        : [...prev.programIds, programId],
    }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(getInitialFormState());
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("location", form.location);
    // Converted here, in the browser, so the event's instants are fixed from
    // the typist's own clock rather than the server's (#1063).
    formData.set(
      "startsAt",
      datetimeLocalToUtcIsoInBrowser(form.startsAt) ?? "",
    );
    formData.set(
      "endsAt",
      form.endsAt ? (datetimeLocalToUtcIsoInBrowser(form.endsAt) ?? "") : "",
    );
    formData.set("timezone", form.timezone);
    formData.set("visibility", form.visibility);
    formData.set("status", form.status);
    for (const programId of form.programIds) {
      formData.append("programIds", programId);
    }
    formData.set("flierUrl", form.flierUrl);

    startTransition(async () => {
      const result = await createEventAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Event created.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      withTrigger={withTrigger}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          {triggerLabel}
        </Button>
      }
      title="Create event"
      description="Basic event details — expenses, sponsors, and giveaways are added separately."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Creating...
              </>
            ) : (
              "Create event"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="name" required>
            Event name
          </FieldLabel>
          <Input
            id="name"
            required
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <MarkdownTextarea
            id="description"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel>Programs</FieldLabel>
          <div id="programIds" className="flex flex-col gap-2">
            {programOptions.length === 0 ? (
              <p className="app-muted text-sm">No programs to choose from.</p>
            ) : (
              programOptions.map((program) => (
                <label
                  key={program.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={form.programIds.includes(program.id)}
                    onCheckedChange={() => toggleProgram(program.id)}
                  />
                  {program.name}
                </label>
              ))
            )}
          </div>
          <FieldDescription>
            An event can count toward more than one program; every one you pick
            includes it in that program&apos;s impact report.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="location">Location</FieldLabel>
          <Input
            id="location"
            value={form.location}
            onChange={(event) => update("location", event.target.value)}
          />
        </Field>

        <FlierField
          id="flier"
          value={form.flierUrl}
          onChange={(value) => update("flierUrl", value)}
        />

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="startsAt" required>
              Starts
            </FieldLabel>
            <Input
              id="startsAt"
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => update("startsAt", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="endsAt">Ends</FieldLabel>
            <Input
              id="endsAt"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => update("endsAt", event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="timezone" required>
            Timezone
          </FieldLabel>
          <Input
            id="timezone"
            required
            placeholder="e.g. America/Chicago"
            value={form.timezone}
            onChange={(event) => update("timezone", event.target.value)}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="visibility">Visibility</FieldLabel>
            <Select
              value={form.visibility}
              onValueChange={(value) =>
                update("visibility", value ?? "private")
              }
            >
              <SelectTrigger id="visibility" className="w-full">
                <SelectValue placeholder="Select visibility">
                  {(value: string) =>
                    VISIBILITIES.find((option) => option.value === value)
                      ?.label ?? "Select visibility"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {VISIBILITIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="status">Status</FieldLabel>
            <Select
              value={form.status}
              onValueChange={(value) => update("status", value ?? "draft")}
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue placeholder="Select status">
                  {(value: string) =>
                    STATUSES.find((option) => option.value === value)?.label ??
                    "Select status"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
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
