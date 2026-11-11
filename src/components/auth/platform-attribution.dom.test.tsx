import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { COVEN_SITE_URL, PlatformAttribution } from "./platform-attribution";

describe("PlatformAttribution", () => {
  test("says the page is powered by Coven, and names no company", () => {
    const { container } = render(<PlatformAttribution />);
    expect(container).toHaveTextContent(/^Powered by Coven$/);
  });

  test("links to Coven's site in a new tab, and says so", () => {
    render(<PlatformAttribution />);
    const link = screen.getByRole("link", {
      name: "Coven (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", COVEN_SITE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
  });
});
