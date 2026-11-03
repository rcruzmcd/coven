import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AdultsOnlyBadge } from "./adults-only-badge";

describe("AdultsOnlyBadge (#1417, #1782)", () => {
  test.each([18, 21] as const)("renders %p+ for that age", (age) => {
    render(<AdultsOnlyBadge minimumAge={age} />);
    expect(screen.getByText(`${age}+`)).toBeVisible();
    expect(
      screen.getByText(`Adults only: everyone must be ${age} or over`),
    ).toBeInTheDocument();
  });

  test.each([null, undefined])("renders nothing for %p", (value) => {
    const { container } = render(<AdultsOnlyBadge minimumAge={value} />);
    expect(container).toBeEmptyDOMElement();
  });
});
