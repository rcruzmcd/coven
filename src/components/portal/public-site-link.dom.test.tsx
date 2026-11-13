import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PublicSiteOriginProvider } from "@/lib/portal/public-site-context";
import { PublicSiteLink } from "./public-site-link";

describe("PublicSiteLink", () => {
  test("links absolutely to the public site from a portal host", () => {
    render(
      <PublicSiteOriginProvider origin="https://chattersnow.org">
        <PublicSiteLink path="/privacy">Privacy</PublicSiteLink>
      </PublicSiteOriginProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Privacy" }).getAttribute("href"),
    ).toBe("https://chattersnow.org/privacy");
  });

  test("stays relative where the public site is this host", () => {
    render(
      <PublicSiteOriginProvider origin="">
        <PublicSiteLink path="/waiver?version=2">Waiver</PublicSiteLink>
      </PublicSiteOriginProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Waiver" }).getAttribute("href"),
    ).toBe("/waiver?version=2");
  });

  test("renders the fallback when there is no public site", () => {
    render(
      <PublicSiteOriginProvider origin={null}>
        <PublicSiteLink path="/terms">Terms</PublicSiteLink>
        <PublicSiteLink path="/contact" fallback={null}>
          View on the site
        </PublicSiteLink>
      </PublicSiteOriginProvider>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Terms")).toBeTruthy();
    expect(screen.queryByText("View on the site")).toBeNull();
  });
});
