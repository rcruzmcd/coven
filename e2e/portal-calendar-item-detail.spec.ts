// Issue #467: calendar item details moved from a Sheet into a dedicated
// /portal/calendar/[itemId] page (flat always-visible Card sections), with
// editing kept on a Sheet opened from the page. Leans on the two calendar
// items seeded by supabase/seed.sql:
//
//   - "Winter Gear Swap Promotion" -- Tier 1, active, with categories, a
//     linked program, and three content pieces (#1231).
//   - "Sample Recurring Observance" -- Tier 1 with structured recurrence
//     (series_key + recurrence month/day), which is what unlocks the
//     "Generate next year" header action.
//
// Everything here is read-only against the seed: nothing saves, deletes,
// duplicates, or generates, so the suite can't corrupt later specs.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";

const SEEDED_OPPORTUNITY = "Winter Gear Swap Promotion";
const SEEDED_OBSERVANCE = "Sample Recurring Observance";

const SECTION_TITLES = [
  "Schedule & details",
  "Planning & decision",
  "Sensitive topic",
  "Social content",
];

test.describe("portal calendar item detail page", () => {
  test("navigates from the list view to a flat, section-based detail page", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/portal/calendar");

    await page
      .getByRole("link", { name: `View ${SEEDED_OPPORTUNITY}` })
      .click();

    await expect(page).toHaveURL(/\/portal\/calendar\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_OPPORTUNITY }),
    ).toBeVisible();

    // Every section is a flat, always-visible card -- no tabs anywhere.
    for (const title of SECTION_TITLES) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("tab")).toHaveCount(0);

    // Spot-check seeded values across sections.
    await expect(
      page.getByText("Promote the upcoming gear swap and registration link."),
    ).toBeVisible();
    await expect(
      page.getByText("Directly supports participant access and event turnout."),
    ).toBeVisible();
    await expect(page.getByText("Not flagged")).toBeVisible();

    // The Social content card lists every post planned for the item (#1231), not one
    // brief. The seed gives this one three, at three different statuses.
    for (const piece of [
      "Instagram carousel: how the gear swap works",
      "Email to past participants",
      "Day-of story: the swap in progress",
    ]) {
      await expect(page.getByText(piece, { exact: true })).toBeVisible();
    }

    // The breadcrumb trail returns to the calendar list. Scoped to the
    // breadcrumb nav: the sidebar has its own "Calendar" nav entry.
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Calendar", exact: true })
      .click();
    await expect(page).toHaveURL(/\/portal\/calendar(\?.*)?$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Calendar", exact: true }),
    ).toBeVisible();
  });

  test("keeps editing inline on the detail page", async ({ page }) => {
    await signIn(page);
    await page.goto("/portal/calendar");
    await page
      .getByRole("link", { name: `View ${SEEDED_OPPORTUNITY}` })
      .click();

    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_OPPORTUNITY }),
    ).toBeVisible();

    // Editing happens per card on the detail page now rather than in a sheet,
    // so each card has its own edit trigger and the page stays put.
    const editSchedule = page.getByRole("button", {
      name: "Edit schedule & details",
    });
    await editSchedule.click();

    await expect(page.getByLabel("Title")).toHaveValue(SEEDED_OPPORTUNITY);
    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();

    // Cancel without touching anything -- no dirty-state prompt expected.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(editSchedule).toBeVisible();
  });

  test("offers Generate next year only for structured-recurrence items", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/portal/calendar");
    await page.getByRole("link", { name: `View ${SEEDED_OBSERVANCE}` }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_OBSERVANCE }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate next year" }),
    ).toBeVisible();
  });

  test("hides mutation controls from a view-only role", async ({ page }) => {
    await signIn(page, { email: "volunteer@example.test" });
    await page.goto("/portal/calendar");
    await page
      .getByRole("link", { name: `View ${SEEDED_OPPORTUNITY}` })
      .click();

    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_OPPORTUNITY }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Duplicate" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Delete calendar item" }),
    ).toHaveCount(0);
  });
});
