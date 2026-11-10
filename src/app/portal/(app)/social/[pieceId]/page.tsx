import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { detailTitle } from "@/lib/portal/detail-title";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { getSocialPiece } from "@/lib/social-content/queries";
import { listCalendarOwnersAction } from "../../calendar/actions";
import { SocialPostDetail } from "./social-post-detail";
import { SocialPostAuditHistory } from "./social-post-audit-history";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pieceId: string }>;
}): Promise<Metadata> {
  const { pieceId } = await params;
  return {
    title: await detailTitle({
      table: "content_opportunities",
      column: "title",
      id: pieceId,
      fallback: "Social post",
    }),
  };
}

/** One social post (#1794): read it, edit it, move its status, see its history. */
export default async function SocialPostPage({
  params,
}: {
  params: Promise<{ pieceId: string }>;
}) {
  const { pieceId } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await requirePermission(
    supabase,
    "content_calendar",
    "view",
    "Social content",
  );
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const { piece, error } = await getSocialPiece(supabase, pieceId);
  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this social post. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!piece) notFound();

  const [ownersResult, { data: leadTimeSetting }] = await Promise.all([
    listCalendarOwnersAction(),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "content.default_lead_time_days")
      .maybeSingle(),
  ]);
  const owners = "data" in ownersResult ? ownersResult.data : [];
  const defaultLeadTimeDays =
    typeof leadTimeSetting?.value === "number" ? leadTimeSetting.value : 21;

  return (
    <>
      <PortalBreadcrumbs current={piece.title} />
      <SocialPostDetail
        piece={piece}
        owners={owners}
        defaultLeadTimeDays={defaultLeadTimeDays}
        canManage={canManage}
      />
      {/* The audit log is readable with administration:manage only (its RLS
          policy), so the full history is shown to those who can read it; the
          last status change above is on the row and shown to everyone. */}
      {hasPermission(permissions, "administration", "manage") && (
        <SocialPostAuditHistory supabase={supabase} pieceId={piece.id} />
      )}
    </>
  );
}
