"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGearRequestNotesAction } from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldLabel } from "@/components/ui/field";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";

/** Edit an open request's notes (#1527). Blank clears them. */
export function EditRequestNotesDialog({
  requestId,
  notes,
}: {
  requestId: string;
  notes: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDraft(notes ?? "");
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      await runAction(() => setGearRequestNotesAction(requestId, draft), {
        success: "Notes saved.",
        onError: setError,
        onSuccess: () => {
          setOpen(false);
          router.refresh();
        },
      });
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" variant="secondary" size="sm">
          Edit notes
        </Button>
      }
      size="lg"
      title="Edit notes"
      description="The requester wrote these on the request form, and reads them back in their own account, so anything written here is visible to them."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="outline" />}
            disabled={isPending}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? <Spinner className="size-4" /> : null}
            Save
          </Button>
        </>
      }
    >
      <Field>
        <FieldLabel htmlFor="request-notes-edit">Notes</FieldLabel>
        <MarkdownTextarea
          id="request-notes-edit"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={5}
        />
      </Field>
      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </PortalFormSurface>
  );
}
