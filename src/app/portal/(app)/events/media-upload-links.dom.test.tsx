// #1620: the Media card's upload links -- what the list says about each link,
// that only a live one can be revoked, and that creating one shows its URL and
// QR code once. #1641: the created link can be emailed from the dialog.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UploadLinkRow } from "./media-link-actions";

mock.module("@/components/ui/toast", () => ({
  toast: {
    success: mock(() => ""),
    error: mock(() => ""),
    close: mock(() => {}),
  },
  Toaster: () => null,
}));

let links: UploadLinkRow[] = [];
const createMock = mock<
  (
    eventId: string,
    input: { label: string; expiresAt: string; maxGb: number },
  ) => Promise<{ link: { url: string; qr: string } }>
>(async () => ({
  link: {
    url: "https://portal.example.org/portal/media-upload/abc",
    qr: "data:image/svg+xml;charset=utf-8,%3Csvg%3E",
  },
}));
let emailResult: { ok: true } | { error: string } = { ok: true };
const emailMock = mock<
  (
    eventId: string,
    input: { url: string; to: string },
  ) => Promise<{ ok: true } | { error: string }>
>(async () => emailResult);
const revokeMock = mock<(id: string) => Promise<{ ok: true }>>(async () => ({
  ok: true,
}));

// Mocked whole rather than spread: the real module pulls in the QR encoder,
// which is server-only.
mock.module("./media-link-actions", () => ({
  listEventMediaUploadLinksAction: async () => ({ links }),
  createEventMediaUploadLinkAction: createMock,
  emailEventMediaUploadLinkAction: emailMock,
  revokeEventMediaUploadLinkAction: revokeMock,
}));

const { MediaUploadLinks } = await import("./media-upload-links");

const GB = 1024 * 1024 * 1024;

function link(overrides: Partial<UploadLinkRow>): UploadLinkRow {
  return {
    id: crypto.randomUUID(),
    label: "Sam — photographer",
    expires_at: "2099-01-01T00:00:00Z",
    max_bytes: 50 * GB,
    revoked_at: null,
    created_at: "2026-10-18T19:30:00Z",
    files: 0,
    bytes: 0,
    ...overrides,
  };
}

function renderLinks() {
  return render(
    <MediaUploadLinks
      eventId="e1"
      eventStartsAt="2026-10-18T18:00:00Z"
      eventEndsAt={null}
      timeZone="America/Denver"
    />,
  );
}

beforeEach(() => {
  createMock.mockClear();
  emailMock.mockClear();
  revokeMock.mockClear();
  emailResult = { ok: true };
});

describe("MediaUploadLinks", () => {
  test("lists each link with its status and usage; only a live one can be revoked", async () => {
    links = [
      link({ label: "Sam — photographer", files: 12, bytes: 3 * GB }),
      link({ label: "Ana — video", revoked_at: "2026-10-19T00:00:00Z" }),
    ];
    renderLinks();
    const list = await screen.findByRole("list", { name: "Upload links" });
    const [sam, ana] = within(list).getAllByRole("listitem");

    expect(within(sam).getByText("Active")).toBeTruthy();
    expect(within(sam).getByText(/12 files/)).toBeTruthy();
    expect(
      within(sam).getByRole("button", {
        name: "Revoke link for Sam — photographer",
      }),
    ).toBeTruthy();

    expect(within(ana).getByText("Revoked")).toBeTruthy();
    expect(within(ana).queryByRole("button", { name: /Revoke/ })).toBeNull();
  });

  test("creating a link shows its URL and QR code once", async () => {
    links = [];
    const user = userEvent.setup();
    renderLinks();
    await user.click(
      await screen.findByRole("button", { name: "Create upload link" }),
    );
    await user.type(
      screen.getByLabelText(/Who it.s for/),
      "Sam — photographer",
    );
    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(
      await screen.findByDisplayValue(
        "https://portal.example.org/portal/media-upload/abc",
      ),
    ).toBeTruthy();
    expect(screen.getByAltText("QR code for the upload link")).toBeTruthy();
    expect(screen.getByText(/only time the link is shown/)).toBeTruthy();

    const [eventId, input] = createMock.mock.calls[0];
    expect(eventId).toBe("e1");
    expect(input.label).toBe("Sam — photographer");
    expect(input.maxGb).toBe(50);
    expect(Number.isNaN(Date.parse(input.expiresAt))).toBe(false);
  });

  async function createLink(user: ReturnType<typeof userEvent.setup>) {
    links = [];
    renderLinks();
    await user.click(
      await screen.findByRole("button", { name: "Create upload link" }),
    );
    await user.type(screen.getByLabelText(/Who it.s for/), "Sam");
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await screen.findByDisplayValue(
      "https://portal.example.org/portal/media-upload/abc",
    );
  }

  test("emails the created link to an address", async () => {
    const user = userEvent.setup();
    await createLink(user);
    await user.type(screen.getByLabelText("Email it to"), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "Emailed to sam@example.com.",
    );
    expect(emailMock.mock.calls[0]).toEqual([
      "e1",
      {
        url: "https://portal.example.org/portal/media-upload/abc",
        to: "sam@example.com",
      },
    ]);
  });

  test("a failed send says so and leaves the link to copy", async () => {
    emailResult = { error: "Couldn't email the link to sam@example.com." };
    const user = userEvent.setup();
    await createLink(user);
    await user.type(screen.getByLabelText("Email it to"), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Couldn't email the link to sam@example.com."),
    ).toBeTruthy();
    expect(
      screen.getByDisplayValue(
        "https://portal.example.org/portal/media-upload/abc",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  test("an empty address sends nothing", async () => {
    const user = userEvent.setup();
    await createLink(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Enter the address to send it to."),
    ).toBeTruthy();
    expect(emailMock).not.toHaveBeenCalled();
  });
});
