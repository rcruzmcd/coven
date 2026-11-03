import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  LAYOUT_SLOTS,
  getTenantLayoutSetting,
  getTenantLayoutValues,
} from "@/lib/site-layout";
import {
  NAV_GROUPS,
  NAV_LABEL_MAX_LENGTH,
  NAV_SETTING_SLOT,
  orderedGroups,
  resolveNavSettings,
  visibleGroups,
} from "@/lib/public-nav";
import {
  getTenantModules,
  getTenantPageVisibility,
  hiddenSlots,
  moduleBlockedSlots,
  platformOnlySlotKeys,
} from "@/lib/page-visibility";
import { applyLexicon } from "@/lib/lexicon";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import { LayoutPanel } from "../layout-panel";
import { NavPanel, type NavPanelGroup } from "../nav-panel";

export const metadata: Metadata = {
  title: "Layout",
};

/**
 * Was System Settings' `?tab=layout` until #990.
 *
 * Every slot in `src/lib/site-layout.ts` is a public page's presentation --
 * how many upcoming events the home page shows, whether they render as flier
 * cards or a compact list, where the Programs page reads its programs from --
 * and none of it touches the portal. It also already leaked across the old
 * boundary in the direction that proved the point: the Website content
 * editor's programs notice linked *into* System Settings to change where that
 * page reads from. The setting and the content it governs were one job done in
 * two places.
 */
export default async function WebsiteLayoutSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const [layoutValues, storedNav, visibility, modules, lexicon, tenants] =
    await Promise.all([
      getTenantLayoutValues(supabase),
      getTenantLayoutSetting(supabase, NAV_SETTING_SLOT),
      getTenantPageVisibility(supabase),
      getTenantModules(supabase),
      getTenantLexicon(supabase),
      getTenantContext(supabase),
    ]);
  const nav = resolveNavSettings(storedNav);

  // Groups that can never appear for this tenant -- the platform's own
  // marketing pages anywhere but the platform -- are left out of the list, the
  // way Page visibility leaves their switches out.
  const neverShown = [...platformOnlySlotKeys(currentTenant(tenants))];
  const offerable = new Set(
    visibleGroups(neverShown).map((group) => group.href),
  );
  const live = new Set(
    visibleGroups([
      ...neverShown,
      ...hiddenSlots(visibility),
      ...Object.keys(moduleBlockedSlots(modules)),
    ]).map((group) => group.href),
  );
  const navGroups: NavPanelGroup[] = orderedGroups(nav)
    .filter((group) => offerable.has(group.href))
    .map((group) => ({
      href: group.href,
      defaultLabel: applyLexicon(
        NAV_GROUPS.find((entry) => entry.href === group.href)!.label,
        lexicon,
      ),
      hidden: !live.has(group.href),
    }));

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Layout
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <p className="app-muted max-w-3xl text-sm leading-relaxed">
          How the public site is arranged, for the parts that aren&rsquo;t copy
          or colour.{" "}
          <Link
            href="/portal/website/page-visibility"
            className="underline underline-offset-4"
          >
            Page visibility
          </Link>{" "}
          decides whether a section exists at all; these settings decide how
          much of it a page shows. Every change here is recorded in the audit
          log.
        </p>
        <LayoutPanel slots={LAYOUT_SLOTS} values={layoutValues} />
      </div>

      <section aria-labelledby="site-menu-heading" className="mt-10 space-y-4">
        <h2
          id="site-menu-heading"
          className="brand-display text-2xl font-semibold tracking-brand"
        >
          Site menu
        </h2>
        <p className="app-muted max-w-3xl text-sm leading-relaxed">
          The order of the sections in the site&rsquo;s header and footer, and
          what each is called. Leave a name blank to keep the default. The pages
          under each section stay as they are, and a section hidden in Page
          visibility stays out of the menu wherever it sits here.
        </p>
        <NavPanel
          groups={navGroups}
          nav={nav}
          defaultOrder={NAV_GROUPS.map((group) => group.href).filter((href) =>
            offerable.has(href),
          )}
          maxLabelLength={NAV_LABEL_MAX_LENGTH}
        />
      </section>
    </>
  );
}
