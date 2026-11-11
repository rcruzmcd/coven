// DOM coverage for the Content card (#1231): a calendar item holds several
// content pieces, so the card is a list with a sheet behind each row rather
// than the single brief form it replaced.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ContentPiecesCard } from "./content-pieces-card";
import type { ContentPieceRow } from "@/lib/social-content/pieces";

function piece(overrides: Partial<ContentPieceRow> = {}): ContentPieceRow {
  return {
    id: "piece-1",
    calendar_item_id: "item-1",
    event_id: null,
    title: "Instagram carousel",
    content: null,
    post_format: null,
    collaborator_handles: [],
    content_status: "draft",
    skip_reason: null,
    internal_notes: null,
    owner_id: null,
    reviewer_id: null,
    lead_time_days: 21,
    publish_due_at: null,
    review_due_at: null,
    draft_due_at: null,
    status_changed_by: null,
    status_changed_at: null,
    ...overrides,
  };
}

function renderCard(
  pieces: ContentPieceRow[],
  { canManage = true }: { canManage?: boolean } = {},
) {
  return render(
    <ContentPiecesCard
      calendarItemId="item-1"
      itemStartsAt="2026-03-31T10:00:00.000Z"
      pieces={pieces}
      owners={[]}
      defaultLeadTimeDays={21}
      canManage={canManage}
      isSensitiveTopic={false}
      toneGuidance={null}
    />,
  );
}

describe("ContentPiecesCard", () => {
  test("lists every piece with its own status", () => {
    renderCard([
      piece(),
      piece({
        id: "piece-2",
        title: "Email to past participants",
        content_status: "idea",
      }),
    ]);

    expect(screen.getByText("Instagram carousel")).toBeInTheDocument();
    expect(screen.getByText("Email to past participants")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Idea")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View Instagram carousel" }),
    ).toBeInTheDocument();
    // Each post links to its own page (#1796).
    expect(
      screen.getByRole("link", { name: "Instagram carousel" }),
    ).toHaveAttribute("href", "/portal/social/piece-1");
  });

  test("offers to add a piece when the item has none", () => {
    renderCard([]);

    expect(
      screen.getByText("No social posts planned for this item yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add social post" }),
    ).toBeInTheDocument();
  });

  test("offers nothing to add or edit without manage access", () => {
    renderCard([piece()], { canManage: false });

    expect(screen.getByText("Instagram carousel")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add social post" }),
    ).not.toBeInTheDocument();
  });

  test("says a piece has no dates rather than showing a blank due column", () => {
    renderCard([piece()]);

    expect(screen.getByText("No dates set")).toBeInTheDocument();
    expect(screen.getByText("No owner")).toBeInTheDocument();
  });

  test("surfaces tone guidance for a sensitive-topic item", () => {
    render(
      <ContentPiecesCard
        calendarItemId="item-1"
        itemStartsAt="2026-03-31T10:00:00.000Z"
        pieces={[]}
        owners={[]}
        defaultLeadTimeDays={21}
        canManage
        isSensitiveTopic
        toneGuidance="Be affirming."
      />,
    );

    expect(screen.getByText("Be affirming.")).toBeInTheDocument();
  });
});
