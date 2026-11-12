"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { formatRoleLabel, roleDisplayName, roleLabelMap } from "@/lib/format";
import {
  assignRoleAction,
  deactivateUserAction,
  reactivateUserAction,
  removeTenantMemberAction,
  revokeRoleAction,
  updateUserPreferredNameAction,
  type PortalUser,
  type PortalRoleOption,
} from "./actions";
import { portalUserDisplayName } from "./users-shared";
import { PreferredNameCell } from "./preferred-name-cell";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { keepFocusOnRemoval } from "@/lib/focus-on-removal";

function statusBadge(portalUser: PortalUser) {
  if (portalUser.deactivated_at) {
    return <Badge variant="destructive">Deactivated</Badge>;
  }
  return <Badge variant="secondary">Active</Badge>;
}

export function UsersTable({
  users,
  currentUserId,
  availableRoles,
}: {
  users: PortalUser[];
  currentUserId: string | null;
  availableRoles: PortalRoleOption[];
}) {
  const router = useRouter();
  // list_portal_users() returns role *names*, so the tenant's own wording for
  // each has to come from the role list the page already queried (#910).
  const roleLabels = useMemo(
    () => roleLabelMap(availableRoles),
    [availableRoles],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string>("");
  const [deactivateTarget, setDeactivateTarget] = useState<PortalUser | null>(
    null,
  );
  // An account that also belongs to another organization is removed from
  // this one rather than deactivated: deactivation is platform-wide, and the
  // database refuses it for such an account (#707 Phase 4).
  const [removeTarget, setRemoveTarget] = useState<PortalUser | null>(null);
  // Revoking a live role takes effect on the target's next request, so it
  // gets the same confirmation step deactivation and pending-grant revocation
  // already had -- it was the only one of the three that acted on one click.
  const [revokeTarget, setRevokeTarget] = useState<{
    user: PortalUser;
    role: string;
  } | null>(null);

  // Every mutation in this table routes through here, so the receipt and the
  // inline error branch are written once rather than per button. Stable, so
  // the column list below only rebuilds when something it actually renders
  // differently changes.
  const submit = useCallback(
    (
      action: () => Promise<{ error: string } | { success: true }>,
      success: string,
    ) => {
      setError(null);
      startTransition(async () => {
        await runAction(action, {
          success,
          onError: setError,
          onSuccess: () => {
            setAddingFor(null);
            setPendingRole("");
            router.refresh();
          },
        });
      });
    },
    [router],
  );

  function handleRevokeRole() {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevokeTarget(null);
    submit(
      () => revokeRoleAction(target.user.user_id, target.role),
      `${formatRoleLabel(target.role, roleLabels)} removed from ${portalUserDisplayName(target.user)}.`,
    );
  }

  function handleDeactivate() {
    if (!deactivateTarget) return;
    setError(null);
    const target = deactivateTarget;
    startTransition(async () => {
      await runAction(() => deactivateUserAction(target.user_id), {
        success: `${portalUserDisplayName(target)} deactivated.`,
        onError: (message) => {
          setDeactivateTarget(null);
          setError(message);
        },
        onSuccess: () => {
          setDeactivateTarget(null);
          router.refresh();
        },
      });
    });
  }

  function handleRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    submit(
      () => removeTenantMemberAction(target.user_id),
      `${portalUserDisplayName(target)} removed from the organization.`,
    );
  }

  const columns = useMemo<PortalDataTableColumn<PortalUser>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        // On the name the cell shows -- preferred name, else people row, else
        // the identity provider's, else email -- rather than on the email the
        // RPC happens to order by.
        sortValue: (portalUser) => portalUserDisplayName(portalUser),
        cellClassName: "max-w-xs font-medium",
        render: (portalUser) => (
          <span
            className="block truncate"
            title={portalUserDisplayName(portalUser)}
          >
            {/* An account with no people row yet (invited but never signed
                in) has nothing to link to, so it stays plain text rather
                than a dead link. */}
            {portalUser.person_id ? (
              <Link
                href={`/portal/people/${portalUser.person_id}`}
                className="hover:underline"
              >
                {portalUserDisplayName(portalUser)}
              </Link>
            ) : (
              portalUserDisplayName(portalUser)
            )}
          </span>
        ),
      },
      {
        key: "preferred_name",
        label: "Preferred name",
        sortValue: (portalUser) => portalUser.preferred_name,
        hideBelow: "lg",
        render: (portalUser) => (
          <PreferredNameCell
            value={portalUser.preferred_name}
            label={portalUserDisplayName(portalUser)}
            disabled={isPending}
            onSave={(preferredName) =>
              submit(
                () =>
                  updateUserPreferredNameAction(
                    portalUser.user_id,
                    preferredName,
                  ),
                `Preferred name updated for ${portalUserDisplayName(portalUser)}.`,
              )
            }
          />
        ),
      },
      {
        key: "roles",
        // Several roles to a cell, so there is no single value to order on;
        // Status is the column for grouping who can do what.
        label: "Roles",
        render: (portalUser) => {
          const isSelf = portalUser.user_id === currentUserId;
          return (
            <div className="flex flex-wrap gap-1.5">
              {portalUser.roles.length === 0 ? (
                <span className="app-muted text-sm">No access</span>
              ) : (
                portalUser.roles.map((role) => {
                  const lockedSelfAdmin = isSelf && role === "admin";
                  const removeLabel = `Remove ${formatRoleLabel(role, roleLabels)}`;
                  return (
                    <Badge
                      key={role}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {formatRoleLabel(role, roleLabels)}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              disabled={lockedSelfAdmin}
                              // Not \`disabled\` while pending: a disabled button
                              // can't take focus back from the dialog, so it
                              // would drop to <body> (#1862).
                              aria-disabled={isPending || undefined}
                              title={
                                lockedSelfAdmin
                                  ? "You can't remove your own admin role."
                                  : undefined
                              }
                              aria-label={removeLabel}
                              ref={keepFocusOnRemoval}
                              onClick={() => {
                                if (isPending) return;
                                setRevokeTarget({ user: portalUser, role });
                              }}
                              className="-mr-1 flex size-6 items-center justify-center rounded-full hover:bg-black/10 disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40 dark:hover:bg-white/10"
                            />
                          }
                        >
                          <X className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>{removeLabel}</TooltipContent>
                      </Tooltip>
                    </Badge>
                  );
                })
              )}
            </div>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        // On the word the badge shows, so ascending groups the deactivated
        // accounts together at one end.
        sortValue: (portalUser) =>
          portalUser.deactivated_at ? "Deactivated" : "Active",
        hideBelow: "sm",
        render: (portalUser) => statusBadge(portalUser),
      },
      {
        key: "add-role",
        label: "Add role",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (portalUser) => {
          const assignableRoles = availableRoles.filter(
            (role) => !portalUser.roles.includes(role.name),
          );
          return addingFor === portalUser.user_id ? (
            <div className="flex items-center gap-2">
              <Select
                value={pendingRole}
                onValueChange={(value) => setPendingRole(value ?? "")}
              >
                <SelectTrigger className="h-8 w-40" aria-label="Add role">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.name}>
                      {roleDisplayName(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={!pendingRole || isPending}
                onClick={() =>
                  submit(
                    () => assignRoleAction(portalUser.user_id, pendingRole),
                    `${formatRoleLabel(pendingRole, roleLabels)} granted to ${portalUserDisplayName(portalUser)}.`,
                  )
                }
              >
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isPending}
                focusableWhenDisabled
                onClick={() => {
                  setAddingFor(null);
                  setPendingRole("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={assignableRoles.length === 0}
              onClick={() => {
                setAddingFor(portalUser.user_id);
                setPendingRole("");
              }}
            >
              Add role
            </Button>
          );
        },
      },
      {
        key: "deactivate",
        label: "Deactivate",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (portalUser) => {
          const isSelf = portalUser.user_id === currentUserId;
          if (portalUser.shared_account) {
            return (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isPending || isSelf}
                title={
                  isSelf
                    ? "You can't remove yourself from the organization."
                    : "This account also belongs to another organization, so it is removed from this one rather than deactivated."
                }
                focusableWhenDisabled
                ref={keepFocusOnRemoval}
                onClick={() => setRemoveTarget(portalUser)}
              >
                Remove
              </Button>
            );
          }
          return portalUser.deactivated_at !== null ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isPending}
              focusableWhenDisabled
              ref={keepFocusOnRemoval}
              onClick={() =>
                submit(
                  () => reactivateUserAction(portalUser.user_id),
                  `${portalUserDisplayName(portalUser)} reactivated.`,
                )
              }
            >
              Reactivate
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isPending || isSelf}
              title={
                isSelf ? "You can't deactivate your own account." : undefined
              }
              focusableWhenDisabled
              ref={keepFocusOnRemoval}
              onClick={() => setDeactivateTarget(portalUser)}
            >
              Deactivate
            </Button>
          );
        },
      },
    ],
    [
      availableRoles,
      roleLabels,
      currentUserId,
      isPending,
      addingFor,
      pendingRole,
      submit,
    ],
  );

  if (users.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="No users found"
            description="Users appear here after they sign in for the first time. Stage access for them under Pending access below."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <PortalDataTable
        columns={columns}
        rows={users}
        getRowKey={(portalUser) => portalUser.user_id}
        // The RPC orders by email, which is not what the Name column shows,
        // so the list arrives sorted by the name a reader is scanning.
        defaultSort={{ key: "name", dir: "asc" }}
        emptyMessage="No users to show."
        stickyFirstColumn
      />

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(next) => !next && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revokeTarget
                ? `Remove the ${formatRoleLabel(revokeTarget.role, roleLabels)} role?`
                : "Remove role?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget && (
                <>
                  {portalUserDisplayName(revokeTarget.user)} loses everything
                  that role grants, from their next request onward.
                  {revokeTarget.user.roles.length === 1
                    ? " It's their only role, so they'll have no portal access at all."
                    : " Their other roles are unaffected."}{" "}
                  You can assign it again afterwards.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRevokeRole}
              disabled={isPending}
            >
              Remove role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(next) => !next && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget && (
                <>
                  {portalUserDisplayName(deactivateTarget)} will lose all portal
                  access until reactivated. Their roles stay assigned and will
                  apply again immediately on reactivation.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeactivate}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Spinner /> Deactivating...
                </>
              ) : (
                "Deactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(next) => !next && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from the organization?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && (
                <>
                  {portalUserDisplayName(removeTarget)} loses every role here
                  and disappears from this list. Their account and their access
                  to any other organization are unchanged. You can stage access
                  for them again afterwards.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRemove}
              disabled={isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
