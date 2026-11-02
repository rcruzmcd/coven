// #1713: the artwork submission's funnel. No call code, and nothing the
// artist typed or uploaded, travels with any event.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ArtworkItem } from "@/components/public/artwork-upload-field";
import type { SubmitArtworkResult } from "./artwork-actions";

const submitMock = mock(async (): Promise<SubmitArtworkResult> => ({
  success: true,
}));

mock.module("./artwork-actions", () => ({ submitArtworkAction: submitMock }));

// The real field uploads straight to Storage; this one hands back an image
// that is already "uploaded".
mock.module("@/components/public/artwork-upload-field", () => ({
  ArtworkUploadField: ({
    onChange,
  }: {
    onChange: (items: ArtworkItem[]) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          {
            image: {
              path: "t/c/d/a.jpg",
              thumbPath: "t/c/d/a-thumb.jpg",
              contentType: "image/jpeg",
              byteSize: 1,
            },
            previewUrl: "blob:a",
            fileName: "a.jpg",
          } as ArtworkItem,
        ])
      }
    >
      Add image
    </button>
  ),
}));

const { ArtworkSubmissionForm } = await import("./artwork-submission-form");
const { setFormCapture } = await import("@/lib/analytics/form-events");

afterEach(() => setFormCapture(null));

function recorder() {
  const calls: [string, Record<string, string>][] = [];
  setFormCapture((event, properties) => {
    calls.push([event, properties]);
  });
  return calls;
}

async function fillIn({ withImage }: { withImage: boolean }) {
  const user = userEvent.setup();
  render(
    <ArtworkSubmissionForm code="CALL1" maxImages={3} rightsNote={null} />,
  );
  if (withImage)
    await user.click(screen.getByRole("button", { name: "Add image" }));
  await user.type(screen.getByLabelText(/^Your name/), "Ari");
  await user.type(screen.getByLabelText(/^Email/), "ari@example.com");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Submit my artwork" }));
}

const form = { form: "artwork_submission" };

describe("artwork submission funnel", () => {
  test("viewed, started, submitted, completed", async () => {
    const calls = recorder();
    await fillIn({ withImage: true });
    await screen.findByText(/we have your work/);
    expect(calls).toEqual([
      ["form_viewed", form],
      ["form_started", form],
      ["form_submitted", form],
      ["form_completed", form],
    ]);
  });

  test("no image is refused before it counts as submitted", async () => {
    const calls = recorder();
    await fillIn({ withImage: false });
    await screen.findByText("Add at least one image of your work.");
    expect(calls.map(([event]) => event)).toEqual([
      "form_viewed",
      "form_started",
    ]);
  });

  test("a refusal sends its code", async () => {
    const calls = recorder();
    submitMock.mockImplementationOnce(async () => ({
      error: "This call for artwork is closed.",
      code: "CALL_CLOSED",
    }));
    await fillIn({ withImage: true });
    await waitFor(() =>
      expect(calls.at(-1)).toEqual([
        "form_failed",
        { ...form, error_code: "CALL_CLOSED" },
      ]),
    );
  });
});
