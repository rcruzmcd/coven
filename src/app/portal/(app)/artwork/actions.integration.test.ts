// Integration coverage for messaging an artist from the portal (#1309): the
// permission gates on both actions, the sentences they answer with, and the
// read policy on `outbound_messages` -- which is data-driven off the row's own
// module, so a queue that is not `inventory` has to be exercised against a real
// database rather than a mock.
//
// The case this queue has and the other three do not: `submit_artwork()` mints
// no `people` row, so a message here carries a null `person_id` and
// findDeliveryId() takes its `.is("person_id", null)` branch.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { freezeClock } from "../../../../../test/frozen-clock";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
  uniqueIp,
  unprivilegedActors,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));
mock.module("server-only", () => ({}));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  resendArtworkSubmissionConfirmationAction,
  sendArtworkSubmissionMessageAction,
} = await import("./actions");
const { ARTWORK_SUBMISSION_RECORD_TYPE } =
  await import("@/lib/outbound-messages");

const service = serviceRoleClient();
const DENIED = { error: "You don't have permission to perform this action." };
const CALL_TITLE = "Zine Vol. 2";

const cleanups: (() => Promise<void>)[] = [];
const artistEmails: string[] = [];

afterEach(async () => {
  revalidatePathMock.mockClear();
  // Everything but the seeded gear message, which the isolation case below
  // reads as the other module's row.
  await service
    .from("outbound_messages")
    .delete()
    .neq("id", "eeeeeeee-0000-4000-8000-000000003001");
  await service
    .from("notification_deliveries")
    .delete()
    .in("kind", ["staff_message", "artwork_submission_confirmation"]);
});

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
  if (artistEmails.length) {
    await service.from("people").delete().in("email", artistEmails);
  }
});

/**
 * An open call and one public submission to it, through the real RPC (#870) --
 * the only path that mints the row these actions read, and the one that leaves
 * the artist out of the directory.
 */
async function newArtworkSubmission(): Promise<{ id: string; email: string }> {
  const event = await createPublishedEvent({ visibility: "public" });
  cleanups.unshift(event.cleanup);

  const { data: call, error: callError } = await service
    .from("event_artwork_calls")
    .insert({ event_id: event.id, title: CALL_TITLE, is_open: true })
    .select("id, submission_code, tenant_id")
    .single();
  if (callError) throw callError;
  cleanups.unshift(async () => {
    await service.from("event_artwork_calls").delete().eq("id", call.id);
  });

  const draft = crypto.randomUUID();
  const image = crypto.randomUUID();
  const email = uniqueEmail("artwork-message");
  artistEmails.push(email);
  const { data, error } = await anonClient().rpc("submit_artwork", {
    p_code: call.submission_code as string,
    p_name: "Ari Nakamura",
    p_email: email,
    p_title: "Snowline",
    p_medium: "Ink on paper",
    p_statement: "Made on the lift.",
    p_images: [
      {
        path: `${call.tenant_id}/${call.id}/${draft}/${image}.jpg`,
        thumbPath: `${call.tenant_id}/${call.id}/${draft}/${image}-thumb.jpg`,
        contentType: "image/jpeg",
        byteSize: 4096,
      },
    ],
    p_consent: true,
    p_honeypot: null,
    // A fresh IP per fixture: the RPC's own limit is 5 per 15 minutes.
    p_ip_address: uniqueIp(),
  });
  if (error) throw error;
  return { id: data as string, email };
}

function message(
  submissionId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    messageId: crypto.randomUUID(),
    submissionId,
    subject: `Your submission to ${CALL_TITLE}`,
    body: "Could you send the original at 300dpi?",
    ...overrides,
  };
}

describe("sendArtworkSubmissionMessageAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    expect(
      await sendArtworkSubmissionMessageAction(message(crypto.randomUUID())),
    ).toEqual({ error: "You must be signed in to message an artist." });
  });

  test("refuses a session without artwork_submissions:manage", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await sendArtworkSubmissionMessageAction(message(crypto.randomUUID())),
    ).toEqual(DENIED);
  });

  test("a curator sends, and the message joins the submission's history", async () => {
    const submission = await newArtworkSubmission();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    const input = message(submission.id);
    expect(await sendArtworkSubmissionMessageAction(input)).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/artwork");

    const { data } = await service
      .from("outbound_messages")
      .select(
        "id, to_email, module, record_type, record_id, status, kind, person_id, delivery_id",
      )
      .eq("record_id", submission.id)
      .single();
    expect(data).toMatchObject({
      id: input.messageId,
      to_email: submission.email,
      module: "artwork_submissions",
      record_type: ARTWORK_SUBMISSION_RECORD_TYPE,
      status: "sent",
      kind: "staff_message",
      // Nobody minted a directory row for somebody who submitted once, and
      // this ticket did not change that.
      person_id: null,
    });
    // The null-person branch of findDeliveryId() still finds the ledger row,
    // which is the whole reason it branches rather than always matching on an
    // id: an administrator has to be able to cross-reference the provider's.
    expect(data!.delivery_id).not.toBeNull();
  });

  test("one composition sends one email, whatever the client does", async () => {
    const submission = await newArtworkSubmission();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const input = message(submission.id);

    expect(await sendArtworkSubmissionMessageAction(input)).toEqual({
      success: true,
    });
    expect(await sendArtworkSubmissionMessageAction(input)).toEqual({
      error:
        "That message has already gone out. Reopen the composer to send another.",
    });

    const { count } = await service
      .from("outbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("record_id", submission.id);
    expect(count).toBe(1);
  });

  test("says what is wrong instead of sending nothing quietly", async () => {
    const submission = await newArtworkSubmission();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    expect(
      await sendArtworkSubmissionMessageAction(
        message(submission.id, { subject: " " }),
      ),
    ).toEqual({ error: "Write a subject." });
    expect(
      await sendArtworkSubmissionMessageAction(
        message(submission.id, { messageId: "not-a-uuid" }),
      ),
    ).toEqual({ error: "Reopen the message and try again." });
    expect(
      await sendArtworkSubmissionMessageAction(message(crypto.randomUUID())),
    ).toEqual({ error: "This submission could not be found." });
  });

  test("a submission with no address is refused, not sent to nobody", async () => {
    const submission = await newArtworkSubmission();
    // What retention's redaction leaves behind; the column is NOT NULL, so
    // blank rather than absent is the shape this has to answer for.
    await service
      .from("artwork_submissions")
      .update({ submitter_email: "" })
      .eq("id", submission.id);
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    expect(
      await sendArtworkSubmissionMessageAction(message(submission.id)),
    ).toEqual({
      error: "This submission has no email address to write to.",
    });
    expect(
      await resendArtworkSubmissionConfirmationAction(submission.id),
    ).toEqual({
      error: "This submission has no email address to write to.",
    });
  });

  test("sending does not make a call on the piece", async () => {
    const submission = await newArtworkSubmission();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    await sendArtworkSubmissionMessageAction(message(submission.id));

    const { data } = await service
      .from("artwork_submissions")
      .select("status, reviewed_at, reviewed_by")
      .eq("id", submission.id)
      .single();
    // Asking a question is not deciding, and a queue that moved a piece out of
    // `pending` because somebody wrote to the artist would lie about its work.
    expect(data).toMatchObject({
      status: "pending",
      reviewed_at: null,
      reviewed_by: null,
    });
  });
});

describe("resendArtworkSubmissionConfirmationAction", () => {
  test("refuses a session without artwork_submissions:manage", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await resendArtworkSubmissionConfirmationAction(crypto.randomUUID()),
    ).toEqual(DENIED);
  });

  test("sends a second copy, and records it as a resend", async () => {
    // Both calls in one clock minute, which the second one's refusal needs.
    freezeClock();
    const submission = await newArtworkSubmission();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    expect(
      await resendArtworkSubmissionConfirmationAction(submission.id),
    ).toEqual({ success: true });

    const { data } = await service
      .from("outbound_messages")
      .select("kind, status, subject, body, delivery_id")
      .eq("record_id", submission.id)
      .single();
    expect(data!.kind).toBe("artwork_submission_confirmation");
    expect(data!.status).toBe("sent");
    // The rendered email's own subject, so the card shows what arrived rather
    // than a second version of it kept here -- the acknowledgement is the
    // organization's, not the fallback this action carries for a send that
    // rendered nothing.
    expect(data!.subject).toBe("We got your submission — Example Nonprofit");
    expect(data!.subject).not.toBe("Your artwork submission");
    // No body: the organization wrote this one, and the renderer is where it
    // lives.
    expect(data!.body).toBe("");
    // The suffix the action minted has to be the one the sender claimed, or
    // the history row loses its link to the ledger.
    expect(data!.delivery_id).not.toBeNull();

    // Twice inside the minute is one email, and says so.
    expect(
      await resendArtworkSubmissionConfirmationAction(submission.id),
    ).toEqual({
      error: "The acknowledgement has already been resent in the last minute.",
    });
  });
});

describe("who can read a submission's messages", () => {
  test("only a manager of the message's own module", async () => {
    const submission = await newArtworkSubmission();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    await sendArtworkSubmissionMessageAction(message(submission.id));

    for (const actor of await unprivilegedActors()) {
      const { data } = await actor.client
        .from("outbound_messages")
        .select("id, subject")
        .eq("record_id", submission.id);
      expect(data ?? [], actor.name).toEqual([]);
    }

    const curator = await signIn(SEEDED_USERS.coordinator);
    const { data: mine } = await curator
      .from("outbound_messages")
      .select("id")
      .eq("record_id", submission.id);
    expect(mine).toHaveLength(1);
  });

  test("a curator reads artwork messages and no gear ones", async () => {
    const submission = await newArtworkSubmission();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    await sendArtworkSubmissionMessageAction(message(submission.id));

    // event_coordinator holds artwork_submissions:manage and inventory:none,
    // which is the asymmetry the policy's per-row has_permission(module) exists
    // for: the same table answers two managers with two different sets of rows.
    const curator = await signIn(SEEDED_USERS.coordinator);
    const { data: seen } = await curator
      .from("outbound_messages")
      .select("record_type");
    expect(
      (seen ?? []).map((row) => (row as { record_type: string }).record_type),
    ).toEqual([ARTWORK_SUBMISSION_RECORD_TYPE]);

    // And the admin, who holds both, sees the seeded gear message beside it.
    const admin = await signIn(SEEDED_USERS.admin);
    const { data: both } = await admin
      .from("outbound_messages")
      .select("record_type");
    expect(
      new Set(
        (both ?? []).map((row) => (row as { record_type: string }).record_type),
      ),
    ).toEqual(new Set([ARTWORK_SUBMISSION_RECORD_TYPE, "gear_request"]));
  });
});
