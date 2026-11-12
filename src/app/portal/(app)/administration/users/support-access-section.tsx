"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
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
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { Spinner } from "@/components/ui/spinner";
import {
  formatDateTime,
  formatRoleLabel,
  roleDisplayName,
  roleLabelMap,
} from "@/lib/format";
import {
  grantSupportAccessAction,
  revokeSupportAccessAction,
  type PortalRoleOption,
  type SupportGrant,
} from "./actions";
import { SUPPORT_DURATIONS } from "./users-shared";

function isExpired(grant: SupportGrant): boolean {
  return Boolean(grant.expires_at && new Date(grant.expires_at) <= new Date());
}

/**
 * Time-boxed platform-staff access to this organization (#707 Phase 4).
 *
 * The organization grants it, sees who holds it and until when, and can end
 * it early. Nothing here is available to a caller whose own membership is a
 * support grant -- support staff cannot extend their own access or bring in
 * more -- which is why the form is hidden rather than merely refused.
 */
export function SupportAccessSection({
  grants,
  availableRoles,
  canManage,
}: {
  grants: SupportGrant[];
  availableRoles: PortalRoleOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  // A grant carries role *names*; their wording is the tenant's (#910).
  const roleLabels = useMemo(
    () => roleLabelMap(availableRoles),
    [availableRoles],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");
  const [role, setRole] = useState("admin");
  const [revokeTarget, setRevokeTarget] = useState<SupportGrant | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const grantedEmail = email;
    startTransition(async () => {
      await runAction(
        () => grantSupportAccessAction(email, reason, Number(days), role),
        {
          success: `Support access granted to ${grantedEmail}.`,
          onError: setError,
          onSuccess: () => {
            setEmail("");
            setReason("");
            router.refresh();
          },
        },
      );
    });
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    setError(null);
    const target = revokeTarget;
    startTransition(async () => {
      await runAction(() => revokeSupportAccessAction(target.id), {
        success: `Support access for ${target.email ?? "this account"} ended.`,
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

  const columns = useMemo<PortalDataTableColumn<SupportGrant>[]>(
    () => [
      {
        key: "email",
        label: "Account",
        sortValue: (grant) => grant.email ?? "",
        cellClassName: "max-w-xs font-medium",
        render: (grant) => (
          <span className="block truncate" title={grant.email ?? undefined}>
            {grant.email}
          </span>
        ),
      },
      {
        key: "reason",
        label: "Reason",
        hideBelow: "md",
        cellClassName: "max-w-sm",
        render: (grant) => (
          <span className="block truncate" title={grant.reason ?? undefined}>
            {grant.reason}
          </span>
        ),
      },
      {
        key: "roles",
        label: "Role",
        render: (grant) =>
          grant.roles.map((r) => formatRoleLabel(r, roleLabels)).join(", "),
      },
      {
        key: "expires",
        label: "Until",
        sortValue: (grant) => grant.expires_at ?? "",
        render: (grant) =>
          isExpired(grant) ? (
            <Badge variant="outline">Expired</Badge>
          ) : (
            <span className="whitespace-nowrap">
              {grant.expires_at ? formatDateTime(grant.expires_at) : "—"}
            </span>
          ),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (grant) =>
          canManage && (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isPending}
                focusableWhenDisabled
                onClick={() => setRevokeTarget(grant)}
              >
                {isExpired(grant) ? "Remove" : "End access"}
              </Button>
            </div>
          ),
      },
    ],
    [canManage, isPending, roleLabels],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Support access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            Give platform support staff time-limited access to this
            organization. Access ends on its own at the expiry and can be ended
            here at any time; every grant is recorded in the audit log.
          </p>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {canManage ? (
            <form
              onSubmit={handleSubmit}
              className="flex flex-wrap items-end gap-2"
            >
              <div className="min-w-48 flex-1">
                <Input
                  type="email"
                  placeholder="support@example.com"
                  aria-label="Support account email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="min-w-48 flex-1">
                <Input
                  type="text"
                  placeholder="Reason"
                  aria-label="Reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                />
              </div>
              <Select value={days} onValueChange={(v) => setDays(v ?? "7")}>
                <SelectTrigger className="h-9 w-32" aria-label="Duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_DURATIONS.map((option) => (
                    <SelectItem key={option.days} value={String(option.days)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={role} onValueChange={(v) => setRole(v ?? "admin")}>
                <SelectTrigger className="h-9 w-40" aria-label="Role">
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
                disabled={!email.trim() || !reason.trim() || !role || isPending}
              >
                Grant access
              </Button>
            </form>
          ) : (
            <p className="app-muted text-sm">
              Your own access here is a support grant, so support access can
              only be changed by a member of this organization.
            </p>
          )}

          {grants.length === 0 && (
            <EmptyState
              title="No support access granted"
              description="Nobody outside this organization can see its data right now."
            />
          )}
        </CardContent>

        {grants.length > 0 && (
          <CardContent className="px-0">
            <PortalDataTable
              columns={columns}
              rows={grants}
              getRowKey={(grant) => grant.id}
              defaultSort={{ key: "expires", dir: "desc" }}
              emptyMessage="No support access to show."
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
            <AlertDialogTitle>End support access?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.email ?? "This account"} loses every role and the
              membership it was given here, from its next request onward.
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
                  <Spinner /> Ending...
                </>
              ) : (
                "End access"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
