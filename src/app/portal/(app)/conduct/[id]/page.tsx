import { MarkdownText } from "@/components/portal/markdown-text";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { StatusBadge } from "@/components/portal/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone } from "@/lib/time";
import {
  CONDUCT_CHANNELS,
  CONDUCT_SEVERITIES,
  CONDUCT_STATUSES,
  acknowledgementState,
  appealWindowState,
  conductLabel,
  getConductProcess,
} from "@/lib/conduct";
import {
  CONDUCT_CASE_COLUMNS,
  CONDUCT_SEVERITY_TONES,
  CONDUCT_STATUS_TONES,
  acknowledgementBadge,
  subjectLabel,
  type ConductActionRow,
  type ConductAppealRow,
  type ConductCaseRow,
  type ConductReviewerRow,
} from "../conduct-shared";
import { CaseProgressCard } from "./case-progress-card";
import { ReviewersCard } from "./reviewers-card";
import { CaseActionsCard } from "./actions-card";
import { AppealCard } from "./appeal-card";

export const metadata: Metadata = {
  title: "Conduct case",
};

/**
 * One case.
 *
 * Everything on this page is gated twice over and neither gate is this
 * component: the route layout asks for `conduct_reports:view`, and the database
 * decides whether these four queries return anything at all
 * (`can_see_conduct_report()`). A reviewer who has recused themselves reaches
 * exactly the same 404 as somebody who was never assigned, which is the
 * intended behaviour rather than a rough edge -- recusal takes the case away,
 * not just the vote.
 */
export default async function ConductCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [permissions, zone, process] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getOrgTimeZone(supabase),
    getConductProcess(supabase),
  ]);
  const canManage = hasPermission(permissions, "conduct_reports", "manage");
  const today = todayInZone(zone);

  const [
    { data: report },
    { data: reviewerRows },
    { data: actionRows },
    { data: appealRow },
    { data: user },
  ] = await Promise.all([
    supabase
      .from("conduct_reports")
      .select(CONDUCT_CASE_COLUMNS)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("conduct_report_reviewers")
      .select(
        "id, user_id, stage, assigned_on, assigned_by, recused_on, recusal_reason",
      )
      .eq("report_id", id)
      .order("assigned_on", { ascending: true }),
    supabase
      .from("conduct_report_actions")
      .select("id, kind, description, taken_on, lifted_on")
      .eq("report_id", id)
      .order("taken_on", { ascending: false }),
    supabase
      .from("conduct_report_appeals")
      .select("id, filed_on, grounds, decided_on, outcome")
      .eq("report_id", id)
      .maybeSingle(),
    supabase.auth.getUser().then(({ data }) => ({ data: data.user })),
  ]);

  if (!report) notFound();
  const conductCase = report as unknown as ConductCaseRow;
  const reviewers = (reviewerRows ?? []) as ConductReviewerRow[];
  const actions = (actionRows ?? []) as ConductActionRow[];
  const appeal = (appealRow ?? null) as ConductAppealRow | null;

  // Names for the ids on the case. `list_conduct_actors` answers for a `view`
  // holder too: a reviewer who cannot see who else is on the case cannot tell
  // whether they are the second unconflicted one.
  const actorIds = Array.from(
    new Set(
      [
        ...reviewers.flatMap((reviewer) => [
          reviewer.user_id,
          reviewer.assigned_by,
        ]),
        conductCase.created_by,
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  const { data: actorRows } = actorIds.length
    ? await supabase.rpc("list_conduct_actors", { p_user_ids: actorIds })
    : { data: [] };
  const actorNames = new Map(
    (
      (actorRows ?? []) as {
        user_id: string;
        email: string | null;
        full_name: string | null;
      }[]
    ).map((actor) => [
      actor.user_id,
      actor.full_name || actor.email || "Someone",
    ]),
  );

  const acknowledgement = acknowledgementState(conductCase, process, today);
  const ackBadge = acknowledgementBadge(acknowledgement);
  const appealWindow = appealWindowState(conductCase, appeal, process, today);

  return (
    <>
      <PortalBreadcrumbs current={conductCase.reference} />
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          {conductCase.reference}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Use this reference when you talk about the case — in an email, on an
        agenda, in a meeting. It names the case without naming anybody in it.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={CONDUCT_STATUS_TONES[conductCase.status]}>
          {conductLabel(CONDUCT_STATUSES, conductCase.status)}
        </StatusBadge>
        <StatusBadge tone={CONDUCT_SEVERITY_TONES[conductCase.severity]}>
          {conductLabel(CONDUCT_SEVERITIES, conductCase.severity)}
        </StatusBadge>
        {ackBadge && (
          <StatusBadge tone={ackBadge.tone}>{ackBadge.label}</StatusBadge>
        )}
        {appealWindow.state === "open" && (
          <StatusBadge tone="progress">
            Appeal window closes {appealWindow.closesOn}
          </StatusBadge>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>The report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Detail label="Received">
              {conductCase.received_on} ·{" "}
              {conductLabel(CONDUCT_CHANNELS, conductCase.channel)}
            </Detail>
            <Detail label="Reporter">
              {conductCase.reporter_kind === "anonymous" ? (
                <span className="app-muted">
                  Anonymous — nothing identifying was kept
                </span>
              ) : (
                [
                  conductCase.reporter?.name,
                  conductCase.reporter_name,
                  conductCase.reporter_contact,
                ]
                  .filter(Boolean)
                  .join(" · ") || (
                  <span className="app-muted">Not recorded</span>
                )
              )}
            </Detail>
            <Detail label="Subject">{subjectLabel(conductCase)}</Detail>
            <Detail label="Where">
              {conductCase.event ? (
                <Link
                  href={`/portal/events/${conductCase.event.id}`}
                  className="underline underline-offset-2"
                >
                  {conductCase.event.name}
                </Link>
              ) : (
                conductCase.context || (
                  <span className="app-muted">Not recorded</span>
                )
              )}
            </Detail>
            <div>
              <p className="app-eyebrow">What was reported</p>
              <MarkdownText className="mt-1">
                {conductCase.summary}
              </MarkdownText>
            </div>
            {conductCase.outcome && (
              <div>
                <p className="app-eyebrow">Outcome, {conductCase.decided_on}</p>
                <MarkdownText className="mt-1">
                  {conductCase.outcome}
                </MarkdownText>
              </div>
            )}
          </CardContent>
        </Card>

        <CaseProgressCard
          reportId={conductCase.id}
          status={conductCase.status}
          acknowledgedOn={conductCase.acknowledged_on}
          decidedOn={conductCase.decided_on}
          closedOn={conductCase.closed_on}
          today={today}
          canManage={canManage}
        />

        <ReviewersCard
          reportId={conductCase.id}
          reviewers={reviewers}
          actorNames={Object.fromEntries(actorNames)}
          currentUserId={user?.id ?? null}
          process={process}
          canManage={canManage}
          hasAppeal={appeal !== null}
        />

        <CaseActionsCard
          reportId={conductCase.id}
          actions={actions}
          today={today}
          canManage={canManage}
        />

        <AppealCard
          reportId={conductCase.id}
          appeal={appeal}
          decidedOn={conductCase.decided_on}
          appealWindow={appealWindow}
          today={today}
          canManage={canManage}
        />
      </div>
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="app-eyebrow">{label}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
