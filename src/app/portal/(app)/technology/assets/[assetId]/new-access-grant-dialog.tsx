"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAccessGrantAction } from "../../actions";
import { ACCESS_LEVEL_OPTIONS } from "../../labels";
import {
  PersonPicker,
  type PickedPerson,
} from "@/app/portal/(app)/people/person-picker";
import type { PersonListItem } from "@/app/portal/(app)/people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function NewAccessGrantDialog({
  assetId,
  people,
}: {
  assetId: string;
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [accessLevel, setAccessLevel] = useState("viewer");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPerson(null);
    setAccessLevel("viewer");
    setAccountIdentifier("");
    setPurpose("");
    setExpiresAt("");
    setNotes("");
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!person) {
      setError("Select a person.");
      return;
    }

    const formData = new FormData();
    formData.set("person_id", person.id);
    formData.set("access_level", accessLevel);
    formData.set("account_identifier", accountIdentifier);
    formData.set("purpose", purpose);
    formData.set("expires_at", expiresAt);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await createAccessGrantAction(assetId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Access grant recorded.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={<Button type="button">Add access grant</Button>}
      title="Add access grant"
      description="Record who has access to this asset and at what level. Never enter a password, API key, token, or recovery code."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending || !person}>
            {isPending ? (
              <>
                <Spinner /> Adding...
              </>
            ) : (
              "Add access grant"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="grant-person">Person</FieldLabel>
          <PersonPicker
            id="grant-person"
            people={people}
            selected={person}
            onSelect={setPerson}
            onPersonCreated={() => {}}
            newPersonRole="is_volunteer"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="grant-access-level">Access level</FieldLabel>
          <Select
            value={accessLevel}
            onValueChange={(v) => setAccessLevel(v ?? "viewer")}
          >
            <SelectTrigger id="grant-access-level" className="w-full">
              <SelectValue>
                {(current: string) =>
                  ACCESS_LEVEL_OPTIONS.find(
                    (option) => option.value === current,
                  )?.label ?? current
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ACCESS_LEVEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="grant-account-identifier">
            Account identifier
          </FieldLabel>
          <Input
            id="grant-account-identifier"
            placeholder="email or username -- never a secret"
            value={accountIdentifier}
            onChange={(event) => setAccountIdentifier(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="grant-purpose">Purpose</FieldLabel>
          <Input
            id="grant-purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="grant-expires-at">Expires</FieldLabel>
          <Input
            id="grant-expires-at"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="grant-notes">Notes</FieldLabel>
          <Textarea
            id="grant-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
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
