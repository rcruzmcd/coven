// E2E coverage for /portal/finance/donations (monetary donations CRUD).
// Seeded by supabase/seed.sql: a $100.00 check from Jamie Rivera, a $25.00
// anonymous cash gift, and a $50.00 card gift from Alex Chen — read-only
// tests lean on those instead of creating rows. Created rows use unique
// cent amounts (the table shows no notes column) and non-seeded payment
// methods so the method-filter test stays stable across parallel projects.
import { test, expect } from "./helpers/test";
import type { Page } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";
import { pickPerson } from "./helpers/people";
import { pager, revealRow } from "./helpers/table";

function uniqueAmount() {
  // Between $10.00 and $910.00 with non-round cents; below $1,000 so the
  // formatted value has no thousands separator to match against.
  return ((Date.now() % 90000) + 1000 + Math.floor(Math.random() * 89)) / 100;
}

function formatted(amount: number) {
  return `$${amount.toFixed(2)}`;
}

async function createDonation(
  page: Page,
  options: { amount: number; method: string; donorQuery?: string },
) {
  await page.getByRole("button", { name: "New donation" }).click();
  const dialog = modal(page);
  await expect(
    dialog.getByRole("heading", { name: "Add donation" }),
  ).toBeVisible();

  if (options.donorQuery) {
    await pickPerson(dialog, new RegExp(options.donorQuery), {
      placeholder: "Search donors by name or email...",
    });
    await expect(dialog.getByRole("button", { name: "Change" })).toBeVisible();
  }

  await dialog.getByLabel("Payment method").click();
  await page
    .getByRole("listbox")
    .getByText(options.method, { exact: true })
    .click();
  await dialog.getByLabel("Amount").fill(String(options.amount));
  await dialog.getByRole("button", { name: "Add donation" }).click();
  await expect(dialog).not.toBeVisible();
}

async function deleteDonationRow(page: Page, rowText: string) {
  const row = page.getByRole("row").filter({ hasText: rowText });
  await row.getByRole("button", { name: "View donation" }).click();
  const sheet = modal(page);
  await sheet.getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("Delete this donation?")).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(row).not.toBeVisible();
}

test.describe("portal finance donations", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/portal/finance/donations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Donations", exact: true }),
    ).toBeVisible();
  });

  test("lists the seeded donations, including the anonymous gift", async ({
    page,
  }) => {
    // Pin the row down to the seeded $100 gift: "creates a donation for a
    // donor picked by search" (running concurrently in the other Playwright
    // project) briefly adds its own, newer Jamie Rivera row, so `.first()`
    // on the name alone can land on that transient row instead.
    const donorRow = page
      .getByRole("row")
      .filter({ hasText: "Jamie Rivera" })
      .filter({ hasText: "$100.00" });
    // Newest first, and the list is well past one page now that every spec
    // that records a donation leaves one behind -- so page to the seeded
    // row rather than assume it is still on page one.
    await revealRow(donorRow, pager(page));
    await expect(donorRow.first()).toBeVisible();
    await expect(donorRow.first()).toContainText("Check");

    const anonymousRow = page
      .getByRole("row")
      .filter({ hasText: "Anonymous" })
      .filter({ hasText: "$25.00" });
    await revealRow(anonymousRow, pager(page));
    await expect(anonymousRow.first()).toBeVisible();
    await expect(anonymousRow.first()).toContainText("Cash");
  });

  test("creates an anonymous donation, edits its amount, then deletes it", async ({
    page,
  }) => {
    const amount = uniqueAmount();
    await createDonation(page, { amount, method: "Card" });

    const row = page.getByRole("row").filter({ hasText: formatted(amount) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Anonymous");
    await expect(row).toContainText("Card");

    await row.getByRole("button", { name: "View donation" }).click();
    const sheet = modal(page);
    await expect(sheet.getByText(formatted(amount))).toBeVisible();

    await sheet.getByRole("button", { name: "Edit donation" }).click();
    const updatedAmount = uniqueAmount();
    await sheet.getByLabel("Amount").fill(String(updatedAmount));
    await sheet.getByRole("button", { name: "Save changes" }).click();

    await expect(
      sheet.getByRole("button", { name: "Edit donation" }),
    ).toBeVisible();
    await expect(sheet.getByText(formatted(updatedAmount))).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();

    await deleteDonationRow(page, formatted(updatedAmount));
  });

  test("creates a donation for a donor picked by search", async ({ page }) => {
    const amount = uniqueAmount();
    await createDonation(page, {
      amount,
      method: "Online",
      donorQuery: "Jamie Rivera",
    });

    const row = page.getByRole("row").filter({ hasText: formatted(amount) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Jamie Rivera");
    await expect(row).toContainText("Online");

    await deleteDonationRow(page, formatted(amount));
  });

  test("filters by payment method through URL params", async ({ page }) => {
    await page.goto(
      "/portal/finance/donations?method=check&sort=amount&dir=asc",
    );

    await expect(
      page.getByRole("row").filter({ hasText: "Jamie Rivera" }).first(),
    ).toBeVisible();
    await expect(page.getByText("$25.00")).toHaveCount(0);
  });

  // Issue #567. The donor picker was an input followed by plain buttons: no
  // arrow keys, no Escape, and focus dropped to <body> when the field swapped
  // for the chip. Unit tests cover the ARIA wiring; this is here for the one
  // thing happy-dom cannot model -- how a real focus trap and a real Escape
  // interact inside a dialog.
  test("the donor picker is fully operable from the keyboard", async ({
    page,
  }) => {
    await page.goto("/portal/finance/donations");
    await page.getByRole("button", { name: "New donation" }).click();
    const dialog = modal(page);
    await expect(
      dialog.getByRole("heading", { name: "Add donation" }),
    ).toBeVisible();

    const search = dialog.getByRole("combobox", { name: "Donor", exact: true });
    await search.fill("Jamie");
    await expect(dialog.getByRole("option").first()).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("button", { name: "Change" })).toBeVisible();

    // "Change" swaps the chip back for the field, so focus has somewhere to
    // go in both directions.
    await page.keyboard.press("Enter");
    await expect(search).toBeFocused();

    await search.fill("Jamie");
    await expect(dialog.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(dialog.getByRole("option")).toHaveCount(0);
    // The first Escape belongs to the list; the dialog outlives it.
    //
    // Read off `data-open` rather than `toBeVisible`: Base UI keeps the popup
    // mounted and on screen through its close animation, carrying `data-closed`
    // and `data-ending-style`, so a dialog on its way out is still "visible" and
    // a regression where one Escape closed both would pass. The attribute flips
    // the moment the dialog is asked to close, and nothing takes it back.
    await expect(dialog).toHaveAttribute("data-open");
    await expect(search).toHaveValue("Jamie");

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
