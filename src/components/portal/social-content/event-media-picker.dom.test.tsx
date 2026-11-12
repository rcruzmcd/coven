import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as MediaActions from "@/app/portal/(app)/events/media-actions";
import type {
  EventMediaRow,
  EventMediaState,
} from "@/app/portal/(app)/events/media-actions";
import * as PostContentActions from "@/lib/social-content/post-content-actions";

let state: EventMediaState;
const addMock = mock(async (_postId: string, ids: string[]) => ({
  added: ids.length,
}));

mock.module("@/app/portal/(app)/events/media-actions", () => ({
  ...MediaActions,
  getEventMediaAction: async () => ({ data: state }),
}));
mock.module("@/lib/social-content/post-content-actions", () => ({
  ...PostContentActions,
  addSocialPostEventMediaAction: addMock,
}));

const { EventMediaPicker } = await import("./event-media-picker");

function item(
  name: string,
  overrides: Partial<EventMediaRow> = {},
): EventMediaRow {
  return {
    id: crypto.randomUUID(),
    kind: "photo",
    original_filename: name,
    content_type: "image/jpeg",
    size_bytes: 1,
    uploaded_at: "2026-10-18T19:30:00Z",
    uploader_name: null,
    url: `https://storage.test/${name}`,
    display_url: null,
    download_url: null,
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

function renderPicker(
  props: Partial<Parameters<typeof EventMediaPicker>[0]> = {},
) {
  const onAdded = mock(() => {});
  render(
    <EventMediaPicker
      postId="post-1"
      eventId="event-1"
      format="instagram_post"
      held={0}
      referencedIds={new Set()}
      onAdded={onAdded}
      onError={() => {}}
      {...props}
    />,
  );
  return { onAdded };
}

async function open() {
  await userEvent.click(
    screen.getByRole("button", { name: "Choose from event" }),
  );
  return screen.findByRole("dialog");
}

beforeEach(() => addMock.mockClear());

describe("EventMediaPicker (#1827)", () => {
  test("offers the flyer first, and adds the picked files in order", async () => {
    const flyer = item("flyer.jpg");
    const crowd = item("crowd.jpg");
    state = stateWith({
      flyerMediaId: flyer.id,
      items: [crowd, flyer],
    });
    const { onAdded } = renderPicker();
    const dialog = await open();

    const sections = await within(dialog).findAllByRole("region");
    expect(sections[0].getAttribute("aria-label")).toBe("Flyer");
    expect(within(sections[0]).getByText("flyer.jpg")).toBeTruthy();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "crowd.jpg" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "flyer.jpg" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add 2" }),
    );

    expect(addMock).toHaveBeenCalledWith("post-1", [crowd.id, flyer.id]);
    expect(onAdded).toHaveBeenCalled();
  });

  test("a reel takes one video: photos can't be picked", async () => {
    const photo = item("photo.jpg");
    const clip = item("clip.mp4", { kind: "video", content_type: "video/mp4" });
    state = stateWith({ items: [photo, clip] });
    renderPicker({ format: "instagram_reel" });
    const dialog = await open();

    const photoTile = within(dialog).getByRole("button", {
      name: /photo\.jpg \(A reel is a video\)/,
    });
    expect(photoTile.hasAttribute("disabled")).toBe(true);
    const clipTile = within(dialog).getByRole("button", { name: "clip.mp4" });
    await userEvent.click(clipTile);
    expect(clipTile.getAttribute("aria-pressed")).toBe("true");
    expect(within(dialog).getByText(/1 of 1 selected/)).toBeTruthy();
  });

  test("what the post already shows, and room left, limit the picks", async () => {
    const a = item("a.jpg");
    const b = item("b.jpg");
    const c = item("c.jpg");
    state = stateWith({ items: [a, b, c] });
    renderPicker({ held: 9, referencedIds: new Set([a.id]) });
    const dialog = await open();

    expect(
      within(dialog)
        .getByRole("button", { name: /a\.jpg \(On the post\)/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "b.jpg" }),
    );
    expect(
      within(dialog)
        .getByRole("button", { name: "c.jpg" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("states photo objections and marks hidden photos", async () => {
    state = stateWith({
      photoObjections: 2,
      items: [item("hidden.jpg", { is_public: false })],
    });
    renderPicker();
    const dialog = await open();
    expect(
      within(dialog).getByText(/2 people at this event objected/),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", {
        name: /hidden\.jpg \(hidden from the public site\)/,
      }),
    ).toBeTruthy();
  });

  test("a full post can't open the picker", () => {
    state = stateWith({});
    renderPicker({ format: "instagram_story", held: 1 });
    expect(
      screen
        .getByRole("button", { name: "Choose from event" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
