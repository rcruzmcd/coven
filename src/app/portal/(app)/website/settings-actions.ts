"use server";

import {
  getTenantModules,
  pageVisibilitySettingKey,
} from "@/lib/page-visibility";
import {
  gatesHolding,
  legalDocument,
  legalDocumentNoun,
  legalPublicationSettingKey,
} from "@/lib/legal-documents";
import {
  GIVEAWAY_RULES_ANSWER_MAX_LENGTH,
  GIVEAWAY_RULES_ANSWER_MAX_PARAGRAPHS,
  giveawayRulesAnswerField,
  giveawayRulesSettingKey,
} from "@/lib/giveaway-rules";
import {
  LEGAL_APPROVAL_SETTING_KEY,
  MINIMUM_APPROVERS,
} from "@/lib/legal-approval";
import { legalAcknowledgementSettingKey } from "@/lib/legal-acknowledgement";
import { conductProcessSetting, conductProcessSettingKey } from "@/lib/conduct";
import { PLATFORM_LEGAL_LAST_UPDATED } from "@/lib/legal-defaults";
import {
  getSiteContentApproverCount,
  getTenantLegalPublication,
  getTenantOwnLegalDocuments,
} from "@/lib/legal-publication";
import { resolveCurrentPerson } from "@/lib/auth/current-person";
import { checkPermission } from "@/lib/auth/permissions";
import { personDisplayName } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  LAYOUT_SLOTS,
  isLayoutValue,
  layoutSettingKey,
  type LayoutValue,
} from "@/lib/site-layout";
import {
  NAV_SETTING_SLOT,
  resolveNavSettings,
  type NavSettings,
} from "@/lib/public-nav";
import {
  writeAppSetting,
  type SettingActionResult,
} from "@/lib/settings/write-app-setting";
// The type is re-exported from @/lib/settings/write-app-setting rather than
// here: a "use server" module may only export async functions to its callers,
// and the panels want both.

/**
 * The three settings actions that came with their panels when #990 moved
 * Layout, Page visibility and Legal documents out of Administration.
 *
 * They still gate on `system_settings:manage` -- `writeAppSetting` is the
 * single check for every `app_settings` write, and the resource did not change
 * because the page moved. That is the reason the Website section's gate became
 * a two-resource union (`website/layout.tsx`) and the reason these three nav
 * entries ask for `system_settings:manage` rather than `site_content:view`: a
 * reader who can only see the link is a reader whose save would fail, and the
 * sidebar should not offer it.
 *
 * Every write here is audit-logged by the `app_settings` trigger, which is
 * what makes each of these a record of a decision rather than a rumour.
 */

// Each action revalidates its own panel, which is what the settings page did
// for all three before the move. The public site is deliberately not
// revalidated here either: that was not this action's job before #990 and
// making it so would be a caching change riding along with a nav one.
const LAYOUT_PATHS = ["/portal/website/page-layout"] as const;
const VISIBILITY_PATHS = ["/portal/website/page-visibility"] as const;
const LEGAL_PATHS = ["/portal/website/legal-documents"] as const;
const GIVEAWAY_RULES_PATHS = ["/portal/website/giveaway-rules"] as const;
// The approval gate is the one setting on this page that changes what another
// page does: the publish dialog in the editor asks for a reference and review
// notes only while it is on, so that page is revalidated too.
const LEGAL_APPROVAL_PATHS = [
  "/portal/website/legal-documents",
  "/portal/website",
] as const;

export async function updatePageVisibilityAction(
  slot: string,
  visible: boolean,
): Promise<SettingActionResult> {
  return writeAppSetting(
    pageVisibilitySettingKey(slot),
    visible,
    VISIBILITY_PATHS,
  );
}

/**
 * Puts a legal document in force on the public site, or takes it back out
 * (#859).
 *
 * Not the same decision as page visibility, and deliberately a different
 * action: a hidden section is content held back, while a document in force is
 * an organization saying "this text is ours and it governs using our site".
 * The privacy policy is refused outright rather than silently ignored -- it is
 * served for every tenant, always, and a call asking to take it down is a bug
 * worth hearing about rather than a no-op to swallow.
 */
export async function updateLegalPublicationAction(
  key: string,
  inForce: boolean,
): Promise<SettingActionResult> {
  const document = legalDocument(key);
  if (!document) return { error: "That is not a legal document." };
  if (document.alwaysInForce) {
    return { error: `The ${legalDocumentNoun(document)} is always served.` };
  }

  // A document a module depends on cannot be withdrawn while that module is on
  // (#1295), or the gate on the other side is one click from being empty: the
  // organization would be offering public accounts again with nothing
  // governing them. Refused here rather than in the database because this is
  // where the decision is made -- the same placement as the `alwaysInForce`
  // refusal above, and it leaves seeding, the demo reset and the e2e fixtures,
  // all of which write this row as `service_role`, free to set any state they
  // need to test.
  if (!inForce && document.gates.length > 0) {
    const supabase = await createSupabaseServerClient();
    const held = gatesHolding(document, await getTenantModules(supabase));
    if (held.length > 0) return { error: held[0].refuseWithdrawing };
  }

  // And the document with no platform text cannot be put in force before that
  // text exists (#686). The other three fall back to a neutral starting
  // document, so adopting one always serves something; adopting this one with
  // nothing written would put an organization's name on an empty page and,
  // worse, start refusing every event registration -- the registration flow
  // asks for the waiver the moment it is in force.
  //
  // Refused here for the same reason the withdrawal gate above is: this is
  // where the decision is made, and `service_role` writes from seeding, the
  // demo reset and the e2e fixtures stay free to set whatever state they are
  // testing. `publish_site_content()` holds the other direction, which is the
  // one that would empty a waiver already in force.
  if (inForce && !document.hasPlatformDefault) {
    const supabase = await createSupabaseServerClient();
    const own = await getTenantOwnLegalDocuments(supabase);
    if (!own.has(document.slotKey)) {
      return {
        error: `Write and publish your ${document.label.toLowerCase()} first. There is no starting text for it, so putting it in force would serve nothing.`,
      };
    }
  }

  return writeAppSetting(
    legalPublicationSettingKey(document.key),
    inForce,
    LEGAL_PATHS,
  );
}

/**
 * Records that somebody here has read the platform's text for a document this
 * organization serves (#1321).
 *
 * Not the same decision as putting a document in force, and deliberately a
 * third action rather than a flag on that one. Adopting the terms of use is a
 * decision about whether a document governs; this is a statement that a named
 * person read the words. The privacy policy has no adoption switch at all --
 * it is served for every tenant from the day it is provisioned, because the
 * forms are collecting from that day -- so for the one document where the
 * question matters most there is no other act to hang it on.
 *
 * What it writes is a record, not a permission: nothing here gates serving the
 * page, and #1321 is explicit that an unacknowledged default is a prompt and
 * never a 404. The policy must stay reachable while the forms collect.
 *
 * Both refusals below are the honest answer to a call that cannot mean
 * anything, rather than a no-op to swallow -- the same stance the
 * `alwaysInForce` refusal above takes. The panel offers the control in neither
 * state, so reaching either one is a bug worth hearing about.
 */
export async function acknowledgeLegalDocumentAction(
  key: string,
): Promise<SettingActionResult> {
  const document = legalDocument(key);
  if (!document) return { error: "That is not a legal document." };

  const supabase = await createSupabaseServerClient();
  // Checked here as well as inside `writeAppSetting`, unlike its neighbours,
  // because both refusals below describe this organization's own state. A
  // reader who reaches the Website section on `site_content:view` alone should
  // be told they cannot do this, not told what their tenant is serving and
  // then refused on the way out.
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  const [publication, ownDocuments] = await Promise.all([
    getTenantLegalPublication(supabase),
    getTenantOwnLegalDocuments(supabase),
  ]);

  if (!publication[document.key]) {
    return {
      error: `Your ${legalDocumentNoun(document)} is not being served, so there is nothing to confirm yet.`,
    };
  }
  // Publishing your own text is the confirmation. There is no platform
  // document in the way to have gone unread.
  if (ownDocuments.has(document.slotKey)) {
    return {
      error: `Your site serves your own ${legalDocumentNoun(document)}, not the platform's, so there is nothing of ours to confirm.`,
    };
  }

  // Captured from the session rather than accepted as an argument: this row's
  // whole value is that it names who read the text, and a Server Action's
  // arguments are whatever the caller sent.
  const person = await resolveCurrentPerson(supabase);

  return writeAppSetting(
    legalAcknowledgementSettingKey(document.key),
    {
      person_id: person?.id ?? null,
      person_name: personDisplayName(person, "") || null,
      acknowledged_at: new Date().toISOString(),
      // The version of the text that was read, which is what makes the record
      // go stale by itself when the platform edits the prose.
      platform_last_updated: PLATFORM_LEGAL_LAST_UPDATED,
    },
    LEGAL_PATHS,
  );
}

/**
 * Whether publishing a legal document here requires somebody other than the
 * person who drafted it (#600).
 *
 * The decision this setting exists to leave open is in `@/lib/legal-approval`:
 * a four-eyes rule on legal text is reasonable for an organization that has
 * the eyes, and a platform-wide one would leave a single-administrator tenant
 * unable to publish its own privacy policy at all. So it is the tenant's
 * choice, off until they make it.
 *
 * The refusal below is that same lockout, blocked at the door it arrives by:
 * switching the gate on in an organization where only one person can publish
 * website content means no legal document can be published by anybody, since
 * the only possible publisher is always the drafter. Refused with the reason
 * rather than saved -- and counted in the database, because how many *other*
 * people hold a permission is not a question a portal read can answer.
 *
 * Switching it back off is never refused. It is the way out of that state, and
 * a tenant that has lost its second administrator needs the way out to work.
 */
export async function updateLegalApprovalAction(
  required: boolean,
): Promise<SettingActionResult> {
  const supabase = await createSupabaseServerClient();
  // Checked here as well as inside `writeAppSetting`, like
  // `acknowledgeLegalDocumentAction` above: the refusal below describes this
  // organization's own staffing, which is not something to tell a reader who
  // could not have saved the setting anyway.
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  if (required) {
    const approvers = await getSiteContentApproverCount(supabase);
    if (approvers < MINIMUM_APPROVERS) {
      return {
        error:
          "Only one person here can publish website content, so nobody could ever be the second approver. Give someone else the Site content permission at Manage first, then switch this on.",
      };
    }
  }

  return writeAppSetting(
    LEGAL_APPROVAL_SETTING_KEY,
    required,
    LEGAL_APPROVAL_PATHS,
  );
}

/**
 * How much of a section the public site shows (#846). Validated against the
 * slot's own options rather than trusted from the client: this is a Server
 * Action, so the argument is whatever the caller sent, and a value nobody
 * offered would reach the home page as a layout nobody designed.
 */
export async function updateLayoutSettingAction(
  slot: string,
  value: LayoutValue,
): Promise<SettingActionResult> {
  const registered = LAYOUT_SLOTS.find((candidate) => candidate.key === slot);
  if (!registered || !isLayoutValue(registered, value)) {
    return { error: "That isn't one of the options for this setting." };
  }

  return writeAppSetting(layoutSettingKey(slot), value, LAYOUT_PATHS);
}

/**
 * The public site's top-level menu order and labels (#1726).
 *
 * Normalised through the same resolver the public site reads with, rather
 * than trusted from the client: unknown groups are dropped, missing ones are
 * appended, and an empty label is left out so the default stands. What is
 * stored is therefore always something the header can render.
 */
export async function updateNavSettingsAction(
  value: NavSettings,
): Promise<SettingActionResult> {
  const resolved = resolveNavSettings(value);
  return writeAppSetting(
    layoutSettingKey(NAV_SETTING_SLOT),
    resolved,
    LAYOUT_PATHS,
  );
}

/**
 * One of the answers every set of giveaway official rules is built from
 * (#1322).
 *
 * Validated against the registry rather than trusted from the client, like
 * the layout setting above: the key has to be one somebody was asked, or a
 * Server Action becomes a way to write arbitrary `app_settings` rows under the
 * `giveaway_rules.` prefix.
 *
 * Paragraphs in, paragraphs out, and a blank answer is stored as an empty
 * array rather than deleted -- `resolveGiveawayRulesAnswer` reads either as
 * unanswered, and keeping the row keeps the audit trail of somebody having
 * cleared it.
 */
export async function updateGiveawayRulesAnswerAction(
  key: string,
  paragraphs: string[],
): Promise<SettingActionResult> {
  const field = giveawayRulesAnswerField(key);
  if (!field)
    return { error: "That is not one of the giveaway rules questions." };

  const cleaned = paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, GIVEAWAY_RULES_ANSWER_MAX_PARAGRAPHS)
    .map((paragraph) => paragraph.slice(0, GIVEAWAY_RULES_ANSWER_MAX_LENGTH));

  return writeAppSetting(
    giveawayRulesSettingKey(field.key),
    cleaned,
    GIVEAWAY_RULES_PATHS,
  );
}

/**
 * One of the four numbers a tenant's own code of conduct commits it to (#687).
 *
 * Edited here, beside the document whose words it restates, rather than in the
 * Conduct section: keeping the promise and the number that measures it on one
 * screen is what stops the two drifting, which they would the first time
 * somebody rewrote the text alone.
 *
 * `null` clears the setting, and clearing is a real answer rather than a reset
 * to a default -- there is no default. A tenant that has cleared all four gets
 * a case tracker with no deadline anywhere on it, which is the correct state
 * for the majority of tenants and the one that must never break.
 *
 * Cleared is stored as `0`, not as a missing row: `app_settings.value` is
 * `not null` and `authenticated` holds no delete on that table, both of which
 * are worth more than a tidier encoding here. `org_conduct_process` reads
 * anything that is not a positive integer as null, so 0 means "no commitment"
 * end to end -- and the row that stays behind is what carries the audit entry
 * for somebody having cleared it.
 *
 * Validated against the registry, like the layout setting and the giveaway
 * answers: without it the `conduct.` prefix would be a way to write arbitrary
 * `app_settings` rows from the browser.
 */
export async function updateConductProcessAction(
  key: string,
  value: number | boolean | null,
): Promise<SettingActionResult> {
  const setting = conductProcessSetting(key);
  if (!setting) {
    return { error: "That is not one of the conduct process settings." };
  }

  if (value !== null) {
    if (setting.kind === "boolean" && typeof value !== "boolean") {
      return { error: "That isn't one of the options for this setting." };
    }
    if (
      setting.kind === "number" &&
      (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    ) {
      return {
        error: "Enter a whole number of at least 1, or leave it blank.",
      };
    }
  }

  return writeAppSetting(conductProcessSettingKey(key), value ?? 0, [
    "/portal/website/legal-documents",
    "/portal/conduct",
  ]);
}
