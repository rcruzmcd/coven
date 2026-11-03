// Integration test for the staff preview of an event and its test
// registrations (#1764), against the real views and RPC on a local Supabase
// stack: an anonymous visitor, and a member without `events: manage`, still
// get nothing for a private event; its manager sees it through the preview
// header and registers as a test; a test registration holds no seats and
// stays a test once the event is public; and a manager of one tenant cannot
// preview another tenant's event.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  anonClient,
  createPublishedEvent,
  SEEDED_USERS,
  serviceRoleClient,
  signIn,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../../test/seed-fixtures";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
// Named by slug throughout, so the reads keep resolving to the seeded tenant
// once the cross-tenant case below makes a second tenant active.
const SEEDED_SLUG = "example-nonprofit";

const fixture = await createPublishedEvent({
  name: `Preview ${run}`,
  visibility: "private",
  status: "draft",
  capacity: 1,
});
const registeredEmails: string[] = [];

afterAll(async () => {
  await fixture.cleanup();
  if (registeredEmails.length) {
    await service.from("people").delete().in("email", registeredEmails);
  }
});

function as(
  email: string | null,
  options: { preview?: string; slug?: string } = {},
) {
  const opts = { slug: SEEDED_SLUG, ...options };
  return email
    ? signIn(email, undefined, opts)
    : Promise.resolve(anonClient(opts));
}

async function register(
  client: ReturnType<typeof anonClient>,
  eventId: string,
  preview: boolean,
) {
  const email = uniqueEmail(`preview-${run}`);
  registeredEmails.push(email);
  const { data, error } = await client.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: "Preview Registrant",
    p_email: email,
    p_phone: null,
    p_party_size: 1,
    p_notes: null,
    p_ip_address: uniqueIp(),
    ...(preview ? { p_preview: true } : {}),
  } as never);
  return { id: data as string | null, email, error };
}

async function seesEvent(
  client: ReturnType<typeof anonClient>,
  eventId: string,
) {
  const { data, error } = await client
    .from("public_events")
    .select("id")
    .eq("id", eventId);
  if (error) throw error;
  return (data ?? []).length > 0;
}

describe("a private event", () => {
  test("is still nothing to an anonymous visitor, header or not", async () => {
    const anon = await as(null, { preview: fixture.id });
    expect(await seesEvent(anon, fixture.id)).toBe(false);

    expect((await register(anon, fixture.id, true)).error?.message).toBe(
      "EVENT_NOT_FOUND",
    );
    expect((await register(anon, fixture.id, false)).error?.message).toBe(
      "EVENT_NOT_FOUND",
    );
  });

  test("is nothing to a member without events: manage", async () => {
    const volunteer = await as(SEEDED_USERS.volunteer, { preview: fixture.id });
    expect(await seesEvent(volunteer, fixture.id)).toBe(false);
    expect((await register(volunteer, fixture.id, true)).error?.message).toBe(
      "EVENT_NOT_FOUND",
    );
  });

  test("its manager previews it, and only through the header", async () => {
    const withHeader = await as(SEEDED_USERS.admin, { preview: fixture.id });
    expect(await seesEvent(withHeader, fixture.id)).toBe(true);

    // The listing never sends the header, so it never lists the event.
    const listing = await as(SEEDED_USERS.admin);
    expect(await seesEvent(listing, fixture.id)).toBe(false);
  });

  test("its manager's registration is a test with no person", async () => {
    const admin = await as(SEEDED_USERS.admin, { preview: fixture.id });
    const { data: me } = await admin.auth.getUser();
    const { id, error } = await register(admin, fixture.id, true);
    expect(error).toBeNull();

    const { data: row } = await service
      .from("event_registrations")
      .select("is_test, tested_by, person_id")
      .eq("id", id!)
      .single();
    expect(row).toEqual({
      is_test: true,
      tested_by: me.user!.id,
      person_id: null,
    });
  });

  test("test registrations hold no seats, and stay tests once it is public", async () => {
    const admin = await as(SEEDED_USERS.admin, { preview: fixture.id });
    // A capacity of 1, already holding the test above: two more tests fit.
    expect((await register(admin, fixture.id, true)).error).toBeNull();
    expect((await register(admin, fixture.id, true)).error).toBeNull();

    const { error: publishError } = await service
      .from("events")
      .update({ visibility: "public", status: "published" })
      .eq("id", fixture.id);
    if (publishError) throw publishError;

    const anon = await as(null);
    expect((await register(anon, fixture.id, false)).error).toBeNull();
    expect((await register(anon, fixture.id, false)).error?.message).toBe(
      "EVENT_AT_CAPACITY",
    );

    const { data: tests } = await service
      .from("event_registrations")
      .select("id")
      .eq("event_id", fixture.id)
      .eq("is_test", true);
    expect(tests?.length).toBe(3);

    const { error: flip } = await service
      .from("event_registrations")
      .update({ is_test: false })
      .eq("id", tests![0].id);
    expect(flip?.message).toBe("IS_TEST_IMMUTABLE");
  });
});

describe("another tenant's event", () => {
  const other = {
    slug: `preview-other-${run}`,
    host: `preview-other-${run}.example.test`,
  };
  let otherTenantId: string;
  let otherEventId: string;

  beforeAll(async () => {
    const { data: tenantId, error } = await service.rpc("provision_tenant", {
      p_name: `Preview Other ${run}`,
      p_slug: other.slug,
      p_custom_domain: other.host,
      p_plan: "white_label",
      p_admin_email: null,
    });
    if (error) throw error;
    otherTenantId = tenantId as string;

    const { data: event, error: eventError } = await service
      .from("events")
      .insert({
        tenant_id: otherTenantId,
        name: `Preview Other Event ${run}`,
        starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        timezone: "America/Denver",
        visibility: "private",
        status: "draft",
        registration_enabled: true,
        created_by: SEEDED_USER_IDS.admin,
      })
      .select("id")
      .single();
    if (eventError) throw eventError;
    otherEventId = event.id as string;
  });

  afterAll(async () => {
    if (!otherTenantId) return;
    await service.from("events").delete().eq("tenant_id", otherTenantId);
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", otherTenantId);
    await service.rpc("delete_tenant", { p_tenant_id: otherTenantId });
  });

  test("is refused on its own site", async () => {
    const admin = await as(SEEDED_USERS.admin, {
      slug: other.slug,
      preview: otherEventId,
    });
    expect(await seesEvent(admin, otherEventId)).toBe(false);
    expect((await register(admin, otherEventId, true)).error?.message).toBe(
      "EVENT_NOT_FOUND",
    );
  });

  test("is refused on the manager's own site", async () => {
    const admin = await as(SEEDED_USERS.admin, { preview: otherEventId });
    expect(await seesEvent(admin, otherEventId)).toBe(false);
    expect((await register(admin, otherEventId, true)).error?.message).toBe(
      "EVENT_NOT_FOUND",
    );
  });
});
