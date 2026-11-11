import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import type { PublicGalleryEvent } from "@/lib/public-gallery";
import { GalleryList } from "./gallery-list";

const event = (
  overrides: Partial<PublicGalleryEvent> = {},
): PublicGalleryEvent => ({
  id: "e1",
  name: "Rail Jam",
  startsAt: "2026-03-15T01:00:00Z",
  timezone: "America/Denver",
  photoCount: 12,
  videoCount: 2,
  thumbs: ["https://s/1", "https://s/2"],
  ...overrides,
});

describe("GalleryList", () => {
  test("groups each event under its name, linking to its photos page", () => {
    render(
      <GalleryList
        events={[
          event(),
          event({ id: "e2", name: "Pride Ride", videoCount: 0 }),
        ]}
      />,
    );
    const first = screen
      .getByRole("heading", { name: "Rail Jam" })
      .closest("section")!;
    expect(
      within(first).getByRole("link", { name: "Rail Jam" }),
    ).toHaveAttribute("href", "/events/e/e1/photos");
    expect(
      within(first).getByRole("link", { name: "See all photos from Rail Jam" }),
    ).toHaveAttribute("href", "/events/e/e1/photos");
    expect(first.textContent).toContain("12 photos · 2 videos");
    expect(first.querySelectorAll("img")).toHaveLength(2);

    const second = screen
      .getByRole("heading", { name: "Pride Ride" })
      .closest("section")!;
    expect(second.textContent).toContain("12 photos");
    expect(second.textContent).not.toContain("video");
  });

  test("dates the event in its own zone, labelled", () => {
    render(<GalleryList events={[event()]} />);
    // 01:00 UTC on the 15th is the evening of the 14th in Denver.
    expect(screen.getByText(/Mar 14, 2026, MDT/)).toBeInTheDocument();
  });

  test("an event with only videos links to them and shows no strip", () => {
    render(
      <GalleryList
        events={[event({ photoCount: 0, videoCount: 1, thumbs: [] })]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "See the videos from Rail Jam" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });
});
