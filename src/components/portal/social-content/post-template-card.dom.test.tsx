import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PostTemplateEditor } from "@/lib/social-content/post-template-editor";

const saveMock = mock<
  (
    postId: string,
    input: Record<string, string>,
  ) => Promise<{ success: true; captionUpdated: boolean }>
>(async () => ({ success: true, captionUpdated: false }));
const setMock = mock(async () => ({ success: true as const }));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
mock.module("@/lib/social-content/post-template-actions", () => ({
  savePostTemplateTextAction: saveMock,
  setPostTemplateAction: setMock,
}));
mock.module("@/lib/social-content/story-images-actions", () => ({
  generateSocialPostStoryImagesAction: async () => ({ ok: true }),
}));

const { PostTemplateCard, PREVIEW_DELAY_MS } =
  await import("./post-template-card");

const editor: PostTemplateEditor = {
  templateKey: "gear_spotlight",
  choices: [{ key: "gear_spotlight", label: "Gear Spotlight" }],
  switchedOff: null,
  frames: [1, 2, 3],
  fields: [
    {
      key: "brand",
      label: "Brand",
      kind: "line",
      max: 60,
      start: "",
      value: "Burton",
    },
    {
      key: "why",
      label: "Why we love it",
      kind: "paragraph",
      max: 180,
      start: "",
      value: "",
    },
  ],
  photo: {
    key: "photo",
    label: "Photo",
    start: "item",
    value: "item",
    options: [
      {
        id: "item",
        label: "The item's photo",
        src: "https://example.org/a.jpg",
        crop: null,
      },
      { id: "none", label: "No photo", src: null, crop: null },
    ],
  },
  storyImages: { hasItem: true, hasPhoto: true, generated: 0, stale: false },
};

const fetchCalls: string[] = [];
const realFetch = globalThis.fetch;
let blobs = 0;

beforeEach(() => {
  saveMock.mockClear();
  fetchCalls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    return new Response(new Blob(["png"]), { status: 200 });
  }) as typeof fetch;
  URL.createObjectURL = () => `blob:preview-${++blobs}`;
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function renderCard(
  props: Partial<Parameters<typeof PostTemplateCard>[0]> = {},
) {
  render(
    <PostTemplateCard
      postId="post-1"
      editor={editor}
      published={false}
      canManage
      onGenerated={() => {}}
      {...props}
    />,
  );
}

function previewText(url: string) {
  return JSON.parse(new URL(url, "https://x.org").searchParams.get("text")!);
}

describe("PostTemplateCard fields", () => {
  test("one box per field with a count against its cap", () => {
    renderCard();
    expect(screen.getByLabelText("Brand")).toHaveValue("Burton");
    expect(screen.getByText("6/60 characters")).toBeInTheDocument();
    expect(screen.getByLabelText("Brand")).toHaveAttribute("maxlength", "60");
    expect(screen.getByText("0/180 characters")).toBeInTheDocument();
  });

  test("Reset puts back the record's value", async () => {
    const user = userEvent.setup();
    renderCard();
    expect(
      screen.getByRole("button", { name: "Reset Why we love it" }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("button", { name: "Reset Brand" }));
    expect(screen.getByLabelText("Brand")).toHaveValue("");
  });

  test("saves every field and the photo choice", async () => {
    const user = userEvent.setup();
    renderCard();
    const save = screen.getByRole("button", { name: "Save template" });
    expect(save).toHaveAttribute("aria-disabled", "true");

    await user.type(screen.getByLabelText("Why we love it"), "Warm.");
    await user.click(screen.getByRole("radio", { name: /No photo/ }));
    await user.click(save);

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]).toEqual([
      "post-1",
      { brand: "Burton", why: "Warm.", photo: "none" },
    ]);
  });

  test("the default photo is sent as unset, so it follows the record", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText("Brand"), "!");
    await user.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][1].photo).toBe("");
  });

  test("is read-only once published, with no Generate while unsaved", () => {
    renderCard({ published: true });
    expect(screen.getByLabelText("Brand")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save template" }),
    ).not.toBeInTheDocument();
  });

  test("holds Generate until the template is saved", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText("Brand"), "!");
    expect(
      screen.getByRole("button", { name: /Generate story images/ }),
    ).toBeDisabled();
    expect(screen.getByText(/Save the template first/)).toBeInTheDocument();
  });
});

describe("PostTemplateCard preview", () => {
  test("draws the typed text once typing pauses, keeping the last image up", async () => {
    const user = userEvent.setup();
    renderCard();
    await waitFor(() => expect(fetchCalls).toHaveLength(1));
    expect(fetchCalls[0]).toStartWith("/api/social-posts/post-1/story/1?text=");
    expect(previewText(fetchCalls[0])).toEqual({
      brand: "Burton",
      why: "",
      photo: "",
    });
    const first = await screen.findByAltText("Preview of frame 1");

    await user.type(screen.getByLabelText("Why we love it"), "Warm");
    // Mid-typing: nothing asked for yet, and the last image is still shown.
    expect(fetchCalls).toHaveLength(1);
    expect(first).toBeInTheDocument();
    expect(screen.getByText("Drawing preview")).toBeInTheDocument();

    await act(() => new Promise((r) => setTimeout(r, PREVIEW_DELAY_MS + 50)));
    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    expect(previewText(fetchCalls[1]).why).toBe("Warm");
  });

  test("pages through the frames and downloads the one shown", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Next frame" }));
    expect(screen.getByText("Frame 2 of 3")).toBeInTheDocument();
    const download = screen.getByRole("button", { name: /Download PNG/ });
    expect(download.getAttribute("href")).toMatch(
      /^\/api\/social-posts\/post-1\/story\/2\?text=.*&download=1$/,
    );
  });
});

describe("PostTemplateCard picker", () => {
  test("offers the fitting templates and no template", async () => {
    renderCard();
    expect(screen.getByLabelText("Template")).toHaveTextContent(
      "Gear Spotlight",
    );
  });

  test("says when the post's template is switched off", () => {
    renderCard({
      editor: {
        ...editor,
        templateKey: null,
        choices: [],
        switchedOff: "Gear Spotlight",
        fields: [],
        photo: null,
        storyImages: null,
      },
    });
    expect(screen.getByText(/switched off/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Brand")).not.toBeInTheDocument();
  });
});
