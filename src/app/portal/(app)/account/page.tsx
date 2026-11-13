import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteLink } from "@/components/portal/public-site-link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ensureCurrentPerson } from "@/lib/auth/current-person";
import { personDisplayName } from "@/lib/format";
import { AccountForm } from "./account-form";
import { ReplayTourButton } from "./replay-tour-button";
import { NotificationPreferences } from "./notification-preferences";
import { NotificationEmailForm } from "./notification-email-form";
import { NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { getMyNotificationPreferences } from "@/lib/notifications/preferences";
import {
  getCurrentUserPermissions,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { documentsInForce, getLegalPublication } from "@/lib/legal-publication";

export const metadata: Metadata = {
  title: "My Account",
};

/**
 * Deliberately has no requirePermission guard: this page only ever shows and
 * edits the signed-in user's own record, so every portal user may reach it.
 * The (app) layout already handles the signed-out redirect and the
 * no-permissions-at-all case.
 */
export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const person = await ensureCurrentPerson(supabase);

  // Filtered to this person explicitly, not left to the select policy: that
  // policy also admits administration:manage, so an administrator reading the
  // table unfiltered gets the whole tenant's rows (#1043).
  const [enabledByKind, orgEmailEnabled, permissions, legalPublication] =
    await Promise.all([
      getMyNotificationPreferences(supabase, person?.person_id ?? null),
      getOrgEmailEnabled(supabase),
      getCurrentUserPermissions(supabase),
      // Only what this organization serves (#687): a document it has not
      // adopted 404s (#859). `getLegalPublication` rather than the tenant
      // reader, because it is the one the routes' own gate asks, and because
      // `app_settings`' policy would show most members the privacy policy
      // alone. Here rather than in the sidebar footer (#1392): a footnote
      // between My Account and Log out split the two account rows.
      getLegalPublication(supabase),
    ]);
  const policies = documentsInForce(legalPublication);

  // Some kinds only exist for the people who own the queue they report on
  // (#742). Showing a volunteer a "New volunteer applications" switch would be
  // offering them a setting that can never change anything -- the sender
  // resolves recipients from the same permission, so the toggle would be inert
  // either way round.
  const kinds = NOTIFICATION_KINDS.filter(({ requires }) => {
    if (!requires) return true;
    return hasAnyPermission(
      permissions,
      requires.resources.map((resource) => ({
        resource,
        level: requires.level,
      })),
    );
  });

  // The org-wide switch is one of two places "notifications" means something
  // (#950), and this page is the other. Named only for a reader who can
  // actually open it: the same pair the system-settings layout admits, since
  // a board member holds only the second.
  const canReachOrgNotifications = hasAnyPermission(permissions, [
    { resource: "administration", level: "manage" },
    { resource: "system_settings", level: "manage" },
  ]);

  const fallbackName = personDisplayName(
    {
      name:
        person?.name ??
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined),
      email: user.email,
    },
    user.email ?? "",
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          My Account
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      {/* Notifications are the one long list here, so they take the wide
          column; the short, rarely-touched blocks sit beside them. DOM order
          is the phone's (and the tab order): profile, notifications, the
          rest. The last row takes the slack so the side cards stay packed. */}
      <div className="mt-6 grid max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_auto_1fr]">
        <Card className="lg:col-start-2">
          <CardContent className="space-y-4">
            <div>
              <p className="app-eyebrow">Signed in as</p>
              <p className="text-sm font-medium">{user.email}</p>
            </div>
            <AccountForm
              preferredName={person?.preferred_name ?? null}
              pronouns={person?.pronouns ?? null}
              fallbackName={fallbackName}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-start-1 lg:row-span-3 lg:row-start-1">
          <CardContent className="space-y-4">
            <div>
              <p className="app-eyebrow">Email notifications</p>
              <p className="app-muted mt-1 text-sm">
                Nothing is sent unless you turn it on here.
                {canReachOrgNotifications && (
                  <>
                    {" "}
                    Which emails this organization sends at all is set in{" "}
                    <Link
                      href="/portal/administration/organization-settings?tab=notifications"
                      className="underline underline-offset-4"
                    >
                      Organization Settings &rarr; Notifications
                    </Link>
                    , and that switch overrides every choice below.
                  </>
                )}
              </p>
            </div>
            <NotificationEmailForm
              notificationEmail={person?.notification_email ?? null}
              pendingEmail={person?.notification_email_pending ?? null}
              pendingExpiresAt={person?.notification_email_expires_at ?? null}
              signInEmail={user.email ?? ""}
              orgEmailEnabled={orgEmailEnabled}
            />
            <Separator />
            <NotificationPreferences
              kinds={kinds}
              enabledByKind={enabledByKind}
              orgEmailEnabled={orgEmailEnabled}
            />
          </CardContent>
        </Card>

        {policies.length > 0 && (
          <Card className="lg:col-start-2">
            <CardContent className="space-y-3">
              <div>
                <p className="app-eyebrow">Policies</p>
                <p className="app-muted mt-1 text-sm">
                  What this organization has published on its public site.
                </p>
              </div>
              <ul className="space-y-1 text-sm">
                {policies.map((document) => (
                  <li key={document.key}>
                    <PublicSiteLink
                      path={document.route}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${document.label} (opens in new tab)`}
                      className="underline underline-offset-4"
                    >
                      {document.label}
                    </PublicSiteLink>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-start-2">
          <CardContent className="space-y-4">
            <div>
              <p className="app-eyebrow">Portal introduction</p>
              <p className="app-muted mt-1 text-sm">
                A short walkthrough of the portal basics — the sidebar, the help
                button, and the notifications bell.
              </p>
            </div>
            <ReplayTourButton />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
