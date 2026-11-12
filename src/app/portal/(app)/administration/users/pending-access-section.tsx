"use client";

import {
  FormEvent,
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  createInviteLinkAction,
  createPendingGrantAction,
  revokePendingGrantAction,
  type PendingGrant,
  type PortalRoleOption,
} from "./actions";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { keepFocusOnRemoval } from "@/lib/focus-on-removal";

const STATUS_BADGE_VARIANT = {
  Expired: "outline",
  Pending: "secondary",
  Claimed: "default",
  Revoked: "outline",
} as const;

/**
 * The word the status cell shows. Split out from the badge so the column can
 * sort on it: "Expired" is a live reading of `expires_at` rather than a
 * stored status, and sorting on the raw column would file those under
 * Pending.
 */
function statusLabel(grant: PendingGrant): keyof typeof STATUS_BADGE_VARIANT {
  if (grant.status === "claimed") return "Claimed";
  if (grant.status === "revoked") return "Revoked";
  return grant.expires_at && new Date(grant.expires_at) <= new Date()
    ? "Expired"
    : "Pending";
}

function statusBadge(grant: PendingGrant) {
  const label = statusLabel(grant);
  return <Badge variant={STATUS_BADGE_VARIANT[label]}>{label}</Badge>;
}

export function PendingAccessSection({
  grants,
  availableRoles,
}: {
  grants: PendingGrant[];
  availableRoles: PortalRoleOption[];
}) {
  const router = useRouter();
  // A grant carries the role's *name*; its wording is the tenant's (#910).
  const roleLabels = useMemo(
    () => roleLabelMap(availableRoles),
    [availableRoles],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<PendingGrant | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    grant: PendingGrant;
    link: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const stagedEmail = email;
    startTransition(async () => {
      await runAction(() => createPendingGrantAction(email, role, name), {
        success: `Access staged for ${stagedEmail}.`,
        onError: setError,
        onSuccess: () => {
          setEmail("");
          setName("");
          setRole("");
          router.refresh();
        },
      });
    });
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    setError(null);
    const target = revokeTarget;
    startTransition(async () => {
      await runAction(() => revokePendingGrantAction(target.id), {
        success: `Pending access for ${target.email} revoked.`,
        onError: (message) => {
          setRevokeTarget(null);
          setError(message);
        },
        onSuccess: () => {
          setRevokeTarget(null);
          router.refresh();
        },
      });
    });
  }

  // Stable, so the column list below only rebuilds when something it
  // actually renders differently changes.
  const handleInvite = useCallback(
    (grant: PendingGrant) => {
      setError(null);
      startTransition(async () => {
        const result = await createInviteLinkAction(grant.id);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setInviteResult({ grant, link: result.link });
        router.refresh();
      });
    },
    [router],
  );

  async function handleCopyLink() {
    if (!inviteResult) return;
    await navigator.clipboard.writeText(inviteResult.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const columns = useMemo<PortalDataTableColumn<PendingGrant>[]>(
    () => [
      {
        key: "email",
        label: "Email",
        // The cell falls back to the email when no name was staged, so the
        // sort follows the same rule rather than ordering on a blank name.
        sortValue: (grant) => grant.name ?? grant.email,
        cellClassName: "max-w-xs font-medium",
        render: (grant) => (
          <span className="block truncate" title={grant.name ?? grant.email}>
            {grant.name ?? grant.email}
          </span>
        ),
      },
      {
        key: "role",
        label: "Role",
        sortValue: (grant) => formatRoleLabel(grant.roles.name, roleLabels),
        render: (grant) => formatRoleLabel(grant.roles.name, roleLabels),
      },
      {
        key: "status",
        label: "Status",
        sortValue: (grant) => statusLabel(grant),
        render: (grant) => statusBadge(grant),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (grant) =>
          grant.status === "pending" && (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isPending}
                focusableWhenDisabled
                onClick={() => handleInvite(grant)}
              >
                {grant.invited_at ? "Resend link" : "Invite"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isPending}
                focusableWhenDisabled
                ref={keepFocusOnRemoval}
                onClick={() => setRevokeTarget(grant)}
              >
                Revoke
              </Button>
            </div>
          ),
      },
    ],
    [isPending, handleInvite, roleLabels],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Pending access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="flex-1 min-w-48">
              <Input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="flex-1 min-w-40">
              <Input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Select
              value={role}
              onValueChange={(value) => setRole(value ?? "")}
            >
              <SelectTrigger className="h-9 w-40" aria-label="Grant role">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((option) => (
                  <SelectItem key={option.id} value={option.name}>
                    {roleDisplayName(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="submit"
              disabled={!email.trim() || !role || isPending}
            >
              Stage access
            </Button>
          </form>

          {grants.length === 0 && (
            <EmptyState
              title="No pending access staged"
              description="Enter an email and role above and choose Stage access, then share the invite link it produces."
            />
          )}
        </CardContent>

        {/* A content block of its own so the table runs to the card's edges,
            the way every other portal table does, while the form above keeps
            its padding. */}
        {grants.length > 0 && (
          <CardContent className="px-0">
            <PortalDataTable
              columns={columns}
              rows={grants}
              getRowKey={(grant) => grant.id}
              // No default sort: the query returns newest staged first, and
              // there is no created-at column to hang the arrow on, so the
              // list keeps that order until the reader picks another.
              emptyMessage="No pending access to show."
              // The card around this section is the surface already.
              shell="bare"
            />
          </CardContent>
        )}
      </Card>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(next) => !next && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke pending access?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget && (
                <>
                  {revokeTarget.name ?? revokeTarget.email} will no longer
                  receive the{" "}
                  {formatRoleLabel(revokeTarget.roles.name, roleLabels)} role
                  when they sign in.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRevoke}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Spinner /> Revoking...
                </>
              ) : (
                "Revoke"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={inviteResult !== null}
        onOpenChange={(next) => {
          if (!next) {
            setInviteResult(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Invite link for{" "}
              {inviteResult?.grant.name ?? inviteResult?.grant.email}
            </DialogTitle>
            <DialogDescription>
              No email is sent automatically — copy this link and share it with
              them directly. It expires in about an hour.
            </DialogDescription>
          </DialogHeader>
          <Input readOnly value={inviteResult?.link ?? ""} />
          <DialogFooter>
            <Button type="button" onClick={handleCopyLink}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
