import { describe, expect, test } from "bun:test";
import {
  computeFirstTimeParticipants,
  computeParticipants,
  computeProgramImpactRollup,
  countRepeatParticipants,
  countSubsidizedTickets,
  sumDistributedQuantity,
  sumVolunteerHours,
  toNumber,
} from "./impact-rollup";

describe("toNumber", () => {
  test("coerces numeric strings", () => {
    expect(toNumber("12.5")).toBe(12.5);
  });

  test("returns 0 for null", () => {
    expect(toNumber(null)).toBe(0);
  });

  test("returns 0 for non-numeric strings", () => {
    expect(toNumber("abc")).toBe(0);
  });
});

describe("sumDistributedQuantity", () => {
  test("sums quantity across rows", () => {
    const movements = [
      { quantity: 3, event_id: "e1" },
      { quantity: "2", event_id: "e1" },
    ];
    expect(sumDistributedQuantity(movements)).toBe(5);
  });

  test("returns 0 for an empty list", () => {
    expect(sumDistributedQuantity([])).toBe(0);
  });
});

describe("sumVolunteerHours", () => {
  test("sums numeric and string hours", () => {
    const hours = [
      { event_id: "e1", hours: 4 },
      { event_id: "e2", hours: "1.5" },
    ];
    expect(sumVolunteerHours(hours)).toBe(5.5);
  });

  test("treats a non-numeric hours value as 0", () => {
    expect(sumVolunteerHours([{ event_id: "e1", hours: "abc" }])).toBe(0);
  });
});

describe("countRepeatParticipants", () => {
  test("counts a person registered across 2 distinct events", () => {
    const registrations = [
      { person_id: "p1", event_id: "e1", checked_in_at: null },
      { person_id: "p1", event_id: "e2", checked_in_at: null },
    ];
    expect(countRepeatParticipants(registrations)).toBe(1);
  });

  test("does not count the same person/event pair twice as a repeat", () => {
    const registrations = [
      { person_id: "p1", event_id: "e1", checked_in_at: null },
      { person_id: "p1", event_id: "e1", checked_in_at: null },
    ];
    expect(countRepeatParticipants(registrations)).toBe(0);
  });

  test("ignores rows with no linked person", () => {
    const registrations = [
      { person_id: null, event_id: "e1", checked_in_at: null },
      { person_id: null, event_id: "e2", checked_in_at: null },
    ];
    expect(countRepeatParticipants(registrations)).toBe(0);
  });

  test("counts a person in 3 events once", () => {
    const registrations = [
      { person_id: "p1", event_id: "e1", checked_in_at: null },
      { person_id: "p1", event_id: "e2", checked_in_at: null },
      { person_id: "p1", event_id: "e3", checked_in_at: null },
    ];
    expect(countRepeatParticipants(registrations)).toBe(1);
  });
});

describe("computeParticipants", () => {
  test("uses attendance_count when set, ignoring checked-in registrations", () => {
    const events = [{ event_id: "e1", attendance_count: 25 }];
    const registrations = [
      {
        person_id: "p1",
        event_id: "e1",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
      {
        person_id: "p2",
        event_id: "e1",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
    ];
    expect(computeParticipants(events, registrations)).toBe(25);
  });

  test("falls back to the checked-in registration count when attendance_count is null", () => {
    const events = [{ event_id: "e1", attendance_count: null }];
    const registrations = [
      {
        person_id: "p1",
        event_id: "e1",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
      { person_id: "p2", event_id: "e1", checked_in_at: null },
      {
        person_id: "p3",
        event_id: "e1",
        checked_in_at: "2026-01-02T00:00:00Z",
      },
    ];
    expect(computeParticipants(events, registrations)).toBe(2);
  });

  test("uses 0 when attendance_count is explicitly 0, not the checked-in count", () => {
    const events = [{ event_id: "e1", attendance_count: 0 }];
    const registrations = [
      {
        person_id: "p1",
        event_id: "e1",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
    ];
    expect(computeParticipants(events, registrations)).toBe(0);
  });

  test("contributes 0 for an event with no attendance_count and no checked-in registrations", () => {
    const events = [{ event_id: "e1", attendance_count: null }];
    const registrations = [
      { person_id: "p1", event_id: "e1", checked_in_at: null },
    ];
    expect(computeParticipants(events, registrations)).toBe(0);
  });

  test("sums a mix of manual and checked-in-fallback events across the program", () => {
    const events = [
      { event_id: "e1", attendance_count: 25 },
      { event_id: "e2", attendance_count: null },
      { event_id: "e3", attendance_count: 0 },
    ];
    const registrations = [
      {
        person_id: "p1",
        event_id: "e1",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
      {
        person_id: "p2",
        event_id: "e2",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
      {
        person_id: "p3",
        event_id: "e2",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
      { person_id: "p4", event_id: "e2", checked_in_at: null },
      {
        person_id: "p5",
        event_id: "e3",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
    ];
    // e1: 25 (manual) + e2: 2 (checked-in) + e3: 0 (manual) = 27
    expect(computeParticipants(events, registrations)).toBe(27);
  });
});

describe("computeFirstTimeParticipants", () => {
  test("counts a person whose lifetime checked-in event count is 1", () => {
    const registrations = [
      {
        person_id: "p1",
        event_id: "e1",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
    ];
    const checkinCounts = [{ person_id: "p1", checked_in_event_count: 1 }];
    expect(computeFirstTimeParticipants(registrations, checkinCounts)).toBe(1);
  });

  test("does not count a person with more than one lifetime checked-in event", () => {
    const registrations = [
      {
        person_id: "p1",
        event_id: "e1",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
    ];
    const checkinCounts = [{ person_id: "p1", checked_in_event_count: 3 }];
    expect(computeFirstTimeParticipants(registrations, checkinCounts)).toBe(0);
  });

  test("ignores a registration with no linked person", () => {
    const registrations = [
      {
        person_id: null,
        event_id: "e1",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
    ];
    expect(computeFirstTimeParticipants(registrations, [])).toBe(0);
  });

  test("ignores a registration that was never checked in", () => {
    const registrations = [
      { person_id: "p1", event_id: "e1", checked_in_at: null },
    ];
    const checkinCounts = [{ person_id: "p1", checked_in_event_count: 1 }];
    expect(computeFirstTimeParticipants(registrations, checkinCounts)).toBe(0);
  });

  test("counts a person once even if they appear in multiple registration rows", () => {
    const registrations = [
      {
        person_id: "p1",
        event_id: "e1",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
      {
        person_id: "p1",
        event_id: "e2",
        checked_in_at: "2026-01-02T00:00:00Z",
      },
    ];
    const checkinCounts = [{ person_id: "p1", checked_in_event_count: 2 }];
    expect(computeFirstTimeParticipants(registrations, checkinCounts)).toBe(0);
  });
});

describe("countSubsidizedTickets", () => {
  test("counts discount codes assigned to a registration", () => {
    const codes = [
      { event_id: "e1", registration_id: "r1" },
      { event_id: "e1", registration_id: "r2" },
    ];
    expect(countSubsidizedTickets(codes)).toBe(2);
  });

  test("excludes unassigned discount codes", () => {
    const codes = [
      { event_id: "e1", registration_id: "r1" },
      { event_id: "e1", registration_id: null },
    ];
    expect(countSubsidizedTickets(codes)).toBe(1);
  });

  test("returns 0 for an empty list", () => {
    expect(countSubsidizedTickets([])).toBe(0);
  });
});

const EMPTY = {
  eventCount: 0,
  events: [],
  distributedMovements: [],
  volunteerHours: [],
  registrations: [],
  checkinCounts: [],
  discountCodes: [],
  eventVolunteers: [],
  volunteerHourPeople: [],
  beginnerAttendees: [],
  firstTimeAttendees: [],
  profiledAttendees: [],
  assistanceExpenses: [],
  offeredCodes: [],
  optionCounts: [],
};

describe("computeProgramImpactRollup", () => {
  test("aggregates all metrics from fixture rows", () => {
    const events = [
      { event_id: "e1", attendance_count: 12 },
      { event_id: "e2", attendance_count: null },
    ];
    const distributedMovements = [
      {
        quantity: 6,
        event_id: "e1",
        recipient_person_id: "p1",
        inventory_item_id: "i1",
        face_value: "30.00",
      },
      {
        quantity: 4,
        event_id: "e2",
        recipient_person_id: "p1",
        inventory_item_id: "i2",
        face_value: 20,
      },
    ];
    const volunteerHours = [
      { event_id: "e1", hours: 10 },
      { event_id: "e2", hours: "5.5" },
    ];
    const registrations = [
      { person_id: "p1", event_id: "e1", checked_in_at: null },
      {
        person_id: "p1",
        event_id: "e2",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
      { person_id: "p2", event_id: "e1", checked_in_at: null },
    ];
    const checkinCounts = [{ person_id: "p1", checked_in_event_count: 1 }];
    const discountCodes = [
      { event_id: "e1", registration_id: "r1", kind: "rental", value: "45" },
      { event_id: "e2", registration_id: null },
    ];
    const assistanceExpenses = [{ event_id: "e2", amount: "100" }];
    const firstTimeAttendees = [{ event_id: "e2", person_id: "p1" }];
    // p3 both signed up and logged hours on e1, so he counts once there.
    const eventVolunteers = [
      { event_id: "e1", person_id: "p3" },
      { event_id: "e2", person_id: "p4" },
    ];
    const volunteerHourPeople = [
      { event_id: "e1", person_id: "p3" },
      { event_id: "e1", person_id: "p5" },
    ];
    const beginnerAttendees = [{ event_id: "e2", person_id: "p1" }];
    const profiledAttendees = [
      { event_id: "e2", person_id: "p1" },
      { event_id: "e1", person_id: "p2" },
    ];
    // e2's shared code takes 50% off the $80 option p1's party of two chose.
    const offeredCodes = [
      {
        event_id: "e2",
        code_id: "shared-e2",
        shared: true,
        registration_id: null,
        options: [{ option_id: "o1", percent_off: "50", price: "80" }],
      },
    ];
    const optionCounts = [
      {
        event_id: "e2",
        registration_id: "r-p1",
        option_id: "o1",
        quantity: 2,
        price: "80.00",
      },
    ];

    expect(
      computeProgramImpactRollup({
        eventCount: 2,
        events,
        distributedMovements,
        volunteerHours,
        registrations,
        checkinCounts,
        discountCodes,
        eventVolunteers,
        volunteerHourPeople,
        beginnerAttendees,
        firstTimeAttendees,
        profiledAttendees,
        assistanceExpenses,
        offeredCodes,
        optionCounts,
      }),
    ).toEqual({
      eventCount: 2,
      participants: 13, // e1: 12 (manual) + e2: 1 (checked-in) = 13
      checkedIn: 1, // only p1 on e2 is marked in at the door
      firstTimeParticipants: 1, // p1's only checked-in event ever
      beginnerParticipants: 1,
      firstTimeOnSnow: 1,
      profiledAttendees: 2,
      volunteerParticipants: 3, // e1: p3 + p5 (p3 deduped across both sources), e2: p4
      assistedParticipants: 1, // the one assigned code; typed notes are archived (#1588)
      rentalSubsidies: 1,
      equipmentDistributed: 10,
      distributionRecipients: 2, // p1 at e1 and again at e2
      distributedValue: 50,
      volunteerHours: 15.5,
      // $45 code + $50 given out + $100 paid for participants.
      participantAssistance: {
        discountCodes: 45,
        distributions: 50,
        expenses: 100,
        total: 195,
      },
      // Offered, never added to assistance above.
      discountValueOffered: {
        shared: 80,
        singleUse: 0,
        total: 80,
        codes: [
          { codeId: "shared-e2", shared: true, value: 80, derived: true },
        ],
      },
      repeatParticipants: 1,
      placeReach: null,
    });
  });

  test("never counts codes on an event that auto-assigns them", () => {
    const result = computeProgramImpactRollup({
      ...EMPTY,
      eventCount: 2,
      events: [
        { event_id: "e1", attendance_count: null },
        {
          event_id: "e2",
          attendance_count: null,
          auto_assign_discount_codes: true,
        },
      ],
      discountCodes: [
        { event_id: "e1", registration_id: "r1", kind: "rental", value: 10 },
        { event_id: "e2", registration_id: "r2", kind: "rental", value: 10 },
      ],
    });
    expect(result.assistedParticipants).toBe(1);
    expect(result.rentalSubsidies).toBe(1);
    expect(result.participantAssistance.discountCodes).toBe(10);
  });

  test("an event with nothing recorded yet contributes 0 across the board", () => {
    const result = computeProgramImpactRollup({
      ...EMPTY,
      eventCount: 1,
      events: [{ event_id: "e1", attendance_count: null }],
    });
    expect(result.eventCount).toBe(1);
    expect(result.participants).toBe(0);
    expect(result.repeatParticipants).toBe(0);
  });
});
