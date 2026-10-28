import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import * as EventsActions from "./actions";
import {
  questionsDraftError,
  questionsPayload,
  type EventRegistrationQuestion,
  type QuestionDraft,
} from "./registration-questions-draft";

const listEventOptionsMock = mock(async () => ({
  data: [
    { id: "event-1", name: "This event" },
    { id: "event-2", name: "Last season's trip" },
  ],
}));

const listQuestionsMock = mock<
  (eventId: string) => Promise<{ data: EventRegistrationQuestion[] }>
>(async () => ({ data: [] }));

mock.module("./actions", () => ({
  ...EventsActions,
  listEventOptionsAction: listEventOptionsMock,
  listCopyableRegistrationQuestionsAction: listQuestionsMock,
}));

const { RegistrationQuestionsEditor } =
  await import("./registration-questions-editor");

function draft(overrides: Partial<QuestionDraft> & { id: string }) {
  return {
    kind: "short_text",
    prompt: "",
    help: "",
    columnLabel: "",
    required: false,
    options: [],
    min: "",
    max: "",
    showIf: null,
    sharesContact: false,
    placeGranularity: "locality",
    placeAllowOther: true,
    ...overrides,
  } satisfies QuestionDraft;
}

// The editor is controlled; hold its value the way the Planning tab does and
// expose the latest one to the assertions.
let latest: QuestionDraft[] = [];
function Harness({ initial }: { initial: QuestionDraft[] }) {
  const [value, setValue] = useState(initial);
  return (
    <RegistrationQuestionsEditor
      eventId="event-1"
      value={value}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
    />
  );
}

beforeEach(() => {
  latest = [];
  listQuestionsMock.mockClear();
});

describe("RegistrationQuestionsEditor", () => {
  test("adds a single-choice question with two blank options", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    await user.click(screen.getByRole("button", { name: /Add question/ }));
    await user.type(screen.getByLabelText(/Prompt/), "Getting there");

    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({
      kind: "single_choice",
      prompt: "Getting there",
      showIf: null,
    });
    expect(latest[0].options).toHaveLength(2);
    expect(
      screen.getByRole("textbox", { name: "Question 1 option 2" }),
    ).toBeInTheDocument();
  });

  test("offers only earlier, always-shown single-choice questions as a condition", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          draft({
            id: "q-mode",
            kind: "single_choice",
            prompt: "Getting there",
            options: [
              { id: "o-drive", label: "Driving" },
              { id: "o-ride", label: "Need a ride" },
            ],
          }),
          draft({
            id: "q-multi",
            kind: "multi_choice",
            prompt: "Days",
            options: [
              { id: "o-sat", label: "Saturday" },
              { id: "o-sun", label: "Sunday" },
            ],
          }),
          draft({
            id: "q-seats",
            kind: "number",
            prompt: "Seats available",
            showIf: { question_id: "q-mode", option_ids: ["o-drive"] },
          }),
          draft({ id: "q-from", prompt: "Leaving from" }),
        ]}
      />,
    );

    // The first question can have no condition, and others depend on it.
    expect(
      screen.getByText(
        "Always shown, because other questions depend on its answer.",
      ),
    ).toBeInTheDocument();

    const pickers = screen.getAllByRole("combobox", {
      name: "Show this question",
    });
    // Days, Seats available and Leaving from each have one.
    expect(pickers).toHaveLength(3);

    await user.click(pickers[2]);
    const listbox = await screen.findByRole("listbox");
    const choices = within(listbox)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(choices).toEqual(["Always", "Only after “Getting there”"]);

    await user.click(
      within(listbox).getByRole("option", {
        name: "Only after “Getting there”",
      }),
    );
    await user.click(
      within(
        screen.getAllByRole("group", { name: "When the answer is" })[1],
      ).getByRole("checkbox", { name: "Need a ride" }),
    );

    expect(latest[3].showIf).toEqual({
      question_id: "q-mode",
      option_ids: ["o-ride"],
    });
  });

  test("drops a condition when its question stops being a single choice", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          draft({
            id: "q-mode",
            kind: "single_choice",
            prompt: "Getting there",
            options: [
              { id: "o-drive", label: "Driving" },
              { id: "o-ride", label: "Need a ride" },
            ],
          }),
          draft({
            id: "q-seats",
            kind: "number",
            prompt: "Seats available",
            showIf: { question_id: "q-mode", option_ids: ["o-drive"] },
          }),
        ]}
      />,
    );

    await user.click(
      screen.getAllByRole("combobox", { name: "Answer type" })[0],
    );
    await user.click(
      await screen.findByRole("option", { name: "Multiple choice" }),
    );

    expect(latest[0].kind).toBe("multi_choice");
    expect(latest[1].showIf).toBeNull();
  });

  test("copies another event's questions with fresh, consistently remapped ids", async () => {
    listQuestionsMock.mockImplementation(async () => ({
      data: [
        {
          id: "src-mode",
          kind: "single_choice",
          prompt: "Getting there",
          help: null,
          required: true,
          options: [
            { id: "src-drive", label: "Driving" },
            { id: "src-ride", label: "Need a ride" },
          ],
          min_value: null,
          max_value: null,
          show_if: null,
          shares_contact: false,
        },
        {
          id: "src-seats",
          kind: "number",
          prompt: "Seats available",
          help: null,
          required: false,
          options: [],
          min_value: 1,
          max_value: 8,
          show_if: { question_id: "src-mode", option_ids: ["src-drive"] },
          shares_contact: false,
        },
        {
          id: "src-consent",
          kind: "consent",
          prompt: "OK to share my details with the organiser",
          help: null,
          required: false,
          options: [],
          min_value: null,
          max_value: null,
          show_if: null,
          shares_contact: true,
        },
      ],
    }));
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    await user.click(
      screen.getByRole("button", { name: /Copy from another event/ }),
    );
    const dialog = await screen.findByRole("dialog");
    const eventPicker = within(dialog).getByRole("combobox", {
      name: "Event",
    });
    await waitFor(() => expect(eventPicker).not.toHaveAttribute("disabled"));
    await user.click(eventPicker);
    // The event being edited is not offered as its own source.
    expect(
      screen.queryByRole("option", { name: "This event" }),
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("option", { name: "Last season's trip" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Copy questions" }),
    );

    await waitFor(() => expect(latest).toHaveLength(3));
    expect(listQuestionsMock).toHaveBeenCalledWith("event-2");

    const [mode, seats, consent] = latest;
    const sourceIds = ["src-mode", "src-drive", "src-ride", "src-seats"];
    expect(sourceIds).not.toContain(mode.id);
    expect(sourceIds).not.toContain(seats.id);
    expect(mode.options.map((option) => option.label)).toEqual([
      "Driving",
      "Need a ride",
    ]);
    for (const option of mode.options) {
      expect(sourceIds).not.toContain(option.id);
    }
    // The condition follows the copies, not the originals.
    expect(seats.showIf).toEqual({
      question_id: mode.id,
      option_ids: [mode.options[0].id],
    });
    expect(seats).toMatchObject({ min: "1", max: "8" });
    expect(mode.required).toBe(true);
    expect(consent.sharesContact).toBe(true);
  });

  test("names a question's column in the registrants list (#1512)", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[draft({ id: "q-borough", prompt: "Which borough?" })]}
      />,
    );

    await user.type(
      screen.getByLabelText("Column name in the registrants list"),
      "  Borough ",
    );

    expect(questionsPayload(latest)[0].column_label).toBe("Borough");
    expect(questionsPayload([draft({ id: "q" })])[0].column_label).toBeNull();
    expect(
      questionsDraftError([
        draft({ id: "q", prompt: "Long", columnLabel: "x".repeat(25) }),
      ]),
    ).toContain("at most 24 characters");
  });
});
