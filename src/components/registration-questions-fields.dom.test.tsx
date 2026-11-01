import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AnswerDraft,
  RegistrationQuestion,
} from "@/lib/registration-questions";
import { RegistrationQuestionsFields } from "./registration-questions-fields";

const question = (
  fields: Partial<RegistrationQuestion> &
    Pick<RegistrationQuestion, "id" | "kind" | "prompt">,
): RegistrationQuestion => ({
  help: null,
  required: false,
  options: [],
  min_value: null,
  max_value: null,
  show_if: null,
  ...fields,
});

// #1742. A level with a hint and a retired option, and a mountain with
// "Other".
const level = question({
  id: "level",
  kind: "single_choice",
  prompt: "Ski level",
  options: [
    { id: "first", label: "First time" },
    { id: "beginner", label: "Beginner", hint: "Linking turns on greens" },
    { id: "old", label: "Old level", archived: true },
  ],
});
const days = question({
  id: "days",
  kind: "multi_choice",
  prompt: "Days",
  options: [
    { id: "sat", label: "Saturday", hint: "Lessons in the morning" },
    { id: "sun", label: "Sunday", archived: true },
  ],
});
const mountain = question({
  id: "mountain",
  kind: "single_choice",
  prompt: "Preferred mountain",
  options: [
    { id: "hunter", label: "Hunter" },
    { id: "belleayre", label: "Belleayre" },
  ],
  allow_other: true,
});

let latest: AnswerDraft = {};
function Harness({
  questions,
  initial,
}: {
  questions: RegistrationQuestion[];
  initial: AnswerDraft;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <RegistrationQuestionsFields
      idPrefix="test"
      questions={questions}
      draft={draft}
      onChange={(next) => {
        latest = next;
        setDraft(next);
      }}
    />
  );
}

async function optionsOf(name: string) {
  await userEvent.setup().click(screen.getByRole("combobox", { name }));
  return within(await screen.findByRole("listbox"))
    .getAllByRole("option")
    .map((option) => option.textContent);
}

describe("RegistrationQuestionsFields (#1742)", () => {
  test("a hint reads under its option; an archived option is not offered", async () => {
    render(<Harness questions={[level, days]} initial={{ days: [] }} />);

    expect(await optionsOf("Ski level")).toEqual([
      "First time",
      "BeginnerLinking turns on greens",
    ]);
    expect(screen.getByText("Lessons in the morning")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Sunday" })).toBeNull();
  });

  test("an answer that already chose an archived option keeps it", async () => {
    render(
      <Harness
        questions={[level, days]}
        initial={{ level: "old", days: ["sun"] }}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Sunday" })).toBeChecked();
    expect(await optionsOf("Ski level")).toContain("Old level");
  });

  test("Other opens a short text, sent as {other}", async () => {
    const user = userEvent.setup();
    render(<Harness questions={[mountain]} initial={{}} />);

    await user.click(
      screen.getByRole("combobox", { name: "Preferred mountain" }),
    );
    await user.click(await screen.findByRole("option", { name: "Other" }));
    await user.type(
      screen.getByRole("textbox", { name: "Preferred mountain: other" }),
      "Jay Peak",
    );

    expect(latest).toEqual({ mountain: { other: "Jay Peak" } });
  });
});
