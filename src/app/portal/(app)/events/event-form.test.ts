import { describe, expect, test } from "bun:test";
import { GROUP_CHAT_LABEL_MAX_LENGTH } from "@/lib/registration-group-chat";
import {
  DEFAULT_REMINDER_INTRO,
  REMINDER_INTRO_MAX_LENGTH,
} from "@/lib/event-reminders";
import {
  parseEventAttendanceForm,
  parseEventForm,
  CONFIRMATION_NOTE_MAX_LENGTH,
  parseEventPlanningForm,
  parseEventRegistrantEmailsForm,
  parseEventRegistrationForm,
  parseEventRegistrationOptionsField,
  parseEventReportForm,
  REGISTRATION_OPTIONS_SAVE_ERRORS,
} from "./event-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validFields = {
  name: "Winter Fest",
  startsAt: "2026-12-01T10:00",
  timezone: "America/Denver",
  visibility: "public",
  status: "draft",
};

describe("parseEventForm", () => {
  test("parses valid input", () => {
    const result = parseEventForm(formData(validFields));
    expect("data" in result && result.data.name).toBe("Winter Fest");
    expect("data" in result && result.data.visibility).toBe("public");
  });

  test("requires a name", () => {
    expect(parseEventForm(formData({ ...validFields, name: "" }))).toEqual({
      error: "Event name is required.",
    });
  });

  test("requires a start date", () => {
    expect(parseEventForm(formData({ ...validFields, startsAt: "" }))).toEqual({
      error: "Start date and time are required.",
    });
  });

  test("requires a timezone", () => {
    expect(parseEventForm(formData({ ...validFields, timezone: "" }))).toEqual({
      error: "Timezone is required.",
    });
  });

  test("rejects an invalid visibility", () => {
    expect(
      parseEventForm(formData({ ...validFields, visibility: "hidden" })),
    ).toEqual({
      error: "Select a valid visibility.",
    });
  });

  test("rejects an invalid status", () => {
    expect(
      parseEventForm(formData({ ...validFields, status: "unknown" })),
    ).toEqual({
      error: "Select a valid status.",
    });
  });

  test("accepts the widened lifecycle statuses", () => {
    for (const status of [
      "draft",
      "published",
      "cancelled",
      "archived",
    ] as const) {
      const result = parseEventForm(formData({ ...validFields, status }));
      expect("data" in result && result.data.status).toBe(status);
    }
  });

  test("programs are optional", () => {
    const result = parseEventForm(formData(validFields));
    expect("data" in result && result.data.programIds).toEqual([]);
  });

  test("carries a selected program", () => {
    const fd = formData(validFields);
    fd.append("programIds", "11111111-1111-1111-1111-111111111111");
    const result = parseEventForm(fd);
    expect("data" in result && result.data.programIds).toEqual([
      "11111111-1111-1111-1111-111111111111",
    ]);
  });

  test("carries every selected program, since an event can count toward more than one", () => {
    const fd = formData(validFields);
    fd.append("programIds", "11111111-1111-1111-1111-111111111111");
    fd.append("programIds", "22222222-2222-2222-2222-222222222222");
    const result = parseEventForm(fd);
    expect("data" in result && result.data.programIds).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  test("flier URL is optional", () => {
    const result = parseEventForm(formData(validFields));
    expect("data" in result && result.data.flierUrl).toBeNull();
  });

  test("carries a flier URL", () => {
    const result = parseEventForm(
      formData({
        ...validFields,
        flierUrl: "https://drive.google.com/file/d/abc123/view",
      }),
    );
    expect("data" in result && result.data.flierUrl).toBe(
      "https://drive.google.com/file/d/abc123/view",
    );
  });

  test("rejects an end time before the start time", () => {
    const result = parseEventForm(
      formData({ ...validFields, endsAt: "2026-12-01T09:00" }),
    );
    expect(result).toEqual({ error: "End time must be after the start time." });
  });

  test("accepts an end time after the start time", () => {
    const result = parseEventForm(
      formData({ ...validFields, endsAt: "2026-12-01T12:00" }),
    );
    expect("data" in result && result.data.endsAt).not.toBeNull();
  });
});

describe("parseEventAttendanceForm", () => {
  test("allows an empty attendance count", () => {
    expect(parseEventAttendanceForm(formData({}))).toEqual({
      data: { attendanceCount: null, attendanceNotes: null },
    });
  });

  test("rejects a negative attendance count", () => {
    expect(
      parseEventAttendanceForm(formData({ attendanceCount: "-1" })),
    ).toEqual({
      error: "Attendance must be a whole number of 0 or more.",
    });
  });

  test("rejects a non-integer attendance count", () => {
    expect(
      parseEventAttendanceForm(formData({ attendanceCount: "3.2" })),
    ).toEqual({
      error: "Attendance must be a whole number of 0 or more.",
    });
  });

  test("parses a valid attendance count", () => {
    expect(
      parseEventAttendanceForm(
        formData({ attendanceCount: "42", attendanceNotes: "Great turnout" }),
      ),
    ).toEqual({
      data: { attendanceCount: 42, attendanceNotes: "Great turnout" },
    });
  });
});

describe("parseEventRegistrationForm", () => {
  // Postgres-shaped timestamps, as the action reads them off the event row.
  const eventDates = {
    startsAt: "2026-12-01T17:00:00+00:00",
    endsAt: "2026-12-01T21:00:00+00:00",
  };

  test("allows all-empty registration fields", () => {
    expect(parseEventRegistrationForm(formData({}), eventDates)).toEqual({
      data: {
        capacity: null,
        registrationEnabled: false,
        registrationDeadline: null,
        autoAssignDiscountCodes: false,
        // Not sent, so left as it was (#1417, #1782).
        minimumAge: undefined,
        groupChatEnabled: null,
        groupChatLabel: undefined,
        carpoolsEnabled: null,
        carpoolSeatsQuestionId: undefined,
        carpoolCostNotice: undefined,
      },
    });
  });

  test("reads the age requirement (#1782)", () => {
    const parse = (value: string) =>
      parseEventRegistrationForm(formData({ minimumAge: value }), eventDates);
    expect(parse("18")).toMatchObject({ data: { minimumAge: 18 } });
    expect(parse("21")).toMatchObject({ data: { minimumAge: 21 } });
    expect(parse("")).toMatchObject({ data: { minimumAge: null } });
    expect(parse("16")).toMatchObject({ data: { minimumAge: null } });
  });

  test("reads the carpools switch and the seats question (#1649)", () => {
    const parse = (fields: Record<string, string>) =>
      parseEventRegistrationForm(formData(fields), eventDates);
    expect(
      parse({ carpoolsEnabled: "on", carpoolSeatsQuestionId: " q-1 " }),
    ).toMatchObject({
      data: { carpoolsEnabled: true, carpoolSeatsQuestionId: "q-1" },
    });
    // Blank is "typed for each car".
    expect(
      parse({ carpoolsEnabled: "off", carpoolSeatsQuestionId: "" }),
    ).toMatchObject({
      data: { carpoolsEnabled: false, carpoolSeatsQuestionId: null },
    });
  });

  test("reads the group chat switch and its label (#1648)", () => {
    const parse = (fields: Record<string, string>) =>
      parseEventRegistrationForm(formData(fields), eventDates);
    expect(
      parse({ groupChatEnabled: "on", groupChatLabel: "  Instagram chat " }),
    ).toMatchObject({
      data: { groupChatEnabled: true, groupChatLabel: "Instagram chat" },
    });
    expect(
      parse({ groupChatEnabled: "off", groupChatLabel: "  " }),
    ).toMatchObject({
      data: { groupChatEnabled: false, groupChatLabel: null },
    });
    expect(
      parse({ groupChatLabel: "x".repeat(GROUP_CHAT_LABEL_MAX_LENGTH + 1) }),
    ).toEqual({
      error: `Group chat name must be ${GROUP_CHAT_LABEL_MAX_LENGTH} characters or fewer.`,
    });
  });

  test("leaves the settings other cards save alone (#1777)", () => {
    const result = parseEventRegistrationForm(
      formData({
        confirmationNote: "Bring gloves.",
        reminderEnabled: "on",
      }),
      eventDates,
    );
    for (const key of ["confirmationNote", "reminderEnabled"]) {
      expect("data" in result && result.data).not.toHaveProperty(key);
    }
  });

  test("rejects a negative capacity", () => {
    expect(
      parseEventRegistrationForm(formData({ capacity: "-5" }), eventDates),
    ).toEqual({
      error: "Capacity must be a whole number of 0 or more.",
    });
  });

  test("parses valid registration fields", () => {
    const result = parseEventRegistrationForm(
      formData({ capacity: "50", registrationEnabled: "on" }),
      eventDates,
    );
    expect("data" in result && result.data.capacity).toBe(50);
    expect("data" in result && result.data.registrationEnabled).toBe(true);
  });

  test("leaves the lead and budget to the Planning card (#1778)", () => {
    const result = parseEventRegistrationForm(
      formData({ eventLeadId: "person-1", budgetAmount: "100" }),
      eventDates,
    );
    expect("data" in result && result.data).not.toHaveProperty("eventLeadId");
    expect("data" in result && result.data).not.toHaveProperty("budgetAmount");
  });

  test("rejects a deadline after the event end", () => {
    expect(
      parseEventRegistrationForm(
        formData({
          registrationEnabled: "on",
          registrationDeadline: "2026-12-01T21:00:00.001Z",
        }),
        eventDates,
      ),
    ).toEqual({
      error: "Registration deadline must be on or before the event's end date.",
    });
  });

  test("accepts a deadline exactly at the event end", () => {
    const result = parseEventRegistrationForm(
      formData({
        registrationEnabled: "on",
        registrationDeadline: "2026-12-01T21:00:00.000Z",
      }),
      eventDates,
    );
    expect("data" in result && result.data.registrationDeadline).toBe(
      "2026-12-01T21:00:00.000Z",
    );
  });

  test("falls back to the start date when the event has no end", () => {
    const noEnd = { startsAt: eventDates.startsAt, endsAt: null };
    expect(
      parseEventRegistrationForm(
        formData({
          registrationEnabled: "on",
          registrationDeadline: "2026-12-01T18:00:00.000Z",
        }),
        noEnd,
      ),
    ).toEqual({
      error:
        "Registration deadline must be on or before the event's start date.",
    });
    const result = parseEventRegistrationForm(
      formData({
        registrationEnabled: "on",
        registrationDeadline: "2026-12-01T16:00:00.000Z",
      }),
      noEnd,
    );
    expect("data" in result && result.data.registrationDeadline).toBe(
      "2026-12-01T16:00:00.000Z",
    );
  });

  test("clears the deadline when registration is disabled", () => {
    const result = parseEventRegistrationForm(
      formData({ registrationDeadline: "2026-11-20T17:00:00.000Z" }),
      eventDates,
    );
    expect("data" in result && result.data.registrationEnabled).toBe(false);
    expect("data" in result && result.data.registrationDeadline).toBeNull();
  });

  test("rejects an unparseable deadline", () => {
    expect(
      parseEventRegistrationForm(
        formData({
          registrationEnabled: "on",
          registrationDeadline: "not-a-date",
        }),
        eventDates,
      ),
    ).toEqual({ error: "Enter a valid registration deadline." });
  });
});

describe("parseEventPlanningForm (#1778)", () => {
  test("allows an empty lead and budget", () => {
    expect(parseEventPlanningForm(formData({}))).toEqual({
      data: { eventLeadId: null, budgetAmount: null },
    });
  });

  test("parses a lead and budget, and nothing else", () => {
    expect(
      parseEventPlanningForm(
        formData({
          eventLeadId: " person-1 ",
          budgetAmount: "1200.50",
          capacity: "50",
        }),
      ),
    ).toEqual({ data: { eventLeadId: "person-1", budgetAmount: 1200.5 } });
  });

  test("rejects a negative budget", () => {
    expect(parseEventPlanningForm(formData({ budgetAmount: "-100" }))).toEqual({
      error: "Budget must be a positive number.",
    });
  });
});

describe("parseEventReportForm", () => {
  test("allows all-empty report fields", () => {
    expect(parseEventReportForm(formData({}))).toEqual({
      data: {
        feedbackNotes: null,
        contentNotes: null,
      },
    });
  });

  test("parses report fields", () => {
    expect(
      parseEventReportForm(
        formData({ feedbackNotes: "Loved the ability groups" }),
      ),
    ).toEqual({
      data: {
        feedbackNotes: "Loved the ability groups",
        contentNotes: null,
      },
    });
  });
});

describe("parseEventRegistrationOptionsField (#1407)", () => {
  const field = (value: unknown) =>
    parseEventRegistrationOptionsField(JSON.stringify(value));

  test("not sent is null, so the save leaves the question alone", () => {
    expect(parseEventRegistrationOptionsField(null)).toBeNull();
  });

  test("keeps order, ids and caps; blank cap is uncapped", () => {
    expect(
      field({
        prompt: " What do you need? ",
        options: [
          { id: "opt-1", label: " Own gear ", cap: "" },
          { id: null, label: "Need a ticket", cap: "10" },
        ],
      }),
    ).toEqual({
      data: {
        prompt: "What do you need?",
        options: [
          { id: "opt-1", label: "Own gear", cap: null, price: null },
          { id: null, label: "Need a ticket", cap: 10, price: null },
        ],
      },
    });
  });

  test("reads a price to the cent; blank is no price (#1589)", () => {
    expect(
      field({
        prompt: "What do you need?",
        options: [
          { id: "t", label: "Ticket", cap: "", price: "80" },
          { id: "b", label: "Ticket and gear", cap: "", price: "129.999" },
          { id: "o", label: "Own gear", cap: "", price: " " },
        ],
      }),
    ).toEqual({
      data: {
        prompt: "What do you need?",
        options: [
          { id: "t", label: "Ticket", cap: null, price: 80 },
          { id: "b", label: "Ticket and gear", cap: null, price: 130 },
          { id: "o", label: "Own gear", cap: null, price: null },
        ],
      },
    });
    expect(
      field({ prompt: "Q", options: [{ label: "A", price: "-5" }] }),
    ).toEqual({
      error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_INVALID,
    });
  });

  test("no options clears the prompt with them", () => {
    expect(field({ prompt: "Anything", options: [] })).toEqual({
      data: { prompt: null, options: [] },
    });
  });

  test("refuses what the RPC would", () => {
    expect(field({ prompt: "", options: [{ label: "A" }] })).toEqual({
      error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_PROMPT_REQUIRED,
    });
    expect(field({ prompt: "Q", options: [{ label: " " }] })).toEqual({
      error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_INVALID,
    });
    expect(
      field({ prompt: "Q", options: [{ label: "A", cap: "-1" }] }),
    ).toEqual({
      error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_INVALID,
    });
    expect(
      field({ prompt: "Q", options: [{ label: "Same" }, { label: "same" }] }),
    ).toEqual({
      error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_DUPLICATE,
    });
    expect(
      field({
        prompt: "Q",
        options: Array.from({ length: 11 }, (_, i) => ({ label: `O${i}` })),
      }),
    ).toEqual({
      error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_TOO_MANY,
    });
    expect(parseEventRegistrationOptionsField("not json")).toEqual({
      error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_INVALID,
    });
  });
});

describe("parseEventRegistrantEmailsForm (#1779)", () => {
  const parse = (fields: Record<string, string>) =>
    parseEventRegistrantEmailsForm(
      formData({ reminderDaysBefore: "3", ...fields }),
    );

  test("reads the confirmation email note", () => {
    expect(
      parse({ confirmationNote: "  Use code SNOW10 at checkout.  " }),
    ).toMatchObject({
      data: { confirmationNote: "Use code SNOW10 at checkout." },
    });
    expect(parse({ confirmationNote: "   " })).toMatchObject({
      data: { confirmationNote: null },
    });
    expect(
      parse({ confirmationNote: "x".repeat(CONFIRMATION_NOTE_MAX_LENGTH + 1) }),
    ).toEqual({
      error: `Confirmation email note must be ${CONFIRMATION_NOTE_MAX_LENGTH} characters or fewer.`,
    });
  });

  test("reads the reminder switch, days and intro (#1652)", () => {
    expect(
      parse({
        reminderEnabled: "on",
        reminderDaysBefore: "3",
        reminderIntro: "  See you on the hill. ",
      }),
    ).toMatchObject({
      data: {
        reminderEnabled: true,
        reminderDaysBefore: 3,
        reminderIntro: "See you on the hill.",
      },
    });
    // The prefilled default, saved unchanged, and a blank both store null.
    expect(
      parse({ reminderEnabled: "off", reminderIntro: DEFAULT_REMINDER_INTRO }),
    ).toMatchObject({ data: { reminderEnabled: false, reminderIntro: null } });
    expect(parse({ reminderIntro: "  " })).toMatchObject({
      data: { reminderIntro: null },
    });
    for (const days of ["0", "15", "2.5", "two", ""]) {
      expect(parse({ reminderDaysBefore: days })).toEqual({
        error: "Reminder days must be a whole number from 1 to 14.",
      });
    }
    expect(
      parse({ reminderIntro: "x".repeat(REMINDER_INTRO_MAX_LENGTH + 1) }),
    ).toEqual({
      error: `Reminder intro must be ${REMINDER_INTRO_MAX_LENGTH} characters or fewer.`,
    });
  });
});

describe("parseEventRegistrationForm: carpool cost notice", () => {
  const eventDates = {
    startsAt: "2026-12-01T17:00:00+00:00",
    endsAt: "2026-12-01T21:00:00+00:00",
  };
  function notice(fields: Record<string, string>) {
    const result = parseEventRegistrationForm(formData(fields), eventDates);
    return "data" in result ? result.data.carpoolCostNotice : result;
  }

  test("each choice becomes what the column stores", () => {
    expect(notice({ carpoolNoticeMode: "organization" })).toBeNull();
    expect(notice({ carpoolNoticeMode: "hidden" })).toEqual([]);
    expect(
      notice({ carpoolNoticeMode: "custom", carpoolNoticeText: "A.\n\nB." }),
    ).toEqual(["A.", "B."]);
  });

  test("a blank custom notice or an unknown choice is refused", () => {
    expect(
      notice({ carpoolNoticeMode: "custom", carpoolNoticeText: " " }),
    ).toHaveProperty("error");
    expect(notice({ carpoolNoticeMode: "other" })).toHaveProperty("error");
  });
});
