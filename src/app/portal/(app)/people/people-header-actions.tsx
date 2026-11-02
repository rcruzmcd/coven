import Link from "next/link";
import { Settings } from "lucide-react";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkPendingPulse } from "@/components/link-pending";
import { PEOPLE_SETTINGS_PATH } from "./settings/profile-questions-draft";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

/** `null` when the reader can't open the queue, or its count failed to load. */
export type PeopleQueueCounts = {
  duplicates: number | null;
  claims: number | null;
};

/**
 * Duplicates are counted as the queue lists them: one item per shared email
 * address, however many records share it.
 */
export function countDuplicateGroups(rows: { email_key: string }[]): number {
  return new Set(rows.map((row) => row.email_key)).size;
}

/**
 * The open items behind each whole-directory queue the reader can open
 * (#1760). Each query runs only for its own permission, so a reader without
 * it neither pays for it nor learns the number.
 */
export async function loadPeopleQueueCounts(
  supabase: SupabaseServerClient,
  {
    canManage,
    canReviewClaims,
  }: { canManage: boolean; canReviewClaims: boolean },
): Promise<PeopleQueueCounts> {
  const [duplicates, claims] = await Promise.all([
    canManage
      ? supabase
          .rpc("find_duplicate_people")
          .then(({ data, error }) =>
            error
              ? null
              : countDuplicateGroups((data ?? []) as { email_key: string }[]),
          )
      : null,
    canReviewClaims
      ? supabase
          .from("person_claims")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .then(({ count, error }) => (error ? null : (count ?? 0)))
      : null,
  ]);
  return { duplicates, claims };
}

function QueueLink({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count: number | null;
}) {
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={<Link href={href} />}
    >
      <LinkPendingPulse>{label}</LinkPendingPulse>
      {count !== null && count > 0 && (
        <Badge
          variant="secondary"
          className="h-5 min-w-5 justify-center rounded-full px-1 tabular-nums"
        >
          {count}
          <span className="sr-only"> open</span>
        </Badge>
      )}
    </Button>
  );
}

/**
 * The All people header's actions (#1760): the two whole-directory queues and
 * the settings beside the list (docs/portal-navigation.md, "Settings beside a
 * work list"). They belong to the directory as a whole -- a duplicate pair or
 * a claim can straddle segments, and a profile question is asked of everyone
 * -- so they sit by its heading rather than in the search toolbar. Each
 * renders only for the permission its destination checks.
 */
export function PeopleHeaderActions({
  showDuplicates,
  showClaims,
  showSettings,
  counts,
}: {
  showDuplicates: boolean;
  showClaims: boolean;
  showSettings: boolean;
  counts: PeopleQueueCounts;
}) {
  if (!showDuplicates && !showClaims && !showSettings) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showDuplicates && (
        <QueueLink
          href="/portal/people/duplicates"
          label="Duplicates"
          count={counts.duplicates}
        />
      )}
      {showClaims && (
        <QueueLink
          href="/portal/people/claims"
          label="Account claims"
          count={counts.claims}
        />
      )}
      {showSettings && (
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={PEOPLE_SETTINGS_PATH} />}
        >
          <Settings className="size-4" />
          <LinkPendingPulse>Settings</LinkPendingPulse>
        </Button>
      )}
    </div>
  );
}
