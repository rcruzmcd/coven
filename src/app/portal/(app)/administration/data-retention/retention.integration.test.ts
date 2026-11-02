/**
 * #602. The retention purge, against a real database.
 *
 * These have to be integration tests rather than unit tests: the rules are
 * SQL, two of the clocks read `updated_at` columns maintained by
 * `set_updated_at` triggers (so no client can backdate them -- which is why
 * `run_retention_purge` takes `p_as_of` at all), and the whole point of the
 * eligibility rule is a `pg_constraint` walk that has no meaning outside
 * Postgres.
 *
 * Every clock gets a just-inside / just-outside pair. A retention job that
 * deletes a day early is a privacy feature that destroys records it was
 * supposed to keep, and a single "it deleted something" assertion would not
 * notice.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RETENTION_POLICIES } from "@/lib/retention";
import {
  SEEDED_USERS,
  adminClient,
  cleanupDonation,
  createAvailableGearItems,
  createPerson,
  createPublishedEvent,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
} from "@/../test/integration-setup";

/**
 * run_retention_purge is deliberately ungranted -- pg_cron runs it as the owner
 * and no client should be able to reach it, least of all with a p_as_of of its
 * own choosing. So the tests call it the way the scheduler does, through a
 * privileged connection, rather than the plan being weakened to make it
 * testable. Everything else here goes through the granted RPCs as a real admin
 * session, which is what the portal does.
 */
const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

const cleanups: Array<() => Promise<void>> = [];

/**
 * The tenant these tests own, provisioned in `beforeAll` below (#1379).
 *
 * Since Phase 5b (#707, 20260906160000) the rules, the runs and the run log are
 * per tenant, and `run_retention_purge` sweeps every active tenant when it is
 * given none -- returning null, because a sweep has no single run to name.
 * These tests are about one tenant's rules, and they need the run id back, so
 * they always name it.
 *
 * It used to be the seeded tenant, and that was the bug. The purge is
 * tenant-wide: at an `asOf` two years out every rule fires on every seeded row
 * past its period, and rule K alone empties `outbound_messages.subject` and
 * `.body` for the whole tenant. This file's `cleanups` restore the rows it
 * inserted itself and nothing else, so whatever integration file ran next read
 * anonymized seed data -- a failure that depended on file ordering, in a test
 * nowhere near the change being reviewed.
 *
 * A tenant of its own is the honest fixture anyway: these tests are about one
 * organization's rules, and `tenant-isolation.integration.test.ts` already
 * establishes that two can coexist.
 */
let retentionTenantId: string | null = null;
async function tenantId(): Promise<string> {
  if (!retentionTenantId) {
    throw new Error("the retention tenant is provisioned in beforeAll");
  }
  return retentionTenantId;
}

/**
 * An admin session inside that tenant, standing in for the seeded
 * `adminClient` everywhere below.
 *
 * Every fixture writes through it rather than through the seeded admin,
 * because `tenant_id` comes from the column default and `default_tenant_id()`
 * follows the caller's session -- so the session is what decides which
 * organization a fixture row belongs to.
 */
let admin!: SupabaseClient;
let retentionAdminId: string | null = null;

async function runPurge(options: {
  dryRun: boolean;
  asOf: string;
}): Promise<string> {
  const { data, error } = await serviceClient.rpc("run_retention_purge", {
    p_dry_run: options.dryRun,
    p_as_of: options.asOf,
    p_trigger: "manual",
    p_tenant_id: await tenantId(),
  });
  if (error) throw error;
  return data as string;
}

/** `now() + offset`, as an ISO timestamp the RPC can take for `p_as_of`. */
function clockAt(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toISOString();
}

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;

/**
 * `now() + n calendar years + offsetDays`, for the clocks long enough that leap
 * days matter.
 *
 * The rules read `p_as_of - interval '7 years'`, which Postgres counts in
 * calendar years, while `7 * YEAR` is 2555 days -- two days short by 2033, and
 * two leap days is enough to put a just-outside fixture back inside the window.
 * The three-year clocks above absorb their single leap day inside the ±1 day
 * margin; seven years does not.
 */
function clockAtYears(years: number, offsetDays: number) {
  const asOf = new Date();
  asOf.setUTCFullYear(asOf.getUTCFullYear() + years);
  return new Date(asOf.getTime() + offsetDays * DAY).toISOString();
}

// Through the granted RPC, not a table update: retention_policies has no write
// policy and no update grant, which is itself part of the design. The RPC acts
// on the caller's tenant, so the session is also what scopes it.
async function setMode(policyKey: string, mode: string) {
  const { error } = await admin.rpc("set_retention_policy_mode", {
    p_policy_key: policyKey,
    p_mode: mode,
  });
  if (error) throw error;
}

/**
 * The same, against the seeded tenant.
 *
 * The one thing in this file that reaches outside its own tenant, and only
 * rule N needs it: `constituent_accounts` enforces where EVERY active tenant
 * has it enforcing, so the tenant next door is a veto until it agrees. A mode
 * is not data -- it is put back to the shipped `dry_run` in `afterAll`, and
 * nothing else about the seeded tenant is touched.
 */
async function setSeededMode(policyKey: string, mode: string) {
  const { error } = await adminClient.rpc("set_retention_policy_mode", {
    p_policy_key: policyKey,
    p_mode: mode,
  });
  if (error) throw error;
}

async function countsFor(runId: string, policyKey: string) {
  const { data, error } = await admin
    .from("retention_run_tables")
    .select("policy_key, table_name, action, row_count")
    .eq("run_id", runId)
    .eq("policy_key", policyKey);
  if (error) throw error;
  return data ?? [];
}

/**
 * An account with nothing attached to it -- what rule N (#1296) is about.
 *
 * Through the admin API rather than an insert into `auth.users`, so it has the
 * shape of an account somebody signed up with at `/my`: confirmed, no
 * `last_sign_in_at`, no directory record, no role.
 */
async function createAccount(label: string): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email: uniqueEmail(label),
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  return data.user!.id;
}

async function accountExists(userId: string): Promise<boolean> {
  const { data } = await serviceClient.auth.admin.getUserById(userId);
  return data?.user != null;
}

/** The signed-in administrator's own account id, for the reviewer columns. */
async function adminUserId(): Promise<string> {
  if (!retentionAdminId) {
    throw new Error("the retention tenant is provisioned in beforeAll");
  }
  return retentionAdminId;
}

/**
 * Every table this file writes a row into, in the order they have to be
 * deleted in: a child before whatever it references. `tenants` is referenced
 * with `no action` throughout, so the tenant row goes only once all of these
 * are empty -- and a leftover active tenant would break the sole-active-tenant
 * fallback in `default_tenant_id()` for every later sessionless test.
 */
const OWNED_TABLES = [
  // The retention tables first: run_tables references people, and both runs
  // and policies reference auth.users, so the admin account below cannot go
  // while these stand.
  "retention_run_tables",
  "retention_runs",
  "retention_policies",
  "person_claims",
  "volunteer_hour_submissions",
  "outbound_messages",
  "gear_requests",
  "contact_messages",
  "pending_role_grants",
  "person_merges",
  "inventory_movements",
  // #1519. Referenced by inventory_movements, so after it.
  "distribution_acknowledgements",
  // #1501. Both cascade (from the registration and the event), but the list
  // reads as the dependency order it documents.
  "event_registration_answers",
  // #1502. Cascades from the registration too.
  "event_registration_answer_requests",
  // #1746. Snapshots name registrations; answers name people and questions.
  "person_answer_snapshots",
  "person_answers",
  "person_questions",
  "event_registrations",
  "event_registration_questions",
  "inventory_items",
  "donations",
  "events",
  "people",
  "app_settings",
  "role_permissions",
  "user_roles",
  "tenant_memberships",
  "roles",
] as const;

describe("run_retention_purge", () => {
  beforeAll(async () => {
    const run = crypto.randomUUID().slice(0, 8);
    const { data: tenant, error } = await serviceClient
      .from("tenants")
      .insert({
        name: `Retention Suite ${run}`,
        slug: `retention-suite-${run}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    retentionTenantId = tenant.id as string;

    // An admin role holding `manage` on every resource -- the same reach the
    // seeded admin has in its own tenant, so no fixture below fails for want
    // of a permission rather than for the reason it is testing.
    const { data: role, error: roleError } = await serviceClient
      .from("roles")
      .insert({
        tenant_id: retentionTenantId,
        name: "admin",
        description: "retention suite",
      })
      .select("id")
      .single();
    if (roleError) throw roleError;
    const roleId = role.id as string;

    const { data: resources, error: resourcesError } = await serviceClient
      .from("resources")
      .select("id");
    if (resourcesError) throw resourcesError;
    const { error: grantError } = await serviceClient
      .from("role_permissions")
      .insert(
        (resources ?? []).map((resource: { id: string }) => ({
          role_id: roleId,
          resource_id: resource.id,
          level: "manage",
        })),
      );
    if (grantError) throw grantError;

    // A second, empty role for the invitation fixture in the audit-snapshot
    // block to grant: `pending_role_grants` carries a composite foreign key,
    // so the role it names has to belong to this tenant.
    const { error: volunteerError } = await serviceClient.from("roles").insert({
      tenant_id: retentionTenantId,
      name: "volunteer",
      description: "retention suite",
    });
    if (volunteerError) throw volunteerError;

    const email = uniqueEmail("retention-admin");
    const { data: created, error: userError } =
      await serviceClient.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;
    retentionAdminId = created.user!.id;

    // ensure_membership_for_role writes the tenant_memberships row, which is
    // what makes current_tenant_id() resolve for this session without a
    // selection.
    const { error: assignError } = await serviceClient
      .from("user_roles")
      .insert({ user_id: retentionAdminId, role_id: roleId });
    if (assignError) throw assignError;

    admin = await signIn(email);
  });

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();

    // Leave every policy as it ships. A test run that left a rule enforcing
    // would arm the nightly job on whatever database this ran against -- and
    // for `constituent_accounts` that reaches the seeded tenant, which is the
    // only row this file changes outside its own.
    await setSeededMode("constituent_accounts", "dry_run");

    // The tenant and everything in it. Taking it away is the point: the rows
    // above are the ones the purge anonymized, and leaving them would be the
    // same cross-file contamination in a new place.
    const tenant = retentionTenantId;
    if (!tenant) return;
    for (const table of OWNED_TABLES) {
      const { error } = await serviceClient
        .from(table)
        .delete()
        .eq("tenant_id", tenant);
      if (error) throw new Error(`clearing ${table}: ${error.message}`);
    }
    if (retentionAdminId) {
      // audit_log.actor_id references auth.users without a cascade.
      await serviceClient
        .from("audit_log")
        .update({ actor_id: null })
        .eq("actor_id", retentionAdminId);
      const { error } =
        await serviceClient.auth.admin.deleteUser(retentionAdminId);
      if (error) throw error;
    }
    await serviceClient.from("audit_log").delete().eq("tenant_id", tenant);
    const { error } = await serviceClient
      .from("tenants")
      .delete()
      .eq("id", tenant);
    if (error)
      throw new Error(`deleting the retention tenant: ${error.message}`);
  });

  // The reason src/lib/retention.ts duplicates `period` at all.
  //
  // /privacy renders its prose from that module and the purge reads its clocks
  // from this table, so nothing structural stops someone changing a period in a
  // migration and leaving the published page promising the old one -- which is
  // the exact failure #602 exists to fix, reintroduced one layer down. Postgres
  // normalises an interval on the way in ("3 mons" for "3 months"), so compare
  // through interval arithmetic rather than string equality.
  describe("the published periods and the enforced periods agree", () => {
    test("every published policy has a matching row with the same clock", async () => {
      const { data, error } = await serviceClient
        .from("retention_policies")
        .select("policy_key, period, secondary_period")
        // One row per policy per tenant since Phase 5b, and the Map below keys
        // on policy_key alone -- unscoped, another tenant's clock would decide
        // whether /privacy is telling the truth about ours.
        .eq("tenant_id", await tenantId());
      if (error) throw error;

      const rows = new Map(data!.map((row) => [row.policy_key, row]));

      for (const policy of RETENTION_POLICIES) {
        const row = rows.get(policy.key);
        expect(
          row,
          `no retention_policies row for ${policy.key}`,
        ).toBeDefined();

        // As an admin, not as service_role: since Phase 5b the comparison
        // answers for the caller's tenant, and a session-less connection has
        // none. This is also how the portal calls it.
        const { data: agrees, error: compareError } = await admin.rpc(
          "retention_period_matches",
          {
            p_policy_key: policy.key,
            p_period: policy.period,
            p_secondary_period: policy.secondaryPeriod ?? null,
          },
        );
        if (compareError) throw compareError;
        expect(
          agrees,
          `${policy.key}: /privacy says "${policy.period}" but retention_policies says "${row!.period}"`,
        ).toBe(true);
      }
    });
  });

  describe("contact messages, 2 years from submission", () => {
    let recentId: string;
    let oldId: string;

    beforeAll(async () => {
      // `tenant_id` named rather than defaulted, here and in every sessionless
      // insert below. `default_tenant_id()` falls back to the sole active
      // tenant, and this file's tenant stands beside the seeded one -- so for a
      // service-role connection, which has no session to resolve, the default
      // is now null and the not-null constraint fires.
      const tenant = await tenantId();
      const rows = [
        {
          tenant_id: tenant,
          name: "Recent",
          email: uniqueEmail("retention-recent"),
          topic: "general",
          message: "recent",
        },
        {
          tenant_id: tenant,
          name: "Old",
          email: uniqueEmail("retention-old"),
          topic: "general",
          message: "old",
        },
      ];
      const { data, error } = await serviceClient
        .from("contact_messages")
        .insert(rows)
        .select("id");
      if (error) throw error;
      recentId = data![0].id;
      oldId = data![1].id;
      cleanups.push(async () => {
        await serviceClient
          .from("contact_messages")
          .delete()
          .in("id", [recentId, oldId]);
      });
    });

    test("a message one day inside the window survives", async () => {
      await setMode("contact_messages", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR - DAY) });

      const { data } = await serviceClient
        .from("contact_messages")
        .select("id")
        .eq("id", recentId)
        .maybeSingle();
      expect(data).not.toBeNull();
    });

    test("a message one day past the window is deleted", async () => {
      await setMode("contact_messages", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await serviceClient
        .from("contact_messages")
        .select("id")
        .eq("id", oldId)
        .maybeSingle();
      expect(data).toBeNull();
    });
  });

  describe("the two safety gates", () => {
    let messageId: string;

    beforeAll(async () => {
      const { data, error } = await serviceClient
        .from("contact_messages")
        .insert({
          tenant_id: await tenantId(),
          name: "Gate",
          email: uniqueEmail("retention-gate"),
          topic: "general",
          message: "gate",
        })
        .select("id")
        .single();
      if (error) throw error;
      messageId = data.id;
      cleanups.push(async () => {
        await serviceClient
          .from("contact_messages")
          .delete()
          .eq("id", messageId);
      });
    });

    // The property the whole rollout rests on. The nightly cron job passes
    // p_dry_run => false, so if mode alone did not hold the line, this feature
    // would start deleting from production the night it merged.
    test("a policy in dry_run acts on nothing even when p_dry_run is false", async () => {
      await setMode("contact_messages", "dry_run");
      const runId = await runPurge({
        dryRun: false,
        asOf: clockAt(5 * YEAR),
      });

      const { data } = await serviceClient
        .from("contact_messages")
        .select("id")
        .eq("id", messageId)
        .maybeSingle();
      expect(data).not.toBeNull();

      // It still reports what it would have removed -- that is the point of a
      // preview, and an empty log would make the mode indistinguishable from
      // 'off'.
      const counts = await countsFor(runId, "contact_messages");
      expect(counts[0]?.row_count).toBeGreaterThan(0);
    });

    test("p_dry_run true acts on nothing even when the policy is enforcing", async () => {
      await setMode("contact_messages", "enforce");
      await runPurge({ dryRun: true, asOf: clockAt(5 * YEAR) });

      const { data } = await serviceClient
        .from("contact_messages")
        .select("id")
        .eq("id", messageId)
        .maybeSingle();
      expect(data).not.toBeNull();
    });

    test("a policy set to off records nothing to act on", async () => {
      await setMode("contact_messages", "off");
      const runId = await runPurge({ dryRun: false, asOf: clockAt(5 * YEAR) });

      const counts = await countsFor(runId, "contact_messages");
      expect(counts[0]?.action).toBe("skipped");
      expect(counts[0]?.row_count).toBe(0);
    });
  });

  describe("who is exempt", () => {
    let donorId: string;
    let plainId: string;
    let donorRegistrationId: string;

    beforeAll(async () => {
      const donor = await createPerson(
        { email: uniqueEmail("retention-donor") },
        admin,
      );
      const plain = await createPerson(
        { email: uniqueEmail("retention-plain") },
        admin,
      );
      donorId = donor.id;
      plainId = plain.id;
      cleanups.push(donor.cleanup, plain.cleanup);

      // #1746. Checked in before they answered, so the registration has no
      // snapshot and still reads through the answers -- which is what the
      // purge has to backfill before it deletes them.
      const event = await createPublishedEvent({}, admin);
      cleanups.push(event.cleanup);
      const { data: registration, error: registrationError } = await admin
        .from("event_registrations")
        .insert({
          event_id: event.id,
          name: "Retention Donor",
          email: uniqueEmail("retention-donor-reg"),
          person_id: donorId,
          checked_in_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (registrationError) throw registrationError;
      donorRegistrationId = registration.id as string;

      // This file's own tenant, so its questions and answers are written
      // directly: a discipline, and the level it shows, both snapshotted.
      const ski = { id: crypto.randomUUID(), key: "ski", label: "Skis" };
      const beginner = {
        id: crypto.randomUUID(),
        key: "beginner",
        label: "Beginner",
      };
      const disciplineId = crypto.randomUUID();
      const levelId = crypto.randomUUID();
      const { error: questionsError } = await serviceClient
        .from("person_questions")
        .insert([
          {
            id: disciplineId,
            tenant_id: retentionTenantId,
            key: "riding_discipline",
            kind: "single_choice",
            prompt: "Do you ski or ride?",
            options: [
              ski,
              { id: crypto.randomUUID(), key: "snowboard", label: "Snowboard" },
            ],
            snapshot_at_checkin: true,
            sort_order: 0,
            show_if: null,
          },
          {
            id: levelId,
            tenant_id: retentionTenantId,
            key: "ski_level",
            kind: "single_choice",
            prompt: "How would you describe your skiing?",
            options: [
              beginner,
              { id: crypto.randomUUID(), key: "advanced", label: "Advanced" },
            ],
            snapshot_at_checkin: true,
            sort_order: 1,
            show_if: {
              any: [{ question_id: disciplineId, option_ids: [ski.id] }],
            },
          },
        ]);
      if (questionsError) throw questionsError;
      for (const id of [donorId, plainId]) {
        const { error: answersError } = await serviceClient
          .from("person_answers")
          .insert([
            {
              tenant_id: retentionTenantId,
              person_id: id,
              question_id: disciplineId,
              kind: "single_choice",
              value: ski.id,
              answer_text: ski.label,
              prompt_as_shown: "Do you ski or ride?",
              answered_via: "staff",
            },
            {
              tenant_id: retentionTenantId,
              person_id: id,
              question_id: levelId,
              kind: "single_choice",
              value: beginner.id,
              answer_text: beginner.label,
              prompt_as_shown: "How would you describe your skiing?",
              answered_via: "staff",
            },
          ]);
        if (answersError) throw answersError;
      }

      const { data, error } = await admin
        .from("donations")
        .insert({
          donor_id: donorId,
          donated_at: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) throw error;
      const donationId = data.id as string;
      cleanups.push(async () => {
        await admin.from("donations").delete().eq("id", donationId);
      });
    });

    // The single most important assertion in this file. Donation and financial
    // records are exempt from the published periods, and the mechanism is that
    // a foreign key outside retention_purgeable_person_refs still points at the
    // person. If this ever fails, the job is anonymizing donors.
    test("a donor keeps their identity", async () => {
      await setMode("person_answers", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await admin
        .from("people")
        .select("name, email, is_anonymous")
        .eq("id", donorId)
        .single();
      expect(data!.is_anonymous).toBe(false);
      expect(data!.name).not.toBeNull();
    });

    // ...but their profile answers are on their own clock, and a donation does
    // not extend it. The two ideas are deliberately separate in the SQL.
    // Snapshots first (#1746): the event they checked in to keeps the level
    // it counted, so its figures do not move.
    test("a donor's profile answers still expire, after the snapshot", async () => {
      await setMode("person_answers", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { count } = await serviceClient
        .from("person_answers")
        .select("id", { count: "exact", head: true })
        .eq("person_id", donorId);
      expect(count).toBe(0);

      const { data: snapshots } = await serviceClient
        .from("person_answer_snapshots")
        .select("answer_text")
        .eq("registration_id", donorRegistrationId);
      expect((snapshots ?? []).map((row) => row.answer_text).sort()).toEqual([
        "Beginner",
        "Skis",
      ]);
    });

    test("a person nothing else references is anonymized", async () => {
      await setMode("person_answers", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await admin
        .from("people")
        .select("name, email, is_anonymous")
        .eq("id", plainId)
        .single();
      expect(data!.is_anonymous).toBe(true);
      expect(data!.name).toBeNull();
      expect(data!.email).toBeNull();
    });
  });

  describe("event registrations keep their counts", () => {
    let oldRegistrationId: string;
    let recentRegistrationId: string;

    // Two events and two registrations rather than one of each: the
    // just-inside and just-outside cases assert on the same columns, so
    // sharing a row would make the second test pass or fail depending on
    // whether the first one had already anonymized it.
    beforeAll(async () => {
      async function eventEndingAt(endedAt: number) {
        const event = await createPublishedEvent(
          {
            startsAt: new Date(endedAt).toISOString(),
            endsAt: new Date(endedAt).toISOString(),
          },
          admin,
        );
        const { data, error } = await admin
          .from("event_registrations")
          .insert({
            event_id: event.id,
            name: "Retention Registrant",
            email: uniqueEmail("retention-registrant"),
            phone: "555-0100",
            notes: "allergic to nothing",
            party_size: 3,
            checked_in_at: new Date(endedAt).toISOString(),
            // #685. Both halves of the minors answer, so this rule is asserted
            // against the case that could break it: the four contacts have to
            // go, the flag has to stay, and the column constraint has to
            // tolerate the result.
            party_includes_minor: true,
            accompanying_adult_name: "Robin Rivera",
            accompanying_adult_phone: "555-0101",
            emergency_contact_name: "Sam Rivera",
            emergency_contact_phone: "555-0102",
            // #686 and #599 together, because the interesting thing about them
            // is that this one rule treats them oppositely and nothing else
            // asserts it. The waiver pair survives; the three photo columns go
            // with the name. `false` is an objection since #1376, and the rule
            // is unchanged.
            waiver_accepted_at: new Date(endedAt).toISOString(),
            waiver_version: 2,
            photo_consent: false,
            photo_consent_at: new Date(endedAt).toISOString(),
            photo_consent_text: "We use photos on our site and socials.",
          })
          .select("id")
          .single();
        if (error) throw error;

        // Pushed after the event's own cleanup so it runs first: cleanups are
        // replayed in reverse, and guard_event_delete refuses an event that
        // still has registrations hanging off it.
        cleanups.push(event.cleanup);
        cleanups.push(async () => {
          await admin.from("event_registrations").delete().eq("id", data.id);
        });
        return data.id as string;
      }

      // #1416. This tenant has stopped asking about under-18s, which must not
      // stop the purge clearing contacts collected while it still asked: the
      // rule reads the columns, never the setting.
      const { error: settingError } = await serviceClient
        .from("app_settings")
        .insert({
          tenant_id: await tenantId(),
          key: "registration.asks_about_minors",
          value: false,
        });
      if (settingError) throw settingError;

      oldRegistrationId = await eventEndingAt(Date.now() - 7 * DAY);
      // Ten days out, so it stays inside the window at every clock these tests
      // use: p_as_of moves forward three years, which puts the cutoff a day
      // from now, and a registration for an event that has not happened yet is
      // the case that must never be touched.
      recentRegistrationId = await eventEndingAt(Date.now() + 10 * DAY);
    });

    // Deleting these rows would restate attendance and impact figures under
    // grant reports that have already been filed, so the rule anonymizes.
    test("the row survives with its counts and loses every identifying field", async () => {
      await setMode("event_registrations", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await admin
        .from("event_registrations")
        .select(
          "name, email, phone, notes, instagram_handle, person_id, party_size, checked_in_at",
        )
        .eq("id", oldRegistrationId)
        .single();

      expect(data).not.toBeNull();
      expect(data!.name).toBe("Removed");
      expect(data!.email).toBe("");
      expect(data!.phone).toBeNull();
      expect(data!.notes).toBeNull();
      expect(data!.person_id).toBeNull();
      // The reporting half, untouched.
      expect(data!.party_size).toBe(3);
      expect(data!.checked_in_at).not.toBeNull();
    });

    // #685, and the reason the column constraint is one-directional. The four
    // contacts are personal data and go with the rest; the flag is a fact
    // about the party and stays, like party_size. A biconditional constraint
    // would make this update raise 23514 inside a block whose own `exception
    // when others` swallows it, and event registrations would silently never
    // anonymize again.
    test("the accompanying adult and emergency contact go, the flag stays", async () => {
      await setMode("event_registrations", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data, error } = await serviceRoleClient()
        .from("event_registrations")
        .select(
          "party_includes_minor, accompanying_adult_name, accompanying_adult_phone, emergency_contact_name, emergency_contact_phone",
        )
        .eq("id", oldRegistrationId)
        .single();

      expect(error).toBeNull();
      expect(data).toEqual({
        party_includes_minor: true,
        accompanying_adult_name: null,
        accompanying_adult_phone: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
      });
    });

    // #599, restated for #1376, and the opposite call from the waiver's on the
    // same row. Both are records of something somebody said, so what separates
    // them is what they are about. An acceptance is a fact about an ACT and
    // stands without a name, which is why #686 kept it. The photo columns are
    // a fact about a person's FACE: an anonymized objection protects nobody,
    // because there is no name left to check a photograph against and nobody
    // at a door can be recognised as its subject. An instruction about a face
    // nobody can identify is no more useful than a permission was, which is
    // why the flip in meaning left this rule exactly where it was.
    //
    // Nothing asserted that the waiver pair survives before this, so it is
    // asserted here — beside the divergence it is the counterpart to, since
    // one rule doing both is the only place they can be compared.
    test("the photo columns go with the name, and the agreement does not", async () => {
      await setMode("event_registrations", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data, error } = await serviceRoleClient()
        .from("event_registrations")
        .select(
          "photo_consent, photo_consent_at, photo_consent_text, waiver_accepted_at, waiver_version",
        )
        .eq("id", oldRegistrationId)
        .single();

      expect(error).toBeNull();
      expect(data!.photo_consent).toBeNull();
      expect(data!.photo_consent_at).toBeNull();
      expect(data!.photo_consent_text).toBeNull();
      expect(data!.waiver_accepted_at).not.toBeNull();
      expect(data!.waiver_version).toBe(2);
    });

    test("a registration inside the window is untouched", async () => {
      await setMode("event_registrations", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await admin
        .from("event_registrations")
        .select("name, phone")
        .eq("id", recentRegistrationId)
        .single();
      expect(data!.name).toBe("Retention Registrant");
      expect(data!.phone).toBe("555-0100");
    });
  });

  // #1501. Free text can hold an address, and a consent to share contact
  // details with a partner is worthless once the row names nobody, so rule C
  // deletes a registration's answers when it anonymizes it -- and picks a row
  // up again on a later run if answers are all it has left.
  describe("event registration answers go with the name", () => {
    async function answeredRegistration(endedAt: number) {
      const event = await createPublishedEvent(
        {
          startsAt: new Date(endedAt).toISOString(),
          endsAt: new Date(endedAt).toISOString(),
        },
        admin,
      );
      const questionId = crypto.randomUUID();
      const { error: saveError } = await admin.rpc(
        "save_event_registration_questions",
        {
          p_event_id: event.id,
          p_questions: [
            { id: questionId, kind: "short_text", prompt: "Leaving from" },
          ],
        },
      );
      if (saveError) throw saveError;
      const { data, error } = await admin
        .from("event_registrations")
        .insert({
          event_id: event.id,
          name: "Retention Answerer",
          email: uniqueEmail("retention-answerer"),
          party_size: 1,
        })
        .select("id")
        .single();
      if (error) throw error;
      // As above: the registration goes before its event.
      cleanups.push(event.cleanup);
      cleanups.push(async () => {
        await admin.from("event_registrations").delete().eq("id", data.id);
      });
      await answer(data.id as string, questionId, "12 Elm Street");
      return { registrationId: data.id as string, questionId };
    }

    async function answer(
      registrationId: string,
      questionId: string,
      text: string,
    ) {
      const { error } = await admin.rpc("set_registration_answers", {
        p_registration_id: registrationId,
        p_answers: { [questionId]: text },
      });
      if (error) throw error;
    }

    async function answersOf(registrationId: string) {
      const { data, error } = await serviceRoleClient()
        .from("event_registration_answers")
        .select("answer_text")
        .eq("registration_id", registrationId);
      if (error) throw error;
      return (data ?? []).map((row) => row.answer_text);
    }

    test("an anonymized registration loses its answers, and one inside the window keeps them", async () => {
      const old = await answeredRegistration(Date.now() - 7 * DAY);
      const recent = await answeredRegistration(Date.now() + 10 * DAY);
      expect(await answersOf(old.registrationId)).toEqual(["12 Elm Street"]);

      await setMode("event_registrations", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      expect(await answersOf(old.registrationId)).toEqual([]);
      expect(await answersOf(recent.registrationId)).toEqual(["12 Elm Street"]);
      // The question itself is configuration, not personal data.
      const { data: question } = await admin
        .from("event_registration_questions")
        .select("id")
        .eq("id", old.questionId)
        .single();
      expect(question?.id).toBe(old.questionId);

      // An answer recorded on the anonymized row afterwards is all it has
      // left, and the next run still finds it.
      await answer(old.registrationId, old.questionId, "Somewhere else");
      expect(await answersOf(old.registrationId)).toEqual(["Somewhere else"]);
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });
      expect(await answersOf(old.registrationId)).toEqual([]);
    });
  });

  // #721 moved the requester's free text off people.notes and onto the
  // movement, precisely so this rule could reach it: on the person it was
  // shielded indefinitely by anyone the purge is required to keep.
  describe("gear requests lose the requester and their notes", () => {
    const REQUEST_NOTES = "Size 10 boots if you have them.";
    let oldMovementId: string;
    let recentMovementId: string;
    let requesterId: string;

    beforeAll(async () => {
      const gear = await createAvailableGearItems(2, {}, admin);
      const requester = await createPerson(
        {
          name: "Retention Requester",
          email: uniqueEmail("retention-requester"),
        },
        admin,
      );
      requesterId = requester.id;

      async function reservationAt(occurredAt: number, itemId: string) {
        const { data, error } = await admin
          .from("inventory_movements")
          .insert({
            inventory_item_id: itemId,
            movement_type: "reserved",
            quantity: 1,
            reason: "Public gear library request",
            recipient_person_id: requester.id,
            notes: REQUEST_NOTES,
            occurred_at: new Date(occurredAt).toISOString(),
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }

      oldMovementId = await reservationAt(
        Date.now() - 7 * DAY,
        gear.itemIds[0],
      );
      recentMovementId = await reservationAt(
        Date.now() + 10 * DAY,
        gear.itemIds[1],
      );

      // Reverse order: the donation cleanup deletes the items these movements
      // point at, and the requester outlives neither.
      cleanups.push(gear.cleanup);
      cleanups.push(requester.cleanup);
      cleanups.push(async () => {
        await admin
          .from("inventory_movements")
          .delete()
          .in("id", [oldMovementId, recentMovementId]);
      });
    });

    test("the movement survives as inventory history with both fields cleared", async () => {
      await setMode("gear_requests", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await admin
        .from("inventory_movements")
        .select("recipient_person_id, notes, quantity, reason")
        .eq("id", oldMovementId)
        .single();

      expect(data).not.toBeNull();
      expect(data!.recipient_person_id).toBeNull();
      expect(data!.notes).toBeNull();
      // The inventory half, untouched.
      expect(data!.quantity).toBe(1);
      expect(data!.reason).toBe("Public gear library request");
    });

    test("a request inside the window keeps its notes", async () => {
      await setMode("gear_requests", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await admin
        .from("inventory_movements")
        .select("recipient_person_id, notes")
        .eq("id", recentMovementId)
        .single();

      expect(data!.recipient_person_id).not.toBeNull();
      expect(data!.notes).toBe(REQUEST_NOTES);
    });

    // #1367. The header's requester link, address, payment preference and
    // notes go on the gear clock; the as-is acknowledgement does not. It is a
    // fact about an act and about the organization's own published words, not
    // personal data about the requester -- the same call #686 and #1319 made,
    // and the reason `purge_expired_records()` names the columns it clears
    // rather than nulling the row.
    test("the header loses its personal fields and keeps the as-is record", async () => {
      const acknowledgedAt = new Date(Date.now() - 7 * DAY).toISOString();
      const { data: inserted, error } = await serviceClient
        .from("gear_requests")
        .insert({
          tenant_id: await tenantId(),
          person_id: requesterId,
          delivery_method: "meetup",
          notes: REQUEST_NOTES,
          as_is_acknowledged_at: acknowledgedAt,
          as_is_text: "We give away items exactly as they reach us.",
          created_at: acknowledgedAt,
        })
        .select("id")
        .single();
      if (error) throw error;
      const requestId = inserted.id as string;
      cleanups.push(async () => {
        await serviceClient.from("gear_requests").delete().eq("id", requestId);
      });

      await setMode("gear_requests", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await serviceClient
        .from("gear_requests")
        .select("person_id, notes, as_is_acknowledged_at, as_is_text")
        .eq("id", requestId)
        .single();

      expect(data!.person_id).toBeNull();
      expect(data!.notes).toBeNull();
      // Compared as an instant: Postgres answers `+00:00` where the insert
      // sent `Z`, and the fact under test is that the value survived.
      expect(new Date(data!.as_is_acknowledged_at!).toISOString()).toBe(
        acknowledgedAt,
      );
      expect(data!.as_is_text).toBe(
        "We give away items exactly as they reach us.",
      );
    });

    // #1519, rule E3. An in-person handout's acknowledgement keeps when, what
    // was shown and how; the recipient link and the name they typed go on the
    // same clock.
    test("a handout acknowledgement loses the typed name and keeps the record", async () => {
      const acknowledgedAt = new Date(Date.now() - 7 * DAY).toISOString();
      const { data: inserted, error } = await serviceClient
        .from("distribution_acknowledgements")
        .insert({
          tenant_id: await tenantId(),
          recipient_person_id: requesterId,
          acknowledged_at: acknowledgedAt,
          as_is_text: "We give away items exactly as they reach us.",
          typed_name: "Retention Requester",
          method: "own_device",
          created_at: acknowledgedAt,
        })
        .select("id")
        .single();
      if (error) throw error;

      await setMode("gear_requests", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await serviceClient
        .from("distribution_acknowledgements")
        .select("recipient_person_id, typed_name, method, as_is_text")
        .eq("id", inserted.id)
        .single();
      expect(data).toEqual({
        recipient_person_id: null,
        typed_name: null,
        method: "own_device",
        as_is_text: "We give away items exactly as they reach us.",
      });
    });
  });

  // #1203. What survives is the fact of the send; what goes is the
  // correspondence and everyone named in it. Its own clock, two years, rather
  // than the clock of whatever record the message was about -- the table is
  // polymorphic, and a message's own send date is what it is measured from.
  describe("staff messages lose their correspondence and keep their trail", () => {
    const BODY = "The blue one is gone. Would the grey do?";
    let oldMessageId: string;
    let recentMessageId: string;
    let recipientEmail: string;
    let recordId: string;

    beforeAll(async () => {
      recipientEmail = uniqueEmail("retention-message");
      const recipient = await createPerson(
        { name: "Retention Recipient", email: recipientEmail },
        admin,
      );
      recordId = crypto.randomUUID();

      // Written straight through the service role, because that is the only
      // way a row gets here: the table has no insert policy for anyone.
      async function messageAt(createdAt: number) {
        const id = crypto.randomUUID();
        const { error } = await serviceClient.from("outbound_messages").insert({
          id,
          tenant_id: await tenantId(),
          person_id: recipient.id,
          to_email: recipientEmail,
          module: "inventory",
          record_type: "gear_request",
          record_id: recordId,
          subject: "About your gear request",
          body: BODY,
          kind: "staff_message",
          status: "sent",
          created_at: new Date(createdAt).toISOString(),
        });
        if (error) throw error;
        return id;
      }

      oldMessageId = await messageAt(Date.now() - 7 * DAY);
      recentMessageId = await messageAt(Date.now() + 10 * DAY);

      cleanups.push(async () => {
        await serviceClient
          .from("outbound_messages")
          .delete()
          .in("id", [oldMessageId, recentMessageId]);
      });
      cleanups.push(recipient.cleanup);
    });

    test("the row survives saying a message went out, and not what it said", async () => {
      await setMode("outbound_messages", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await serviceClient
        .from("outbound_messages")
        .select(
          "person_id, to_email, subject, body, status, kind, record_id, module",
        )
        .eq("id", oldMessageId)
        .single();

      expect(data).not.toBeNull();
      expect(data!.person_id).toBeNull();
      // Empty rather than null: the columns are not null, so the purge writes
      // the same sentinel rule C uses for event registrations.
      expect(data!.to_email).toBe("");
      expect(data!.subject).toBe("");
      expect(data!.body).toBe("");
      // The half that answers "was anything sent about this request?".
      expect(data!.status).toBe("sent");
      expect(data!.kind).toBe("staff_message");
      expect(data!.record_id).toBe(recordId);
      expect(data!.module).toBe("inventory");
    });

    test("a message inside the window keeps its text", async () => {
      await setMode("outbound_messages", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await serviceClient
        .from("outbound_messages")
        .select("person_id, to_email, body")
        .eq("id", recentMessageId)
        .single();

      expect(data!.person_id).not.toBeNull();
      expect(data!.to_email).toBe(recipientEmail);
      expect(data!.body).toBe(BODY);
    });
  });

  // #720. The two append-only stores that hold copies of the same personal
  // data: audit_log's row snapshots, and person_merges' copies of a people row.
  // Both are redacted in place rather than deleted -- the entry, its table, its
  // record, its actor and its timestamp are kept permanently, and only the
  // registered personal values inside the snapshot are cleared.
  describe("audit trail snapshots lose their personal keys and nothing else", () => {
    let expiredGrantId: string;
    let recentGrantId: string;

    async function createGrant(email: string) {
      // Scoped to this tenant: `roles` is per tenant, so an unscoped lookup
      // for "volunteer" matches the seeded tenant's role as well as ours and
      // `single()` fails on the two.
      const { data: role, error: roleError } = await serviceClient
        .from("roles")
        .select("id")
        .eq("tenant_id", await tenantId())
        .eq("name", "volunteer")
        .single();
      if (roleError) throw roleError;

      // Through the service client rather than the invitation action: this test
      // is about what the audit trigger recorded, and minting a real invite link
      // creates an auth.users row as a side effect (#763).
      const { data, error } = await serviceClient
        .from("pending_role_grants")
        .insert({
          tenant_id: await tenantId(),
          email,
          name: "Retention Invitee",
          role_id: role.id,
          status: "pending",
          expires_at: new Date(Date.now() + 7 * DAY).toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;

      const id = data.id as string;
      // Deleting it is the point: rule G does exactly this, and the delete
      // trigger writes the invitation email it just removed into old_data.
      await serviceClient.from("pending_role_grants").delete().eq("id", id);
      return id;
    }

    async function snapshotFor(grantId: string) {
      const { data, error } = await serviceClient
        .from("audit_log")
        .select(
          "table_name, record_id, action, occurred_at, old_data, redacted_at",
        )
        .eq("table_name", "pending_role_grants")
        .eq("record_id", grantId)
        .eq("action", "delete")
        .single();
      if (error) throw error;
      return data;
    }

    beforeAll(async () => {
      expiredGrantId = await createGrant(uniqueEmail("retention-invitee-old"));
      recentGrantId = await createGrant(uniqueEmail("retention-invitee-new"));
    });

    // First, because the sweep in the next test moves the clock past every entry
    // in the table, this one's included.
    test("an entry inside the window keeps its snapshot", async () => {
      await setMode("audit_log_snapshots", "enforce");
      await runPurge({ dryRun: false, asOf: clockAtYears(7, -1) });

      const entry = await snapshotFor(recentGrantId);
      expect(entry.old_data?.email).toEqual(expect.any(String));
      expect(entry.redacted_at).toBeNull();
    });

    test("the entry survives with the email cleared and the change intact", async () => {
      await setMode("audit_log_snapshots", "enforce");
      await runPurge({ dryRun: false, asOf: clockAtYears(7, 1) });

      const entry = await snapshotFor(expiredGrantId);

      // What the audit log is for, kept.
      expect(entry.table_name).toBe("pending_role_grants");
      expect(entry.record_id).toBe(expiredGrantId);
      expect(entry.action).toBe("delete");
      expect(entry.occurred_at).not.toBeNull();
      expect(entry.old_data?.status).toBe("pending");
      expect(entry.old_data?.role_id).not.toBeNull();

      // What it should not hold, gone -- with the key still there, so a reader
      // can tell a scrubbed field from one that did not exist yet.
      expect("email" in (entry.old_data ?? {})).toBe(true);
      expect(entry.old_data?.email).toBeNull();
      expect(entry.old_data?.name).toBeNull();
      expect(entry.redacted_at).not.toBeNull();
    });

    // Without the "is there anything left to scrub" test the sweep would rewrite
    // and re-report the same entries every night, forever.
    test("a second run finds nothing left to redact", async () => {
      await setMode("audit_log_snapshots", "enforce");
      const runId = await runPurge({
        dryRun: false,
        asOf: clockAtYears(7, 1),
      });

      const counts = await countsFor(runId, "audit_log_snapshots");
      expect(counts).toHaveLength(1);
      expect(counts[0].action).toBe("redacted");
      expect(counts[0].row_count).toBe(0);
    });

    test("the audit log is still append-only through the API", async () => {
      const { data } = await admin
        .from("audit_log")
        .update({ redacted_at: null })
        .eq("record_id", expiredGrantId)
        .select("id");
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("merge snapshots lose their personal keys", () => {
    let mergeId: string;
    let survivorId: string;

    beforeAll(async () => {
      const email = uniqueEmail("retention-merge");
      const survivor = await createPerson(
        { name: "Retention Survivor", email },
        admin,
      );
      const duplicate = await createPerson(
        {
          name: "Retention Duplicate",
          email: uniqueEmail("retention-merge-dupe"),
        },
        admin,
      );
      survivorId = survivor.id;

      const { error } = await admin.rpc("merge_people", {
        p_survivor_id: survivor.id,
        p_duplicate_id: duplicate.id,
      });
      if (error) throw error;

      const { data, error: mergeError } = await serviceClient
        .from("person_merges")
        .select("id")
        .eq("survivor_person_id", survivor.id)
        .single();
      if (mergeError) throw mergeError;
      mergeId = data.id as string;

      cleanups.push(survivor.cleanup);
      cleanups.push(async () => {
        await serviceClient.from("person_merges").delete().eq("id", mergeId);
      });
    });

    async function mergeRow() {
      const { data, error } = await serviceClient
        .from("person_merges")
        .select(
          "survivor_person_id, merged_person_id, merged_at, repointed, merged_snapshot, survivor_before, redacted_at",
        )
        .eq("id", mergeId)
        .single();
      if (error) throw error;
      return data;
    }

    test("a merge inside the window keeps both snapshots", async () => {
      await setMode("person_merge_snapshots", "enforce");
      await runPurge({ dryRun: false, asOf: clockAtYears(7, -1) });

      const row = await mergeRow();
      expect(row.merged_snapshot?.name).toBe("Retention Duplicate");
      expect(row.redacted_at).toBeNull();
    });

    test("the record of the merge survives without the person's details", async () => {
      await setMode("person_merge_snapshots", "enforce");
      await runPurge({ dryRun: false, asOf: clockAtYears(7, 1) });

      const row = await mergeRow();

      // Who merged whom, when, and what moved: the reason the table exists.
      expect(row.survivor_person_id).toBe(survivorId);
      expect(row.merged_person_id).not.toBeNull();
      expect(row.merged_at).not.toBeNull();
      expect(row.repointed).not.toBeNull();

      expect(row.merged_snapshot?.name).toBeNull();
      expect(row.merged_snapshot?.email).toBeNull();
      expect(row.survivor_before?.name).toBeNull();
      expect(row.survivor_before?.email).toBeNull();
      // Not personal, and not registered: the shape of the row stays readable.
      expect(row.merged_snapshot?.id).not.toBeNull();
      expect(row.redacted_at).not.toBeNull();
    });
  });

  // "Does a deletion request reach the audit log?" -- #720's second open
  // question. It does, at the moment of the request rather than seven years
  // later, and without consulting the policy mode: the scheduled clocks are
  // proposals awaiting a board decision, while honouring a request is a
  // commitment /privacy already makes.
  describe("a deletion request reaches both copies immediately", () => {
    let personId: string;
    let donationId: string;
    let mergeId: string;

    beforeAll(async () => {
      const person = await createPerson(
        {
          name: "Retention Requester",
          email: uniqueEmail("retention-request"),
        },
        admin,
      );
      personId = person.id;

      const duplicate = await createPerson(
        { name: "Retention Request Dupe" },
        admin,
      );
      const { error: mergeError } = await admin.rpc("merge_people", {
        p_survivor_id: person.id,
        p_duplicate_id: duplicate.id,
      });
      if (mergeError) throw mergeError;

      const { data: merge } = await serviceClient
        .from("person_merges")
        .select("id")
        .eq("survivor_person_id", person.id)
        .single();
      mergeId = merge!.id as string;

      // An audited row that both names this person and carries free text about
      // them, so its audit entry holds both. A gear movement would not do:
      // inventory_movements.notes is in audited_tables.redacted_columns
      // (20260905160000) and never reaches a snapshot in the first place.
      const { data, error } = await admin
        .from("donations")
        .insert({
          donor_id: person.id,
          donated_at: new Date().toISOString().slice(0, 10),
          notes: "Dropping off two jackets on Saturday.",
        })
        .select("id")
        .single();
      if (error) throw error;
      donationId = data.id as string;

      cleanups.push(person.cleanup);
      cleanups.push(async () => {
        await serviceClient.from("person_merges").delete().eq("id", mergeId);
        // The request path records the subject on the run log, and
        // retention_run_tables.subject_person_id is a real foreign key -- so the
        // fixture person cannot be deleted until this evidence row goes.
        await serviceClient
          .from("retention_run_tables")
          .delete()
          .eq("subject_person_id", personId);
        // Takes the donor row with it, which is why person.cleanup above is
        // pushed first and so runs last: cleanups are replayed in reverse.
        await cleanupDonation(donationId, admin);
      });
    });

    test("the request redacts the snapshots and records that it did", async () => {
      // Off, not merely dry_run: a request is not on a clock and is not gated
      // on the board having approved one.
      await setMode("audit_log_snapshots", "off");
      await setMode("person_merge_snapshots", "off");

      const { error } = await admin.rpc("delete_person_answers", {
        p_person_id: personId,
        p_reason: "Asked us to delete their profile",
      });
      if (error) throw error;

      const { data: merge } = await serviceClient
        .from("person_merges")
        .select("merged_snapshot, survivor_before, redacted_at")
        .eq("id", mergeId)
        .single();
      expect(merge!.merged_snapshot?.name).toBeNull();
      expect(merge!.survivor_before?.name).toBeNull();
      expect(merge!.redacted_at).not.toBeNull();

      const { data: entry } = await serviceClient
        .from("audit_log")
        .select("new_data, record_id, redacted_at")
        .eq("table_name", "donations")
        .eq("record_id", donationId)
        .eq("action", "insert")
        .single();
      expect(entry!.new_data?.notes).toBeNull();
      // The id stays: the person row it points at is anonymized by the same
      // rules, and it is what still explains why the donation exists.
      expect(entry!.new_data?.donor_id).toBe(personId);
      expect(entry!.redacted_at).not.toBeNull();

      const { data: logged } = await admin
        .from("retention_run_tables")
        .select("policy_key, action, row_count, subject_person_id")
        .eq("subject_person_id", personId);
      const byPolicy = new Map(
        (logged ?? []).map((row) => [row.policy_key, row]),
      );
      expect(byPolicy.get("person_merge_snapshots")?.action).toBe("redacted");
      expect(byPolicy.get("person_merge_snapshots")?.row_count).toBe(1);
      expect(byPolicy.get("audit_log_snapshots")?.row_count).toBe(1);
    });
  });

  // The failure this design has, guarded rather than hoped about: an audited
  // table added next season whose personal columns nobody registered, whose
  // snapshots are then kept in full forever while the page reports the rule as
  // applied. Registering the column in the migration that audits the table is
  // what makes this pass again.
  test("every obviously personal column on an audited table is registered", async () => {
    const { data, error } = await serviceClient.rpc(
      "retention_unregistered_personal_columns",
    );
    if (error) throw error;
    expect(data ?? []).toEqual([]);
  });

  // #1296. The constituent area's three clocks. The board's 2026-09-02 record
  // predates epic #1160, so until now an account held by a member of the
  // public, a claim on a directory record and hours a volunteer logged
  // themselves had no published period and nothing in this job.

  describe("record claims, 2 years from the decision", () => {
    let pendingId: string;
    let rejectedId: string;
    let claimantId: string;

    beforeAll(async () => {
      claimantId = await createAccount("retention-claimant");
      const reviewerId = await adminUserId();

      const { data, error } = await serviceClient
        .from("person_claims")
        .insert([
          {
            tenant_id: await tenantId(),
            auth_user_id: claimantId,
            stated_name: "Nobody Reviewed This",
            stated_email: uniqueEmail("retention-claim-pending"),
            // Named rather than defaulted: PostgREST sends one column list for
            // a multi-row insert, so a key missing from one row arrives as an
            // explicit null and the not-null constraint fires.
            status: "pending",
          },
          {
            tenant_id: await tenantId(),
            auth_user_id: claimantId,
            stated_name: "Refused Claimant",
            stated_email: uniqueEmail("retention-claim-rejected"),
            status: "rejected",
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
            review_note: "Not this person",
          },
        ])
        .select("id, status");
      if (error) throw error;
      pendingId = data!.find((row) => row.status === "pending")!.id;
      rejectedId = data!.find((row) => row.status === "rejected")!.id;

      cleanups.push(async () => {
        await serviceClient
          .from("person_claims")
          .delete()
          .in("id", [pendingId, rejectedId]);
        await serviceClient.auth.admin.deleteUser(claimantId);
      });
    });

    test("a claim one day inside the window survives, decided or not", async () => {
      await setMode("person_claims", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR - DAY) });

      const { data } = await serviceClient
        .from("person_claims")
        .select("id")
        .in("id", [pendingId, rejectedId]);
      expect(data ?? []).toHaveLength(2);
    });

    // Both clocks the decision record asks about, on one column: updated_at is
    // the moment of the decision for the refused claim and, defaulted from
    // created_at, the moment it was sent for the one nobody looked at.
    test("a claim one day past the window is deleted, decided or not", async () => {
      await setMode("person_claims", "enforce");
      const runId = await runPurge({
        dryRun: false,
        asOf: clockAt(2 * YEAR + DAY),
      });

      const { data } = await serviceClient
        .from("person_claims")
        .select("id")
        .in("id", [pendingId, rejectedId]);
      expect(data ?? []).toHaveLength(0);

      const logged = await countsFor(runId, "person_claims");
      expect(logged[0]?.action).toBe("deleted");
      expect(logged[0]?.row_count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("self-logged hours, 2 years for the ones nobody confirmed", () => {
    let personId: string;
    let pendingId: string;
    let declinedId: string;
    let confirmedId: string;

    beforeAll(async () => {
      const person = await createPerson(
        { name: "Retention Hour Logger" },
        admin,
      );
      personId = person.id;
      const reviewerId = await adminUserId();

      const { data, error } = await serviceClient
        .from("volunteer_hour_submissions")
        .insert([
          {
            tenant_id: await tenantId(),
            person_id: personId,
            hours: 2,
            logged_date: "2026-01-05",
            notes: "Nobody has reviewed this",
            // See the claim fixture above: one column list, so every row names
            // every column it relies on.
            status: "pending",
          },
          {
            tenant_id: await tenantId(),
            person_id: personId,
            hours: 3,
            logged_date: "2026-01-06",
            status: "declined",
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
          },
          {
            tenant_id: await tenantId(),
            person_id: personId,
            hours: 4,
            logged_date: "2026-01-07",
            status: "confirmed",
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
          },
        ])
        .select("id, status");
      if (error) throw error;
      pendingId = data!.find((row) => row.status === "pending")!.id;
      declinedId = data!.find((row) => row.status === "declined")!.id;
      confirmedId = data!.find((row) => row.status === "confirmed")!.id;

      cleanups.push(async () => {
        await serviceClient
          .from("volunteer_hour_submissions")
          .delete()
          .in("id", [pendingId, declinedId, confirmedId]);
        await person.cleanup();
      });
    });

    test("an unreviewed entry one day inside the window survives", async () => {
      await setMode("volunteer_hour_submissions", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR - DAY) });

      const { data } = await serviceClient
        .from("volunteer_hour_submissions")
        .select("id")
        .in("id", [pendingId, declinedId, confirmedId]);
      expect(data ?? []).toHaveLength(3);
    });

    // The whole shape of this rule: what it keeps is not a period, it is a
    // status. A confirmed entry is the record that the volunteer logged these
    // hours themselves, and the ledger row it produced has no clock at all.
    test("past the window the unconfirmed go and the confirmed stays", async () => {
      await setMode("volunteer_hour_submissions", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await serviceClient
        .from("volunteer_hour_submissions")
        .select("id")
        .in("id", [pendingId, declinedId, confirmedId]);
      expect((data ?? []).map((row) => row.id)).toEqual([confirmedId]);
    });
  });

  // The one rule with no tenant. Everything here is about that: which accounts
  // it can reach, and what has to be true before it deletes one.
  //
  // These tests run the purge enforcing, at a clock two years ahead, so every
  // account in the database is past its date. Only accounts nothing refers to
  // are candidates, which is what keeps that from being destructive -- but it
  // is why the fixtures below assert on accounts they made rather than on
  // counts.
  describe("website accounts, 2 years for an account matched to nothing", () => {
    let orphanId: string;
    let linkedId: string;
    let claimingId: string;
    let claimId: string;
    let personId: string;

    beforeAll(async () => {
      orphanId = await createAccount("retention-orphan-account");

      linkedId = await createAccount("retention-linked-account");
      const person = await createPerson(
        { name: "Retention Account Holder" },
        admin,
      );
      personId = person.id;
      const { error: linkError } = await serviceClient
        .from("people")
        .update({ auth_user_id: linkedId })
        .eq("id", personId);
      if (linkError) throw linkError;

      claimingId = await createAccount("retention-claiming-account");
      const { data: claim, error: claimError } = await serviceClient
        .from("person_claims")
        .insert({
          tenant_id: await tenantId(),
          auth_user_id: claimingId,
          stated_name: "Waiting On A Decision",
        })
        .select("id")
        .single();
      if (claimError) throw claimError;
      claimId = claim.id;

      // The claim block above left rule L enforcing, and these tests run the
      // clock two years on, so the next purge would delete this claim -- and
      // the run after that would find the account attached to nothing and
      // delete it too. That lag is the rule working as designed (rule N reads
      // its candidates before the loop drops this run's claims), but it is not
      // what this block is testing.
      await setMode("person_claims", "dry_run");

      cleanups.push(async () => {
        await serviceClient.from("person_claims").delete().eq("id", claimId);
        await person.cleanup();
        for (const id of [orphanId, linkedId, claimingId]) {
          await serviceClient.auth.admin.deleteUser(id);
        }
      });
    });

    afterAll(async () => {
      // Never leave this one armed: it is the only rule whose enforcement is
      // read from every tenant's row rather than from the one being swept.
      await setMode("constituent_accounts", "dry_run");
      await setSeededMode("constituent_accounts", "dry_run");
    });

    /**
     * Rule N enforces only where every active tenant agrees, and this file no
     * longer runs in the only active tenant. The seeded one beside it reads as
     * `dry_run` and vetoes every deletion below, so these tests say what they
     * are about out loud: both organizations have agreed to the period. The
     * veto itself still has its own test, with a third tenant that has not.
     */
    async function everyTenantEnforces() {
      await setMode("constituent_accounts", "enforce");
      await setSeededMode("constituent_accounts", "enforce");
    }

    test("only an account attached to nothing is a candidate", async () => {
      const { data, error } = await serviceClient.rpc(
        "retention_unclaimed_account_ids",
        { p_cutoff: clockAt(2 * YEAR + DAY) },
      );
      if (error) throw error;
      const candidates = (data ?? []) as string[];

      expect(candidates).toContain(orphanId);
      // A record the organization keeps, and an open claim asking for one.
      expect(candidates).not.toContain(linkedId);
      expect(candidates).not.toContain(claimingId);
    });

    test("an account one day inside the window survives", async () => {
      await everyTenantEnforces();
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR - DAY) });

      expect(await accountExists(orphanId)).toBe(true);
    });

    test("one organization that is not enforcing is a veto", async () => {
      const { data: other, error } = await serviceClient
        .from("tenants")
        .insert({
          name: `Retention Veto ${crypto.randomUUID()}`,
          slug: `retention-veto-${crypto.randomUUID().slice(0, 8)}`,
        })
        .select("id")
        .single();
      if (error) throw error;

      // seed_tenant_retention_policies() gives a new tenant the shipped rules,
      // always in dry_run (20260906160000). So this tenant has not agreed to
      // the period, and the row is as much its sign-up as ours. The other two
      // active tenants have agreed, which is what leaves this one alone as the
      // reason nothing is deleted.
      await everyTenantEnforces();
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });
      expect(await accountExists(orphanId)).toBe(true);

      // Suspended, not deleted: retention_policies references tenants with no
      // cascade, and only active tenants are consulted or swept.
      const { error: suspendError } = await serviceClient
        .from("tenants")
        .update({ status: "suspended" })
        .eq("id", other.id);
      if (suspendError) throw suspendError;

      cleanups.push(async () => {
        await serviceClient
          .from("retention_policies")
          .delete()
          .eq("tenant_id", other.id);
        await serviceClient.from("tenants").delete().eq("id", other.id);
      });
    });

    test("past the window the unattached account is deleted and logged", async () => {
      await everyTenantEnforces();
      const runId = await runPurge({
        dryRun: false,
        asOf: clockAt(2 * YEAR + DAY),
      });

      expect(await accountExists(orphanId)).toBe(false);
      expect(await accountExists(linkedId)).toBe(true);
      expect(await accountExists(claimingId)).toBe(true);

      // Logged against this tenant's run like every other rule, so the page
      // explains the rule rather than appearing to have skipped it.
      const logged = await countsFor(runId, "constituent_accounts");
      expect(logged[0]?.table_name).toBe("auth.users");
      expect(logged[0]?.action).toBe("deleted");
      expect(logged[0]?.row_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe("authorization", () => {
    test("a coordinator cannot trigger a run", async () => {
      const client = await signInAs(SEEDED_USERS.coordinator);
      const { error } = await client.rpc("trigger_retention_run", {
        p_dry_run: true,
      });
      expect(error).not.toBeNull();
    });

    test("a coordinator cannot change a policy mode", async () => {
      const client = await signInAs(SEEDED_USERS.coordinator);
      const { error } = await client.rpc("set_retention_policy_mode", {
        p_policy_key: "contact_messages",
        p_mode: "enforce",
      });
      expect(error).not.toBeNull();
    });

    test("a volunteer cannot read the run log", async () => {
      const client = await signInAs(SEEDED_USERS.volunteer);
      const { data } = await client.from("retention_runs").select("id");
      expect(data ?? []).toHaveLength(0);
    });
  });
});
