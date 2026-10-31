// Integration test: exercises the real updateVolunteerApplicationStatusAction
// against a real local Supabase stack (checkUser/checkPermission, then real
// `volunteer_applications` RLS). The queue is gated on the `volunteers`
// resource (admin manages; event_coordinator/volunteer view; finance/board
// have none), so what this file proves is that the action asks for that key
// at the right level -- a wrong key or a missing check here would not be
// caught anywhere else. Fixtures go through the real public
// submit_volunteer_application RPC, the only insert path the table has.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { freezeClock } from "../../../../../../test/frozen-clock";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VolunteerApplicationStatus } from "./application-types";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
  uniqueIp,
  unprivilegedActors,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

// The message actions (#1204) reach the staff-message sender and the
// service-role client, both `server-only` -- a module that throws outside
// Next's bundler. RESEND_API_KEY is unset here, so nothing leaves the
// building; the sends below go to the delivery ledger and the log.
mock.module("server-only", () => ({}));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  updateVolunteerApplicationStatusAction,
  resendVolunteerApplicationConfirmationAction,
  sendVolunteerApplicationMessageAction,
} = await import("./actions");
const { VOLUNTEER_APPLICATION_RECORD_TYPE } =
  await import("@/lib/outbound-messages");

const service = serviceRoleClient();

afterEach(async () => {
  revalidatePathMock.mockClear();
  // Only the service role may clear these: outbound_messages has no delete
  // policy at all, and notification_deliveries none for `authenticated`.
  await service
    .from("outbound_messages")
    .delete()
    .eq("record_type", "volunteer_application");
  await service
    .from("notification_deliveries")
    .delete()
    .in("kind", ["staff_message", "volunteer_application_confirmation"]);
});

const DENIED = { error: "You don't have permission to perform this action." };

// The table only grants select/update/delete to authenticated -- rows are
// created through the public intake RPC, so fixtures use the same path.
// Each fixture gets a fresh email (never deduped, never throttled) and a
// fresh IP for the per-IP rate limit.
async function createApplication() {
  const { data: referenceCode, error } = await anonClient().rpc(
    "submit_volunteer_application",
    {
      p_name: `Integration Test Applicant ${crypto.randomUUID()}`,
      p_email: uniqueEmail("vol-app"),
      p_phone: null,
      p_role_interest: "Ride Buddy",
      p_availability: "Weekends",
      p_honeypot: null,
      p_ip_address: uniqueIp(),
    },
  );
  if (error) throw error;

  // The RPC returns the applicant-facing reference code, not the row id
  // (see 20260827010000), so resolve the actual row from it.
  const { data: row, error: rowError } = await adminClient
    .from("volunteer_applications")
    .select("id, person_id")
    .eq("reference_code", referenceCode as string)
    .single();
  if (rowError) throw rowError;

  const id = row.id as string;
  const personId = row.person_id as string;
  return {
    id,
    // The RPC also creates a backing `people` row; nothing else references
    // it, so delete it once the application row is gone.
    async cleanup() {
      await adminClient.from("volunteer_applications").delete().eq("id", id);
      await adminClient.from("people").delete().eq("id", personId);
    },
  };
}

async function applicationStatus(id: string) {
  const { data, error } = await adminClient
    .from("volunteer_applications")
    .select("status")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.status as string;
}

describe("updateVolunteerApplicationStatusAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    expect(
      await updateVolunteerApplicationStatusAction(
        crypto.randomUUID(),
        "contacted",
      ),
    ).toEqual({
      error: "You must be signed in to update a volunteer application.",
    });
  });

  test("admin role (volunteers manage) can update an application's status", async () => {
    const application = await createApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await updateVolunteerApplicationStatusAction(
        application.id,
        "being reviewed",
      ),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/applications",
    );
    expect(await applicationStatus(application.id)).toBe("being reviewed");

    await application.cleanup();
  });

  test("rejects a status outside the allowed set, even for admin", async () => {
    const application = await createApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await updateVolunteerApplicationStatusAction(
        application.id,
        "hired" as VolunteerApplicationStatus,
      ),
    ).toEqual({ error: "Not a valid status." });
    expect(await applicationStatus(application.id)).toBe("new");

    await application.cleanup();
  });

  async function expectNoWriteAccess(email: string) {
    const application = await createApplication();
    currentSupabase = await signInAs(email);

    expect(
      await updateVolunteerApplicationStatusAction(application.id, "contacted"),
    ).toEqual(DENIED);

    // The denied update must not have landed: the action refuses it, and the
    // `volunteer_applications update` policy would too.
    expect(await applicationStatus(application.id)).toBe("new");

    await application.cleanup();
  }

  test("event_coordinator role (volunteers view) cannot update an application", async () => {
    await expectNoWriteAccess(SEEDED_USERS.coordinator);
  });

  test("volunteer role (volunteers view) cannot update an application", async () => {
    await expectNoWriteAccess(SEEDED_USERS.volunteer);
  });

  test("finance role (no volunteers access) cannot update an application", async () => {
    await expectNoWriteAccess(SEEDED_USERS.finance);
  });

  test("a deactivated (former) account cannot update an application", async () => {
    await expectNoWriteAccess(SEEDED_USERS.former);
  });
});

// #1204: the queue adopts #1203's messaging primitive. What has to be proved
// against a real database rather than a mock is the part that is data-driven:
// `outbound_messages` has one select policy for every module, evaluated
// against each row's own `module` column, so whether a volunteers manager can
// read an application's messages -- and only those -- is a property of the
// data, not of this code.
function applicantMessage(
  applicationId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    messageId: crypto.randomUUID(),
    applicationId,
    subject: "About your application",
    body: "Could you do Saturday mornings instead?",
    ...overrides,
  };
}

describe("sendVolunteerApplicationMessageAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    expect(
      await sendVolunteerApplicationMessageAction(
        applicantMessage(crypto.randomUUID()),
      ),
    ).toEqual({ error: "You must be signed in to message an applicant." });
  });

  test("refuses a session holding volunteers at view", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await sendVolunteerApplicationMessageAction(
        applicantMessage(crypto.randomUUID()),
      ),
    ).toEqual(DENIED);
  });

  test("a volunteers manager sends, and it joins the application's history", async () => {
    const application = await createApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const input = applicantMessage(application.id);
    expect(await sendVolunteerApplicationMessageAction(input)).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/applications",
    );

    const { data } = await service
      .from("outbound_messages")
      .select("id, module, record_type, record_id, person_id, status, kind")
      .eq("record_id", application.id)
      .single();
    expect(data).toMatchObject({
      id: input.messageId,
      module: "volunteers",
      record_type: VOLUNTEER_APPLICATION_RECORD_TYPE,
      status: "sent",
      kind: "staff_message",
    });
    // Unlike a contact message, an applicant always has a people row:
    // submit_volunteer_application() resolves one before it inserts.
    expect(data!.person_id).not.toBeNull();

    await application.cleanup();
  });

  test("one composition sends one email, whatever the client does", async () => {
    const application = await createApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const input = applicantMessage(application.id);

    expect(await sendVolunteerApplicationMessageAction(input)).toEqual({
      success: true,
    });
    expect(await sendVolunteerApplicationMessageAction(input)).toEqual({
      error:
        "That message has already gone out. Reopen the composer to send another.",
    });

    const { count } = await service
      .from("outbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("record_id", application.id);
    expect(count).toBe(1);

    await application.cleanup();
  });

  test("says what is wrong instead of sending nothing quietly", async () => {
    const application = await createApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await sendVolunteerApplicationMessageAction(
        applicantMessage(application.id, { subject: " " }),
      ),
    ).toEqual({ error: "Write a subject." });
    expect(
      await sendVolunteerApplicationMessageAction(
        applicantMessage(application.id, { messageId: "not-a-uuid" }),
      ),
    ).toEqual({ error: "Reopen the message and try again." });
    expect(
      await sendVolunteerApplicationMessageAction(
        applicantMessage(crypto.randomUUID()),
      ),
    ).toEqual({ error: "This application could not be found." });

    const { data } = await service
      .from("outbound_messages")
      .select("id")
      .eq("record_type", VOLUNTEER_APPLICATION_RECORD_TYPE);
    expect(data).toEqual([]);

    await application.cleanup();
  });
});

describe("resendVolunteerApplicationConfirmationAction (integration)", () => {
  test("refuses a session holding volunteers at view", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await resendVolunteerApplicationConfirmationAction(crypto.randomUUID()),
    ).toEqual(DENIED);
  });

  test("sends a second copy, and records it as a resend", async () => {
    // Both calls in one clock minute, which the second one's refusal needs.
    freezeClock();
    const application = await createApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await resendVolunteerApplicationConfirmationAction(application.id),
    ).toEqual({ success: true });

    const { data } = await service
      .from("outbound_messages")
      .select("kind, status, subject, body")
      .eq("record_id", application.id)
      .single();
    expect(data!.kind).toBe("volunteer_application_confirmation");
    expect(data!.status).toBe("sent");
    // The subject is the rendered email's, so the sheet shows what arrived.
    expect(data!.subject.length).toBeGreaterThan(0);
    // No body: the organization wrote this one, and the renderer is where it
    // lives -- copying it here would be a second version to keep in step.
    expect(data!.body).toBe("");

    // Twice inside the minute is one email, and says so.
    expect(
      await resendVolunteerApplicationConfirmationAction(application.id),
    ).toEqual({
      error: "The confirmation has already been resent in the last minute.",
    });

    await application.cleanup();
  });
});

describe("who can read an application's messages", () => {
  test("a volunteers manager, and nobody reading another module's", async () => {
    const application = await createApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    await sendVolunteerApplicationMessageAction(
      applicantMessage(application.id),
    );

    // A message on somebody else's queue, written by the service role because
    // the table has no insert policy for anyone.
    const { data: tenant } = await service
      .from("tenants")
      .select("id")
      .order("created_at")
      .limit(1)
      .single();
    const contactMessageId = crypto.randomUUID();
    await service.from("outbound_messages").insert({
      id: contactMessageId,
      tenant_id: tenant!.id,
      person_id: null,
      to_email: "someone@example.test",
      module: "communications",
      record_type: "contact_message",
      record_id: crypto.randomUUID(),
      subject: "Re: General enquiry",
      body: "Thanks for writing in.",
      kind: "staff_message",
      status: "sent",
    });

    // A role holding volunteers:manage and nothing else -- no seeded account
    // has that shape, and it is the whole question this ticket raises.
    const email = uniqueEmail("volunteers-manager");
    const { data: created, error: userError } =
      await service.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;
    const { data: role, error: roleError } = await service
      .from("roles")
      .insert({
        tenant_id: tenant!.id,
        name: `volunteers_manager_${crypto.randomUUID().slice(0, 8)}`,
        description: "volunteers only, for the integration suite",
      })
      .select("id")
      .single();
    if (roleError) throw roleError;
    const { data: resource } = await service
      .from("resources")
      .select("id")
      .eq("key", "volunteers")
      .single();
    await service
      .from("role_permissions")
      .insert({ role_id: role.id, resource_id: resource!.id, level: "manage" });
    await service
      .from("user_roles")
      .insert({ user_id: created.user.id, role_id: role.id });

    try {
      const reviewer = await signInAs(email);
      const { data: readable } = await reviewer
        .from("outbound_messages")
        .select("id, module")
        .in("record_id", [application.id, contactMessageId]);
      expect(readable).toHaveLength(1);
      expect(readable![0].module).toBe("volunteers");

      // And the other queue's message stays invisible when asked for directly.
      const { data: other } = await reviewer
        .from("outbound_messages")
        .select("id")
        .eq("id", contactMessageId);
      expect(other).toEqual([]);

      // Everyone below that bar sees neither.
      for (const actor of await unprivilegedActors()) {
        const { data } = await actor.client
          .from("outbound_messages")
          .select("id")
          .eq("record_id", application.id);
        expect(data ?? [], actor.name).toEqual([]);
      }
    } finally {
      await service
        .from("outbound_messages")
        .delete()
        .eq("id", contactMessageId);
      // role_permissions and user_roles cascade from the role.
      await service.from("roles").delete().eq("id", role.id);
      await service
        .from("tenant_memberships")
        .delete()
        .eq("user_id", created.user.id);
      await service
        .from("audit_log")
        .update({ actor_id: null })
        .eq("actor_id", created.user.id);
      await service.auth.admin.deleteUser(created.user.id);
      await application.cleanup();
    }
  });
});
