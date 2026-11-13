"use client";

import { FormEvent, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  TIMEZONE_OPTIONS,
  datetimeLocalToUtcIsoInBrowser,
  utcIsoToDatetimeLocalInBrowser,
} from "@/lib/time";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { createArtworkCallAction, updateArtworkCallAction } from "./actions";
import type { ArtworkCall } from "../submission-types";

type EventOption = { id: string; name: string; starts_at: string };

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ArtworkCallDialog({
  call,
  events,
  trigger,
}: {
  /** Absent when opening a new call. */
  call?: ArtworkCall;
  events: EventOption[];
  /**
   * Overrides the default button. The calls table passes an icon trigger, so
   * the row's edit control sits beside copy and delete instead of being the
   * one word-wide button among three icons (#1157).
   */
  trigger?: ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Controlled because `MarkdownTextarea` is; reset from the call on every
  // open so a cancelled edit doesn't carry into the next one, as the
  // uncontrolled fields beside it don't.
  const [intro, setIntro] = useState(call?.intro ?? "");
  const [isPending, startTransition] = useTransition();

  const editing = !!call;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    // Converted here, in the browser, so the call's instants are fixed using
    // the curator's own timezone rather than the server's -- which is UTC on
    // Vercel, so a call set to close at 5pm used to store 17:00Z and close at
    // 11am in Denver (#1054). Blank stays blank; the action reads "" as "no
    // deadline", and re-running `new Date(...).toISOString()` on the instant
    // this now sends is a no-op.
    for (const field of ["opensAt", "closesAt"] as const) {
      const typed = formData.get(field);
      if (typeof typed !== "string") continue;
      const instant = datetimeLocalToUtcIsoInBrowser(typed);
      if (instant) formData.set(field, instant);
    }

    startTransition(async () => {
      const result = editing
        ? await updateArtworkCallAction(call.id, formData)
        : await createArtworkCallAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Call updated." : "Call opened.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={(next) => {
        if (next) setIntro(call?.intro ?? "");
        setOpen(next);
      }}
      trigger={
        trigger ?? (
          <Button
            type="button"
            variant={editing ? "ghost" : "default"}
            size="sm"
          >
            {editing ? "Edit call" : "New call"}
          </Button>
        )
      }
      title={editing ? "Edit call for artwork" : "Open a call for artwork"}
      description={
        editing
          ? "The event cannot be changed — submissions already point at it."
          : "A call does not need an event. Its link is generated when you save."
      }
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? <Spinner /> : null}
            {editing ? "Save call" : "Open call"}
          </Button>
        </>
      }
    >
      <div className="py-2">
        <FieldGroup>
          <RequiredFieldsNote />
          <Field>
            <FieldLabel htmlFor="call-title" required>
              Title
            </FieldLabel>
            <Input
              id="call-title"
              name="title"
              required
              maxLength={200}
              defaultValue={call?.title ?? ""}
            />
            <FieldDescription>
              The heading on the public page. Not the event&apos;s name —
              &ldquo;Zine Vol. 2, open call&rdquo; rather than the ride it might
              end up in.
            </FieldDescription>
          </Field>

          {editing ? null : (
            <Field>
              <FieldLabel htmlFor="call-event">Event</FieldLabel>
              <select
                id="call-event"
                name="eventId"
                className={selectClassName}
              >
                {/* First, and selected by default: standing on its own is
                        the ordinary case for a zine issue or an open inbox,
                        and making it the default is what stops a curator
                        attaching an unrelated event just to get past the
                        field. */}
                <option value="">No event — this call stands alone</option>
                {events.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <FieldDescription>
                Attaching one shows its date and place on the page, and files
                the submissions against it. Still one call per event.
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="call-timezone">
              Show the deadline in
            </FieldLabel>
            <select
              id="call-timezone"
              name="timezone"
              defaultValue={call?.timezone ?? ""}
              className={selectClassName}
            >
              <option value="">From the event, or UTC</option>
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldDescription>
              The zone artists read the deadline in on the public page. It does
              not change what the times below mean — you type those in your own
              timezone. Leave it alone for a call attached to an event and it
              will use the event&apos;s.
            </FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id="call-open"
              name="isOpen"
              defaultChecked={call?.is_open ?? true}
            />
            <FieldLabel htmlFor="call-open">Accepting submissions</FieldLabel>
          </Field>

          <Field>
            <FieldLabel htmlFor="call-opens">Opens</FieldLabel>
            <Input
              id="call-opens"
              name="opensAt"
              type="datetime-local"
              defaultValue={utcIsoToDatetimeLocalInBrowser(call?.opens_at)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="call-closes">Closes</FieldLabel>
            <Input
              id="call-closes"
              name="closesAt"
              type="datetime-local"
              defaultValue={utcIsoToDatetimeLocalInBrowser(call?.closes_at)}
            />
            <FieldDescription>
              Times are in your computer&apos;s timezone. Leave both empty to
              let the switch above decide.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="call-max">Images per submission</FieldLabel>
            <Input
              id="call-max"
              name="maxImages"
              type="number"
              min={1}
              max={5}
              defaultValue={call?.max_images ?? 3}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="call-intro">
              What to tell the artist
            </FieldLabel>
            <MarkdownTextarea
              id="call-intro"
              name="intro"
              rows={5}
              maxLength={4000}
              value={intro}
              onChange={(event) => setIntro(event.target.value)}
            />
            <FieldDescription>
              Shown above the form as prose: what you are looking for and the
              theme. Credit and rights go in the next field, where they get a
              heading of their own.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="call-rights">Rights and credit</FieldLabel>
            <Textarea
              id="call-rights"
              name="rightsNote"
              rows={3}
              maxLength={500}
              defaultValue={call?.rights_note ?? ""}
            />
            <FieldDescription>
              One or two lines on what we may do with a piece and how the artist
              is credited. Leave it empty and the brief simply doesn&apos;t
              mention rights — better than a promise nobody has agreed to.
            </FieldDescription>
          </Field>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </div>
    </PortalFormSurface>
  );
}
