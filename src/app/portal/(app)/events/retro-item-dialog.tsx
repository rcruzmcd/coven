"use client";

import { FormEvent, useState, useTransition } from "react";
import {
  createEventRetroItemAction,
  updateEventRetroItemAction,
  type EventRetroItem,
  type RetroPerson,
} from "./retro-actions";
import {
  RETRO_AREA_LABELS,
  RETRO_AREAS,
  RETRO_BODY_MAX,
  RETRO_KINDS,
  type RetroKind,
} from "./retro-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

const NONE = "none";

const KIND_SINGULAR: Record<RetroKind, string> = {
  went_well: "Went well",
  improve: "To improve",
  action: "Action item",
};

/**
 * Adds a retro item, or edits one when `item` is given. Controlled by the
 * caller so one dialog serves every row's edit button.
 */
export function RetroItemDialog({
  eventId,
  item,
  defaultKind = "went_well",
  owners,
  open,
  onOpenChange,
  onSaved,
}: {
  eventId: string;
  item?: EventRetroItem;
  defaultKind?: RetroKind;
  owners: RetroPerson[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<RetroKind>(item?.kind ?? defaultKind);
  const [body, setBody] = useState(item?.body ?? "");
  const [area, setArea] = useState<string>(item?.area ?? NONE);
  const [owner, setOwner] = useState<string>(item?.owner?.id ?? NONE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The current owner stays choosable even after leaving the roster.
  const ownerOptions =
    item?.owner && !owners.some((person) => person.id === item.owner!.id)
      ? [...owners, item.owner]
      : owners;
  const ownerLabel = (id: string) =>
    id === NONE
      ? "No owner"
      : (ownerOptions.find((person) => person.id === id)?.name ?? "Unnamed");

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    // The retro sits inside the Results card's own <form> in edit mode, and a
    // React submit event bubbles through the portal to it.
    formEvent.stopPropagation();
    setError(null);

    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("body", body);
    formData.set("area", area === NONE ? "" : area);
    formData.set("ownerPersonId", owner === NONE ? "" : owner);

    startTransition(async () => {
      const result = item
        ? await updateEventRetroItemAction(item.id, formData)
        : await createEventRetroItemAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(item ? "Retro item saved." : "Retro item added.");
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit retro item" : "Add to the retro"}
      description="What went well, what to improve, or a follow-up for next time."
      onSubmit={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : item ? (
              "Save item"
            ) : (
              "Add item"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="retro-kind" required>
              Kind
            </FieldLabel>
            <Select
              value={kind}
              onValueChange={(value) => setKind((value as RetroKind) ?? kind)}
            >
              <SelectTrigger id="retro-kind" className="w-full">
                <SelectValue>
                  {(value: RetroKind) => KIND_SINGULAR[value]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RETRO_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {KIND_SINGULAR[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="retro-area">About</FieldLabel>
            <Select
              value={area}
              onValueChange={(value) => setArea(value ?? NONE)}
            >
              <SelectTrigger id="retro-area" className="w-full">
                <SelectValue>
                  {(value: string) =>
                    value === NONE
                      ? "Anything"
                      : RETRO_AREA_LABELS[
                          value as keyof typeof RETRO_AREA_LABELS
                        ]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Anything</SelectItem>
                {RETRO_AREAS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {RETRO_AREA_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="retro-body" required>
            {kind === "action" ? "What needs doing" : "Item"}
          </FieldLabel>
          <MarkdownTextarea
            id="retro-body"
            required
            maxLength={RETRO_BODY_MAX}
            value={body}
            onChange={(changeEvent) => setBody(changeEvent.target.value)}
          />
        </Field>

        {kind === "action" && (
          <Field>
            <FieldLabel htmlFor="retro-owner">Owner</FieldLabel>
            <Select
              value={owner}
              onValueChange={(value) => setOwner(value ?? NONE)}
            >
              <SelectTrigger id="retro-owner" className="w-full">
                <SelectValue>
                  {(value: string) => ownerLabel(value)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No owner</SelectItem>
                {ownerOptions.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name ?? "Unnamed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ownerOptions.length === 0 && (
              <p className="app-muted text-xs">
                Owners come from this event&apos;s staff roster, which is empty.
              </p>
            )}
          </Field>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
