// The social content calendar end to end (#1797, epic #1791): a post made on
// /portal/social with nothing related, opened on its own page, then related
// to an event from there -- after which the event's Social content section
// lists it. Leans on supabase/seed.sql's upcoming "Winter Gear Swap" event.
//
// The post is created through the UI and removed through the admin client
// afterwards, so a failure part-way leaves nothing for later specs to trip on.
// Its title is unique per run for the same reason.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";
import { createAdminClient } from "./helpers/admin-client";

const SEEDED_EVENT_ID = "cccccccc-0000-4000-8000-000000000001";
const SEEDED_EVENT = "Winter Gear Swap";

test.describe("portal social posts", () => {
  const title = `E2E standalone post ${Date.now()}`;

  test.afterAll(async () => {
    await createAdminClient()
      .from("content_opportunities")
      .delete()
      .eq("title", title);
  });

  test("a standalone post can be related to an event later", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/portal/social?view=list");

    // Create it with nothing related and no publish date.
    await page.getByRole("button", { name: "New social post" }).click();
    const sheet = modal(page);
    await sheet.getByLabel("Title").fill(title);
    await sheet.getByRole("button", { name: /^(Add|Save)/ }).click();
    await expect(sheet).toHaveCount(0);

    // Unscheduled, so it lands in the tray rather than the dated list.
    const link = page.getByRole("link", { name: title, exact: true });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/portal\/social\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText("Standalone", { exact: true }),
    ).toBeVisible();

    // Relate it to the seeded event from its own page.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = modal(page);
    await edit.getByLabel("Event").click();
    await page
      .getByRole("option", { name: new RegExp(`^${SEEDED_EVENT} · `) })
      .click();
    await edit.getByRole("button", { name: /^Save/ }).click();
    await expect(edit).toHaveCount(0);

    const eventChip = page
      .getByRole("main")
      .getByRole("link", { name: SEEDED_EVENT, exact: true });
    await expect(eventChip).toBeVisible();

    // The chip opens the event's Social content section, which lists it.
    await eventChip.click();
    await expect(page).toHaveURL(
      new RegExp(`/portal/events/${SEEDED_EVENT_ID}\\?tab=social`),
    );
    await expect(
      page.getByRole("main").getByText(title, { exact: true }),
    ).toBeVisible();
  });
});
