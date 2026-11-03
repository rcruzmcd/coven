import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/test";
import { clickNavLink } from "./helpers/nav";
import { modal } from "./helpers/dialog";
import {
  completeRegistration,
  continueToReview,
  continueToThisEvent,
  registrationForm,
  sayNoMinors,
  answerRiding,
  openAnonymousRegistration,
  continueWithoutCode,
} from "./helpers/registration";
import { SEEDED_EVENT_IDS } from "../test/seed-fixtures";

const EVENT_NAME = "Winter Gear Swap";
const EVENT_URL = /\/events\/e\/[0-9a-f-]{36}$/;

/** The listing's card for an event: an anchor to the event's own URL (#847). */
function eventLink(page: Page) {
  return page.getByRole("link", { name: EVENT_NAME });
}

/**
 * Opens the event from the listing, presses Register and fills the form it
 * reveals (#1256), returning the form's card for what comes after.
 *
 * The Register button gives way to the form rather than standing above it
 * (#1427), and the trigger and the submit are deliberately different words.
 */
async function registerFromListing(page: Page, name: string, email: string) {
  await eventLink(page).click();
  await expect(
    page.getByRole("heading", { level: 1, name: EVENT_NAME }),
  ).toBeVisible();

  const trigger = page.getByRole("button", { name: "Register", exact: true });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Name")).toBeHidden();

  await trigger.click();
  await expect(trigger).toHaveCount(0);
  // The revealed card takes focus, so a keyboard user carries on where the
  // fields are rather than at the bottom of a page that silently grew. It
  // opens on the email-first step (#1765); skipping it hands focus on to the
  // form's first field.
  await expect(registrationForm(page).getByLabel("Email")).toBeFocused();
  const form = await continueWithoutCode(page);
  await expect(form.getByLabel("Name")).toBeFocused();

  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Email").fill(email);
  // Required since #685, and answered "no" so this helper stays about
  // registering rather than about who is in the party.
  await continueToThisEvent(form);
  await sayNoMinors(form);
  await answerRiding(form);
  await completeRegistration(form);
  return form;
}

test.describe("public events", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Upcoming events" }),
    ).toBeVisible();
  });

  // #1427 replaced the sheet over the listing (#847) with a navigation: an
  // event is always its own page, and a breadcrumb leads back.
  test("opening an event from the listing navigates to its page", async ({
    page,
  }) => {
    await eventLink(page).click();

    await expect(page).toHaveURL(EVENT_URL);
    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
    await expect(modal(page)).toHaveCount(0);

    await page
      .getByRole("navigation", { name: "breadcrumb" })
      .getByRole("link", { name: "Events" })
      .click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(
      page.getByRole("heading", { name: "Upcoming events" }),
    ).toBeVisible();
  });

  test("Cancel puts the registration form away", async ({ page }) => {
    await eventLink(page).click();
    await openAnonymousRegistration(page);
    const form = registrationForm(page);
    await form.getByLabel("Name").fill("Changed My Mind");

    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Register", exact: true }),
    ).toBeFocused();
  });

  test("a shared link renders the event's page", async ({ page }) => {
    await page.goto(`/events/e/${SEEDED_EVENT_IDS.upcoming}`);

    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
  });

  // Events lived at /events/<uuid> until #847's sheet forced them a segment
  // down, and that URL went out in confirmation emails and was pasted into
  // bios, so it has to keep working rather than 404.
  test("the URL events used to live at still reaches them", async ({
    page,
  }) => {
    await page.goto(`/events/${SEEDED_EVENT_IDS.upcoming}`);

    await expect(page).toHaveURL(EVENT_URL);
    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
  });

  // Once broken in production: while events sat at /events/[id], the sheet's
  // intercepting route matched every single segment under /events, so this
  // click rendered a not-found page over the calendar (see event-path.ts).
  // The sheet is gone (#1427), but the click from inside /events is the
  // navigation to keep covering.
  //
  // Through `clickNavLink` rather than the desktop trigger directly, because
  // the mobile project has no such button -- the grouped links are flat inside
  // the off-canvas sheet.
  test("the nav reaches the community calendar from the listing", async ({
    page,
  }) => {
    await clickNavLink(page, "Community Calendar", { group: "Events" });

    await expect(page).toHaveURL(/\/events\/community$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Community Calendar" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toHaveCount(0);
  });

  test("submitting an event registration", async ({ page }) => {
    const form = await registerFromListing(
      page,
      "E2E Test Registrant",
      `e2e-${Date.now()}@example.test`,
    );

    await expect(
      form.getByText("You're registered! We look forward to seeing you there."),
    ).toBeVisible();

    // The riding questions are step 2's profile questions (#1415, #1746), so
    // nothing follows the confirmation but the account offer.
    await expect(form.getByText(/Do you ski or ride/)).toHaveCount(0);
    await expect(
      form.getByRole("button", { name: "Save details" }),
    ).toHaveCount(0);
  });

  // #1413. Three steps at every width, with a summary that goes back to each,
  // and a refusal about a typed field lands on the step that field is on.
  test("registration steps through, reviews, and returns to a refused field", async ({
    page,
  }) => {
    const email = `e2e-steps-${Date.now()}@example.test`;
    const form = await registerFromListing(page, "E2E Steps Registrant", email);
    await expect(form.getByText(/You're registered/)).toBeVisible();

    // The same email again, so the RPC refuses it as already registered.
    await page.reload();
    await openAnonymousRegistration(page);
    const again = registrationForm(page);
    await expect(again.getByLabel(/Phone/)).toHaveCount(0);
    await again.getByLabel("Name").fill("E2E Steps Registrant");
    await again.getByLabel("Email").fill(email);
    await continueToThisEvent(again);
    await sayNoMinors(again);
    await answerRiding(again);
    await again.getByLabel("Notes").fill("Bringing a friend's board");
    await continueToReview(again);

    const review = again.getByRole("group", { name: /Review and agree/ });
    await expect(review.getByText(email)).toBeVisible();
    await expect(review.getByText("Bringing a friend's board")).toBeVisible();
    // The riding answers are summarised with the rest of step 2 (#1415).
    await expect(review.getByText("Snowboard", { exact: true })).toBeVisible();

    await review.getByRole("button", { name: "Edit this event" }).click();
    const thisEvent = again.getByRole("group", { name: /This event/ });
    await expect(thisEvent).toBeFocused();
    await thisEvent.getByLabel("Notes").fill("Bringing my own board");
    await continueToReview(again);
    await expect(review.getByText("Bringing my own board")).toBeVisible();

    await again.getByRole("button", { name: "Complete registration" }).click();
    const aboutYou = again.getByRole("group", { name: /About you/ });
    await expect(
      aboutYou.getByText("This email is already registered for this event."),
    ).toBeVisible();
    await expect(aboutYou.getByLabel("Email")).toHaveValue(email);
  });

  // #1258. The seeded tenant has `constituent_accounts` on (#1175), so a
  // signed-out registrant is offered an account -- and the offer has to carry
  // the registration through sign-up, since a claim made afterwards from a
  // blank form is the retyping this exists to remove.
  test("a signed-out registrant is offered an account that keeps this", async ({
    page,
  }) => {
    const form = await registerFromListing(
      page,
      "E2E Keeping Registrant",
      `e2e-keep-${Date.now()}@example.test`,
    );

    await expect(
      form.getByRole("heading", { name: "Keep this" }),
    ).toBeVisible();
    // Nothing about whether a record matched: the offer reads the same either
    // way, and says only what will happen next.
    await expect(
      form.getByText(/once we've confirmed who you are/),
    ).toBeVisible();

    await form.getByRole("link", { name: "Make an account" }).click();

    await expect(page).toHaveURL(
      /\/my\/sign-in\?next=%2Fmy%2Fregistration%2F[0-9a-f-]{36}$/,
    );
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});

// An event followed from outside the listing lands on the same page (#846).
test.describe("events linked from outside the listing", () => {
  test("a card on the home page navigates to the event's own page", async ({
    page,
  }) => {
    await page.goto("/home");

    await page
      .getByRole("link", { name: new RegExp(EVENT_NAME, "i") })
      .first()
      .click();

    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
    await expect(page).toHaveURL(EVENT_URL);
  });
});
