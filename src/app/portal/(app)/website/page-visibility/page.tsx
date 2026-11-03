import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getTenantModules,
  getTenantPageVisibility,
  moduleBlockedSlots,
  namedSlots,
  REQUIRED_PAGE_REASONS,
  REQUIRED_PUBLIC_PAGES,
  slotsForTenant,
} from "@/lib/page-visibility";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import { PageVisibilityPanel } from "../page-visibility-panel";

export const metadata: Metadata = {
  title: "Page visibility",
};

/**
 * Was System Settings' `?tab=visibility` until #990.
 *
 * The research that became #990 first recommended keeping this in
 * Administration, because the board operates it -- "hold content back until
 * the board has approved it" is the panel's own copy -- and the board holds no
 * `site_content` at all. The owner overrode that: it belongs with the website
 * it governs, and the board objection is answered by widening the Website
 * section's gate rather than by granting the board the CMS.
 */
export default async function WebsitePageVisibilityPage() {
  const supabase = await createSupabaseServerClient();
  const [pageVisibility, tenantModules, lexicon, tenants] = await Promise.all([
    getTenantPageVisibility(supabase),
    getTenantModules(supabase),
    getTenantLexicon(supabase),
    getTenantContext(supabase),
  ]);

  // Sections this organization has not been sold (#902). The switches for them
  // render read-only and off: the flag would be written and then ignored by
  // the gate, and a control that silently does nothing is worse than one that
  // says why it cannot.
  const blockedSlots = moduleBlockedSlots(tenantModules);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Page visibility
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <p className="app-muted max-w-3xl text-sm leading-relaxed">
          Control which sections of the public website are live. A hidden
          section disappears from the site navigation and its pages return
          &ldquo;not found&rdquo; — use this to hold content back until the
          board has approved it. Every change here is recorded in the audit log.
        </p>
        <PageVisibilityPanel
          // The platform's own marketing pages only for the platform tenant;
          // anywhere else the gate keeps them dark whatever is stored.
          slots={slotsForTenant(namedSlots(lexicon), currentTenant(tenants))}
          visibility={pageVisibility}
          blockedSlots={blockedSlots}
          requiredPages={REQUIRED_PUBLIC_PAGES.map((page) => ({
            key: page.key,
            label: page.label,
            reason: REQUIRED_PAGE_REASONS[page.reason],
          }))}
        />
      </div>
    </>
  );
}
