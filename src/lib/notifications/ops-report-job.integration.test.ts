// Integration coverage for the daily leadership ops report (#743) against a
// real local Supabase stack: the gates that decide whether anything is sent,
// the ledger that stops it being sent twice, and the tenant scoping that keeps
// one organization's operating picture out of another's inbox.
//
// The scoping cases matter more here than almost anywhere else: runOpsReport
// uses the service-role client, which bypasses RLS entirely, so every
// tenant_id in ops-report-job.ts is load-bearing and there is no policy
// underneath to catch a mistake.
//
// RESEND_API_KEY is unset here (as it is in CI), so sendEmail() logs and
// returns success without contacting a provider -- the whole path runs with no
// mail leaving the building.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import {
  adminClient,
  createSuspendedTenant,
  serviceRoleClient,
} from "../../../test/integration-setup";
import { EMAIL_ENABLED_SETTING_KEY } from "./kinds";
import {
  OPS_REPORT_KIND,
  OPS_REPORT_RECIPIENTS_SETTING_KEY,
} from "./ops-report";

// ops-report-job.ts and the send helper both import "server-only", which
// throws outside Next's bundler.
mock.module("server-only", () => ({}));

/**
 * Captures what would have gone to the provider, so a test can read the links
 * the report actually built (#860). Behaviourally the same as the unset-key
 * path this file otherwise runs on, so every other test here is unaffected.
 */
const sent: { to: string; html: string; text: string }[] = [];
mock.module("@/lib/email/send", () => ({
  sendEmail: async (message: { to: string; html: string; text: string }) => {
    sent.push(message);
    return { ok: true, id: null };
  },
}));

const { runOpsReport } = await import("./ops-report-job");

const service = serviceRoleClient();
const SITE_URL = "https://chattersnow.example";
const RECIPIENT = "leadership@example.test";
const NOW = new Date("2026-03-14T13:00:00Z");

let tenantId: string;
let messageIds: string[] = [];

/** Something to report, so a run is not skipped for being empty. */
async function seedSomethingToReport(): Promise<void> {
  const { data, error } = await service
    .from("contact_messages")
    .insert({
      tenant_id: tenantId,
      name: "Integration",
      email: "writer@example.test",
      topic: "general",
      message: "Anything at all",
      // Inside the 24-hour first-run window ending at NOW.
      created_at: new Date(NOW.getTime() - 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  messageIds.push(data.id as string);
}

async function setRecipients(value: unknown): Promise<void> {
  const { error } = await service
    .from("app_settings")
    .upsert(
      { tenant_id: tenantId, key: OPS_REPORT_RECIPIENTS_SETTING_KEY, value },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw error;
}

async function opsReportRows() {
  const { data, error } = await service
    .from("notification_deliveries")
    .select("id, tenant_id, person_id, dedupe_key, status")
    .eq("kind", OPS_REPORT_KIND);
  if (error) throw error;
  return data ?? [];
}

beforeAll(async () => {
  const { data, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  tenantId = data.id as string;
});

afterEach(async () => {
  // Only this file's rows: supabase/seed.sql leaves a delivery behind for the
  // admin's person and the tenant-isolation suite asserts the table is not
  // empty. Nothing seeded uses the ops_report kind.
  await service
    .from("notification_deliveries")
    .delete()
    .eq("kind", OPS_REPORT_KIND);
  if (messageIds.length > 0) {
    await service.from("contact_messages").delete().in("id", messageIds);
    messageIds = [];
  }
  await service
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .in("key", [OPS_REPORT_RECIPIENTS_SETTING_KEY, EMAIL_ENABLED_SETTING_KEY]);
});

afterAll(async () => {
  await service
    .from("notification_deliveries")
    .delete()
    .eq("kind", OPS_REPORT_KIND);
});

describe("runOpsReport gates", () => {
  test("a tenant with no configured recipients gets nothing", async () => {
    await seedSomethingToReport();

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(summary.tenants).toBe(0);
    expect(summary.sent).toBe(0);
    expect(await opsReportRows()).toHaveLength(0);
  });

  test("a recipients value that holds no usable address is the same as none", async () => {
    await seedSomethingToReport();
    await setRecipients(["not-an-address", "   "]);

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(summary.tenants).toBe(0);
    expect(await opsReportRows()).toHaveLength(0);
  });

  test("the org kill switch stops the report", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);
    const { error } = await service
      .from("app_settings")
      .upsert(
        { tenant_id: tenantId, key: EMAIL_ENABLED_SETTING_KEY, value: false },
        { onConflict: "tenant_id,key" },
      );
    if (error) throw error;

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(summary.considered).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    // Nothing is claimed either: a muted tenant must leave no trace that would
    // make tomorrow's run think today's report went out.
    expect(await opsReportRows()).toHaveLength(0);
  });

  // "A quiet day sends nothing rather than an empty report" is asserted in
  // ops-report.test.ts instead. It cannot be asserted here: supabase/seed.sql
  // leaves submitted expenses and reimbursements standing so the approval
  // queues have something in them, and those are not time-windowed -- against
  // the seeded database there is no such thing as a quiet day, and emptying
  // the queues to manufacture one would break every other file that reads
  // them.
});

describe("runOpsReport tenant status (#1674)", () => {
  /**
   * A second tenant with its own leadership inbox and something to report.
   * Provisioned suspended (#795); the control case activates it only for the
   * length of one run, to show the fixture would otherwise be sent.
   */
  const tag = crypto.randomUUID().slice(0, 8);
  const B_RECIPIENT = `it-ops-b-${tag}@example.test`;
  let tenantB: Awaited<ReturnType<typeof createSuspendedTenant>>;

  beforeAll(async () => {
    tenantB = await createSuspendedTenant(`ops-${tag}`);
    const { error: settingError } = await service.from("app_settings").insert({
      tenant_id: tenantB.id,
      key: OPS_REPORT_RECIPIENTS_SETTING_KEY,
      value: [B_RECIPIENT],
    });
    if (settingError) throw settingError;
    const { error: messageError } = await service
      .from("contact_messages")
      .insert({
        tenant_id: tenantB.id,
        name: "Integration",
        email: "writer@example.test",
        topic: "general",
        message: "Anything at all",
        created_at: new Date(NOW.getTime() - 60_000).toISOString(),
      });
    if (messageError) throw messageError;
  });

  afterAll(async () => {
    await tenantB.cleanup(["notification_deliveries", "contact_messages"]);
  });

  afterEach(() => {
    sent.length = 0;
  });

  async function bRows() {
    return (await opsReportRows()).filter(
      (row) => row.tenant_id === tenantB.id,
    );
  }

  for (const status of ["suspended", "archived"] as const) {
    test(`a tenant that is ${status} gets no report and no ledger row`, async () => {
      await seedSomethingToReport();
      await setRecipients([RECIPIENT]);
      await tenantB.setStatus(status);
      try {
        const summary = await runOpsReport(service, {
          now: NOW,
          siteUrl: SITE_URL,
        });
        expect(summary.failed).toBe(0);
        expect(sent.filter((m) => m.to === B_RECIPIENT)).toHaveLength(0);
        expect(await bRows()).toHaveLength(0);
        // Active tenants are unaffected.
        expect(sent.filter((m) => m.to === RECIPIENT)).toHaveLength(1);
      } finally {
        await tenantB.setStatus("suspended");
      }
    });
  }

  test("the same tenant, once active, is sent its report", async () => {
    await tenantB.setStatus("active");
    try {
      await runOpsReport(service, { now: NOW, siteUrl: SITE_URL });
    } finally {
      await tenantB.setStatus("suspended");
    }
    expect(sent.filter((m) => m.to === B_RECIPIENT)).toHaveLength(1);
    expect(await bRows()).toHaveLength(1);
  });
});

describe("runOpsReport module gating (#903)", () => {
  /**
   * Writes an entitlement as service_role, which is how the CLI does it --
   * `tenant_modules` has no write policy for anyone, so this is the only way
   * to set one from a test. Restored in the afterEach below: leaving a module
   * off here would silently change what every other integration file sees,
   * since has_permission() consults the same rows.
   */
  async function setModule(key: string, enabled: boolean): Promise<void> {
    const { error } = await service
      .from("tenant_modules")
      .upsert(
        { tenant_id: tenantId, module_key: key, enabled },
        { onConflict: "tenant_id,module_key" },
      );
    if (error) throw error;
  }

  afterEach(async () => {
    await setModule("communications", true);
    await setModule("finance", true);
  });

  test("drops the lines a disabled module owns and keeps the rest", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);
    sent.length = 0;
    await setModule("communications", false);

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(summary.sent).toBe(1);
    const body = sent[0].text;
    // The contact message seeded above is the Messages module's line, and it
    // is gone; the seeded expense queue is Finance's, and it is not.
    expect(body).not.toContain("contact message");
    expect(body).toContain("waiting for approval");
  });

  test("a module the tenant has is read as before", async () => {
    // The counterpart to the case above, so a green assertion there cannot be
    // the report having failed to build at all.
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);
    sent.length = 0;

    await runOpsReport(service, { now: NOW, siteUrl: SITE_URL });

    expect(sent[0].text).toContain("contact message");
  });

  test("modules_for_tenant answers for a tenant it is handed", async () => {
    // The sessionless read the job resolves its gates through. my_modules()
    // cannot stand in: a cron route has no current_tenant_id().
    await setModule("communications", false);

    const { data, error } = await service.rpc("modules_for_tenant", {
      p_tenant_id: tenantId,
    });
    if (error) throw error;

    const rows = (data ?? []) as { module_key: string; enabled: boolean }[];
    const byKey = new Map(rows.map((row) => [row.module_key, row.enabled]));
    expect(byKey.get("communications")).toBe(false);
    expect(byKey.get("finance")).toBe(true);
    // Core modules are in the answer and are always on -- the trigger refuses
    // a row that says otherwise, whoever writes it.
    expect(byKey.get("people")).toBe(true);
    expect(byKey.get("administration")).toBe(true);
  });
});

describe("runOpsReport delivery", () => {
  test("sends one organization-addressed report per recipient", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT, "board@example.test"]);

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(summary.tenants).toBe(1);
    expect(summary.considered).toBe(2);
    expect(summary.sent).toBe(2);
    expect(summary.failed).toBe(0);

    const rows = await opsReportRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.tenant_id).toBe(tenantId);
      // Addressed to the organization, not to anyone in `people`.
      expect(row.person_id).toBeNull();
      expect(row.status).toBe("sent");
    }
    expect(rows.map((row) => row.dedupe_key).sort()).toEqual([
      "ops-report:2026-03-14:board@example.test",
      `ops-report:2026-03-14:${RECIPIENT}`,
    ]);
  });

  test("re-running the same day does not re-send", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);

    const first = await runOpsReport(service, { now: NOW, siteUrl: SITE_URL });
    const second = await runOpsReport(service, { now: NOW, siteUrl: SITE_URL });

    expect(first.sent).toBe(1);
    // The second run loses the race on the partial unique index added in
    // 20260907120000 -- which is the only thing standing between a scheduler
    // that fires twice and two copies of the same report.
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(await opsReportRows()).toHaveLength(1);
  });

  test("the next day is a new report", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);

    await runOpsReport(service, { now: NOW, siteUrl: SITE_URL });
    // A day later, with something new inside the window that now starts at the
    // first run's ledger row.
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const { data, error } = await service
      .from("contact_messages")
      .insert({
        tenant_id: tenantId,
        name: "Integration",
        email: "writer@example.test",
        topic: "general",
        message: "Something newer",
      })
      .select("id")
      .single();
    if (error) throw error;
    messageIds.push(data.id as string);

    const second = await runOpsReport(service, {
      now: tomorrow,
      siteUrl: SITE_URL,
    });

    expect(second.sent).toBe(1);
    expect((await opsReportRows()).map((row) => row.dedupe_key).sort()).toEqual(
      [
        `ops-report:2026-03-14:${RECIPIENT}`,
        `ops-report:2026-03-15:${RECIPIENT}`,
      ],
    );
  });
});

describe("app_settings scoping", () => {
  test("the recipient list is readable only by an administrator", async () => {
    await setRecipients([RECIPIENT]);

    // The panel that edits this runs as a signed-in administrator, which is
    // the only session app_settings' own select policy admits; this asserts
    // the address is not sitting in a table any signed-in user can read.
    const { data, error } = await adminClient
      .from("app_settings")
      .select("value")
      .eq("key", OPS_REPORT_RECIPIENTS_SETTING_KEY)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.value).toEqual([RECIPIENT]);
  });
});

describe("runOpsReport link origin", () => {
  /**
   * The ops report resolves its origin at its own call site (#860), so it gets
   * its own case rather than leaning on the task digest's: a shared helper
   * wired in wrong in one of two places is exactly the defect that survives a
   * single test. One tenant is enough -- what has to hold is that the origin
   * comes from the tenant row and not from the argument.
   */
  const TENANT_DOMAIN = "ops-origin-test.example";

  async function setCustomDomain(domain: string | null) {
    const { error } = await service
      .from("tenants")
      .update({ custom_domain: domain })
      .eq("id", tenantId);
    if (error) throw error;
  }

  afterEach(async () => {
    await setCustomDomain(null);
    sent.length = 0;
  });

  test("links each tenant's report into that tenant's own site", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);
    await setCustomDomain(TENANT_DOMAIN);

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });
    expect(summary.sent).toBe(1);

    const report = sent.at(-1)!;
    expect(report.html).toContain(`https://${TENANT_DOMAIN}/portal/`);
    expect(report.html).not.toContain(SITE_URL);
    expect(report.text).not.toContain(SITE_URL);
  });

  test("falls back to the platform origin for a tenant with no domain", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);
    await setCustomDomain(null);

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });
    expect(summary.sent).toBe(1);

    expect(sent.at(-1)!.html).toContain(`${SITE_URL}/portal/`);
  });
});
