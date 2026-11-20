"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { mintInviteLink } from "@/lib/auth/invite-link";
import { getRequestOrigin } from "@/lib/request-origin";
import { friendlyError } from "@/lib/db-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { scheduleOutageSnapshotSync } from "@/lib/outage/sync";
import {
  LEGAL_PUBLICATION_PREFIX,
  moduleGate,
  resolveInForce,
} from "@/lib/legal-documents";
import type { PlatformTenant, TenantModule } from "./platform-shared";

export type { PlatformTenant, TenantModule } from "./platform-shared";

/**
 * Every action here re-checks the permission before calling its RPC, the way
 * every other Administration action does -- and every RPC checks all three
 * conditions again for itself (`require_platform_operator`). The duplication is
 * the point: the action's check is what turns a refusal into a message, and the
 * database's is what makes it true. Only `provisionTenantAction` reaches a
 * service-role client, and it does so after both.
 */
async function guard() {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "platform_tenants", "manage");
  return { supabase, denied };
}

export async function listTenantsAction(): Promise<
  { data: PlatformTenant[] } | { error: string }
> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  const { data, error } = await supabase.rpc("platform_list_tenants");
  if (error) return { error: "Could not load tenants. Please try again." };
  return { data: (data ?? []) as PlatformTenant[] };
}

export async function provisionTenantAction(input: {
  name: string;
  slug: string;
  customDomain: string;
  plan: string;
  adminEmail: string;
  /** Keys of the content packs to copy in as drafts (#895). */
  packKeys?: string[];
}): Promise<{ error: string } | { success: true; link: string | null }> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const adminEmail = input.adminEmail.trim();
  if (!name) return { error: "Enter the organization's name." };
  if (!slug) return { error: "Enter a slug." };

  const { error } = await supabase.rpc("platform_provision_tenant", {
    p_name: name,
    p_slug: slug,
    p_custom_domain: input.customDomain.trim() || null,
    p_plan: input.plan,
    p_admin_email: adminEmail || null,
    // Packs arrive as drafts, so a new organization starts with material
    // waiting to be read rather than a live page nobody there has seen (#895).
    p_pack_keys: input.packKeys?.length ? input.packKeys : null,
  });
  if (error) {
    return {
      error: friendlyError(
        error,
        "That slug or domain is already taken. Both have to be unique across the platform.",
        error.message ?? "Could not provision the tenant.",
      ),
    };
  }

  revalidatePath("/portal/platform");
  // The new tenant's outage page (#1896); full sync, as for a domain change.
  scheduleOutageSnapshotSync("all");

  // The tenant exists either way. A failure past this point is worth reporting
  // as "provisioned, link failed" rather than as a failure -- re-running
  // provisioning would collide on the slug, and the operator can mint the link
  // from the new tenant's own Users page or the CLI.
  if (!adminEmail) return { success: true, link: null };

  // #759 applies here too, and arguably most of all: minting a link to an
  // address that already has an account is the takeover primitive, and this
  // page is the one that makes it reachable from a browser rather than a
  // shell. The operator is trusted -- they are the person who would otherwise
  // run `tenant:provision` as service_role -- but "trusted" is not a reason to
  // leave the primitive sitting on a page. A first admin who already has an
  // account signs in with it and claims the staged grant; no link is needed,
  // and the CLI remains the escape hatch for the case that needs one.
  const { data: ours } = await supabase.rpc("email_is_this_tenants_to_invite", {
    p_email: adminEmail,
  });
  if (!ours) return { success: true, link: null };

  // The link has to land on the tenant's own domain, not on ours, or the first
  // admin signs in somewhere that is not their site. Falls back to the origin
  // the operator is on when the tenant has no domain yet.
  const domain = input.customDomain.trim().toLowerCase();
  const origin = domain ? `https://${domain}` : await getRequestOrigin();
  const minted = await mintInviteLink(adminEmail, origin);
  return { success: true, link: "error" in minted ? null : minted.link };
}

export async function setTenantDomainAction(
  tenantId: string,
  customDomain: string,
): Promise<{ error: string } | { success: true }> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  const { error } = await supabase.rpc("platform_set_tenant_domain", {
    p_tenant_id: tenantId,
    p_custom_domain: customDomain.trim() || null,
  });
  if (error) {
    return {
      error: friendlyError(
        error,
        "Another tenant already has that domain.",
        error.message ?? "Could not set the domain.",
      ),
    };
  }
  revalidatePath("/portal/platform");
  // The full sync, not this tenant's: only it deletes the old domain's key.
  scheduleOutageSnapshotSync("all");
  return { success: true };
}

/**
 * A tenant's module entitlements (#901). Loaded when the dialog opens rather
 * than with the tenant list: it is one RPC per organization, and the operator
 * opens it for one at a time.
 */
export async function listTenantModulesAction(
  tenantId: string,
): Promise<{ data: TenantModule[] } | { error: string }> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  const { data, error } = await supabase.rpc("platform_list_tenant_modules", {
    p_tenant_id: tenantId,
  });
  if (error) return { error: "Could not load this organization's modules." };

  const modules = (data ?? []) as TenantModule[];
  return { data: await withLegalGates(tenantId, modules) };
}

/**
 * Whether a legal document this tenant has not adopted is standing in the way
 * of a module (#1295).
 *
 * Read with a service-role client, not the operator's own: `app_settings` is
 * scoped by RLS to the tenant the *caller* belongs to, and the operator is
 * looking at somebody else's organization. It reaches for the admin client
 * only after `guard()` has checked `platform_tenants:manage`, and it reads one
 * boolean per legal document -- no customer data crosses the boundary.
 *
 * Fails **closed**: an unreadable settings table leaves every gated module
 * blocked with its reason showing, because turning on public accounts for an
 * organization whose terms we could not confirm is the outcome the gate exists
 * to prevent. The operator sees the refusal and can try again.
 */
async function withLegalGates(
  tenantId: string,
  modules: TenantModule[],
): Promise<TenantModule[]> {
  if (!modules.some((entry) => moduleGate(entry.module_key))) return modules;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .like("key", `${LEGAL_PUBLICATION_PREFIX}%`);
  if (error) {
    // The id goes beside the message rather than inside it: it arrives as a
    // Server Action argument, so it is caller-controlled, and interpolating it
    // into the format string lets a caller forge log lines (CodeQL
    // js/log-injection, js/tainted-format-string).
    console.error(
      "[platform] could not read a tenant's legal publication; every gated module is showing as blocked",
      { tenantId, error },
    );
  }

  const stored = new Map(
    (data ?? []).map((row) => [
      String(row.key).slice(LEGAL_PUBLICATION_PREFIX.length),
      row.value,
    ]),
  );

  return modules.map((entry) => {
    const found = moduleGate(entry.module_key);
    if (!found) return entry;
    const inForce = resolveInForce(
      found.document,
      stored.get(found.document.key),
    );
    // Only an *enable* is gated. A module already on -- a tenant that adopted
    // its terms and then, somehow, has no row -- is left alone rather than
    // having its switch frozen in the on position.
    return inForce || entry.enabled
      ? entry
      : { ...entry, blocked_reason: found.gate.refuseEnabling };
  });
}

export async function setTenantModuleAction(
  tenantId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<{ error: string } | { success: true }> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  // The dialog already disables a blocked switch; this is the same refusal for
  // a call that did not come from it (#1295). The disabled control is what
  // explains the rule, and this is what makes it true.
  if (enabled && moduleGate(moduleKey)) {
    const [entry] = await withLegalGates(tenantId, [
      { module_key: moduleKey, enabled: false } as TenantModule,
    ]);
    if (entry.blocked_reason) return { error: entry.blocked_reason };
  }

  const { error } = await supabase.rpc("platform_set_tenant_module", {
    p_tenant_id: tenantId,
    p_module_key: moduleKey,
    p_enabled: enabled,
  });
  // The RPC's refusals are written to be read -- "The people module is core and
  // cannot be turned off for anyone" is the whole explanation -- so they are
  // passed through rather than replaced with a generic line.
  if (error) {
    return { error: error.message ?? "Could not change that module." };
  }
  revalidatePath("/portal/platform");
  return { success: true };
}

export async function setTenantStatusAction(
  tenantId: string,
  status: string,
): Promise<{ error: string } | { success: true }> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  const { error } = await supabase.rpc("platform_set_tenant_status", {
    p_tenant_id: tenantId,
    p_status: status,
  });
  if (error) {
    return { error: error.message ?? "Could not change the status." };
  }
  revalidatePath("/portal/platform");
  // An inactive tenant's domain resolves to nobody, so its snapshot goes too.
  scheduleOutageSnapshotSync("all");
  return { success: true };
}
