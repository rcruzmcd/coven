import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  act,
  render,
  screen,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { TabRefreshProvider, useTabRefresh } from "@/hooks/use-tab-refresh";
import * as MediaActions from "./media-actions";
import type { EventMediaRow, EventMediaState } from "./media-actions";

let state: EventMediaState;
const deleteMock = mock(async () => ({ ok: true as const }));
const setPublicMock = mock(async () => ({ ok: true as const, changed: 1 }));
const setFlyerMock = mock(async () => ({ ok: true as const }));

mock.module("./media-actions", () => ({
  ...MediaActions,
  getEventMediaAction: async () => ({ data: state }),
  deleteEventMediaAction: deleteMock,
  setEventMediaPublicAction: setPublicMock,
  setEventFlyerAction: setFlyerMock,
}));

const { MediaTab } = await import("./media-tab");

function item(overrides: Partial<EventMediaRow>): EventMediaRow {
  return {
    id: crypto.randomUUID(),
    kind: "photo",
    original_filename: "IMG_0001.jpg",
    content_type: "image/jpeg",
    size_bytes: 400 * 1024,
    uploaded_at: "2026-10-18T19:30:00Z",
    uploader_name: "Sam Lee",
    url: "https://storage.test/sign/a.jpg?token=t",
    display_url: null,
    download_url: "https://storage.test/sign/a.jpg?token=t&download=a.jpg",
    expires_at: null,
    is_public: true,
    ...overrides,
  };
}

function stateWith(overrides: Partial<EventMediaState>): EventMediaState {
  return {
    enabled: true,
    canUpload: false,
    canDelete: false,
    publicGalleryEnabled: true,
    publicGalleryUrl: null,
    eventBytes: 0,
    tenantBytes: 0,
    photoObjections: 0,
    retentionDays: null,
    eventExpiresAt: null,
    flyerMediaId: null,
    items: [],
    ...overrides,
  };
}

let notifyMedia: () => void = () => {};

function RefreshHandle() {
  const { notify } = useTabRefresh<"media">();
  useEffect(() => {
    notifyMedia = () => notify("media");
  }, [notify]);
  return null;
}

// A fresh event each time unless named: the tab holds what it showed per event.
function renderTab(eventId: string = crypto.randomUUID()) {
  return render(
    <TabRefreshProvider>
      <RefreshHandle />
      <MediaTab
        eventId={eventId}
        eventName="Winter Social"
        eventStartsAt="2026-10-18T18:00:00Z"
        eventEndsAt={null}
        timeZone="America/Denver"
      />
    </TabRefreshProvider>,
  );
}

function thumbSrc(filename: string) {
  return screen
    .getByRole("button", { name: `Open ${filename}` })
    .querySelector("img")!
    .getAttribute("src");
}

beforeEach(() => {
  deleteMock.mockClear();
  setPublicMock.mockClear();
  setFlyerMock.mockClear();
});

describe("MediaTab", () => {
  test("flyer: events:manage picks a photo, which then shows as the flyer (#1827)", async () => {
    const poster = item({ original_filename: "poster.jpg" });
    state = stateWith({
      canDelete: true,
      items: [poster, item({ original_filename: "crowd.jpg" })],
    });
    const eventId = crypto.randomUUID();
    const view = renderTab(eventId);
    expect(await screen.findByText(/No flyer yet/)).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Use poster.jpg as the flyer" }),
    );
    expect(setFlyerMock).toHaveBeenCalledWith(eventId, poster.id);

    state = { ...state, flyerMediaId: poster.id };
    view.unmount();
    renderTab();
    expect(
      await screen.findByRole("img", { name: "Flyer: poster.jpg" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Use poster.jpg as the flyer" }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove as flyer" }),
    );
    expect(setFlyerMock).toHaveBeenLastCalledWith(expect.any(String), null);
  });

  test("flyer: a reader who can't manage sees no flyer controls", async () => {
    state = stateWith({ items: [item({ original_filename: "a.jpg" })] });
    renderTab();
    await screen.findByRole("heading", { name: /Photos/ });
    expect(screen.queryByRole("heading", { name: "Flyer" })).toBeNull();
    expect(screen.queryByRole("button", { name: /as the flyer/ })).toBeNull();
  });

  test("empty: says so, with no gallery or notice", async () => {
    state = stateWith({});
    renderTab();
    expect(await screen.findByText("No photos or videos yet")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Photos/ })).toBeNull();
    expect(screen.queryByText(/objected to being photographed/)).toBeNull();
    expect(screen.getByText(/0 MB for this event/)).toBeTruthy();
  });

  test("photos render as a grid of openable thumbnails", async () => {
    state = stateWith({
      items: [
        item({ original_filename: "IMG_0001.jpg" }),
        item({ original_filename: "IMG_0002.jpg" }),
        item({
          original_filename: "broken.jpg",
          url: null,
          download_url: null,
        }),
      ],
    });
    renderTab();
    const section = (
      await screen.findByRole("heading", { name: /Photos/ })
    ).closest("section")!;
    expect(within(section).getByText("(3)")).toBeTruthy();
    expect(
      within(section).getByRole("button", { name: "Open IMG_0001.jpg" }),
    ).toBeTruthy();
    expect(
      within(section).getByRole("button", { name: "Open IMG_0002.jpg" }),
    ).toBeTruthy();
    // An object that failed to sign keeps its tile but cannot be opened.
    expect(within(section).getByText("Couldn't load")).toBeTruthy();
    expect(
      within(section).queryByRole("button", { name: "Open broken.jpg" }),
    ).toBeNull();
    expect(
      within(section).getByRole("button", { name: "Download all" }),
    ).toBeTruthy();
    // No delete without events:manage.
    expect(
      within(section).queryByRole("button", { name: /^Delete / }),
    ).toBeNull();
  });

  test("ticking photos turns Download all into Download selected", async () => {
    state = stateWith({
      items: [
        item({ original_filename: "a.jpg" }),
        item({ original_filename: "b.jpg" }),
      ],
    });
    renderTab();
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select a.jpg" }),
    );
    expect(
      screen.getByRole("button", { name: "Download selected (1)" }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(
      screen.getByRole("button", { name: "Download selected (2)" }),
    ).toBeTruthy();
  });

  test("videos list size, uploader and a labelled upload time, with play and download", async () => {
    state = stateWith({
      items: [
        item({
          kind: "video",
          original_filename: "run.mov",
          content_type: "video/quicktime",
          size_bytes: 1.5 * 1024 * 1024 * 1024,
          uploader_name: "Ada Park",
          download_url:
            "https://storage.test/sign/v.mov?token=t&download=run.mov",
        }),
      ],
    });
    renderTab();
    const section = (
      await screen.findByRole("heading", { name: /Videos/ })
    ).closest("section")!;
    const row = within(section).getByText("run.mov").closest("li")!;
    expect(within(row).getByText(/1\.5 GB/)).toBeTruthy();
    expect(within(row).getByText(/Ada Park/)).toBeTruthy();
    const time = row.querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-10-18T19:30:00Z");
    // Names its zone (#1057).
    expect(time.textContent).toMatch(/[A-Z]{2,5}|GMT/);
    expect(
      within(row).getByRole("link", { name: "Download run.mov" }),
    ).toHaveProperty(
      "href",
      "https://storage.test/sign/v.mov?token=t&download=run.mov",
    );
    expect(
      within(row).getByRole("button", { name: "Play run.mov" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Photos/ })).toBeNull();
  });

  test("the objection notice appears exactly when someone objected", async () => {
    state = stateWith({ photoObjections: 2, items: [item({})] });
    const { unmount } = renderTab();
    expect(
      await screen.findByText(
        /2 people at this event objected to being photographed/,
      ),
    ).toBeTruthy();
    unmount();

    state = stateWith({ photoObjections: 1 });
    const second = renderTab();
    expect(
      await screen.findByText(
        /1 person at this event objected to being photographed/,
      ),
    ).toBeTruthy();
    second.unmount();

    state = stateWith({ photoObjections: 0, items: [item({})] });
    renderTab();
    await screen.findByRole("heading", { name: /Photos/ });
    expect(screen.queryByText(/objected to being photographed/)).toBeNull();
  });

  test("shows the event's and the organization's storage", async () => {
    state = stateWith({
      eventBytes: 300 * 1024 * 1024,
      tenantBytes: 12 * 1024 * 1024 * 1024,
      items: [item({})],
    });
    renderTab();
    expect(
      await screen.findByText(
        /300 MB for this event, 12 GB for all of this organization/,
      ),
    ).toBeTruthy();
  });

  test("says media is kept indefinitely when no period is set", async () => {
    state = stateWith({ items: [item({})] });
    renderTab();
    expect(await screen.findByText(/Kept indefinitely\./)).toBeTruthy();
    expect(screen.queryByText(/will be deleted soon/)).toBeNull();
  });

  test("shows the retention period and the event's date", async () => {
    state = stateWith({
      retentionDays: 365,
      eventExpiresAt: "2027-10-18T19:30:00Z",
      items: [item({ expires_at: "2027-10-18T19:30:00Z" })],
    });
    renderTab();
    expect(
      await screen.findByText(/Kept 1 year after the event, until/),
    ).toBeTruthy();
    expect(screen.queryByText(/will be deleted soon/)).toBeNull();
  });

  test("lists only what expires within 14 days, with downloads", async () => {
    const day = 24 * 60 * 60 * 1000;
    const soon = new Date(Date.now() + 3 * day).toISOString();
    const later = new Date(Date.now() + 30 * day).toISOString();
    state = stateWith({
      retentionDays: 90,
      items: [
        item({ original_filename: "soon.jpg", expires_at: soon }),
        item({ original_filename: "later.jpg", expires_at: later }),
        item({
          kind: "video",
          original_filename: "soon.mov",
          content_type: "video/quicktime",
          expires_at: soon,
        }),
      ],
    });
    renderTab();
    const notice = (
      await screen.findByText("2 photos and videos will be deleted soon")
    ).closest('[role="alert"]') as HTMLElement;
    expect(within(notice).getByText("soon.jpg")).toBeTruthy();
    expect(within(notice).getByText("soon.mov")).toBeTruthy();
    expect(within(notice).queryByText("later.jpg")).toBeNull();
    expect(
      within(notice).getByRole("link", { name: "Download soon.jpg" }),
    ).toBeTruthy();
  });

  test("a reload that adds a photo leaves the ones on screen alone (#1653)", async () => {
    const a = item({
      original_filename: "a.jpg",
      url: "https://storage.test/sign/a.jpg?token=first",
    });
    state = stateWith({ items: [a] });
    renderTab();
    await screen.findByRole("button", { name: "Open a.jpg" });
    expect(thumbSrc("a.jpg")).toBe(
      "https://storage.test/sign/a.jpg?token=first",
    );

    // Every load signs afresh, so A comes back with a new token.
    state = stateWith({
      items: [
        item({
          original_filename: "b.jpg",
          url: "https://storage.test/sign/b.jpg?token=second",
        }),
        { ...a, url: "https://storage.test/sign/a.jpg?token=second" },
      ],
    });
    act(() => notifyMedia());
    await screen.findByRole("button", { name: "Open b.jpg" });
    expect(thumbSrc("a.jpg")).toBe(
      "https://storage.test/sign/a.jpg?token=first",
    );
    expect(thumbSrc("b.jpg")).toBe(
      "https://storage.test/sign/b.jpg?token=second",
    );
  });

  test("coming back to the tab shows the URLs it already held", async () => {
    const eventId = crypto.randomUUID();
    const a = item({
      original_filename: "a.jpg",
      url: "https://storage.test/sign/a.jpg?token=first",
    });
    state = stateWith({ items: [a] });
    const first = renderTab(eventId);
    await screen.findByRole("button", { name: "Open a.jpg" });
    first.unmount();

    state = stateWith({
      items: [{ ...a, url: "https://storage.test/sign/a.jpg?token=second" }],
    });
    renderTab(eventId);
    // Straight away, from what was held, and still after the reload lands.
    expect(thumbSrc("a.jpg")).toBe(
      "https://storage.test/sign/a.jpg?token=first",
    );
    await act(async () => {});
    expect(thumbSrc("a.jpg")).toBe(
      "https://storage.test/sign/a.jpg?token=first",
    );
  });

  test("the refresh button drops a deleted photo", async () => {
    state = stateWith({
      items: [
        item({ original_filename: "a.jpg" }),
        item({ original_filename: "b.jpg" }),
      ],
    });
    renderTab();
    await screen.findByRole("button", { name: "Open b.jpg" });
    state = stateWith({ items: [state.items[0]] });
    act(() => notifyMedia());
    await waitForElementToBeRemoved(() =>
      screen.queryByRole("button", { name: "Open b.jpg" }),
    );
    expect(screen.getByRole("button", { name: "Open a.jpg" })).toBeTruthy();
  });

  test("delete asks first, then deletes", async () => {
    const photo = item({ original_filename: "a.jpg" });
    state = stateWith({ canDelete: true, items: [photo] });
    renderTab();
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete a.jpg" }),
    );
    expect(deleteMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete a.jpg?")).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    expect(deleteMock).toHaveBeenCalledWith(photo.id);
  });
  test("each item says whether it is public, with no switch below events:manage", async () => {
    state = stateWith({
      items: [
        item({ original_filename: "a.jpg" }),
        item({
          kind: "video",
          original_filename: "run.mov",
          content_type: "video/quicktime",
          is_public: false,
        }),
      ],
    });
    renderTab();
    const photo = (await screen.findByText("a.jpg")).closest("li")!;
    expect(within(photo).getByText("Public")).toBeTruthy();
    const video = screen.getByText("run.mov").closest("li")!;
    expect(within(video).getByText("Not public")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Hide |^Make / })).toBeNull();
  });

  test("events:manage hides a photo and makes a video public", async () => {
    const photo = item({ original_filename: "a.jpg" });
    const video = item({
      kind: "video",
      original_filename: "run.mov",
      content_type: "video/quicktime",
      is_public: false,
    });
    state = stateWith({ canDelete: true, items: [photo, video] });
    renderTab("e1");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Hide a.jpg from the public site",
      }),
    );
    expect(setPublicMock).toHaveBeenCalledWith("e1", [photo.id], false);
    await userEvent.click(
      await screen.findByRole("button", { name: "Make run.mov public" }),
    );
    expect(setPublicMock).toHaveBeenCalledWith("e1", [video.id], true);
  });

  test("ticked photos are hidden together", async () => {
    const a = item({ original_filename: "a.jpg" });
    const b = item({ original_filename: "b.jpg" });
    state = stateWith({ canDelete: true, items: [a, b] });
    renderTab("e1");
    expect(screen.queryByRole("button", { name: /Hide selected/ })).toBeNull();
    await userEvent.click(
      await screen.findByRole("button", { name: "Select all" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Hide selected/ }),
    );
    expect(setPublicMock).toHaveBeenCalledWith("e1", [a.id, b.id], false);
  });

  test("offers the public gallery's link only when there is one", async () => {
    state = stateWith({
      publicGalleryUrl: "https://example.org/events/e/e1/photos",
      items: [item({})],
    });
    const { unmount } = renderTab();
    expect(
      await screen.findByRole("button", { name: /Copy link/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /View gallery/ }).getAttribute("href"),
    ).toBe("https://example.org/events/e/e1/photos");
    unmount();

    state = stateWith({ items: [item({})] });
    renderTab();
    await screen.findByRole("heading", { name: /Photos/ });
    expect(screen.queryByRole("button", { name: /Copy link/ })).toBeNull();
  });

  test("says when the public gallery is off", async () => {
    state = stateWith({ publicGalleryEnabled: false, items: [item({})] });
    renderTab();
    expect(await screen.findByText(/public event gallery is off/)).toBeTruthy();
  });

  test("the objection notice says photos are public as they are uploaded", async () => {
    state = stateWith({ photoObjections: 1, items: [item({})] });
    const { unmount } = renderTab();
    expect(
      await screen.findByText(
        /go on the public site as soon as they are uploaded/,
      ),
    ).toBeTruthy();
    unmount();

    state = stateWith({
      photoObjections: 1,
      publicGalleryEnabled: false,
      items: [item({})],
    });
    renderTab();
    expect(
      await screen.findByText(/before sharing them outside the portal/),
    ).toBeTruthy();
  });
});
