"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  deletePersonAnswersAction,
  setPersonAnswersAction,
  updatePersonAction,
  type PersonListItem,
} from "../actions";
import {
  PersonFormFields,
  packPersonFormData,
  type PersonFormState,
} from "../person-form-fields";
import { PersonPicker, type PickedPerson } from "../person-picker";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { runAction } from "@/components/portal/action-toast";
import { isOrganization, type PersonRow } from "../people-shared";
import { ImagePreviewBox, useImagePreview } from "../../website/image-preview";
import { formatAddress } from "@/lib/postal-address";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { MergeDialog } from "./merge-dialog";
import { ProfileAnswers } from "@/components/portal/profile-answers";
import type { PersonAnswerRow, PersonQuestion } from "@/lib/person-questions";

/**
 * The organization's mark, at the shape and fit the public sponsor wall draws
 * it: contained rather than cropped, in a box roughly as wide as the widest
 * wordmark (#1028 uses the same three values on the Logo URL field itself).
 *
 * Renders nothing at all when the link is unusable or has failed, so what is
 * left is the URL row below -- which is the right fallback here even though
 * the public wall falls back to the sponsor's name. A visitor must never see a
 * broken mark; a staffer is the one person who can fix it, and needs to see
 * the link that is wrong.
 */
function LogoPreview({ url }: { url: string }) {
  const preview = useImagePreview(url);
  if (!preview.url) return null;
  return (
    <ImagePreviewBox
      url={preview.url}
      ratio="4 / 1"
      fit="contain"
      className="h-16"
      onError={preview.markFailed}
    />
  );
}

function formStateFor(
  person: PersonRow,
  sponsorWallPublic: boolean,
): PersonFormState {
  return {
    name: person.name ?? "",
    preferredName: person.preferred_name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    pronouns: person.pronouns ?? "",
    instagramHandle: person.instagram_handle ?? "",
    notes: person.notes ?? "",
    logoUrl: person.logo_url ?? "",
    website: person.website ?? "",
    roles: {
      is_donor: person.is_donor,
      is_sponsor: person.is_sponsor,
      is_volunteer: person.is_volunteer,
      is_attendee: person.is_attendee,
      is_staff: person.is_staff,
      is_partner: person.is_partner,
      is_recipient: person.is_recipient,
    },
    sponsorWallPublic,
    personType: person.person_type,
    addressLine1: person.address_line1 ?? "",
    addressLine2: person.address_line2 ?? "",
    addressCity: person.address_city ?? "",
    addressRegion: person.address_region ?? "",
    addressPostalCode: person.address_postal_code ?? "",
    addressCountry: person.address_country ?? "",
  };
}

export function ProfileCard({
  person,
  people,
  canManage,
  canDeleteAnswers = false,
  sponsorWallPublic = false,
  profileQuestions = [],
  profileAnswers = [],
  canManageAnswers = false,
}: {
  person: PersonRow;
  people: PersonListItem[];
  canManage: boolean;
  /** Whether a deletion request for their answers may be actioned here. */
  canDeleteAnswers?: boolean;
  /**
   * Whether this person's manual sponsor tag is published to the public
   * sponsor wall (#1024). Read from `person_role_tags` by the caller, since
   * the role flags on `people_with_roles` are derived and carry no tag
   * metadata.
   */
  sponsorWallPublic?: boolean;
  /**
   * The tenant's current profile questions and this person's answers
   * (#1744). Empty for a reader without `person_answers: view`, which leaves
   * the card as it was.
   */
  profileQuestions?: readonly PersonQuestion[];
  profileAnswers?: readonly PersonAnswerRow[];
  canManageAnswers?: boolean;
}) {
  const router = useRouter();
  const formId = `person-profile-form-${person.id}`;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<PersonFormState>(() =>
    formStateFor(person, sponsorWallPublic),
  );
  const [contact, setContact] = useState<PickedPerson | null>(
    person.primary_contact,
  );
  const [newPeople, setNewPeople] = useState<PersonListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  // See emailConflictError in ../actions.ts: set when the save collided on
  // the person email uniqueness index.
  const [conflict, setConflict] = useState<{
    id: string;
    name: string | null;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeletingAnswers, startDeleteAnswersTransition] = useTransition();

  function deleteAnswers() {
    startDeleteAnswersTransition(async () => {
      await runAction(() => deletePersonAnswersAction(person.id), {
        success: "Profile answers deleted.",
        description: "The deletion is recorded under Data Retention.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  const availablePeople = [...people, ...newPeople];

  function update<K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function cancel() {
    setForm(formStateFor(person, sponsorWallPublic));
    setContact(person.primary_contact);
    setError(null);
    setMode("view");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConflict(null);

    startTransition(async () => {
      // Called directly rather than through runAction: runAction reduces a
      // failure to a bare string, which would drop the `conflict` that lets
      // the error link to the person already using this email.
      const result = await updatePersonAction(
        person.id,
        packPersonFormData(form),
        contact?.id ?? null,
      );
      if ("error" in result) {
        setError(result.error);
        setConflict(result.conflict ?? null);
        return;
      }
      toast.success("Profile saved.");
      setMode("view");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Profile
        </CardTitle>
        {canManage && mode === "view" && (
          <CardAction className="flex items-center gap-1">
            {/* Merging used to be a card of its own. It is a rare, one-way act
                on the record this card already holds, so it sits with the
                record's other controls rather than taking a permanent column
                slot next to the things people came to read (#1108). */}
            <MergeDialog personId={person.id} people={people} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit profile"
                    onClick={() => setMode("edit")}
                  />
                }
              >
                <Pencil />
              </TooltipTrigger>
              <TooltipContent>Edit profile</TooltipContent>
            </Tooltip>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {mode === "view" ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <span className="app-muted">Email:</span> {person.email ?? "—"}
            </p>
            <p>
              <span className="app-muted">Phone:</span> {person.phone ?? "—"}
            </p>
            <p>
              <span className="app-muted">Pronouns:</span>{" "}
              {person.pronouns ?? "—"}
            </p>
            <p>
              <span className="app-muted">Instagram:</span>{" "}
              {person.instagram_handle ? `@${person.instagram_handle}` : "—"}
            </p>
            <p>
              <span className="app-muted">Website:</span>{" "}
              {person.website ?? "—"}
            </p>
            {/* One block rather than six lines (#1164): an address is read as
                an address, and six "—" for a record that has never had one is
                noise on every person in the directory. */}
            <p>
              <span className="app-muted">Address:</span>{" "}
              {formatAddress(person) ?? "—"}
            </p>
            {/* An organization's logo is what the public sees on the sponsor
                wall and on an event's page (#1024), and until #1036 it was
                readable nowhere in the portal -- a staffer could not tell a
                good link from a dead one without opening the form. */}
            {isOrganization(person) && (
              <>
                {person.logo_url && <LogoPreview url={person.logo_url} />}
                <p className="break-all">
                  <span className="app-muted">Logo:</span>{" "}
                  {person.logo_url ?? "—"}
                </p>
              </>
            )}
            {person.primary_contact && (
              <p>
                <span className="app-muted">Primary contact:</span>{" "}
                {person.primary_contact.name ?? "—"}
              </p>
            )}
            <p>
              <span className="app-muted">Notes:</span> {person.notes ?? "—"}
            </p>
            <ProfileAnswers
              idPrefix={`person-${person.id}-profile`}
              questions={profileQuestions}
              answers={profileAnswers}
              canManage={canManageAnswers}
              onSave={(answers) => setPersonAnswersAction(person.id, answers)}
              onSaved={() => router.refresh()}
            />
            {/* /privacy keeps profile answers "until you ask us to delete
                your profile", so somebody has to be able to action that
                request (#602). Only offered when there is something to
                delete. */}
            {canDeleteAnswers && profileAnswers.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="app-muted text-sm">
                  Profile answers requested for deletion?
                </span>
                <ConfirmDeleteButton
                  label="Delete profile answers"
                  title={`Delete ${person.name ?? "this person"}'s profile answers?`}
                  description="Deletes every answer they gave to the profile questions. Events they were checked in to keep the answers recorded on the day, so past impact figures don't change. The rest of their record is untouched. This can't be undone."
                  confirmLabel="Delete profile answers"
                  pending={isDeletingAnswers}
                  onConfirm={deleteAnswers}
                />
              </div>
            )}
          </div>
        ) : (
          <form id={formId} onSubmit={handleSubmit}>
            <FieldGroup>
              <RequiredFieldsNote />
              <PersonFormFields
                form={form}
                update={update}
                idPrefix={`person-${person.id}`}
              />

              <Field>
                <FieldLabel htmlFor="profile-primary-contact">
                  Primary contact person (for an organization)
                </FieldLabel>
                <PersonPicker
                  id="profile-primary-contact"
                  people={availablePeople.filter((p) => p.id !== person.id)}
                  selected={contact}
                  onSelect={setContact}
                  onPersonCreated={(created) =>
                    setNewPeople((prev) => [...prev, created])
                  }
                />
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {error}
                    {conflict && (
                      <>
                        {" "}
                        <Link
                          href={`/portal/people/${conflict.id}`}
                          className="underline underline-offset-4"
                        >
                          Open their record
                        </Link>
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </form>
        )}
      </CardContent>
      {mode === "edit" && (
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
