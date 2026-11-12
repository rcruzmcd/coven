// Share to Instagram (#1828): the phone note where files can't be shared, and
// the media handed to the share sheet in post order with the caption copied
// in the same click.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SocialPostExtras } from "@/lib/social-content/post-content-actions";
import { ShareToInstagram } from "./share-to-instagram";

const piece = {
  post_format: "instagram_post" as const,
  content: "Gear swap Saturday!",
  collaborator_handles: ["partner_org"],
};

const extras: SocialPostExtras = {
  tags: [{ handle: "friend" }],
  people: [],
  media: [
    {
      id: "m1",
      kind: "photo",
      original_filename: "first.jpg",
      url: "https://storage.test/first.jpg",
      event_media_id: null,
      missing: false,
    },
    {
      id: "m2",
      kind: "video",
      original_filename: "second.mp4",
      url: "https://storage.test/second.mp4",
      event_media_id: null,
      missing: false,
    },
  ],
};

const nav = navigator as Navigator & Record<string, unknown>;
const saved = {
  share: nav.share,
  canShare: nav.canShare,
  fetch: globalThis.fetch,
};
const share = mock<(data: ShareData) => Promise<void>>(async () => {});
const writeText = mock<(text: string) => Promise<void>>(async () => {});

function installShare() {
  Object.defineProperty(nav, "share", { value: share, configurable: true });
  Object.defineProperty(nav, "canShare", {
    value: (data: ShareData) => (data.files?.length ?? 0) > 0,
    configurable: true,
  });
}

beforeEach(() => {
  share.mockClear();
  writeText.mockClear();
  Object.defineProperty(nav, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  // The second file arrives first; the share must still be in post order.
  globalThis.fetch = (async (url: string) => {
    const name = String(url).split("/").pop()!;
    await new Promise((resolve) =>
      setTimeout(resolve, name === "first.jpg" ? 20 : 0),
    );
    return new Response(
      new Blob([name], {
        type: name.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
      }),
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  Object.defineProperty(nav, "share", {
    value: saved.share,
    configurable: true,
  });
  Object.defineProperty(nav, "canShare", {
    value: saved.canShare,
    configurable: true,
  });
  globalThis.fetch = saved.fetch;
});

describe("ShareToInstagram", () => {
  test("without file sharing, says to use a phone and keeps the copy buttons", () => {
    Object.defineProperty(nav, "canShare", {
      value: undefined,
      configurable: true,
    });
    render(<ShareToInstagram piece={piece} extras={extras} />);
    expect(
      screen.getByText(
        "Open this post on your phone to share it to Instagram.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Share to Instagram/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Copy caption" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy @partner_org" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy @friend" })).toBeTruthy();
  });

  test("shares the media in post order and copies the caption in one click", async () => {
    installShare();
    render(<ShareToInstagram piece={piece} extras={extras} />);
    const button = await screen.findByRole("button", {
      name: /Share to Instagram/,
    });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(writeText).toHaveBeenCalledWith("Gear swap Saturday!");
    expect(share).toHaveBeenCalledTimes(1);
    const [data] = share.mock.calls[0];
    expect(data.files?.map((file) => file.name)).toEqual([
      "first.jpg",
      "second.mp4",
    ]);
    expect(
      await screen.findByText(/caption is on your clipboard/),
    ).toBeInTheDocument();
  });

  test("a failed download is shown, not swallowed", async () => {
    installShare();
    globalThis.fetch = (async () =>
      new Response("no", { status: 403 })) as unknown as typeof fetch;
    render(<ShareToInstagram piece={piece} extras={extras} />);
    expect(
      await screen.findByText(/Couldn't download first.jpg/),
    ).toBeInTheDocument();
  });

  test("backing out of the share sheet is not an error", async () => {
    installShare();
    share.mockImplementationOnce(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    render(<ShareToInstagram piece={piece} extras={extras} />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Share to Instagram/ }),
    );
    expect(screen.queryByText(/Couldn't open the share sheet/)).toBeNull();
  });
});
