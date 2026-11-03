import type { SupabaseClient } from "@supabase/supabase-js";
import { isEventActiveToday, type EventWindow } from "@/lib/time";
import {
  getLegalAcknowledgementState,
  getLegalDocumentDrift,
} from "@/lib/legal-publication";
import { needsAcknowledgement } from "@/lib/legal-acknowledgement";
import { hasDrifted } from "@/lib/legal-surface";
import {
  acknowledgementState,
  awaitingAcknowledgement,
  getConductProcess,
} from "@/lib/conduct";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone } from "@/lib/time";
import { withUnclaimedFilter, withUnclaimedSuffix } from "@/lib/queue-claims";
import { getMissingCoverageSeriesForYear } from "@/app/portal/(app)/calendar/queries";

/**
 * How loudly an attention item should ask.
 *
 * Every count used to render in the same red destructive badge, so a pending
 * expense approval, an unread contact message and a content-calendar coverage
 * reminder were indistinguishable -- and red is the token still carrying an
 * unresolved contrast finding (#436).
 */
export type AttentionSeverity =
  /** A control gap or a missed deadline: act now. */
  | "urgent"
  /** Waiting on someone, with a deadline that hasn't passed. */
  | "attention"
  /** New work in the queue, no clock on it. */
  | "info";

export type PendingApprovalItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  severity: AttentionSeverity;
};
export type PendingApprovalsSummary = { items: PendingApprovalItem[] };

export async function getPendingApprovalsSummary(
  supabase: SupabaseClient,
  options: {
    canSeeExpenseApprovals: boolean;
    canSeeReimbursementApprovals: boolean;
  },
): Promise<PendingApprovalsSummary> {
  const items: PendingApprovalItem[] = [];

  if (options.canSeeExpenseApprovals) {
    const { data: pendingExpenseCount } = await supabase.rpc(
      "count_pending_event_expense_approvals",
    );
    const count = pendingExpenseCount ?? 0;
    if (count > 0) {
      items.push({
        key: "expense_approvals",
        label: "Expense approvals",
        count,
        href: "/portal/finance/expenses?status=submitted",
        severity: "attention",
      });
    }
  }

  if (options.canSeeReimbursementApprovals) {
    const { data: pendingReimbursementCount } = await supabase.rpc(
      "count_pending_reimbursement_approvals",
    );
    const count = pendingReimbursementCount ?? 0;
    if (count > 0) {
      items.push({
        key: "reimbursement_approvals",
        label: "Reimbursement approvals",
        count,
        href: "/portal/finance/reimbursements?status=submitted",
        severity: "attention",
      });
    }
  }

  return { items };
}

/**
 * Legal documents that no longer describe what the site collects (#1292).
 *
 * The Legal documents panel makes drift knowable; this is what makes it
 * *known*, because nobody visits that panel on a schedule and nobody re-reads
 * their own privacy policy unprompted. A document published in March never
 * mentions the open calls switched on in June, and only the organization can
 * rewrite it.
 *
 * `attention`, not `urgent`: nothing is broken, the text may well have been
 * through counsel, and a document somebody signed off should not be shouted at
 * in red. Documents published before the fingerprint existed are left out
 * entirely -- "unknown" is not a finding, and counting it would have handed
 * every tenant that has ever published an alert on the day this shipped.
 *
 * Gated on `site_content:manage`, the same permission the editor checks, so
 * the reads behind it are skipped for the overwhelming majority of a tenant's
 * members -- this runs in the portal layout, on every portal page render.
 *
 * #1321 folded the other half of the same question in here rather than adding
 * a second item beside it. A document in force is either the tenant's own text,
 * which can stop describing the site, or the platform's, which cannot drift but
 * can have gone unread or been rewritten underneath them; the administrator's
 * job in both cases is to open the document and read it, and one item saying
 * "two legal documents to review" is the honest count of that job. Two items,
 * one per mechanism, would have made the portal's plumbing the organizing
 * principle of its own nag list. The two sets cannot overlap -- see
 * `getLegalAcknowledgementState` -- so the counts simply add.
 */
export async function getLegalDriftSummary(
  supabase: SupabaseClient,
  options: { canManageSiteContent: boolean },
): Promise<PendingApprovalsSummary> {
  if (!options.canManageSiteContent) return { items: [] };

  const [drift, acknowledgement] = await Promise.all([
    getLegalDocumentDrift(supabase),
    getLegalAcknowledgementState(supabase),
  ]);
  const count =
    Object.values(drift).filter(hasDrifted).length +
    Object.values(acknowledgement).filter(needsAcknowledgement).length;
  if (count === 0) return { items: [] };

  return {
    items: [
      {
        key: "legal_documents_drift",
        label: `${count} legal document${count === 1 ? "" : "s"} to review`,
        count,
        href: "/portal/website/legal-documents",
        severity: "attention",
      },
    ],
  };
}

/**
 * Conduct reports past, or about to pass, the organization's own
 * acknowledgement commitment (#687).
 *
 * The one thing in this feature that had to reach outside its own section.
 * "The 5-day clock is the kind of thing that is missed quietly, over a
 * holiday, with nobody realizing", and a clock that is only visible on a page
 * nobody opens unprompted is not a clock.
 *
 * Gated on `conduct_reports:manage` -- the intake role, not the reviewers.
 * That is narrower than it needs to be for the count to be correct, and
 * deliberately so: an item in the sidebar saying how many reports are
 * outstanding is a fact about the organization that the people holding intake
 * are the right ones to carry. The label is a count and nothing else; nothing
 * about any case reaches a surface its own row-level policy would not admit.
 *
 * Returns nothing at all for a tenant that publishes no acknowledgement
 * commitment, which is most of them. The platform has no deadline to be late
 * against.
 *
 * `urgent` once something is genuinely overdue and `attention` while the
 * window is open: unlike a drifting privacy policy, this one is a missed
 * promise to a person who reported something.
 */
export async function getConductAcknowledgementSummary(
  supabase: SupabaseClient,
  options: { canManageConductReports: boolean },
): Promise<PendingApprovalsSummary> {
  if (!options.canManageConductReports) return { items: [] };

  const process = await getConductProcess(supabase);
  if (process.acknowledgementDays === null) return { items: [] };

  const { data } = await supabase
    .from("conduct_reports")
    .select("received_on, acknowledged_on")
    .is("acknowledged_on", null)
    .neq("status", "closed");

  const zone = await getOrgTimeZone(supabase);
  const today = todayInZone(zone);
  const states = (data ?? [])
    .map((row) =>
      acknowledgementState(
        {
          received_on: String(row.received_on),
          acknowledged_on: null,
        },
        process,
        today,
      ),
    )
    .filter(awaitingAcknowledgement);

  if (states.length === 0) return { items: [] };
  const overdue = states.filter((state) => state.state === "overdue").length;

  return {
    items: [
      {
        key: "conduct_acknowledgements",
        label:
          overdue > 0
            ? `${overdue} conduct report${overdue === 1 ? "" : "s"} past acknowledgement`
            : `${states.length} conduct report${states.length === 1 ? "" : "s"} to acknowledge`,
        count: overdue > 0 ? overdue : states.length,
        href: "/portal/conduct",
        severity: overdue > 0 ? "urgent" : "attention",
      },
    ],
  };
}

/**
 * Coverage reminder (issue #191): flags recurring Tier 1/2 observances with
 * no instance yet for next year. Gated on "manage" (not "view", unlike the
 * other summaries here) since it's an invitation to generate/import, not
 * just informational -- showing it to view-only roles would be an
 * unfixable nag. Only surfaces from October 1 (a "does next year need
 * coverage" check is noise for the other 9 months).
 */
export async function getCalendarCoverageReminderSummary(
  supabase: SupabaseClient,
  options: { canManageContentCalendar: boolean },
  now: Date = new Date(),
): Promise<PendingApprovalsSummary> {
  if (!options.canManageContentCalendar) return { items: [] };
  if (now.getUTCMonth() < 9) return { items: [] };

  const targetYear = now.getUTCFullYear() + 1;
  const missing = await getMissingCoverageSeriesForYear(supabase, targetYear);
  if (missing.length === 0) return { items: [] };

  return {
    items: [
      {
        key: "calendar_coverage_missing",
        label: `${missing.length} recurring observance${missing.length === 1 ? "" : "s"} missing for ${targetYear}`,
        count: missing.length,
        href: "/portal/calendar/import",
        severity: "attention",
      },
    ],
  };
}

type TodaysEventRow = EventWindow & { id: string; name: string };

type QueueCounts = { total: number; unclaimed: number };

/** Items waiting in one queue, and how many of them nobody has claimed (#1668). */
async function countQueue(
  supabase: SupabaseClient,
  table: string,
  status: string,
): Promise<QueueCounts> {
  const waiting = () =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("status", status);
  const [all, unclaimed] = await Promise.all([
    waiting(),
    waiting().is("claimed_by_person_id", null),
  ]);
  return { total: all.count ?? 0, unclaimed: unclaimed.count ?? 0 };
}

function queueItem(
  key: string,
  label: string,
  href: string,
  { total, unclaimed }: QueueCounts,
): PendingApprovalItem {
  return {
    key,
    label: withUnclaimedSuffix(label, total, unclaimed),
    count: total,
    href: withUnclaimedFilter(href, total, unclaimed),
    severity: "info",
  };
}

/**
 * Ops-inbox items (issue #173): new volunteer applications, new contact
 * messages, and event registrations still awaiting check-in for events
 * happening today. Unlike getPendingApprovalsSummary these are plain
 * RLS-scoped counts (same reasoning as getContentWorkSummary in
 * home/queries.ts) since volunteer_applications/contact_messages/
 * event_registrations RLS already returns the right rows per role.
 *
 * Check-ins are scoped to "today" rather than all pending registrations --
 * every future registration is pending until its event happens, so an
 * unscoped count would always be large and not actionable.
 *
 * One item per today's event (issue #418), each deep-linking straight to
 * that event's Registrants tab -- a single item pointing at the generic
 * events list forced staff to hunt for the right event themselves, even
 * though the query already knows exactly which one(s) need attention.
 *
 * Each queue also says how many of its items nobody has claimed (#1668), and
 * its link narrows to those (`claimed=none`) when some are claimed. Check-ins
 * are worked at the door, not claimed, and keep their plain count.
 */
export async function getOpsInboxSummary(
  supabase: SupabaseClient,
  options: {
    canSeeVolunteerApplications: boolean;
    canSeeContactMessages: boolean;
    canSeeEventCheckins: boolean;
    canSeeArtworkSubmissions: boolean;
    canSeeGearRequests: boolean;
    canSeePersonClaims: boolean;
    canSeeVolunteerHourSubmissions: boolean;
  },
  nowIso: string = new Date().toISOString(),
): Promise<PendingApprovalsSummary> {
  const items: PendingApprovalItem[] = [];

  // #1032. A request sits in `new` until staff quote it, fulfil it or cancel
  // it -- so unlike a reserved item, which stays reserved for as long as the
  // hold does, the count actually goes down as the queue is worked.
  if (options.canSeeGearRequests) {
    const counts = await countQueue(supabase, "gear_requests", "new");
    if (counts.total > 0) {
      items.push(
        queueItem(
          "gear_requests_new",
          "New item requests",
          "/portal/inventory/requests?status=new",
          counts,
        ),
      );
    }
  }

  // #1162. A plain RLS-scoped count like the rest of this function: the
  // person_claims select policy already admits only constituent_claims:view
  // holders in the caller's own tenant, and that permission carries the
  // constituent_accounts module gate with it -- so on a tenant without the
  // area this is zero for everyone rather than needing a check of its own.
  if (options.canSeePersonClaims) {
    const counts = await countQueue(supabase, "person_claims", "pending");
    if (counts.total > 0) {
      items.push(
        queueItem(
          "person_claims_pending",
          "Account claims",
          "/portal/people/claims",
          counts,
        ),
      );
    }
  }

  // #1165. Hours a volunteer logged for themselves, which sit outside the
  // ledger until somebody confirms them -- so this count is the only place
  // they are visible to a staffer who is not looking for them. Plain RLS
  // scoping like the rest: the select policy on volunteer_hour_submissions
  // admits volunteers:view in the caller's own tenant.
  if (options.canSeeVolunteerHourSubmissions) {
    const counts = await countQueue(
      supabase,
      "volunteer_hour_submissions",
      "pending",
    );
    if (counts.total > 0) {
      items.push(
        queueItem(
          "volunteer_hour_submissions_pending",
          "Self-logged hours",
          "/portal/volunteers/participation",
          counts,
        ),
      );
    }
  }

  if (options.canSeeVolunteerApplications) {
    const counts = await countQueue(supabase, "volunteer_applications", "new");
    if (counts.total > 0) {
      items.push(
        queueItem(
          "volunteer_applications_new",
          "New volunteer applications",
          "/portal/volunteers/applications?status=new",
          counts,
        ),
      );
    }
  }

  if (options.canSeeContactMessages) {
    const counts = await countQueue(supabase, "contact_messages", "new");
    if (counts.total > 0) {
      items.push(
        queueItem(
          "contact_messages_new",
          "New messages",
          "/portal/communications?status=new",
          counts,
        ),
      );
    }
  }

  if (options.canSeeArtworkSubmissions) {
    // Through the RPCs rather than head counts, because it is the same number
    // the dashboard and any later report must agree on, and the permission
    // check lives inside them.
    const [{ data: pendingArtwork }, { data: unclaimedArtwork }] =
      await Promise.all([
        supabase.rpc("count_pending_artwork_submissions"),
        supabase.rpc("count_unclaimed_pending_artwork_submissions"),
      ]);
    const counts = {
      total: pendingArtwork ?? 0,
      unclaimed: unclaimedArtwork ?? 0,
    };
    if (counts.total > 0) {
      items.push(
        queueItem(
          "artwork_submissions_pending",
          "Artwork to review",
          "/portal/artwork?status=pending",
          counts,
        ),
      );
    }
  }

  if (options.canSeeEventCheckins) {
    const now = new Date(nowIso);
    const windowStart = new Date(now.getTime() - 86_400_000).toISOString();
    const windowEnd = new Date(now.getTime() + 86_400_000).toISOString();

    const { data: candidateEvents } = await supabase
      .from("events")
      .select("id, name, starts_at, ends_at, timezone")
      .eq("status", "published")
      .gte("starts_at", windowStart)
      .lte("starts_at", windowEnd);

    const todaysEvents = ((candidateEvents ?? []) as TodaysEventRow[]).filter(
      (event) => isEventActiveToday(event, now),
    );

    if (todaysEvents.length > 0) {
      const todaysEventIds = todaysEvents.map((event) => event.id);
      const { data: pendingRegistrations } = await supabase
        .from("event_registrations")
        .select("event_id")
        .in("event_id", todaysEventIds)
        .is("checked_in_at", null)
        .is("cancelled_at", null)
        // #1764. Nobody is coming for a test registration.
        .eq("is_test", false);

      const pendingCountByEvent = new Map<string, number>();
      for (const row of (pendingRegistrations ?? []) as {
        event_id: string;
      }[]) {
        pendingCountByEvent.set(
          row.event_id,
          (pendingCountByEvent.get(row.event_id) ?? 0) + 1,
        );
      }

      for (const event of todaysEvents) {
        const count = pendingCountByEvent.get(event.id) ?? 0;
        if (count > 0) {
          items.push({
            key: `event_checkins_pending_${event.id}`,
            label: `${count} awaiting check-in · ${event.name}`,
            count,
            href: `/portal/events/${event.id}?tab=registrants`,
            // People are standing at the door.
            severity: "urgent",
          });
        }
      }
    }
  }

  return { items };
}

/**
 * Access management alerts (issue #424): active assets whose review is due,
 * active critical-sensitivity assets without MFA enabled, and active assets
 * (medium sensitivity and up, per the requirement matrix -- "two
 * administrators" doesn't apply to low) with at most one active
 * owner/admin-level grant. Administrator-count tallying is done in JS
 * (same approach as getOpsInboxSummary's per-event check-in tally) rather
 * than a DB-side group-by -- the org's asset count is small (well under a
 * few dozen) per docs/technical-spec.md §17.4.
 */
export async function getAccessManagementAttentionSummary(
  supabase: SupabaseClient,
  options: { canSeeAccessManagement: boolean },
  nowIso: string = new Date().toISOString(),
): Promise<PendingApprovalsSummary> {
  if (!options.canSeeAccessManagement) return { items: [] };

  const items: PendingApprovalItem[] = [];
  const today = nowIso.slice(0, 10);

  const { count: reviewsDueCount } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .lte("next_review", today);
  if ((reviewsDueCount ?? 0) > 0) {
    items.push({
      key: "access_management_reviews_due",
      label: `${reviewsDueCount} asset review${reviewsDueCount === 1 ? "" : "s"} due`,
      count: reviewsDueCount ?? 0,
      href: "/portal/technology?filter=reviews_due",
      severity: "attention",
    });
  }

  const { count: criticalNoMfaCount } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("sensitivity", "critical")
    .neq("mfa_status", "enabled");
  if ((criticalNoMfaCount ?? 0) > 0) {
    items.push({
      key: "access_management_critical_no_mfa",
      label: `${criticalNoMfaCount} critical asset${criticalNoMfaCount === 1 ? "" : "s"} without MFA enabled`,
      count: criticalNoMfaCount ?? 0,
      href: "/portal/technology?filter=critical_no_mfa",
      severity: "urgent",
    });
  }

  const { data: assetsNeedingTwoAdmins } = await supabase
    .from("assets")
    .select("id")
    .eq("status", "active")
    .neq("sensitivity", "low");
  if (assetsNeedingTwoAdmins && assetsNeedingTwoAdmins.length > 0) {
    const assetIds = assetsNeedingTwoAdmins.map((asset) => asset.id as string);
    const { data: adminGrants } = await supabase
      .from("access_grants")
      .select("asset_id")
      .eq("status", "active")
      .in("access_level", ["owner", "admin"])
      .in("asset_id", assetIds);

    const adminCountByAsset = new Map<string, number>();
    for (const grant of (adminGrants ?? []) as { asset_id: string }[]) {
      adminCountByAsset.set(
        grant.asset_id,
        (adminCountByAsset.get(grant.asset_id) ?? 0) + 1,
      );
    }

    const singleAdministratorCount = assetIds.filter(
      (assetId) => (adminCountByAsset.get(assetId) ?? 0) <= 1,
    ).length;
    if (singleAdministratorCount > 0) {
      items.push({
        key: "access_management_single_administrator",
        label: `${singleAdministratorCount} asset${singleAdministratorCount === 1 ? "" : "s"} with only one administrator`,
        count: singleAdministratorCount,
        href: "/portal/technology?filter=single_administrator",
        severity: "urgent",
      });
    }
  }

  return { items };
}
