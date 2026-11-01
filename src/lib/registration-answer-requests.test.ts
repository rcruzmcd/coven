import { describe, expect, test } from "bun:test";
import {
  answerRequestState,
  describeAnswerRequests,
  MAX_ANSWER_REQUEST_RECIPIENTS,
  RECENTLY_ASKED_MS,
  registrationAnswersRequestDedupeKey,
  resolveAnswerRequests,
  wasAskedRecently,
  type AnswerRequestCandidate,
} from "./registration-answer-requests";
import {
  outboundMessageSenderLabel,
  REGISTRATION_ANSWERS_REQUEST_KIND,
} from "./outbound-messages";
import type { RegistrationQuestion } from "./registration-questions";

function question(
  overrides: Partial<RegistrationQuestion> & Pick<RegistrationQuestion, "id">,
): RegistrationQuestion {
  return {
    kind: "short_text",
    prompt: overrides.id,
    help: null,
    required: false,
    options: [],
    min_value: null,
    max_value: null,
    show_if: null,
    ...overrides,
  };
}

const gettingThere = question({
  id: "getting",
  kind: "single_choice",
  required: true,
  options: [
    { id: "drive", label: "Driving" },
    { id: "ride", label: "Need a ride" },
  ],
});
const seats = question({
  id: "seats",
  kind: "number",
  required: true,
  show_if: { any: [{ question_id: "getting", option_ids: ["drive"] }] },
});
const leavingFrom = question({ id: "from" });
const QUESTIONS = [gettingThere, seats, leavingFrom];

const NOW = Date.parse("2026-10-01T12:00:00Z");

let next = 0;
function registration(
  overrides: Partial<AnswerRequestCandidate> = {},
): AnswerRequestCandidate {
  next += 1;
  return {
    id: `reg-${next}`,
    name: `Person ${next}`,
    email: `person${next}@example.org`,
    person_id: null,
    answers: [],
    answer_request: null,
    ...overrides,
  };
}

describe("resolveAnswerRequests", () => {
  test("asks only registrations missing a required answer they were shown", () => {
    const missing = registration();
    const answered = registration({
      answers: [{ question_id: "getting", value: "ride" }],
    });
    // A driver has a second required question revealed and unanswered.
    const driverWithoutSeats = registration({
      answers: [{ question_id: "getting", value: "drive" }],
    });

    const resolved = resolveAnswerRequests(
      [missing, answered, driverWithoutSeats],
      QUESTIONS,
      { includeRecent: false, now: NOW },
    );

    expect(resolved.recipients.map((r) => r.registrationId)).toEqual([
      missing.id,
      driverWithoutSeats.id,
    ]);
  });

  test("an optional question left blank asks nobody", () => {
    const resolved = resolveAnswerRequests([registration()], [leavingFrom], {
      includeRecent: false,
      now: NOW,
    });
    expect(resolved.recipients).toEqual([]);
  });

  test("counts, rather than drops, a registration with no address", () => {
    const resolved = resolveAnswerRequests(
      [registration({ email: "" }), registration({ email: null })],
      QUESTIONS,
      { includeRecent: false, now: NOW },
    );
    expect(resolved.recipients).toEqual([]);
    expect(resolved.withoutAddress).toBe(2);
  });

  test("skips anyone asked in the last day unless told to include them", () => {
    const recent = registration({
      answer_request: {
        requested_at: new Date(NOW - RECENTLY_ASKED_MS + 1000).toISOString(),
        answered_at: null,
      },
    });
    const longAgo = registration({
      answer_request: {
        requested_at: new Date(NOW - RECENTLY_ASKED_MS - 1000).toISOString(),
        answered_at: null,
      },
    });

    const skipping = resolveAnswerRequests([recent, longAgo], QUESTIONS, {
      includeRecent: false,
      now: NOW,
    });
    expect(skipping.recipients.map((r) => r.registrationId)).toEqual([
      longAgo.id,
    ]);
    expect(skipping.recentlyAsked).toBe(1);

    const including = resolveAnswerRequests([recent, longAgo], QUESTIONS, {
      includeRecent: true,
      now: NOW,
    });
    expect(including.recipients).toHaveLength(2);
    expect(including.recentlyAsked).toBe(0);
  });

  test("keeps a repeated address: each link opens one registration", () => {
    const resolved = resolveAnswerRequests(
      [
        registration({ email: "same@example.org" }),
        registration({ email: "SAME@example.org" }),
      ],
      QUESTIONS,
      { includeRecent: false, now: NOW },
    );
    expect(resolved.recipients).toHaveLength(2);
  });

  test("stops at the cap and counts the rest for next time", () => {
    const many = Array.from({ length: MAX_ANSWER_REQUEST_RECIPIENTS + 3 }, () =>
      registration(),
    );
    const resolved = resolveAnswerRequests(many, QUESTIONS, {
      includeRecent: false,
      now: NOW,
    });
    expect(resolved.recipients).toHaveLength(MAX_ANSWER_REQUEST_RECIPIENTS);
    expect(resolved.recipients[0].registrationId).toBe(many[0].id);
    expect(resolved.overCap).toBe(3);
  });
});

describe("describeAnswerRequests", () => {
  test("leads with the count and accounts for everyone left out", () => {
    expect(
      describeAnswerRequests({
        recipients: [
          {
            registrationId: "a",
            name: "A",
            email: "a@example.org",
            personId: null,
          },
        ],
        overCap: 0,
        withoutAddress: 2,
        recentlyAsked: 1,
      }),
    ).toBe(
      "This will email 1 registrant missing a required answer; 1 was asked in the last 24 hours; 2 have no email address.",
    );
    expect(
      describeAnswerRequests({
        recipients: [],
        overCap: 0,
        withoutAddress: 0,
        recentlyAsked: 0,
      }),
    ).toBe("This will email nobody.");
  });
});

describe("answerRequestState", () => {
  test("nothing for a registration never asked", () => {
    expect(answerRequestState(null)).toBeNull();
  });

  test("asked until answers arrive, answered after", () => {
    expect(
      answerRequestState({
        requested_at: "2026-10-01T10:00:00Z",
        answered_at: null,
      }),
    ).toEqual({ state: "asked", at: "2026-10-01T10:00:00Z" });
    expect(
      answerRequestState({
        requested_at: "2026-10-01T10:00:00Z",
        answered_at: "2026-10-01T11:00:00Z",
      }),
    ).toEqual({ state: "answered", at: "2026-10-01T11:00:00Z" });
  });

  test("asked again after answering reads as asked", () => {
    expect(
      answerRequestState({
        requested_at: "2026-10-02T10:00:00Z",
        answered_at: "2026-10-01T11:00:00Z",
      })?.state,
    ).toBe("asked");
  });
});

test("wasAskedRecently is false for a registration never asked", () => {
  expect(wasAskedRecently(null, NOW)).toBe(false);
});

describe("links the registrant was handed (#1591)", () => {
  const requestedAt = new Date(NOW - 60 * 1000).toISOString();

  test("are neither asked nor answered", () => {
    for (const source of ["confirmation", "already_registered"]) {
      expect(
        answerRequestState({
          requested_at: requestedAt,
          answered_at: null,
          source,
        }),
      ).toBeNull();
      expect(
        answerRequestState({
          requested_at: requestedAt,
          answered_at: new Date(NOW).toISOString(),
          source,
        }),
      ).toBeNull();
    }
  });

  test("do not count as a recent ask", () => {
    expect(
      wasAskedRecently(
        {
          requested_at: requestedAt,
          answered_at: null,
          source: "confirmation",
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      wasAskedRecently(
        { requested_at: requestedAt, answered_at: null, source: "staff" },
        NOW,
      ),
    ).toBe(true);
  });
});

test("the dedupe key names the kind, the registration and the send", () => {
  expect(registrationAnswersRequestDedupeKey("reg-1", "batch-1")).toBe(
    `${REGISTRATION_ANSWERS_REQUEST_KIND}:reg-1:batch-1`,
  );
});

test("the history card says what a request for answers was", () => {
  expect(
    outboundMessageSenderLabel(REGISTRATION_ANSWERS_REQUEST_KIND, "Sam"),
  ).toBe("Request for answers, sent by Sam");
});
