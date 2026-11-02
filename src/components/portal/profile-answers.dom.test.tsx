// #1744: a person's profile answers on the profile card and registrant sheet.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PersonQuestion } from "@/lib/person-questions";

mock.module("@/components/ui/toast", () => ({
  toast: { error: mock(() => ""), success: mock(() => ""), close: mock() },
  Toaster: () => null,
}));

const { ProfileAnswers } = await import("./profile-answers");

const base: Omit<
  PersonQuestion,
  "id" | "kind" | "prompt" | "required" | "options"
> = {
  help: null,
  min_value: null,
  max_value: null,
  show_if: null,
  key: null,
  ask_after_registration: true,
  ask_on_my_details: true,
  snapshot_at_checkin: false,
  program_ids: [],
  archived_at: null,
};

const LEVEL: PersonQuestion = {
  ...base,
  id: "q-level",
  kind: "single_choice",
  prompt: "Experience level",
  required: true,
  options: [
    { id: "o-new", label: "New", key: "new", hint: null, archived: false },
    {
      id: "o-old",
      label: "Retired label",
      key: "old",
      hint: null,
      archived: true,
    },
  ],
};
const HOUSEHOLD: PersonQuestion = {
  ...base,
  id: "q-household",
  kind: "number",
  prompt: "Household size",
  required: false,
  options: [],
  min_value: 1,
  max_value: 20,
};

const saveMock = mock<
  (answers: Record<string, unknown>) => Promise<{ success: true }>
>(async () => ({ success: true }));

describe("ProfileAnswers", () => {
  beforeEach(() => {
    saveMock.mockClear();
  });

  test("shows answers in their stored words, including removed questions", () => {
    render(
      <ProfileAnswers
        idPrefix="t"
        questions={[LEVEL, HOUSEHOLD]}
        answers={[
          {
            question_id: "q-level",
            value: "o-old",
            prompt_as_shown: "Experience then",
            answer_text: "Retired label",
          },
          {
            question_id: "q-gone",
            value: "x",
            prompt_as_shown: "Dietary needs",
            answer_text: "None",
          },
        ]}
        canManage={false}
        onSave={saveMock}
      />,
    );

    expect(screen.getByText("Experience then")).toBeInTheDocument();
    expect(screen.getByText("Retired label")).toBeInTheDocument();
    expect(screen.getByText("Not answered")).toBeInTheDocument();
    expect(
      screen.getByText("Dietary needs (question removed)"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit answers" }),
    ).not.toBeInTheDocument();
  });

  test("staff edit answers without being held to required", async () => {
    const onSaved = mock(() => {});
    const user = userEvent.setup();
    render(
      <ProfileAnswers
        idPrefix="t"
        questions={[LEVEL, HOUSEHOLD]}
        answers={[]}
        canManage
        onSave={saveMock}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit answers" }));
    await user.type(screen.getByLabelText("Household size"), "3");
    await user.click(screen.getByRole("button", { name: "Save answers" }));

    expect(saveMock).toHaveBeenCalledWith({ "q-household": 3 });
    expect(onSaved).toHaveBeenCalled();
  });

  test("renders nothing for a tenant asking nothing", () => {
    const { container } = render(
      <ProfileAnswers
        idPrefix="t"
        questions={[]}
        answers={[]}
        canManage
        onSave={saveMock}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
