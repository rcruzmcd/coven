import { describe, expect, test } from "bun:test";
import {
  EVENT_CARPOOL_NOTICE_MAX_LENGTH,
  carpoolNoticeMode,
  carpoolNoticeParagraphs,
  carpoolNoticeText,
  eventCarpoolNotice,
  eventCarpoolNoticeFromForm,
  answersChangedSince,
  carpoolAssignments,
  carpoolLine,
  isOverCapacity,
  paidCount,
  seatsFromAnswer,
  seatsUsed,
  unpaidOnly,
  type CarpoolCar,
  type CarpoolPassenger,
} from "./event-carpools";

function passenger(
  id: string,
  partySize = 1,
  paidAt: string | null = null,
): CarpoolPassenger {
  return {
    registrationId: id,
    name: `Rider ${id}`,
    partySize,
    answersChangedAt: null,
    addedAt: "2026-10-01T12:00:00Z",
    paidAt,
    paidByName: null,
  };
}

function car(overrides: Partial<CarpoolCar> = {}): CarpoolCar {
  return {
    id: "car-2",
    label: "Car 2",
    seats: 3,
    leavingFrom: null,
    notes: null,
    driver: {
      registrationId: "driver",
      name: "Driver",
      partySize: 1,
      answersChangedAt: null,
      assignedAt: "2026-10-01T12:00:00Z",
    },
    passengers: [],
    ...overrides,
  };
}

describe("seats", () => {
  test("a registration takes seats equal to its party size", () => {
    const full = car({ passengers: [passenger("a", 2), passenger("b", 1)] });
    expect(seatsUsed(full)).toBe(3);
    expect(isOverCapacity(full)).toBe(false);
    expect(
      isOverCapacity(
        car({ passengers: [passenger("a", 2), passenger("b", 2)] }),
      ),
    ).toBe(true);
  });
});

describe("paid", () => {
  test("counts passengers who have paid their driver", () => {
    expect(
      paidCount(
        car({
          passengers: [
            passenger("a", 1, "2026-10-02T00:00:00Z"),
            passenger("b"),
          ],
        }),
      ),
    ).toEqual({ paid: 1, total: 2 });
  });

  test("Unpaid keeps only the cars and passengers still to pay", () => {
    const paid = car({
      id: "car-1",
      passengers: [passenger("a", 1, "2026-10-02T00:00:00Z")],
    });
    const mixed = car({
      passengers: [passenger("b", 1, "2026-10-02T00:00:00Z"), passenger("c")],
    });
    const shown = unpaidOnly([paid, mixed]);
    expect(shown.map((row) => row.id)).toEqual(["car-2"]);
    expect(shown[0].passengers.map((row) => row.registrationId)).toEqual(["c"]);
  });
});

describe("carpoolLine", () => {
  const assignments = carpoolAssignments([
    car({
      passengers: [passenger("a", 1, "2026-10-02T00:00:00Z"), passenger("b")],
    }),
  ]);

  test("names the car and role, and paid for a passenger", () => {
    expect(carpoolLine(assignments.get("driver") ?? null)).toBe(
      "Car 2 · Driver",
    );
    expect(carpoolLine(assignments.get("a") ?? null)).toBe(
      "Car 2 · Passenger · Paid",
    );
    expect(carpoolLine(assignments.get("b") ?? null)).toBe("Car 2 · Passenger");
    expect(carpoolLine(assignments.get("nobody") ?? null)).toBe("Unassigned");
  });

  test("a car with no driver assigns nobody as one", () => {
    expect(carpoolAssignments([car({ driver: null })]).size).toBe(0);
  });
});

describe("answersChangedSince", () => {
  test("only answers changed after the assignment count", () => {
    expect(answersChangedSince(null, "2026-10-01T00:00:00Z")).toBe(false);
    expect(
      answersChangedSince("2026-09-30T00:00:00Z", "2026-10-01T00:00:00Z"),
    ).toBe(false);
    expect(
      answersChangedSince("2026-10-02T00:00:00Z", "2026-10-01T00:00:00Z"),
    ).toBe(true);
  });
});

describe("seatsFromAnswer", () => {
  const answers = [{ question_id: "seats", value: 4 }];

  test("reads the seats question's whole-number answer in range", () => {
    expect(seatsFromAnswer(answers, "seats")).toBe(4);
    expect(
      seatsFromAnswer([{ question_id: "seats", value: 3.7 }], "seats"),
    ).toBe(3);
  });

  test("asks instead when there is no question, answer or usable number", () => {
    expect(seatsFromAnswer(answers, null)).toBeNull();
    expect(seatsFromAnswer(answers, "other")).toBeNull();
    expect(
      seatsFromAnswer([{ question_id: "seats", value: 0 }], "seats"),
    ).toBeNull();
    expect(
      seatsFromAnswer([{ question_id: "seats", value: 20 }], "seats"),
    ).toBeNull();
    expect(
      seatsFromAnswer([{ question_id: "seats", value: "4" }], "seats"),
    ).toBeNull();
  });
});

describe("per-event carpool cost notice", () => {
  const ORG = ["Split gas with your driver."];

  test("null, or anything that is not paragraphs, is the organization's", () => {
    expect(eventCarpoolNotice(null, ORG)).toEqual(ORG);
    expect(eventCarpoolNotice(undefined, ORG)).toEqual(ORG);
    expect(eventCarpoolNotice("text", ORG)).toEqual(ORG);
    expect(eventCarpoolNotice([1, 2], ORG)).toEqual(ORG);
    expect(carpoolNoticeMode(null)).toBe("organization");
  });

  test("an empty list hides it; paragraphs replace it", () => {
    expect(eventCarpoolNotice([], ORG)).toEqual([]);
    expect(carpoolNoticeMode([])).toBe("hidden");
    expect(eventCarpoolNotice(["Free ride."], ORG)).toEqual(["Free ride."]);
    expect(carpoolNoticeMode(["Free ride."])).toBe("custom");
  });

  test("the form's three choices", () => {
    expect(eventCarpoolNoticeFromForm("organization", "ignored")).toEqual({
      data: null,
    });
    expect(eventCarpoolNoticeFromForm("hidden", "ignored")).toEqual({
      data: [],
    });
    expect(
      eventCarpoolNoticeFromForm("custom", " One.\n\n\n  Two.\nstill two "),
    ).toEqual({ data: ["One.", "Two.\nstill two"] });
    expect(eventCarpoolNoticeFromForm("custom", "  \n\n ")).toHaveProperty(
      "error",
    );
    expect(
      eventCarpoolNoticeFromForm(
        "custom",
        "x".repeat(EVENT_CARPOOL_NOTICE_MAX_LENGTH + 1),
      ),
    ).toHaveProperty("error");
  });

  test("text and paragraphs round-trip", () => {
    const paragraphs = ["One.", "Two."];
    expect(carpoolNoticeParagraphs(carpoolNoticeText(paragraphs))).toEqual(
      paragraphs,
    );
  });
});
