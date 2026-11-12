import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

const refreshMock = mock(() => {});
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: refreshMock,
    prefetch: async () => {},
  }),
}));
mock.module("@/components/ui/toast", () => ({
  toast: {
    success: mock(() => ""),
    error: mock(() => ""),
    close: mock(() => {}),
  },
  Toaster: () => null,
}));

const { MessagePersonDialog } = await import("./message-person-dialog");

type SendInput = { messageId: string; subject: string; body: string };

const DEFAULT_SUBJECT = "Your gear request — Chatter Snow";

// A loaded CI runner can take well over Testing Library's 1s default to commit
// a transition's result; the waits here are bounded, so only the ceiling moves.
const SETTLE = { timeout: 4_000 };

function renderDialog(
  sendMessage: (
    input: SendInput,
  ) => Promise<{ error: string } | { success: true }>,
  props: { disabledReason?: string } = {},
) {
  render(
    <MessagePersonDialog
      recipientName="Priya"
      toEmail="priya.n@example.test"
      defaultSubject={DEFAULT_SUBJECT}
      replyTo="hello@chattersnow.org"
      sendMessage={sendMessage}
      {...props}
    />,
  );
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Contact requester" }));
}

beforeEach(() => {
  refreshMock.mockClear();
});

describe("the composer", () => {
  test("opens with the subject filled in and an empty body", async () => {
    const user = userEvent.setup();
    renderDialog(async () => ({ success: true }));
    await open(user);

    expect(screen.getByRole("textbox", { name: "Subject" })).toHaveValue(
      DEFAULT_SUBJECT,
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });

  test("says where a reply will land, because it will not land here", async () => {
    const user = userEvent.setup();
    renderDialog(async () => ({ success: true }));
    await open(user);

    expect(
      screen.getByText(
        "Replies go to hello@chattersnow.org — this isn't an inbox in the portal.",
      ),
    ).toBeTruthy();
  });

  test("counts both fields against their caps", async () => {
    const user = userEvent.setup();
    renderDialog(async () => ({ success: true }));
    await open(user);

    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Ready Saturday.",
    );
    expect(screen.getByText(/15 \/ 5000 characters/)).toBeTruthy();
    expect(
      screen.getByText(
        new RegExp(`${DEFAULT_SUBJECT.length} / 200 characters`),
      ),
    ).toBeTruthy();
  });

  test("will not send an empty message", async () => {
    const user = userEvent.setup();
    const send = mock(async () => ({ success: true }) as const);
    renderDialog(send);
    await open(user);

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Ready Saturday.",
    );
    expect(
      screen.getByRole("button", { name: "Send message" }),
    ).not.toBeDisabled();
  });
});

describe("the message id", () => {
  test("is one id per composition, so a double-click sends once", async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    // Held open, so the second click lands while the first is still in flight
    // -- the case a slow provider produces for real. Released at the end so
    // the transition finishes with the test rather than after it.
    let release: (result: { success: true }) => void = () => {};
    const inFlight = new Promise<{ success: true }>((resolve) => {
      release = resolve;
    });
    const send = mock((input: SendInput) => {
      seen.push(input.messageId);
      return inFlight;
    });
    renderDialog(send);
    await open(user);
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Ready Saturday.",
    );

    const button = screen.getByRole("button", { name: "Send message" });
    await user.click(button);
    await user.click(button);

    // The dedupe key is the id, so even if both reached the server only one
    // email goes out. What this asserts is that the id does not change
    // underneath a retry, which is what would make the second one a new send.
    expect(new Set(seen).size).toBe(1);
    release({ success: true });
    await inFlight;
  });

  test("is minted afresh after a failure, keeping what was typed", async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    const send = mock(async (input: SendInput) => {
      seen.push(input.messageId);
      return { error: "The message could not be sent. Please try again." };
    });
    renderDialog(send);
    await open(user);
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Ready Saturday.",
    );

    const button = screen.getByRole("button", { name: "Send message" });
    await user.click(button);
    expect(
      await screen.findByText(
        "The message could not be sent. Please try again.",
        {},
        SETTLE,
      ),
    ).toBeTruthy();
    // The text survives the failure: retyping a paragraph because the provider
    // had a bad minute is the worst version of this.
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue(
      "Ready Saturday.",
    );

    // The error and the end of the pending state commit together, so Send is
    // usable the moment the error shows -- no gap where a retry is swallowed
    // (#1716). While pending, the spinner's "Loading" is part of the button's
    // name, so this lookup would also fail if the button were still pending.
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(seen).toHaveLength(2), SETTLE);
    // A new id, because the first one is spent: the delivery ledger already
    // holds a row for it, and retrying under it would answer "already sent"
    // for a message that never left.
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});

describe("when there is nobody to write to", () => {
  test("the trigger is disabled and says why", () => {
    renderDialog(async () => ({ success: true }), {
      disabledReason: "Outbound email is switched off for this organization.",
    });

    expect(
      screen.getByRole("button", { name: "Contact requester" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Outbound email is switched off for this organization."),
    ).toBeTruthy();
  });
});
