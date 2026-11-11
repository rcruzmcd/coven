"use client";

import {
  FormEvent,
  Ref,
  useEffect,
  useImperativeHandle,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  datetimeLocalToUtcIsoInBrowser,
  TIMEZONE_OPTIONS,
  utcIsoToDatetimeLocalInBrowser,
} from "@/lib/time";
import { updateEventAction } from "./actions";
import {
  movableEventPieces,
  useEventSocialContent,
} from "./social-content-tab";
import {
  ShiftSocialPostsDialog,
  type SocialPostShift,
} from "./shift-social-posts-dialog";
import { FlierField, FlierPreview } from "./flier-field";
import type { Program } from "../programs/actions";
import type { EventRow } from "./event-badges";
import { StatusBadge, VisibilityBadge } from "./event-badges";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runAction } from "@/components/portal/action-toast";
import { ViewerTime } from "@/components/viewer-time";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { LinkedMeetings } from "./linked-meetings";

const VISIBILITIES = [
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];

function toDatetimeLocalValue(iso: string | null) {
  // The browser's zone, so the prefill and the save agree (#1063). The
  // event's own timezone governs public display only, not how a typed time
  // is read.
  return utcIsoToDatetimeLocalInBrowser(iso);
}

function formStateFor(event: EventRow) {
  return {
    name: event.name,
    description: event.description ?? "",
    location: event.location ?? "",
    startsAt: toDatetimeLocalValue(event.starts_at),
    endsAt: toDatetimeLocalValue(event.ends_at),
    timezone: event.timezone,
    visibility: event.visibility,
    status: event.status,
    programIds: event.program_ids,
    flierUrl: event.flier_url ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

function isDirty(form: FormState, event: EventRow) {
  const baseline = formStateFor(event);
  return (Object.keys(baseline) as (keyof FormState)[]).some((key) =>
    // programIds is the one array field: === would compare references and
    // report every render as dirty.
    key === "programIds"
      ? !sameIds(form.programIds, baseline.programIds)
      : form[key] !== baseline[key],
  );
}

export type OverviewTabHandle = {
  discard: () => void;
};

export function OverviewTab({
  event,
  programs,
  formId,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  event: EventRow;
  programs: Program[];
  formId: string;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<OverviewTabHandle>;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => formStateFor(event));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const social = useEventSocialContent();
  // #1799: set after a save that moved the start, to offer moving the posts.
  const [postShift, setPostShift] = useState<SocialPostShift | null>(null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    onDirtyChange?.(isDirty(form, event));
  }, [form, event, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discard: () => {
      setError(null);
      setForm(formStateFor(event));
    },
  }));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("location", form.location);
    // Converted here, in the browser, from the typist's own clock:
    // `parseEventForm` expects instants, and on the server a naive
    // wall-clock string would be read as UTC.
    const startsAt = datetimeLocalToUtcIsoInBrowser(form.startsAt);
    formData.set("startsAt", startsAt ?? "");
    formData.set("endsAt", datetimeLocalToUtcIsoInBrowser(form.endsAt) ?? "");
    formData.set("timezone", form.timezone);
    formData.set("visibility", form.visibility);
    formData.set("status", form.status);
    for (const programId of form.programIds) {
      formData.append("programIds", programId);
    }
    formData.set("flierUrl", form.flierUrl);

    startTransition(async () => {
      await runAction(() => updateEventAction(event.id, formData), {
        success: "Event details saved.",
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onSaved();
          // Asked only after the save lands, so declining or failing to move
          // the posts never undoes the new date.
          const shiftMs = startsAt
            ? Date.parse(startsAt) - Date.parse(event.starts_at)
            : 0;
          const count = movableEventPieces(social).length;
          if (startsAt && shiftMs !== 0 && count > 0) {
            setPostShift({
              fromStartsAt: event.starts_at,
              toStartsAt: startsAt,
              shiftMs,
              count,
            });
          }
        },
      });
    });
  }

  const programNames = programs
    .filter((program) => form.programIds.includes(program.id))
    .map((program) => program.name);

  function toggleProgram(programId: string) {
    setForm((prev) => ({
      ...prev,
      programIds: prev.programIds.includes(programId)
        ? prev.programIds.filter((id) => id !== programId)
        : [...prev.programIds, programId],
    }));
  }
  const locked = event.report_status === "submitted";

  if (mode === "view" || locked) {
    return (
      <>
        <FieldGroup>
          <Field orientation="responsive">
            <Field>
              <FieldLabel htmlFor="details-visibility">Visibility</FieldLabel>
              <div id="details-visibility">
                <VisibilityBadge visibility={form.visibility} />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="details-status">Status</FieldLabel>
              <div id="details-status">
                <StatusBadge status={form.status} />
              </div>
            </Field>
          </Field>

          <ReadOnlyField label="Programs" htmlFor="details-programIds">
            {programNames.length > 0 ? programNames.join(", ") : "—"}
          </ReadOnlyField>

          <LinkedMeetings eventId={event.id} />

          <ReadOnlyField label="Location" htmlFor="details-location">
            {form.location || "—"}
          </ReadOnlyField>

          <Field orientation="responsive">
            <ReadOnlyField label="Starts" htmlFor="details-startsAt">
              <ViewerTime iso={event.starts_at} fallbackZone={event.timezone} />
            </ReadOnlyField>
            <ReadOnlyField label="Ends" htmlFor="details-endsAt">
              {event.ends_at ? (
                <ViewerTime iso={event.ends_at} fallbackZone={event.timezone} />
              ) : (
                "—"
              )}
            </ReadOnlyField>
          </Field>

          <ReadOnlyField label="Timezone" htmlFor="details-timezone">
            {form.timezone}
          </ReadOnlyField>

          <ReadOnlyField label="Event name" htmlFor="details-name">
            {form.name}
          </ReadOnlyField>

          <ReadOnlyField label="Description" htmlFor="details-description">
            <span className="whitespace-pre-line">
              {form.description || "—"}
            </span>
          </ReadOnlyField>

          <ReadOnlyField label="Flier" htmlFor="details-flier">
            <FlierPreview url={form.flierUrl} />
          </ReadOnlyField>
        </FieldGroup>
        <ShiftSocialPostsDialog
          eventId={event.id}
          shift={postShift}
          onClose={() => setPostShift(null)}
        />
      </>
    );
  }

  return (
    <>
      <form id={formId} onSubmit={handleSubmit}>
        <FieldGroup>
          <RequiredFieldsNote />
          <Field orientation="responsive">
            <Field>
              <FieldLabel htmlFor="details-visibility">Visibility</FieldLabel>
              <Select
                value={form.visibility}
                onValueChange={(value) =>
                  update("visibility", value ?? "private")
                }
              >
                <SelectTrigger id="details-visibility" className="w-full">
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
              <FieldLabel htmlFor="details-status">Status</FieldLabel>
              <Select
                value={form.status}
                onValueChange={(value) => update("status", value ?? "draft")}
              >
                <SelectTrigger id="details-status" className="w-full">
                  <SelectValue placeholder="Select status">
                    {(value: string) =>
                      STATUSES.find((option) => option.value === value)
                        ?.label ?? "Select status"
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

          <Field>
            <FieldLabel>Programs</FieldLabel>
            <div id="details-programIds" className="flex flex-col gap-2">
              {programs.length === 0 ? (
                <p className="app-muted text-sm">No programs to choose from.</p>
              ) : (
                programs.map((program) => (
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
              An event can count toward more than one program; every one you
              pick includes it in that program&apos;s impact report.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="details-location">Location</FieldLabel>
            <Input
              id="details-location"
              value={form.location}
              onChange={(changeEvent) =>
                update("location", changeEvent.target.value)
              }
            />
          </Field>

          <Field orientation="responsive">
            <Field>
              <FieldLabel htmlFor="details-startsAt" required>
                Starts
              </FieldLabel>
              <Input
                id="details-startsAt"
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(changeEvent) =>
                  update("startsAt", changeEvent.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="details-endsAt">Ends</FieldLabel>
              <Input
                id="details-endsAt"
                type="datetime-local"
                value={form.endsAt}
                onChange={(changeEvent) =>
                  update("endsAt", changeEvent.target.value)
                }
              />
            </Field>
          </Field>

          <Field>
            <FieldLabel htmlFor="details-timezone">Timezone</FieldLabel>
            <Select
              value={form.timezone}
              onValueChange={(value) => update("timezone", value ?? "")}
            >
              <SelectTrigger id="details-timezone" className="w-full">
                <SelectValue placeholder="Select timezone">
                  {(value: string) =>
                    TIMEZONE_OPTIONS.find((option) => option.value === value)
                      ?.label ?? value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {form.timezone &&
                  !TIMEZONE_OPTIONS.some(
                    (option) => option.value === form.timezone,
                  ) && (
                    <SelectItem value={form.timezone}>
                      {form.timezone}
                    </SelectItem>
                  )}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="details-name" required>
              Event name
            </FieldLabel>
            <Input
              id="details-name"
              required
              value={form.name}
              onChange={(changeEvent) =>
                update("name", changeEvent.target.value)
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="details-description">Description</FieldLabel>
            <Textarea
              id="details-description"
              value={form.description}
              onChange={(changeEvent) =>
                update("description", changeEvent.target.value)
              }
            />
          </Field>

          <FlierField
            id="details-flier"
            value={form.flierUrl}
            onChange={(value) => update("flierUrl", value)}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </form>
      <ShiftSocialPostsDialog
        eventId={event.id}
        shift={postShift}
        onClose={() => setPostShift(null)}
      />
    </>
  );
}
