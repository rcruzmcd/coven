import type { Locator, Page } from "@playwright/test";
import { expect } from "./test";

/**
 * The open registration form on an event's page: the card the Register button
 * gives way to, named for the event (#1427). Scoping to it keeps a spec's
 * `getByLabel("Name")` off anything else on the page.
 */
export function registrationForm(page: Page): Locator {
  return page.getByRole("region", { name: /^Register for / });
}

/**
 * Presses Register and skips the email-first step (#1765), leaving the
 * anonymous form as it was before that step existed. The specs that drive it
 * are about the form, not the code, so they all start here.
 */
export async function openAnonymousRegistration(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Register", exact: true }).click();
  return continueWithoutCode(page);
}

/** "Continue without it" on the open registration card (#1765). */
export async function continueWithoutCode(page: Page): Promise<Locator> {
  const form = registrationForm(page);
  await form.getByRole("button", { name: "Continue without it" }).click();
  return form;
}

/**
 * Answers the registration form's minors question with "no" (#685).
 *
 * The question is required on both public registration forms, so every spec
 * that submits one has to answer it. "No" is the answer that leaves the rest
 * of the form exactly as it was before the question existed, which keeps these
 * specs about whatever they were about.
 *
 * Shared rather than copied because it is a Base UI select — a trigger and a
 * listbox option, not a `fill()` — and two spellings of that in two specs is
 * how one of them quietly stops selecting anything.
 */
export async function sayNoMinors(scope: Locator) {
  await scope.getByLabel(/Is anyone in your party under 18\?/).click();
  await scope
    .page()
    .getByRole("option", { name: /everyone is 18 or over/i })
    .click();
}

/**
 * Answers the riding questions, which the seeded tenant asks on step 2 as
 * profile questions (#1746, seeded like Chatter Snow's). The discipline is
 * optional but its level is required once shown, so one discipline and one
 * level is the shortest complete answer. The mountain is left alone.
 */
export async function answerRiding(scope: Locator) {
  const page = scope.page();
  await scope.getByRole("combobox", { name: /Do you ski or ride\?/ }).click();
  await page.getByRole("option", { name: "Snowboard", exact: true }).click();
  await scope
    .getByRole("combobox", {
      name: /How would you describe your snowboarding\?/,
    })
    .click();
  await page.getByRole("option", { name: /^Beginner/ }).click();
}

/**
 * Registration is three steps at every width (#1413): "About you", "This
 * event", then "Review and agree" with the notices, the agreement and the
 * button. These move through them, so a spec says where it is going rather
 * than how many times to press Next.
 */
export async function continueToThisEvent(scope: Locator) {
  await scope.getByRole("button", { name: "Next", exact: true }).click();
  await expect(scope.getByRole("group", { name: /This event/ })).toBeVisible();
}

/** From either earlier step to "Review and agree". */
export async function continueToReview(scope: Locator) {
  const next = scope.getByRole("button", { name: "Next", exact: true });
  const review = scope.getByRole("group", { name: /Review and agree/ });
  for (let press = 0; press < 2 && (await next.isVisible()); press++) {
    await next.click();
  }
  await expect(review).toBeVisible();
}

/** Moves on to the review step if it is not there already, then submits. */
export async function completeRegistration(scope: Locator) {
  await continueToReview(scope);
  await scope.getByRole("button", { name: "Complete registration" }).click();
}
