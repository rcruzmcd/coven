import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClaimActionResult } from "./claim-actions";

const submitClaimActionMock = mock(async (): Promise<ClaimActionResult> => ({
  submitted: true,
}));

// Replaced whole rather than spread over the real module: claim-actions.ts is
// "use server" and reaches `server-only` through the Supabase client, which
// throws the moment a client module imports it. The type import above is
// erased, so it costs nothing at runtime.
mock.module("./claim-actions", () => ({
  submitClaimAction: submitClaimActionMock,
}));

const { ClaimForm, CLAIM_OUTCOMES } = await import("./claim-form");
const { setFormCapture } = await import("@/lib/analytics/form-events");

afterEach(() => setFormCapture(null));

function recorder() {
  const calls: [string, Record<string, string>][] = [];
  setFormCapture((event, properties) => {
    calls.push([event, properties]);
  });
  return calls;
}

const VERIFIED = "rider@example.com";

/**
 * The confirmation, read the way the component builds it rather than by
 * matching a sentence -- the point of these tests is that the sentence is not
 * assembled at render time, so a matcher that looked for known words would
 * pass on exactly the thing they exist to catch.
 */
function alertDescription() {
  return document.querySelector('[data-slot="alert-description"]')?.textContent;
}

async function submitAs(name: string, extras: Record<string, string> = {}) {
  const user = userEvent.setup();
  render(<ClaimForm defaultEmail={VERIFIED} />);

  await user.type(screen.getByLabelText(/^Your name/), name);
  for (const [label, value] of Object.entries(extras)) {
    await user.type(screen.getByLabelText(label), value);
  }
  await user.click(screen.getByRole("button", { name: "Send request" }));
  await waitFor(() => expect(alertDescription()).toBeTruthy());
}

describe("ClaimForm", () => {
  test("confirms with the shared sentence and nothing else", async () => {
    // The test the issue asked for (#1182): the confirmation is one constant,
    // not a sentence composed from what came back. Anything that varied it by
    // whether a candidate was found would answer "is this person a donor
    // here?" to anyone willing to make an account and type a name.
    await submitAs("Dana Okafor");
    expect(alertDescription()).toBe(CLAIM_OUTCOMES);
  });

  test("confirms identically for a different claimant", async () => {
    await submitAs("Someone Else", {
      "Another email you may have used": "old@example.com",
      Phone: "555 0100",
    });
    expect(alertDescription()).toBe(CLAIM_OUTCOMES);
  });

  test("names both outcomes before anything is sent", () => {
    render(<ClaimForm defaultEmail={VERIFIED} />);
    expect(screen.getByText(CLAIM_OUTCOMES)).toBeTruthy();
  });

  test("shows the verified address as text, never as an input value", () => {
    // Prefilling it told the claimant that typing an address is what matches
    // them. person_claim_candidates() reads the address from auth.users and
    // never looks at stated_email, so the input was a promise the query does
    // not keep.
    render(<ClaimForm defaultEmail={VERIFIED} />);

    expect(screen.getByText(`Signed in as ${VERIFIED}`)).toBeTruthy();
    for (const input of document.querySelectorAll("input")) {
      expect(input.value).toBe("");
    }
  });

  test("groups the fields by whether the matcher reads them", () => {
    render(<ClaimForm defaultEmail={VERIFIED} />);

    const matched = within(
      screen.getByRole("group", { name: "What we match on" }),
    );
    expect(matched.getByLabelText(/^Your name/)).toBeTruthy();
    expect(matched.getByLabelText("Instagram")).toBeTruthy();

    const reviewer = within(
      screen.getByRole("group", { name: "For the person reviewing" }),
    );
    expect(
      reviewer.getByLabelText("Another email you may have used"),
    ).toBeTruthy();
    expect(reviewer.getByLabelText("Phone")).toBeTruthy();
    expect(
      reviewer.getByLabelText("Anything that would help us find you"),
    ).toBeTruthy();
  });

  test("swaps the button label while the request is in flight", async () => {
    // The one thing on this screen that is allowed to change what it says, and
    // it changes on the request being open rather than on what came back.
    let release: (result: ClaimActionResult) => void = () => {};
    submitClaimActionMock.mockImplementationOnce(
      () => new Promise<ClaimActionResult>((resolve) => (release = resolve)),
    );

    const user = userEvent.setup();
    render(<ClaimForm defaultEmail={VERIFIED} />);
    await user.type(screen.getByLabelText(/^Your name/), "Dana Okafor");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    // A regexp because the Spinner carries aria-label="Loading", so the
    // button's accessible name is "Loading Sending..." -- the same shape every
    // other pending button in the codebase has.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Sending\.\.\./ }),
      ).toBeTruthy(),
    );

    release({ submitted: true });
    await waitFor(() => expect(alertDescription()).toBe(CLAIM_OUTCOMES));
  });

  test("marks the name required through the label prop, not the label text", () => {
    // #1070: the marker is aria-hidden because the control carries `required`,
    // so a literal "*" typed into the label is announced a second time.
    render(<ClaimForm defaultEmail={VERIFIED} />);

    const name = screen.getByLabelText(/^Your name/) as HTMLInputElement;
    expect(name.required).toBe(true);
    expect(screen.queryByText("Your name *")).toBeNull();
  });

  // #1713: the same events whatever the matcher found, so the funnel answers
  // nothing the confirmation does not.
  test("sends the form funnel and nothing about the claimant", async () => {
    const calls = recorder();
    await submitAs("Dana Okafor", { Phone: "555 0100" });

    const form = { form: "my_claim" };
    expect(calls).toEqual([
      ["form_viewed", form],
      ["form_started", form],
      ["form_submitted", form],
      ["form_completed", form],
    ]);
  });

  test("a refusal sends its code", async () => {
    const calls = recorder();
    submitClaimActionMock.mockImplementationOnce(async () => ({
      error: "Too many requests just now. Try again in a little while.",
      code: "RATE_LIMITED",
    }));
    await submitAs("Dana Okafor");

    expect(calls.at(-1)).toEqual([
      "form_failed",
      { form: "my_claim", error_code: "RATE_LIMITED" },
    ]);
  });
});
