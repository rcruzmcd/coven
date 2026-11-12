import { MarkdownText } from "@/components/portal/markdown-text";
import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
  requirePermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { formatInstantDate, personDisplayName } from "@/lib/format";
import { QueueClaimFilterField } from "@/components/portal/queue-claim-filter";
import {
  ClaimRowActions,
  ClaimedByCell,
  type Claimant,
} from "@/components/portal/queue-claims";
import { getQueueClaimContext } from "@/lib/portal/queue-claim-context";
import {
  CLAIM_FILTER_PARAM,
  CLAIM_FK,
  applyClaimFilter,
  parseClaimFilter,
} from "@/lib/queue-claims";
import { claimCandidatesAction } from "./actions";
import { ClaimReview } from "./claim-review";

export const metadata: Metadata = {
  title: "Account claims",
};

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * `pending` is the default, which is what keeps this a work queue rather than a
 * log: the question the page exists to answer is "what is waiting for me", and
 * a reader who wants the past asks for it (#1193).
 *
 * `withdrawn` has no filter of its own -- a claimant who changed their mind
 * left nothing for anybody to act on -- but it is in `all`, because a claim
 * that is missing from every view is how "was that ever looked at" became
 * unanswerable in the first place.
 */
const STATUS_FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

type ClaimRow = {
  id: string;
  stated_name: string;
  stated_email: string | null;
  stated_phone: string | null;
  stated_instagram_handle: string | null;
  note: string | null;
  status: string;
  created_at: string;
  claimed_person_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  /**
   * Which staff member is handling it (#1671). Staff-only: the claimant's own
   * reads on /my select named columns and never these.
   */
  claimant: Claimant;
};

/**
 * The review queue for #1162, and since #1193 its own past.
 *
 * A queue under People rather than a section of its own, the same shape the
 * duplicates queue takes: this is the People directory's job seen from a
 * different angle, not a different job (`docs/portal-navigation.md`). It is
 * gated on `constituent_claims`, which belongs to the `constituent_accounts`
 * module -- so on a tenant that has not enabled the constituent area,
 * `has_permission()` is false for everyone and this page refuses, which is
 * right: there is nothing to review where nobody can sign up.
 *
 * Reading is `view` and deciding is `manage`. That split is what the RLS policy
 * already assumed -- `"reviewers read claims"` is written against `view`
 * (20260916060000) -- and what the ops inbox already assumed, since
 * `attention-items.ts` offers this page's link at `view`. Until #1193 the page
 * itself demanded `manage`, so that link bounced the reader to
 * `/portal/home?denied=People`.
 */
export default async function PersonClaimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  // The people layout only requires people:view. Deciding who gets to read a
  // person's giving history is its own permission.
  await requirePermission(supabase, "constituent_claims", "view", "People");
  const [permissions, claimContext] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getQueueClaimContext(supabase),
  ]);
  const canReview = hasPermission(permissions, "constituent_claims", "manage");

  const params = await searchParams;
  const rawStatus = params.status;
  const statusParam = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  const statusFilter = STATUS_FILTERS.some(
    (option) => option.value === statusParam,
  )
    ? (statusParam as string)
    : "pending";
  const showingQueue = statusFilter === "pending";
  // The ops inbox links here with `claimed=none` when some pending claims are
  // already being handled (#1668).
  const claimFilter = parseClaimFilter(params[CLAIM_FILTER_PARAM]);

  let query = supabase
    .from("person_claims")
    .select(
      `id, stated_name, stated_email, stated_phone, stated_instagram_handle, note, status, created_at, claimed_person_id, reviewed_by, reviewed_at, review_note, claimant:people!${CLAIM_FK.person_claims}(id, name, preferred_name)`,
    )
    // Oldest first while this is a queue -- the one waiting longest is the one
    // to do next. Newest first once it is a history, where the last decision is
    // the one being looked for.
    .order("created_at", { ascending: showingQueue });
  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  query = applyClaimFilter(query, claimFilter, claimContext.myPersonId);

  const { data: claims } = await query;
  const rows = (claims ?? []) as unknown as ClaimRow[];

  // Candidates are a proposal about an undecided claim, so a decided row asks
  // for none -- which also keeps the N+1 on the queue, where it was.
  const candidates = await Promise.all(
    rows.map((claim) =>
      claim.status === "pending"
        ? claimCandidatesAction(claim.id)
        : Promise.resolve([]),
    ),
  );

  const reviewerIds = [
    ...new Set(rows.map((claim) => claim.reviewed_by).filter((id) => !!id)),
  ] as string[];
  const linkedIds = [
    ...new Set(
      rows.map((claim) => claim.claimed_person_id).filter((id) => !!id),
    ),
  ] as string[];

  // Two lookups rather than an embed: `reviewed_by` points at auth.users, which
  // the directory reaches only through people.auth_user_id, and a reviewer who
  // has no directory record of their own is ordinary.
  const [{ data: reviewers }, { data: linkedPeople }] = await Promise.all([
    reviewerIds.length
      ? supabase
          .from("people")
          .select("name, preferred_name, auth_user_id")
          .in("auth_user_id", reviewerIds)
      : Promise.resolve({ data: [] }),
    linkedIds.length
      ? supabase
          .from("people")
          .select("id, name, preferred_name")
          .in("id", linkedIds)
      : Promise.resolve({ data: [] }),
  ]);

  const reviewerNames = new Map(
    (reviewers ?? []).map((person) => [
      person.auth_user_id as string,
      personDisplayName(person),
    ]),
  );
  const linkedNames = new Map(
    (linkedPeople ?? []).map((person) => [
      person.id,
      personDisplayName(person),
    ]),
  );

  const filterLabel =
    STATUS_FILTERS.find((option) => option.value === statusFilter)?.label ??
    statusFilter;

  return (
    <div className="space-y-6">
      <PortalBreadcrumbs current="Account claims" />

      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Account claims
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div>
        <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed">
          People who have made an account on the website and asked to be linked
          to their record. Approving one lets that account see its own events,
          volunteering, giving and gear — so check something beyond a similar
          name before you link it. Everyone already linked is listed under{" "}
          <Link href="/portal/people/accounts" className="underline">
            People › Accounts
          </Link>
          .
        </p>
      </div>

      <form
        method="get"
        className="rainbow-surface flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md"
      >
        <div className="flex min-w-40 flex-col gap-1">
          <label htmlFor="claims-status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="claims-status"
            name="status"
            defaultValue={statusFilter}
            className={selectClassName}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <QueueClaimFilterField
          filter={claimFilter}
          staff={claimContext.staff}
          selectClassName={selectClassName}
        />
        <Button type="submit" variant="secondary" size="sm">
          Apply
        </Button>
      </form>

      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {claimFilter.kind !== "all"
                ? "No claims match these filters"
                : showingQueue
                  ? "Nothing waiting"
                  : `No ${filterLabel.toLowerCase()} claims`}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {rows.map((claim, index) => {
            const linkedName = claim.claimed_person_id
              ? linkedNames.get(claim.claimed_person_id)
              : undefined;
            return (
              <Card key={claim.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {claim.stated_name}
                    {claim.status !== "pending" && (
                      <Badge
                        variant={
                          claim.status === "approved" ? "secondary" : "outline"
                        }
                      >
                        {STATUS_LABELS[claim.status] ?? claim.status}
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {formatInstantDate(claim.created_at)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="app-muted inline">They gave: </dt>
                      <dd className="inline">
                        {claim.stated_email ?? "no email"}
                        {claim.stated_instagram_handle
                          ? ` · @${claim.stated_instagram_handle}`
                          : ""}
                        {claim.stated_phone ? ` · ${claim.stated_phone}` : ""}
                      </dd>
                    </div>
                  </dl>

                  {claim.note && (
                    <MarkdownText className="text-sm leading-relaxed">
                      {claim.note}
                    </MarkdownText>
                  )}

                  {claim.status === "pending" ? (
                    <>
                      {/* Only while pending: a decision clears the claim. */}
                      <p className="text-sm">
                        <span className="app-muted">Claimed by: </span>
                        <ClaimedByCell claimant={claim.claimant} />
                      </p>
                      {canReview ? (
                        <ClaimReview
                          claimId={claim.id}
                          candidates={candidates[index]}
                          claimActions={
                            // Both of the queue's claim permissions are
                            // constituent_claims:manage today;
                            // set_queue_item_claim() checks them separately.
                            <ClaimRowActions
                              queue="person_claims"
                              itemId={claim.id}
                              itemLabel={`Claim from ${claim.stated_name}`}
                              claimant={claim.claimant}
                              myPersonId={claimContext.myPersonId}
                              canClaim={canReview}
                              canAssign={canReview}
                              resolved={false}
                              staff={claimContext.staff}
                            />
                          }
                        />
                      ) : (
                        <p className="app-muted text-sm">
                          Waiting for someone who can review claims.
                        </p>
                      )}
                    </>
                  ) : (
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="app-muted inline">Decided: </dt>
                        <dd className="inline">
                          {claim.reviewed_at
                            ? formatInstantDate(claim.reviewed_at)
                            : "—"}
                          {claim.reviewed_by
                            ? ` by ${reviewerNames.get(claim.reviewed_by) ?? "a staff member"}`
                            : ""}
                        </dd>
                      </div>
                      {claim.claimed_person_id && (
                        <div>
                          <dt className="app-muted inline">Linked to: </dt>
                          <dd className="inline">
                            <Link
                              href={`/portal/people/${claim.claimed_person_id}`}
                              className="underline"
                            >
                              {linkedName ?? "their record"}
                            </Link>
                          </dd>
                        </div>
                      )}
                      {claim.review_note && (
                        <div className="sm:col-span-2">
                          <dt className="app-muted inline">Note: </dt>
                          <dd className="inline">{claim.review_note}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
