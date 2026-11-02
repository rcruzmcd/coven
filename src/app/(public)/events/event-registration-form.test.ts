import { describe, expect, test } from "bun:test";
import {
  checkRegistrationWindow,
  parseEventRegistrationForm,
} from "./event-registration-form";
import {
  MINOR_CONTACTS_REQUIRED_ERROR,
  MINORS_ASKED_FIELD,
  PARTY_INCLUDES_MINOR_REQUIRED_ERROR,
} from "@/lib/minors";
import { PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";

/**
 * The minors question is required wherever it is asked (#685), and it is
 * asked on every tenant that has not turned it off (#1416), so every case
 * that expects a *parse* rather than an error has to answer it. Defaulted to
 * asked-and-"no" here rather than added to two dozen call sites, and
 * overridable per case — the cases that are about the question itself pass
 * their own value.
 */
function formData(fields: Record<string, string>) {
  const fd = new FormData();
  fd.set(MINORS_ASKED_FIELD, "on");
  fd.set("partyIncludesMinor", "no");
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseEventRegistrationForm", () => {
  test("requires a name", () => {
    expect(
      parseEventRegistrationForm(formData({ email: "jane@example.com" })),
    ).toEqual({
      error: "Name is required.",
      field: "name",
    });
  });

  test("requires a valid email", () => {
    expect(parseEventRegistrationForm(formData({ name: "Jane" }))).toEqual({
      error: "A valid email is required.",
      field: "email",
    });
    expect(
      parseEventRegistrationForm(
        formData({ name: "Jane", email: "not-an-email" }),
      ),
    ).toEqual({ error: "A valid email is required.", field: "email" });
  });

  test("defaults party size to 1", () => {
    const result = parseEventRegistrationForm(
      formData({ name: "Jane", email: "jane@example.com" }),
    );
    expect("data" in result && result.data.party_size).toBe(1);
  });

  test("rejects a party size below 1", () => {
    expect(
      parseEventRegistrationForm(
        formData({ name: "Jane", email: "jane@example.com", partySize: "0" }),
      ),
    ).toEqual({
      error: "Party size must be at least 1.",
      field: "partySize",
    });
  });

  test("rejects a non-integer party size", () => {
    expect(
      parseEventRegistrationForm(
        formData({ name: "Jane", email: "jane@example.com", partySize: "2.5" }),
      ),
    ).toEqual({
      error: "Party size must be at least 1.",
      field: "partySize",
    });
  });

  test("reads a ticked waiver box and the version it was shown with", () => {
    const result = parseEventRegistrationForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        waiverAccepted: "on",
        waiverVersion: "4",
      }),
    );

    expect(result).toMatchObject({
      data: { waiver_accepted: true, waiver_version: 4 },
    });
  });

  // The parser deliberately refuses nothing here: it cannot know whether this
  // tenant has a waiver in force, and a second opinion would be one able to
  // disagree with the RPC's, which is the one that binds.
  test("an unticked box parses, and is not an error", () => {
    const result = parseEventRegistrationForm(
      formData({ name: "Jane", email: "jane@example.com", waiverVersion: "4" }),
    );

    expect(result).toMatchObject({
      data: { waiver_accepted: false, waiver_version: 4 },
    });
  });

  test("a version that is not a plain positive integer reads as absent", () => {
    for (const waiverVersion of ["0", "-1", "1.5", "02", "two", ""]) {
      expect(
        parseEventRegistrationForm(
          formData({ name: "Jane", email: "jane@example.com", waiverVersion }),
        ),
      ).toMatchObject({ data: { waiver_version: null } });
    }
  });

  test("parses valid input", () => {
    const result = parseEventRegistrationForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        instagramHandle: "@jane.doe",
        pronouns: "  she/her  ",
        partySize: "3",
        notes: "Bringing kids",
        attendedBefore: "yes",
      }),
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        instagram_handle: "jane.doe",
        has_no_instagram: null,
        preferred_contact_method: null,
        preferred_contact_detail: null,
        pronouns: "she/her",
        party_size: 3,
        notes: "Bringing kids",
        attended_before: true,
        // Nothing was shown, so nothing was ticked. The parser reports what
        // the form sent and leaves the deciding to the RPC (#686).
        waiver_accepted: false,
        waiver_version: null,
        adults_only_confirmed: false,
        party_includes_minor: false,
        accompanying_adult_name: null,
        accompanying_adult_phone: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        // No question on the form, so no answer to send (#1407).
        option_counts: null,
        // Nor event questions (#1501).
        answers: null,
      },
    });
  });

  test("collects an answer to the registration question per option (#1407)", () => {
    const result = parseEventRegistrationForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        partySize: "3",
        partyIncludesMinor: "no",
        "optionCount.a": "2",
        "optionCount.b": "1",
        "optionCount.c": "",
      }),
    );
    if ("error" in result) throw new Error(result.error);
    // Blank is none, and the sum is left for the RPC, which knows whether
    // the event asks at all.
    expect(result.data.option_counts).toEqual({ a: 2, b: 1, c: 0 });
  });

  test("carries the event's question answers as one JSON field (#1501)", () => {
    const base = {
      name: "Jane",
      email: "jane@example.com",
      partyIncludesMinor: "no",
    };
    const result = parseEventRegistrationForm(
      formData({
        ...base,
        registrationAnswers: JSON.stringify({ q1: "opt", q2: true }),
      }),
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.data.answers).toEqual({ q1: "opt", q2: true });

    // Not an object: a client that did not use the module, refused on the
    // step the questions are on.
    expect(
      parseEventRegistrationForm(
        formData({ ...base, registrationAnswers: "[1]" }),
      ),
    ).toMatchObject({ field: "answers" });
  });

  // #1376 removed the box, the parser's `photo_consent` field and
  // `parsePhotoConsent` with it. This is the wire guard: nothing a browser
  // sends can put an answer back on the registration, because nothing here
  // reads the field at all. Under #599 a `photoConsent` of `"on"` produced a
  // stored `true`; a form with no affirmative control must not be able to
  // produce one, however it is posted.
  test("a photoConsent field in the FormData is ignored entirely", () => {
    for (const photoConsent of ["on", "off", "true", "yes"]) {
      const result = parseEventRegistrationForm(
        formData({
          name: "Jane",
          email: "jane@example.com",
          photoConsent,
        }),
      );

      expect(result).toHaveProperty("data");
      expect("data" in result && result.data).not.toHaveProperty(
        "photo_consent",
      );
      expect(JSON.stringify(result)).not.toMatch(/photo/i);
    }
  });

  // #1259. Three states, and the third is the common one: the question is
  // optional, so most rows will carry null and nothing may read that as "no".
  test("leaves the been-before answer null when it is not given", () => {
    const result = parseEventRegistrationForm(
      formData({ name: "Jane", email: "jane@example.com" }),
    );
    expect("data" in result && result.data.attended_before).toBe(null);
  });

  test("reads a first-timer's answer as false, not as unanswered", () => {
    const result = parseEventRegistrationForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        attendedBefore: "no",
      }),
    );
    expect("data" in result && result.data.attended_before).toBe(false);
  });

  // A hand-crafted post is the only way to get here, and there is no answer to
  // salvage from it: anything the form did not offer is no answer at all.
  test("treats an unrecognised been-before value as unanswered", () => {
    const result = parseEventRegistrationForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        attendedBefore: "maybe",
      }),
    );
    expect("data" in result && result.data.attended_before).toBe(null);
  });

  test("leaves pronouns null when the field is blank", () => {
    const result = parseEventRegistrationForm(
      formData({ name: "Jane", email: "jane@example.com", pronouns: "   " }),
    );
    expect("data" in result && result.data.pronouns).toBe(null);
  });

  test("rejects pronouns over the column length", () => {
    expect(
      parseEventRegistrationForm(
        formData({
          name: "Jane",
          email: "jane@example.com",
          pronouns: "x".repeat(41),
        }),
      ),
    ).toEqual({ error: PRONOUNS_TOO_LONG_ERROR, field: "pronouns" });
  });

  test("rejects an invalid Instagram handle", () => {
    expect(
      parseEventRegistrationForm(
        formData({
          name: "Jane",
          email: "jane@example.com",
          instagramHandle: "not valid!",
        }),
      ),
    ).toEqual({
      error:
        "An Instagram handle can only contain letters, numbers, periods and underscores.",
      field: "instagramHandle",
    });
  });

  // #685. The question is required here and only here: the column and the RPC
  // both keep a third "nobody was asked" state, for the rows this form never
  // wrote.
  test("requires an answer about anyone under 18", () => {
    const fd = formData({ name: "Jane", email: "jane@example.com" });
    fd.set("partyIncludesMinor", "");
    expect(parseEventRegistrationForm(fd)).toEqual({
      error: PARTY_INCLUDES_MINOR_REQUIRED_ERROR,
      field: "partyIncludesMinor",
    });
  });

  test("a value the form never offered is not an answer", () => {
    for (const answer of ["maybe", "true", "1", "  "]) {
      const fd = formData({ name: "Jane", email: "jane@example.com" });
      fd.set("partyIncludesMinor", answer);
      expect(parseEventRegistrationForm(fd)).toEqual({
        error: PARTY_INCLUDES_MINOR_REQUIRED_ERROR,
        field: "partyIncludesMinor",
      });
    }
  });

  test("a yes needs all four contacts", () => {
    const complete = {
      name: "Jane",
      email: "jane@example.com",
      partyIncludesMinor: "yes",
      accompanyingAdultName: "Jane Doe",
      accompanyingAdultPhone: "555-1234",
      emergencyContactName: "Sam Doe",
      emergencyContactPhone: "555-9876",
    };
    for (const missing of [
      "accompanyingAdultName",
      "accompanyingAdultPhone",
      "emergencyContactName",
      "emergencyContactPhone",
    ]) {
      expect(
        parseEventRegistrationForm(formData({ ...complete, [missing]: "   " })),
      ).toEqual({
        error: MINOR_CONTACTS_REQUIRED_ERROR,
        field: "minorContacts",
      });
    }

    expect(parseEventRegistrationForm(formData(complete))).toMatchObject({
      data: {
        party_includes_minor: true,
        accompanying_adult_name: "Jane Doe",
        accompanying_adult_phone: "555-1234",
        emergency_contact_name: "Sam Doe",
        emergency_contact_phone: "555-9876",
      },
    });
  });

  // Somebody who ticked yes, filled the block in and changed their mind. The
  // form stops sending the fields, and the parser would not read them anyway:
  // nobody agreed to give a guardian's number for a party that has none.
  test("a no stores no contacts, whatever was sent with it", () => {
    expect(
      parseEventRegistrationForm(
        formData({
          name: "Jane",
          email: "jane@example.com",
          partyIncludesMinor: "no",
          accompanyingAdultName: "Jane Doe",
          emergencyContactPhone: "555-9876",
        }),
      ),
    ).toMatchObject({
      data: {
        party_includes_minor: false,
        accompanying_adult_name: null,
        accompanying_adult_phone: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
      },
    });
  });
});

// #1416. A tenant with the question off: the form sends no marker, nothing
// is required, and anything sent anyway is dropped.
describe("parseEventRegistrationForm, question not asked", () => {
  function notAsked(fields: Record<string, string>) {
    const fd = formData(fields);
    fd.delete(MINORS_ASKED_FIELD);
    fd.delete("partyIncludesMinor");
    return fd;
  }

  test("parses without an answer", () => {
    expect(
      parseEventRegistrationForm(
        notAsked({ name: "Jane", email: "jane@example.com" }),
      ),
    ).toMatchObject({
      data: {
        party_includes_minor: null,
        accompanying_adult_name: null,
        emergency_contact_phone: null,
      },
    });
  });

  test("ignores an answer and contacts sent anyway", () => {
    expect(
      parseEventRegistrationForm(
        notAsked({
          name: "Jane",
          email: "jane@example.com",
          partyIncludesMinor: "yes",
          accompanyingAdultName: "Jane Doe",
          emergencyContactPhone: "555-9876",
        }),
      ),
    ).toMatchObject({
      data: {
        party_includes_minor: null,
        accompanying_adult_name: null,
        emergency_contact_phone: null,
      },
    });
  });
});

describe("checkRegistrationWindow", () => {
  test("rejects when registration is not enabled", () => {
    expect(
      checkRegistrationWindow({
        registration_enabled: false,
        registration_deadline: null,
        starts_at: "2099-01-01T00:00:00Z",
        ends_at: null,
      }),
    ).toEqual({
      open: false,
      reason: "Registration is not open for this event.",
    });
  });

  test("rejects once the deadline has passed", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(
      checkRegistrationWindow(
        {
          registration_enabled: true,
          registration_deadline: "2026-08-22T00:00:00Z",
          starts_at: "2099-01-01T00:00:00Z",
          ends_at: null,
        },
        now,
      ),
    ).toEqual({
      open: false,
      reason: "The registration deadline for this event has passed.",
    });
  });

  test("is open when enabled with no deadline", () => {
    expect(
      checkRegistrationWindow({
        registration_enabled: true,
        registration_deadline: null,
        starts_at: "2099-01-01T00:00:00Z",
        ends_at: null,
      }),
    ).toEqual({
      open: true,
    });
  });

  test("is open before the deadline", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(
      checkRegistrationWindow(
        {
          registration_enabled: true,
          registration_deadline: "2026-08-24T00:00:00Z",
          starts_at: "2099-01-01T00:00:00Z",
          ends_at: null,
        },
        now,
      ),
    ).toEqual({ open: true });
  });
  test("rejects once the event is over, even with no deadline", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(
      checkRegistrationWindow(
        {
          registration_enabled: true,
          registration_deadline: null,
          starts_at: "2026-08-21T18:00:00Z",
          ends_at: "2026-08-21T22:00:00Z",
        },
        now,
      ),
    ).toEqual({ open: false, reason: "This event has already happened." });
  });

  test("stays open while the event is running", () => {
    const now = new Date("2026-08-21T20:00:00Z");
    expect(
      checkRegistrationWindow(
        {
          registration_enabled: true,
          registration_deadline: null,
          starts_at: "2026-08-21T18:00:00Z",
          ends_at: "2026-08-21T22:00:00Z",
        },
        now,
      ),
    ).toEqual({ open: true });
  });
});
