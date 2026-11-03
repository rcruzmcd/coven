import "server-only";

import {
  ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE,
  type MinimumAge,
  parseMinimumAge,
} from "@/lib/adults-only";

/**
 * One error shape for the whole public API (#813 Phase 3).
 *
 * `{ error: { code, message, fields? } }`. The `code` is what a consumer
 * branches on and is part of the contract; the `message` is a sentence for a
 * developer reading a log, not copy for an end user -- a consumer renders its
 * own words, in its own language, from the code.
 */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Per-field messages, for a 422 from a form post. */
    fields?: Record<string, string>;
  };
};

export type ApiErrorCode =
  /** The tenant, or the thing asked for inside it, is not there. */
  | "not_found"
  /** The body or the query string did not parse. */
  | "invalid_request"
  /** `check_rate_limit()` said no. */
  | "rate_limited"
  /** A browser origin this tenant has not allow-listed tried to post. */
  | "origin_not_allowed"
  /** The write conflicts with the state of the thing (full, closed, taken). */
  | "conflict"
  /** A v1 route this organization can no longer answer (#1746). */
  | "gone"
  /** Something broke on this side. */
  | "server_error";

const STATUS: Record<ApiErrorCode, number> = {
  not_found: 404,
  invalid_request: 422,
  rate_limited: 429,
  origin_not_allowed: 403,
  conflict: 409,
  gone: 410,
  server_error: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: {
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.fields = options.fields;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get body(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    };
  }
}

/**
 * The window `check_rate_limit()` counts over
 * (`20260826170000_create_rate_limit_check.sql`), in seconds. Sent as
 * `Retry-After` on a 429 -- the honest upper bound, since the limiter counts
 * hits in a sliding window rather than blocking until a fixed moment.
 */
export const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/** #1782. The confirmation refusal, naming the event's age. */
function adultsOnlyConfirmationMessage(age: MinimumAge): string {
  return `This event requires everyone to be ${age} or over. Send adults_only_confirmed once the person has confirmed everyone in their party is ${age} or over.`;
}

/**
 * What a `raise exception` from an intake RPC becomes over HTTP.
 *
 * The RPCs answer in short uppercase codes, and those codes are already the
 * contract the server actions translate for the website's forms
 * (`ERROR_MESSAGES` in each actions file). This is the same translation for a
 * different audience: a status and a stable lowercase code instead of a
 * sentence in English.
 *
 * **A disabled module is a 404, everywhere.** #902 made the intake RPCs refuse
 * when the module that owns them is off, and it deliberately reused each RPC's
 * existing "no such thing" answer to do it -- `EVENT_NOT_FOUND` for events,
 * `ITEM_NOT_FOUND` for inventory -- with `SECTION_UNAVAILABLE` added only
 * where there was no such answer to reuse. Mapping all of them to 404 keeps
 * that: which modules an organization has bought is not something its public
 * API should be willing to tell a stranger, and "this tenant does not have
 * this" is the truthful answer either way.
 */
const RPC_ERRORS: Record<
  string,
  { code: ApiErrorCode; message: string; field?: string }
> = {
  RATE_LIMITED: {
    code: "rate_limited",
    message: "Too many requests from this address; try again shortly.",
  },

  // Module gating (#902), and genuine misses. Both 404: see above.
  SECTION_UNAVAILABLE: {
    code: "not_found",
    message: "This organization does not offer this.",
  },
  EVENT_NOT_FOUND: { code: "not_found", message: "No such published event." },
  ITEM_NOT_FOUND: { code: "not_found", message: "No such available item." },
  CALL_CLOSED: {
    code: "not_found",
    message: "This call for artwork is closed.",
  },
  RIDER_PROFILE_UNAVAILABLE: {
    code: "not_found",
    message: "No recent registration to attach a rider profile to.",
  },
  PERSON_ANSWERS_UNAVAILABLE: {
    code: "not_found",
    message: "No recent registration to attach profile answers to.",
  },
  // #1746. The rider profile is profile questions now; an organization
  // without the four keyed questions has nothing this contract can write to.
  RIDER_PROFILE_GONE: {
    code: "gone",
    message:
      "This organization no longer asks the rider profile questions. Use /person-answers.",
  },

  // State of the thing, not of the request.
  REGISTRATION_CLOSED: {
    code: "conflict",
    message: "Registration is closed for this event.",
  },
  REGISTRATION_DEADLINE_PASSED: {
    code: "conflict",
    message: "The registration deadline for this event has passed.",
  },
  EVENT_AT_CAPACITY: { code: "conflict", message: "This event is full." },
  ALREADY_REGISTERED: {
    code: "conflict",
    message: "This email is already registered for this event.",
  },
  ALREADY_SUBMITTED: {
    code: "conflict",
    message: "An application from this email was submitted in the last day.",
  },
  ITEM_ALREADY_REQUESTED: {
    code: "conflict",
    message: "One of these items has already been requested.",
  },
  // #1366. The agreement moved between the version this caller was shown and
  // the one in force now, which is the state of the thing rather than a
  // malformed request: read the new one and accept that. Only a caller that
  // pins a version can get here -- omitting waiver_version accepts whatever is
  // in force, which is what a caller with nowhere to store one should do.
  WAIVER_CHANGED: {
    code: "conflict",
    message:
      "The participant agreement has been updated since the version you sent. Read it again and register against the current one, or omit waiver_version.",
  },

  // Field-level refusals the database makes even though the handler's schema
  // passed -- a length or a shape only Postgres knows about.
  NAME_REQUIRED: {
    code: "invalid_request",
    message: "A name is required.",
    field: "name",
  },
  INVALID_EMAIL: {
    code: "invalid_request",
    message: "A valid email address is required.",
    field: "email",
  },
  TOPIC_REQUIRED: {
    code: "invalid_request",
    message: "A topic is required.",
    field: "topic",
  },
  MESSAGE_REQUIRED: {
    code: "invalid_request",
    message: "A message is required.",
    field: "message",
  },
  PRONOUNS_TOO_LONG: {
    code: "invalid_request",
    message: "Pronouns must be 40 characters or fewer.",
    field: "pronouns",
  },
  INVALID_PARTY_SIZE: {
    code: "invalid_request",
    message: "Party size must be at least 1.",
    field: "party_size",
  },
  MINOR_CONTACTS_REQUIRED: {
    code: "invalid_request",
    message:
      "A party that includes anyone under 18 needs an accompanying adult and an emergency contact.",
    field: "accompanying_adult_name",
  },
  // #1417. The message names the age from the error's DETAIL (#1782); this
  // one is the 18+ fallback.
  ADULTS_ONLY_CONFIRMATION_REQUIRED: {
    code: "invalid_request",
    message: adultsOnlyConfirmationMessage(18),
    field: "adults_only_confirmed",
  },
  // #1647. Only on an organization that requires a handle; every other
  // organization ignores the three no-Instagram fields.
  INSTAGRAM_OR_CONTACT_REQUIRED: {
    code: "invalid_request",
    message:
      "This organization requires an Instagram handle. Send instagram_handle, or has_no_instagram with preferred_contact_method and (except for email) preferred_contact_detail.",
    field: "instagram_handle",
  },
  INSTAGRAM_HANDLE_INVALID: {
    code: "invalid_request",
    message:
      "instagram_handle can only contain letters, numbers, periods and underscores.",
    field: "instagram_handle",
  },
  PREFERRED_CONTACT_INVALID: {
    code: "invalid_request",
    message:
      "preferred_contact_method must be one of text, call, email, whatsapp or other, and preferred_contact_detail at most 200 characters.",
    field: "preferred_contact_method",
  },
  // #1366. Names where to find the document, because the website's own wording
  // -- "tick the box" -- is advice a headless caller cannot act on. It names
  // the endpoint rather than a version: GET /legal reports each document's
  // `url` and whether it is in force, and the version is the organization's
  // own numbering, which a caller is free not to track.
  WAIVER_REQUIRED: {
    code: "invalid_request",
    message:
      "This organization requires its participant agreement to be accepted before registering. GET /api/v1/t/{tenant}/legal reports where to read it; send waiver_accepted once the person has.",
    field: "waiver_accepted",
  },
  // #1407
  EVENT_OPTIONS_REQUIRED: {
    code: "invalid_request",
    message:
      "This event asks each person what they need. GET /api/v1/t/{tenant}/events/{event} lists its registration_options; send option_counts.",
    field: "option_counts",
  },
  EVENT_OPTIONS_MISMATCH: {
    code: "invalid_request",
    message: "option_counts must add up to party_size.",
    field: "option_counts",
  },
  EVENT_OPTIONS_INVALID: {
    code: "invalid_request",
    message:
      "option_counts names an option this event does not have, or a count that is not a whole number of 0 or more.",
    field: "option_counts",
  },
  EVENT_OPTION_FULL: {
    code: "conflict",
    message: "One of the chosen registration options is full.",
    field: "option_counts",
  },
  // #1501
  EVENT_ANSWERS_REQUIRED: {
    code: "invalid_request",
    message:
      "This event requires answers to some of its registration_questions. GET /api/v1/t/{tenant}/events/{event} lists them; send answers.",
    field: "answers",
  },
  EVENT_ANSWERS_INVALID: {
    code: "invalid_request",
    message:
      "answers names a question this event does not have, or an answer that does not fit its question's kind, options or bounds.",
    field: "answers",
  },
  INVALID_RIDER_PROFILE: {
    code: "invalid_request",
    message:
      "The riding discipline and experience levels do not agree, or name an option this organization does not offer.",
  },
  PERSON_ANSWERS_INVALID: {
    code: "invalid_request",
    message:
      "answers names a question this organization does not ask after registering for this event, or an answer that does not fit its question.",
    field: "answers",
  },
  PERSON_ANSWERS_REQUIRED: {
    code: "invalid_request",
    message: "A required profile question was left unanswered.",
    field: "answers",
  },
  NO_ITEMS: {
    code: "invalid_request",
    message: "Name at least one item.",
    field: "item_ids",
  },
  // Unreachable through the handler, whose schema will not parse a body
  // without it (#1367). Mapped anyway, because the alternative for a refusal
  // this endpoint can make is a 500 that says "something went wrong on our
  // side" about something that went wrong on the caller's.
  AS_IS_REQUIRED: {
    code: "invalid_request",
    message:
      "The requester must be shown, and acknowledge, that these items are given as-is.",
    field: "as_is_acknowledged",
  },
  // #1536. The organization asks for a shared passphrase before a request,
  // and none was sent or it did not match -- including one that was right
  // before the organization changed it. The passphrase itself is never
  // published: the requester gets it from the organization.
  PASSPHRASE_REQUIRED: {
    code: "invalid_request",
    message:
      "This organization requires its passphrase on every request. GET /api/v1/t/{tenant}/gear-request-settings reports whether one is required and how to get it; send passphrase.",
    field: "passphrase",
  },

  // #1366, and the one waiver code that is not the caller's fault: this tenant
  // has an agreement in force with no published version to show. Nothing the
  // caller can send fixes it, so it stays a 500 and the detail goes to our log
  // -- the same treatment as any other unmapped failure, but named so it is
  // not mistaken for one.
  WAIVER_UNAVAILABLE: {
    code: "server_error",
    message: "Something went wrong on our side.",
  },
};

/** Turns a PostgREST error into the `ApiError` the envelope is built from. */
export function apiErrorFromRpc(
  error: { message?: string; details?: string } | null,
): ApiError {
  const raw = error?.message?.trim() ?? "";
  const known =
    raw === ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE
      ? {
          ...RPC_ERRORS[raw],
          message: adultsOnlyConfirmationMessage(
            parseMinimumAge(error?.details) ?? 18,
          ),
        }
      : RPC_ERRORS[raw];

  if (!known) {
    // Anything unrecognised is ours, not the caller's: a constraint violation,
    // a missing grant, a typo in a new RPC. The caller gets a 500 and no
    // detail; the detail goes to the log.
    console.error("[api] unmapped database error", error);
    return new ApiError("server_error", "Something went wrong on our side.");
  }

  return new ApiError(known.code, known.message, {
    fields: known.field ? { [known.field]: known.message } : undefined,
    retryAfterSeconds:
      known.code === "rate_limited" ? RATE_LIMIT_WINDOW_SECONDS : undefined,
  });
}
