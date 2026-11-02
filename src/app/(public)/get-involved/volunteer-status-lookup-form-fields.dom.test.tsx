// #1713: the status lookup's funnel. Neither the email nor the reference code
// travels with any event.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LookupVolunteerApplicationStatusResult } from "./volunteer-status-lookup-actions";

const lookupMock = mock(
  async (): Promise<LookupVolunteerApplicationStatusResult> => ({
    statusLabel: "Received",
  }),
);

mock.module("./volunteer-status-lookup-actions", () => ({
  lookupVolunteerApplicationStatusAction: lookupMock,
}));

const { VolunteerStatusLookupForm } =
  await import("./volunteer-status-lookup-form-fields");
const { setFormCapture } = await import("@/lib/analytics/form-events");

afterEach(() => setFormCapture(null));

function recorder() {
  const calls: [string, Record<string, string>][] = [];
  setFormCapture((event, properties) => {
    calls.push([event, properties]);
  });
  return calls;
}

async function lookUp() {
  const user = userEvent.setup();
  render(<VolunteerStatusLookupForm />);
  await user.type(screen.getByLabelText(/^Email/), "sam@example.com");
  await user.type(screen.getByLabelText(/^Reference code/), "ABCD1234");
  await user.click(screen.getByRole("button", { name: /status/i }));
}

const form = { form: "volunteer_status_lookup" };

describe("volunteer status lookup funnel", () => {
  test("viewed, started, submitted, completed", async () => {
    const calls = recorder();
    await lookUp();
    await waitFor(() => expect(calls).toHaveLength(4));
    expect(calls).toEqual([
      ["form_viewed", form],
      ["form_started", form],
      ["form_submitted", form],
      ["form_completed", form],
    ]);
  });

  test("no match is a failure with its code", async () => {
    const calls = recorder();
    lookupMock.mockImplementationOnce(async () => ({
      error: "We couldn't find an application.",
      code: "NOT_FOUND",
    }));
    await lookUp();
    await waitFor(() =>
      expect(calls.at(-1)).toEqual([
        "form_failed",
        { ...form, error_code: "NOT_FOUND" },
      ]),
    );
  });
});
