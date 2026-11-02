// Shared fixtures for *.integration.test.ts files, which run against a real
// local Supabase stack (`bun run db:start && bun run db:reset`) rather than
// mocking the Supabase client. Run via `bun run test:integration`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { todayInZone } from "@/lib/time";

/**
 * The seeded tenant's reporting zone (`app_settings.org.timezone`, pinned in
 * supabase/seed.sql). Reports and dashboard windows are cut on the
 * organization's days rather than the database's UTC days (#1065), so a
 * fixture meaning "today" has to mean the same day they do -- on a UTC CI
 * runner, `new Date().toISOString()` is already tomorrow for six hours every
 * evening, which is precisely the defect that decision exists to fix.
 */
export const TENANT_TIME_ZONE = "America/Denver";

/** Today as the seeded tenant has it, "YYYY-MM-DD". */
export function tenantToday() {
  return todayInZone(TENANT_TIME_ZONE);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Every client here disables session persistence/auto-refresh: supabase-js's
// default storage adapter keys sessions by URL, not by client instance, so
// without this every createClient() call against the same local stack
// would share (and leak) whichever session was signed in most recently.
export type ClientOptions = {
  /**
   * Host to present as `x-tenant-host`, the header `createSupabaseServerClient`
   * stamps from the request Host. A sessionless call resolves its tenant from
   * it (`public_tenant_id()`, #707 Phase 3); without one, and with more than
   * one active tenant, the public views and intake RPCs resolve nothing.
   */
  host?: string;
  /**
   * Tenant slug to present as `x-tenant-slug` (#813 Phase 2), the header a
   * consumer on another origin names its tenant with when it has no
   * meaningful Host to offer. It beats `host` where both are sent, and a slug
   * naming no active tenant resolves to nothing rather than falling through.
   *
   * Pass the empty string to send the header blank, which is treated as not
   * sending it at all.
   */
  slug?: string;
  /**
   * Event id to present as `x-event-preview` (#1764), the header the staff
   * preview page sends so the public views also show that one event to its
   * manager.
   */
  preview?: string;
};

export function anonClient(options: ClientOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.host) headers["x-tenant-host"] = options.host;
  if (options.slug !== undefined) headers["x-tenant-slug"] = options.slug;
  if (options.preview) headers["x-event-preview"] = options.preview;

  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: Object.keys(headers).length > 0 ? { headers } : undefined,
  });
}

export async function signIn(
  email: string,
  password = "password123",
  options: ClientOptions = {},
) {
  const client = anonClient(options);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

const roleClients = new Map<string, Promise<SupabaseClient>>();

// Memoized signIn(): GoTrue rate-limits sign-ins per IP over a 5-minute
// window (auth.rate_limit.sign_in_sign_ups in supabase/config.toml), and a
// seeded role account's session carries no per-test state, so files that
// exercise a whole permission matrix should reuse one client per account
// instead of re-authenticating in every case.
export function signInAs(email: string): Promise<SupabaseClient> {
  let client = roleClients.get(email);
  if (!client) {
    client = signIn(email);
    roleClients.set(email, client);
  }
  return client;
}

// The 8 fixed accounts seeded by supabase/seed.sql (local stack only),
// all password "password123".
export const SEEDED_USERS = {
  admin: "admin@example.test",
  coordinator: "coordinator@example.test",
  finance: "finance@example.test",
  board: "board@example.test",
  volunteer: "volunteer@example.test",
  multi: "multi@example.test",
  noAccess: "noaccess@example.test",
  former: "former@example.test",
} as const;

// A signed-in admin session, used for fixture setup/cleanup, rather than the
// raw service-role client (createSupabaseAdminClient() in
// src/lib/supabase/admin.ts -- usable for direct table access since #221's
// grant migration, but still not what fixtures should exercise): signing in
// as the seeded admin account (which has "manage" on every resource)
// exercises the same authenticated+RLS path the app actually uses and has
// access to everything fixtures need.
export const adminClient = await signIn(SEEDED_USERS.admin);

// The fixture builders below take an optional trailing `as` client, defaulting
// to that session. Almost every file wants the default -- one tenant, one
// admin -- but a file that provisions a tenant of its own has to write through
// *that* tenant's admin, because `tenant_id` comes from the column default and
// `default_tenant_id()` follows the caller's session. Passing the client is
// what keeps such a file's rows out of the seeded tenant (#1379); the cleanup
// each builder returns closes over the same client, so a fixture is removed by
// whoever created it.

// The four sessions a dashboard/report read must never hand privileged
// figures to (#746): signed out, the narrow-carve-out `volunteer` role, a
// signed-in account holding no role at all, and a deactivated member who
// still holds one. `volunteer` is listed here because it is unprivileged for
// finance/governance/inventory/audit purposes, not because it sees nothing --
// it does hold events/volunteers/programs/content_calendar at `view`, so
// files asserting on a resource it legitimately reads spell that case out
// separately rather than looping over this list.
export async function unprivilegedActors(): Promise<
  { name: string; client: SupabaseClient }[]
> {
  return [
    { name: "anonymous", client: anonClient() },
    { name: "volunteer", client: await signInAs(SEEDED_USERS.volunteer) },
    { name: "no-role", client: await signInAs(SEEDED_USERS.noAccess) },
    { name: "deactivated", client: await signInAs(SEEDED_USERS.former) },
  ];
}

// Random, not sequential: the rate limiter keys on (route, ip) over a
// 15-minute window, so a counter that restarts at 1 on every process would
// collide with IPs used by a previous run within that window.
export function uniqueIp() {
  const octet = () => Math.floor(Math.random() * 256);
  return `10.${octet()}.${octet()}.${octet()}`;
}

export function uniqueEmail(tag: string) {
  return `it-${tag}-${crypto.randomUUID()}@example.test`;
}

type EventOverrides = {
  name?: string;
  visibility?: "public" | "private";
  status?: "draft" | "published" | "cancelled" | "archived";
  registration_enabled?: boolean;
  registration_deadline?: string | null;
  capacity?: number | null;
  auto_assign_discount_codes?: boolean;
  startsAt?: string;
  endsAt?: string | null;
  timezone?: string;
  /** Defaults to the column's own 'not_started'. */
  reportStatus?: "not_started" | "in_progress" | "submitted";
  eventLeadId?: string | null;
};

export async function createPublishedEvent(
  overrides: EventOverrides = {},
  as: SupabaseClient = adminClient,
) {
  const name =
    overrides.name ?? `Integration test event ${crypto.randomUUID()}`;
  const { data, error } = await as
    .from("events")
    .insert({
      name,
      starts_at:
        overrides.startsAt ??
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ends_at: overrides.endsAt ?? null,
      timezone: overrides.timezone ?? "America/Chicago",
      visibility: overrides.visibility ?? "public",
      status: overrides.status ?? "published",
      registration_enabled: overrides.registration_enabled ?? true,
      registration_deadline: overrides.registration_deadline ?? null,
      capacity: overrides.capacity ?? null,
      auto_assign_discount_codes: overrides.auto_assign_discount_codes ?? false,
      ...(overrides.reportStatus
        ? { report_status: overrides.reportStatus }
        : {}),
      ...(overrides.eventLeadId
        ? { event_lead_id: overrides.eventLeadId }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    name,
    cleanup: () => deleteEvent(id, as),
  };
}

// The event's own child rows, from the blocker registry in
// event_linked_record_labels (20260903060000) -- specifically its `on delete
// cascade` half, which has no meaning apart from the event. The registry's
// other half (donations, expenses, revenue, reimbursements) are independent
// records that merely reference the event, so a fixture cleanup must not
// delete them; a test that creates one cleans it up itself, and until it
// does, deleteEvent() below fails loudly rather than leaking.
const EVENT_CHILD_TABLES = [
  "event_registrations",
  "event_sponsors",
  "event_staff",
  "event_volunteers",
  "event_shifts",
  "event_incidents",
  "discount_codes",
  "giveaways",
  "volunteer_hours",
  "event_media",
] as const;

/**
 * Deletes a fixture event, detaching its children first.
 *
 * 20260903060000 keeps an event deletable only while nothing is attached to
 * it, so `delete from events` alone is refused for any fixture that
 * registered someone, rostered a volunteer or added a sponsor. That refusal
 * used to pass silently, stranding the event -- and every `people` row it
 * referenced -- in the shared local stack for every later run, which is what
 * makes test/seed-shape.integration.test.ts's absolute row counts drift.
 * Both halves matter: detach what belongs to the event, then throw if the
 * delete is still refused, so the next fixture to attach something the
 * registry blocks on finds out immediately instead of leaking.
 */
export async function deleteEvent(
  eventId: string,
  as: SupabaseClient = adminClient,
) {
  for (const table of EVENT_CHILD_TABLES) {
    const { error } = await as.from(table).delete().eq("event_id", eventId);
    if (error) throw error;
  }
  const { error } = await as.from("events").delete().eq("id", eventId);
  if (error) throw error;
}

export async function countEventRegistrations(eventId: string, email: string) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .select("id")
    .eq("event_id", eventId)
    .ilike("email", email);
  if (error) throw error;
  return data.length;
}

export async function cleanupDonation(
  donationId: string,
  as: SupabaseClient = adminClient,
) {
  const { data: donation } = await as
    .from("donations")
    .select("donor_id")
    .eq("id", donationId)
    .single();

  const { data: items } = await as
    .from("inventory_items")
    .select("id")
    .eq("donation_id", donationId);
  const itemIds = (items ?? []).map((item) => item.id as string);
  if (itemIds.length) {
    // A public request's header (#1032) outlives its movements by design,
    // so it has to be found through them before they go. Through the
    // service role: gear_requests has no delete grant for anyone else.
    const { data: holds } = await as
      .from("inventory_movements")
      .select("gear_request_id")
      .in("inventory_item_id", itemIds)
      .not("gear_request_id", "is", null);
    await as
      .from("inventory_movements")
      .delete()
      .in("inventory_item_id", itemIds);
    const requestIds = [
      ...new Set((holds ?? []).map((hold) => hold.gear_request_id as string)),
    ];
    if (requestIds.length) {
      await serviceRoleClient()
        .from("gear_requests")
        .delete()
        .in("id", requestIds);
    }
  }
  await as.from("inventory_items").delete().eq("donation_id", donationId);
  await as.from("donations").delete().eq("id", donationId);

  // Each test's donation gets its own fresh (email-less, so never deduped)
  // `people` row -- safe to delete once nothing references it any more.
  if (donation?.donor_id) {
    await as.from("people").delete().eq("id", donation.donor_id);
  }
}

// Creates `count` fresh, available inventory items via the real
// create_donation_with_items RPC (same path portal donation intake uses),
// for tests exercising the public gear request/cart flows.
export async function createAvailableGearItems(
  count: number,
  overrides: {
    categoryKey?: string;
    condition?: string;
    intendedUse?: string;
  } = {},
  as: SupabaseClient = adminClient,
) {
  const items = Array.from({ length: count }, () => ({
    description: `Integration test item ${crypto.randomUUID()}`,
    category_key: overrides.categoryKey ?? "snowboard",
    condition: overrides.condition ?? "good",
    intended_use: overrides.intendedUse ?? "gear_library",
  }));

  const { data, error } = await as.rpc("create_donation_with_items", {
    p_donor_name: `Integration Test Donor ${crypto.randomUUID()}`,
    p_donor_is_anonymous: false,
    p_donor_source_type: "individual",
    p_donor_email: null,
    p_donor_phone: null,
    p_donor_notes: null,
    p_items: items,
  });
  if (error) throw error;

  const row = data![0] as { donation_id: string; inventory_item_ids: string[] };
  return {
    itemIds: row.inventory_item_ids,
    async cleanup() {
      await cleanupDonation(row.donation_id, as);
    },
  };
}

/**
 * Takes the asset-tag codes intake gave these items (#1420 part 4) back off,
 * so they stand in for an item received before intake coded anything -- the
 * case the on-demand "Create codes" path on the label page exists for.
 */
export async function removeAssetTags(itemIds: string[]) {
  const { error } = await adminClient
    .from("inventory_item_tags")
    .delete()
    .eq("kind", "asset_tag")
    .in("item_id", itemIds);
  if (error) throw error;
}

// A single fresh `donations` row (with its one backing item and donor
// `people` row), for tests exercising `donations` table access directly --
// unlike createAvailableGearItems, this exposes the donation id itself
// rather than just its items' ids.
export async function createDonation() {
  const { data, error } = await adminClient.rpc("create_donation_with_items", {
    p_donor_name: `Integration Test Donor ${crypto.randomUUID()}`,
    p_donor_is_anonymous: false,
    p_donor_source_type: "individual",
    p_donor_email: null,
    p_donor_phone: null,
    p_donor_notes: null,
    p_items: [
      {
        description: `Integration test item ${crypto.randomUUID()}`,
        category_key: "jacket",
        condition: "good",
      },
    ],
  });
  if (error) throw error;

  const row = data![0] as { donation_id: string };
  return {
    id: row.donation_id,
    async cleanup() {
      await cleanupDonation(row.donation_id);
    },
  };
}

// A single fresh `monetary_donations` row (a cash gift, not in-kind intake),
// for tests exercising the Finance > Donations actions and the finance
// report rollup. Anonymous by default (donor_id null); pass overrides to
// link a donor or event, or to place it in a specific reporting period.
export async function createMonetaryDonation(
  overrides: {
    donorId?: string | null;
    eventId?: string | null;
    amount?: number;
    method?: string;
    receivedDate?: string;
    notes?: string | null;
  } = {},
) {
  const { data, error } = await adminClient
    .from("monetary_donations")
    .insert({
      donor_id: overrides.donorId ?? null,
      event_id: overrides.eventId ?? null,
      amount: overrides.amount ?? 25,
      method: overrides.method ?? "cash",
      received_date: overrides.receivedDate ?? tenantToday(),
      notes: overrides.notes ?? `Integration test gift ${crypto.randomUUID()}`,
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("monetary_donations").delete().eq("id", id);
    },
  };
}

type CalendarItemOverrides = {
  title?: string;
  itemType?: string;
  startsAt?: string;
  timeZone?: string;
  priorityTier?: 1 | 2 | 3;
  calendarStatus?: "idea" | "active" | "complete" | "archived";
  visibility?: "public" | "internal" | "unlisted_draft";
  isSensitiveTopic?: boolean;
  toneGuidance?: string | null;
  categories?: string[];
  seriesKey?: string | null;
  recurrenceStartMonth?: number | null;
  recurrenceStartDay?: number | null;
  recurrenceEndMonth?: number | null;
  recurrenceEndDay?: number | null;
  recurrenceEndIsMonthEnd?: boolean;
};

// A fresh `calendar_items` row, for the content/community calendar action
// tests. Junction rows (categories/programs/links) and the item's
// content_opportunities row all reference calendar_items with
// `on delete cascade`, so deleting the item is sufficient cleanup.
export async function createCalendarItem(
  overrides: CalendarItemOverrides = {},
) {
  const { data, error } = await adminClient
    .from("calendar_items")
    .insert({
      title:
        overrides.title ??
        `Integration test calendar item ${crypto.randomUUID()}`,
      item_type: overrides.itemType ?? "community_observance",
      starts_at:
        overrides.startsAt ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      time_zone: overrides.timeZone ?? "America/Denver",
      priority_tier: overrides.priorityTier ?? 3,
      calendar_status: overrides.calendarStatus ?? "idea",
      visibility: overrides.visibility ?? "internal",
      is_sensitive_topic: overrides.isSensitiveTopic ?? false,
      tone_guidance: overrides.toneGuidance ?? null,
      series_key: overrides.seriesKey ?? null,
      recurrence_start_month: overrides.recurrenceStartMonth ?? null,
      recurrence_start_day: overrides.recurrenceStartDay ?? null,
      recurrence_end_month: overrides.recurrenceEndMonth ?? null,
      recurrence_end_day: overrides.recurrenceEndDay ?? null,
      recurrence_end_is_month_end: overrides.recurrenceEndIsMonthEnd ?? false,
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  if (overrides.categories?.length) {
    const { error: categoryError } = await adminClient
      .from("calendar_item_categories")
      .insert(
        overrides.categories.map((category) => ({ item_id: id, category })),
      );
    if (categoryError) throw categoryError;
  }

  return {
    id,
    async cleanup() {
      await adminClient.from("calendar_items").delete().eq("id", id);
    },
  };
}

// A content piece on an existing calendar item -- several per item since
// #1231. Rows cascade from the calendar item, so callers that created the
// item usually only need its cleanup.
export async function createContentPiece(
  calendarItemId: string,
  overrides: {
    title?: string;
    contentStatus?: string;
    publishDueAt?: string | null;
  } = {},
) {
  const { data, error } = await adminClient
    .from("content_opportunities")
    .insert({
      calendar_item_id: calendarItemId,
      title: overrides.title ?? `Integration test piece ${crypto.randomUUID()}`,
      content_status: overrides.contentStatus ?? "idea",
      publish_due_at: overrides.publishDueAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("content_opportunities").delete().eq("id", id);
    },
  };
}

// A fresh `programs` row, for tests that need a valid program FK target
// (e.g. calendar_program_suggestion_rules) without colliding with seeded
// rules on the seeded program.
export async function createProgram() {
  const { data, error } = await adminClient
    .from("programs")
    .insert({
      name: `Integration Test Program ${crypto.randomUUID()}`,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("programs").delete().eq("id", id);
    },
  };
}

export async function getInventoryItemStatus(itemId: string) {
  const { data, error } = await adminClient
    .from("inventory_items")
    .select("status")
    .eq("id", itemId)
    .single();
  if (error) throw error;
  return data.status as string;
}

// A bare `people` row, for tests that just need a valid FK target (a
// resolution's mover/seconder, a distribution's recipient, a reimbursement's
// payee) without the donor-specific fields `createAvailableGearItems` sets up
// via `create_donation_with_items`.
export async function createPerson(
  overrides: { name?: string; email?: string; person_type?: string } = {},
  as: SupabaseClient = adminClient,
) {
  const { data, error } = await as
    .from("people")
    .insert({
      name: overrides.name ?? `Integration Test Person ${crypto.randomUUID()}`,
      source_type: "individual",
      // Only set when a test cares: people.email is unique, so a default here
      // would make two fixtures in one test collide.
      ...(overrides.email ? { email: overrides.email } : {}),
      ...(overrides.person_type ? { person_type: overrides.person_type } : {}),
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await as.from("people").delete().eq("id", id);
    },
  };
}

// A single `governance_meetings` row, for tests exercising a meeting's child
// records (agenda, minutes, action items). Every table keyed on `meeting_id`
// declares `on delete cascade`, so deleting the meeting is sufficient
// cleanup for its children too.
export async function createGovernanceMeeting(
  overrides: {
    meetingDate?: string;
    status?: string;
    meetingType?: string;
  } = {},
) {
  const { data, error } = await adminClient
    .from("governance_meetings")
    .insert({
      meeting_date:
        overrides.meetingDate ??
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      meeting_type: overrides.meetingType ?? "board",
      status: overrides.status ?? "scheduled",
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("governance_meetings").delete().eq("id", id);
    },
  };
}

// `contact_messages` grants `select` to authenticated and nothing else
// (20260826180000): rows only ever arrive through the SECURITY DEFINER
// submit_contact_message() RPC, so the seeded-admin client can read
// submissions but has no way to delete them. Fixture cleanup goes through
// the service-role key instead, which bypasses RLS and holds every table
// grant since #221's migration (20260826320000). Created lazily so files
// that never touch contact_messages don't need SUPABASE_SECRET_KEY set.
//
// Exported for the same reason the helpers below use it: some fixtures cannot
// be created through a signed-in client at all. Provisioning a tenant
// (#707, 20260905180000) is one -- `tenants` deliberately has no insert
// policy for authenticated, because creating one is a platform operation.
let serviceRoleClientInstance: SupabaseClient | null = null;
export function serviceRoleClient() {
  serviceRoleClientInstance ??= createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return serviceRoleClientInstance;
}

export async function findContactMessages(email: string) {
  const { data, error } = await adminClient
    .from("contact_messages")
    .select("id, name, email, topic, message")
    .ilike("email", email);
  if (error) throw error;
  return data;
}

export async function deleteContactMessages(email: string) {
  const { error } = await serviceRoleClient()
    .from("contact_messages")
    .delete()
    .ilike("email", email);
  if (error) throw error;
}

// public.user_onboarding (20260902060000) grants select/insert/update to
// authenticated and no delete, and every policy on it is self-scoped -- that
// is the whole point of the table, so a fixture genuinely cannot reach another
// account's row, or remove its own, through a signed-in client. Same situation
// as contact_messages above: these go through the service-role key instead.
// supabase/seed.sql gives every seeded account a completed tour and a
// far-future release pointer, so tests that need a different starting state
// have to set it explicitly.
export async function setOnboarding(
  userId: string,
  fields: {
    first_seen_at?: string;
    welcome_completed_at?: string | null;
    last_release_seen?: string | null;
  },
) {
  const { error } = await serviceRoleClient()
    .from("user_onboarding")
    .update(fields)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteOnboarding(userId: string) {
  const { error } = await serviceRoleClient()
    .from("user_onboarding")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

type VolunteerApplicationOverrides = {
  name?: string;
  email?: string;
  phone?: string | null;
  roleInterest?: string | null;
  availability?: string | null;
  status?: string;
};

// `volunteer_applications` has no insert grant at all -- the public
// submit_volunteer_application() RPC is the only way in (20260827010000) --
// so fixtures go through it exactly as an anonymous visitor would, then
// adjust the status afterwards when a test needs something other than the
// 'new' default.
export async function createVolunteerApplication(
  overrides: VolunteerApplicationOverrides = {},
) {
  const email = overrides.email ?? uniqueEmail("vol-app");
  const { data: referenceCode, error } = await anonClient().rpc(
    "submit_volunteer_application",
    {
      p_name:
        overrides.name ?? `Integration Test Applicant ${crypto.randomUUID()}`,
      p_email: email,
      p_phone: overrides.phone ?? null,
      p_role_interest: overrides.roleInterest ?? "Ride Buddy",
      p_availability: overrides.availability ?? "Weekends",
      p_honeypot: null,
      // A fresh IP per fixture: the RPC's own per-IP rate limit (5 per 15
      // minutes) would otherwise start rejecting fixtures partway through a
      // file that creates several.
      p_ip_address: uniqueIp(),
    },
  );
  if (error) throw error;

  // The RPC returns the applicant-facing reference code, not the row id
  // (see 20260827010000), so resolve the actual row from it.
  const { data: row, error: rowError } = await adminClient
    .from("volunteer_applications")
    .select("id")
    .eq("reference_code", referenceCode as string)
    .single();
  if (rowError) throw rowError;

  const id = row.id as string;

  if (overrides.status) {
    const { error: statusError } = await adminClient
      .from("volunteer_applications")
      .update({ status: overrides.status })
      .eq("id", id);
    if (statusError) throw statusError;
  }

  return {
    id,
    email,
    referenceCode: referenceCode as string,
    async cleanup() {
      await deleteVolunteerApplications(email);
    },
  };
}

export async function findVolunteerApplications(email: string) {
  const { data, error } = await adminClient
    .from("volunteer_applications")
    .select(
      "id, person_id, name, email, phone, pronouns, role_interest, availability, reference_code, status",
    )
    .ilike("email", email);
  if (error) throw error;
  return data;
}

// Cleanup keyed on email rather than id, since a test exercising the public
// action only knows what it submitted. Also removes the backing `people` row
// resolve_or_create_person_by_email() created behind each application --
// nothing else references it once the application is gone.
export async function deleteVolunteerApplications(email: string) {
  for (const row of await findVolunteerApplications(email)) {
    await adminClient
      .from("volunteer_applications")
      .delete()
      .eq("id", row.id as string);
    await adminClient
      .from("people")
      .delete()
      .eq("id", row.person_id as string);
  }
}

/**
 * A fixture's undo for one `tenant_modules` row: the value that was there
 * before, or `null` for "there was no row".
 */
async function captureModule(
  tenantId: string,
  moduleKey: string,
): Promise<() => Promise<void>> {
  const service = serviceRoleClient();
  const { data, error } = await service
    .from("tenant_modules")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (error) throw new Error(`read ${moduleKey}: ${error.message}`);
  const found: boolean | null = data?.enabled ?? null;

  return async () => {
    const { error: restoreError } =
      found === null
        ? await service
            .from("tenant_modules")
            .delete()
            .eq("tenant_id", tenantId)
            .eq("module_key", moduleKey)
        : await service
            .from("tenant_modules")
            .upsert(
              { tenant_id: tenantId, module_key: moduleKey, enabled: found },
              { onConflict: "tenant_id,module_key" },
            );
    if (restoreError) {
      throw new Error(`restore ${moduleKey}: ${restoreError.message}`);
    }
  };
}

/**
 * Sets one module for a tenant the fixture did not create, and hands back the
 * undo.
 *
 * Restoring is not the same as deleting the row, and it is not the same as
 * writing the value you assume was there. The seeded tenant has an opinion on
 * every module: 20260910010000 backfills one row per `plan_modules` entry, and
 * `supabase/seed.sql` adds `constituent_accounts = true` on top (#1175) --
 * that last row is what makes `/my`, `/my/sign-in` and `/portal/people/claims`
 * exist locally, and what the a11y constituent sweep and the e2e specs run
 * against. A file that deleted it in `afterAll` dropped the tenant back to the
 * plan/catalog default of `false` and left the constituent area switched off
 * until the next `bun run db:reset`, with nothing in the run failing to say
 * so: the next thing to touch `/my` got a `notFound()` from
 * `requireConstituentArea()`, and the check that hit it blamed whatever code
 * was being worked on (#1282).
 *
 * So: leave the tenant as you found it, not as the catalog would have it.
 */
export async function setModule(
  tenantId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<() => Promise<void>> {
  const restore = await captureModule(tenantId, moduleKey);
  const { error } = await serviceRoleClient()
    .from("tenant_modules")
    .upsert(
      { tenant_id: tenantId, module_key: moduleKey, enabled },
      { onConflict: "tenant_id,module_key" },
    );
  if (error) throw new Error(`set ${moduleKey}: ${error.message}`);
  return restore;
}

/** `setModule(..., true)`, which is what a file-level fixture nearly always wants. */
export function enableModule(
  tenantId: string,
  moduleKey: string,
): Promise<() => Promise<void>> {
  return setModule(tenantId, moduleKey, true);
}

/**
 * Puts a tenant back to having said nothing about a module, and hands back the
 * undo.
 *
 * For a test whose subject is the catalog default rather than a tenant's
 * answer. It has to be a fixture and not an ambient condition for the reason
 * above: the seeded tenant has a row for every module, so a file that needs
 * the absence has to make it and give it back (#1282).
 */
export async function removeModuleRow(
  tenantId: string,
  moduleKey: string,
): Promise<() => Promise<void>> {
  const restore = await captureModule(tenantId, moduleKey);
  const { error } = await serviceRoleClient()
    .from("tenant_modules")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey);
  if (error) throw new Error(`remove ${moduleKey}: ${error.message}`);
  return restore;
}

/** `setModule` around one test, for the off-case tests that switch and switch back. */
export async function withModule(
  tenantId: string,
  moduleKey: string,
  enabled: boolean,
  body: () => Promise<void>,
): Promise<void> {
  const restore = await setModule(tenantId, moduleKey, enabled);
  try {
    await body();
  } finally {
    await restore();
  }
}

/** The one tenant `bun run db:reset` leaves behind (docs/tenants.md). */
export async function seededTenantId(): Promise<string> {
  const { data, error } = await serviceRoleClient()
    .from("tenants")
    .select("id")
    .eq("slug", "example-nonprofit")
    .single();
  if (error) throw new Error(`seeded tenant: ${error.message}`);
  return data.id as string;
}

const RIDER_KEYS = [
  "riding_discipline",
  "ski_level",
  "snowboard_level",
  "preferred_mountain",
] as const;

/**
 * Makes sure the seeded tenant has the four rider questions and two metric
 * rows supabase/seed.sql gives it (#1746). Another suite may have replaced
 * the tenant's questions -- they are tenant-wide -- so a suite that relies on
 * them calls this rather than trusting the seed survived.
 */
export async function ensureRiderQuestions() {
  const { data: present } = await adminClient
    .from("person_questions")
    .select("key")
    .in("key", [...RIDER_KEYS])
    .is("archived_at", null);
  const { data: metrics } = await adminClient
    .from("person_answer_metrics")
    .select("key")
    .in("key", ["beginner_participants", "first_time_on_snow"]);
  if ((present?.length ?? 0) === 4 && (metrics?.length ?? 0) === 2) return;

  const tenantId = await seededTenantId();
  const service = serviceRoleClient();
  await service.from("person_answers").delete().eq("tenant_id", tenantId);
  await service
    .from("person_answer_metrics")
    .delete()
    .eq("tenant_id", tenantId);
  await service.from("person_questions").delete().eq("tenant_id", tenantId);

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
  const levels = (first: string) => [
    option("first_time", first),
    option("beginner", "Beginner"),
    option("intermediate", "Intermediate"),
    option("advanced", "Advanced"),
  ];
  const discipline = crypto.randomUUID();
  const ski = crypto.randomUUID();
  const snowboard = crypto.randomUUID();
  const where = { ask_after_registration: true, ask_on_my_details: true };
  const on = (keys: string[]) => ({
    question_id: discipline,
    option_ids: disciplines
      .filter((o) => keys.includes(o.key))
      .map((o) => o.id),
  });
  const saved = await adminClient.rpc("save_person_questions", {
    p_questions: [
      {
        id: discipline,
        key: "riding_discipline",
        kind: "single_choice",
        prompt: "Do you ski or ride?",
        column_label: "Rides",
        options: disciplines,
        snapshot_at_checkin: true,
        ...where,
      },
      {
        id: ski,
        key: "ski_level",
        kind: "single_choice",
        prompt: "How would you describe your skiing?",
        column_label: "Ski level",
        required: true,
        options: levels("First time on skis"),
        show_if: on(["ski", "both"]),
        snapshot_at_checkin: true,
        ...where,
      },
      {
        id: snowboard,
        key: "snowboard_level",
        kind: "single_choice",
        prompt: "How would you describe your snowboarding?",
        column_label: "Board level",
        required: true,
        options: levels("First time on a snowboard"),
        show_if: on(["snowboard", "both"]),
        snapshot_at_checkin: true,
        ...where,
      },
      {
        id: crypto.randomUUID(),
        key: "preferred_mountain",
        kind: "single_choice",
        prompt: "Which mountain do you usually ride?",
        column_label: "Mountain",
        allow_other: true,
        options: [option("hunter", "Hunter"), option("windham", "Windham")],
        ...where,
      },
    ],
  });
  if (saved.error) throw saved.error;
  const metricsSaved = await adminClient.rpc("save_person_answer_metrics", {
    p_metrics: [
      {
        id: crypto.randomUUID(),
        key: "beginner_participants",
        label: "Beginner participants",
        rule: "any",
        question_ids: [ski, snowboard],
        option_keys: ["beginner"],
      },
      {
        id: crypto.randomUUID(),
        key: "first_time_on_snow",
        label: "First time on snow",
        rule: "any",
        question_ids: [ski, snowboard],
        option_keys: ["first_time"],
      },
    ],
  });
  if (metricsSaved.error) throw metricsSaved.error;
}

/**
 * Sets a person's answers to the seeded tenant's profile questions (#1746,
 * seeded like Chatter Snow's rider profile), by question key and option key,
 * through set_person_answers() as the admin -- which clears any question it is
 * not sent, so pass the whole set.
 */
export async function setProfileAnswers(
  personId: string,
  answers: Record<string, string>,
) {
  await ensureRiderQuestions();
  const { data: questions, error: questionError } = await adminClient
    .from("person_questions")
    .select("id, key, options")
    .in("key", Object.keys(answers));
  if (questionError) throw questionError;
  const byId: Record<string, string> = {};
  for (const question of questions ?? []) {
    const option = (question.options as { id: string; key?: string }[]).find(
      (row) => row.key === answers[question.key as string],
    );
    if (!option) throw new Error(`no option ${answers[question.key]}`);
    byId[question.id as string] = option.id;
  }
  const { error } = await adminClient.rpc("set_person_answers", {
    p_person_id: personId,
    p_answers: byId,
  });
  if (error) throw error;
}
