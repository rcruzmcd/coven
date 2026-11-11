import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DRIVE_PICKER_MESSAGE } from "@/lib/storage/google-drive";
import { GoogleDriveButton } from "./google-drive-button";

const ENV = [
  "NEXT_PUBLIC_GOOGLE_PICKER_API_KEY",
  "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID",
  "NEXT_PUBLIC_GOOGLE_APP_ID",
  "NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN",
] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

function configure() {
  process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY = "key";
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = "client";
  process.env.NEXT_PUBLIC_GOOGLE_APP_ID = "123";
  process.env.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN = "https://coven.rcmlabs.dev";
}

const realOpen = window.open;
const realFetch = globalThis.fetch;
let popup: { closed: boolean };
let openedUrl: string;

beforeEach(() => {
  for (const key of ENV) delete process.env[key];
  popup = { closed: false };
  openedUrl = "";
  window.open = ((url: string) => {
    openedUrl = url;
    return popup as unknown as Window;
  }) as typeof window.open;
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  window.open = realOpen;
  globalThis.fetch = realFetch;
});

function post(
  data: unknown,
  origin = "https://coven.rcmlabs.dev",
  source: unknown = popup,
) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", { data, origin, source: source as Window }),
    );
  });
}

describe("GoogleDriveButton", () => {
  test("renders nothing when the Picker is not configured", () => {
    const { container } = render(<GoogleDriveButton onFiles={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  test("hands the picked files to onFiles as File objects", async () => {
    configure();
    globalThis.fetch = mock(
      async () => new Response(new Uint8Array([1, 2])),
    ) as unknown as typeof fetch;
    const onFiles = mock<(files: File[]) => void>(() => {});
    render(<GoogleDriveButton accept="image/*" multiple onFiles={onFiles} />);

    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );
    const url = new URL(openedUrl);
    expect(url.origin).toBe("https://coven.rcmlabs.dev");
    expect(url.searchParams.get("origin")).toBe(window.location.origin);
    const nonce = url.searchParams.get("nonce")!;

    // From the wrong origin, or with the wrong nonce: ignored.
    const picked = {
      type: DRIVE_PICKER_MESSAGE,
      nonce,
      status: "picked",
      accessToken: "t",
      docs: [
        { id: "p1", name: "Photo.jpg", mimeType: "image/jpeg", sizeBytes: 2 },
      ],
    };
    post(picked, "https://evil.example");
    post({ ...picked, nonce: "0".repeat(32) });
    post(picked, undefined, window);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    post(picked);
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    const [files] = onFiles.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0].name).toBe("Photo.jpg");
  });

  test("shows a refusal and does not call onFiles when nothing usable came back", async () => {
    configure();
    const onFiles = mock<(files: File[]) => void>(() => {});
    render(<GoogleDriveButton accept="image/*" onFiles={onFiles} />);
    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );
    const nonce = new URL(openedUrl).searchParams.get("nonce")!;

    post({
      type: DRIVE_PICKER_MESSAGE,
      nonce,
      status: "picked",
      accessToken: "t",
      docs: [{ id: "x", name: "Notes.txt", mimeType: "text/plain" }],
    });
    expect(
      await screen.findByText("Notes.txt can't be used here."),
    ).toBeTruthy();
    expect(onFiles).not.toHaveBeenCalled();
  });

  test("asks for pop-ups when the browser blocks the window", async () => {
    configure();
    window.open = (() => null) as typeof window.open;
    render(<GoogleDriveButton onFiles={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );
    expect(
      await screen.findByText(
        "Allow pop-ups for this site to choose from Google Drive.",
      ),
    ).toBeTruthy();
  });
});
