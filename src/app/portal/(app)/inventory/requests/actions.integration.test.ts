// Integration coverage for messaging a gear requester from the portal (#1203):
// the permission gates on both actions, the sentences they answer with, and
// the read policy on `outbound_messages` -- which is data-driven off the row's
// own module, so it has to be exercised against a real database rather than a
// mock.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { freezeClock } from "../../../../../../test/frozen-clock";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createAvailableGearItems,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
  uniqueIp,
  unprivilegedActors,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));
mock.module("server-only", () => ({}));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { resendGearRequestConfirmationAction, sendGearRequestMessageAction } =
  await import("./actions");
const { GEAR_REQUEST_RECORD_TYPE, MAX_MESSAGE_BODY_LENGTH } =
  await import("@/lib/outbound-messages");

const service = serviceRoleClient();
const DENIED = { error: "You don't have permission to perform this action." };

let tenantId: string;
const cleanups: (() => Promise<void>)[] = [];
const requesterEmails: string[] = [];

beforeAll(async () => {
  const { data, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  tenantId = data.id as string;
});

afterEach(async () => {
  revalidatePathMock.mockClear();
  // Everything but the seeded message, which the isolation suite needs.
  await service
    .from("outbound_messages")
    .delete()
    .neq("id", "eeeeeeee-0000-4000-8000-000000003001");
  await service
    .from("notification_deliveries")
    .delete()
    .in("kind", ["staff_message", "gear_request_confirmation"]);
});

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
  if (requesterEmails.length) {
    await service.from("people").delete().in("email", requesterEmails);
  }
});

/** A real public gear request, through the RPC the public form calls. */
async function newGearRequest(): Promise<{ id: string; email: string }> {
  const fixture = await createAvailableGearItems(1);
  cleanups.unshift(fixture.cleanup);
  const email = uniqueEmail("gear-message");
  requesterEmails.push(email);
  const { data, error } = await anonClient().rpc("request_gear_items", {
    p_inventory_item_ids: fixture.itemIds,
    p_name: "Integration Test Requester",
    p_email: email,
    p_phone: null,
    p_notes: null,
    p_honeypot: null,
    p_ip_address: uniqueIp(),
    // #1367: the acknowledgement gates every path. The wording is resolved
    // server-side in the real callers; a fixture only has to supply one.
    p_as_is_acknowledged: true,
    p_as_is_text: "Given as-is.",
  });
  if (error) throw error;
  return { id: data as string, email };
}

function message(requestId: string, overrides: Record<string, unknown> = {}) {
  return {
    messageId: crypto.randomUUID(),
    requestId,
    subject: "About your gear request",
    body: "The blue one is gone. Would the grey do?",
    ...overrides,
  };
}

describe("sendGearRequestMessageAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await sendGearRequestMessageAction(
      message(crypto.randomUUID()),
    );
    expect(result).toEqual({
      error: "You must be signed in to message a requester.",
    });
  });

  test("refuses a session without inventory:manage", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await sendGearRequestMessageAction(message(crypto.randomUUID())),
    ).toEqual(DENIED);
  });

  test("an inventory manager sends, and the message joins the request's history", async () => {
    const request = await newGearRequest();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const input = message(request.id);
    expect(await sendGearRequestMessageAction(input)).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/portal/inventory/requests/${request.id}`,
    );

    const { data } = await service
      .from("outbound_messages")
      .select("id, to_email, module, record_type, record_id, status, kind")
      .eq("record_id", request.id)
      .single();
    expect(data).toMatchObject({
      id: input.messageId,
      to_email: request.email,
      module: "inventory",
      record_type: GEAR_REQUEST_RECORD_TYPE,
      status: "sent",
      kind: "staff_message",
    });
  });

  test("one composition sends one email, whatever the client does", async () => {
    const request = await newGearRequest();
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const input = message(request.id);

    expect(await sendGearRequestMessageAction(input)).toEqual({
      success: true,
    });
    // The same id again is a double-click or a retried action, not a second
    // message -- and the staffer is told so rather than being left to wonder.
    expect(await sendGearRequestMessageAction(input)).toEqual({
      error:
        "That message has already gone out. Reopen the composer to send another.",
    });

    const { count } = await service
      .from("outbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("record_id", request.id);
    expect(count).toBe(1);
  });

  test("says what is wrong instead of sending nothing quietly", async () => {
    const request = await newGearRequest();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    expect(
      await sendGearRequestMessageAction(message(request.id, { subject: " " })),
    ).toEqual({ error: "Write a subject." });
    expect(
      await sendGearRequestMessageAction(message(request.id, { body: "\n" })),
    ).toEqual({ error: "Write a message." });
    expect(
      await sendGearRequestMessageAction(
        message(request.id, { body: "x".repeat(MAX_MESSAGE_BODY_LENGTH + 1) }),
      ),
    ).toEqual({
      error: `Keep the message to ${MAX_MESSAGE_BODY_LENGTH} characters or fewer.`,
    });
    expect(
      await sendGearRequestMessageAction(
        message(request.id, { messageId: "not-a-uuid" }),
      ),
    ).toEqual({ error: "Reopen the message and try again." });
    expect(
      await sendGearRequestMessageAction(message(crypto.randomUUID())),
    ).toEqual({ error: "This request could not be found." });

    expect(await service.from("outbound_messages").select("id")).toMatchObject({
      data: [{ id: "eeeeeeee-0000-4000-8000-000000003001" }],
    });
  });
});

describe("resendGearRequestConfirmationAction", () => {
  test("refuses a session without inventory:manage", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await resendGearRequestConfirmationAction(crypto.randomUUID()),
    ).toEqual(DENIED);
  });

  test("sends a second copy, and records it as a resend", async () => {
    // Both calls in one clock minute, which the second one's refusal needs.
    freezeClock();
    const request = await newGearRequest();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    expect(await resendGearRequestConfirmationAction(request.id)).toEqual({
      success: true,
    });

    const { data } = await service
      .from("outbound_messages")
      .select("kind, status, subject, body")
      .eq("record_id", request.id)
      .single();
    expect(data!.kind).toBe("gear_request_confirmation");
    expect(data!.status).toBe("sent");
    // The subject is the rendered email's, so the card shows what arrived.
    expect(data!.subject).toContain("request");
    // No body: the organization wrote this one, and the renderer is where it
    // lives -- copying it here would be a second version to keep in step.
    expect(data!.body).toBe("");

    // Twice inside the minute is one email, and says so.
    expect(await resendGearRequestConfirmationAction(request.id)).toEqual({
      error: "The confirmation has already been resent in the last minute.",
    });
  });
});

describe("who can read a request's messages", () => {
  test("only a manager of the message's own module", async () => {
    const request = await newGearRequest();
    currentSupabase = await signIn(SEEDED_USERS.admin);
    await sendGearRequestMessageAction(message(request.id));

    // `anon` holds no select grant at all and is refused before RLS is
    // consulted; a signed-in session without inventory:manage passes the
    // grant and is answered with nothing. Both are the right answer, so the
    // assertion is on what came back rather than on which layer said no.
    for (const actor of await unprivilegedActors()) {
      const { data } = await actor.client
        .from("outbound_messages")
        .select("id, subject")
        .eq("record_id", request.id);
      expect(data ?? [], actor.name).toEqual([]);
    }

    const admin = await signIn(SEEDED_USERS.admin);
    const { data } = await admin
      .from("outbound_messages")
      .select("id")
      .eq("record_id", request.id);
    expect(data).toHaveLength(1);
  });

  test("nobody signed in may write one", async () => {
    const request = await newGearRequest();
    const admin = await signIn(SEEDED_USERS.admin);

    // No insert policy exists at all, for anyone: a forged row is a claim the
    // organization said something it did not say.
    const { error } = await admin.from("outbound_messages").insert({
      tenant_id: tenantId,
      id: crypto.randomUUID(),
      to_email: "someone@example.test",
      module: "inventory",
      record_type: GEAR_REQUEST_RECORD_TYPE,
      record_id: request.id,
      subject: "Forged",
      body: "Forged",
      kind: "staff_message",
      status: "sent",
    });
    expect(error).not.toBeNull();

    // Nor amend one. There is no update grant either, so what the message says
    // is what was sent.
    //
    // Against a row this test writes itself, not the seeded one (#1294). The
    // seeded message is shared mutable state: `retention.integration.test.ts`
    // runs `run_retention_purge` over the same tenant, and rule K of
    // 20260919040000 blanks `subject` on every message past its period -- so
    // whether this assertion saw "About your gear request" or "" came down to
    // which file the runner reached first. It read "" on development at
    // 4708612d and passed at a2e78861 on the same code.
    const ownId = crypto.randomUUID();
    const { error: seedError } = await service
      .from("outbound_messages")
      .insert({
        tenant_id: tenantId,
        id: ownId,
        to_email: "someone@example.test",
        module: "inventory",
        record_type: GEAR_REQUEST_RECORD_TYPE,
        record_id: request.id,
        subject: "As sent",
        body: "As sent",
        kind: "staff_message",
        status: "sent",
      });
    expect(seedError).toBeNull();

    await admin
      .from("outbound_messages")
      .update({ subject: "Rewritten" })
      .eq("id", ownId);
    const { data: unchanged } = await service
      .from("outbound_messages")
      .select("subject")
      .eq("id", ownId)
      .single();
    expect(unchanged!.subject).toBe("As sent");
  });

  test("the sender's name is readable only through the gated lookup", async () => {
    const admin = await signIn(SEEDED_USERS.admin);
    const { data } = await admin.rpc("list_outbound_message_actors", {
      p_message_ids: ["eeeeeeee-0000-4000-8000-000000003001"],
    });
    expect(data).toHaveLength(1);
    expect((data as { email: string }[])[0].email).toBe(SEEDED_USERS.admin);

    // Asking about a message you cannot read tells you nothing, which is the
    // point of gating on the row's own module rather than on a fixed resource.
    for (const actor of await unprivilegedActors()) {
      const { data: denied } = await actor.client.rpc(
        "list_outbound_message_actors",
        { p_message_ids: ["eeeeeeee-0000-4000-8000-000000003001"] },
      );
      // `anon` cannot execute it at all; the signed-in three execute it and
      // are answered with nobody.
      expect(denied ?? [], actor.name).toEqual([]);
    }
  });
});
