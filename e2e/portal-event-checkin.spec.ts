// Issue #418: a one-click check-in quick action on the portal home page's
// "Happening now" card, and a deep link from the "awaiting check-in today"
// attention item straight to that event's Registrants tab.
//
// Uses a freshly created event_coordinator user per test (rather than the
// shared seeded accounts) for the same reason as
// volunteer-hours-self-log.spec.ts: this file's tests may run fully in
// parallel across Playwright projects, and each needs its own "today"
// event + registrant without racing another run's fixtures.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";
import { markOnboarded } from "./helpers/onboarding";

async function seedCheckinFixture(
  admin: ReturnType<typeof createAdminClient>,
  overrides: {
    eventName?: string;
    registration?: Record<string, unknown>;
  } = {},
) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `e2e-checkin-${suffix}@example.test`;
  const password = "password123";

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (userError || !userData.user) {
    throw userError ?? new Error("createUser returned no user");
  }
  const userId = userData.user.id;
  await markOnboarded(admin, userId);

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("name", "event_coordinator")
    .single();
  if (roleError) throw roleError;

  const { error: userRoleError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: role.id, created_by: userId });
  if (userRoleError) throw userRoleError;

  const { data: person, error: personError } = await admin
    .from("people")
    .insert({
      name: `E2E Checkin Coordinator ${suffix}`,
      email,
      source_type: "individual",
      auth_user_id: userId,
    })
    .select("id")
    .single();
  if (personError) throw personError;

  const eventName = overrides.eventName ?? `E2E Checkin Event ${suffix}`;
  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      name: eventName,
      starts_at: new Date().toISOString(),
      timezone: "UTC",
      status: "published",
      visibility: "private",
      // events.created_by is `not null default auth.uid()`, which resolves
      // to null over the service-role admin client (no user JWT), so it
      // must be set explicitly here.
      created_by: userId,
    })
    .select("id")
    .single();
  if (eventError) throw eventError;

  const { error: volunteerError } = await admin
    .from("event_volunteers")
    .insert({ event_id: event.id, person_id: person.id, created_by: userId });
  if (volunteerError) throw volunteerError;

  const registrantName = `E2E Registrant ${suffix}`;
  const { error: registrationError } = await admin
    .from("event_registrations")
    .insert({
      event_id: event.id,
      name: registrantName,
      email: `e2e-registrant-${suffix}@example.test`,
      party_size: 1,
      ...overrides.registration,
    });
  if (registrationError) throw registrationError;

  return {
    email,
    password,
    eventId: event.id as string,
    eventName,
    registrantName,
    async cleanup() {
      // event_volunteers and event_registrations both reference events
      // with `on delete cascade`, so deleting the event is enough for them.
      await admin.from("events").delete().eq("id", event.id);
      await admin.from("people").delete().eq("id", person.id);
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

test("checks in a registrant from the Happening Now quick action", async ({
  page,
  isMobile,
}) => {
  const admin = createAdminClient();
  const fixture = await seedCheckinFixture(admin);

  try {
    await signIn(page, { email: fixture.email, password: fixture.password });
    await page.goto("/portal/home");

    await expect(page.getByText("Happening now")).toBeVisible();
    // Scope to the card's own title rather than any text in the card
    // (the "Needs your attention" card also mentions this event, via the
    // deep-linked check-in attention item this same issue adds).
    const card = page.locator('[data-slot="card"]').filter({
      has: page.locator('[data-slot="card-title"]', {
        hasText: fixture.eventName,
      }),
    });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Check in", exact: true }).click();

    const sheet = modal(page);
    await expect(
      sheet.getByText(`Check in · ${fixture.eventName}`),
    ).toBeVisible();
    await expect(sheet.getByText(fixture.registrantName)).toBeVisible();

    if (isMobile) {
      // The phone's door list (#1558): one toggle per row, pressed once in.
      // It opens on Not here, which the row leaves the moment it is checked
      // in, so it is found again under In.
      const toggle = sheet.getByRole("button", {
        name: `Check in ${fixture.registrantName}`,
      });
      await toggle.click();
      await expect(toggle).toHaveCount(0);
      await sheet.getByRole("button", { name: "In 1" }).click();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
    } else {
      // Each row's toggle names its registrant (#663).
      await sheet
        .getByRole("button", { name: `Check in ${fixture.registrantName}` })
        .click();
      await expect(
        sheet.getByRole("button", {
          name: `Undo check-in for ${fixture.registrantName}`,
        }),
      ).toBeVisible();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("deep-links from the awaiting check-in attention item to the event's Registrants tab", async ({
  page,
}) => {
  const admin = createAdminClient();
  const fixture = await seedCheckinFixture(admin);

  try {
    await signIn(page, { email: fixture.email, password: fixture.password });
    await page.goto("/portal/home");

    await page
      .getByRole("button", { name: /items? needing attention/ })
      .click();

    // Scoped to the menu just opened. The mobile shell's dashboard also
    // leads with these items as a list (#1079), so the same href is on the
    // page twice there -- and this test is about the bell's deep link.
    const reviewLink = page
      .getByRole("menu")
      .locator(`a[href="/portal/events/${fixture.eventId}?tab=registrants"]`);
    await expect(reviewLink).toBeVisible();
    await reviewLink.click();

    // A generous timeout here: this is the first navigation to the
    // [eventId] detail route in the whole e2e run, so `next dev` needs to
    // compile it on demand before it can respond.
    await expect(page).toHaveURL(
      new RegExp(`/portal/events/${fixture.eventId}\\?tab=registrants`),
      { timeout: 15000 },
    );

    // The event detail is a full page now, not a sheet over the list.
    await expect(page.getByText(fixture.eventName).first()).toBeVisible();
    await expect(page.getByText(fixture.registrantName)).toBeVisible({
      timeout: 10000,
    });
    // Each row's toggle names its registrant (#663).
    await expect(
      page.getByRole("button", { name: `Check in ${fixture.registrantName}` }),
    ).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

// #1558. The phone's check-in sheet fills the screen and never widens the
// document, with the content's real extremes rather than tidy samples.
test.describe("the phone check-in sheet", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("fills the width at 390px and 430px without scrolling sideways", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const fixture = await seedCheckinFixture(admin, {
      eventName:
        "Queer Ride Day x 5 Boroughs Summer 2026 Community Edition Fundraiser",
      registration: {
        name: "María Fernanda Castillo-Wojciechowski de la Fuente-Okonkwo",
        // 40 characters, the column's cap.
        pronouns: "they/them/theirs or she/her, ask me 1st!",
        party_size: 4,
        party_includes_minor: true,
        photo_consent: false,
        photo_consent_at: new Date().toISOString(),
      },
    });

    try {
      await signIn(page, { email: fixture.email, password: fixture.password });
      await page
        .context()
        .addCookies([
          { name: "device_override", value: "mobile", url: page.url() },
        ]);

      for (const width of [390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto("/portal/home");
        await page
          .locator('[data-slot="card"]')
          .filter({
            has: page.locator('[data-slot="card-title"]', {
              hasText: fixture.eventName,
            }),
          })
          .getByRole("button", { name: "Check in", exact: true })
          .click();

        const sheet = modal(page);
        await expect(
          sheet.getByRole("searchbox", { name: "Search registrants" }),
        ).toBeVisible();
        await expect(
          sheet.getByRole("button", { name: "+ Check in walk-in" }),
        ).toBeInViewport();

        const report = await page.evaluate(() => {
          const doc = document.documentElement;
          const popup = document.querySelector<HTMLElement>(
            '[data-slot="sheet-content"]',
          );
          return {
            clientWidth: doc.clientWidth,
            scrollWidth: doc.scrollWidth,
            sheetWidth: popup?.getBoundingClientRect().width ?? 0,
            sheetScrollWidth: popup?.scrollWidth ?? 0,
          };
        });
        expect(report.scrollWidth).toBeLessThanOrEqual(report.clientWidth);
        expect(Math.round(report.sheetWidth)).toBe(report.clientWidth);
        expect(report.sheetScrollWidth).toBeLessThanOrEqual(
          Math.ceil(report.sheetWidth),
        );

        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
      }
    } finally {
      await fixture.cleanup();
    }
  });
});
