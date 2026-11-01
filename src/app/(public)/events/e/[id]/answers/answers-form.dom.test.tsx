// #1502: the page behind an emailed answers link. The token travels in the
// form, the answers are held to the registration rules before they leave, and
// a link that has died since the page loaded says so in place of the form.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RegistrationQuestion } from "@/lib/registration-questions";

type Result =
  { error: string; linkInvalid?: boolean; code?: string } | { success: true };

const submitAnswersByLinkActionMock = mock<
  (formData: FormData) => Promise<Result>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  submitAnswersByLinkAction: submitAnswersByLinkActionMock,
}));

const { AnswersForm } = await import("./answers-form");
const { ANSWER_LINK_INVALID } =
  await import("@/lib/registration-answer-requests");
const { setFormCapture } = await import("@/lib/analytics/form-events");

const TOKEN = "a".repeat(64);

const questions: RegistrationQuestion[] = [
  {
    id: "q-from",
    kind: "short_text",
    prompt: "Leaving from",
    help: null,
    required: true,
    options: [],
    min_value: null,
    max_value: null,
    show_if: null,
  },
];

beforeEach(() => {
  submitAnswersByLinkActionMock.mockClear();
});

afterEach(() => setFormCapture(null));

function recorder() {
  const calls: [string, Record<string, string>][] = [];
  setFormCapture((event, properties) => {
    calls.push([event, properties]);
  });
  return calls;
}

describe("AnswersForm", () => {
  test("sends the token in the form with the answers", async () => {
    render(
      <AnswersForm token={TOKEN} questions={questions} initialAnswers={{}} />,
    );
    expect(
      screen.getByText("One question still needs an answer."),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /Leaving from/ }),
      "Denver",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save answers" }));

    expect(submitAnswersByLinkActionMock).toHaveBeenCalledTimes(1);
    const [formData] = submitAnswersByLinkActionMock.mock.calls[0];
    expect(formData.get("t")).toBe(TOKEN);
    expect(JSON.parse(String(formData.get("registrationAnswers")))).toEqual({
      "q-from": "Denver",
    });
    expect(
      await screen.findByText(/your answers are saved/),
    ).toBeInTheDocument();
  });

  test("a required question left blank is refused before it is sent", async () => {
    render(
      <AnswersForm
        token={TOKEN}
        questions={questions}
        initialAnswers={{ "q-from": "Boulder" }}
      />,
    );
    await userEvent.clear(
      screen.getByRole("textbox", { name: /Leaving from/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save answers" }));

    expect(submitAnswersByLinkActionMock).not.toHaveBeenCalled();
  });

  test("a link that died since the page loaded replaces the form", async () => {
    submitAnswersByLinkActionMock.mockImplementationOnce(async () => ({
      error: ANSWER_LINK_INVALID,
      linkInvalid: true,
    }));
    render(
      <AnswersForm token={TOKEN} questions={questions} initialAnswers={{}} />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Leaving from/ }),
      "Denver",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save answers" }));

    expect(await screen.findByText(ANSWER_LINK_INVALID)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save answers" }),
    ).not.toBeInTheDocument();
  });

  // #1713: the funnel, carrying the form's name and nothing of the link.
  test("sends the form funnel, and the refusal's code", async () => {
    const calls = recorder();
    submitAnswersByLinkActionMock.mockImplementationOnce(async () => ({
      error: ANSWER_LINK_INVALID,
      linkInvalid: true,
      code: "LINK_INVALID",
    }));
    render(
      <AnswersForm token={TOKEN} questions={questions} initialAnswers={{}} />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Leaving from/ }),
      "Denver",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save answers" }));
    await screen.findByText(ANSWER_LINK_INVALID);

    const form = { form: "registration_answers" };
    expect(calls).toEqual([
      ["form_viewed", form],
      ["form_started", form],
      ["form_submitted", form],
      ["form_failed", { ...form, error_code: "LINK_INVALID" }],
    ]);
  });

  test("a save is a completion", async () => {
    const calls = recorder();
    render(
      <AnswersForm token={TOKEN} questions={questions} initialAnswers={{}} />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Leaving from/ }),
      "Denver",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save answers" }));
    await screen.findByText(/your answers are saved/);

    expect(calls.at(-1)).toEqual([
      "form_completed",
      { form: "registration_answers" },
    ]);
  });
});
