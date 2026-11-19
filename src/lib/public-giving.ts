import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_GIVING_SETTINGS,
  resolvePublicGivingSettings,
  type GivingSettings,
} from "@/lib/giving";
import { reportQueryError } from "@/lib/observability/query-error";

/**
 * The resolved tenant's giving path as the public site sees it (#1389): where
 * a gift is made, how that page opens, and the amounts to offer. Read through
 * `public_giving_settings`, which is all `anon` can see of the `giving.*`
 * settings -- and which withholds every value but `enabled` while giving is
 * off, so a URL a tenant is still drafting is not fetchable before the
 * announcement.
 *
 * Cached per request like `getPublicGearRequestOptions`: the Support page, the
 * Donations page and the `/support/donate` redirect each ask for it, and on a
 * navigation between them more than one may run in the same render.
 */
export const getPublicGivingSettings = cache(
  async (supabase: SupabaseClient): Promise<GivingSettings> => {
    const { data, error } = await supabase
      .from("public_giving_settings")
      .select("slot, value");

    // Falling back to "no giving path" is right -- an unreadable setting must
    // not take the Donations page down -- but it must not be silent, for the
    // reason site-layout.ts gives: a swallowed PGRST205 looks like the settings
    // panel refusing to save.
    if (error) {
      reportQueryError(error, {
        source: "giving.public_giving_settings",
        message:
          "could not read public_giving_settings; the Give card stays hidden",
      });
      return DEFAULT_GIVING_SETTINGS;
    }

    return resolvePublicGivingSettings(
      (data ?? []) as { slot: string; value: unknown }[],
    );
  },
);
