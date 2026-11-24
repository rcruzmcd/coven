import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { NewSocialPostForm } from "@/components/portal/social-content/social-post-sheet";
import {
  programIdParam,
  programSocialHref,
} from "@/lib/social-content/social-filters";
import { listCalendarOwnersAction } from "../../calendar/actions";

export const metadata: Metadata = {
  title: "New social post",
};

/**
 * A new social post on a page of its own, as the post itself is. `?program=`
 * starts it related to that program (a program's details "New post", #1838);
 * adding it opens the post.
 */
export default async function NewSocialPostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "content_calendar",
    "manage",
    "Social content",
  );

  const { program } = await searchParams;
  const programId = programIdParam(
    Array.isArray(program) ? program[0] : program,
  );

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
      <PortalBreadcrumbs current="New social post" />
      <div className="flex flex-col gap-1">
        <h1 className="brand-display text-3xl font-semibold tracking-brand sm:text-4xl">
          New social post
        </h1>
        <p className="app-muted text-sm">
          One social post or story. Relate it to an event, community date or
          program, or leave it standalone.
        </p>
      </div>
      <Card className="mt-4">
        <CardContent>
          <NewSocialPostForm
            owners={owners}
            defaultLeadTimeDays={defaultLeadTimeDays}
            defaults={programId ? { programId } : {}}
            cancelHref={
              programId ? programSocialHref(programId) : "/portal/social"
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
