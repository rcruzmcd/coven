import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";
import { exactLabel } from "./helpers/labels";

// Seeded by supabase/seed.sql: Priya Natarajan (volunteer), Jamie Rivera
// (donor), and Summit Outdoor Co. (sponsor) are always present after a
// `supabase db reset`, so read-only tests lean on them instead of creating
// rows of their own.
test.describe("portal people directory", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("lists seeded people with their roles and contact details", async ({
    page,
  }) => {
    // The directory paginates at 50 and the bulk seed data puts ~85 names
    // before Priya, so land on her via the server-side search param instead
    // of expecting her on page 1.
    await page.goto("/portal/people?search=Priya");
    await expect(
      page.getByRole("heading", { level: 1, name: "People", exact: true }),
    ).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: "Priya Natarajan" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Volunteer");
    await expect(row).toContainText("priya.n@example.test");
  });

  test("opens a person's detail view from the directory", async ({ page }) => {
    // Search first: Priya sits past page 1 of the paginated directory.
    await page.goto("/portal/people?search=Priya");

    // The detail view is a dedicated /portal/people/[id] page since 575e431;
    // the row action is an eye-icon anchor labeled "View <name>", rendered
    // through Base UI's Button with nativeButton={false}, which stamps
    // role="button" on the anchor (same as the Clear control below).
    await page.getByRole("link", { name: "View Priya Natarajan" }).click();

    await expect(page).toHaveURL(/\/portal\/people\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Priya Natarajan" }),
    ).toBeVisible();
    const profile = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Profile" });
    await expect(profile.getByText("priya.n@example.test")).toBeVisible();
    // The role badges sit beside the name rather than inside the Profile card
    // since #1108: they say what the record *is*, and in the card they were a
    // scroll away and vanished while anyone was editing.
    await expect(
      page.getByText("Volunteer", { exact: true }).first(),
    ).toBeVisible();
  });

  test("shows only the history cards for the roles a person holds", async ({
    page,
  }) => {
    // The detail page builds its sections from the aspect registry, keyed on
    // the person's role flags -- which are derived from the records behind them
    // (20260903010000). Before that, every card rendered for everybody, so a
    // person who had never donated still got an empty Donations card.
    //
    // Since #1108 the sections share one tab strip instead of taking a card
    // each, and only the open one is mounted. Both people below hold their
    // asserted role first in registry order, so it is the one that opens.
    const card = (name: string) =>
      page.locator('[data-slot="card"]').filter({ hasText: name });

    await page.goto("/portal/people?search=Priya");
    await page.getByRole("link", { name: "View Priya Natarajan" }).click();
    await expect(card("Volunteer activity")).toBeVisible();
    await expect(card("Donations")).toHaveCount(0);

    await page.goto("/portal/people?search=Jamie");
    await page.getByRole("link", { name: "View Jamie Rivera" }).click();
    await expect(card("Donations")).toBeVisible();
    await expect(card("Volunteer activity")).toHaveCount(0);
  });

  test("reaches a second role's history through the activity tabs", async ({
    page,
  }) => {
    // Priya is a volunteer and staff on seeded events, so her record is the
    // one that proves the strip actually reaches the roles it no longer gives
    // a card of their own.
    await page.goto("/portal/people?search=Priya");
    await page.getByRole("link", { name: "View Priya Natarajan" }).click();

    await page.getByRole("tab", { name: "Staff Member" }).click();

    await expect(
      page.locator('[data-slot="card"]').filter({ hasText: "Assignments" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/[?&]activity=is_staff/);
  });

  test("searches the directory by name", async ({ page }) => {
    await page.goto("/portal/people");

    // Playwright accepts a beforeunload prompt on its own, which is how the
    // New Person dialog arming one on every people page went unnoticed while
    // this test stayed green: a real browser asks "Leave site?" and the search
    // never lands. Record every dialog so a prompt here fails the test.
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.accept();
    });

    // Search sits in the toolbar rather than inside the Filters sheet, so
    // this is one field and one submit with the table still on screen.
    await page.getByRole("searchbox", { name: "Search" }).fill("Priya");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page).toHaveURL(/search=Priya/);
    expect(dialogs).toEqual([]);
    await expect(
      page.getByRole("row").filter({ hasText: "Priya Natarajan" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Jamie Rivera" }),
    ).toHaveCount(0);
  });

  test("narrows the directory by segment", async ({ page }) => {
    // The role facet the Filters sheet used to hold became the segment strip
    // in #957. Both assertions are search-scoped so the directory's
    // pagination can't decide them: at ten rows a page, a name being absent
    // otherwise proves nothing -- it may just be on page 4. Searching a
    // non-sponsor who *does* match the text is the stronger claim anyway:
    // only the segment can be what removes her.
    await page.goto("/portal/people/sponsors?search=Summit");
    await expect(
      page.getByRole("row").filter({ hasText: "Summit Outdoor Co." }),
    ).toBeVisible();

    await page.goto("/portal/people/sponsors?search=Priya");
    await expect(
      page.getByRole("row").filter({ hasText: "Priya Natarajan" }),
    ).toHaveCount(0);
  });

  test("the strip goes back to everybody, and the old ?role= still lands", async ({
    page,
  }) => {
    await page.goto("/portal/people/sponsors");
    await page
      .getByRole("navigation", { name: "People segments" })
      .getByRole("link", { name: "All" })
      .click();
    await expect(page).toHaveURL(/\/portal\/people$/);
    // A non-sponsor row proves the segment is gone. Priya is past page 1 of
    // the paginated directory, so use the alphabetically-first seeded
    // non-sponsor instead.
    await expect(
      page.getByRole("row").filter({ hasText: "Alex Chen" }),
    ).toBeVisible();

    // `?role=` is in bookmarks and in links written before the strip existed,
    // so it aliases to the segment it names rather than being ignored --
    // keeping whatever else was on the URL.
    await page.goto("/portal/people?role=is_sponsor&search=Summit");
    await expect(page).toHaveURL(/\/portal\/people\/sponsors\?search=Summit$/);
  });

  test("adds a person and edits them from their detail view", async ({
    page,
  }) => {
    await page.goto("/portal/people");

    const personName = `E2E Person ${Date.now()}`;
    const personEmail = `e2e.person.${Date.now()}@example.test`;

    await page.getByRole("button", { name: "New Person" }).click();
    const addDialog = modal(page);
    await expect(
      addDialog.getByRole("heading", { name: "Add person" }),
    ).toBeVisible();

    // Exact, so a longer label that contains it cannot match too.
    await addDialog.getByLabel(exactLabel("Name")).fill(personName);
    await addDialog.getByLabel("Email", { exact: true }).fill(personEmail);
    await addDialog.getByLabel("Phone", { exact: true }).fill("555-0142");
    await addDialog
      .locator("label")
      .filter({ hasText: "Volunteer" })
      .getByRole("checkbox")
      .click();
    await addDialog.getByRole("button", { name: "Add person" }).click();

    await expect(addDialog).not.toBeVisible();

    // Reload the directory searched down to the new person: the bare list
    // re-renders under the post-add router.refresh() (and the dialog's close
    // transition), which raced the row interactions below in CI, and the
    // paginated full list gives no guarantee the new row lands on page 1.
    await page.goto(`/portal/people?search=${encodeURIComponent(personName)}`);

    const row = page.getByRole("row").filter({ hasText: personName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Volunteer");
    await expect(row).toContainText(personEmail);

    // The detail view is a dedicated /portal/people/[id] page since 575e431;
    // editing happens inline in its Profile card. The row's eye-icon anchor
    // carries role="button" (Base UI Button, nativeButton={false}).
    await page.getByRole("link", { name: `View ${personName}` }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: personName }),
    ).toBeVisible();
    const profile = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Profile" });
    await expect(profile.getByText(personEmail)).toBeVisible();

    await profile.getByRole("button", { name: "Edit profile" }).click();
    const updatedNotes = `E2E updated notes ${Date.now()}`;
    await profile.getByLabel("Notes").fill(updatedNotes);
    await profile.getByRole("button", { name: "Save changes" }).click();

    await expect(
      profile.getByRole("button", { name: "Edit profile" }),
    ).toBeVisible();
    await expect(profile.getByText(updatedNotes)).toBeVisible();
  });
});
