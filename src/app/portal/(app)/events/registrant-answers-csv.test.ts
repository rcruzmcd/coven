import { describe, expect, test } from "bun:test";
import {
  csvField,
  registrantAnswersCsv,
  registrantAnswersCsvFilename,
  sharesContact,
  type AnswersCsvQuestion,
  type AnswersCsvRegistration,
} from "./registrant-answers-csv";

const GETTING_THERE: AnswersCsvQuestion = {
  id: "q-getting-there",
  prompt: "Getting there",
  shares_contact: false,
};
const LEAVING_FROM: AnswersCsvQuestion = {
  id: "q-leaving-from",
  prompt: "Leaving from",
  shares_contact: false,
};
const SHARE: AnswersCsvQuestion = {
  id: "q-share",
  prompt: "OK to share my contact details with our partner",
  shares_contact: true,
};

function registration(
  overrides: Partial<AnswersCsvRegistration> = {},
): AnswersCsvRegistration {
  return {
    name: "Jamie Rivera",
    party_size: 2,
    email: "jamie@example.test",
    phone: "555-0100",
    instagram_handle: "jamie.rides",
    answers: [],
    ...overrides,
  };
}

function lines(csv: string): string[] {
  return csv.split("\r\n").slice(0, -1);
}

describe("csvField", () => {
  test("leaves plain text alone and blanks null", () => {
    expect(csvField("Burlington")).toBe("Burlington");
    expect(csvField(3)).toBe("3");
    expect(csvField(null)).toBe("");
  });

  test("quotes commas, quotes and line breaks", () => {
    expect(csvField("Smith, Jo")).toBe('"Smith, Jo"');
    expect(csvField('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvField("one\ntwo")).toBe('"one\ntwo"');
    expect(csvField("one\r\ntwo")).toBe('"one\r\ntwo"');
  });

  test("neutralises anything a spreadsheet would run as a formula", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+1 555 0100")).toBe("'+1 555 0100");
    expect(csvField("-5")).toBe("'-5");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("\tx")).toBe("'\tx");
    // Quoted as well when it also needs quoting.
    expect(csvField('=1,"2"')).toBe('"\'=1,""2"""');
  });
});

describe("registrantAnswersCsv", () => {
  test("a column per question, blank where unanswered, no email or phone without a sharing question", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE, LEAVING_FROM],
      [
        registration({
          answers: [
            {
              question_id: GETTING_THERE.id,
              answer_text: "Need a ride",
              value: "opt-ride",
            },
            {
              question_id: LEAVING_FROM.id,
              answer_text: "Burlington, VT",
              value: "Burlington, VT",
            },
          ],
        }),
        registration({ name: "Sam Lee", party_size: 1 }),
      ],
    );

    expect(lines(csv)).toEqual([
      "Name,Party size,Getting there,Leaving from,Answers changed,Instagram,Preferred contact",
      'Jamie Rivera,2,Need a ride,"Burlington, VT",,jamie.rides,',
      "Sam Lee,1,,,,jamie.rides,",
    ]);
    expect(csv).not.toContain("jamie@example.test");
    expect(csv).not.toContain("555-0100");
  });

  test("email and phone only on rows that ticked the sharing question; Instagram on every row", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE, SHARE],
      [
        registration({
          answers: [{ question_id: SHARE.id, answer_text: "Yes", value: true }],
        }),
        registration({
          name: "Declined",
          email: "declined@example.test",
          phone: "555-0199",
          instagram_handle: "declined.ig",
          answers: [{ question_id: SHARE.id, answer_text: "No", value: false }],
        }),
        registration({
          name: "Never asked",
          email: "never@example.test",
          phone: null,
        }),
      ],
    );

    expect(lines(csv)).toEqual([
      "Name,Party size,Getting there,OK to share my contact details with our partner,Answers changed,Instagram,Preferred contact,Email,Phone,Contact detail",
      "Jamie Rivera,2,,Yes,,jamie.rides,,jamie@example.test,555-0100,",
      "Declined,2,,No,,declined.ig,,,,",
      "Never asked,2,,,,jamie.rides,,,,",
    ]);
  });

  test("the preferred contact method on every row, its detail only where sharing was ticked (#1647)", () => {
    const noInstagram = {
      instagram_handle: null,
      preferred_contact_method: "text",
      preferred_contact_detail: "555-0142",
    };
    const csv = registrantAnswersCsv(
      [SHARE],
      [
        registration({
          ...noInstagram,
          answers: [{ question_id: SHARE.id, answer_text: "Yes", value: true }],
        }),
        registration({
          ...noInstagram,
          name: "Declined",
          answers: [{ question_id: SHARE.id, answer_text: "No", value: false }],
        }),
      ],
    );
    expect(lines(csv).slice(1)).toEqual([
      "Jamie Rivera,2,Yes,,,Text message,jamie@example.test,555-0100,555-0142",
      "Declined,2,No,,,Text message,,,",
    ]);
  });

  test("no contact detail at all without a sharing question (#1647)", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE],
      [
        registration({
          instagram_handle: null,
          preferred_contact_method: "whatsapp",
          preferred_contact_detail: "555-0142",
        }),
      ],
    );
    expect(lines(csv)[1]).toBe("Jamie Rivera,2,,,,WhatsApp");
    expect(csv).not.toContain("555-0142");
  });

  test("when the registrant last changed their answers, blank where they never have (#1591)", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE],
      [
        registration({ answers_changed_at: "2026-10-12T15:04:05.000Z" }),
        registration({ name: "Sam Lee", answers_changed_at: null }),
      ],
    );
    expect(lines(csv).slice(1)).toEqual([
      "Jamie Rivera,2,,2026-10-12T15:04:05.000Z,jamie.rides,",
      "Sam Lee,2,,,jamie.rides,",
    ]);
  });

  test("answers to archived questions stay out of the file", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE],
      [
        registration({
          answers: [
            {
              question_id: "q-archived",
              answer_text: "Old answer",
              value: "Old answer",
            },
          ],
        }),
      ],
    );

    expect(csv).not.toContain("Old answer");
  });

  test("escapes names and answers typed by the public", () => {
    const csv = registrantAnswersCsv(
      [LEAVING_FROM],
      [
        registration({
          name: '=cmd|"/c calc"!A1',
          answers: [
            {
              question_id: LEAVING_FROM.id,
              answer_text: "Main St\nApt 2",
              value: "Main St\nApt 2",
            },
          ],
        }),
      ],
    );

    expect(csv).toContain('"\'=cmd|""/c calc""!A1",2,"Main St\nApt 2"');
  });
});

describe("sharesContact", () => {
  test("a declined sharing question beats a ticked one", () => {
    const second = { ...SHARE, id: "q-share-2" };
    expect(
      sharesContact(
        [SHARE, second],
        registration({
          answers: [
            { question_id: SHARE.id, answer_text: "Yes", value: true },
            { question_id: second.id, answer_text: "No", value: false },
          ],
        }),
      ),
    ).toBe(false);
  });
});

// #1746. The rider profile's three columns became one per profile question.
describe("registrantAnswersCsv profile columns", () => {
  const DISCIPLINE = {
    id: "pq-discipline",
    prompt: "Do you ski or ride?",
    column_label: "Rides",
    snapshot_at_checkin: true,
  };
  const MOUNTAIN = {
    id: "pq-mountain",
    prompt: "Which mountain do you usually ride?",
    column_label: null,
    snapshot_at_checkin: false,
  };

  test("one column per question, after the questions and before contact", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE, SHARE],
      [
        registration({
          answers: [{ question_id: SHARE.id, answer_text: "Yes", value: true }],
          profile: {
            snapshots: [],
            answers: [
              { question_id: DISCIPLINE.id, answer_text: "Both" },
              { question_id: MOUNTAIN.id, answer_text: "Hunter" },
            ],
          },
        }),
        registration({ name: "Sam Lee", party_size: 1 }),
      ],
      { profileQuestions: [DISCIPLINE, MOUNTAIN] },
    );

    expect(lines(csv)).toEqual([
      "Name,Party size,Getting there,OK to share my contact details with our partner,Answers changed,Rides,Which mountain do you usually ride?,Instagram,Preferred contact,Email,Phone,Contact detail",
      "Jamie Rivera,2,,Yes,,Both,Hunter,jamie.rides,,jamie@example.test,555-0100,",
      "Sam Lee,1,,,,,,jamie.rides,,,,",
    ]);
  });

  // The rule every figure reads: a snapshotted question as of check-in where
  // the registration was snapshotted; anything else as it stands now.
  test("a snapshotted question reads the check-in snapshot first", () => {
    const csv = registrantAnswersCsv(
      [],
      [
        registration({
          profile: {
            snapshots: [
              { question_id: DISCIPLINE.id, answer_text: "Snowboard" },
            ],
            answers: [
              { question_id: DISCIPLINE.id, answer_text: "Both" },
              { question_id: MOUNTAIN.id, answer_text: "Hunter" },
            ],
          },
        }),
      ],
      { profileQuestions: [DISCIPLINE, MOUNTAIN] },
    );
    expect(lines(csv)[1]).toBe("Jamie Rivera,2,,Snowboard,Hunter,jamie.rides,");
  });

  test("left out without profile questions, whatever the rows carry", () => {
    const csv = registrantAnswersCsv(
      [GETTING_THERE],
      [
        registration({
          profile: {
            snapshots: [],
            answers: [{ question_id: DISCIPLINE.id, answer_text: "Both" }],
          },
        }),
      ],
    );
    expect(lines(csv)[0]).toBe(
      "Name,Party size,Getting there,Answers changed,Instagram,Preferred contact",
    );
    expect(csv).not.toContain("Both");
  });
});

describe("registrantAnswersCsvFilename", () => {
  test("slugs the event name to ASCII", () => {
    expect(
      registrantAnswersCsvFilename("Café Night: Spring!", "2026-10-01"),
    ).toBe("cafe-night-spring-answers-2026-10-01.csv");
    expect(registrantAnswersCsvFilename("★★★", "2026-10-01")).toBe(
      "event-answers-2026-10-01.csv",
    );
  });
});
