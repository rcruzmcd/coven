import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { NewProgramDialog } from "./new-program-dialog";
import { ProgramsTable } from "./programs-table";
import type { ProgramRow } from "./program-badges";

export const metadata: Metadata = {
  title: "Programs",
};

export default async function ProgramsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "programs", "manage");
  // A program's details count and add its social posts (#1838).
  const social = {
    canView: hasPermission(permissions, "content_calendar", "view"),
    canManage: hasPermission(permissions, "content_calendar", "manage"),
  };

  const { data: programs, error } = await supabase
    .from("programs")
    .select(
      "id, name, description, status, is_public, pillar, emoji, sort_order",
    )
    .order("name", { ascending: true });

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Programs
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Named, repeatable initiatives that events roll up into — assign an event
        to a program from the event&rsquo;s Overview tab.
      </p>

      {canManage ? (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <NewProgramDialog />
        </div>
      ) : null}

      {error || !programs || programs.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="px-0">
            {error ? (
              <p className="app-muted px-4 py-6 text-sm">
                Could not load programs. Please try again.
              </p>
            ) : (
              <EmptyState
                title="No programs yet"
                description={
                  canManage
                    ? "Add the first one with New program above."
                    : "Programs appear here once someone with programs access creates one."
                }
              />
            )}
          </CardContent>
        </Card>
      ) : (
        // PortalDataTable brings the card with it, so the page only wraps the
        // states it renders instead of a table.
        <div className="mt-6">
          <ProgramsTable
            programs={programs as ProgramRow[]}
            canManage={canManage}
            social={social}
          />
        </div>
      )}
    </>
  );
}
