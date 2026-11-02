import { describe, expect, test } from "bun:test";
import {
  computeDiscountValueOffered,
  computeEventImpactDerived,
  computeParticipantAssistance,
  computePeopleServed,
  countCheckedIn,
  countRentalSubsidies,
  countVolunteerParticipants,
} from "./impact-metrics";

describe("countVolunteerParticipants", () => {
  test("counts someone once when they both signed up and logged hours", () => {
    expect(
      countVolunteerParticipants(
        [{ event_id: "e1", person_id: "p1" }],
        [{ event_id: "e1", person_id: "p1" }],
      ),
    ).toBe(1);
  });

  test("counts a walk-up volunteer who only ever had hours logged", () => {
    expect(
      countVolunteerParticipants([], [{ event_id: "e1", person_id: "p1" }]),
    ).toBe(1);
  });

  test("counts a signup nobody logged hours for", () => {
    expect(
      countVolunteerParticipants([{ event_id: "e1", person_id: "p1" }], []),
    ).toBe(1);
  });

  test("counts the same person once per event, not once overall", () => {
    expect(
      countVolunteerParticipants(
        [
          { event_id: "e1", person_id: "p1" },
          { event_id: "e2", person_id: "p1" },
        ],
        [],
      ),
    ).toBe(2);
  });

  test("ignores rows with no person or no event", () => {
    expect(
      countVolunteerParticipants(
        [
          { event_id: "e1", person_id: null },
          { event_id: null, person_id: "p1" },
        ],
        [],
      ),
    ).toBe(0);
  });
});

describe("countCheckedIn", () => {
  test("ignores registrants who never checked in", () => {
    expect(
      countCheckedIn([
        { person_id: "p1", event_id: "e1", checked_in_at: "2026-01-01" },
        { person_id: "p2", event_id: "e1", checked_in_at: null },
      ]),
    ).toBe(1);
  });
});

describe("computeEventImpactDerived", () => {
  const registrations = [
    { person_id: "p1", event_id: "e1", checked_in_at: "2026-01-01" },
    { person_id: "p2", event_id: "e1", checked_in_at: "2026-01-01" },
    { person_id: "p3", event_id: "e1", checked_in_at: null },
  ];
  const checkinCounts = [
    { person_id: "p1", checked_in_event_count: 1 },
    { person_id: "p2", checked_in_event_count: 4 },
  ];

  const baseInput = {
    events: [{ event_id: "e1", attendance_count: 30 }],
    registrations,
    checkinCounts,
    eventVolunteers: [{ event_id: "e1", person_id: "v1" }],
    volunteerHourPeople: [],
    discountCodes: [
      { event_id: "e1", registration_id: "r1", kind: "rental", value: "45" },
    ],
    beginnerAttendees: [{ event_id: "e1", person_id: "p1" }],
    firstTimeAttendees: [{ event_id: "e1", person_id: "p2" }],
    assistanceExpenses: [{ event_id: "e1", amount: "100.00" }],
    profiledAttendees: [
      { event_id: "e1", person_id: "p1" },
      { event_id: "e1", person_id: "p2" },
    ],
    autoAssignDiscountCodes: false,
    offeredCodes: [],
    optionCounts: [],
    distributions: [
      {
        event_id: "e1",
        quantity: 2,
        recipient_person_id: "p1",
        inventory_item_id: "i1",
        face_value: "40.00",
      },
    ],
  };

  test("the typed headcount wins over check-ins, which stay as reference", () => {
    const result = computeEventImpactDerived(baseInput);
    expect(result.participants).toBe(30);
    expect(result.checkedIn).toBe(2);
  });

  test("falls back to check-ins only when no headcount was recorded", () => {
    const result = computeEventImpactDerived({
      ...baseInput,
      events: [{ event_id: "e1", attendance_count: null }],
    });
    expect(result.participants).toBe(2);
  });

  test("splits checked-in attendees into first-time and recurring", () => {
    const result = computeEventImpactDerived(baseInput);
    expect(result.firstTimeParticipants).toBe(1);
    expect(result.recurringParticipants).toBe(1);
  });

  test("nulls the restricted figures when the RPC withheld them", () => {
    const result = computeEventImpactDerived({
      ...baseInput,
      discountCodes: null,
      assistanceExpenses: null,
    });
    expect(result.discountCodesAssigned).toBeNull();
    expect(result.rentalSubsidies).toBeNull();
    expect(result.assistance).toBeNull();
    // Figures the viewer is allowed to see still compute.
    expect(result.participants).toBe(30);
  });

  test("includes people served from the event's distributions", () => {
    expect(computeEventImpactDerived(baseInput).peopleServed).toEqual({
      distributed: 2,
      recipients: 1,
      value: 40,
    });
  });

  test("carries the auto-assign flag so the card can caption the code count", () => {
    expect(
      computeEventImpactDerived({ ...baseInput, autoAssignDiscountCodes: true })
        .autoAssignDiscountCodes,
    ).toBe(true);
  });

  // #1588: the four typed figures, derived.
  test("derives rental subsidies and assistance", () => {
    const result = computeEventImpactDerived(baseInput);
    expect(result.rentalSubsidies).toBe(1);
    expect(result.assistance).toEqual({
      discountCodes: 45,
      distributions: 40,
      expenses: 100,
      total: 185,
    });
  });

  test("on an auto-assign event, codes are neither subsidy nor assistance", () => {
    const result = computeEventImpactDerived({
      ...baseInput,
      autoAssignDiscountCodes: true,
    });
    // Still counted as assigned, with the card's caveat beside it.
    expect(result.discountCodesAssigned).toBe(1);
    expect(result.rentalSubsidies).toBe(0);
    expect(result.assistance).toEqual({
      discountCodes: 0,
      distributions: 40,
      expenses: 100,
      total: 140,
    });
  });
});

describe("countRentalSubsidies", () => {
  const events = [
    { event_id: "e1", attendance_count: null },
    {
      event_id: "e2",
      attendance_count: null,
      auto_assign_discount_codes: true,
    },
  ];

  test("counts assigned rental codes only", () => {
    expect(
      countRentalSubsidies(
        [
          { event_id: "e1", registration_id: "r1", kind: "rental" },
          { event_id: "e1", registration_id: "r2", kind: "lift" },
          { event_id: "e1", registration_id: "r3", kind: null },
          { event_id: "e1", registration_id: null, kind: "rental" },
        ],
        events,
      ),
    ).toBe(1);
  });

  test("skips codes on an event that gives one to every registrant", () => {
    expect(
      countRentalSubsidies(
        [
          { event_id: "e1", registration_id: "r1", kind: "rental" },
          { event_id: "e2", registration_id: "r2", kind: "rental" },
        ],
        events,
      ),
    ).toBe(1);
  });
});

describe("computeParticipantAssistance", () => {
  const events = [
    { event_id: "e1", attendance_count: null },
    {
      event_id: "e2",
      attendance_count: null,
      auto_assign_discount_codes: true,
    },
  ];

  test("adds code values, value given out and paid assistance expenses", () => {
    expect(
      computeParticipantAssistance(
        [
          { event_id: "e1", registration_id: "r1", kind: "lift", value: 60 },
          {
            event_id: "e1",
            registration_id: "r2",
            kind: "rental",
            value: "45.50",
          },
          // No value recorded: counts as nothing, not NaN.
          { event_id: "e1", registration_id: "r3", kind: "rental" },
          // Unassigned: helped nobody yet.
          { event_id: "e1", registration_id: null, value: 99 },
          // Auto-assigned: not evidence of subsidy.
          { event_id: "e2", registration_id: "r4", value: 25 },
        ],
        events,
        80,
        [
          { event_id: "e1", amount: "120.00" },
          { event_id: "e2", amount: 30 },
        ],
      ),
    ).toEqual({
      discountCodes: 105.5,
      distributions: 80,
      expenses: 150,
      total: 335.5,
    });
  });

  test("is all zeroes with nothing recorded", () => {
    expect(computeParticipantAssistance([], [], 0, [])).toEqual({
      discountCodes: 0,
      distributions: 0,
      expenses: 0,
      total: 0,
    });
  });
});

describe("computePeopleServed", () => {
  test("sums units, counts each recipient once per event and each item's value once", () => {
    expect(
      computePeopleServed([
        // p1 received two items at e1: one person served there.
        {
          event_id: "e1",
          quantity: 1,
          recipient_person_id: "p1",
          inventory_item_id: "i1",
          face_value: "25.00",
        },
        {
          event_id: "e1",
          quantity: 1,
          recipient_person_id: "p1",
          inventory_item_id: "i2",
          face_value: 10,
        },
        // p1 again at e2 counts again, like participants.
        {
          event_id: "e2",
          quantity: 3,
          recipient_person_id: "p1",
          inventory_item_id: "i3",
          face_value: null,
        },
        // No recipient recorded: units given out, nobody counted.
        {
          event_id: "e2",
          quantity: "2",
          recipient_person_id: null,
          inventory_item_id: "i4",
          face_value: 5,
        },
        // A second movement of i1 does not count its value twice.
        {
          event_id: "e1",
          quantity: 1,
          recipient_person_id: "p2",
          inventory_item_id: "i1",
          face_value: "25.00",
        },
      ]),
    ).toEqual({ distributed: 8, recipients: 3, value: 40 });
  });

  test("is all zeroes with nothing distributed", () => {
    expect(computePeopleServed([])).toEqual({
      distributed: 0,
      recipients: 0,
      value: 0,
    });
  });

  test("tolerates rows from before recipients and values were returned", () => {
    expect(computePeopleServed([{ quantity: 4, event_id: "e1" }])).toEqual({
      distributed: 4,
      recipients: 0,
      value: 0,
    });
  });
});

describe("computeDiscountValueOffered", () => {
  // Chatter Snow's options: a ticket ($80), a ticket and gear ($130), and
  // their own gear (no price). Counts arrive only for registrations that did
  // not cancel -- the RPCs filter them -- so a cancelled party is simply absent.
  const TICKET = { option_id: "ticket", percent_off: "50", price: "80.00" };
  const BUNDLE = { option_id: "bundle", percent_off: 50, price: 130 };
  const counts = [
    {
      event_id: "e1",
      registration_id: "r1",
      option_id: "ticket",
      quantity: 2,
      price: "80.00",
    },
    {
      event_id: "e1",
      registration_id: "r1",
      option_id: "own",
      quantity: 1,
      price: null,
    },
    {
      event_id: "e1",
      registration_id: "r2",
      option_id: "bundle",
      quantity: 1,
      price: "130.00",
    },
  ];
  const registrations = [
    { person_id: "p1", event_id: "e1", checked_in_at: null },
    { person_id: "p2", event_id: "e1", checked_in_at: null },
  ];

  test("a shared code is summed over every registration's covered options", () => {
    const result = computeDiscountValueOffered(
      [
        {
          event_id: "e1",
          code_id: "c1",
          shared: true,
          registration_id: null,
          options: [TICKET, BUNDLE],
        },
      ],
      counts,
      registrations,
    );
    // 2 × $80 × 50% + 1 × $130 × 50%; "own gear" is not covered.
    expect(result).toEqual({
      shared: 145,
      singleUse: 0,
      total: 145,
      codes: [{ codeId: "c1", shared: true, value: 145, derived: true }],
    });
  });

  test("a single-use code counts only the registration holding it", () => {
    const result = computeDiscountValueOffered(
      [
        {
          event_id: "e1",
          code_id: "c2",
          shared: false,
          registration_id: "r2",
          options: [TICKET, BUNDLE],
        },
      ],
      counts,
      registrations,
    );
    expect(result.singleUse).toBe(65);
    expect(result.shared).toBe(0);
  });

  test("a bundled option is discounted on its whole copied price", () => {
    const result = computeDiscountValueOffered(
      [
        {
          event_id: "e1",
          code_id: "c3",
          shared: false,
          registration_id: "r2",
          // Today's price is $150; r2 copied $130 when it registered.
          options: [{ option_id: "bundle", percent_off: 100, price: 150 }],
        },
      ],
      counts,
      registrations,
    );
    expect(result.codes[0]).toEqual({
      codeId: "c3",
      shared: false,
      value: 130,
      derived: true,
    });
  });

  test("with no priced option a code falls back to its typed value, or none", () => {
    const own = { option_id: "own", percent_off: 50, price: null };
    const result = computeDiscountValueOffered(
      [
        {
          event_id: "e1",
          code_id: "typed-single",
          shared: false,
          registration_id: "r1",
          value: "25",
          options: [own],
        },
        {
          event_id: "e1",
          code_id: "typed-shared",
          shared: true,
          registration_id: null,
          value: 10,
          options: [],
        },
        {
          event_id: "e1",
          code_id: "nothing",
          shared: false,
          registration_id: "r2",
          value: null,
          options: [],
        },
      ],
      counts,
      registrations,
    );
    expect(result.codes).toEqual([
      { codeId: "typed-single", shared: false, value: 25, derived: false },
      // Once per registration that did not cancel.
      { codeId: "typed-shared", shared: true, value: 20, derived: false },
      { codeId: "nothing", shared: false, value: null, derived: false },
    ]);
    expect(result.total).toBe(45);
  });

  test("a cancelled registration's answer is not in the counts, so it adds nothing", () => {
    const result = computeDiscountValueOffered(
      [
        {
          event_id: "e1",
          code_id: "c4",
          shared: true,
          registration_id: null,
          options: [TICKET],
        },
      ],
      // r1 cancelled: only r2's bundle answer remains, which c4 doesn't cover.
      counts.filter((row) => row.registration_id !== "r1"),
      registrations.slice(1),
    );
    expect(result.shared).toBe(0);
    expect(result.codes[0].derived).toBe(true);
  });

  test("never adds to participant assistance", () => {
    const withoutOffer = computeEventImpactDerived({
      events: [{ event_id: "e1", attendance_count: null }],
      registrations,
      checkinCounts: [],
      eventVolunteers: [],
      volunteerHourPeople: [],
      discountCodes: [],
      autoAssignDiscountCodes: false,
      distributions: [],
      assistanceExpenses: [],
      offeredCodes: [],
      optionCounts: counts,
    });
    const withOffer = computeEventImpactDerived({
      events: [{ event_id: "e1", attendance_count: null }],
      registrations,
      checkinCounts: [],
      eventVolunteers: [],
      volunteerHourPeople: [],
      discountCodes: [],
      autoAssignDiscountCodes: false,
      distributions: [],
      assistanceExpenses: [],
      offeredCodes: [
        {
          event_id: "e1",
          code_id: "c1",
          shared: true,
          registration_id: null,
          options: [TICKET, BUNDLE],
        },
      ],
      optionCounts: counts,
    });
    expect(withOffer.discountValueOffered?.total).toBe(145);
    expect(withOffer.assistance).toEqual(withoutOffer.assistance);
    expect(withOffer.assistance?.total).toBe(0);
  });

  test("is null for a viewer who may not see discount data", () => {
    const result = computeEventImpactDerived({
      events: [],
      registrations: [],
      checkinCounts: [],
      eventVolunteers: [],
      volunteerHourPeople: [],
      discountCodes: null,
      autoAssignDiscountCodes: false,
      distributions: [],
      assistanceExpenses: null,
      offeredCodes: null,
      optionCounts: null,
    });
    expect(result.discountValueOffered).toBeNull();
  });
});
