// Editing your own contact details (#1164), against a real local stack.
//
// The acceptance criterion this file exists for is the negative one: a
// constituent must not be able to write a column outside the allowlist
// *through any path*, and that has to fail at the database rather than at the
// form. So the tests below go around the form entirely -- they call the RPCs
// and the PostgREST table endpoint directly, the way a curl would.
//
// What is being proven, in order:
//
//   1. The allowlist holds. `set_my_contact_details()` writes the fourteen
//      columns it names and nothing else; `people.update` refuses a
//      constituent outright, so there is no second path to widen.
//   2. Whose row it is is decided by auth.uid() and the request host, not by
//      an argument, so one constituent cannot reach another's record.
//   3. `people.email` does not move on a save. It moves only when a token
//      sent to the new address comes back, and not even then if another
//      record has taken it meanwhile.
//   4. Every change leaves an audit row naming the constituent as the actor.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import {
  SEEDED_USERS,
  anonClient,
  enableModule,
  seededTenantId,
  serviceRoleClient,
  signIn,
  uniqueEmail,
} from "../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

type Constituent = {
  client: SupabaseClient;
  userId: string;
  personId: string;
  email: string;
};

let tenantId: string;
let restoreModule: () => Promise<void>;
let alice: Constituent;
let bob: Constituent;

const cleanups: (() => Promise<void>)[] = [];

/** The whole allowlist, so a test can send it in one go. */
const EMPTY_ARGS = {
  p_preferred_name: null,
  p_phone: null,
  p_pronouns: null,
  p_instagram_handle: null,
  p_address_line1: null,
  p_address_line2: null,
  p_address_city: null,
  p_address_region: null,
  p_address_postal_code: null,
  p_address_country: null,
} as const;

function token(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: createHash("sha256").update(raw, "utf8").digest("hex") };
}

async function makeConstituent(tag: string): Promise<Constituent> {
  const email = uniqueEmail(`${tag}-${run}`);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user!.id;

  const { data: person, error: personError } = await service
    .from("people")
    .insert({
      tenant_id: tenantId,
      name: `${tag} Constituent ${run}`,
      source_type: "other",
      email,
      auth_user_id: userId,
      notes: "Staff wrote this",
    })
    .select("id")
    .single();
  if (personError) throw new Error(`person: ${personError.message}`);

  cleanups.push(async () => {
    await service.from("audit_log").delete().eq("record_id", person.id);
    await service.from("people").delete().eq("id", person.id);
    await service.auth.admin.deleteUser(userId);
  });

  return { client: await signIn(email), userId, personId: person.id, email };
}

async function readPerson(personId: string) {
  const { data, error } = await service
    .from("people")
    .select("*")
    .eq("id", personId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function setModule(key: string, enabled: boolean) {
  const { error } = await service
    .from("tenant_modules")
    .upsert(
      { tenant_id: tenantId, module_key: key, enabled },
      { onConflict: "tenant_id,module_key" },
    );
  if (error) throw new Error(`module ${key}: ${error.message}`);
}

beforeAll(async () => {
  tenantId = await seededTenantId();

  // The area ships off everywhere (#1161), and a tenant using this has it on.
  restoreModule = await enableModule(tenantId, "constituent_accounts");

  alice = await makeConstituent("alice");
  bob = await makeConstituent("bob");
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await restoreModule();
});

describe("the allowlist", () => {
  test("writes the fields it names, on the caller's own record", async () => {
    const { error } = await alice.client.rpc("set_my_contact_details", {
      ...EMPTY_ARGS,
      p_preferred_name: "Al",
      p_phone: "555-0100",
      p_pronouns: "they/them",
      p_instagram_handle: "@al.rides",
      p_address_line1: "12 Ridge Road",
      p_address_city: "Hunter",
      p_address_region: "NY",
      p_address_postal_code: "12442",
      p_address_country: "USA",
    });
    expect(error).toBeNull();

    const person = await readPerson(alice.personId);
    expect(person.preferred_name).toBe("Al");
    expect(person.phone).toBe("555-0100");
    expect(person.pronouns).toBe("they/them");
    // The leading @ is stripped in the RPC, not only in the form.
    expect(person.instagram_handle).toBe("al.rides");
    expect(person.address_line1).toBe("12 Ridge Road");
    expect(person.address_country).toBe("USA");
    // Untouched, and not because the caller declined to send them: there is
    // no argument for either.
    expect(person.notes).toBe("Staff wrote this");
    expect(person.email).toBe(alice.email);
  });

  test("a constituent cannot update people directly", async () => {
    const { error } = await alice.client
      .from("people")
      .update({ notes: "mine now" })
      .eq("id", alice.personId);

    // RLS refuses the row rather than raising, so the proof is the row -- a
    // silent no-op here would look identical to a successful write.
    expect(error).toBeNull();
    expect((await readPerson(alice.personId)).notes).toBe("Staff wrote this");
  });

  test("a constituent cannot write the columns staff own, through any path", async () => {
    const before = await readPerson(alice.personId);

    for (const patch of [
      { name: "Someone Else" },
      { is_anonymous: true },
      { source_type: "manual" },
      { auth_user_id: bob.userId },
      { email: uniqueEmail(`stolen-${run}`) },
      { notification_email: uniqueEmail(`redirect-${run}`) },
    ]) {
      await alice.client.from("people").update(patch).eq("id", alice.personId);
    }

    const after = await readPerson(alice.personId);
    expect(after.name).toBe(before.name);
    expect(after.is_anonymous).toBe(false);
    expect(after.source_type).toBe(before.source_type);
    expect(after.auth_user_id).toBe(alice.userId);
    expect(after.email).toBe(alice.email);
    expect(after.notification_email).toBeNull();
  });

  test("one constituent cannot reach another's record", async () => {
    await bob.client.rpc("set_my_contact_details", {
      ...EMPTY_ARGS,
      p_preferred_name: "Bobby",
    });

    // There is no person argument to point elsewhere, so the check is that
    // Bob's write landed on Bob and Alice is as she was.
    expect((await readPerson(bob.personId)).preferred_name).toBe("Bobby");
    expect((await readPerson(alice.personId)).preferred_name).toBe("Al");
  });

  test("nobody signed out can call it", async () => {
    const { error } = await anonClient().rpc("set_my_contact_details", {
      ...EMPTY_ARGS,
      p_preferred_name: "Anon",
    });
    expect(error).not.toBeNull();
  });

  test("an account with no record of its own is refused", async () => {
    const stranger = uniqueEmail(`stranger-${run}`);
    const { data, error } = await service.auth.admin.createUser({
      email: stranger,
      password: "password123",
      email_confirm: true,
    });
    if (error) throw error;
    cleanups.push(async () => {
      await service.auth.admin.deleteUser(data.user!.id);
    });

    const client = await signIn(stranger);
    const result = await client.rpc("set_my_contact_details", {
      ...EMPTY_ARGS,
      p_preferred_name: "Nobody",
    });
    expect(result.error).not.toBeNull();
  });

  // #1746. The rider columns left the allowlist: the function takes ten
  // arguments, and an eleventh is no argument at all.
  test("takes no rider answers any more", async () => {
    const { error } = await alice.client.rpc("set_my_contact_details", {
      ...EMPTY_ARGS,
      p_riding_discipline: "ski",
    } as never);
    expect(error).not.toBeNull();
  });

  test("the area being off is refused at the database, not at the page", async () => {
    await setModule("constituent_accounts", false);
    try {
      const { error } = await alice.client.rpc("set_my_contact_details", {
        ...EMPTY_ARGS,
        p_preferred_name: "While off",
      });
      expect(error).not.toBeNull();
      expect((await readPerson(alice.personId)).preferred_name).toBe("Al");
    } finally {
      await setModule("constituent_accounts", true);
    }
  });
});

describe("reading your own details", () => {
  test("returns the caller's row and never the token", async () => {
    const { data, error } = await alice.client.rpc("my_contact_details");
    expect(error).toBeNull();
    const row = (data as Record<string, unknown>[])[0];
    expect(row.person_id).toBe(alice.personId);
    expect(row.preferred_name).toBe("Al");
    expect(Object.keys(row)).not.toContain("email_token");
    expect(Object.keys(row)).not.toContain("notes");
  });
});

describe("changing the address on your record", () => {
  test("asking does not move it", async () => {
    const wanted = uniqueEmail(`alice-new-${run}`);
    const { data, error } = await alice.client.rpc("request_my_email_change", {
      p_email: wanted,
      p_token_hash: token().hash,
    });
    expect(error).toBeNull();
    expect((data as { outcome: string }[])[0].outcome).toBe("pending");

    const person = await readPerson(alice.personId);
    expect(person.email).toBe(alice.email);
    expect(person.email_pending).toBe(wanted);
  });

  test("the address already on the record is 'unchanged', and clears the request", async () => {
    const { data } = await alice.client.rpc("request_my_email_change", {
      p_email: alice.email.toUpperCase(),
      p_token_hash: token().hash,
    });
    expect((data as { outcome: string }[])[0].outcome).toBe("unchanged");
    expect((await readPerson(alice.personId)).email_pending).toBeNull();
  });

  test("an address another record holds is refused", async () => {
    const { data } = await alice.client.rpc("request_my_email_change", {
      p_email: bob.email,
      p_token_hash: token().hash,
    });
    expect((data as { outcome: string }[])[0].outcome).toBe("taken");
    expect((await readPerson(alice.personId)).email_pending).toBeNull();
  });

  test("the token moves it, once", async () => {
    const wanted = uniqueEmail(`alice-confirmed-${run}`);
    const { raw, hash } = token();
    await alice.client.rpc("request_my_email_change", {
      p_email: wanted,
      p_token_hash: hash,
    });

    // Signed out on purpose: the link is followed from the mailbox, not from
    // the browser the session lives in.
    const { data, error } = await anonClient().rpc("confirm_email_change", {
      p_token_hash: createHash("sha256").update(raw, "utf8").digest("hex"),
      p_ip_address: "203.0.113.10",
    });
    expect(error).toBeNull();
    const row = (data as { outcome: string; previous_email: string }[])[0];
    expect(row.outcome).toBe("confirmed");
    expect(row.previous_email).toBe(alice.email);

    const person = await readPerson(alice.personId);
    expect(person.email).toBe(wanted);
    expect(person.email_pending).toBeNull();
    alice.email = wanted;

    // A second click on the same link finds nothing, which is the same answer
    // an unknown token gets.
    const again = await anonClient().rpc("confirm_email_change", {
      p_token_hash: hash,
      p_ip_address: "203.0.113.10",
    });
    expect(again.data ?? []).toEqual([]);
  });

  test("an expired link confirms nothing", async () => {
    const wanted = uniqueEmail(`alice-expired-${run}`);
    const { hash } = token();
    await alice.client.rpc("request_my_email_change", {
      p_email: wanted,
      p_token_hash: hash,
    });
    await service
      .from("people")
      .update({ email_token_expires_at: new Date(Date.now() - 1000) })
      .eq("id", alice.personId);

    const { data } = await anonClient().rpc("confirm_email_change", {
      p_token_hash: hash,
      p_ip_address: "203.0.113.11",
    });
    expect(data ?? []).toEqual([]);
    expect((await readPerson(alice.personId)).email).toBe(alice.email);

    await service
      .from("people")
      .update({ email_pending: null })
      .eq("id", alice.personId);
  });

  test("a record that takes the address first wins the race", async () => {
    const contested = uniqueEmail(`contested-${run}`);
    const { hash } = token();
    await alice.client.rpc("request_my_email_change", {
      p_email: contested,
      p_token_hash: hash,
    });

    // Somebody else's record takes it during the day the link is alive.
    await service
      .from("people")
      .update({ email: contested })
      .eq("id", bob.personId);
    bob.email = contested;

    const { data } = await anonClient().rpc("confirm_email_change", {
      p_token_hash: hash,
      p_ip_address: "203.0.113.12",
    });
    expect((data as { outcome: string }[])[0].outcome).toBe("taken");

    const person = await readPerson(alice.personId);
    expect(person.email).toBe(alice.email);
    expect(person.email_pending).toBeNull();
  });
});

describe("attribution", () => {
  test("a self-edit leaves an audit row naming the constituent", async () => {
    await alice.client.rpc("set_my_contact_details", {
      ...EMPTY_ARGS,
      p_preferred_name: "Al",
      p_phone: "555-0199",
    });

    const { data, error } = await service
      .from("audit_log")
      .select("table_name, action, actor_id, old_data, new_data, tenant_id")
      .eq("record_id", alice.personId)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);

    const row = data![0];
    expect(row.table_name).toBe("people");
    expect(row.action).toBe("update");
    expect(row.actor_id).toBe(alice.userId);
    expect(row.tenant_id).toBe(tenantId);
    expect((row.old_data as Record<string, unknown>).phone).toBe("555-0100");
    expect((row.new_data as Record<string, unknown>).phone).toBe("555-0199");
    // Staff prose is not evidence of what this person did.
    expect(Object.keys(row.new_data as object)).not.toContain("notes");
  });

  test("a save that changes nothing leaves no row", async () => {
    const countBefore = await auditCount();
    await alice.client.rpc("set_my_contact_details", {
      ...EMPTY_ARGS,
      p_preferred_name: "Al",
      p_phone: "555-0199",
    });
    expect(await auditCount()).toBe(countBefore);
  });

  test("the audit trail is not readable by the constituent it names", async () => {
    const { data } = await alice.client
      .from("audit_log")
      .select("id")
      .eq("record_id", alice.personId);
    expect(data ?? []).toEqual([]);
  });

  test("an administrator can read it", async () => {
    const admin = await signIn(SEEDED_USERS.admin);
    const { data } = await admin
      .from("audit_log")
      .select("id")
      .eq("record_id", alice.personId);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

async function auditCount(): Promise<number> {
  const { count } = await service
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("record_id", alice.personId);
  return count ?? 0;
}
