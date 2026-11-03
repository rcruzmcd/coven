// Issue #686: an organization's participant agreement, recorded against the
// registration with the version that was on screen. Since #1402 it is shown as
// its title and summary beside the box, with the full text in a sheet.
//
// The seeded tenant deliberately has no waiver -- the platform ships no text
// for one, and e2e/legal.spec.ts asserts the state of a tenant that has adopted
// nothing. So this spec adopts one, exercises it, and takes it away again,
// which makes it a `mutating` spec: the rows it writes are shared by the whole
// site, and a waiver left standing would refuse every registration in
// e2e/events.spec.ts.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";
import {
  registrationForm,
  completeRegistration,
  continueToReview,
  sayNoMinors,
  answerRiding,
  continueToThisEvent,
  openAnonymousRegistration,
} from "./helpers/registration";

const PUBLICATION_KEY = "legal_publication.waiver";
const SLOT_KEY = "legal.waiver";

const WAIVER = {
  title: "Participant Waiver",
  last_updated: "September 22, 2026",
  summary: ["Please read this before you register."],
  sections: [
    {
      id: "risks",
      title: "Risks of taking part",
      paragraphs: [
        "Snow sports are dangerous and people are seriously hurt doing them.",
      ],
    },
  ],
};

/**
 * What `publish_site_content()` writes in one transaction: the text, and the
 * version a registration can point at. Written by hand here because publishing
 * through the portal needs a signed-in admin and a pending draft, and what is
 * under test is the public half.
 *
 * The version row is the half that is easy to forget, and forgetting it is not
 * cosmetic: with text and no version the agreement is in force with nothing to
 * cite, and the RPC refuses every registration.
 */
async function adoptWaiver() {
  const admin = createAdminClient();

  const slot = await admin
    .from("site_content")
    .upsert(
      { key: SLOT_KEY, value: WAIVER, published_at: new Date().toISOString() },
      { onConflict: "tenant_id,key" },
    );
  if (slot.error)
    throw new Error(`Could not write the waiver: ${slot.error.message}`);

  const { data: tenant } = await admin
    .from("site_content")
    .select("tenant_id")
    .eq("key", SLOT_KEY)
    .single();

  const version = await admin.from("legal_document_versions").insert({
    tenant_id: tenant!.tenant_id,
    document: "waiver",
    version: 1,
    content: WAIVER,
    effective_at: new Date().toISOString(),
    time_zone: "UTC",
  });
  if (version.error)
    throw new Error(`Could not version the waiver: ${version.error.message}`);

  const publication = await admin
    .from("app_settings")
    .upsert(
      { key: PUBLICATION_KEY, value: true },
      { onConflict: "tenant_id,key" },
    );
  if (publication.error)
    throw new Error(`Could not adopt the waiver: ${publication.error.message}`);
}

async function withdrawWaiver() {
  const admin = createAdminClient();
  await admin.from("app_settings").delete().eq("key", PUBLICATION_KEY);
  await admin.from("legal_document_versions").delete().eq("document", "waiver");
  await admin.from("site_content").delete().eq("key", SLOT_KEY);
}

async function openRegistrationForm(page: import("@playwright/test").Page) {
  await page.goto("/events");
  const card = page.locator('a[href^="/events/e/"]').first();
  await card.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await openAnonymousRegistration(page);
  const registration = registrationForm(page);
  await expect(registration).toBeVisible();
  return registration;
}

test.describe("the participant agreement at registration", () => {
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    await withdrawWaiver();
  });

  test("is summarised, opens in full, and is recorded when accepted", async ({
    page,
  }) => {
    await adoptWaiver();

    const registration = await openRegistrationForm(page);
    await registration.getByLabel("Name").fill("Waiver Tester");
    await registration
      .getByLabel("Email")
      .fill(`waiver-${Date.now()}@example.test`);
    await continueToThisEvent(registration);
    await sayNoMinors(registration);
    await answerRiding(registration);
    // The agreement is on the review step (#1413).
    await continueToReview(registration);

    // The summary where the box is (#1402); the body behind the button.
    await expect(
      registration.getByText("Please read this before you register."),
    ).toBeVisible();
    const body =
      "Snow sports are dangerous and people are seriously hurt doing them.";
    await expect(registration.getByText(body)).toHaveCount(0);

    // In full, one tap away: every word, in a sheet over the registration.
    await registration
      .getByRole("button", { name: "Read the full agreement" })
      .click();
    const fullText = page.getByRole("dialog", { name: "Participant Waiver" });
    await expect(fullText.getByText(body)).toBeVisible();
    await fullText
      .getByRole("button", { name: "Back to registration" })
      .click();
    await expect(fullText).toBeHidden();

    const box = registration.getByRole("checkbox", {
      name: "I have read and accept the Participant Waiver",
    });
    await expect(box).not.toBeChecked();

    // And the exact version is reachable as its own page, which is what the
    // stored pointer resolves to.
    await expect(
      registration.getByRole("link", { name: /open this version/i }),
    ).toHaveAttribute("href", "/waiver?version=1");

    await box.check();
    await completeRegistration(registration);

    await expect(
      registration.getByText(/You're registered|registered/i).first(),
    ).toBeVisible();
  });

  test("refuses a registration that leaves the box unticked", async ({
    page,
  }) => {
    await adoptWaiver();

    const registration = await openRegistrationForm(page);
    await registration.getByLabel("Name").fill("Waiver Refuser");
    await registration
      .getByLabel("Email")
      .fill(`waiver-refused-${Date.now()}@example.test`);
    // Answered, so the box is unambiguously what stops this submission.
    await continueToThisEvent(registration);
    await sayNoMinors(registration);
    await answerRiding(registration);
    await completeRegistration(registration);

    // Still on the form. The browser's own `required` stops it here; the RPC
    // refuses the same submission independently, which the integration tests
    // cover and a browser cannot reach.
    await expect(
      registration.getByRole("checkbox", { name: /I have read and accept/ }),
    ).toBeVisible();
  });

  test("serves /waiver and links it from the footer once adopted", async ({
    page,
  }) => {
    await adoptWaiver();

    const response = await page.goto("/waiver");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Participant Waiver" }),
    ).toBeVisible();

    await expect(
      page
        .getByRole("navigation", { name: "Legal" })
        .getByRole("link", { name: "Participant Waiver" }),
    ).toBeVisible();
  });

  // The platform writes no waiver, so a tenant that has adopted none has
  // nothing: no page, no footer link, and a registration form that asks about
  // no agreement at all. This is the state almost every tenant is in.
  test("is absent entirely for a tenant that has adopted none", async ({
    page,
  }) => {
    const response = await page.goto("/waiver");
    expect(response?.status()).toBe(404);

    await page.goto("/home");
    await expect(
      page
        .getByRole("navigation", { name: "Legal" })
        .getByRole("link", { name: "Participant Waiver" }),
    ).toHaveCount(0);

    const registration = await openRegistrationForm(page);
    await expect(
      registration.getByRole("checkbox", { name: /I have read and accept/ }),
    ).toHaveCount(0);
  });
});
