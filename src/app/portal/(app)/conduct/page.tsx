import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteLink } from "@/components/portal/public-site-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/portal/status-badge";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone } from "@/lib/time";
import {
  acknowledgementState,
  appealWindowState,
  awaitingAcknowledgement,
  getConductProcess,
  type ConductProcess,
} from "@/lib/conduct";
import { getLegalPublication } from "@/lib/legal-publication";
import { legalDocument } from "@/lib/legal-documents";
import {
  CONDUCT_LIST_COLUMNS,
  acknowledgementBadge,
  subjectLabel,
  type ConductListRow,
} from "./conduct-shared";
import { ConductReportsTable } from "./conduct-reports-table";
import { NewConductReportDialog } from "./new-conduct-report-dialog";

export const metadata: Metadata = {
  title: "Conduct",
};

/**
 * The queue.
 *
 * Open cases by default, because the question this page answers is "what is
 * outstanding" -- and because a closed case is a record rather than work. The
 * whole list is one query: a tenant's conduct reports are counted in dozens
 * over years, not in pages, so sorting and paging happen in the table rather
 * than in the URL.
 */
export default async function ConductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const showAll = params.show === "all";

  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "conduct_reports", "manage");

  const [zone, process, legalPublication] = await Promise.all([
    getOrgTimeZone(supabase),
    getConductProcess(supabase),
    getLegalPublication(supabase),
  ]);
  // The document this page measures against, linked where the work happens
  // rather than from the sidebar footer (#1392), and only when this
  // organization serves it: an unadopted document 404s (#859).
  const codeOfConductHref = legalPublication.code_of_conduct
    ? (legalDocument("code_of_conduct")?.route ?? null)
    : null;
  const today = todayInZone(zone);

  let query = supabase
    .from("conduct_reports")
    .select(CONDUCT_LIST_COLUMNS)
    .order("received_on", { ascending: false })
    .order("id", { ascending: true })
    .limit(500);
  if (!showAll) query = query.neq("status", "closed");

  const { data, error } = await query;
  const reports = (data ?? []) as unknown as ConductListRow[];

  // Appeals for the listed reports, so the appeal window can be counted
  // without a query per row. Only decided reports can have one.
  const decidedIds = reports
    .filter((report) => report.decided_on)
    .map((report) => report.id);
  const { data: appealRows } = decidedIds.length
    ? await supabase
        .from("conduct_report_appeals")
        .select("report_id, filed_on")
        .in("report_id", decidedIds)
    : { data: [] };
  const appeals = new Map(
    (appealRows ?? []).map((row) => [
      String(row.report_id),
      { filed_on: String(row.filed_on) },
    ]),
  );

  const needsAcknowledgement = reports.filter((report) =>
    awaitingAcknowledgement(acknowledgementState(report, process, today)),
  );
  const openAppealWindows = reports.filter(
    (report) =>
      appealWindowState(report, appeals.get(report.id) ?? null, process, today)
        .state === "open",
  );

  const rows = reports.map((report) => {
    const acknowledgement = acknowledgementState(report, process, today);
    return {
      ...report,
      subjectName: subjectLabel(report),
      acknowledgementBadge: acknowledgementBadge(acknowledgement),
      // The sort key behind the clock column: most overdue first, then the
      // tightest deadline, then everything with no clock on it.
      acknowledgementOrder:
        acknowledgement.state === "overdue"
          ? -acknowledgement.daysLate
          : acknowledgement.state === "due"
            ? acknowledgement.daysLeft
            : Number.MAX_SAFE_INTEGER,
    };
  });

  return (
    <>
      <PortalBreadcrumbs current="Conduct" />
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Conduct
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Reports about behaviour, however they reached you — the published
        address, an event, a conversation. This is the record, not the channel:
        every case here was entered by somebody, and nothing the public submits
        arrives in it.
      </p>

      <ProcessSummary
        process={process}
        canManage={canManage}
        codeOfConductHref={codeOfConductHref}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-sm">
          <FilterLink href="/portal/conduct" active={!showAll}>
            Open cases
          </FilterLink>
          <FilterLink href="/portal/conduct?show=all" active={showAll}>
            All cases
          </FilterLink>
        </div>
        {canManage ? <NewConductReportDialog today={today} /> : null}
      </div>

      {(needsAcknowledgement.length > 0 || openAppealWindows.length > 0) && (
        <Card className="mt-6">
          <CardContent className="space-y-2 py-4 text-sm">
            <h2 className="font-semibold">Waiting on you</h2>
            {needsAcknowledgement.length > 0 && (
              <p className="app-muted">
                <StatusBadge tone="warning" className="mr-2">
                  {needsAcknowledgement.length}
                </StatusBadge>
                {needsAcknowledgement.length === 1
                  ? "report has not been acknowledged"
                  : "reports have not been acknowledged"}{" "}
                within the {process.acknowledgementDays}-day commitment.
              </p>
            )}
            {openAppealWindows.length > 0 && (
              <p className="app-muted">
                <StatusBadge tone="progress" className="mr-2">
                  {openAppealWindows.length}
                </StatusBadge>
                {openAppealWindows.length === 1
                  ? "decided case is still inside its appeal window."
                  : "decided cases are still inside their appeal windows."}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error || rows.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="px-0">
            {error ? (
              <p className="app-muted px-4 py-6 text-sm">
                Could not load conduct reports. Please try again.
              </p>
            ) : (
              <EmptyState
                title={showAll ? "No conduct reports" : "No open cases"}
                description={
                  canManage
                    ? "Record a report with New report above, whatever channel it arrived on."
                    : "Cases appear here once you are assigned to review one. Until then there is nothing for you to see, which is deliberate."
                }
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6">
          <ConductReportsTable rows={rows} />
        </div>
      )}
    </>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 font-semibold"
          : "app-muted rounded-lg px-3 py-1.5 hover:underline"
      }
    >
      {children}
    </Link>
  );
}

/**
 * What this organization has committed to, printed where the work happens.
 *
 * A tenant that has published nothing sees the second half, and that wording is
 * load-bearing: the platform has no deadlines to fall back on, so the honest
 * thing to say is that there are none rather than to show a default somebody
 * would reasonably read as theirs.
 */
function ProcessSummary({
  process,
  canManage,
  codeOfConductHref,
}: {
  process: ConductProcess;
  canManage: boolean;
  codeOfConductHref: string | null;
}) {
  const commitments = [
    process.acknowledgementDays !== null &&
      `acknowledge a report within ${process.acknowledgementDays} days`,
    process.reviewerMinimum !== null &&
      `review it with at least ${process.reviewerMinimum} unconflicted reviewers`,
    process.appealDays !== null &&
      `hear an appeal filed within ${process.appealDays} days of the decision`,
  ].filter((entry): entry is string => Boolean(entry));

  const sentence =
    commitments.length <= 1
      ? (commitments[0] ?? "")
      : `${commitments.slice(0, -1).join(", ")} and ${commitments[commitments.length - 1]}`;

  return (
    <p className="app-muted mt-3 max-w-2xl text-sm">
      {commitments.length > 0 ? (
        <>
          Measured against what your{" "}
          {codeOfConductHref ? (
            <PublicSiteLink
              path={codeOfConductHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="code of conduct (opens in new tab)"
              className="underline underline-offset-2"
            >
              code of conduct
            </PublicSiteLink>
          ) : (
            "code of conduct"
          )}{" "}
          says: {sentence}.{" "}
        </>
      ) : (
        <>
          Your organization has not recorded what it promises about
          acknowledging a report, reviewing one or hearing an appeal, so nothing
          here carries a deadline.{" "}
          {codeOfConductHref && (
            <>
              <Link
                href={codeOfConductHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Read your code of conduct (opens in new tab)"
                className="underline underline-offset-2"
              >
                Read your code of conduct
              </Link>
              .{" "}
            </>
          )}
        </>
      )}
      {canManage && (
        <Link
          href="/portal/website/legal-documents"
          className="underline underline-offset-2"
        >
          Set it beside your code of conduct
        </Link>
      )}
    </p>
  );
}
