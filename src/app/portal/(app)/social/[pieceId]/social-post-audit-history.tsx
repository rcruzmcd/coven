import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/portal/empty-state";
import { ViewerTime } from "@/components/viewer-time";
import { ActionBadge } from "../../administration/audit-log/audit-log-badges";

type AuditEntry = { id: string; action: string; occurred_at: string };

/**
 * The post's recorded changes, from the audit trigger on
 * `content_opportunities`. Rendered only for administration:manage, the one
 * grant `audit_log`'s select policy admits.
 */
export async function SocialPostAuditHistory({
  supabase,
  pieceId,
}: {
  supabase: SupabaseClient;
  pieceId: string;
}) {
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, occurred_at")
    .eq("table_name", "content_opportunities")
    .eq("record_id", pieceId)
    .order("occurred_at", { ascending: false })
    .limit(10);

  const entries = (data ?? []) as AuditEntry[];

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Audit history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState
            title="No recorded changes yet"
            description="Edits to this post are recorded here automatically."
          />
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <ActionBadge action={entry.action} />
                <span className="app-muted">
                  <ViewerTime iso={entry.occurred_at} fallbackZone="UTC" />
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/portal/administration/audit-log?table=content_opportunities"
          className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
        >
          View full audit log for social posts
        </Link>
      </CardContent>
    </Card>
  );
}
