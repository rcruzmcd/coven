// #1765. Email-first registration: the address before the form, a code before
// anything about it, and "Continue without it" leading to today's form as it
// was. Nothing on the step depends on whether the address is known -- the
// action's one answer is shown, and a refused code is one sentence.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SIGN_IN_CODE_REJECTED,
  SIGN_IN_CODE_SENT,
} from "@/lib/constituent/sign-in-code";

const refresh = mock(() => {});
const verifyOtp = mock(
  async (_: { email: string; token: string; type: string }) => ({
    error: null as unknown,
  }),
);
const sendSignInCodeAction = mock(
  async (_email: string): Promise<{ sent: string } | { error: string }> => ({
    sent: SIGN_IN_CODE_SENT,
  }),
);

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { verifyOtp } }),
}));
mock.module("@/app/(public)/my/sign-in/sign-in-code-actions", () => ({
  sendSignInCodeAction,
}));

const { RegistrationEmailStep } = await import("./registration-email-step");
const { setFormCapture } = await import("@/lib/analytics/form-events");

beforeEach(() => {
  refresh.mockClear();
  verifyOtp.mockClear();
  sendSignInCodeAction.mockClear();
});
afterEach(() => setFormCapture(null));

function recorder() {
  const calls: [string, Record<string, string>][] = [];
  setFormCapture((event, properties) => {
    calls.push([event, properties]);
  });
  return calls;
}

function renderStep() {
  render(
    <RegistrationEmailStep eventId="event-1">
      <form aria-label="Anonymous registration">
        <label>
          Phone
          <input name="phone" />
        </label>
      </form>
    </RegistrationEmailStep>,
  );
}

async function askForCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Email/), "Rider@Example.com");
  await user.click(
    screen.getByRole("button", {
      name: "Send me a code to fill in my details",
    }),
  );
  await screen.findByText(SIGN_IN_CODE_SENT);
}

describe("RegistrationEmailStep", () => {
  test("starts with the email and holds the form back", () => {
    renderStep();
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Anonymous registration" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Phone")).not.toBeInTheDocument();
  });

  test("Continue without it shows today's form, and sends nothing", async () => {
    const calls = recorder();
    const user = userEvent.setup();
    renderStep();
    await user.click(
      screen.getByRole("button", { name: "Continue without it" }),
    );
    expect(
      screen.getByRole("form", { name: "Anonymous registration" }),
    ).toBeInTheDocument();
    expect(sendSignInCodeAction).not.toHaveBeenCalled();
    expect(calls).toEqual([
      ["registration_code_skipped", { event_id: "event-1" }],
    ]);
  });

  test("sending shows the action's one answer and no directory data", async () => {
    const calls = recorder();
    const user = userEvent.setup();
    renderStep();
    await askForCode(user);

    expect(sendSignInCodeAction).toHaveBeenCalledWith("Rider@Example.com");
    expect(screen.getByLabelText(/^Code/)).toBeInTheDocument();
    // Still nothing of the form, and no field but the code.
    expect(screen.queryByLabelText("Phone")).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    // The address is never a funnel property.
    expect(calls).toEqual([
      ["registration_code_sent", { event_id: "event-1" }],
    ]);
  });

  test("a valid code verifies in the browser and refreshes the page", async () => {
    const calls = recorder();
    const user = userEvent.setup();
    renderStep();
    await askForCode(user);
    await user.type(screen.getByLabelText(/^Code/), "123 456");
    await user.click(
      screen.getByRole("button", { name: "Fill in my details" }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "rider@example.com",
      token: "123456",
      type: "email",
    });
    expect(calls.at(-1)).toEqual([
      "registration_code_verified",
      { event_id: "event-1" },
    ]);
  });

  test("a refused code is one generic sentence with a resend", async () => {
    verifyOtp.mockImplementationOnce(async () => ({
      error: { code: "otp_expired", message: "Token has expired" },
    }));
    const user = userEvent.setup();
    renderStep();
    await askForCode(user);
    await user.type(screen.getByLabelText(/^Code/), "000000");
    await user.click(
      screen.getByRole("button", { name: "Fill in my details" }),
    );

    expect(await screen.findByText(SIGN_IN_CODE_REJECTED)).toBeInTheDocument();
    // Not Auth's own message, whatever it said.
    expect(screen.queryByText(/Token has expired/)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Send a new code" }));
    await waitFor(() => expect(sendSignInCodeAction).toHaveBeenCalledTimes(2));
  });

  test("a throttled ask shows the throttle, not a code field", async () => {
    sendSignInCodeAction.mockImplementationOnce(async () => ({
      error: "Too many codes asked for.",
    }));
    const user = userEvent.setup();
    renderStep();
    await user.type(screen.getByLabelText(/^Email/), "rider@example.com");
    await user.click(
      screen.getByRole("button", {
        name: "Send me a code to fill in my details",
      }),
    );
    expect(
      await screen.findByText("Too many codes asked for."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Code/)).not.toBeInTheDocument();
  });

  test("a staff preview walks the screens, sends and verifies nothing, then opens the form", async () => {
    const calls = recorder();
    const user = userEvent.setup();
    render(
      <RegistrationEmailStep eventId="event-1" preview>
        <form aria-label="Anonymous registration" />
      </RegistrationEmailStep>,
    );
    await user.type(screen.getByLabelText(/^Email/), "staff@example.com");
    await user.click(
      screen.getByRole("button", {
        name: "Send me a code to fill in my details",
      }),
    );
    expect(await screen.findByText(/^Preview: no code was sent/)).toBeTruthy();
    await user.type(screen.getByLabelText(/^Code/), "123456");
    await user.click(
      screen.getByRole("button", { name: "Fill in my details" }),
    );

    expect(
      await screen.findByRole("form", { name: "Anonymous registration" }),
    ).toBeInTheDocument();
    expect(sendSignInCodeAction).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
