import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_LEXICON,
  LEXICON_PREFIX,
  lexiconFromRows,
  type Lexicon,
} from "@/lib/lexicon";
import { reportQueryError } from "@/lib/observability/query-error";

/**
 * The lexicon of the tenant the signed-in user has *selected*, for the portal
 * shell (#896) -- session-resolved, unlike the host-resolved
 * `getPublicLexicon`, and the same split `tenant-branding.ts` makes. It matters
 * here for the usual reason: `portal.<domain>` resolves to whichever tenant
 * owns that host, which is not always the one the admin is working in.
 *
 * Cached per request because the shell reads it for the sidebar, the command
 * palette and the breadcrumbs, all of which render from one layout pass.
 */
export const getTenantLexicon = cache(
  async (supabase: SupabaseClient): Promise<Lexicon> => {
    const { data, error } = await supabase
      .from("tenant_lexicon")
      .select("term, value");
    if (error) {
      reportQueryError(error, {
        source: "lexicon.tenant_lexicon",
        message:
          "could not read tenant_lexicon; the portal is using the platform's own words",
      });
      return DEFAULT_LEXICON;
    }
    return lexiconFromRows(data ?? []);
  },
);

/**
 * One named tenant's lexicon, for server code that belongs to neither a
 * session nor a host: the submission notifications, which run after the
 * response with the service-role client and know only the tenant id on the row
 * they are about. A contact message filed under the "gear" topic has to reach
 * the inbox saying whatever that organization calls it.
 */
export async function lexiconForTenant(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Lexicon> {
  const { data, error } = await admin
    .from("app_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .like("key", `${LEXICON_PREFIX}%`);
  if (error) {
    reportQueryError(error, {
      source: "lexicon.app_settings.lexicon_for_tenant",
      message:
        "could not read lexicon.* for the tenant; using the platform's own words",
    });
    return DEFAULT_LEXICON;
  }
  return lexiconFromRows(
    (data ?? []).map((row) => ({
      term: String(row.key).slice(LEXICON_PREFIX.length),
      value: row.value,
    })),
  );
}

/**
 * Only the terms this tenant has actually set, unresolved, for the
 * Administration panel.
 *
 * The panel cannot use `getTenantLexicon` above: that fills every unset term
 * with the platform's word, and a form pre-filled with four words nobody chose
 * gives an administrator no way to tell which are theirs. A blank field there
 * means "the platform default", which is the same contract the branding panel
 * has.
 *
 * Read straight from `app_settings` rather than through `tenant_lexicon` --
 * RLS scopes it to the tenant being edited, where the view answers for
 * `current_tenant_id()`. The same split `getTenantPageVisibility` makes, and
 * for the same reason: the write goes to `app_settings`, so the panel has to
 * read the row it is about to write.
 */
export async function getStoredLexicon(
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .like("key", `${LEXICON_PREFIX}%`);

  if (error) {
    reportQueryError(error, {
      source: "lexicon.app_settings.lexicon",
      message:
        "could not read lexicon.* from app_settings; the panel is showing empty fields",
    });
    return {};
  }

  const stored: Record<string, string> = {};
  for (const row of data ?? []) {
    const value = row.value;
    if (typeof value === "string" && value.trim()) {
      stored[String(row.key).slice(LEXICON_PREFIX.length)] = value.trim();
    }
  }
  return stored;
}
