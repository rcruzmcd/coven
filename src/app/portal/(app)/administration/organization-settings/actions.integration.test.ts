// Integration test: exercises the real app_settings Server Actions
// (checkPermission, then the real `app_settings` RLS) against a real local
// Supabase stack. No integration test previously touched `system_settings`
// or `app_settings` writes -- finance/expenses and finance/reimbursements
// only read the seeded threshold. Distinct from every other Administration
// section: gated on `system_settings`, which admin AND board can manage
// (per 20260823040000_create_app_settings.sql), not `administration`.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  seededTenantId,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

// admin.ts imports "server-only" -- stub it so this plain `bun test` run can
// import the real module. Needed here because app_settings grants
// authenticated only insert/update, never delete (see the comment on
// updateBrandingAction) -- the service-role client is the only way to clean
// up a test-only key or restore a shared one to its original value.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const {
  updateAppSettingAction,
  updateExpenseApprovalThresholdAction,
  updateReimbursementApprovalThresholdAction,
  updateSalesTaxRateAction,
  updateEmailNotificationsEnabledAction,
  updateSenderIdentityAction,
  updateBrandingAction,
} = await import("./actions");
const { SALES_TAX_RATE_SETTING_KEY } = await import("@/lib/sales-tax");
const { FROM_ADDRESS_SETTING_KEY, REPLY_TO_SETTING_KEY } =
  await import("@/lib/email/identity");
const { TYPOGRAPHY_TOKEN, brandSettingKey } = await import("@/lib/branding");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// Every read and write below is scoped to the seeded tenant, the one the
// signed-in accounts write to. The service-role client sees every tenant, and
// a file earlier in the run that provisions a second one (which seeds its own
// `finance.*` and sales-tax rows) left these reads matching two rows whenever
// its teardown had not finished first.
const tenantId = await seededTenantId();

async function settingValue(key: string) {
  const { data, error } = await serviceRoleClient
    .from("app_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value;
}

async function deleteSetting(key: string) {
  await serviceRoleClient
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", key);
}

function thresholdForm(value: string) {
  const fd = new FormData();
  fd.set("threshold", value);
  return fd;
}

function rateForm(value: string) {
  const fd = new FormData();
  fd.set("rate", value);
  return fd;
}

// Reads a shared setting's current value, runs `run`, then restores the
// original value via the service-role client -- since other integration
// test files (finance/expenses, finance/reimbursements) read this same key,
// this must not leave it mutated for whichever test file runs next.
async function withRestoredSetting(key: string, run: () => Promise<void>) {
  const original = await settingValue(key);
  try {
    await run();
  } finally {
    if (original === undefined) {
      await deleteSetting(key);
    } else {
      await serviceRoleClient
        .from("app_settings")
        .update({ value: original })
        .eq("tenant_id", tenantId)
        .eq("key", key);
    }
  }
}

describe("administration/organization-settings actions (integration)", () => {
  test("requires system_settings:manage to update a setting", async () => {
    currentSupabase = anonClient();
    expect(
      await updateAppSettingAction("integration_test.probe", "value"),
    ).toEqual(DENIED);
  });

  test("threshold actions validate the amount before checking permission", async () => {
    currentSupabase = anonClient();

    expect(
      await updateExpenseApprovalThresholdAction(thresholdForm("not-a-number")),
    ).toEqual({ error: "Threshold must be a positive number." });
    expect(
      await updateExpenseApprovalThresholdAction(thresholdForm("-5")),
    ).toEqual({ error: "Threshold must be a positive number." });
    expect(
      await updateReimbursementApprovalThresholdAction(
        thresholdForm("not-a-number"),
      ),
    ).toEqual({ error: "Threshold must be a positive number." });

    // A valid amount clears validation, so this reaches (and fails) the
    // permission check instead.
    expect(
      await updateExpenseApprovalThresholdAction(thresholdForm("750")),
    ).toEqual(DENIED);
  });

  test("admin can update a generic setting and both thresholds", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await updateAppSettingAction("integration_test.probe", { foo: "bar" }),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/administration/organization-settings",
    );
    expect(await settingValue("integration_test.probe")).toEqual({
      foo: "bar",
    });
    // Upsert on `key`: re-applying changes the value rather than erroring.
    expect(
      await updateAppSettingAction("integration_test.probe", { foo: "baz" }),
    ).toEqual({ success: true });
    expect(await settingValue("integration_test.probe")).toEqual({
      foo: "baz",
    });
    await deleteSetting("integration_test.probe");

    await withRestoredSetting(
      "finance.expense_approval_threshold",
      async () => {
        expect(
          await updateExpenseApprovalThresholdAction(thresholdForm("750")),
        ).toEqual({ success: true });
        expect(await settingValue("finance.expense_approval_threshold")).toBe(
          750,
        );
      },
    );

    await withRestoredSetting(
      "finance.reimbursement_approval_threshold",
      async () => {
        expect(
          await updateReimbursementApprovalThresholdAction(
            thresholdForm("600"),
          ),
        ).toEqual({ success: true });
        expect(
          await settingValue("finance.reimbursement_approval_threshold"),
        ).toBe(600);
      },
    );
  });

  // #997: the register's default rate. Validated before the permission check
  // like the thresholds, stored as a number the register reads through
  // org_sales_tax, and the seed leaves it at 0.
  test("the sales tax rate round-trips, to three decimals, within 0-100", async () => {
    currentSupabase = anonClient();
    for (const bad of ["", "abc", "-1", "100.001"]) {
      expect(await updateSalesTaxRateAction(rateForm(bad)), bad).toEqual({
        error: "Tax rate must be between 0 and 100 percent.",
      });
    }
    expect(await updateSalesTaxRateAction(rateForm("8.25"))).toEqual(DENIED);

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    await withRestoredSetting(SALES_TAX_RATE_SETTING_KEY, async () => {
      expect(await updateSalesTaxRateAction(rateForm("8.3756"))).toEqual({
        success: true,
      });
      expect(await settingValue(SALES_TAX_RATE_SETTING_KEY)).toBe(8.376);

      // What the register will prefill: the view hands the same number to a
      // session that holds sales:manage and nothing in app_settings' policy.
      const coordinator = await signInAs(SEEDED_USERS.coordinator);
      const { data, error } = await coordinator
        .from("org_sales_tax")
        .select("rate")
        .maybeSingle();
      expect(error).toBeNull();
      expect(Number(data?.rate)).toBe(8.376);

      expect(await updateSalesTaxRateAction(rateForm("0"))).toEqual({
        success: true,
      });
      expect(await settingValue(SALES_TAX_RATE_SETTING_KEY)).toBe(0);
    });
  });

  // system_settings is admin AND board (both 'manage') -- unlike every other
  // Administration resource, which is admin-only. This proves the actions
  // gate on system_settings, not on administration: board holds
  // administration:none but must still be let in.
  test("board (system_settings manage, not administration) can update settings too", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(
      await updateAppSettingAction("integration_test.probe_board", "value"),
    ).toEqual({ success: true });
    expect(await settingValue("integration_test.probe_board")).toBe("value");
    await deleteSetting("integration_test.probe_board");
  });

  // Every seeded role except admin and board holds system_settings:none.
  const ROLES_WITHOUT_SYSTEM_SETTINGS = [
    ["event_coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["volunteer", SEEDED_USERS.volunteer],
    ["multi-role (event_coordinator + volunteer)", SEEDED_USERS.multi],
    ["no-role", SEEDED_USERS.noAccess],
    ["deactivated (former)", SEEDED_USERS.former],
  ] as const;

  for (const [label, email] of ROLES_WITHOUT_SYSTEM_SETTINGS) {
    test(`${label} account cannot update settings`, async () => {
      currentSupabase = await signInAs(email);
      const key = `integration_test.denied_${crypto.randomUUID()}`;

      expect(await updateAppSettingAction(key, "value")).toEqual(DENIED);
      expect(
        await updateExpenseApprovalThresholdAction(thresholdForm("750")),
      ).toEqual(DENIED);
      expect(
        await updateReimbursementApprovalThresholdAction(thresholdForm("600")),
      ).toEqual(DENIED);
      expect(await updateSalesTaxRateAction(rateForm("8.25"))).toEqual(DENIED);
      expect(await updateEmailNotificationsEnabledAction(false)).toEqual(
        DENIED,
      );

      expect(await settingValue(key)).toBeUndefined();
    });
  }
});

describe("the outbound email kill switch (integration)", () => {
  const KEY = "notifications.email_enabled";

  afterEach(async () => {
    await deleteSetting(KEY);
  });

  test("an admin can turn outbound email off", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await updateEmailNotificationsEnabledAction(false)).toEqual({
      success: true,
    });
    expect(await settingValue(KEY)).toBe(false);
  });

  test("the board can turn it back on", async () => {
    // system_settings, not administration: board holds manage on it too.
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await updateEmailNotificationsEnabledAction(true)).toEqual({
      success: true,
    });
    expect(await settingValue(KEY)).toBe(true);
  });

  test.each([
    ["a volunteer", SEEDED_USERS.volunteer],
    ["an account with no roles", SEEDED_USERS.noAccess],
    ["a deactivated account", SEEDED_USERS.former],
  ])("%s cannot touch it", async (_label, email) => {
    currentSupabase = await signInAs(email);

    expect(await updateEmailNotificationsEnabledAction(false)).toEqual(DENIED);
    expect(await settingValue(KEY)).toBeUndefined();
  });

  test("an anonymous visitor cannot touch it", async () => {
    currentSupabase = anonClient();

    expect(await updateEmailNotificationsEnabledAction(false)).toEqual(DENIED);
    expect(await settingValue(KEY)).toBeUndefined();
  });

  test("turning it off is recorded in the audit log", async () => {
    // The trigger on app_settings is what makes the switch a record of a
    // decision rather than a rumour -- an administrator has to be able to show
    // when outbound email was stopped, and by whom.
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    await updateEmailNotificationsEnabledAction(false);

    const { data, error } = await serviceRoleClient
      .from("audit_log")
      .select("table_name, action, new_data")
      .eq("table_name", "app_settings")
      .order("occurred_at", { ascending: false })
      .limit(20);
    expect(error).toBeNull();
    expect(
      data!.some(
        (row) => (row.new_data as { key?: string } | null)?.key === KEY,
      ),
    ).toBe(true);
  });
});

describe("updateSenderIdentityAction", () => {
  function identityForm(replyTo: string, fromAddress = "") {
    const fd = new FormData();
    fd.set("replyTo", replyTo);
    fd.set("fromAddress", fromAddress);
    return fd;
  }

  test("an anonymous visitor cannot touch it", async () => {
    currentSupabase = anonClient();

    expect(
      await updateSenderIdentityAction(identityForm("board@example.test")),
    ).toEqual(DENIED);
  });

  test("saves the tenant's Reply-To", async () => {
    await withRestoredSetting(REPLY_TO_SETTING_KEY, async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      expect(
        await updateSenderIdentityAction(identityForm("Board@Example.TEST")),
      ).toEqual({ success: true });
      // Normalized on the way in, the way the ops report's recipients are.
      expect(await settingValue(REPLY_TO_SETTING_KEY)).toBe(
        "board@example.test",
      );
    });
  });

  test("refuses a Reply-To that is not an address", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await updateSenderIdentityAction(identityForm("not-an-address")),
    ).toEqual({ error: "Not an email address: not-an-address." });
  });

  test("clearing the field writes an empty value rather than deleting", async () => {
    // app_settings has no delete grant for `authenticated`, so "" is how the
    // readers are told a tenant has configured nothing.
    await withRestoredSetting(REPLY_TO_SETTING_KEY, async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);
      await updateSenderIdentityAction(identityForm("board@example.test"));

      expect(await updateSenderIdentityAction(identityForm(""))).toEqual({
        success: true,
      });
      expect(await settingValue(REPLY_TO_SETTING_KEY)).toBe("");
    });
  });

  test("refuses a From address on a domain this tenant does not own", async () => {
    // The message is what this check is for; resolveMailIdentity() is what
    // makes it true, since updateAppSettingAction takes a free-form key.
    await withRestoredSetting(FROM_ADDRESS_SETTING_KEY, async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      const result = await updateSenderIdentityAction(
        identityForm("", "billing@someone-elses-domain.example"),
      );

      expect(result).toHaveProperty("error");
      expect(await settingValue(FROM_ADDRESS_SETTING_KEY)).not.toBe(
        "billing@someone-elses-domain.example",
      );
    });
  });
});

/**
 * The typeface set (#1260, picker #1261) -- the one brand token whose value is
 * a key into a registry rather than a string an administrator types.
 *
 * `updateBrandingAction` writes every `brand.*` row in one upsert, so these
 * snapshot and restore the whole namespace rather than the single key.
 * Otherwise the first save here would leave the seeded palette blank for
 * whichever integration file runs next.
 */
describe("updateBrandingAction typography", () => {
  const KEY = brandSettingKey(TYPOGRAPHY_TOKEN);

  function brandingForm(typography: string) {
    const fd = new FormData();
    fd.set(TYPOGRAPHY_TOKEN, typography);
    return fd;
  }

  async function withRestoredBranding(run: () => Promise<void>) {
    const { data } = await serviceRoleClient
      .from("app_settings")
      .select("key, value")
      .eq("tenant_id", tenantId)
      .like("key", "brand.%");
    const original = data ?? [];
    try {
      await run();
    } finally {
      // Restoring the rows that existed is not enough: one save writes every
      // `brand.*` key, so a token this tenant had never set is left behind
      // rather than put back. Delete what was not in the snapshot.
      const keys = new Set(original.map((row) => row.key as string));
      const { data: after } = await serviceRoleClient
        .from("app_settings")
        .select("key")
        .eq("tenant_id", tenantId)
        .like("key", "brand.%");
      for (const row of after ?? []) {
        if (!keys.has(row.key as string)) {
          await serviceRoleClient
            .from("app_settings")
            .delete()
            .eq("tenant_id", tenantId)
            .eq("key", row.key);
        }
      }
      for (const row of original) {
        await serviceRoleClient
          .from("app_settings")
          .update({ value: row.value })
          .eq("tenant_id", tenantId)
          .eq("key", row.key);
      }
    }
  }

  test("an anonymous visitor cannot touch it", async () => {
    currentSupabase = anonClient();

    expect(await updateBrandingAction(brandingForm("rounded"))).toEqual(DENIED);
  });

  test("an admin picks a set and it round-trips by key", async () => {
    await withRestoredBranding(async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      expect(await updateBrandingAction(brandingForm("editorial"))).toEqual({
        success: true,
      });
      expect(await settingValue(KEY)).toBe("editorial");
    });
  });

  test("a key the registry does not know is refused, not stored", async () => {
    await withRestoredBranding(async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);
      await updateBrandingAction(brandingForm("editorial"));

      expect(await updateBrandingAction(brandingForm("comic-sans"))).toEqual({
        error: "Pick one of the listed typefaces.",
      });
      expect(await settingValue(KEY)).toBe("editorial");
    });
  });

  test("clearing it writes an empty value rather than deleting", async () => {
    // app_settings has no delete grant for `authenticated`, so "" is how "no
    // choice of my own" is written -- and `typographySet("")` is null, which
    // is the platform's own set everywhere that reads it.
    await withRestoredBranding(async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);
      await updateBrandingAction(brandingForm("editorial"));

      expect(await updateBrandingAction(brandingForm(""))).toEqual({
        success: true,
      });
      expect(await settingValue(KEY)).toBe("");
    });
  });
});
