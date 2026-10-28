import { z } from "zod";

/**
 * The request bodies of the public API's writes (#813 Phase 3).
 *
 * These are the published contract: `/api/v1/openapi.json` is generated from
 * exactly these objects, so a schema and its documentation cannot drift.
 *
 * They are **not** the authority on what is acceptable. Every one of these
 * posts lands in a `security definer` RPC that checks the same things again
 * against the tenant's own settings -- whether shipping is on offer, whether
 * the event is still open, whether the module is even enabled -- because the
 * RPCs are reachable with `curl` whatever this layer says. What the schemas
 * buy is a 422 with a message beside the right field instead of a 500 from a
 * constraint, and a document a consumer can read before writing any code.
 *
 * Optional fields are `.optional()` rather than `.nullable()`: leaving a key
 * out is how JSON says "nothing", and a consumer should not have to send
 * `"phone": null`. Both are accepted where the column is nullable, and the
 * handler normalises either to null.
 */

/** Trimmed, and empty-after-trimming counts as absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional()
    .nullable()
    .transform((value) => value ?? undefined);

const name = z
  .string()
  .trim()
  .min(1, "A name is required.")
  .max(200, "That name is too long.")
  .meta({ description: "The person's name, as they gave it." });

const email = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "A valid email address is required.")
  .meta({ description: "Where the organization can reply." });

const phone = optionalText(60).meta({ description: "Optional phone number." });

const pronouns = optionalText(40).meta({
  description: "Optional; 40 characters or fewer, as Postgres also enforces.",
});

export const contactMessageSchema = z
  .object({
    name,
    email,
    topic: optionalText(120).meta({
      description: "What the message is about. Defaults to `general`.",
    }),
    message: z
      .string()
      .trim()
      .min(1, "A message is required.")
      .max(5000, "That message is too long."),
  })
  .meta({ id: "ContactMessage" });

export const volunteerApplicationSchema = z
  .object({
    name,
    email,
    phone,
    pronouns,
    role_interest: optionalText(200).meta({
      description:
        "The name of a role from `/volunteer-roles`, or the applicant's own words.",
    }),
    availability: optionalText(2000).meta({
      description: "Free text: when they can help.",
    }),
  })
  .meta({ id: "VolunteerApplication" });

export const volunteerStatusLookupSchema = z
  .object({
    email,
    reference_code: z.string().trim().min(1).max(32).meta({
      description:
        "The code returned when the application was submitted. Case-insensitive.",
    }),
  })
  .meta({ id: "VolunteerStatusLookup" });

export const eventRegistrationSchema = z
  .object({
    name,
    email,
    phone,
    pronouns,
    party_size: z
      .int()
      .min(1, "Party size must be at least 1.")
      .max(100)
      .meta({ description: "How many people are coming, including this one." }),
    notes: optionalText(2000),
    instagram_handle: optionalText(30).meta({
      description:
        "Without the @; letters, numbers, dots and underscores. Required where the organization requires an Instagram handle, unless has_no_instagram is true.",
    }),
    // #1647. A behaviour change for one kind of organization only: where it
    // requires a handle, a registration with neither a handle nor these three
    // is refused with INSTAGRAM_OR_CONTACT_REQUIRED. Everywhere else they are
    // ignored and stored as null, so existing callers are unaffected.
    has_no_instagram: z.boolean().optional().meta({
      description:
        "That the person has no Instagram. Where the organization requires a handle, send this with preferred_contact_method instead of instagram_handle. Ignored by organizations that do not.",
    }),
    preferred_contact_method: z
      .enum(["text", "call", "email", "whatsapp", "other"])
      .optional()
      .meta({
        description:
          "How a person with no Instagram would like to be reached. Required with has_no_instagram.",
      }),
    preferred_contact_detail: optionalText(200).meta({
      description:
        "The number or address for preferred_contact_method. Required with it, except for email, where omitting it means the email given above.",
    }),
    // #685, and every one of them optional on purpose. This contract predates
    // the question, so a caller that says nothing is recorded as never having
    // been asked rather than as a "no" -- the same three-state reading the
    // column carries. Send `true` and the four contacts become required, which
    // is the one rule the organization's own policy rests on.
    party_includes_minor: z.boolean().optional().meta({
      description:
        "Whether anyone in the party is under 18. Omit it if you did not ask; it is never read as a no. Ignored, with the four contacts, when the organization does not ask about under-18s.",
    }),
    accompanying_adult_name: optionalText(200).meta({
      description:
        "The adult attending with them. Required when party_includes_minor is true.",
    }),
    accompanying_adult_phone: optionalText(50).meta({
      description:
        "A number that reaches that adult on the day. Required when party_includes_minor is true.",
    }),
    emergency_contact_name: optionalText(200).meta({
      description:
        "Who to call in an emergency. Required when party_includes_minor is true.",
    }),
    emergency_contact_phone: optionalText(50).meta({
      description:
        "That contact's number. Required when party_includes_minor is true.",
    }),
    // #1417. Optional, since most events are not 18+; required by the RPC for
    // one that is, the way the waiver is.
    adults_only_confirmed: z.boolean().optional().meta({
      description:
        "That the person confirmed everyone in their party is 18 or over. Required when GET /events/{event} reports adults_only; ignored otherwise.",
    }),
    // #1366, closing a gap #686 opened. `register_for_event()` gained these
    // two parameters and this schema did not, so `p_waiver_accepted` fell
    // through to its `false` default and every headless registration for a
    // tenant with a waiver in force failed with WAIVER_REQUIRED -- advice no
    // `curl` caller could act on, because there was no field to send.
    //
    // Optional, like the minors questions above and for the same reason: this
    // contract predates the waiver, and the overwhelming majority of tenants
    // have adopted none. Omitting both is correct on every one of those, and
    // `false` is what the RPC already assumes.
    waiver_accepted: z.boolean().optional().meta({
      description:
        "That the person accepted this organization's participant agreement. Omit it unless GET /legal reports a waiver in force; where one is, a registration without it is refused.",
    }),
    waiver_version: z.int().positive().optional().meta({
      description:
        "The agreement version the person was shown, if you track it. Sending one that is no longer in force is refused rather than accepted against text nobody read; omitting it accepts whatever is in force now.",
    }),
    // #599, reinterpreted by #1376. The field, its type and its optionality
    // are unchanged -- this is a published API contract -- but what it records
    // is now an objection rather than an answer to a question. Omitting it
    // records nothing, which is correct for a caller written before the field
    // existed, correct for the overwhelming majority of organizations, which
    // publish no photo notice, and what this platform's own registration forms
    // now do: they have no control, and a form with no affirmative control
    // cannot produce an affirmative record.
    //
    // A `false` is an objection and is stored as one; it never refuses the
    // registration. The paragraphs it is recorded against are read from the
    // organization's own row server-side, never from this body, so sending
    // `true` is still an assertion that the person was shown them.
    photo_consent: z.boolean().optional().meta({
      description:
        "Send false to record that the person asked not to be photographed or recorded; it is stored as an objection and never refuses the registration. Send true only if they told you explicitly that photos are fine, after you showed them the events.photo_consent paragraphs from GET /content. Omit it — which is what this organization's own registration form does — and nothing is recorded; that is never read as an objection.",
    }),
    // #1407. Optional in the schema, because most events ask nothing and this
    // contract predates the question; required by the RPC for an event that
    // does, the way the waiver is.
    option_counts: z
      .record(z.string(), z.int().min(0).max(10000))
      .optional()
      .meta({
        description:
          "How many people in the party chose each of the event's registration options, keyed by option id, adding up to party_size. Required when GET /events/{event} lists registration_options; omit it otherwise.",
      }),
    // #1501. Optional in the schema for the reason option_counts is; the RPC
    // validates each answer by its question's kind.
    answers: z
      .record(
        z.string(),
        z.union([
          z.string().max(500),
          z.array(z.string()).max(20),
          z.int(),
          z.boolean(),
          z.object({ place_id: z.uuid() }),
          z.object({ other: z.string().max(200) }),
        ]),
      )
      .optional()
      .meta({
        description:
          "Answers to the event's registration_questions, keyed by question id, once for the whole registration: an option id for single_choice, an array of option ids for multi_choice, text for short_text, a whole number for number, true or false for consent, {place_id} for place (or {other: text} where the question allows it). Leave out a question whose show_if is not met. Required when any visible question is required.",
      }),
  })
  .meta({ id: "EventRegistration" });

const shippingAddressSchema = z
  .object({
    name: optionalText(200).meta({
      description: "Who to address the parcel to, if not the requester.",
    }),
    line1: z.string().trim().min(1).max(200),
    line2: optionalText(200),
    city: z.string().trim().min(1).max(120),
    region: optionalText(120),
    postal_code: z.string().trim().min(1).max(32),
    country: optionalText(120),
  })
  .meta({ id: "ShippingAddress" });

export const gearRequestSchema = z
  .object({
    item_ids: z
      .array(z.uuid())
      .min(1, "Name at least one item.")
      .max(25)
      .meta({ description: "Ids from `/gear`, all of them still available." }),
    name,
    email,
    phone,
    instagram_handle: optionalText(30).meta({
      description: "Without the @; letters, numbers, dots and underscores.",
    }),
    notes: optionalText(2000),
    delivery_method: z.enum(["meetup", "shipping"]).optional().meta({
      description:
        "Defaults to `meetup`. `shipping` is refused unless the organization offers it — see `/gear-request-settings`.",
    }),
    shipping: shippingAddressSchema.optional().meta({
      description: "Required when `delivery_method` is `shipping`.",
    }),
    payment_method: optionalText(60).meta({
      description:
        "One of the keys from `/gear-request-settings`, when shipping.",
    }),
    // Required, and `true` is the only value that parses (#1367). Unlike the
    // participant waiver it is not conditional on anything a tenant has
    // adopted: these items are given as-is on every organization running this
    // software, so every request records that the person asking was told so.
    // A consumer that will not say it on the requester's behalf should not be
    // making the request. The wording is the platform's own and is snapshotted
    // onto the row by this endpoint, not sent -- read it from `/legal`'s terms
    // of use, under "we give away".
    as_is_acknowledged: z.literal(true).meta({
      description:
        "Confirms the person asking was shown, and understood, that these items are given as-is — not inspected, tested, serviced or certified. Must be `true`; there is no way to request without it. Show them the wording first: it is the `items-we-give-away` section of this organization's terms of use.",
    }),
    // #1536. Optional because most organizations ask for none; required in
    // effect where `/gear-request-settings` says `passphrase_required`.
    passphrase: optionalText(100).meta({
      description:
        "The organization's shared passphrase, where `/gear-request-settings` reports `passphrase_required: true`. Compared trimmed and case-insensitively. A missing or wrong one is refused with `passphrase` as the field. The organization gives it out; it is never published here.",
    }),
  })
  .meta({ id: "GearRequest" });

export const riderProfileSchema = z
  .object({
    registration_id: z.uuid().meta({
      description:
        "The id returned by a registration, within a day of making it.",
    }),
    riding_discipline: z.enum(["ski", "snowboard", "both"]),
    ski_experience_level: z
      .enum(["first_time", "beginner", "intermediate", "advanced"])
      .optional()
      .meta({ description: "Required when the discipline includes skiing." }),
    snowboard_experience_level: z
      .enum(["first_time", "beginner", "intermediate", "advanced"])
      .optional()
      .meta({
        description: "Required when the discipline includes snowboarding.",
      }),
    preferred_mountain: optionalText(120),
  })
  .meta({ id: "RiderProfile" });

export type ContactMessageBody = z.infer<typeof contactMessageSchema>;
export type VolunteerApplicationBody = z.infer<
  typeof volunteerApplicationSchema
>;
export type VolunteerStatusLookupBody = z.infer<
  typeof volunteerStatusLookupSchema
>;
export type EventRegistrationBody = z.infer<typeof eventRegistrationSchema>;
export type GearRequestBody = z.infer<typeof gearRequestSchema>;
export type RiderProfileBody = z.infer<typeof riderProfileSchema>;
