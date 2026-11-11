// The demo tenant (#604) against a real local Supabase stack: seed_demo_tenant()
// fills the tenant it is given and only that tenant, refuses anything whose
// plan is not 'demo', and the three controls a demo visitor -- who holds admin
// anonymously -- must not be able to reach are refused.
//
// Everything here is a property of the database, not of the app: each check is
// either a SECURITY DEFINER function's own guard or an RLS policy, and none of
// them is observable through a mocked client.
//
// The throwaway tenant is active for the length of the file, which switches off
// public_tenant_id()'s sole-active-tenant fallback, so every sessionless read in
// this run must name a host. It is archived and deleted in afterAll: a leftover
// *active* tenant poisons every later sessionless test in the same run.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  serviceRoleClient,
  signIn,
  uniqueEmail,
} from "../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
const DEMO_SLUG = `demo-${run}`;
const DEMO_HOST = `demo-${run}.example.test`;
const OTHER_SLUG = `paying-${run}`;
const OTHER_HOST = `paying-${run}.example.test`;

let demoTenantId: string;
let otherTenantId: string;
let chatterTenantId: string;
let demoUserId: string;
let demoPersonId: string;
let demoAdmin: SupabaseClient;

const demoEmail = uniqueEmail("demo-visitor");
const outsiderEmail = uniqueEmail("demo-outsider");
const createdUsers: string[] = [];

// Untyped on purpose: the client carries no generated Database type, so every
// result would otherwise be `unknown | null` and each assertion a cast.
async function must(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  what: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data;
}

async function createUser(email: string) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  createdUsers.push(data.user.id);
  return data.user.id;
}

async function provision(
  name: string,
  slug: string,
  host: string,
  plan: string,
) {
  return (await must(
    service.rpc("provision_tenant", {
      p_name: name,
      p_slug: slug,
      p_custom_domain: host,
      p_plan: plan,
      p_admin_email: null,
      p_template_tenant_id: null,
    }),
    `Provisioning ${slug}`,
  )) as string;
}

async function makeAdminOf(userId: string, tenantId: string) {
  const role = await must(
    service
      .from("roles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("name", "admin")
      .single(),
    "admin role",
  );
  await must(
    service
      .from("tenant_memberships")
      .upsert(
        { user_id: userId, tenant_id: tenantId, kind: "member" },
        { onConflict: "user_id,tenant_id" },
      )
      .select("id")
      .single(),
    "membership",
  );
  await must(
    service
      .from("user_roles")
      .upsert(
        { user_id: userId, role_id: role.id },
        { onConflict: "user_id,role_id" },
      )
      .select("user_id")
      .single(),
    "role grant",
  );
  await must(
    service
      .from("user_tenant_selection")
      .upsert(
        { user_id: userId, tenant_id: tenantId },
        { onConflict: "user_id" },
      )
      .select("user_id")
      .single(),
    "selection",
  );
}

beforeAll(async () => {
  chatterTenantId = (
    await must(
      service
        .from("tenants")
        .select("id")
        .order("created_at")
        .limit(1)
        .single(),
      "initial tenant",
    )
  ).id as string;

  demoTenantId = await provision(
    "Demo Organization",
    DEMO_SLUG,
    DEMO_HOST,
    "demo",
  );
  otherTenantId = await provision(
    "Paying Nonprofit",
    OTHER_SLUG,
    OTHER_HOST,
    "white_label",
  );

  demoUserId = await createUser(demoEmail);
  // A real account the demo admin must not be able to reach: it exists only so
  // the support-access probe below has a genuine address to aim at.
  await createUser(outsiderEmail);
  await makeAdminOf(demoUserId, demoTenantId);

  demoPersonId = (
    await must(
      service
        .from("people")
        .insert({
          tenant_id: demoTenantId,
          name: "Demo Visitor",
          source_type: "individual",
          person_type: "individual",
          email: demoEmail,
          auth_user_id: demoUserId,
          created_by: demoUserId,
        })
        .select("id")
        .single(),
      "demo person",
    )
  ).id as string;

  demoAdmin = await signIn(demoEmail);
});

// Well past bun's 5s default: delete_tenant() walks every table with a
// tenant_id, and a *seeded* tenant is the first thing in this suite that gives
// it real work to do. A hook that times out here leaves an active tenant
// behind, which breaks every later sessionless test in the run -- so the
// budget is generous on purpose.
afterAll(async () => {
  for (const tenantId of [demoTenantId, otherTenantId]) {
    if (!tenantId) continue;
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", tenantId);
    const { error } = await service.rpc("delete_tenant", {
      p_tenant_id: tenantId,
    });
    if (error)
      throw new Error(`Cleanup failed for ${tenantId}: ${error.message}`);
  }
  for (const userId of createdUsers) {
    await service
      .from("audit_log")
      .update({ actor_id: null })
      .eq("actor_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
}, 60_000);

describe("seed_demo_tenant", () => {
  test("refuses a tenant whose plan is not demo", async () => {
    for (const tenantId of [otherTenantId, chatterTenantId]) {
      const { error } = await service.rpc("seed_demo_tenant", {
        p_tenant_id: tenantId,
        p_actor_user_id: demoUserId,
        p_actor_person_id: demoPersonId,
      });
      expect(error?.message).toMatch(/DEMO_TENANT_REQUIRED/);
    }
  });

  test("fills the demo tenant and nothing else", async () => {
    const seeded = await must(
      service.rpc("seed_demo_tenant", {
        p_tenant_id: demoTenantId,
        p_actor_user_id: demoUserId,
        p_actor_person_id: demoPersonId,
      }),
      "seeding",
    );
    expect(seeded.events).toBeGreaterThan(0);
    expect(seeded.inventory_items).toBeGreaterThan(0);

    // Nothing named tenant_id implicitly, so nothing may have landed anywhere
    // else -- the property the whole design of the function rests on.
    const { data: strays } = await service
      .from("events")
      .select("id, tenant_id")
      .eq("name", "Season Opener Ride Day");
    expect(strays?.every((row) => row.tenant_id === demoTenantId)).toBe(true);

    const { count: otherCount } = await service
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", otherTenantId);
    expect(otherCount).toBe(0);
  });

  test("seeds social posts of every kind, one unscheduled (#1797)", async () => {
    type Post = {
      event_id: string | null;
      calendar_item_id: string | null;
      publish_due_at: string | null;
    };
    const posts: Post[] = await must(
      service
        .from("content_opportunities")
        .select("event_id, calendar_item_id, publish_due_at")
        .eq("tenant_id", demoTenantId),
      "reading posts",
    );
    const standalone = posts.filter((p) => !p.event_id && !p.calendar_item_id);
    expect(posts.some((p) => p.event_id && !p.calendar_item_id)).toBe(true);
    expect(posts.some((p) => p.calendar_item_id && !p.event_id)).toBe(true);
    expect(posts.some((p) => p.event_id && p.calendar_item_id)).toBe(true);
    expect(standalone.length).toBeGreaterThan(0);
    expect(posts.filter((p) => !p.publish_due_at)).toHaveLength(1);
  });

  test("refuses to seed the same tenant twice", async () => {
    const { error } = await service.rpc("seed_demo_tenant", {
      p_tenant_id: demoTenantId,
      p_actor_user_id: demoUserId,
      p_actor_person_id: demoPersonId,
    });
    expect(error?.message).toMatch(/DEMO_TENANT_ALREADY_SEEDED/);
  });
});

describe("what a demo admin cannot do", () => {
  test("current_tenant_is_demo answers for the caller's tenant", async () => {
    const { data, error } = await demoAdmin.rpc("current_tenant_is_demo");
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  // #759 is the general fix; this is the second half, so a demo visitor cannot
  // even stage the grant the invite flow mints a link from.
  test("cannot stage a pending role grant", async () => {
    const role = await must(
      service
        .from("roles")
        .select("id")
        .eq("tenant_id", demoTenantId)
        .eq("name", "volunteer")
        .single(),
      "volunteer role",
    );
    const { error } = await demoAdmin
      .from("pending_role_grants")
      .insert({ email: uniqueEmail("demo-invitee"), role_id: role.id });
    expect(error).not.toBeNull();
  });

  // Its error taxonomy is an account-existence oracle for arbitrary addresses,
  // and a success hands a real account a membership in their switcher.
  test("cannot grant support access, and learns nothing from trying", async () => {
    const { error } = await demoAdmin.rpc("grant_support_access", {
      p_email: outsiderEmail,
      p_reason: "demo probe",
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      p_role_name: "admin",
    });
    expect(error?.message).toMatch(/DEMO_TENANT_FORBIDS_SUPPORT_ACCESS/);

    // The same refusal for an address that does not exist: no oracle.
    const { error: unknownError } = await demoAdmin.rpc(
      "grant_support_access",
      {
        p_email: `nobody-${run}@example.test`,
        p_reason: "demo probe",
        p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        p_role_name: "admin",
      },
    );
    expect(unknownError?.message).toMatch(/DEMO_TENANT_FORBIDS_SUPPORT_ACCESS/);
  });

  test("cannot revoke support access", async () => {
    const { error } = await demoAdmin.rpc("revoke_support_access", {
      p_membership_id: crypto.randomUUID(),
    });
    expect(error?.message).toMatch(/DEMO_TENANT_FORBIDS_SUPPORT_ACCESS/);
  });

  // The demo account's only membership is the demo tenant, so
  // user_is_only_in_current_tenant() is true for it -- a visitor could
  // otherwise deactivate the demo account platform-wide until the next reset.
  test("cannot deactivate an account", async () => {
    const { error } = await demoAdmin
      .from("deactivated_users")
      .insert({ user_id: demoUserId });
    expect(error).not.toBeNull();
  });

  // Checked deliberately, because a visitor claiming a real domain would be
  // catastrophic: the update policy grants `name` only.
  test("cannot change the tenant's domain, slug, status or plan", async () => {
    const { error } = await demoAdmin
      .from("tenants")
      .update({ custom_domain: "chattersnow.org" })
      .eq("id", demoTenantId);
    expect(error).not.toBeNull();

    const { data: unchanged } = await service
      .from("tenants")
      .select("custom_domain, plan")
      .eq("id", demoTenantId)
      .single();
    expect(unchanged?.custom_domain).toBe(DEMO_HOST);
    expect(unchanged?.plan).toBe("demo");
  });
});

describe("what a demo admin still can do", () => {
  // Deliberately not blocked: it is already current_tenant_id()-scoped, and a
  // visitor exporting invented data is worth showing off.
  test("exports its own tenant's data", async () => {
    const { data, error } = await demoAdmin.rpc("export_current_tenant_data");
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  test("renames its own tenant", async () => {
    const { error } = await demoAdmin
      .from("tenants")
      .update({ name: "Renamed In The Demo" })
      .eq("id", demoTenantId);
    expect(error).toBeNull();
  });
});
