"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import type { Json } from "@/lib/supabase/types";
import {
  writeAppSetting,
  type SettingActionResult,
} from "@/lib/settings/write-app-setting";
import {
  APP_ICON_URL_TOKEN,
  BRAND_COLOR_TOKENS,
  MAX_ACCENT_STOPS,
  TYPOGRAPHY_TOKEN,
  brandSettingKey,
  normalizeHexColor,
  typographySet,
} from "@/lib/branding";
import {
  FISCAL_YEAR_SETTING_KEY,
  isFiscalYearStartMonth,
} from "@/lib/fiscal-year";
import {
  SALES_TAX_RATE_SETTING_KEY,
  isSalesTaxRate,
  MAX_SALES_TAX_RATE,
} from "@/lib/sales-tax";
import { ORG_TIMEZONE_SETTING_KEY, isOrgTimeZone } from "@/lib/org-timezone";
import {
  LEXICON_TERMS,
  MAX_LEXICON_TERM_LENGTH,
  lexiconSettingKey,
} from "@/lib/lexicon";
import {
  MAX_PERSON_ROLE_LABEL_LENGTH,
  PERSON_ROLES,
  PERSON_ROLE_LABELS_SETTING_KEY,
  personRoleLabelField,
  type PersonRoleKey,
  type PersonRoleLabel,
} from "@/lib/person-roles";
import { EMAIL_ENABLED_SETTING_KEY } from "@/lib/notifications/kinds";
import { OPS_REPORT_RECIPIENTS_SETTING_KEY } from "@/lib/notifications/ops-report";
import {
  FROM_ADDRESS_SETTING_KEY,
  REPLY_TO_SETTING_KEY,
  isAllowedFromAddress,
  isEmailAddress,
  verifiedSendingDomains,
} from "@/lib/email/identity";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { scheduleOutageSnapshotSync } from "@/lib/outage/sync";

export type { SettingActionResult };

/** This page's route, revalidated by every action below. Renamed by #992. */
const SETTINGS_PATH = "/portal/administration/organization-settings";

/**
 * Generic upsert, reusable for any future app_settings key without a new
 * migration.
 *
 * The check and the write moved to `writeAppSetting` when #990 split these
 * actions across two sections -- Layout, Page visibility and Legal documents
 * went to Website and took their actions with them, and one rule for who may
 * write an `app_settings` row should not exist in two files.
 */
export async function updateAppSettingAction(
  key: string,
  value: Json,
): Promise<SettingActionResult> {
  return writeAppSetting(key, value, [SETTINGS_PATH]);
}

export async function updateExpenseApprovalThresholdAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const raw = String(formData.get("threshold") ?? "").trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Threshold must be a positive number." };
  }

  return updateAppSettingAction("finance.expense_approval_threshold", value);
}

export async function updateReimbursementApprovalThresholdAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const raw = String(formData.get("threshold") ?? "").trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Threshold must be a positive number." };
  }

  return updateAppSettingAction(
    "finance.reimbursement_approval_threshold",
    value,
  );
}

/**
 * The org's default sales tax rate, as a percent (#997). The register prefills
 * it on every sale; a change here reaches the next sale and never a past one,
 * because `record_product_sale` snapshots the rate on the row.
 *
 * Three decimals, matching `sales.tax_rate`'s numeric(6,3): combined
 * state/county/city rates are quoted to the thousandth.
 */
export async function updateSalesTaxRateAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const raw = String(formData.get("rate") ?? "").trim();
  const rate = raw === "" ? NaN : Math.round(Number(raw) * 1000) / 1000;
  if (!isSalesTaxRate(rate)) {
    return {
      error: `Tax rate must be between 0 and ${MAX_SALES_TAX_RATE} percent.`,
    };
  }

  return updateAppSettingAction(SALES_TAX_RATE_SETTING_KEY, rate);
}

/**
 * Sets the month the org's fiscal year starts in (issue: define fiscal year).
 * Every annual figure in the portal reads this, so a bad value would quietly
 * skew reports rather than fail loudly -- hence the range check here on top of
 * the dropdown's own constraint.
 */
export async function updateFiscalYearStartMonthAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const raw = String(formData.get("startMonth") ?? "").trim();
  const startMonth = Number(raw);
  if (!isFiscalYearStartMonth(startMonth)) {
    return { error: "Pick a month between January and December." };
  }

  return updateAppSettingAction(FISCAL_YEAR_SETTING_KEY, startMonth);
}

/**
 * Sets the zone the organization's reporting days are cut in (#1065). A sale
 * rung at 7pm on the last day of February belongs in February, and only a zone
 * says which day that instant was.
 *
 * Restricted to the zones the portal offers, the same closed list the event
 * and artwork-call forms use: `at time zone` in the reporting RPCs would raise
 * on a value Postgres does not know, and a zone nobody can pick in this
 * dropdown is a zone nobody could correct here either.
 */
export async function updateOrgTimeZoneAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const zone = String(formData.get("timeZone") ?? "").trim();
  if (!isOrgTimeZone(zone)) {
    return { error: "Pick one of the listed time zones." };
  }

  return updateAppSettingAction(ORG_TIMEZONE_SETTING_KEY, zone);
}

/**
 * Shows or hides a whole section of the public site (issue #584). The write is
 * audit-logged by the app_settings trigger, which is what makes the toggle
 * usable as a record of the board's approval.
 */
/**
 * The organization's outbound email kill switch (#488). Off means this tenant
 * sends nothing at all -- not the daily task digest, not anything a later
 * ticket adds -- whatever any individual has turned on for themselves. Like
 * every other setting here, the write is audit-logged by the app_settings
 * trigger, which is what makes turning it off a record rather than a rumour.
 */
export async function updateEmailNotificationsEnabledAction(
  enabled: boolean,
): Promise<SettingActionResult> {
  return updateAppSettingAction(EMAIL_ENABLED_SETTING_KEY, enabled);
}

/**
 * Who receives the daily leadership ops report (#743).
 *
 * Stored as an array rather than the raw string so the job never has to guess
 * at a separator, and validated here rather than only in the job: an address
 * that is silently dropped at send time looks, from this page, exactly like
 * one that was saved. Clearing the field switches the report off for this
 * tenant -- app_settings has no delete grant, so an empty list is how "off"
 * is written -- app_settings has no delete grant.
 *
 * The write is audit-logged by the app_settings trigger, which is the point:
 * changing who sees the organization's daily operating picture is a
 * governance act, not a preference.
 */
export async function updateOpsReportRecipientsAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const raw = String(formData.get("recipients") ?? "").trim();
  const entries = raw ? raw.split(/[,;\s]+/).filter(Boolean) : [];

  const invalid = entries.filter(
    (entry) => !isEmailAddress(entry.toLowerCase()),
  );
  if (invalid.length > 0) {
    return {
      error: `Not an email address: ${invalid.slice(0, 3).join(", ")}.`,
    };
  }

  const recipients = [
    ...new Set(entries.map((entry) => entry.toLowerCase())),
  ].sort();
  return updateAppSettingAction(OPS_REPORT_RECIPIENTS_SETTING_KEY, recipients);
}

/**
 * Who this tenant's mail comes from, and where a reply to it goes (#857).
 *
 * One action for both fields because they are one idea -- the identity a
 * recipient sees -- and because updateBrandingAction below is the precedent for
 * writing several app_settings rows at once.
 *
 * The From address is checked against the same rule the sender applies, but
 * make no mistake about which one is the control: updateAppSettingAction above
 * takes a free-form key, so anyone holding `system_settings:manage` can write
 * `notifications.from_address` without ever reaching this function. The
 * enforcement lives in resolveMailIdentity() at send time; what happens here is
 * that an administrator is told why a value will not work, instead of saving
 * something that is silently ignored every morning afterwards.
 *
 * The Reply-To gets no such check. A From address is a claim about who sent a
 * message; a Reply-To is a routing preference, and any real mailbox answers it.
 *
 * Both writes are audit-logged by the app_settings trigger. A blank field
 * clears its row to "" -- app_settings has no delete grant.
 */
export async function updateSenderIdentityAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  const replyTo = String(formData.get("replyTo") ?? "")
    .trim()
    .toLowerCase();
  if (replyTo && !isEmailAddress(replyTo)) {
    return { error: `Not an email address: ${replyTo}.` };
  }

  const fromAddress = String(formData.get("fromAddress") ?? "")
    .trim()
    .toLowerCase();
  if (fromAddress) {
    if (!isEmailAddress(fromAddress)) {
      return { error: `Not an email address: ${fromAddress}.` };
    }

    const tenantId = currentTenant(await getTenantContext(supabase))?.id;
    const { data: tenant } = tenantId
      ? await supabase
          .from("tenants")
          .select("custom_domain")
          .eq("id", tenantId)
          .maybeSingle()
      : { data: null };

    const tenantCustomDomain = (tenant?.custom_domain as string) ?? null;
    const verifiedDomains = verifiedSendingDomains(
      process.env.EMAIL_FROM ?? null,
    );
    if (
      !isAllowedFromAddress(fromAddress, {
        verifiedDomains,
        tenantCustomDomain,
      })
    ) {
      return {
        error: tenantCustomDomain
          ? `Mail can only be sent from an address at ${tenantCustomDomain}, once your platform operator has set that domain up for sending.`
          : "Your organization has no sending domain yet. Ask your platform operator to set one up.",
      };
    }
  }

  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: REPLY_TO_SETTING_KEY, value: replyTo },
      { key: FROM_ADDRESS_SETTING_KEY, value: fromAddress },
    ],
    { onConflict: "tenant_id,key" },
  );
  if (error) {
    return { error: "Could not save these settings. Please try again." };
  }

  revalidatePath(SETTINGS_PATH);
  return { success: true };
}

/**
 * Saves the tenant's branding (#707 Phase 4): one app_settings row per
 * colour token, the accent stops, the logo and the typography set (#1261). A
 * blank field clears its row to an empty value, which the readers treat as
 * unset -- app_settings has no delete grant.
 */
export async function updateBrandingAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  const rows: { key: string; value: Json }[] = [];
  for (const token of BRAND_COLOR_TOKENS) {
    const raw = String(formData.get(token.key) ?? "").trim();
    if (!raw) {
      rows.push({ key: brandSettingKey(token.key), value: "" });
      continue;
    }
    const color = normalizeHexColor(raw);
    if (!color) {
      return {
        error: `${token.label} must be a six-digit hex colour like ${token.defaultValue}.`,
      };
    }
    rows.push({ key: brandSettingKey(token.key), value: color });
  }

  const stopsRaw = String(formData.get("accent_stops") ?? "").trim();
  if (!stopsRaw) {
    rows.push({ key: brandSettingKey("accent_stops"), value: "" });
  } else {
    const stops = stopsRaw
      .split(",")
      .map((stop) => normalizeHexColor(stop))
      .filter((stop): stop is string => stop !== null);
    if (stops.length === 0 || stops.length !== stopsRaw.split(",").length) {
      return {
        error:
          "Accent colours must be six-digit hex colours separated by commas.",
      };
    }
    if (stops.length > MAX_ACCENT_STOPS) {
      return { error: `Use at most ${MAX_ACCENT_STOPS} accent colours.` };
    }
    rows.push({ key: brandSettingKey("accent_stops"), value: stops });
  }

  rows.push({
    key: brandSettingKey("logo_url"),
    value: String(formData.get("logo_url") ?? "").trim(),
  });
  // Not validated beyond the trim, same as the logo: it is a URL an admin
  // pasted, and `/api/app-icon` refuses anything that does not come back as a
  // raster image and draws the generated initials instead (#1083).
  rows.push({
    key: brandSettingKey(APP_ICON_URL_TOKEN),
    value: String(formData.get(APP_ICON_URL_TOKEN) ?? "").trim(),
  });

  // The typography set (#1261). Checked against the registry here so an
  // administrator is told a value did not take, rather than saving a row that
  // `typographySet()` silently disowns on the way out; the registry check in
  // `brandingFromRows()` is still what keeps anything unknown out of the
  // `<style>` block, since this action is not the only way a row is written.
  const typography = String(formData.get(TYPOGRAPHY_TOKEN) ?? "").trim();
  if (typography && !typographySet(typography)) {
    return { error: "Pick one of the listed typefaces." };
  }
  rows.push({ key: brandSettingKey(TYPOGRAPHY_TOKEN), value: typography });

  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "tenant_id,key" });
  if (error) {
    return { error: "Could not save the branding. Please try again." };
  }

  // The outage page's copy of this branding (#1896).
  const tenantId = currentTenant(await getTenantContext(supabase))?.id;
  if (tenantId) scheduleOutageSnapshotSync(tenantId);

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * The organization's own words for what it lends (#896).
 *
 * Same shape as `updateBrandingAction` above and for the same reasons: several
 * `app_settings` rows written at once, a blank field cleared to `""` rather
 * than deleted (the table has no delete grant), and the write audit-logged by
 * the table's own trigger.
 *
 * The only validation is a length cap. A term is a noun an organization chose
 * for itself -- "Pantry", "Instrument library", "Herramientas" -- and refusing
 * anything but a word list would be the platform deciding what a nonprofit is
 * allowed to call its own programme. The cap exists because these render in
 * navigation, where a sentence would break the layout rather than the meaning.
 */
export async function updateLexiconAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  const rows: { key: string; value: Json }[] = [];
  for (const term of LEXICON_TERMS) {
    const value = String(formData.get(term.key) ?? "").trim();
    if (value.length > MAX_LEXICON_TERM_LENGTH) {
      return {
        error: `${term.label} must be ${MAX_LEXICON_TERM_LENGTH} characters or fewer.`,
      };
    }
    rows.push({ key: lexiconSettingKey(term.key), value });
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "tenant_id,key" });
  if (error) {
    return { error: "Could not save these words. Please try again." };
  }

  revalidatePath(SETTINGS_PATH);
  // Every portal page: the sidebar and the breadcrumbs read these, and they
  // are rendered by the layout rather than by any one route.
  revalidatePath("/portal", "layout");
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * What this organization calls the seven person roles (#911).
 *
 * One row rather than twelve: the whole map is the value of
 * `people.role_labels`, so a save is atomic and the panel's "reset" is an empty
 * object rather than twelve blank strings. A word the administrator left blank
 * is left out of the map entirely -- an unset word is the platform's word, and
 * storing `""` for it would make the stored map unreadable as "what this tenant
 * chose".
 */
export async function updatePersonRoleLabelsAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  const labels: Partial<Record<PersonRoleKey, Partial<PersonRoleLabel>>> = {};
  for (const role of PERSON_ROLES) {
    const own: Partial<PersonRoleLabel> = {};
    for (const form of ["singular", "plural"] as const) {
      const value = String(
        formData.get(personRoleLabelField(role.key, form)) ?? "",
      ).trim();
      if (value.length > MAX_PERSON_ROLE_LABEL_LENGTH) {
        return {
          error: `${role.default[form]} must be ${MAX_PERSON_ROLE_LABEL_LENGTH} characters or fewer.`,
        };
      }
      if (value) own[form] = value;
    }
    if (Object.keys(own).length > 0) labels[role.key] = own;
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: PERSON_ROLE_LABELS_SETTING_KEY, value: labels },
      { onConflict: "tenant_id,key" },
    );
  if (error) {
    return { error: "Could not save these words. Please try again." };
  }

  revalidatePath(SETTINGS_PATH);
  // Every portal page: the sidebar, the breadcrumbs and the command palette
  // read these, and the layout renders all three.
  revalidatePath("/portal", "layout");
  return { success: true };
}
