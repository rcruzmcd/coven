import { test, expect } from "./helpers/test";
import { signIn, reloadStayingSignedIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { pickPerson, seedPerson } from "./helpers/people";
import { modal, toastsCleared } from "./helpers/dialog";
import { exactLabel } from "./helpers/labels";

// The document-shaped governance routes (#442): bylaws, policies, conflict
// of interest, and annual requirements. Board members, meetings, and
// resolutions live in governance-board-and-meetings.spec.ts.

function uniqueSuffix() {
  return crypto.randomUUID().slice(0, 8);
}

test.describe("portal governance records", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("records a bylaws version and edits its amendment summary", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const version = `E2E Bylaws ${uniqueSuffix()}`;
    const summary = `E2E amendment summary ${uniqueSuffix()}`;

    try {
      await page.goto("/portal/governance/bylaws");
      await expect(
        page.getByRole("heading", { level: 1, name: "Bylaws", exact: true }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Add bylaws version" }).click();
      const addDialog = modal(page);
      await expect(
        addDialog.getByRole("heading", { name: "Add bylaws version" }),
      ).toBeVisible();

      await addDialog.getByLabel("Version").fill(version);
      await addDialog.getByLabel("Effective date").fill("2026-02-01");
      await addDialog
        .getByRole("button", { name: "Add bylaws version" })
        .click();
      await expect(addDialog).not.toBeVisible();

      // The newest effective date renders in the "Current" card and older
      // ones in the amendment-history table, so this version lands in
      // either one depending on what else is on file. Match whichever
      // container holds it -- when it's a history row both the row and its
      // enclosing card match, and `.last()` picks the row.
      const entry = page
        .locator('[data-slot="card"], tr')
        .filter({ hasText: version })
        .last();
      await expect(entry).toBeVisible({ timeout: 15_000 });

      // The confirmation has to be off the screen first (#1294). Below `sm`
      // the toast viewport is nearly the full width at `bottom-4`, so on
      // `mobile-chromium` it covers the bottom of this table -- and Base UI
      // pauses each toast's dismissal timer while the pointer is over it, so a
      // cursor parked there by the previous click freezes the stack rather
      // than waiting it out. Same cause as #1283's `nonprofit-status` failure.
      await toastsCleared(page);
      await entry.getByRole("button", { name: "View bylaws version" }).click();
      const sheet = modal(page);
      await expect(sheet.getByText(version)).toBeVisible();

      await sheet.getByRole("button", { name: "Edit bylaws version" }).click();
      await sheet.getByLabel("What changed").fill(summary);
      await sheet.getByRole("button", { name: "Save changes" }).click();

      await expect(sheet.getByText(summary)).toBeVisible({ timeout: 15_000 });
    } finally {
      await admin.from("bylaws").delete().eq("version", version);
    }
  });

  test("adds a policy, filters the table, and edits its version", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const suffix = uniqueSuffix();
    const policyName = `E2E Policy ${suffix}`;
    // Distinctive version strings, so the post-edit row assertion can't be
    // satisfied by a bare digit that already appears in the date column.
    const version = `E2E v1 ${suffix}`;
    const updatedVersion = `E2E v2 ${suffix}`;

    try {
      await page.goto("/portal/governance/policies");
      await expect(
        page.getByRole("heading", { level: 1, name: "Policies", exact: true }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Add policy" }).click();
      const addDialog = modal(page);
      await expect(
        addDialog.getByRole("heading", { name: "Add policy" }),
      ).toBeVisible();

      await addDialog.getByLabel("Policy name").fill(policyName);
      await addDialog.getByLabel("Category").fill("Compliance");
      await addDialog.getByLabel("Version").fill(version);
      await addDialog.getByLabel("Effective date").fill("2026-02-01");
      await addDialog.getByRole("button", { name: "Add policy" }).click();
      await expect(addDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: policyName });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText("Compliance");

      // Filters are inline on the page now rather than inside a sheet, so the
      // table stays visible while the search box is edited.
      // Exact: the header's command palette trigger is labelled "Search the
      // portal", which a substring match would also pick up.
      const search = page.getByLabel("Search", { exact: true });
      await search.fill(`no-such-policy-${policyName}`);
      await expect(
        page.getByText("No policies match your filters."),
      ).toBeVisible();

      await search.fill(policyName);
      await expect(row).toBeVisible();

      await toastsCleared(page);
      await row.getByRole("button", { name: "View policy" }).click();
      const sheet = modal(page);
      await expect(sheet.getByText(policyName)).toBeVisible();

      await sheet.getByRole("button", { name: "Edit policy" }).click();
      await sheet.getByLabel("Version").fill(updatedVersion);
      await sheet.getByRole("button", { name: "Save changes" }).click();
      await expect(sheet.getByText(updatedVersion)).toBeVisible({
        timeout: 15_000,
      });

      // Reload rather than closing the sheet: the table behind an open
      // sheet is aria-hidden (invisible to role-based locators), and a
      // fresh load also proves the edit round-tripped to the database
      // instead of only reaching the sheet's own client state. It clears
      // the search filter too, which this assertion doesn't rely on.
      await reloadStayingSignedIn(page);
      await expect(row).toContainText(updatedVersion, { timeout: 15_000 });
    } finally {
      await admin.from("policies").delete().eq("name", policyName);
    }
  });

  test("files a conflict of interest disclosure and edits its notes", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const person = await seedPerson(admin, "Disclosure");
    const notes = `E2E disclosure notes ${uniqueSuffix()}`;
    const updatedNotes = `${notes} (revised)`;

    try {
      await page.goto("/portal/governance/conflict-of-interest");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Conflict of Interest",
          exact: true,
        }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Add disclosure" }).click();
      const addDialog = modal(page);
      await expect(
        addDialog.getByRole("heading", { name: "Add disclosure" }),
      ).toBeVisible();

      await pickPerson(addDialog, person.name);

      // Disclosure year defaults to the current year, and the table is
      // unique per (person, year) -- the freshly seeded person keeps this
      // from colliding with a concurrent project's run.
      await addDialog.getByLabel("On-file date").fill("2026-02-10");
      await addDialog.getByLabel("Notes").fill(notes);
      await addDialog.getByRole("button", { name: "Add disclosure" }).click();
      await expect(addDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: person.name });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText(notes);

      await toastsCleared(page);
      await row.getByRole("button", { name: "View disclosure" }).click();
      const sheet = modal(page);
      // Exact, because the picker also announces the choice to screen
      // readers as "<name> selected." in an sr-only live region, and a
      // substring match resolves to both.
      await expect(sheet.getByText(person.name, { exact: true })).toBeVisible();
      await expect(sheet.getByText(notes)).toBeVisible();

      await sheet.getByRole("button", { name: "Edit disclosure" }).click();
      await sheet.getByLabel("Notes").fill(updatedNotes);
      await sheet.getByRole("button", { name: "Save changes" }).click();

      await expect(sheet.getByText(updatedNotes)).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await admin
        .from("conflict_of_interest_disclosures")
        .delete()
        .eq("person_id", person.id);
      await admin.from("people").delete().eq("id", person.id);
    }
  });

  test("tracks an annual requirement through to done", async ({ page }) => {
    const admin = createAdminClient();
    const person = await seedPerson(admin, "Requirement Owner");
    const requirementName = `E2E Requirement ${uniqueSuffix()}`;

    try {
      await page.goto("/portal/governance/annual-requirements");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Annual Requirements",
          exact: true,
        }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Add requirement" }).click();
      const addDialog = modal(page);
      await expect(
        addDialog.getByRole("heading", { name: "Add annual requirement" }),
      ).toBeVisible();

      // Exact, so a longer label that contains it cannot match too.
      await addDialog.getByLabel(exactLabel("Name")).fill(requirementName);
      await addDialog.getByLabel("Due date").fill("2026-05-15");
      await pickPerson(addDialog, person.name);
      await addDialog
        .getByRole("button", { name: "Add requirement", exact: true })
        .click();
      await expect(addDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: requirementName });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText(person.name);
      await expect(row).toContainText("Not started");

      await row
        .getByRole("combobox", { name: `Status for ${requirementName}` })
        .click();
      await page
        .getByRole("listbox")
        .getByText("Done", { exact: true })
        .click();
      await expect(row).toContainText("Done", { timeout: 15_000 });

      // Two writes above this one, so two toasts stacked over the table (#1294).
      await toastsCleared(page);
      await row.getByRole("button", { name: "View requirement" }).click();
      const sheet = modal(page);
      await expect(sheet.getByText(requirementName)).toBeVisible();
      await expect(sheet.getByText("Done", { exact: true })).toBeVisible();
    } finally {
      await admin
        .from("annual_requirements")
        .delete()
        .eq("name", requirementName);
      await admin.from("people").delete().eq("id", person.id);
    }
  });
});
