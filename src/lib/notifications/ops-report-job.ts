import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverEmail } from "@/lib/notifications/deliver";
import { tenantMailContext } from "@/lib/email/identity";
import { activeTenantIds } from "@/lib/notifications/active-tenants";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { renderOpsReport } from "@/lib/notifications/ops-report-email";
import { modulesForTenant } from "@/lib/portal/modules";
import {
  OPS_REPORT_KIND,
  OPS_REPORT_RECIPIENTS_SETTING_KEY,
  UPCOMING_EVENT_WINDOW_DAYS,
  buildOpsReport,
  opsReportDay,
  opsReportDedupeKey,
  opsReportSourceGates,
  parseOpsReportRecipients,
  type OpsReportSource,
  type ShiftCoverageGap,
  type UpcomingEvent,
} from "@/lib/notifications/ops-report";

/**
 * The daily leadership ops report run (#743): read, gate, shape, record, send.
 *
 * Same division of labour as task-digest-job.ts -- the route is the doorman,
 * this is the job, and the rules about what belongs in the report live in the
 * pure ops-report.ts next door. Runs on the service-role client, which
 * bypasses RLS: every query below names tenant_id explicitly, and that is the
 * only thing keeping one organization's operating picture out of another's
 * inbox. There is no policy underneath to catch a mistake.
 *
 * Unlike the digest, the recipient list starts the run rather than falling out
 * of it: the tenants worth doing any work for are exactly the ones with a
 * configured `notifications.ops_report_recipients`.
 *
 * Since #903 the counts are also filtered by the recipient tenant's module
 * entitlements. Nothing else here needed it -- the recipients come from
 * `people_with_permission()`, which #900 already gates -- but the counts do
 * not go through a permission at all, so a tenant with Finance off was still
 * being told how many expense approvals were waiting on nobody.
 */

/** When no report has ever been sent, "new since the last report" means this. */
const FIRST_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

export type OpsReportRunSummary = {
  /** Tenants with at least one configured recipient. */
  tenants: number;
  /** Configured addresses across those tenants, before the gates. */
  considered: number;
  sent: number;
  /**
   * Tenant not active, muted by the org switch, nothing to report, or already
   * sent today.
   */
  skipped: number;
  failed: number;
};

export async function runOpsReport(
  admin: SupabaseClient,
  options: { now?: Date; siteUrl: string },
): Promise<OpsReportRunSummary> {
  const now = options.now ?? new Date();
  const day = opsReportDay(now);
  const summary: OpsReportRunSummary = {
    tenants: 0,
    considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  const byTenant = await fetchRecipientsByTenant(admin);
  summary.tenants = byTenant.size;
  if (byTenant.size === 0) return summary;

  // Once per run (#1674): a suspended or archived tenant gets no report.
  const active = await activeTenantIds(admin, "[ops-report]");

  for (const [tenantId, recipients] of byTenant) {
    summary.considered += recipients.length;

    if (!active.has(tenantId) || !(await isOrgEmailEnabled(admin, tenantId))) {
      summary.skipped += recipients.length;
      continue;
    }

    const since = await fetchLastReportAt(admin, tenantId, now);
    // Before the counts, because it decides which of them to read at all
    // (#903). A tenant with Finance off is not told how many expense
    // approvals are waiting, and does not pay for the query that would have
    // found out. Placed after the kill switch so a muted tenant still costs
    // nothing extra.
    const modules = await modulesForTenant(admin, tenantId);
    const source = await collectSource(admin, tenantId, now, since, modules);
    const report = buildOpsReport(source, { tenantId, now, since });

    // A quiet day is not a failure and not worth an email; see buildOpsReport.
    // Since #903 a tenant whose every remaining module is off lands here too,
    // which is the intended answer: no sections left means no email, rather
    // than an email with nothing in it.
    if (!report) {
      summary.skipped += recipients.length;
      continue;
    }

    // After the quiet-day check as well as the switch, so a tenant with
    // nothing to report costs no extra reads (#857). It answers the origin
    // too, so each tenant's report links into its own site (#860).
    const mail = await tenantMailContext(admin, tenantId, {
      fallbackOrigin: options.siteUrl,
    });

    for (const email of recipients) {
      const outcome = await deliverEmail(admin, {
        tenantId,
        identity: mail.identity,
        // Addressed to the organization: the configured inbox is an
        // app_settings value, not a `people` row, so there is nobody to point
        // at. See 20260907120000.
        personId: null,
        kind: OPS_REPORT_KIND,
        dedupeKey: opsReportDedupeKey(day, email),
        to: email,
        render: () =>
          renderOpsReport(report, mail.origin, {
            orgName: mail.displayName,
            branding: mail.branding,
          }),
        logPrefix: "[ops-report]",
      });

      if (outcome === "sent") summary.sent += 1;
      else if (outcome === "skipped") summary.skipped += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}

/**
 * Every tenant that has configured a leadership inbox, and the addresses.
 *
 * One query across all tenants rather than a walk over `tenants`: the setting
 * row is what makes a tenant eligible, so reading the rows *is* the list, and
 * a tenant that has never configured one costs nothing. Tenants whose value
 * parses to no usable address drop out here -- "a tenant with no configured
 * recipients gets nothing" has to hold for an empty string and a typo just as
 * much as for a missing row.
 */
async function fetchRecipientsByTenant(
  admin: SupabaseClient,
): Promise<Map<string, string[]>> {
  const byTenant = new Map<string, string[]>();

  const { data, error } = await admin
    .from("app_settings")
    .select("tenant_id, value")
    .eq("key", OPS_REPORT_RECIPIENTS_SETTING_KEY);

  if (error) {
    console.error("[ops-report] could not read the recipient lists", error);
    return byTenant;
  }

  for (const row of data ?? []) {
    const recipients = parseOpsReportRecipients(row.value);
    if (recipients.length > 0) {
      byTenant.set(row.tenant_id as string, recipients);
    }
  }
  return byTenant;
}

/**
 * When this tenant's previous report went out, which is what "new since the
 * last report" counts from.
 *
 * The ledger rather than a stored watermark: it is already the record of what
 * was sent, and a separate watermark could disagree with it. `created_at` and
 * not `sent_at`, because a row that failed at the provider still consumed the
 * window -- a resend is a manual act, and double-counting yesterday's messages
 * into today's report would be the more confusing of the two failures.
 *
 * A missing or unreadable history falls back to 24 hours. That is the interval
 * the job actually runs on, so on the very first run it is right, and after a
 * failed read it is wrong only in ways that are visible in the report itself
 * (which states the window it covers).
 */
async function fetchLastReportAt(
  admin: SupabaseClient,
  tenantId: string,
  now: Date,
): Promise<Date> {
  const fallback = new Date(now.getTime() - FIRST_RUN_WINDOW_MS);

  const { data, error } = await admin
    .from("notification_deliveries")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .eq("kind", OPS_REPORT_KIND)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      `[ops-report] could not read the last report time for tenant ${tenantId}; covering the last 24 hours`,
      error,
    );
    return fallback;
  }
  if (!data?.created_at) return fallback;

  const since = new Date(data.created_at as string);
  return Number.isNaN(since.getTime()) ? fallback : since;
}

/**
 * The tenant's numbers, minus the modules it has not been sold (#903).
 *
 * A gated count is never read rather than read and discarded: `has_permission`
 * would have stopped these queries for a signed-in caller, and the whole
 * reason this job asks the tables directly is that there is no caller. The
 * gates come from opsReportSourceGates(), so "which count belongs to which
 * module" lives in ops-report.ts next to the shaping it governs.
 */
async function collectSource(
  admin: SupabaseClient,
  tenantId: string,
  now: Date,
  since: Date,
  modules: Record<string, boolean>,
): Promise<OpsReportSource> {
  const sinceIso = since.toISOString();
  const windowEnd = new Date(
    now.getTime() + UPCOMING_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const gates = opsReportSourceGates(modules);

  const [
    pendingExpenseApprovals,
    pendingReimbursementApprovals,
    upcoming,
    newContactMessages,
    newVolunteerApplications,
    unclaimedContactMessages,
    unclaimedVolunteerApplications,
    inKindDonations,
    monetaryDonations,
  ] = await Promise.all([
    // The portal's count_pending_* RPCs cannot stand in here: they answer for
    // auth.uid() through has_permission(), and this caller has no session at
    // all. The queue itself is the same one they count.
    gates.pendingExpenseApprovals
      ? countRows(admin, "event_expenses", tenantId, (query) =>
          query.eq("status", "submitted"),
        )
      : 0,
    gates.pendingReimbursementApprovals
      ? countRows(admin, "reimbursements", tenantId, (query) =>
          query.eq("status", "submitted"),
        )
      : 0,
    // One fetch feeds two gated fields, so it runs if either wants it and
    // each is narrowed on the way out. They share a module today; the `||`
    // is what keeps that a fact about the catalog rather than an assumption
    // baked in here.
    gates.upcomingEvents || gates.shiftCoverageGaps
      ? fetchUpcoming(admin, tenantId, now.toISOString(), windowEnd)
      : { events: [], gaps: [] },
    gates.newContactMessages
      ? countRows(admin, "contact_messages", tenantId, (query) =>
          query.gte("created_at", sinceIso),
        )
      : 0,
    gates.newVolunteerApplications
      ? countRows(admin, "volunteer_applications", tenantId, (query) =>
          query.gte("created_at", sinceIso),
        )
      : 0,
    // The same arrivals, less the ones somebody has claimed (#1668).
    gates.unclaimedContactMessages
      ? countRows(admin, "contact_messages", tenantId, (query) =>
          query.gte("created_at", sinceIso).is("claimed_by_person_id", null),
        )
      : 0,
    gates.unclaimedVolunteerApplications
      ? countRows(admin, "volunteer_applications", tenantId, (query) =>
          query.gte("created_at", sinceIso).is("claimed_by_person_id", null),
        )
      : 0,
    gates.inKindDonations
      ? countRows(admin, "donations", tenantId, (query) =>
          // `created_at`, not `donated_at`: the report counts what was entered
          // in the window, and since #1053 `donated_at` is a calendar day that
          // cannot be compared against an instant. Matches how the monetary
          // donations below have always been counted.
          query.gte("created_at", sinceIso),
        )
      : 0,
    gates.monetaryDonations
      ? sumMonetaryDonations(admin, tenantId, sinceIso)
      : { count: 0, total: 0 },
  ]);

  return {
    pendingExpenseApprovals,
    pendingReimbursementApprovals,
    upcomingEvents: gates.upcomingEvents ? upcoming.events : [],
    shiftCoverageGaps: gates.shiftCoverageGaps ? upcoming.gaps : [],
    newContactMessages,
    newVolunteerApplications,
    unclaimedContactMessages,
    unclaimedVolunteerApplications,
    inKindDonations,
    monetaryDonations,
  };
}

type CountQuery = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

/** A head count on one tenant's rows. Zero on failure, with the reason logged. */
async function countRows(
  admin: SupabaseClient,
  table: string,
  tenantId: string,
  narrow: (query: CountQuery) => CountQuery,
): Promise<number> {
  const { count, error } = await narrow(
    admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId) as CountQuery,
  );

  if (error) {
    console.error(`[ops-report] could not count ${table}`, error);
    return 0;
  }
  return count ?? 0;
}

async function sumMonetaryDonations(
  admin: SupabaseClient,
  tenantId: string,
  sinceIso: string,
): Promise<{ count: number; total: number }> {
  const { data, error } = await admin
    .from("monetary_donations")
    .select("amount")
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceIso);

  if (error) {
    console.error("[ops-report] could not read monetary donations", error);
    return { count: 0, total: 0 };
  }

  const rows = data ?? [];
  return {
    count: rows.length,
    total: rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  };
}

type ShiftRow = {
  id: string;
  event_id: string;
  label: string;
  starts_at: string;
  target_headcount: number | null;
};

/**
 * The events starting inside the window, and the shifts on them that are short
 * of their target headcount.
 *
 * The gap is counted in JS from the assignment rows rather than with a
 * group-by, the same approach getOpsInboxSummary takes for check-ins: the
 * window is a week, so this is a handful of events and their shifts, not a
 * scan. Shifts with no target_headcount are skipped -- "covered" has no
 * meaning without a number to be short of.
 */
async function fetchUpcoming(
  admin: SupabaseClient,
  tenantId: string,
  nowIso: string,
  windowEnd: string,
): Promise<{ events: UpcomingEvent[]; gaps: ShiftCoverageGap[] }> {
  const { data, error } = await admin
    .from("events")
    .select("id, name, starts_at, timezone")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .gte("starts_at", nowIso)
    .lte("starts_at", windowEnd)
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("[ops-report] could not read upcoming events", error);
    return { events: [], gaps: [] };
  }

  const events = (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    startsAt: row.starts_at as string,
    timezone: row.timezone as string,
  }));
  if (events.length === 0) return { events, gaps: [] };

  const names = new Map(events.map((event) => [event.id, event.name]));
  const eventIds = events.map((event) => event.id);

  const { data: shiftRows, error: shiftError } = await admin
    .from("event_shifts")
    .select("id, event_id, label, starts_at, target_headcount")
    .eq("tenant_id", tenantId)
    .in("event_id", eventIds)
    .not("target_headcount", "is", null)
    .order("starts_at", { ascending: true });

  if (shiftError) {
    console.error("[ops-report] could not read event shifts", shiftError);
    return { events, gaps: [] };
  }

  const shifts = (shiftRows ?? []) as ShiftRow[];
  if (shifts.length === 0) return { events, gaps: [] };

  const { data: assignments, error: assignmentError } = await admin
    .from("event_volunteers")
    .select("shift_id")
    .eq("tenant_id", tenantId)
    .in(
      "shift_id",
      shifts.map((shift) => shift.id),
    );

  if (assignmentError) {
    console.error(
      "[ops-report] could not read shift assignments",
      assignmentError,
    );
    return { events, gaps: [] };
  }

  const assignedByShift = new Map<string, number>();
  for (const row of assignments ?? []) {
    const shiftId = row.shift_id as string | null;
    if (!shiftId) continue;
    assignedByShift.set(shiftId, (assignedByShift.get(shiftId) ?? 0) + 1);
  }

  const gaps: ShiftCoverageGap[] = [];
  for (const shift of shifts) {
    const target = shift.target_headcount ?? 0;
    const assigned = assignedByShift.get(shift.id) ?? 0;
    if (target <= 0 || assigned >= target) continue;

    const event = events.find((candidate) => candidate.id === shift.event_id);
    gaps.push({
      shiftId: shift.id,
      eventId: shift.event_id,
      eventName: names.get(shift.event_id) ?? "",
      label: shift.label,
      startsAt: shift.starts_at,
      timezone: event?.timezone ?? "UTC",
      assigned,
      target,
    });
  }

  return { events, gaps };
}
