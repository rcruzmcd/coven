import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ProfileQuestionsActions from "./actions";
import type { PersonQuestion } from "@/lib/person-questions";

const refreshMock = mock(() => {});
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ refresh: refreshMock }),
}));

const saveMock = mock<(questions: unknown) => Promise<{ success: true }>>(
  async () => ({ success: true }),
);
mock.module("./actions", () => ({
  ...ProfileQuestionsActions,
  savePersonQuestionsAction: saveMock,
}));

const { ProfileQuestionsEditor } = await import("./profile-questions-editor");

function question(overrides: Partial<PersonQuestion> & { id: string }) {
  return {
    kind: "short_text",
    prompt: "Home mountain",
    help: null,
    column_label: null,
    required: false,
    options: [],
    min_value: null,
    max_value: null,
    show_if: null,
    place: null,
    allow_other: false,
    key: null,
    ask_after_registration: true,
    ask_on_my_details: true,
    snapshot_at_checkin: false,
    program_ids: [],
    archived_at: null,
    ...overrides,
  } satisfies PersonQuestion;
}

const programs = [
  { id: "program-snow", name: "Snow days" },
  { id: "program-yoga", name: "Yoga" },
];

beforeEach(() => {
  saveMock.mockClear();
  refreshMock.mockClear();
});

describe("ProfileQuestionsEditor", () => {
  test("says nothing is asked until a question is added", () => {
    render(
      <ProfileQuestionsEditor
        questions={[]}
        archived={[]}
        programs={programs}
        usage={{}}
      />,
    );
    expect(
      screen.getByText(/Until you add one, nobody is asked anything/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save questions" }),
    ).toBeDisabled();
  });

  test("offers no consent kind and saves a person question's own fields", async () => {
    const user = userEvent.setup();
    render(
      <ProfileQuestionsEditor
        questions={[question({ id: "q-mountain" })]}
        archived={[]}
        programs={programs}
        usage={{}}
      />,
    );

    await user.click(screen.getByLabelText("Answer type"));
    expect(
      screen.queryByRole("option", { name: "Consent checkbox" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.type(screen.getByLabelText("Code"), "home_mountain");
    await user.click(screen.getByRole("checkbox", { name: "Snow days" }));
    await user.click(
      screen.getByRole("switch", { name: /Ask on their details page/ }),
    );
    await user.click(screen.getByRole("button", { name: "Save questions" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const [payload] = saveMock.mock.calls[0] as [Record<string, unknown>[]];
    expect(payload[0]).toMatchObject({
      id: "q-mountain",
      kind: "short_text",
      prompt: "Home mountain",
      key: "home_mountain",
      program_ids: ["program-snow"],
      ask_after_registration: true,
      ask_on_my_details: false,
    });
    expect(payload[0]).not.toHaveProperty("shares_contact");
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("refuses a malformed code before the round trip", async () => {
    const user = userEvent.setup();
    render(
      <ProfileQuestionsEditor
        questions={[question({ id: "q-mountain" })]}
        archived={[]}
        programs={[]}
        usage={{}}
      />,
    );
    await user.type(screen.getByLabelText("Code"), "Home Mountain");
    await user.click(screen.getByRole("button", { name: "Save questions" }));
    expect(
      await screen.findByText(/A question code is lower-case letters/),
    ).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });

  test("says how many answered, and restores an archived question", async () => {
    const user = userEvent.setup();
    render(
      <ProfileQuestionsEditor
        questions={[question({ id: "q-mountain" })]}
        archived={[
          question({
            id: "q-old",
            prompt: "Old question",
            archived_at: "2026-10-01T00:00:00Z",
          }),
        ]}
        programs={[]}
        usage={{ "q-mountain": 3, "q-old": 1 }}
      />,
    );
    expect(screen.getByText(/Answered by 3 people/)).toBeInTheDocument();
    expect(screen.getByText(/answered by 1 person/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.queryByText("Archived questions")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save questions" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const [payload] = saveMock.mock.calls[0] as [{ id: string }[]];
    expect(payload.map((q) => q.id)).toEqual(["q-mountain", "q-old"]);
  });
});
