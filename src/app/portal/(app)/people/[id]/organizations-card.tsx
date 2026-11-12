"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addOrganizationMembershipAction,
  removeOrganizationMembershipAction,
  type PersonListItem,
} from "../actions";
import { PersonPicker, type PickedPerson } from "../person-picker";
import type { OrganizationMembership } from "../people-shared";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";

export function OrganizationsCard({
  personId,
  isOrganization,
  memberships,
  people,
  canManage,
}: {
  personId: string;
  isOrganization: boolean;
  memberships: OrganizationMembership[];
  people: PersonListItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [newPeople, setNewPeople] = useState<PersonListItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<PickedPerson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isRemoving, startRemoveTransition] = useTransition();

  const availablePeople = [...people, ...newPeople];
  const title = isOrganization
    ? "People in this organization"
    : "Organizations";

  function handleAdd() {
    if (!selected) {
      setError("Select or create a person to link.");
      return;
    }
    setError(null);
    const link = selected;
    startSaveTransition(async () => {
      await runAction(
        () =>
          isOrganization
            ? addOrganizationMembershipAction(personId, link.id)
            : addOrganizationMembershipAction(link.id, personId),
        {
          success: `${link.name ?? link.email ?? "Person"} linked.`,
          onError: setError,
          onSuccess: () => {
            setShowAdd(false);
            setSelected(null);
            router.refresh();
          },
        },
      );
    });
  }

  function handleRemove(membershipId: string) {
    setRemovingId(membershipId);
    startRemoveTransition(async () => {
      await runAction(() => removeOrganizationMembershipAction(membershipId), {
        success: "Link removed.",
        error: "Could not remove the link. Please try again.",
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title} ({memberships.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {memberships.length === 0 ? (
          <EmptyState
            className="py-4"
            title={
              isOrganization
                ? "No people linked yet"
                : "Not linked to any organizations yet"
            }
            description={
              canManage
                ? `Link one with + Add ${isOrganization ? "person" : "organization"} below.`
                : isOrganization
                  ? "People appear here once they are linked to this organization."
                  : "Organizations appear here once this person is linked to one."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {isOrganization ? "Person" : "Organization"}
                </TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((membership) => {
                const linked = isOrganization
                  ? membership.person
                  : membership.organization;
                return (
                  <TableRow key={membership.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/portal/people/${linked.id}`}
                        className="hover:underline"
                      >
                        {linked.name ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <ConfirmDeleteButton
                          label="Remove link"
                          title={`Remove the link to ${linked.name ?? "this record"}?`}
                          description="This unlinks the two records. Neither record is deleted, and the link can be added again. "
                          confirmLabel="Remove"
                          pending={isRemoving && removingId === membership.id}
                          onConfirm={() => handleRemove(membership.id)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {canManage &&
          (showAdd ? (
            <div className="rounded-md border border-[var(--line)] p-3">
              <PersonPicker
                aria-label={`${isOrganization ? "Person" : "Organization"} to link`}
                people={availablePeople}
                selected={selected}
                onSelect={setSelected}
                onPersonCreated={(created) =>
                  setNewPeople((prev) => [
                    ...prev,
                    {
                      // The card links the opposite kind, and the picker
                      // filters on it, so the new row has to carry it.
                      ...created,
                      person_type: isOrganization
                        ? ("individual" as const)
                        : ("organization" as const),
                    },
                  ])
                }
                onlyOrganizations={!isOrganization}
              />
              {error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAdd(false);
                    setSelected(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleAdd} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Spinner /> Saving...
                    </>
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => setShowAdd(true)}
            >
              + Add {isOrganization ? "person" : "organization"}
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}
