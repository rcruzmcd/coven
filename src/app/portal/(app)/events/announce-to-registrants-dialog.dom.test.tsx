// #1317: what the composer says before an announcement is sent, and what it
// sends. The count is the part that cannot be undone, so it is on screen while
// the staffer is still deciding rather than in the confirmation afterwards --
// and the action is handed an audience *name*, never a recipient list.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastSuccessMock = mock<(title: string, options?: unknown) => string>(
  () => "",
);
mock.module("@/components/ui/toast", () => ({
  toast: {
    success: toastSuccessMock,
    error: mock(() => ""),
    close: mock(() => {}),
  },
  Toaster: () => null,
}));

// The dialog imports its Server Action, and through it the `server-only`
// sender. Next's bundler replaces that with an action reference for a client
// component; under bun it is imported for real, so the module has to be pulled
// in after the mock below rather than statically.
const sendEventAnnouncementActionMock = mock<
  (input: {
    batchId: string;
    eventId: string;
    audience: string;
    subject: string;
    body: string;
  }) => Promise<{ error: string } | { success: true; recipients: number }>
>(async () => ({ success: true, recipients: 2 }));
const RegistrantsActions = await import("./registrants-actions");
mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  sendEventAnnouncementAction: sendEventAnnouncementActionMock,
}));

const { AnnounceToRegistrantsDialog } =
  await import("./announce-to-registrants-dialog");
const { ANNOUNCEMENT_ERRORS, MAX_ANNOUNCEMENT_RECIPIENTS } =
  await import("@/lib/event-announcements");

type Registration = {
  id: string;
  name: string;
  email: string | null;
  person_id: string | null;
  checked_in_at: string | null;
};

function registration(overrides: Partial<Registration> & { id: string }) {
  return {
    name: "Jamie Rivera",
    email: `${overrides.id}@example.test`,
    person_id: null,
    checked_in_at: null,
    ...overrides,
  };
}

function renderDialog(registrations: Registration[], disabledReason?: string) {
  render(
    <AnnounceToRegistrantsDialog
      eventId="22222222-2222-4222-8222-222222222222"
      eventName="Mountain Day"
      registrations={registrations}
      replyTo="hello@chattersnow.org"
      disabledReason={disabledReason}
    />,
  );
}

async function open() {
  await userEvent.click(
    screen.getByRole("button", { name: "Message registrants" }),
  );
}

describe("AnnounceToRegistrantsDialog", () => {
  beforeEach(() => {
    sendEventAnnouncementActionMock.mockClear();
    sendEventAnnouncementActionMock.mockResolvedValue({
      success: true,
      recipients: 2,
    });
    toastSuccessMock.mockClear();
  });

  test("states the resolved count before the send, and accounts for the rest", async () => {
    renderDialog([
      registration({ id: "a" }),
      registration({ id: "b" }),
      registration({ id: "c", email: "" }),
    ]);
    await open();

    expect(
      screen.getByText(
        "This will email 2 people; 1 registration has no address.",
      ),
    ).toBeInTheDocument();
  });

  test("the count follows the audience", async () => {
    renderDialog([
      registration({ id: "a", checked_in_at: "2026-09-20T09:00:00.000Z" }),
      registration({ id: "b" }),
      registration({ id: "c" }),
    ]);
    await open();

    await userEvent.selectOptions(
      screen.getByLabelText(/Who it goes to/),
      "checked_in",
    );
    expect(screen.getByText("This will email 1 person.")).toBeInTheDocument();
  });

  test("sends an audience name, never a recipient list", async () => {
    renderDialog([registration({ id: "a" }), registration({ id: "b" })]);
    await open();

    await userEvent.type(
      screen.getByRole("textbox", { name: /^Message/ }),
      "Take Route 28 instead.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send announcement" }),
    );

    expect(sendEventAnnouncementActionMock).toHaveBeenCalledTimes(1);
    const input = sendEventAnnouncementActionMock.mock.calls[0][0];
    expect(input).toMatchObject({
      eventId: "22222222-2222-4222-8222-222222222222",
      audience: "everyone",
      // The event's own name is what a registrant scanning an inbox
      // recognises, so that is what the subject starts as.
      subject: "Mountain Day",
      body: "Take Route 28 instead.",
    });
    expect(Object.keys(input)).not.toContain("recipients");
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Sending to 2 people.",
      expect.anything(),
    );
  });

  test("refuses an audience over the cap, and names it", async () => {
    renderDialog(
      Array.from({ length: MAX_ANNOUNCEMENT_RECIPIENTS + 1 }, (_, index) =>
        registration({ id: `r${index}` }),
      ),
    );
    await open();

    await userEvent.type(
      screen.getByRole("textbox", { name: /^Message/ }),
      "Too many.",
    );

    // The standing note above the field also names the cap, so this asserts on
    // the refusal itself -- and on the cap being in it, which is the part that
    // tells the organizer what to do next.
    const refusal = screen.getByText(ANNOUNCEMENT_ERRORS.TOO_MANY);
    expect(refusal).toBeInTheDocument();
    expect(refusal.textContent).toContain(String(MAX_ANNOUNCEMENT_RECIPIENTS));
    expect(
      screen.getByRole("button", { name: "Send announcement" }),
    ).toBeDisabled();
  });

  test("the organization's switch being off disables the trigger and says why", async () => {
    renderDialog(
      [registration({ id: "a" })],
      "Outbound email is switched off for this organization.",
    );

    expect(
      screen.getByRole("button", { name: "Message registrants" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Outbound email is switched off for this organization."),
    ).toBeInTheDocument();
  });
});

describe("AnnounceToRegistrantsDialog as Send photos (#1555)", () => {
  const URL = "https://www.example.test/events/e/22222222/photos";

  beforeEach(() => {
    sendEventAnnouncementActionMock.mockClear();
  });

  test("starts from everyone registered, the tenant's words and the gallery link", async () => {
    render(
      <AnnounceToRegistrantsDialog
        eventId="22222222-2222-4222-8222-222222222222"
        eventName="Mountain Day"
        registrations={[
          registration({ id: "in", checked_in_at: "2026-10-01T15:00:00Z" }),
          registration({ id: "out" }),
        ]}
        replyTo={null}
        photos={{ url: URL, body: ["Thanks for coming!"] }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Send photos" }));

    expect(screen.getByLabelText(/Who it goes to/)).toHaveValue("everyone");
    expect(screen.getByText("This will email 2 people.")).toBeVisible();
    expect(screen.getByLabelText(/Subject/)).toHaveValue(
      "Photos from Mountain Day",
    );
    expect(screen.getByLabelText(/Message/)).toHaveValue(
      `Thanks for coming!\n\n${URL}`,
    );

    await userEvent.click(screen.getByRole("button", { name: "Send photos" }));
    expect(sendEventAnnouncementActionMock).toHaveBeenCalledTimes(1);
    expect(sendEventAnnouncementActionMock.mock.calls[0][0]).toMatchObject({
      audience: "everyone",
      subject: "Photos from Mountain Day",
      body: `Thanks for coming!\n\n${URL}`,
    });
  });
});
