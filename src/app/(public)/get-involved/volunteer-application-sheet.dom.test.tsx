// #1713: the volunteer application's funnel. Viewed is the sheet opening, and
// nothing typed into the form travels with any event.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SubmitVolunteerApplicationResult } from "./volunteer-application-actions";

const submitMock = mock(
  async (): Promise<SubmitVolunteerApplicationResult> => ({
    success: true,
    referenceCode: "ABCD1234",
  }),
);

mock.module("./volunteer-application-actions", () => ({
  submitVolunteerApplicationAction: submitMock,
}));

const { VolunteerApplicationSheet } =
  await import("./volunteer-application-sheet");
const { setFormCapture } = await import("@/lib/analytics/form-events");

afterEach(() => setFormCapture(null));

function recorder() {
  const calls: [string, Record<string, string>][] = [];
  setFormCapture((event, properties) => {
    calls.push([event, properties]);
  });
  return calls;
}

async function apply() {
  const user = userEvent.setup();
  render(<VolunteerApplicationSheet screeningNotes={[]} />);
  await user.click(screen.getByRole("button", { name: "Apply to volunteer" }));
  await user.type(await screen.findByLabelText(/^Name/), "Sam Lee");
  await user.type(screen.getByLabelText(/^Email/), "sam@example.com");
  await user.click(
    screen.getAllByRole("button", { name: "Apply to volunteer" }).at(-1)!,
  );
}

const form = { form: "volunteer_application" };

describe("volunteer application funnel", () => {
  test("nothing is viewed until the sheet opens", () => {
    const calls = recorder();
    render(<VolunteerApplicationSheet screeningNotes={[]} />);
    expect(calls).toEqual([]);
  });

  test("opened, started, submitted, completed", async () => {
    const calls = recorder();
    await apply();
    await screen.findByText(/Thanks for applying/);
    expect(calls).toEqual([
      ["form_viewed", form],
      ["form_started", form],
      ["form_submitted", form],
      ["form_completed", form],
    ]);
  });

  test("a refusal sends its code", async () => {
    const calls = recorder();
    submitMock.mockImplementationOnce(async () => ({
      error: "We already have a recent application from this email.",
      code: "ALREADY_SUBMITTED",
    }));
    await apply();
    await waitFor(() =>
      expect(calls.at(-1)).toEqual([
        "form_failed",
        { ...form, error_code: "ALREADY_SUBMITTED" },
      ]),
    );
  });
});
