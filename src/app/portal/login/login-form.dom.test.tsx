import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

let params = new URLSearchParams();
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  useSearchParams: () => params,
}));

const signInWithOAuth = mock(async () => ({ error: null }));
mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => ({ error: null }),
      signInWithOAuth,
    },
  }),
}));

const { LoginForm } = await import("./login-form");

const NOTICE = /signed out after a period of inactivity/i;

describe("LoginForm inactivity notice", () => {
  afterEach(() => {
    params = new URLSearchParams();
  });

  test("explains an idle sign-out", () => {
    params = new URLSearchParams("reason=idle");
    render(<LoginForm />);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    // Being timed out is the portal working as intended, so the notice must
    // not be dressed up as an error. The variant only shows up in the class
    // list -- there's no data attribute to assert on.
    const alert = screen.getByText(NOTICE).closest('[data-slot="alert"]');
    expect(alert?.className).toContain("text-card-foreground");
    expect(alert?.className).not.toContain("text-destructive");
  });

  test("stays quiet on a normal visit", () => {
    render(<LoginForm />);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test("still reports a real sign-in error", () => {
    params = new URLSearchParams("error=oauth_failed");
    render(<LoginForm />);

    expect(screen.getByText(/Google sign-in failed/i)).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});

describe("LoginForm Google button (#1249)", () => {
  afterEach(() => {
    params = new URLSearchParams();
    delete process.env.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN;
    signInWithOAuth.mockClear();
  });

  test("goes through the platform host when it is configured", () => {
    process.env.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN = "https://coven.rcmlabs.dev";
    params = new URLSearchParams("error=no_access&next=/portal/events");
    const assign = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );
    render(<LoginForm />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    expect(assign).toHaveBeenCalledWith(
      "/auth/google?next=%2Fportal%2Fevents&prompt=select_account",
    );
    expect(signInWithOAuth).not.toHaveBeenCalled();
    assign.mockRestore();
  });

  test("keeps the Supabase redirect flow when it is not", () => {
    render(<LoginForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
  });
});
