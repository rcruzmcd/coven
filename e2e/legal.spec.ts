import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";
import {
  continueToReview,
  sayNoMinors,
  answerRiding,
  continueToThisEvent,
  openAnonymousRegistration,
} from "./helpers/registration";
import { SEEDED_EVENT_IDS } from "../test/seed-fixtures";

// The legal notices have to be reachable from anywhere on the site, which is
// why they live in the footer's legal bar rather than the header nav. They sit
// in their own "Legal" landmark, separate from the "Footer" one carrying the
// section links -- a utility link is not a site section.
//
// What this file asserts is the state of a tenant that has adopted nothing,
// which is what the seeded tenant is and what every newly provisioned tenant
// starts as (#859): the privacy policy is served and linked, and the others are
// not. Putting one in force is `legal-publication.spec.ts`, which mutates a
// real row and therefore runs alone in the `mutating` project.

test.describe("legal documents a tenant has not adopted", () => {
  for (const path of ["/terms", "/code-of-conduct", "/accessibility"]) {
    test(`${path} is not served`, async ({ page }) => {
      const response = await page.goto(path);

      // A 200 here would mean text nobody adopted is being published under this
      // organization's name, which is the one failure this gate exists to
      // prevent.
      expect(response?.status()).toBe(404);
    });
  }

  // A permalink is the live document's own route with `?version=` on it
  // (#601), so the adoption gate covers it for free -- and has to, or text
  // nobody adopted would be one query parameter from being published under
  // this organization's name.
  for (const path of [
    "/terms?version=1",
    "/code-of-conduct?version=1",
    "/accessibility?version=1",
  ]) {
    test(`${path} is not served either`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    });
  }

  test("the footer links to none of them", async ({ page }) => {
    await page.goto("/home");

    const legal = page.getByRole("navigation", { name: "Legal" });
    await expect(legal.getByRole("link", { name: "Terms of Use" })).toHaveCount(
      0,
    );
    await expect(
      legal.getByRole("link", { name: "Code of Conduct" }),
    ).toHaveCount(0);
    await expect(
      legal.getByRole("link", { name: "Accessibility" }),
    ).toHaveCount(0);
  });
});

// The one route that must never 404 while the site is collecting personal
// information through its public forms. It has no publication state and no
// visibility slot, and since #858 there is always something to serve: this
// tenant's own document, or the platform's neutral default.
test.describe("the privacy policy", () => {
  test("is served, whether or not the tenant has written its own", async ({
    page,
  }) => {
    const response = await page.goto("/privacy");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeVisible();
    await expect(page.getByText("Last updated:")).toBeVisible();
  });

  // This tenant has published no document of its own, so it has no version
  // history to cite (#601). A version number it never published is a 404
  // rather than a quiet redirect to the current text: an address that serves
  // something other than what it names gives the reader no way to tell.
  test("has no versions to cite until the tenant publishes one", async ({
    page,
  }) => {
    const response = await page.goto("/privacy?version=1");

    expect(response?.status()).toBe(404);
  });

  test("is reachable from the footer of a public page", async ({ page }) => {
    await page.goto("/home");

    await page
      .getByRole("navigation", { name: "Legal" })
      .getByRole("link", { name: "Privacy Policy" })
      .click();

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeVisible();
  });

  // The landmark carries the privacy policy alone here, which is exactly why it
  // is never rendered empty: an empty <nav aria-label="Legal"> is announced by
  // screen readers as a landmark with nothing in it.
  test("the rest of the footer is untouched", async ({ page }) => {
    await page.goto("/home");

    await expect(
      page.getByRole("navigation", { name: "Footer" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Legal" }).getByRole("link"),
    ).toHaveCount(1);
  });
});

/**
 * Asserts one form's notice at the point of collection (#684).
 *
 * The link count is the half of this that matters on the seeded tenant, which
 * has adopted no terms and no code of conduct: the notice may only link
 * documents that are served, and `/privacy` is the only one that always is
 * (#859). A second link here would be a link to a 404.
 */
async function expectPrivacyNotice(scope: Page | Locator, sentence: RegExp) {
  const notice = scope.getByText(sentence);
  await expect(notice).toBeVisible();

  const link = notice.getByRole("link");
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("href", "/privacy");
  await expect(link).toHaveAttribute("target", "_blank");

  // Notice, not consent (#684): the box belongs to things that can be
  // declined, like photo consent (#599) and the waiver (#686).
  await expect(notice.getByRole("checkbox")).toHaveCount(0);
}

// Every public form that collects personal information says, beside its
// fields, what they are for and where the policy is. The policy already
// describes exactly these forms -- `collectionSurface()` builds it from what
// this tenant has turned on -- and before #684 the person filling one in was
// three clicks from ever seeing that.
//
// Which of these forms exists is per tenant, so each case navigates to its own
// form rather than sweeping a list: a tenant without the events module has no
// registration form and owes no registration notice.
test.describe("notice at the point of collection", () => {
  test("the contact form", async ({ page }) => {
    await page.goto("/contact");

    await expectPrivacyNotice(page, /read your message and reply/);
  });

  test("the volunteer application", async ({ page }) => {
    await page.goto("/get-involved/volunteer");
    await page.getByRole("button", { name: "Apply to volunteer" }).click();

    const sheet = page.getByRole("dialog", { name: "Apply to volunteer" });
    await expectPrivacyNotice(sheet, /check your status with the reference/);

    // The application carries a second block the other forms do not (#690):
    // what happens after you apply, in the organization's own words, and what
    // the form does not ask for, in the platform's. The seeded tenant has
    // written the first; a tenant that has not gets only the second, which the
    // component's own test covers.
    await expect(
      sheet.getByRole("heading", { name: "What happens after you apply" }),
    ).toBeVisible();
    await expect(sheet.getByText(/asks for two references/)).toBeVisible();

    const asksFor = sheet.getByText(/It does not ask for your date of birth/);
    await expect(asksFor).toBeVisible();
    // Notice, not consent, and nothing to click: the sentence that says the
    // form does not want an SSN must not itself be a link or a box (#1318).
    await expect(asksFor.getByRole("link")).toHaveCount(0);
    await expect(asksFor.getByRole("checkbox")).toHaveCount(0);
  });

  test("the event registration form", async ({ page }) => {
    await page.goto(`/events/e/${SEEDED_EVENT_IDS.upcoming}`);

    // The form is behind a disclosure (#1256), and the notice belongs with the
    // fields rather than with the trigger.
    await openAnonymousRegistration(page);

    // The notices are on the review step (#1413), reached by answering the
    // two before it.
    await page.getByLabel("Name").fill("Notice Reader");
    await page.getByLabel("Email").fill("notice-reader@example.test");
    await continueToThisEvent(page.locator("form"));
    await sayNoMinors(page.locator("form"));
    await answerRiding(page.locator("form"));
    await continueToReview(page.locator("form"));

    await expectPrivacyNotice(page, /hold your spot/);
  });

  test("the gear request", async ({ page }) => {
    await page.goto("/inventory");

    // Read-only: the cart lives in the browser, and nothing here submits it.
    await page.getByRole("checkbox", { name: "Add to cart" }).first().click();
    await page.getByRole("button", { name: "View cart" }).click();

    const cart = page.getByRole("dialog", { name: "Your cart" });
    // "items" rather than "gear": the noun is this tenant's own word (#896),
    // and the seeded tenant has not renamed it.
    await expectPrivacyNotice(cart, /match you with the items you asked for/);

    // #1367. Beside the notice and unlike it: a real choice, in an unticked
    // box, which is the difference `docs/legal-basis.md` draws. The seeded
    // tenant has adopted no terms of use, so the summary is shown in full and
    // nothing links `/terms` -- a notice may only link a document that is
    // served (#859).
    const asIs = cart.getByRole("checkbox", {
      name: /I understand the items are given as-is/,
    });
    await expect(asIs).toBeVisible();
    await expect(asIs).not.toBeChecked();
    await expect(
      cart.getByText(/We give away items exactly as they reach us/),
    ).toBeVisible();
    await expect(cart.getByRole("link", { name: /Terms of Use/ })).toHaveCount(
      0,
    );
  });

  // The fifth form, and the one #684 missed (#1344). It is reached by its code
  // rather than from the nav and nothing seeds a call, so this stands one up
  // and takes it away again -- safe beside the other projects because a call
  // with no event is surfaced nowhere but its own link (#879).
  test("the artwork submission form", async ({ page }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("event_artwork_calls")
      .insert({
        event_id: null,
        title: "E2E Privacy Notice Call",
        is_open: true,
      })
      .select("id, submission_code")
      .single();
    if (error) throw error;

    try {
      await page.goto(`/artwork/${data.submission_code}`);

      await expectPrivacyNotice(page, /credit you if it's shown/);

      // The call's own rights-and-credit box is a real choice and stays one:
      // the notice sits above it rather than replacing or absorbing it.
      await expect(
        page.getByRole("checkbox", { name: /This is my own work/ }),
      ).toBeVisible();
    } finally {
      await admin.from("event_artwork_calls").delete().eq("id", data.id);
    }
  });
});

// security.txt is rendered for the tenant the host resolves to (#975), so this
// asserts the seeded tenant's own contact rather than a name baked into a
// static file. The two fields that used to be hand-maintained are the ones
// worth checking end to end: RFC 9116 treats a file whose Expires has passed,
// or whose Canonical is not where it was fetched from, as invalid.
test("security.txt is served for this host and has not expired", async ({
  request,
  baseURL,
}) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");

  const body = await response.text();
  expect(body).toContain("Contact: mailto:security@example.org");
  expect(body).not.toMatch(/chatter/i);

  expect(body).toContain(
    `Canonical: ${new URL("/.well-known/security.txt", baseURL).toString()}`,
  );

  // The seeded tenant has adopted no terms, so /terms 404s and the optional
  // Policy field has nowhere honest to point.
  expect(body).not.toContain("Policy:");

  const expires = body.match(/^Expires: (.+)$/m)?.[1];
  expect(
    expires,
    "security.txt is missing its required Expires field",
  ).toBeDefined();
  expect(
    new Date(expires!).getTime(),
    `security.txt expired on ${expires} -- the route computes this field, so an expired one is a bug in securityTxtExpires()`,
  ).toBeGreaterThan(Date.now());
});
