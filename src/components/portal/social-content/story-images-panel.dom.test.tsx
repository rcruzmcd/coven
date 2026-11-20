import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StoryImagesState } from "@/lib/social-content/story-images";

const generateMock = mock<(postId: string) => Promise<{ ok: true }>>(
  async () => ({ ok: true }),
);

mock.module("@/lib/social-content/story-images-actions", () => ({
  generateSocialPostStoryImagesAction: generateMock,
}));

const { StoryImagesPanel } = await import("./story-images-panel");

const fresh: StoryImagesState = {
  hasItem: true,
  hasPhoto: true,
  generated: 0,
  stale: false,
};

function renderPanel(
  props: Partial<Parameters<typeof StoryImagesPanel>[0]> = {},
) {
  const onGenerated = mock(() => {});
  render(
    <StoryImagesPanel
      postId="post-1"
      state={fresh}
      published={false}
      canManage
      onGenerated={onGenerated}
      {...props}
    />,
  );
  return { onGenerated };
}

beforeEach(() => generateMock.mockClear());

describe("StoryImagesPanel (#1909)", () => {
  test("generates the images in one click when there are none yet", async () => {
    const { onGenerated } = renderPanel();
    expect(screen.queryByText(/no photo/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /Generate story images/ }),
    );
    await waitFor(() => expect(generateMock).toHaveBeenCalledWith("post-1"));
    await waitFor(() => expect(onGenerated).toHaveBeenCalled());
  });

  test("with no item, there is nothing to draw and the button is disabled", () => {
    renderPanel({ state: { ...fresh, hasItem: false, hasPhoto: false } });
    expect(screen.getByText(/features no Gear Library item/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Generate story images/ }),
    ).toBeDisabled();
    expect(screen.queryByText(/no photo/)).toBeNull();
  });

  test("an item with no photo warns but does not block", () => {
    renderPanel({ state: { ...fresh, hasPhoto: false } });
    expect(screen.getByText(/This item has no photo/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Generate story images/ }),
    ).toBeEnabled();
  });

  test("out-of-date images say so, and regenerating asks first", async () => {
    renderPanel({ state: { ...fresh, generated: 3, stale: true } });
    expect(screen.getByText("Out of date")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /Regenerate story images/ }),
    );
    expect(generateMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        /Photos and videos someone added to the post stay/,
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(generateMock).toHaveBeenCalledWith("post-1"));
  });

  test("current images are not marked out of date", () => {
    renderPanel({ state: { ...fresh, generated: 3 } });
    expect(screen.queryByText("Out of date")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Regenerate story images/ }),
    ).toBeEnabled();
  });

  test("a published post's images stay as they are", () => {
    renderPanel({
      published: true,
      state: { ...fresh, generated: 3, stale: true },
    });
    expect(screen.getByText(/This post is published/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Regenerate story images/ }),
    ).toBeDisabled();
  });

  test("someone who can only view sees no button", () => {
    renderPanel({ canManage: false });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
