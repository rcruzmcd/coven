import { test, expect } from "./helpers/test";
import { reloadStayingSignedIn, signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";
import { exactLabel } from "./helpers/labels";

/** A 1x1 PNG, small enough to inline and real enough for the browser to decode. */
const PNG_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("portal inventory donations", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Donations page", async ({ page }) => {
    await page.goto("/portal/inventory/donations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Donations", exact: true }),
    ).toBeVisible();
  });

  test("records a manual donation and edits it from its detail page", async ({
    page,
  }) => {
    await page.goto("/portal/inventory/donations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Donations", exact: true }),
    ).toBeVisible();

    const donorName = `E2E Donor ${Date.now()}`;
    const itemDescription = `E2E Test Jacket ${Date.now()}`;

    await page.getByRole("button", { name: "Add donation" }).click();
    const addSheet = modal(page);
    await expect(
      addSheet.getByRole("heading", { name: "Record a donation" }),
    ).toBeVisible();

    // The donor is picked from People (#1592); this one is new, so it goes
    // through the picker's create-new.
    await addSheet.getByRole("button", { name: "+ Create new person" }).click();
    await addSheet.getByLabel(exactLabel("Name")).fill(donorName);
    await addSheet.getByRole("button", { name: "Create & select" }).click();
    await expect(
      addSheet.getByRole("button", { name: "Change" }),
    ).toBeVisible();
    await addSheet.getByRole("button", { name: "Continue" }).click();

    await addSheet
      .getByLabel(exactLabel("Item description"))
      .fill(itemDescription);
    await addSheet.getByLabel("Item category").click();
    await page
      .getByRole("listbox")
      .getByText("Jacket", { exact: true })
      .click();
    await addSheet.getByLabel("Condition").click();
    await page.getByRole("listbox").getByText("Good", { exact: true }).click();

    // The photo field (#781) uploads on select rather than on save, so the
    // Remove control appearing is the signal that the object actually reached
    // the gear-photos bucket -- the whole client → Server Action → RLS → Storage
    // path, which nothing below the browser exercises end to end.
    // `exact` because getByLabel matches on substring: the field's "use a link
    // instead" box is labelled "Photo link", so a loose "Photo" is ambiguous.
    await addSheet.getByLabel("Photo", { exact: true }).setInputFiles({
      name: "gear.png",
      mimeType: "image/png",
      buffer: PNG_PIXEL,
    });
    await expect(
      addSheet.getByRole("button", { name: "Remove photo" }),
    ).toBeVisible({ timeout: 15_000 });

    await addSheet.getByRole("button", { name: "Save donation" }).click();
    // The sheet stays open on the item codes to label with (#1420).
    await expect(addSheet.getByText("Item codes")).toBeVisible();
    await addSheet.getByRole("button", { name: "Done" }).click();
    await expect(addSheet).not.toBeVisible();

    // Saving triggers a router.refresh() that re-renders the table; a click
    // racing that re-render can land on a node React just replaced and go
    // nowhere. Reload so the list is settled before navigating.
    await reloadStayingSignedIn(page);

    const row = page.getByRole("row").filter({ hasText: donorName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(itemDescription);

    // Since #469 the row's View action is a link to the donation's dedicated
    // detail page, with editing kept on a sheet opened from the page.
    await row.getByRole("link", { name: "View donation" }).click();
    await expect(page).toHaveURL(
      /\/portal\/inventory\/donations\/[0-9a-f-]{36}$/,
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("heading", { level: 1, name: donorName }),
    ).toBeVisible();
    // Since #1898 the details are a compact header and each item is a table
    // row linking to its own page.
    await expect(page.getByLabel("Donation details")).toBeVisible();
    await expect(
      page.getByRole("link", { name: itemDescription }),
    ).toHaveAttribute("href", /\/portal\/inventory\/items\/[0-9a-f-]{36}$/);

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editSheet = modal(page);
    await expect(
      editSheet.getByRole("heading", { name: "Edit donation" }),
    ).toBeVisible();
    const updatedNotes = `E2E updated notes ${Date.now()}`;
    await editSheet.getByLabel("Donation notes").fill(updatedNotes);
    await editSheet.getByRole("button", { name: "Save changes" }).click();

    await expect(editSheet).not.toBeVisible();
    await expect(page.getByText(updatedNotes)).toBeVisible();

    // The breadcrumb trail returns to the list. Scoped to the breadcrumb nav:
    // the sidebar has its own "Donations" nav entry.
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Donations", exact: true })
      .click();
    await expect(page).toHaveURL(/\/portal\/inventory\/donations(\?.*)?$/);
  });
});
