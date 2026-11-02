// #813 Phase 3 against a real local stack: the versioned public API.
//
// The handlers are plain functions of a `Request`, so this calls them directly
// rather than through a running server. That is the whole point of taking the
// client IP and the origin off the `Request` instead of `next/headers`: what
// runs here is the same code Vercel runs, not a rehearsal of it.
//
// Every read is parsed with the response schema `/api/v1/openapi.json` is
// generated from, so a handler that stops matching its own published
// documentation fails here rather than in somebody's consumer.
//
// A tenant of its own, provisioned and deleted, because these endpoints answer
// for whichever tenant the slug resolves to and this file switches modules and
// origin allow-lists on and off.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../../test/seed-fixtures";
import { SITE_CONTENT_SLOTS } from "@/lib/site-content";
import {
  PASSPHRASE_REQUIRED_SETTING_KEY,
  PASSPHRASE_SETTING_KEY,
} from "@/lib/gear-requests";

// Every module in `@/lib/api` imports "server-only", which throws outside
// Next's bundler. Same treatment the notification suite gives it: neutralise
// the marker, then import what is under test.
mock.module("server-only", () => ({}));

const { openApiDocument } = await import("@/lib/api/openapi");
const {
  articleCategoriesResponse,
  articlesResponse,
  calendarResponse,
  contentResponse,
  errorResponseSchema,
  eventResponse,
  eventsResponse,
  gearRequestSettingsResponse,
  gearResponse,
  legalResponse,
  lexiconResponse,
  programsResponse,
  siteResponse,
  sponsorsResponse,
  teamResponse,
  volunteerRolesResponse,
} = await import("@/lib/api/response-schemas");

const { GET: getSite } = await import("./t/[tenant]/site/route");
const { GET: getContent } = await import("./t/[tenant]/content/route");
const { GET: listEvents } = await import("./t/[tenant]/events/route");
const { GET: getEvent } = await import("./t/[tenant]/events/[event]/route");
const { GET: getCalendar } = await import("./t/[tenant]/calendar/route");
const { GET: listGear } = await import("./t/[tenant]/gear/route");
const { GET: getGearSettings } =
  await import("./t/[tenant]/gear-request-settings/route");
const { GET: listVolunteerRoles } =
  await import("./t/[tenant]/volunteer-roles/route");
const { GET: listArticles } = await import("./t/[tenant]/articles/route");
const { GET: listArticleCategories } =
  await import("./t/[tenant]/article-categories/route");
const { GET: listPrograms } = await import("./t/[tenant]/programs/route");
const { GET: listTeam } = await import("./t/[tenant]/team/route");
const { GET: listSponsors } = await import("./t/[tenant]/sponsors/route");
const { GET: getLexicon } = await import("./t/[tenant]/lexicon/route");
const { GET: listLegal } = await import("./t/[tenant]/legal/route");
const { POST: postContact, OPTIONS: optionsContact } =
  await import("./t/[tenant]/contact/route");
const { POST: postVolunteerApplication } =
  await import("./t/[tenant]/volunteer-applications/route");
const { POST: postVolunteerStatus } =
  await import("./t/[tenant]/volunteer-applications/status/route");
const { POST: postRegistration } =
  await import("./t/[tenant]/events/[event]/registrations/route");
const { POST: postGearRequest } =
  await import("./t/[tenant]/gear-requests/route");
const { POST: postRiderProfile } =
  await import("./t/[tenant]/rider-profile/route");
const { POST: postPersonAnswers } =
  await import("./t/[tenant]/person-answers/route");

const AUTHOR = SEEDED_USER_IDS.admin;
const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

const SLUG = `api-${run}`;
const HOST = `api-${run}.example.test`;
const EMBED_ORIGIN = "https://embed.example.test";

let tenantId: string;
let eventId: string;
let gearItemId: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function must<T = any>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  what: string,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data as T;
}

/** A request the handlers see as one arriving from a consumer's server. */
function apiRequest(
  path: string,
  init: RequestInit & { origin?: string } = {},
): Request {
  const headers = new Headers(init.headers);
  // Its own address per call: every rate limit is per (route, ip) over 15
  // minutes, and a whole file sharing one address trips limits of 5 on its own.
  headers.set("x-forwarded-for", uniqueIp());
  headers.set("x-forwarded-host", HOST);
  headers.set("x-forwarded-proto", "https");
  if (init.body) headers.set("content-type", "application/json");

  const request = new Request(`https://${HOST}${path}`, { ...init, headers });

  // `Origin` is a forbidden header name -- a browser sets it, script cannot --
  // and happy-dom, which the test preload registers globally, enforces that by
  // dropping it at construction. A real server receives it like any other
  // header, so it goes back on afterwards; setting it on an existing request's
  // headers is not guarded.
  if (init.origin) request.headers.set("origin", init.origin);

  return request;
}

/** Route params, as Next hands them: a promise. */
function params<P extends Record<string, string>>(value: P) {
  return { params: Promise.resolve(value) };
}

const tenantParams = () => params({ tenant: SLUG });

beforeAll(async () => {
  tenantId = await must(
    service.rpc("provision_tenant", {
      p_name: `Public API ${run}`,
      p_slug: SLUG,
      p_custom_domain: HOST,
      p_plan: "white_label",
      p_admin_email: null,
    }),
    "provision_tenant",
  );

  eventId = (
    await must(
      service
        .from("events")
        .insert({
          tenant_id: tenantId,
          name: `Public API Event ${run}`,
          starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          timezone: "America/Denver",
          visibility: "public",
          status: "published",
          registration_enabled: true,
          created_by: AUTHOR,
        })
        .select("id")
        .single(),
      "event",
    )
  ).id;

  // A gear item needs a donor and a donation behind it: the library is a
  // record of what was given, so there is no such thing as an item from
  // nowhere.
  const donorId = (
    await must(
      service
        .from("people")
        .insert({
          tenant_id: tenantId,
          name: `Public API Donor ${run}`,
          email: uniqueEmail("api-donor"),
          source_type: "other",
        })
        .select("id")
        .single(),
      "donor",
    )
  ).id;
  const donationId = (
    await must(
      service
        .from("donations")
        .insert({ tenant_id: tenantId, donor_id: donorId, created_by: AUTHOR })
        .select("id")
        .single(),
      "donation",
    )
  ).id;
  gearItemId = (
    await must(
      service
        .from("inventory_items")
        .insert({
          tenant_id: tenantId,
          donation_id: donationId,
          description: `Public API Ski ${run}`,
          condition: "good",
          status: "available",
          intended_use: "gear_library",
          created_by: AUTHOR,
        })
        .select("id")
        .single(),
      "gear item",
    )
  ).id;

  await must(
    service
      .from("volunteer_role_types")
      .insert({
        tenant_id: tenantId,
        name: `Public API Role ${run}`,
        description: "Helps with the thing.",
        is_public: true,
        created_by: AUTHOR,
      })
      .select("id"),
    "volunteer role",
  );
});

afterAll(async () => {
  if (!tenantId) return;
  await service
    .from("tenants")
    .update({ status: "archived" })
    .eq("id", tenantId);
  await service.rpc("delete_tenant", { p_tenant_id: tenantId });
});

describe("reads answer what the contract says they answer", () => {
  const READS: [
    string,
    (request: Request, ctx: never) => Promise<Response>,
    { parse: (value: unknown) => unknown },
  ][] = [
    ["/site", getSite as never, siteResponse],
    ["/content", getContent as never, contentResponse],
    ["/events", listEvents as never, eventsResponse],
    ["/calendar", getCalendar as never, calendarResponse],
    ["/gear", listGear as never, gearResponse],
    [
      "/gear-request-settings",
      getGearSettings as never,
      gearRequestSettingsResponse,
    ],
    ["/volunteer-roles", listVolunteerRoles as never, volunteerRolesResponse],
    ["/articles", listArticles as never, articlesResponse],
    [
      "/article-categories",
      listArticleCategories as never,
      articleCategoriesResponse,
    ],
    ["/programs", listPrograms as never, programsResponse],
    ["/team", listTeam as never, teamResponse],
    ["/sponsors", listSponsors as never, sponsorsResponse],
    ["/lexicon", getLexicon as never, lexiconResponse],
    ["/legal", listLegal as never, legalResponse],
  ];

  for (const [path, handler, schema] of READS) {
    test(`GET ${path}`, async () => {
      const response = await handler(
        apiRequest(`/api/v1/t/${SLUG}${path}`),
        tenantParams() as never,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("s-maxage=60");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("etag")).toBeTruthy();

      // The contract check: the body has to satisfy the schema the published
      // document is generated from. `parse` throws on a mismatch, naming the
      // path that broke, which is a better failure than an equality diff.
      schema.parse(await response.json());
    });
  }

  test("GET /events/{event} carries the event", async () => {
    const response = await getEvent(
      apiRequest(`/api/v1/t/${SLUG}/events/${eventId}`),
      params({ tenant: SLUG, event: eventId }),
    );
    expect(response.status).toBe(200);
    const parsed = eventResponse.parse(await response.json());
    expect(parsed.event.id).toBe(eventId);
    expect(parsed.event.name).toContain("Public API Event");
  });

  test("the gear filters run in Postgres", async () => {
    const all = await listGear(
      apiRequest(`/api/v1/t/${SLUG}/gear`),
      tenantParams(),
    );
    expect(gearResponse.parse(await all.json()).items).toHaveLength(1);

    const missed = await listGear(
      apiRequest(`/api/v1/t/${SLUG}/gear?q=nothing-matches-this`),
      tenantParams(),
    );
    expect(gearResponse.parse(await missed.json()).items).toHaveLength(0);

    const found = await listGear(
      apiRequest(`/api/v1/t/${SLUG}/gear?q=Public%20API%20Ski`),
      tenantParams(),
    );
    expect(gearResponse.parse(await found.json()).items).toHaveLength(1);
  });

  test("a matching If-None-Match is a 304 with no body", async () => {
    const first = await getLexicon(
      apiRequest(`/api/v1/t/${SLUG}/lexicon`),
      tenantParams(),
    );
    const etag = first.headers.get("etag")!;

    const second = await getLexicon(
      apiRequest(`/api/v1/t/${SLUG}/lexicon`, {
        headers: { "if-none-match": etag },
      }),
      tenantParams(),
    );

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    // A 304 that drops its caching headers makes the next hop ask again.
    expect(second.headers.get("etag")).toBe(etag);
    expect(second.headers.get("cache-control")).toContain("s-maxage=60");
  });

  test("an unknown slug is a 404, not somebody else's content", async () => {
    const response = await listEvents(
      apiRequest(`/api/v1/t/no-such-${run}/events`),
      params({ tenant: `no-such-${run}` }),
    );

    expect(response.status).toBe(404);
    const parsed = errorResponseSchema.parse(await response.json());
    expect(parsed.error.code).toBe("not_found");
  });

  test("a suspended tenant is a 404 too", async () => {
    await must(
      service
        .from("tenants")
        .update({ status: "suspended" })
        .eq("id", tenantId)
        .select("id"),
      "suspend",
    );
    try {
      const response = await listEvents(
        apiRequest(`/api/v1/t/${SLUG}/events`),
        tenantParams(),
      );
      expect(response.status).toBe(404);
    } finally {
      await must(
        service
          .from("tenants")
          .update({ status: "active" })
          .eq("id", tenantId)
          .select("id"),
        "unsuspend",
      );
    }
  });
});

describe("writes", () => {
  test("a contact message lands, and answers with its id", async () => {
    const response = await postContact(
      apiRequest(`/api/v1/t/${SLUG}/contact`, {
        method: "POST",
        body: JSON.stringify({
          name: "API Caller",
          email: uniqueEmail("api-contact"),
          message: "Posted through the public API.",
        }),
      }),
      tenantParams(),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string };
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await must(
      service.from("contact_messages").select("id").eq("id", body.id),
      "message row",
    );
    expect(rows).toHaveLength(1);
  });

  test("a body that does not validate is a 422 with a message per field", async () => {
    const response = await postContact(
      apiRequest(`/api/v1/t/${SLUG}/contact`, {
        method: "POST",
        body: JSON.stringify({ name: "", email: "nope", message: "" }),
      }),
      tenantParams(),
    );

    expect(response.status).toBe(422);
    const parsed = errorResponseSchema.parse(await response.json());
    expect(parsed.error.code).toBe("invalid_request");
    expect(Object.keys(parsed.error.fields ?? {}).sort()).toEqual([
      "email",
      "message",
      "name",
    ]);
  });

  test("a body that is not JSON is a 422, not a 500", async () => {
    const response = await postContact(
      apiRequest(`/api/v1/t/${SLUG}/contact`, {
        method: "POST",
        body: "{not json",
      }),
      tenantParams(),
    );
    expect(response.status).toBe(422);
  });

  test("a volunteer application answers with the reference code, and the code looks it up", async () => {
    const email = uniqueEmail("api-volunteer");
    const applied = await postVolunteerApplication(
      apiRequest(`/api/v1/t/${SLUG}/volunteer-applications`, {
        method: "POST",
        body: JSON.stringify({ name: "API Volunteer", email }),
      }),
      tenantParams(),
    );

    expect(applied.status).toBe(201);
    const { reference_code } = (await applied.json()) as {
      reference_code: string;
    };
    expect(reference_code).toMatch(/^[A-Z0-9]{8}$/);

    const looked = await postVolunteerStatus(
      apiRequest(`/api/v1/t/${SLUG}/volunteer-applications/status`, {
        method: "POST",
        body: JSON.stringify({ email, reference_code }),
      }),
      tenantParams(),
    );
    expect(looked.status).toBe(201);
    expect(await looked.json()).toEqual({ status: "new" });
  });

  test("a lookup that misses answers null rather than 404", async () => {
    const response = await postVolunteerStatus(
      apiRequest(`/api/v1/t/${SLUG}/volunteer-applications/status`, {
        method: "POST",
        body: JSON.stringify({
          email: uniqueEmail("api-miss"),
          reference_code: "ZZZZZZZZ",
        }),
      }),
      tenantParams(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: null });
  });

  test("registering, then attaching a rider profile to that registration", async () => {
    const registered = await postRegistration(
      apiRequest(`/api/v1/t/${SLUG}/events/${eventId}/registrations`, {
        method: "POST",
        body: JSON.stringify({
          name: "API Registrant",
          email: uniqueEmail("api-register"),
          party_size: 2,
        }),
      }),
      params({ tenant: SLUG, event: eventId }),
    );

    expect(registered.status).toBe(201);
    const { id } = (await registered.json()) as { id: string };

    const riderProfile = () =>
      postRiderProfile(
        apiRequest(`/api/v1/t/${SLUG}/rider-profile`, {
          method: "POST",
          body: JSON.stringify({
            registration_id: id,
            riding_discipline: "ski",
            ski_experience_level: "intermediate",
          }),
        }),
        tenantParams(),
      );

    // #1746. The v1 contract maps onto the questions keyed as Chatter
    // Snow's are; a tenant without them -- every new one -- is told it is gone.
    expect((await riderProfile()).status).toBe(410);

    const option = (key: string, label: string) => ({
      id: crypto.randomUUID(),
      key,
      label,
    });
    const disciplines = [
      option("ski", "Skis"),
      option("snowboard", "Snowboard"),
      option("both", "Both"),
    ];
    const levels = () => [
      option("first_time", "First time"),
      option("beginner", "Beginner"),
      option("intermediate", "Intermediate"),
      option("advanced", "Advanced"),
    ];
    const disciplineId = crypto.randomUUID();
    const on = (keys: string[]) => ({
      any: [
        {
          question_id: disciplineId,
          option_ids: disciplines
            .filter((o) => keys.includes(o.key))
            .map((o) => o.id),
        },
      ],
    });
    const question = (
      id: string,
      key: string,
      options: unknown[],
      extra: Record<string, unknown> = {},
    ) => ({
      id,
      tenant_id: tenantId,
      key,
      kind: "single_choice",
      prompt: key,
      options,
      // One shape for every row: a bulk insert fills a missing key with null.
      allow_other: false,
      show_if: null,
      ...extra,
    });
    await must(
      service.from("person_questions").insert([
        question(disciplineId, "riding_discipline", disciplines, {
          sort_order: 0,
        }),
        question(crypto.randomUUID(), "ski_level", levels(), {
          sort_order: 1,
          show_if: on(["ski", "both"]),
        }),
        question(crypto.randomUUID(), "snowboard_level", levels(), {
          sort_order: 2,
          show_if: on(["snowboard", "both"]),
        }),
        question(
          crypto.randomUUID(),
          "preferred_mountain",
          [option("hunter", "Hunter"), option("windham", "Windham")],
          { sort_order: 3, allow_other: true },
        ),
      ]),
      "seed the rider questions",
    );

    const profile = await riderProfile();
    expect(profile.status).toBe(201);
    expect(await profile.json()).toEqual({ saved: true });

    const { data: stored } = await service
      .from("person_answers")
      .select("answer_text, question:person_questions(key)")
      .eq("registration_id", id);
    expect(
      Object.fromEntries(
        (stored ?? []).map((row) => [
          (row.question as unknown as { key: string }).key,
          row.answer_text,
        ]),
      ),
    ).toEqual({ riding_discipline: "Skis", ski_level: "Intermediate" });

    // The general route, keyed by question key and option key.
    const answers = await postPersonAnswers(
      apiRequest(`/api/v1/t/${SLUG}/person-answers`, {
        method: "POST",
        body: JSON.stringify({
          registration_id: id,
          answers: {
            riding_discipline: "snowboard",
            snowboard_level: "beginner",
          },
        }),
      }),
      tenantParams(),
    );
    expect(answers.status).toBe(201);
    const { data: after } = await service
      .from("person_answers")
      .select("answer_text, question:person_questions(key)")
      .eq("registration_id", id);
    expect(
      Object.fromEntries(
        (after ?? []).map((row) => [
          (row.question as unknown as { key: string }).key,
          row.answer_text,
        ]),
      ),
    ).toEqual({ riding_discipline: "Snowboard", snowboard_level: "Beginner" });

    const unknown = await postPersonAnswers(
      apiRequest(`/api/v1/t/${SLUG}/person-answers`, {
        method: "POST",
        body: JSON.stringify({
          registration_id: id,
          answers: { shoe_size: "9" },
        }),
      }),
      tenantParams(),
    );
    expect(unknown.status).toBe(422);
  });

  test("a gear request reserves the item", async () => {
    const response = await postGearRequest(
      apiRequest(`/api/v1/t/${SLUG}/gear-requests`, {
        method: "POST",
        body: JSON.stringify({
          item_ids: [gearItemId],
          name: "API Requester",
          email: uniqueEmail("api-gear"),
          as_is_acknowledged: true,
        }),
      }),
      tenantParams(),
    );

    expect(response.status).toBe(201);

    const [item] = await must(
      service.from("inventory_items").select("status").eq("id", gearItemId),
      "item status",
    );
    expect(item.status).toBe("reserved");

    // The wording is the endpoint's, not the caller's (#1367): a headless
    // consumer says the requester was told, and the platform says what.
    const [request] = await must(
      service
        .from("gear_requests")
        .select("as_is_acknowledged_at, as_is_text")
        .order("created_at", { ascending: false })
        .limit(1),
      "the request just made",
    );
    expect(request.as_is_acknowledged_at).not.toBeNull();
    expect(request.as_is_text).toContain("exactly as they reach us");
  });

  // #1366 is the same mistake made once already: a new RPC parameter with no
  // field in the schema to feed it. Here the field is required, so a body
  // without it does not reach the database at all.
  test("a gear request without the as-is acknowledgement is a 422", async () => {
    const response = await postGearRequest(
      apiRequest(`/api/v1/t/${SLUG}/gear-requests`, {
        method: "POST",
        body: JSON.stringify({
          item_ids: [gearItemId],
          name: "API Requester",
          email: uniqueEmail("api-gear-no-ack"),
        }),
      }),
      tenantParams(),
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(Object.keys(body.error.fields ?? {})).toContain(
      "as_is_acknowledged",
    );
  });

  // #1536. The third caller of request_gear_items(), wired up with the other
  // two: a consumer learns that a passphrase is required from the settings
  // read, never what it is, and a request without it is refused by the RPC.
  test("a gear request answers to the organization's passphrase", async () => {
    await must(
      service.from("app_settings").upsert(
        [
          {
            tenant_id: tenantId,
            key: PASSPHRASE_REQUIRED_SETTING_KEY,
            value: true,
          },
          {
            tenant_id: tenantId,
            key: PASSPHRASE_SETTING_KEY,
            value: "Bluebird",
          },
        ],
        { onConflict: "tenant_id,key" },
      ),
      "passphrase settings",
    );
    try {
      const [{ donation_id }] = await must(
        service
          .from("inventory_items")
          .select("donation_id")
          .eq("id", gearItemId),
        "donation",
      );
      const [{ id: itemId }] = await must(
        service
          .from("inventory_items")
          .insert({
            tenant_id: tenantId,
            donation_id,
            description: `Public API Gated Ski ${run}`,
            condition: "good",
            status: "available",
            intended_use: "gear_library",
            created_by: AUTHOR,
          })
          .select("id"),
        "gated item",
      );

      const settings = await getGearSettings(
        apiRequest(`/api/v1/t/${SLUG}/gear-request-settings`),
        tenantParams(),
      );
      const settingsText = await settings.text();
      expect(JSON.parse(settingsText).settings.passphrase_required).toBe(true);
      expect(settingsText).not.toContain("Bluebird");

      const request = (passphrase?: string) =>
        postGearRequest(
          apiRequest(`/api/v1/t/${SLUG}/gear-requests`, {
            method: "POST",
            body: JSON.stringify({
              item_ids: [itemId],
              name: "API Requester",
              email: uniqueEmail("api-gear-passphrase"),
              as_is_acknowledged: true,
              ...(passphrase === undefined ? {} : { passphrase }),
            }),
          }),
          tenantParams(),
        );

      for (const attempt of [undefined, "wrong"]) {
        const refused = await request(attempt);
        expect(refused.status).toBe(422);
        const body = await refused.json();
        expect(body.error.code).toBe("invalid_request");
        expect(Object.keys(body.error.fields ?? {})).toContain("passphrase");
      }

      // Trimmed and case-insensitive: it is read out over the phone.
      expect((await request("  bluebird ")).status).toBe(201);
    } finally {
      await service
        .from("app_settings")
        .delete()
        .eq("tenant_id", tenantId)
        .in("key", [PASSPHRASE_REQUIRED_SETTING_KEY, PASSPHRASE_SETTING_KEY]);
    }
  });

  test("a registration for another tenant's event is a 404", async () => {
    const [otherEvent] = await must(
      service
        .from("events")
        .select("id")
        .neq("tenant_id", tenantId)
        .eq("status", "published")
        .limit(1),
      "another tenant's event",
    );

    const response = await postRegistration(
      apiRequest(`/api/v1/t/${SLUG}/events/${otherEvent.id}/registrations`, {
        method: "POST",
        body: JSON.stringify({
          name: "API Registrant",
          email: uniqueEmail("api-cross"),
          party_size: 1,
        }),
      }),
      params({ tenant: SLUG, event: otherEvent.id as string }),
    );

    expect(response.status).toBe(404);
  });
});

describe("a participant waiver over the API", () => {
  // #1366. `register_for_event()` gained `p_waiver_accepted` in #686 and this
  // route did not pass it, so the parameter fell through to its `false`
  // default and adopting a waiver broke headless registration for that tenant
  // silently. No tenant has one in force today, which is exactly why it was
  // cheap to fix now and expensive to find later.
  //
  // This tenant is provisioned by this file, so a waiver adopted here reaches
  // nothing else. It is still taken away afterwards, because every later test
  // in this run registers for the same event.
  const WAIVER = {
    title: "Participant Waiver",
    last_updated: "September 22, 2026",
    summary: ["Please read this before you register."],
    sections: [
      {
        id: "risks",
        title: "Risks of taking part",
        paragraphs: ["Snow sports are dangerous."],
      },
    ],
  };

  async function register(body: Record<string, unknown>) {
    return postRegistration(
      apiRequest(`/api/v1/t/${SLUG}/events/${eventId}/registrations`, {
        method: "POST",
        body: JSON.stringify({
          name: "API Waiver Registrant",
          email: uniqueEmail("api-waiver"),
          party_size: 1,
          ...body,
        }),
      }),
      params({ tenant: SLUG, event: eventId }),
    );
  }

  beforeAll(async () => {
    // Both halves, in the order `publish_site_content()` writes them. Text
    // without a version is an agreement in force with nothing to cite, which
    // is WAIVER_UNAVAILABLE rather than anything a caller can act on.
    await must(
      service.from("site_content").insert({
        tenant_id: tenantId,
        key: "legal.waiver",
        value: WAIVER,
        published_at: new Date().toISOString(),
      }),
      "waiver text",
    );
    await must(
      service.from("legal_document_versions").insert({
        tenant_id: tenantId,
        document: "waiver",
        version: 1,
        content: WAIVER,
        effective_at: new Date().toISOString(),
        time_zone: "UTC",
      }),
      "waiver version",
    );
    await must(
      service.from("app_settings").insert({
        tenant_id: tenantId,
        key: "legal_publication.waiver",
        value: true,
      }),
      "waiver adoption",
    );
  });

  afterAll(async () => {
    await service
      .from("app_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("key", "legal_publication.waiver");
    await service
      .from("legal_document_versions")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("document", "waiver");
    await service
      .from("site_content")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("key", "legal.waiver");
  });

  test("GET /legal reports the document a caller has to accept", async () => {
    const response = await listLegal(
      apiRequest(`/api/v1/t/${SLUG}/legal`),
      tenantParams(),
    );

    expect(response.status).toBe(200);
    const body = legalResponse.parse(await response.json());
    const waiver = body.documents.find((doc) => doc.key === "waiver");
    // Where to read it, and that it is in force. Deliberately not the version:
    // serving that is out of scope for #1366, and it is why `waiver_version`
    // is optional rather than required -- a caller with nowhere to read one
    // from omits it and accepts whatever is in force.
    expect(waiver?.in_force).toBe(true);
    expect(waiver?.url).toBeTruthy();
  });

  test("a registration that accepts it is taken, and records the version", async () => {
    const response = await register({
      waiver_accepted: true,
      waiver_version: 1,
    });

    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };

    const [row] = await must(
      service
        .from("event_registrations")
        .select("waiver_accepted_at, waiver_version")
        .eq("id", id),
      "registration",
    );
    expect(row.waiver_version).toBe(1);
    expect(row.waiver_accepted_at).not.toBeNull();
  });

  test("omitting the version accepts whatever is in force", async () => {
    const response = await register({ waiver_accepted: true });

    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    const [row] = await must(
      service.from("event_registrations").select("waiver_version").eq("id", id),
      "registration",
    );
    expect(row.waiver_version).toBe(1);
  });

  test("a registration that does not accept it is a 422 naming the field", async () => {
    const response = await register({});

    expect(response.status).toBe(422);
    const body = errorResponseSchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    // What the website says here -- "tick the box" -- is advice a headless
    // caller cannot act on, so the message names where to read the document.
    expect(body.error.message).toContain("/legal");
    expect(body.error.fields?.waiver_accepted).toBeTruthy();
  });

  test("accepting a version no longer in force is a 409, not a silent upgrade", async () => {
    await must(
      service.from("legal_document_versions").insert({
        tenant_id: tenantId,
        document: "waiver",
        version: 2,
        content: WAIVER,
        effective_at: new Date().toISOString(),
        time_zone: "UTC",
      }),
      "second waiver version",
    );

    const response = await register({
      waiver_accepted: true,
      waiver_version: 1,
    });

    expect(response.status).toBe(409);
    const body = errorResponseSchema.parse(await response.json());
    expect(body.error.code).toBe("conflict");

    await service
      .from("legal_document_versions")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("document", "waiver")
      .eq("version", 2);
  });
});

describe("the photo objection record over the API", () => {
  // #599, reinterpreted by #1376. The field, its type and its optionality are
  // unchanged -- this is a published contract -- but `false` now records an
  // OBJECTION rather than a declined consent, and it is still the only
  // configuration-dependent field that is never a gate. Omitting it records
  // nothing, which is what almost every caller of almost every organization
  // does and what this platform's own registration forms now do.
  const SCOPE = [
    "We use photos and video from our events in our own newsletters, on this site, and on our social media accounts.",
  ];

  async function register(body: Record<string, unknown>) {
    const response = await postRegistration(
      apiRequest(`/api/v1/t/${SLUG}/events/${eventId}/registrations`, {
        method: "POST",
        body: JSON.stringify({
          name: "API Photo Registrant",
          email: uniqueEmail("api-photo"),
          party_size: 1,
          ...body,
        }),
      }),
      params({ tenant: SLUG, event: eventId }),
    );
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    const [row] = await must(
      service
        .from("event_registrations")
        .select("photo_consent, photo_consent_text")
        .eq("id", id),
      "registration",
    );
    return row;
  }

  async function writeScope() {
    await must(
      service.from("site_content").upsert(
        {
          tenant_id: tenantId,
          key: "events.photo_consent",
          value: SCOPE,
          published_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,key" },
      ),
      "photo consent scope",
    );
  }

  afterAll(async () => {
    await service
      .from("site_content")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("key", "events.photo_consent");
  });

  test("an organization publishing nothing records nothing, whatever is sent", async () => {
    expect(await register({ photo_consent: true })).toEqual({
      photo_consent: null,
      photo_consent_text: null,
    });
  });

  test("GET /content is where an integrator reads the paragraphs", async () => {
    await writeScope();
    const response = await getContent(
      apiRequest(`/api/v1/t/${SLUG}/content`),
      tenantParams(),
    );

    expect(response.status).toBe(200);
    const body = contentResponse.parse(await response.json());
    expect(body.content["events.photo_consent"]).toEqual(SCOPE);
  });

  test("a false is recorded as an objection, and the registration is still taken", async () => {
    await writeScope();
    const row = await register({ photo_consent: false });

    expect(row.photo_consent).toBe(false);
    // The text comes from the organization's own row, never from the body.
    expect(row.photo_consent_text).toBe(SCOPE.join("\n\n"));
  });

  test("omitting it records nothing, and nothing is never an objection", async () => {
    await writeScope();
    expect(await register({})).toEqual({
      photo_consent: null,
      photo_consent_text: null,
    });
  });
});

describe("a disabled module is a 404, not a hint", () => {
  test("registration is refused, and says nothing about modules", async () => {
    await must(
      service
        .from("tenant_modules")
        .upsert(
          { tenant_id: tenantId, module_key: "events", enabled: false },
          { onConflict: "tenant_id,module_key" },
        )
        .select("tenant_id"),
      "events off",
    );

    try {
      const response = await postRegistration(
        apiRequest(`/api/v1/t/${SLUG}/events/${eventId}/registrations`, {
          method: "POST",
          body: JSON.stringify({
            name: "API Registrant",
            email: uniqueEmail("api-gated"),
            party_size: 1,
          }),
        }),
        params({ tenant: SLUG, event: eventId }),
      );

      expect(response.status).toBe(404);
      const parsed = errorResponseSchema.parse(await response.json());
      expect(parsed.error.code).toBe("not_found");
      expect(parsed.error.message).not.toContain("module");
    } finally {
      await service
        .from("tenant_modules")
        .upsert(
          { tenant_id: tenantId, module_key: "events", enabled: true },
          { onConflict: "tenant_id,module_key" },
        );
    }
  });
});

describe("cross-origin rules", () => {
  async function allowOrigins(origins: string[]) {
    await must(
      service
        .from("tenants")
        .update({ allowed_origins: origins })
        .eq("id", tenantId)
        .select("id"),
      "allowed_origins",
    );
  }

  test("a browser origin nobody allow-listed is refused", async () => {
    await allowOrigins([]);
    const response = await postContact(
      apiRequest(`/api/v1/t/${SLUG}/contact`, {
        method: "POST",
        origin: EMBED_ORIGIN,
        body: JSON.stringify({
          name: "API Caller",
          email: uniqueEmail("api-origin"),
          message: "From an origin nobody vouched for.",
        }),
      }),
      tenantParams(),
    );

    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      "origin_not_allowed",
    );
  });

  test("an allow-listed origin posts, and gets its origin echoed back", async () => {
    await allowOrigins([EMBED_ORIGIN]);
    try {
      const response = await postContact(
        apiRequest(`/api/v1/t/${SLUG}/contact`, {
          method: "POST",
          origin: EMBED_ORIGIN,
          body: JSON.stringify({
            name: "API Caller",
            email: uniqueEmail("api-origin-ok"),
            message: "From the organization's own embed.",
          }),
        }),
        tenantParams(),
      );

      expect(response.status).toBe(201);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        EMBED_ORIGIN,
      );
      // A shared cache that missed this would hand one customer's embed
      // another customer's allowance.
      expect(response.headers.get("vary")).toBe("Origin");
    } finally {
      await allowOrigins([]);
    }
  });

  test("no Origin at all posts: CORS is a browser rule, not a gate", async () => {
    await allowOrigins([]);
    const response = await postContact(
      apiRequest(`/api/v1/t/${SLUG}/contact`, {
        method: "POST",
        body: JSON.stringify({
          name: "API Caller",
          email: uniqueEmail("api-server"),
          message: "Server to server, no Origin header.",
        }),
      }),
      tenantParams(),
    );

    expect(response.status).toBe(201);
  });

  test("preflight answers only for an allow-listed origin", async () => {
    await allowOrigins([EMBED_ORIGIN]);
    try {
      const allowed = await optionsContact(
        apiRequest(`/api/v1/t/${SLUG}/contact`, {
          method: "OPTIONS",
          origin: EMBED_ORIGIN,
        }),
        tenantParams(),
      );
      expect(allowed.status).toBe(204);
      expect(allowed.headers.get("access-control-allow-origin")).toBe(
        EMBED_ORIGIN,
      );

      const refused = await optionsContact(
        apiRequest(`/api/v1/t/${SLUG}/contact`, {
          method: "OPTIONS",
          origin: "https://somewhere.else.example",
        }),
        tenantParams(),
      );
      // A 204 with no allow-origin is what makes the browser refuse the POST
      // that would have followed.
      expect(refused.status).toBe(204);
      expect(refused.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await allowOrigins([]);
    }
  });
});

type JsonSchema = {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  properties?: Record<string, unknown>;
};

/** Follows a local `#/$defs/Name` reference. Anything else is already resolved. */
function resolveRef(schema: JsonSchema, root: JsonSchema = schema): JsonSchema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.replace("#/$defs/", "");
  const target = (root.$defs ?? schema.$defs)?.[name];
  if (!target) throw new Error(`unresolvable $ref: ${schema.$ref}`);
  return target;
}

describe("the published document describes this API", () => {
  const document = openApiDocument("https://example.test") as {
    paths: Record<string, Record<string, unknown>>;
    info: { description: string };
  };

  test("every endpoint is in it", () => {
    const paths = Object.keys(document.paths);
    expect(paths).toContain("/api/v1/t/{tenant}/site");
    expect(paths).toContain("/api/v1/t/{tenant}/events/{event}/registrations");
    expect(paths.length).toBeGreaterThanOrEqual(22);
  });

  test("the content schema is generated from the slot registry", () => {
    // #888's invariant, as documentation: a slot added to the registry is in
    // the response and in the document in the same commit, because both
    // iterate the same array.
    //
    // The schema is `$ref`-and-`$defs` shaped, which is what naming the
    // schemas buys -- a generated client gets a `ContentResponse` type rather
    // than an anonymous object -- so the reference is followed here.
    const schema = (
      document.paths["/api/v1/t/{tenant}/content"].get as {
        responses: Record<
          string,
          { content: { "application/json": { schema: JsonSchema } } }
        >;
      }
    ).responses["200"].content["application/json"].schema;

    const resolved = resolveRef(schema);
    const content = resolveRef(
      resolved.properties!.content as JsonSchema,
      schema,
    );

    expect(Object.keys(content.properties!).sort()).toEqual(
      SITE_CONTENT_SLOTS.map((slot) => slot.key).sort(),
    );
  });

  test("it says artwork submissions are not in v1", () => {
    expect(document.info.description).toContain("Not in v1");
  });
});
