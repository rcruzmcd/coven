"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  deleteAccessGrantAction,
  verifyAccessGrantAction,
} from "../../actions";
import { humanize } from "../../labels";
import type { AccessGrantRow } from "@/lib/portal/access-management/types";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AccessGrantDetailsSheet } from "./access-grant-details-sheet";
import { Spinner } from "@/components/ui/spinner";
import { personDisplayName } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";
import { keepFocusOnRemoval } from "@/lib/focus-on-removal";

const STATUS_BADGE_VARIANT: Record<
  string,
  "secondary" | "outline" | "destructive"
> = {
  active: "secondary",
  revoked: "destructive",
  expired: "outline",
};

function VerifyButton({
  grantId,
  assetId,
}: {
  grantId: string;
  assetId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      focusableWhenDisabled
      onClick={() =>
        startTransition(async () => {
          await runAction(() => verifyAccessGrantAction(grantId, assetId), {
            success: "Access grant verified.",
            error: "Could not verify the access grant. Please try again.",
            onSuccess: () => router.refresh(),
          });
        })
      }
    >
      {isPending ? (
        <>
          <Spinner /> Verifying...
        </>
      ) : (
        "Verify"
      )}
    </Button>
  );
}

function DeleteGrantButton({
  grantId,
  assetId,
  personName,
}: {
  grantId: string;
  assetId: string;
  personName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      await runAction(() => deleteAccessGrantAction(grantId, assetId), {
        success: `Access for ${personName} revoked.`,
        onError: setError,
        onSuccess: () => {
          setOpen(false);
          router.refresh();
        },
      });
    });
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete grant for ${personName}`}
              ref={keepFocusOnRemoval}
              onClick={() => setOpen(true)}
            />
          }
        >
          <Trash2 />
        </TooltipTrigger>
        <TooltipContent>{`Delete grant for ${personName}`}</TooltipContent>
      </Tooltip>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this access grant?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the grant record for {personName} —
              unlike revoking, it isn&apos;t kept for audit history. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Spinner /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AccessGrantsTable({
  grants,
  assetId,
}: {
  grants: AccessGrantRow[];
  assetId: string;
}) {
  const columns = useMemo<PortalDataTableColumn<AccessGrantRow>[]>(
    () => [
      {
        key: "person",
        label: "Person",
        // On the name the cell shows, placeholder included, rather than on a
        // null the reader never sees.
        sortValue: (grant) => personDisplayName(grant.person),
        cellClassName: "font-medium",
        render: (grant) => personDisplayName(grant.person),
      },
      {
        key: "access_level",
        label: "Access level",
        // On the humanized label, which is what the cell shows.
        sortValue: (grant) => humanize(grant.access_level),
        cellClassName: "app-muted",
        render: (grant) => humanize(grant.access_level),
      },
      {
        key: "status",
        label: "Status",
        sortValue: (grant) => grant.status,
        render: (grant) => (
          <Badge
            variant={STATUS_BADGE_VARIANT[grant.status] ?? "outline"}
            className="capitalize"
          >
            {grant.status}
          </Badge>
        ),
      },
      {
        key: "granted_at",
        // ISO dates here and below, so string order is date order.
        label: "Granted",
        hideBelow: "lg",
        sortValue: (grant) => grant.granted_at,
        cellClassName: "app-muted",
        render: (grant) => grant.granted_at,
      },
      {
        key: "last_verified",
        label: "Last verified",
        hideBelow: "md",
        sortValue: (grant) => grant.last_verified,
        cellClassName: "app-muted",
        render: (grant) => grant.last_verified || "—",
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (grant) => (
          <div className="flex items-center justify-end gap-1">
            {grant.status === "active" && (
              <VerifyButton grantId={grant.id} assetId={assetId} />
            )}
            <AccessGrantDetailsSheet grant={grant} assetId={assetId} />
            <DeleteGrantButton
              grantId={grant.id}
              assetId={assetId}
              personName={grant.person?.name ?? "this person"}
            />
          </div>
        ),
      },
    ],
    [assetId],
  );

  // Distinct from the table's own empty row: nothing has been recorded for
  // this asset yet, which is a different sentence and points at Add access
  // grant.
  if (grants.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="No access grants recorded for this asset yet"
            description="Record who has access with Add access grant above."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <PortalDataTable
      columns={columns}
      rows={grants}
      getRowKey={(grant) => grant.id}
      // The query orders by status first, so the arrow starts where the list
      // already sits; ties keep the newest-granted-first order underneath it.
      defaultSort={{ key: "status", dir: "asc" }}
      emptyMessage="No access grants to show."
    />
  );
}
