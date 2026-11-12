"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pencil, X } from "lucide-react";
import {
  linkPersonToAuthUserAction,
  unlinkPersonAccountAction,
  updatePersonNotificationEmailAction,
} from "../actions";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/portal/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import {
  formatInstantDate,
  formatRoleLabel,
  type RoleLabels,
} from "@/lib/format";
import type { PersonAccount, LinkableAccount } from "./person-account";

/**
 * The account behind a directory record, and the two very different things that
 * can mean (#1192).
 *
 * Most of what is here comes from `list_portal_users()`, which is gated on
 * `is_admin()`, so an administrator sees roles, status and dates. A claims
 * reviewer who is not an administrator sees the `directory` shape instead
 * (#1193): that an account exists, what it signs in as, and an Unlink -- which
 * is the whole of what reviewing claims gives them authority over. A reader
 * with neither permission sees no card at all; knowing an account exists is not
 * the same as being shown its email.
 */
export function AccountCard({
  personId,
  personName,
  account,
  hasPortalAccess,
  linkable,
  roleLabels,
  notificationEmail,
  notificationEmailPending,
  canManagePerson,
  canUnlinkAccount,
}: {
  personId: string;
  /** Named in the unlink confirmation, per `ConfirmDeleteButton`'s rule. */
  personName: string | null;
  account: PersonAccount | null;
  /** Whether that account holds a role in this tenant (#1192). */
  hasPortalAccess: boolean;
  linkable: LinkableAccount[];
  /** name -> the tenant's wording, for the role names on the account (#910). */
  roleLabels: RoleLabels;
  /** Their delivery override, null when mail goes to the sign-in address. */
  notificationEmail: string | null;
  /** Asked for and not yet confirmed; nothing is sent there yet (#1049). */
  notificationEmailPending: string | null;
  /** people:manage, which the override is written under -- see the action. */
  canManagePerson: boolean;
  /** constituent_claims:manage, which the unlink is written under (#1193). */
  canUnlinkAccount: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);

  function link(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkPersonToAuthUserAction(personId, userId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function unlink() {
    setError(null);
    startTransition(async () => {
      const result = await unlinkPersonAccountAction(personId);
      if ("error" in result) {
        setConfirmingUnlink(false);
        setError(result.error);
        return;
      }
      setConfirmingUnlink(false);
      router.refresh();
    });
  }

  // Only a website account, and only for somebody who reviews claims. A staff
  // account's link is what the portal identifies them by, and the RPC refuses
  // it outright -- so the button is absent rather than present and failing.
  const canUnlink = canUnlinkAccount && !!account && !hasPortalAccess;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Account
        </CardTitle>
      </CardHeader>
      <CardContent>
        {account ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {hasPortalAccess ? "Portal access" : "Website account"}
              </Badge>
              {/* Only Administration's read knows whether an account is
                  suspended or which roles it holds, so the directory shape says
                  neither rather than implying "Active". */}
              {account.source === "administration" && (
                <>
                  {account.deactivated_at ? (
                    <Badge variant="destructive">Deactivated</Badge>
                  ) : (
                    <Badge variant="secondary">Active</Badge>
                  )}
                  {account.roles.map((role) => (
                    <Badge key={role} variant="outline">
                      {formatRoleLabel(role, roleLabels)}
                    </Badge>
                  ))}
                </>
              )}
            </div>
            <p>
              <span className="app-muted">Sign-in email:</span>{" "}
              {account.email ?? "—"}
            </p>
            <NotificationEmailRow
              personId={personId}
              signInEmail={account.email}
              value={notificationEmail}
              pending={notificationEmailPending}
              canManage={canManagePerson}
            />
            {account.created_at && (
              <p>
                <span className="app-muted">Account created:</span>{" "}
                {formatInstantDate(account.created_at)}
              </p>
            )}
            {account.deactivated_at && (
              <p>
                <span className="app-muted">Deactivated:</span>{" "}
                {formatInstantDate(account.deactivated_at)}
              </p>
            )}
            {account.source === "administration" && (
              <p>
                <Link
                  href="/portal/administration/users"
                  className="underline underline-offset-2"
                >
                  Manage in Administration › Users
                </Link>
              </p>
            )}
            {canUnlink && (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  focusableWhenDisabled
                  onClick={() => setConfirmingUnlink(true)}
                >
                  Unlink account
                </Button>
              </div>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <EmptyState
              className="py-4"
              title="No account linked"
              description={
                linkable.length > 0
                  ? "An account signs in with a matching email but has never been linked to this record."
                  : "This person has no portal login. One is linked automatically the first time they sign in with a matching email."
              }
            />
            {linkable.map((candidate) => (
              <div
                key={candidate.user_id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="app-muted">{candidate.email}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  focusableWhenDisabled
                  onClick={() => link(candidate.user_id)}
                >
                  {isPending ? (
                    <>
                      <Spinner /> Linking...
                    </>
                  ) : (
                    "Link portal account"
                  )}
                </Button>
              </div>
            ))}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmingUnlink} onOpenChange={setConfirmingUnlink}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unlink this account from {personName ?? "this record"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {account?.email ? `${account.email} ` : "This account "}
              will stop seeing this record on the website: their own events,
              volunteering, giving and gear at /my. The account itself is not
              deleted, and they can ask to be linked again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                unlink();
              }}
            >
              {isPending ? (
                <>
                  <Spinner /> Unlinking...
                </>
              ) : (
                "Unlink account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/**
 * The address this person's portal email is delivered to (#1042), edited in
 * place beside the address they sign in with -- the one place the distinction
 * between the two is legible without explaining it.
 *
 * Read-only without people:manage, which is the level the action writes under.
 * The person can always set it for themselves at /portal/account, so an admin
 * who cannot edit it here is not a dead end for them.
 */
function NotificationEmailRow({
  personId,
  signInEmail,
  value,
  pending,
  canManage,
}: {
  personId: string;
  /** Shown as the fallback, since an empty override delivers there. */
  signInEmail: string | null;
  value: string | null;
  pending: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function start() {
    setDraft(value ?? "");
    setError(null);
    setIsEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      await runAction(
        () => updatePersonNotificationEmailAction(personId, draft),
        {
          // An admin can ask on somebody's behalf but cannot finish for them:
          // the link goes to the address being claimed (#1049), so the receipt
          // has to say that rather than report a switch that has not happened.
          success: (result) =>
            result.outcome === "pending"
              ? `A confirmation link was sent to ${result.pendingEmail}. Nothing goes there until it is followed.`
              : draft.trim()
                ? `Notifications will go to ${draft.trim()}.`
                : "Notifications will go to the sign-in address.",
          onError: setError,
          onSuccess: () => {
            setIsEditing(false);
            router.refresh();
          },
        },
      );
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="app-muted">Notifications to:</span>
        {isEditing ? (
          <>
            <Input
              autoFocus
              type="email"
              value={draft}
              disabled={isPending}
              aria-label="Notification email"
              placeholder={signInEmail ?? "name@example.org"}
              className="h-8 w-56"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setIsEditing(false);
                }
              }}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={isPending}
                    focusableWhenDisabled
                    aria-label="Save notification email"
                    onClick={save}
                  />
                }
              >
                <Check className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Save notification email</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={isPending}
                    focusableWhenDisabled
                    aria-label="Cancel editing notification email"
                    onClick={() => setIsEditing(false)}
                  />
                }
              >
                <X className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Cancel editing notification email</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <span className={value ? undefined : "app-muted"}>
              {value ?? `${signInEmail ?? "—"} (sign-in address)`}
            </span>
            {canManage && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={isPending}
                      focusableWhenDisabled
                      aria-label="Edit notification email"
                      onClick={start}
                    />
                  }
                >
                  <Pencil className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>Edit notification email</TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
      {pending && !isEditing && (
        // Said next to the address in use rather than in place of it, because
        // the two are true at the same time and the difference is the whole
        // point: asked for, and not yet receiving anything.
        <p className="app-muted text-xs">
          Waiting on {pending} — nothing is sent there until the link sent to it
          is followed.
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
