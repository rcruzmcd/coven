"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { contentSlot, isValidSlotValue } from "@/lib/site-content";
import { collectionSurface, surfaceKeys } from "@/lib/legal-surface";
import {
  APPROVAL_REFERENCE_MAX_LENGTH,
  completeApproval,
  isLegalSlotKey,
  REVIEW_NOTES_MAX_LENGTH,
  type LegalPublishApproval,
} from "@/lib/legal-approval";
import {
  getTenantAsksProfileQuestions,
  getTenantModules,
  getTenantPageVisibility,
} from "@/lib/page-visibility";
import type { Json } from "@/lib/supabase/types";

export type SiteContentActionResult = { error: string } | { success: true };

/**
 * What `publish_site_content` refuses a legal publish for when the tenant
 * requires a second approver (#600), said in the words of the person it is
 * being said to.
 *
 * All three are reachable through an ordinary race rather than only through a
 * forged call: the gate can be switched on, or somebody else can save over the
 * draft, between this page rendering and the publish landing. So each one
 * explains what to do next rather than reporting that something went wrong.
 */
const PUBLISH_ERROR_MESSAGES: Record<string, string> = {
  APPROVAL_REQUIRED:
    "This organization requires a second approver on legal documents. Reopen the publish dialog and say what approved this text.",
  APPROVAL_SELF:
    "You saved this draft, so somebody else has to publish it. This organization requires a second approver on legal documents.",
  APPROVAL_DRAFTER_UNKNOWN:
    "Nobody is recorded as having written this draft, so a second approver cannot be confirmed. Save it again, then ask somebody else to publish it.",
};

/**
 * `value` is `Json` rather than `unknown` (#813 Phase 1): the slot's value is
 * on its way into a `jsonb` column, so the type that describes what that
 * column holds is the honest one. The registry still checks the *shape* --
 * `Json` only rules out what JSON cannot carry at all.
 */
export type SiteContentEntry = { key: string; value: Json };

/**
 * Stages the slots the editor changed as drafts (#793).
 *
 * Saving is no longer publishing: this writes `draft_value`, which nothing on
 * the public site reads. Every value is still checked against the registry
 * first -- the public site reads the published rows with no session behind it,
 * so a malformed value must be refused here rather than discovered by a
 * visitor -- and a `null` value is the "back to the registry default" draft.
 *
 * The write goes through an RPC because `site_content` is not writable by
 * `authenticated` at all; see the migration for why.
 */
export async function saveSiteContentDraftAction(
  entries: SiteContentEntry[],
): Promise<SiteContentActionResult> {
  if (entries.length === 0) return { success: true };

  for (const entry of entries) {
    const slot = contentSlot(entry.key);
    if (!slot) return { error: `Unknown content slot: ${entry.key}` };
    if (entry.value !== null && !isValidSlotValue(slot, entry.value)) {
      return { error: `${slot.label} has the wrong shape and was not saved.` };
    }
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("save_site_content_drafts", {
    p_entries: entries.map((entry) => ({
      key: entry.key,
      value: entry.value ?? null,
    })),
  });
  if (error) {
    return { error: "Could not save the draft. Please try again." };
  }

  // The portal reads its own writes; the public site is untouched until
  // publish, so nothing there needs revalidating.
  revalidatePath("/portal/website");
  return { success: true };
}

/** Drops the pending drafts for these slots, leaving what is published alone. */
export async function discardSiteContentDraftAction(
  keys: string[],
): Promise<SiteContentActionResult> {
  if (keys.length === 0) return { success: true };

  for (const key of keys) {
    if (!contentSlot(key)) return { error: `Unknown content slot: ${key}` };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("discard_site_content_drafts", {
    p_keys: keys,
  });
  if (error) {
    return { error: "Could not discard the draft. Please try again." };
  }

  revalidatePath("/portal/website");
  return { success: true };
}

/**
 * Publishes the named slots' drafts to the public site.
 *
 * The one call that changes what a visitor sees, which is why it is also where
 * the legal documents' approval gate sits -- in the RPC below rather than in
 * this action. `site_content` is not writable by `authenticated` at all, so
 * `publish_site_content` is the only path onto the public site and therefore
 * the only place a gate cannot be gone around (#600). What happens here is
 * only the tidying: the approval is trimmed, capped and dropped when it is
 * blank, so the database is asked to store what somebody actually typed.
 */
export async function publishSiteContentAction(
  keys: string[],
  approval?: LegalPublishApproval | null,
): Promise<SiteContentActionResult> {
  if (keys.length === 0) return { success: true };

  for (const key of keys) {
    if (!contentSlot(key)) return { error: `Unknown content slot: ${key}` };
  }

  const stated = completeApproval(approval);
  if (stated && stated.reference.length > APPROVAL_REFERENCE_MAX_LENGTH) {
    return {
      error: `Say what approved this in ${APPROVAL_REFERENCE_MAX_LENGTH} characters or fewer; the detail belongs in the review notes.`,
    };
  }
  if (stated && stated.notes.length > REVIEW_NOTES_MAX_LENGTH) {
    return {
      error: `Review notes have to be ${REVIEW_NOTES_MAX_LENGTH} characters or fewer.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  // What the site collected at the moment this text went live (#1292), so the
  // portal can say later that the configuration has moved on from a document
  // only the organization can rewrite. Computed here, where the tenant the
  // administrator has *selected* is knowable -- the same split the starter
  // document on the editor observes -- and written by the RPC inside the
  // publish transaction, so the publish cannot succeed while the fingerprint
  // silently does not.
  const legalSurface = keys.some(isLegalSlotKey)
    ? {
        surfaces: surfaceKeys(
          collectionSurface(
            ...(await Promise.all([
              getTenantPageVisibility(supabase),
              getTenantModules(supabase),
              getTenantAsksProfileQuestions(supabase),
            ])),
          ),
        ),
      }
    : null;

  const { error } = await supabase.rpc("publish_site_content", {
    p_keys: keys,
    p_legal_surface: legalSurface,
    p_approval: stated,
  });
  if (error) {
    return {
      error:
        PUBLISH_ERROR_MESSAGES[error.message] ??
        "Could not publish this content. Please try again.",
    };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
