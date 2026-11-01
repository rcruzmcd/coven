// #1713: the /my sign-in funnel. Which method was used is sent; the email
// never is, and nobody is identified once signed in.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type AuthResult = { data?: { session: unknown }; error: unknown };

const auth = {
  signInWithPassword: mock(async (): Promise<AuthResult> => ({ error: null })),
  signUp: mock(async (): Promise<AuthResult> => ({
    data: { session: null },
    error: null,
  })),
  signInWithOAuth: mock(async (): Promise<AuthResult> => ({ error: null })),
  resetPasswordForEmail: mock(async (): Promise<AuthResult> => ({
    error: null,
  })),
};

mock.module("next/navigation", () => ({
  useRouter: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth }),
}));
mock.module("@/lib/constituent/session-navigation", () => ({
  navigateAfterSessionChange: () => {},
}));

const { SignInForm } = await import("./sign-in-form");
const { setFormCapture } = await import("@/lib/analytics/form-events");

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockClear();
});
afterEach(() => setFormCapture(null));

function recorder() {
  const calls: [string, Record<string, string>][] = [];
  setFormCapture((event, properties) => {
    calls.push([event, properties]);
  });
  return calls;
}

async function submit(button: "Sign in" | "Create account") {
  const user = userEvent.setup();
  render(<SignInForm />);
  if (button === "Create account")
    await user.click(screen.getByRole("button", { name: "Create an account" }));
  await user.type(screen.getByLabelText(/^Email/), "sam@example.com");
  await user.type(screen.getByLabelText(/^Password/), "hunter22");
  await user.click(screen.getByRole("button", { name: button }));
}

const form = { form: "my_sign_in" };

describe("/my sign-in funnel", () => {
  test("a password sign-in: viewed, started, submitted, completed", async () => {
    const calls = recorder();
    await submit("Sign in");
    await waitFor(() => expect(calls).toHaveLength(4));
    expect(calls).toEqual([
      ["form_viewed", form],
      ["form_started", form],
      ["form_submitted", { ...form, method: "password" }],
      ["form_completed", form],
    ]);
  });

  test("a refused sign-in sends a code, not the provider's message", async () => {
    const calls = recorder();
    auth.signInWithPassword.mockImplementationOnce(async () => ({
      error: { message: "Invalid login credentials" },
    }));
    await submit("Sign in");
    await waitFor(() =>
      expect(calls.at(-1)).toEqual([
        "form_failed",
        { ...form, error_code: "SIGN_IN_FAILED" },
      ]),
    );
  });

  test("creating an account is its own method", async () => {
    const calls = recorder();
    await submit("Create account");
    await screen.findByText(/Check your email/);
    expect(calls.slice(-2)).toEqual([
      ["form_submitted", { ...form, method: "sign_up" }],
      ["form_completed", form],
    ]);
  });

  test("Google ends the funnel at the submit", async () => {
    const calls = recorder();
    render(<SignInForm />);
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(calls).toEqual([
      ["form_viewed", form],
      ["form_submitted", { ...form, method: "google" }],
    ]);
  });
});
