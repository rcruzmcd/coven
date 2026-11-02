import { describe, expect, test } from "bun:test";
import {
  answerBreakdown,
  type AnswerBreakdownData,
} from "./person-answer-breakdown";

const levels = [
  { id: "l1", key: "first_time", label: "First time" },
  { id: "l2", key: "beginner", label: "Beginner" },
  { id: "l3", key: "advanced", label: "Advanced" },
  { id: "l4", label: "Expert", archived: true },
];

const data: AnswerBreakdownData = {
  registrations: 6,
  questions: [
    {
      id: "disc",
      kind: "single_choice",
      prompt: "Do you ski or ride?",
      column_label: "Discipline",
      options: [
        { id: "d1", label: "Ski" },
        { id: "d2", label: "Snowboard" },
        { id: "d3", label: "Both" },
      ],
      parent_question_id: null,
    },
    {
      id: "ski",
      kind: "single_choice",
      prompt: "Your ski level?",
      column_label: null,
      options: levels,
      parent_question_id: "disc",
    },
  ],
  counts: [
    {
      question_id: "disc",
      option_id: "d1",
      parent_option_id: null,
      registrations: 3,
    },
    {
      question_id: "disc",
      option_id: "d3",
      parent_option_id: null,
      registrations: 1,
    },
    {
      question_id: "disc",
      option_id: null,
      parent_option_id: null,
      registrations: 1,
    },
    {
      question_id: "ski",
      option_id: "l2",
      parent_option_id: "d1",
      registrations: 2,
    },
    {
      question_id: "ski",
      option_id: "l1",
      parent_option_id: "d1",
      registrations: 1,
    },
    {
      question_id: "ski",
      option_id: "l3",
      parent_option_id: "d3",
      registrations: 1,
    },
  ],
  answered: { disc: 5, ski: 4 },
};

describe("answerBreakdown", () => {
  const [discipline, ski] = answerBreakdown(data);

  test("a question not nested is one group in option order, zeros kept, Other last", () => {
    expect(discipline.heading).toBe("Discipline");
    expect(discipline.answered).toBe(5);
    expect(discipline.groups).toHaveLength(1);
    expect(discipline.groups[0].rows).toEqual([
      { id: "d1", label: "Ski", registrations: 3 },
      { id: "d2", label: "Snowboard", registrations: 0 },
      { id: "d3", label: "Both", registrations: 1 },
      { id: "other", label: "Other", registrations: 1 },
    ]);
  });

  test("a conditional question nests under the parent options it was answered with", () => {
    expect(ski.parentHeading).toBe("Discipline");
    expect(
      ski.groups.map((group) => [group.label, group.registrations]),
    ).toEqual([
      ["Ski", 3],
      ["Both", 1],
    ]);
    expect(ski.groups[0].rows).toEqual([
      { id: "l1", label: "First time", registrations: 1 },
      { id: "l2", label: "Beginner", registrations: 2 },
      { id: "l3", label: "Advanced", registrations: 0 },
    ]);
  });

  test("an archived option shows only where chosen, a removed one under one row", () => {
    const [, nested] = answerBreakdown({
      ...data,
      counts: [
        ...data.counts,
        {
          question_id: "ski",
          option_id: "l4",
          parent_option_id: "d1",
          registrations: 1,
        },
        {
          question_id: "ski",
          option_id: "gone",
          parent_option_id: "d1",
          registrations: 2,
        },
      ],
    });
    const labels = nested.groups[0].rows.map((row) => row.label);
    expect(labels).toContain("Expert");
    expect(labels.at(-1)).toBe("An option since removed");
    expect(nested.groups[1].rows.map((row) => row.label)).not.toContain(
      "Expert",
    );
  });

  test("a multi choice group carries no sum", () => {
    const [, multi] = answerBreakdown({
      ...data,
      questions: [
        data.questions[0],
        { ...data.questions[1], kind: "multi_choice" },
      ],
    });
    expect(multi.groups[0].registrations).toBeNull();
  });
});
