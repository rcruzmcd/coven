import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GearItemOption } from "@/lib/social-content/series-gear-actions";
import type { GearPostDetails } from "@/lib/social-content/series-gear";

const swapMock = mock<
  (
    postId: string,
    itemId: string | null,
    replace: boolean,
  ) => Promise<{ success: true; photoCopied: boolean }>
>(async () => ({ success: true, photoCopied: true }));
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
mock.module("@/lib/social-content/series-gear-actions", () => ({
  swapFeaturedGearAction: swapMock,
}));

const { SocialPostFeaturedGearCard } =
  await import("./social-post-featured-gear-card");

const jacket: GearItemOption = {
  id: "item-1",
  description: "Burton jacket",
  size: "M",
  condition: "like_new",
  category_label: "Jackets",
  photo_url: "https://example.org/jacket.jpg",
  status: "available",
  qualifies: true,
  featured: true,
};
const blank: GearPostDetails = { brand: null, best_for: null, why: null };

function renderCard(
  props: Partial<Parameters<typeof SocialPostFeaturedGearCard>[0]> = {},
) {
  return render(
    <SocialPostFeaturedGearCard
      postId="post-1"
      published={false}
      canManage
      featured={jacket}
      options={[jacket]}
      captionEdited={false}
      details={blank}
      {...props}
    />,
  );
}

beforeEach(() => {
  swapMock.mockClear();
});

// Brand, Best for and Why are edited on the template card (#1925):
// post-template-card.dom.test.tsx.

describe("SocialPostFeaturedGearCard swap", () => {
  test("swaps straight away when nothing was typed", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Pick another" }));
    await waitFor(() => expect(swapMock).toHaveBeenCalledTimes(1));
    expect(swapMock.mock.calls[0]).toEqual(["post-1", null, false]);
  });

  test("asks first when the details are filled in, and clears them on yes", async () => {
    const user = userEvent.setup();
    renderCard({ details: { brand: "Burton", best_for: null, why: null } });

    await user.click(screen.getByRole("button", { name: "Pick another" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "clears the brand, best for and why we love it",
    );
    expect(swapMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(swapMock).toHaveBeenCalledTimes(1));
    expect(swapMock.mock.calls[0]).toEqual(["post-1", null, true]);
  });

  test("cancelling keeps the item and the details", async () => {
    const user = userEvent.setup();
    renderCard({ details: { brand: null, best_for: null, why: "Warm." } });

    await user.click(screen.getByRole("button", { name: "Pick another" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(swapMock).not.toHaveBeenCalled();
  });
});
