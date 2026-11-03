import { describe, expect, test } from "bun:test";
import {
  carpoolAssignmentLines,
  carpoolMateContact,
  carpoolMateName,
  resolveCarpoolAssignmentRecipients,
  toCarpoolAssignment,
  toRegistrantCarpool,
  type CarpoolAssignment,
} from "./carpool-assignment";

const RAW = {
  car_label: "Car 2",
  leaving_from: "Union Square",
  role: "passenger",
  party_size: 1,
  driver: {
    first_name: "Dana",
    instagram_handle: "dana.drives",
    has_no_instagram: false,
    party_size: 1,
  },
  riders: [
    {
      first_name: "Pat",
      instagram_handle: null,
      has_no_instagram: true,
      party_size: 3,
    },
  ],
};

describe("toRegistrantCarpool", () => {
  test("reads a card off the wire", () => {
    expect(toRegistrantCarpool({ car: RAW })).toEqual({
      car: {
        carLabel: "Car 2",
        leavingFrom: "Union Square",
        role: "passenger",
        partySize: 1,
        driver: {
          firstName: "Dana",
          instagramHandle: "dana.drives",
          hasNoInstagram: false,
          partySize: 1,
        },
        riders: [
          {
            firstName: "Pat",
            instagramHandle: null,
            hasNoInstagram: true,
            partySize: 3,
          },
        ],
      },
      notice: null,
    });
  });

  test("not in a car yet is a view with no car; carpools off is no view", () => {
    expect(toRegistrantCarpool({ car: null })).toEqual({
      car: null,
      notice: null,
    });
    expect(toRegistrantCarpool({ car: null, notice: ["Split gas."] })).toEqual({
      car: null,
      notice: ["Split gas."],
    });
    expect(toRegistrantCarpool({ car: null, notice: [] })).toEqual({
      car: null,
      notice: [],
    });
    expect(toRegistrantCarpool(null)).toBeNull();
    expect(toCarpoolAssignment({ role: "driver" })).toBeNull();
  });
});

describe("a car-mate", () => {
  const dana = toCarpoolAssignment(RAW)!.driver!;
  const pat = toCarpoolAssignment(RAW)!.riders[0];

  test("is a first name, with the party where it is over one", () => {
    expect(carpoolMateName(dana)).toBe("Dana");
    expect(carpoolMateName(pat)).toBe("Pat (party of 3)");
    expect(carpoolMateName({ ...dana, firstName: null })).toBe("Someone");
  });

  test("is reached by handle, or through the organization", () => {
    expect(carpoolMateContact(dana, "Chatter Snow")).toBe("@dana.drives");
    expect(carpoolMateContact(pat, "Chatter Snow")).toBe(
      "No Instagram — ask Chatter Snow to connect you",
    );
  });
});

describe("carpoolAssignmentLines", () => {
  test("a passenger's lines name the driver and the other riders", () => {
    const car = toCarpoolAssignment(RAW)!;
    expect(carpoolAssignmentLines(car, "Chatter Snow")).toEqual([
      { label: "Car", value: "Car 2" },
      { label: "Leaving from", value: "Union Square" },
      { label: "Your role", value: "You're a passenger" },
      { label: "Driver", value: "Dana · @dana.drives" },
      {
        label: "Also riding",
        value:
          "Pat (party of 3) · No Instagram — ask Chatter Snow to connect you",
      },
    ]);
  });

  test("a driver's lines have no driver line and say who rides with them", () => {
    const car: CarpoolAssignment = {
      ...toCarpoolAssignment(RAW)!,
      role: "driver",
      driver: null,
      leavingFrom: null,
      riders: [],
    };
    expect(carpoolAssignmentLines(car, "Org")).toEqual([
      { label: "Car", value: "Car 2" },
      { label: "Your role", value: "You're driving" },
      { label: "Riding with you", value: "Nobody else yet" },
    ]);
  });
});

describe("resolveCarpoolAssignmentRecipients", () => {
  const rows = [
    { registrationId: "a", hasEmail: true, changed: true },
    { registrationId: "b", hasEmail: true, changed: false },
    { registrationId: "c", hasEmail: false, changed: true },
  ];

  test("everyone with an address, or only those whose car changed", () => {
    expect(resolveCarpoolAssignmentRecipients(rows, "everyone")).toEqual({
      recipients: [rows[0], rows[1]],
      withoutAddress: 1,
    });
    expect(resolveCarpoolAssignmentRecipients(rows, "changed")).toEqual({
      recipients: [rows[0]],
      withoutAddress: 1,
    });
  });
});
