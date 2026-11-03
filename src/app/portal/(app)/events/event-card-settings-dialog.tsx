"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { runAction } from "@/components/portal/action-toast";
import type { CreateEventResult } from "./actions";

/**
 * #1777. A plain card's own settings, behind a gear in its header: the
 * settings that used to sit on Registration & planning and only affect this
 * card (group chat on Registrants, seats and cost notice on Carpools,
 * auto-assign on Discount codes). Saves only what `buildFormData` returns.
 *
 * `onOpen` resets the fields to the saved values, so reopening after a
 * cancel never shows the abandoned edit.
 */
export function EventCardSettingsDialog({
  title,
  description,
  success,
  onOpen,
  buildFormData,
  save,
  onSaved,
  children,
}: {
  title: string;
  description?: ReactNode;
  success: string;
  onOpen: () => void;
  buildFormData: () => FormData;
  save: (formData: FormData) => Promise<CreateEventResult>;
  onSaved?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setError(null);
      onOpen();
    }
    setOpen(next);
  }

  function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    const formData = buildFormData();
    startTransition(async () => {
      await runAction(() => save(formData), {
        success,
        onError: setError,
        onSuccess: () => {
          setOpen(false);
          router.refresh();
          onSaved?.();
        },
      });
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={title}
          title={title}
        >
          <Settings2 />
        </Button>
      }
      title={title}
      description={description}
      size="md"
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
                <Spinner /> Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        {children}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
