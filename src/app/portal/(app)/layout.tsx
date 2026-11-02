import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_DESTINATION,
  safePortalDestination,
} from "@/lib/auth/next-destination";
import { PORTAL_PATH_HEADER } from "@/proxy";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { hasNoRole, isEventGuest } from "@/lib/auth/event-access";
import {
  getAccessManagementAttentionSummary,
  getCalendarCoverageReminderSummary,
  getLegalDriftSummary,
  getConductAcknowledgementSummary,
  getOpsInboxSummary,
  getPendingApprovalsSummary,
} from "@/lib/portal/attention-items";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandStyle } from "@/components/brand-style";
import { PortalHelpProvider } from "./help/help-context";
import { ensureCurrentPerson } from "@/lib/auth/current-person";
import {
  currentTenant,
  decideHostTenant,
  getTenantContext,
  isDemoTenant,
} from "@/lib/portal/tenants";
import { deviceClass } from "@/lib/portal/device";
import { PortalDeviceProvider } from "@/lib/portal/device-context";
import { getTenantBranding } from "@/lib/tenant-branding";
import { surfaceAtRoot } from "@/lib/pwa/host";
import { serviceWorkerScope } from "@/lib/pwa/service-worker";
import { getPortalVocabulary } from "@/lib/tenant-person-roles";
import { ensureMyOnboarding } from "@/lib/portal/onboarding";
import { personDisplayName } from "@/lib/format";
import { ChooseTenant } from "./choose-tenant";
import { NoTenant } from "./no-tenant";
import { WrongOrganization } from "./wrong-organization";
import { CURRENT_RELEASE, RELEASE_NOTES } from "./welcome/releases";
import { DeviceProbe } from "./shell/device-probe";
import { PortalShellDesktop } from "./shell/portal-shell-desktop";
import { PortalShellMobile } from "./shell/portal-shell-mobile";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The proxy stamps the requested path on the request; a layout can't see
    // it on its own. Without this, every shared portal link lands a signed-out
    // recipient on the dashboard with their destination gone.
    const requestHeaders = await headers();
    const next = safePortalDestination(requestHeaders.get(PORTAL_PATH_HEADER));
    redirect(
      next === DEFAULT_DESTINATION
        ? "/portal/login"
        : `/portal/login?next=${encodeURIComponent(next)}`,
    );
  }

  // Tenant before permissions: from #707 Phase 2, has_permission() and
  // my_permissions() answer for current_tenant_id(), so the two states where
  // that is null -- no membership, or several and no choice yet -- would
  // otherwise read as "no access" and bounce a legitimate account to the
  // login screen.
  //
  // Both branches act only when the read actually succeeded. A failed one
  // also comes back with no tenants, and telling a legitimate member that they
  // were never added to an organization -- with nothing to do but sign out --
  // would turn a transient database error into a lockout.
  const tenantContext = await getTenantContext(supabase);
  if (tenantContext.resolved && tenantContext.tenants.length === 0) {
    // Two different people arrive with no tenant, and this used to be only
    // one of them: until #1191 reading the context also *joined* a
    // membership-less account to the host's tenant, so the only way to get
    // here was to hold a membership in an organization that had gone
    // inactive. Now a constituent with an account on the public site (#1161)
    // can reach it too, just by opening /portal, and NoTenant is the wrong
    // answer for them -- it is addressed to someone waiting on an invitation,
    // and its way out is a sign-out they did not ask for. Send them to the
    // refusal built for exactly this: "Portal access not granted yet", with a
    // banner naming the account and a local-scope sign-out that leaves their
    // session on the public site alone.
    if (!tenantContext.hasMembership) {
      redirect("/portal/login?error=no_access");
    }
    return <NoTenant />;
  }

  // One host, one tenant (#956). Ordering is load-bearing in both directions:
  // NoTenant above explains "member of nothing" better than this can, and
  // ChooseTenant below would loop forever on a host whose tenant the account
  // is not in -- see decideHostTenant's own comment.
  const hostDecision = decideHostTenant(tenantContext);
  if (hostDecision.kind === "refuse") {
    return (
      <WrongOrganization
        hostTenantName={hostDecision.hostTenant.name}
        tenants={tenantContext.tenants}
      />
    );
  }
  if (hostDecision.kind === "align") {
    // The selection, not the host, is what current_tenant_id() answers from --
    // and it is what storage.objects' policies answer from too, which is why
    // the host is applied by writing it here rather than by teaching
    // current_tenant_id() to read the request header. PostgREST would follow
    // the header and storage-api, which never sees it, would not; a session
    // has to have one tenant, not two.
    const { error } = await supabase.rpc("set_current_tenant", {
      p_tenant_id: hostDecision.hostTenant.id,
    });
    // Only redirect on success. A failed write with a redirect is an infinite
    // loop, and this account is a member either way -- serving them the
    // portal they already had beats bouncing them forever over a blip.
    if (!error) {
      // Re-enter rather than re-read: a layout and the page beneath it render
      // in parallel, so the page's own queries can be in flight before the
      // write above lands. Only a fresh request guarantees the whole tree is
      // scoped to the tenant this host is for.
      const requestHeaders = await headers();
      redirect(safePortalDestination(requestHeaders.get(PORTAL_PATH_HEADER)));
    }
  }

  if (
    hostDecision.kind === "unenforced" &&
    tenantContext.resolved &&
    tenantContext.tenants.length > 1 &&
    tenantContext.currentTenantId === null
  ) {
    return <ChooseTenant tenants={tenantContext.tenants} />;
  }

  const permissions = await getCurrentUserPermissions(supabase);
  // A guest holds no role, only per-event grants (#1688). They get the portal
  // with Events alone; an account with neither is refused as before.
  const guest = await isEventGuest(supabase, permissions);
  if (hasNoRole(permissions) && !guest) {
    redirect("/portal/login?error=no_access");
  }

  const canSeeExpenseApprovals = hasPermission(
    permissions,
    "finance_approvals",
    "manage",
  );
  const canSeeReimbursementApprovals = hasPermission(
    permissions,
    "reimbursement_approvals",
    "manage",
  );
  const canSeeVolunteerApplications = hasPermission(
    permissions,
    "volunteers",
    "view",
  );
  const canSeeContactMessages = hasPermission(
    permissions,
    "communications",
    "view",
  );
  const canSeeEventCheckins = hasPermission(permissions, "events", "view");
  const canSeeArtworkSubmissions = hasPermission(
    permissions,
    "artwork_submissions",
    "view",
  );
  const canSeeGearRequests = hasPermission(permissions, "inventory", "view");
  // Its own resource, and one that carries the constituent_accounts module
  // gate with it -- so this is false for everyone on a tenant without the
  // constituent area (#1162).
  const canSeePersonClaims = hasPermission(
    permissions,
    "constituent_claims",
    "view",
  );
  // The same permission the ledger's own reader uses. A volunteer coordinator
  // who can see hours can see the ones waiting to become hours (#1165).
  const canSeeVolunteerHourSubmissions = hasPermission(
    permissions,
    "volunteers",
    "view",
  );
  const canManageContentCalendar = hasPermission(
    permissions,
    "content_calendar",
    "manage",
  );
  const canSeeAccessManagement = hasPermission(
    permissions,
    "access_management_assets",
    "view",
  );
  // The same permission the Site Content editor checks. Almost nobody in a
  // tenant holds it, and almost nobody should pay for the drift reads (#1292).
  const canManageSiteContent = hasPermission(
    permissions,
    "site_content",
    "manage",
  );

  // The intake role, not the reviewers (#687). Almost nobody in a tenant holds
  // it, so the conduct reads below are skipped for almost every render.
  const canManageConductReports = hasPermission(
    permissions,
    "conduct_reports",
    "manage",
  );

  // These reads are independent of each other, and this layout re-runs on
  // every portal navigation -- including every filter submit, which is a full
  // document navigation. Awaiting them one at a time put seven round trips on
  // the critical path of literally every interaction. Only the content-work
  // summary has a dependency (it needs the current person's id), so it chains
  // off that promise rather than forcing a second wave for everything.
  //
  // Also provisions a people row for this account on first sign-in: every
  // owner column in the portal references public.people, so a portal user
  // without one can't be assigned anything.
  const currentPersonPromise = ensureCurrentPerson(supabase);
  const [
    currentPerson,
    onboarding,
    pendingApprovals,
    opsInbox,
    calendarCoverageReminder,
    accessManagementAlerts,
    legalDrift,
    conductAcknowledgements,
  ] = await Promise.all([
    currentPersonPromise,
    // Records this account's first arrival and tells us what it has already
    // been shown. No-ops after the first call.
    ensureMyOnboarding(supabase),
    canSeeExpenseApprovals || canSeeReimbursementApprovals
      ? getPendingApprovalsSummary(supabase, {
          canSeeExpenseApprovals,
          canSeeReimbursementApprovals,
        })
      : { items: [] },
    canSeeVolunteerApplications ||
    canSeeContactMessages ||
    canSeeEventCheckins ||
    canSeeArtworkSubmissions ||
    canSeeGearRequests ||
    canSeePersonClaims ||
    canSeeVolunteerHourSubmissions
      ? getOpsInboxSummary(supabase, {
          canSeeVolunteerApplications,
          canSeeContactMessages,
          canSeeEventCheckins,
          canSeeArtworkSubmissions,
          canSeeGearRequests,
          canSeePersonClaims,
          canSeeVolunteerHourSubmissions,
        })
      : { items: [] },
    getCalendarCoverageReminderSummary(supabase, { canManageContentCalendar }),
    getAccessManagementAttentionSummary(supabase, { canSeeAccessManagement }),
    getLegalDriftSummary(supabase, { canManageSiteContent }),
    getConductAcknowledgementSummary(supabase, { canManageConductReports }),
  ]);

  const welcomeOwed =
    onboarding !== null && onboarding.welcomeCompletedAt === null;
  // Release notes wait their turn: a brand-new user gets the introduction, not
  // a changelog. They also never show at all for a release with nothing to say
  // -- an empty or stale modal is worse than no modal.
  const whatsNewOwed =
    onboarding !== null &&
    !welcomeOwed &&
    RELEASE_NOTES.length > 0 &&
    (onboarding.lastReleaseSeen === null ||
      onboarding.lastReleaseSeen < CURRENT_RELEASE);

  const attentionItems = [
    ...pendingApprovals.items,
    ...opsInbox.items,
    ...calendarCoverageReminder.items,
    ...accessManagementAlerts.items,
    ...legalDrift.items,
    ...conductAcknowledgements.items,
  ];

  // Same display rule as every other person in the portal, so a preferred
  // name set at /portal/account shows up here too.
  const displayName = personDisplayName(
    {
      preferred_name: currentPerson?.preferred_name,
      name:
        currentPerson?.name ??
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined),
      email: user.email,
    },
    user.email ?? "",
  );

  // One vocabulary for the whole shell: what this organization calls what it
  // lends (#896) and what it calls the people it works with (#911). The nav
  // tree, the command palette and the breadcrumbs all hold templates and none
  // of them should have to know which setting a word came from.
  const [branding, lexicon] = await Promise.all([
    getTenantBranding(supabase),
    getPortalVocabulary(supabase),
  ]);

  const shellProps = {
    // Decided here rather than in the registrar: the server is what knows the
    // request host, and a client that re-derived it would be a second copy of
    // the host rule the manifest's `scope` already follows (#1171).
    serviceWorkerScope: serviceWorkerScope(
      "portal",
      surfaceAtRoot("portal", (await headers()).get("host") ?? ""),
    ),
    permissions,
    guest,
    lexicon,
    branding,
    currentPerson,
    attentionItems,
    tenantContext,
    hostPinned: hostDecision.kind !== "unenforced",
    isDemo: isDemoTenant(currentTenant(tenantContext)),
    displayName,
    welcomeOwed,
    whatsNewOwed,
    children,
  };

  // Everything above this line is the expensive part of every portal
  // navigation and deliberately does not fork -- only the returned tree does,
  // so a phone never downloads the sidebar and a desktop never downloads the
  // tab bar (#1079).
  const device = await deviceClass();

  return (
    <TooltipProvider>
      {/* The tenant's palette, not just its logo. getTenantBranding()'s own
          comment has said "the outer portal layout applies it" since #707
          Phase 4, but only the logo was ever read here -- so a tenant's portal
          rendered in the stylesheet's colours while its public site rendered
          in its own. Harmless while the stylesheet's colours *were* Chatter
          Snow's; not once they are the platform's neutral default (#795 Phase
          3), which would leave every tenant a grey portal. */}
      <BrandStyle branding={branding} />
      {/* Above the fork, so both shells and everything they render can ask
          (#1115). A form's own component almost never knows what it is being
          rendered on, and `deviceClass()` is a server function it cannot call
          -- see the note in `@/lib/portal/device-context`. */}
      <PortalDeviceProvider device={device}>
        <PortalHelpProvider>
          {device === "mobile" ? (
            <PortalShellMobile {...shellProps} />
          ) : (
            <PortalShellDesktop {...shellProps} />
          )}
        </PortalHelpProvider>
      </PortalDeviceProvider>
      {/* Corrects the shell on the next request when the user-agent got the
          viewport wrong -- a phone in desktop mode, or a narrow window. */}
      <DeviceProbe device={device} />
    </TooltipProvider>
  );
}
