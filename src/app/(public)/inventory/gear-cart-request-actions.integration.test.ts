// Integration test: exercises the real requestGearItemsAction against a
// real local Supabase stack (request_gear_items RPC, row locking, rate
// limiting). Requires `bun run db:start && bun run db:reset` first; run via
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
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  createAvailableGearItems,
  createPerson,
  enableModule,
  getInventoryItemStatus,
  seededTenantId,
  serviceRoleClient,
  signIn,
  uniqueEmail,
  uniqueIp,
  withModule,
} from "../../../../test/integration-setup";
import {
  PASSPHRASE_REQUIRED_SETTING_KEY,
  PASSPHRASE_SETTING_KEY,
  PAYMENT_METHODS_SETTING_KEY,
  SHIPPING_ENABLED_SETTING_KEY,
} from "@/lib/gear-requests";
import { GEAR_PASSPHRASE_EXPIRED } from "@/lib/gear-passphrase";
import { gearAsIsText } from "@/lib/gear-as-is";
import { DEFAULT_LEXICON } from "@/lib/lexicon";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

// The session the action sees. Null is a visitor, which is what all but the
// last describe block below is about; a signed-in client is how the
// self-service branch (#1359) gets exercised through the real action.
let currentClient: SupabaseClient | null = null;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentClient ?? anonClient(),
}));

// The action schedules its two sends with after() (#1032). This file imports
// the action directly, so there is no request scope and Next's real after()
// would throw -- and the notifier it schedules imports "server-only", which
// throws outside Next's bundler. Everything else in next/server is kept, so
// the mock cannot surprise another file sharing this process. Same shape as
// contact-actions.integration.test.ts.
mock.module("server-only", () => ({}));
const nextServer = await import("next/server");
const afterTasks: Promise<unknown>[] = [];
mock.module("next/server", () => ({
  ...nextServer,
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task());
  },
}));

// The browser's passphrase cookie (#1536). There is no request scope here for
// next/headers to read, so the jar is this one variable: what the check action
// set, or what a test says this browser already holds.
let passphraseCookie: string | null = null;
mock.module("@/lib/gear-passphrase-cookie", () => ({
  readGearPassphraseCookie: async () => passphraseCookie,
  setGearPassphraseCookie: async (passphrase: string) => {
    passphraseCookie = passphrase;
  },
  clearGearPassphraseCookie: async () => {
    passphraseCookie = null;
  },
}));

const { requestGearItemsAction, checkGearPassphraseAction } =
  await import("./gear-cart-request-actions");

/**
 * Turns the seeded tenant's passphrase gate on (#1536), returning what turns
 * it off again. Written with the service role, as the portal's
 * set_gear_request_passphrase() would leave it.
 */
async function requirePassphrase(passphrase: string) {
  const service = serviceRoleClient();
  const tenantId = await seededTenantId();
  const { error } = await service.from("app_settings").upsert(
    [
      {
        tenant_id: tenantId,
        key: PASSPHRASE_REQUIRED_SETTING_KEY,
        value: true,
      },
      { tenant_id: tenantId, key: PASSPHRASE_SETTING_KEY, value: passphrase },
    ],
    { onConflict: "tenant_id,key" },
  );
  if (error) throw error;
  return async () => {
    await service
      .from("app_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .in("key", [PASSPHRASE_REQUIRED_SETTING_KEY, PASSPHRASE_SETTING_KEY]);
  };
}

// The as-is box is ticked unless a case says otherwise (#1367), so every test
// below still exercises the rule it was written for rather than the gate.
function formData(fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("as_is_acknowledged", "true");
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  // Let the scheduled sends settle before the fixtures they read go away.
  // RESEND_API_KEY is unset here, so nothing leaves the building; the
  // requester's confirmation row cascades away with their people row.
  await Promise.all(afterTasks.splice(0));
  currentClient = null;
  while (cleanups.length) {
    const cleanup = cleanups.pop()!;
    await cleanup();
  }
  revalidatePathMock.mockClear();
});

async function gearItems(count: number) {
  const fixture = await createAvailableGearItems(count);
  cleanups.push(fixture.cleanup);
  return fixture.itemIds;
}

async function giveawayItems(count: number) {
  const fixture = await createAvailableGearItems(count, {
    intendedUse: "giveaway",
  });
  cleanups.push(fixture.cleanup);
  return fixture.itemIds;
}

describe("requestGearItemsAction (integration)", () => {
  test("reserves every item in the cart for one requester", async () => {
    currentIp = uniqueIp();
    const [first, second, third] = await gearItems(3);
    const email = uniqueEmail("happy-path");

    const result = await requestGearItemsAction(
      [first, second, third],
      formData({ name: "Jamie Rivera", email }),
    );

    expect(result).toEqual({ success: true, requestId: expect.any(String) });
    expect(await getInventoryItemStatus(first)).toBe("reserved");
    expect(await getInventoryItemStatus(second)).toBe("reserved");
    expect(await getInventoryItemStatus(third)).toBe("reserved");
    expect(revalidatePathMock).toHaveBeenCalledWith("/inventory");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/inventory/items");
  });

  // Giveaway prize stock (sponsor vouchers and the like) is never listed in
  // the public catalog, so reaching the RPC with one means a hand-crafted
  // request -- it must be refused rather than reserved.
  test("refuses an item that is not gear-library stock", async () => {
    currentIp = uniqueIp();
    const [gearItem] = await gearItems(1);
    const [giveawayItem] = await giveawayItems(1);

    const result = await requestGearItemsAction(
      [gearItem, giveawayItem],
      formData({ name: "Jamie Rivera", email: uniqueEmail("giveaway") }),
    );

    expect(result).toEqual({
      error: "One of the items in your cart could not be found.",
      code: "ITEM_NOT_FOUND",
    });
    expect(await getInventoryItemStatus(gearItem)).toBe("available");
    expect(await getInventoryItemStatus(giveawayItem)).toBe("available");
  });

  // #1206, and a regression of it: 20260921073000 rebuilt the RPC from a body
  // that predated the guard and dropped it, so a blank name came back as a
  // bare 23514 from the people check constraint. The Server Action refuses one
  // first, which is exactly why this asks the RPC directly -- a hand-crafted
  // anon call is the caller #1206 was written for.
  test("tells a direct caller that a name is required, rather than raising a constraint", async () => {
    const [item] = await gearItems(1);

    const { error } = await anonClient().rpc("request_gear_items", {
      p_inventory_item_ids: [item],
      p_name: "   ",
      p_email: uniqueEmail("blank-name"),
      p_phone: null,
      p_ip_address: uniqueIp(),
    });

    expect(error?.message).toContain("NAME_REQUIRED");
    expect(await getInventoryItemStatus(item)).toBe("available");
  });

  test("keeps items that are not gear-library stock out of the public catalog", async () => {
    const [giveawayItem] = await giveawayItems(1);

    const { data } = await anonClient()
      .from("public_gear_catalog")
      .select("id")
      .eq("id", giveawayItem)
      .maybeSingle();

    expect(data).toBeNull();
  });

  test("fails the whole request, leaving other items untouched, when one item is already taken", async () => {
    currentIp = uniqueIp();
    const [available, alreadyTaken] = await gearItems(2);

    const firstTaker = await requestGearItemsAction(
      [alreadyTaken],
      formData({ name: "First Taker", email: uniqueEmail("first-taker") }),
    );
    expect(firstTaker).toEqual({
      success: true,
      requestId: expect.any(String),
    });

    const result = await requestGearItemsAction(
      [available, alreadyTaken],
      formData({ name: "Jamie Rivera", email: uniqueEmail("blocked") }),
    );

    expect(result).toEqual({
      error:
        "Sorry, one of the items in your cart was just requested by someone else. Remove it and try again.",
      code: "ITEM_ALREADY_REQUESTED",
    });
    expect(await getInventoryItemStatus(available)).toBe("available");
    expect(await getInventoryItemStatus(alreadyTaken)).toBe("reserved");
  });

  // #721: the request text belongs to the request, not to the requester's
  // directory record -- where it survived retention and could overwrite what
  // staff had written about a returning person. #1032 moved it one step
  // further, from every movement onto the one request header.
  test("records one request header for the cart, with the notes on it", async () => {
    currentIp = uniqueIp();
    const [first, second] = await gearItems(2);
    const email = uniqueEmail("notes");
    const notes = "Size 10 boots if you have them; otherwise a 9.5 works.";

    const result = await requestGearItemsAction(
      [first, second],
      formData({ name: "Jamie Rivera", email, notes }),
    );
    expect(result).toEqual({ success: true, requestId: expect.any(String) });

    const { data: movements } = await adminClient
      .from("inventory_movements")
      .select("notes, recipient_person_id, gear_request_id")
      .in("inventory_item_id", [first, second])
      .eq("movement_type", "reserved");

    expect(movements).toHaveLength(2);
    const requestIds = new Set(movements!.map((m) => m.gear_request_id));
    expect(requestIds.size).toBe(1);
    for (const movement of movements ?? []) {
      expect(movement.notes).toBeNull();
    }

    const { data: request } = await adminClient
      .from("gear_requests")
      .select("status, delivery_method, notes, person_id, payment_method")
      .eq("id", movements![0].gear_request_id)
      .single();
    expect(request).toEqual({
      status: "new",
      delivery_method: "meetup",
      notes,
      person_id: movements![0].recipient_person_id,
      payment_method: null,
    });

    const { data: person } = await adminClient
      .from("people")
      .select("notes")
      .eq("id", movements![0].recipient_person_id)
      .single();

    expect(person!.notes).toBeNull();
  });

  // #1357: the handle reaches the requester's directory record, normalized as
  // the database normalizes every other one (lowercased, @ stripped).
  test("writes a new requester's Instagram handle onto their people row", async () => {
    currentIp = uniqueIp();
    const [item] = await gearItems(1);
    const email = uniqueEmail("instagram-new");

    const result = await requestGearItemsAction(
      [item],
      formData({
        name: "Jamie Rivera",
        email,
        instagram_handle: "@Jamie.Rivera",
      }),
    );
    expect(result).toEqual({ success: true, requestId: expect.any(String) });

    const { data: person } = await adminClient
      .from("people")
      .select("instagram_handle")
      .eq("email", email)
      .single();

    expect(person!.instagram_handle).toBe("jamie.rivera");
  });

  // The rule resolve_or_create_person_by_email() already applies to pronouns:
  // a returning requester fills an empty column and never replaces one a
  // staffer has corrected.
  test("never overwrites a handle the directory already holds", async () => {
    currentIp = uniqueIp();
    const [item] = await gearItems(1);
    const email = uniqueEmail("instagram-existing");
    const existing = await createPerson({ name: "Jamie Rivera", email });
    cleanups.push(existing.cleanup);
    await adminClient
      .from("people")
      .update({ instagram_handle: "corrected.by.staff" })
      .eq("id", existing.id);

    const result = await requestGearItemsAction(
      [item],
      formData({
        name: "Jamie Rivera",
        email,
        instagram_handle: "typo.handle",
      }),
    );
    expect(result).toEqual({ success: true, requestId: expect.any(String) });

    const { data: person } = await adminClient
      .from("people")
      .select("instagram_handle")
      .eq("id", existing.id)
      .single();

    expect(person!.instagram_handle).toBe("corrected.by.staff");
  });

  test("reports an error for an empty cart", async () => {
    currentIp = uniqueIp();

    const result = await requestGearItemsAction(
      [],
      formData({ name: "Jamie Rivera", email: uniqueEmail("empty-cart") }),
    );

    expect(result).toEqual({
      error: "Add at least one item to your cart before submitting.",
    });
  });

  test("reports ITEM_NOT_FOUND for a bogus item id", async () => {
    currentIp = uniqueIp();
    const [available] = await gearItems(1);

    const result = await requestGearItemsAction(
      [available, "00000000-0000-0000-0000-000000000000"],
      formData({ name: "Jamie Rivera", email: uniqueEmail("not-found") }),
    );

    expect(result).toEqual({
      error: "One of the items in your cart could not be found.",
      code: "ITEM_NOT_FOUND",
    });
    expect(await getInventoryItemStatus(available)).toBe("available");
  });

  test("silently no-ops when the honeypot field is filled", async () => {
    currentIp = uniqueIp();
    const [item] = await gearItems(1);
    const email = uniqueEmail("honeypot");

    const result = await requestGearItemsAction(
      [item],
      formData({ name: "A Bot", email, company: "Definitely A Company" }),
    );

    // The RPC reports fake success to avoid tipping off bots, but no row is
    // actually mutated -- only a DB check can catch a regression here.
    expect(result).toEqual({ success: true, requestId: expect.any(String) });
    expect(await getInventoryItemStatus(item)).toBe("available");
  });

  test("rate-limits repeated requests from the same IP", async () => {
    currentIp = uniqueIp();
    const items = await gearItems(9);

    for (let i = 0; i < 8; i++) {
      const result = await requestGearItemsAction(
        [items[i]],
        formData({ name: "Repeat Requester", email: uniqueEmail(`rate-${i}`) }),
      );
      expect(result).toEqual({ success: true, requestId: expect.any(String) });
    }

    const limited = await requestGearItemsAction(
      [items[8]],
      formData({ name: "Repeat Requester", email: uniqueEmail("rate-9") }),
    );
    expect(limited).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
      code: "RATE_LIMITED",
    });
    expect(await getInventoryItemStatus(items[8])).toBe("available");
  });
});

// #1032. Shipping is the tenant's to offer: the form, the action's parser and
// the RPC all read the same two settings, and the RPC is the one that counts.
describe("requestGearItemsAction with shipping", () => {
  const service = serviceRoleClient();
  let tenantId: string;

  const shippingFields = {
    delivery_method: "shipping",
    ship_name: "Jamie Rivera",
    ship_line1: "12 Ridge Rd",
    ship_line2: "Unit 4",
    ship_city: "Bend",
    ship_region: "OR",
    ship_postal_code: "97701",
    ship_country: "USA",
    payment_method: "venmo",
  };

  async function offerShipping(enabled: boolean) {
    const { error } = await service.from("app_settings").upsert(
      [
        {
          tenant_id: tenantId,
          key: SHIPPING_ENABLED_SETTING_KEY,
          value: enabled,
        },
        {
          tenant_id: tenantId,
          key: PAYMENT_METHODS_SETTING_KEY,
          value: [
            { key: "zelle", label: "Zelle", handle: "", instructions: "" },
            { key: "venmo", label: "Venmo", handle: "@it", instructions: "" },
          ],
        },
      ],
      { onConflict: "tenant_id,key" },
    );
    if (error) throw error;
  }

  beforeAll(async () => {
    // The tenant the anon client resolves to: the seeded first one.
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
    await service
      .from("app_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .in("key", [SHIPPING_ENABLED_SETTING_KEY, PAYMENT_METHODS_SETTING_KEY]);
  });

  test("records the address and the postage payment choice on the request", async () => {
    await offerShipping(true);
    currentIp = uniqueIp();
    const [item] = await gearItems(1);

    const result = await requestGearItemsAction(
      [item],
      formData({
        name: "Jamie Rivera",
        email: uniqueEmail("shipping"),
        ...shippingFields,
      }),
    );
    expect(result).toEqual({ success: true, requestId: expect.any(String) });

    const { data: movement } = await adminClient
      .from("inventory_movements")
      .select(
        "gear_request:gear_requests(delivery_method, ship_name, ship_line1, ship_line2, ship_city, ship_region, ship_postal_code, ship_country, payment_method, status)",
      )
      .eq("inventory_item_id", item)
      .eq("movement_type", "reserved")
      .single();
    // supabase-js types a to-one embed through a composite key as an array;
    // PostgREST answers with the one object.
    expect(movement!.gear_request as unknown).toEqual({
      delivery_method: "shipping",
      ship_name: "Jamie Rivera",
      ship_line1: "12 Ridge Rd",
      ship_line2: "Unit 4",
      ship_city: "Bend",
      ship_region: "OR",
      ship_postal_code: "97701",
      ship_country: "USA",
      payment_method: "venmo",
      status: "new",
    });
  });

  test("refuses shipping the tenant has not turned on, and reserves nothing", async () => {
    await offerShipping(false);
    currentIp = uniqueIp();
    const [item] = await gearItems(1);

    const result = await requestGearItemsAction(
      [item],
      formData({
        name: "Jamie Rivera",
        email: uniqueEmail("no-shipping"),
        ...shippingFields,
      }),
    );
    expect(result).toEqual({
      error: "Shipping isn't available right now. Choose a meetup instead.",
    });
    expect(await getInventoryItemStatus(item)).toBe("available");
  });

  // #1367. The gate is unconditional, on every path, and the wording stored
  // is the platform's rather than anything a caller sent.
  describe("the as-is acknowledgement", () => {
    test("records when it was given and the words that were shown", async () => {
      currentIp = uniqueIp();
      const [item] = await gearItems(1);
      const email = uniqueEmail("as-is");

      const result = await requestGearItemsAction(
        [item],
        formData({ name: "Jamie Rivera", email }),
      );
      expect(result).toEqual({
        success: true,
        requestId: expect.any(String),
      });

      const { data: request } = await adminClient
        .from("gear_requests")
        .select("as_is_acknowledged_at, as_is_text")
        .eq("id", (result as { requestId: string }).requestId)
        .single();

      expect(request!.as_is_acknowledged_at).not.toBeNull();
      // Resolved server-side from `src/lib/gear-as-is.ts` against this
      // tenant's lexicon, so it is the platform's claim and not the
      // browser's report of one.
      expect(request!.as_is_text).toBe(gearAsIsText(DEFAULT_LEXICON));
    });

    test("the RPC refuses a request that did not acknowledge it", async () => {
      const [item] = await gearItems(1);

      const { error } = await anonClient().rpc("request_gear_items", {
        p_inventory_item_ids: [item],
        p_name: "Jamie Rivera",
        p_email: uniqueEmail("rpc-no-ack"),
        p_phone: null,
        p_ip_address: uniqueIp(),
        p_as_is_acknowledged: false,
        p_as_is_text: "Given as-is.",
      });

      expect(error?.message).toContain("AS_IS_REQUIRED");
      // Refused before the item locks, so nothing was held for a request
      // that was never written.
      expect(await getInventoryItemStatus(item)).toBe("available");
    });

    // An acknowledgement pointing at nothing is the state the snapshot exists
    // to prevent -- "understood something, at 14:02". Not reachable from this
    // application, since both entry points supply the words themselves.
    test("the RPC refuses an acknowledgement with no wording behind it", async () => {
      const [item] = await gearItems(1);

      const { error } = await anonClient().rpc("request_gear_items", {
        p_inventory_item_ids: [item],
        p_name: "Jamie Rivera",
        p_email: uniqueEmail("rpc-no-text"),
        p_phone: null,
        p_ip_address: uniqueIp(),
        p_as_is_acknowledged: true,
        p_as_is_text: "   ",
      });

      expect(error?.message).toContain("AS_IS_TEXT_REQUIRED");
      expect(await getInventoryItemStatus(item)).toBe("available");
    });
  });

  // The RPC's own check, bypassing the action's parser: an address the form
  // would have refused must be refused again underneath it.
  test("the RPC refuses a shipping request with no address", async () => {
    await offerShipping(true);
    const [item] = await gearItems(1);

    const { error } = await anonClient().rpc("request_gear_items", {
      p_inventory_item_ids: [item],
      p_name: "Jamie Rivera",
      p_email: uniqueEmail("rpc-no-address"),
      p_phone: null,
      p_ip_address: uniqueIp(),
      p_as_is_acknowledged: true,
      p_as_is_text: "Given as-is.",
      p_delivery_method: "shipping",
      p_shipping: { name: "Jamie" },
      p_payment_method: "venmo",
    });
    expect(error?.message).toContain("SHIPPING_ADDRESS_REQUIRED");
    expect(await getInventoryItemStatus(item)).toBe("available");
  });

  test("the RPC refuses a payment method the tenant does not accept", async () => {
    await offerShipping(true);
    const [item] = await gearItems(1);

    const { error } = await anonClient().rpc("request_gear_items", {
      p_inventory_item_ids: [item],
      p_name: "Jamie Rivera",
      p_email: uniqueEmail("rpc-bad-method"),
      p_phone: null,
      p_ip_address: uniqueIp(),
      p_as_is_acknowledged: true,
      p_as_is_text: "Given as-is.",
      p_delivery_method: "shipping",
      p_shipping: { line1: "12 Ridge Rd", city: "Bend", postal_code: "97701" },
      p_payment_method: "cash",
    });
    expect(error?.message).toContain("PAYMENT_METHOD_INVALID");
    expect(await getInventoryItemStatus(item)).toBe("available");
  });
});

// #748. The "already taken" case above is sequential -- the first request has
// committed before the second starts, so the RPC's status read sees it. The
// case that actually double-books an item is two carts checking availability
// before either has reserved, which only overlapping promises produce.
describe("requestGearItemsAction under concurrency", () => {
  // The requester `people` rows resolve_or_create_person_by_email() minted.
  // Registered before the gear fixture so it pops last: cleanupDonation()
  // clears the movements that reference them first.
  function cleanUpRequesters(emails: string[]) {
    cleanups.push(async () => {
      await adminClient.from("people").delete().in("email", emails);
    });
  }

  async function reservedMovements(itemIds: string[]) {
    const { data, error } = await adminClient
      .from("inventory_movements")
      .select("inventory_item_id, recipient_person_id")
      .in("inventory_item_id", itemIds)
      .eq("movement_type", "reserved");
    if (error) throw error;
    return data;
  }

  test("hands one item to exactly one of two simultaneous requesters", async () => {
    currentIp = uniqueIp();
    const emails = [uniqueEmail("race-a"), uniqueEmail("race-b")];
    cleanUpRequesters(emails);
    const [item] = await gearItems(1);

    const results = await Promise.all(
      emails.map((email, i) =>
        requestGearItemsAction([item], formData({ name: `Racer ${i}`, email })),
      ),
    );

    expect(results.filter((result) => "success" in result)).toHaveLength(1);
    expect(results.filter((result) => "error" in result)).toEqual([
      {
        error:
          "Sorry, one of the items in your cart was just requested by someone else. Remove it and try again.",
        code: "ITEM_ALREADY_REQUESTED",
      },
    ]);

    // One reservation, to one person -- not two rows, and not a second row
    // silently overwriting the first requester.
    const movements = await reservedMovements([item]);
    expect(movements).toHaveLength(1);
    expect(await getInventoryItemStatus(item)).toBe("reserved");
  });

  // Two carts that overlap on one item but not the other. Whoever loses the
  // contested item must lose their whole cart: a half-filled request would
  // strand the uncontested item as reserved for someone who was told no.
  test("keeps overlapping carts all-or-nothing, in either lock order", async () => {
    currentIp = uniqueIp();
    const emails = [uniqueEmail("cart-a"), uniqueEmail("cart-b")];
    cleanUpRequesters(emails);
    const [onlyA, contested, onlyB] = await gearItems(3);

    // Reversed item order between the two carts: request_gear_items locks its
    // pre-check pass in sorted order precisely so this cannot deadlock.
    const [first, second] = await Promise.all([
      requestGearItemsAction(
        [onlyA, contested],
        formData({ name: "Cart A", email: emails[0] }),
      ),
      requestGearItemsAction(
        [contested, onlyB],
        formData({ name: "Cart B", email: emails[1] }),
      ),
    ]);

    const winnerIsA = "success" in first;
    expect(winnerIsA ? second : first).toEqual({
      error:
        "Sorry, one of the items in your cart was just requested by someone else. Remove it and try again.",
      code: "ITEM_ALREADY_REQUESTED",
    });
    expect(winnerIsA ? first : second).toEqual({
      success: true,
      requestId: expect.any(String),
    });

    expect(await getInventoryItemStatus(contested)).toBe("reserved");
    expect(await getInventoryItemStatus(winnerIsA ? onlyA : onlyB)).toBe(
      "reserved",
    );
    // The loser's uncontested item stays free for the next visitor.
    expect(await getInventoryItemStatus(winnerIsA ? onlyB : onlyA)).toBe(
      "available",
    );

    const movements = await reservedMovements([onlyA, contested, onlyB]);
    expect(movements).toHaveLength(2);
    expect(new Set(movements.map((m) => m.recipient_person_id)).size).toBe(1);
  });
});

// #1359: the half prefill could not close. A linked requester's request has to
// land on their own record whatever the email field says, which means the
// action has to pick `request_gear_items_as_me()` off the session rather than
// trusting anything the browser sent.
describe("requesting gear as yourself (integration)", () => {
  const service = serviceRoleClient();
  const run = crypto.randomUUID().slice(0, 8);
  let tenantId: string;
  let restoreModule: () => Promise<void>;
  const createdUsers: string[] = [];
  const createdPeople: string[] = [];

  /** An account linked to a `people` row, as an approved claim leaves one. */
  async function linkedConstituent(name: string) {
    const email = uniqueEmail(`as-me-${run}`);
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: "password123",
      email_confirm: true,
    });
    if (error) throw error;
    createdUsers.push(data.user!.id);

    const { data: person, error: personError } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        source_type: "other",
        name,
        email,
        auth_user_id: data.user!.id,
      })
      .select("id")
      .single();
    if (personError) throw new Error(`person: ${personError.message}`);
    createdPeople.push(person.id as string);

    return {
      client: await signIn(email),
      personId: person.id as string,
      email,
    };
  }

  async function peopleCount() {
    const { count } = await service
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    return count ?? 0;
  }

  beforeAll(async () => {
    tenantId = await seededTenantId();
    restoreModule = await enableModule(tenantId, "constituent_accounts");
  });

  afterAll(async () => {
    await service.from("gear_requests").delete().in("person_id", createdPeople);
    await service.from("people").delete().in("id", createdPeople);
    await restoreModule();
  });

  test("lands on your own record however the email field is filled in", async () => {
    currentIp = uniqueIp();
    const { client, personId } = await linkedConstituent("Robin Ashford");
    currentClient = client;
    const [item] = await gearItems(1);
    const before = await peopleCount();

    const result = await requestGearItemsAction(
      [item],
      // Everything a browser could send about who is asking, all of it wrong,
      // and none of it read: the person comes from auth.uid().
      formData({
        name: "Somebody Else",
        email: uniqueEmail(`decoy-${run}`),
        phone: "555-9999",
        instagram_handle: "somebody.else",
        notes: "A 9.5 works too.",
      }),
    );
    expect(result).toEqual({ success: true, requestId: expect.any(String) });

    const { data: request } = await service
      .from("gear_requests")
      .select("person_id, notes, as_is_acknowledged_at, as_is_text")
      .eq("id", (result as { requestId: string }).requestId)
      .single();
    expect(request!.person_id).toBe(personId);
    expect(request!.notes).toBe("A 9.5 works too.");
    // #1367: asked on this path too, and recorded the same way. Holding an
    // account is not agreement to anything.
    expect(request!.as_is_acknowledged_at).not.toBeNull();
    expect(request!.as_is_text).toBe(gearAsIsText(DEFAULT_LEXICON));

    // The whole point: the decoy address minted nothing.
    expect(await peopleCount()).toBe(before);
    expect(await getInventoryItemStatus(item)).toBe("reserved");
  });

  test("leaves the record alone: a request is not an edit of a person", async () => {
    currentIp = uniqueIp();
    const { client, personId, email } =
      await linkedConstituent("Robin Ashford");
    currentClient = client;
    const [item] = await gearItems(1);

    await requestGearItemsAction(
      [item],
      formData({
        name: "Renamed",
        email: uniqueEmail(`decoy2-${run}`),
        phone: "555-9999",
        instagram_handle: "renamed",
      }),
    );

    const { data: person } = await service
      .from("people")
      .select("name, email, phone, instagram_handle")
      .eq("id", personId)
      .single();
    expect(person).toEqual({
      name: "Robin Ashford",
      email,
      phone: null,
      instagram_handle: null,
    });
  });

  test("an account with no record still goes down the anonymous path", async () => {
    currentIp = uniqueIp();
    const email = uniqueEmail(`unlinked-${run}`);
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: "password123",
      email_confirm: true,
    });
    if (error) throw error;
    createdUsers.push(data.user!.id);
    currentClient = await signIn(email);
    const [item] = await gearItems(1);
    const typed = uniqueEmail(`unlinked-typed-${run}`);

    const result = await requestGearItemsAction(
      [item],
      formData({ name: "Not Yet Linked", email: typed }),
    );
    expect(result).toEqual({ success: true, requestId: expect.any(String) });

    // A claim that has not been approved is not a link (§5.23), so the request
    // is matched or minted from the typed address exactly as a visitor's is.
    const { data: person } = await service
      .from("people")
      .select("id, auth_user_id")
      .eq("tenant_id", tenantId)
      .eq("email", typed)
      .single();
    expect(person!.auth_user_id).toBeNull();
    createdPeople.push(person!.id as string);
  });

  test("refuses when the tenant has inventory off, without matching anybody", async () => {
    currentIp = uniqueIp();
    const { client } = await linkedConstituent("Module Off");
    const [item] = await gearItems(1);

    let error: unknown = null;
    await withModule(tenantId, "inventory", false, async () => {
      ({ error } = await client.rpc("request_gear_items_as_me", {
        p_inventory_item_ids: [item],
        p_ip_address: uniqueIp(),
      }));
    });

    // `my_constituent_person_id('inventory')` is the one gate: no module, no
    // person, and the write never reaches the items (#902).
    expect((error as { message: string } | null)?.message).toContain(
      "NO_RECORD",
    );
    expect(await getInventoryItemStatus(item)).toBe("available");
  });

  // #1536: an account is not a bypass. Staff who need to skip the passphrase
  // use the portal checkout.
  test("asks a signed-in requester for the passphrase too", async () => {
    currentIp = uniqueIp();
    const { client } = await linkedConstituent("Sky Marsh");
    currentClient = client;
    const [item] = await gearItems(1);
    const restore = await requirePassphrase("Bluebird");
    try {
      const refused = await requestGearItemsAction([item], formData({}));
      expect(refused).toEqual({
        error: GEAR_PASSPHRASE_EXPIRED,
        passphraseRequired: true,
        code: "PASSPHRASE_REQUIRED",
      });
      expect(await getInventoryItemStatus(item)).toBe("available");

      passphraseCookie = "BLUEBIRD";
      const accepted = await requestGearItemsAction([item], formData({}));
      expect(accepted).toEqual({
        success: true,
        requestId: expect.any(String),
      });
    } finally {
      passphraseCookie = null;
      await restore();
    }
  });

  test("is not granted to anon at all", async () => {
    const [item] = await gearItems(1);

    const { error } = await anonClient().rpc("request_gear_items_as_me", {
      p_inventory_item_ids: [item],
      p_ip_address: uniqueIp(),
    });

    expect(error).not.toBeNull();
    expect(await getInventoryItemStatus(item)).toBe("available");
  });
});

// #1536. Off for every tenant unless it turns it on; on, every path through
// the cart answers to it in the database, and the dialog's check is only the
// visitor finding out sooner.
describe("the tenant's passphrase (integration)", () => {
  let restore: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await restore?.();
    restore = null;
    passphraseCookie = null;
  });

  test("changes nothing while it is off", async () => {
    currentIp = uniqueIp();
    const [item] = await gearItems(1);
    expect(await checkGearPassphraseAction("anything")).toEqual({
      success: true,
    });
    const result = await requestGearItemsAction(
      [item],
      formData({ name: "Jamie Rivera", email: uniqueEmail("pass-off") }),
    );
    expect(result).toEqual({ success: true, requestId: expect.any(String) });
  });

  test("refuses a visitor without it, before matching or minting a person", async () => {
    currentIp = uniqueIp();
    restore = await requirePassphrase("Bluebird");
    const [item] = await gearItems(1);
    const email = uniqueEmail("pass-missing");

    for (const cookie of [null, "Redbird"]) {
      passphraseCookie = cookie;
      const result = await requestGearItemsAction(
        [item],
        formData({ name: "Jamie Rivera", email }),
      );
      expect(result).toEqual({
        error: GEAR_PASSPHRASE_EXPIRED,
        passphraseRequired: true,
        code: "PASSPHRASE_REQUIRED",
      });
    }

    expect(await getInventoryItemStatus(item)).toBe("available");
    const { count } = await serviceRoleClient()
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("email", email);
    expect(count).toBe(0);
  });

  test("accepts it trimmed and in any case", async () => {
    currentIp = uniqueIp();
    restore = await requirePassphrase("Blue Bird");
    const [item] = await gearItems(1);

    expect(await checkGearPassphraseAction("  blue BIRD ")).toEqual({
      success: true,
    });
    // Kept trimmed, in an httpOnly cookie, for the submit to read.
    expect(passphraseCookie).toBe("blue BIRD");
    const result = await requestGearItemsAction(
      [item],
      formData({ name: "Jamie Rivera", email: uniqueEmail("pass-ok") }),
    );
    expect(result).toEqual({ success: true, requestId: expect.any(String) });
  });

  test("a rotated passphrase fails the next submit from an unlocked browser", async () => {
    currentIp = uniqueIp();
    restore = await requirePassphrase("Bluebird");
    expect(await checkGearPassphraseAction("Bluebird")).toEqual({
      success: true,
    });

    await restore();
    restore = await requirePassphrase("Snowbird");
    const [item] = await gearItems(1);

    const result = await requestGearItemsAction(
      [item],
      formData({ name: "Jamie Rivera", email: uniqueEmail("pass-rotated") }),
    );
    expect(result).toEqual({
      error: GEAR_PASSPHRASE_EXPIRED,
      passphraseRequired: true,
      code: "PASSPHRASE_REQUIRED",
    });
    // The stale word is dropped, so the page renders this browser locked.
    expect(passphraseCookie).toBeNull();
  });

  test("ignores a passphrase sent in the form instead of the cookie", async () => {
    currentIp = uniqueIp();
    restore = await requirePassphrase("Bluebird");
    const [item] = await gearItems(1);

    const result = await requestGearItemsAction(
      [item],
      formData({
        name: "Jamie Rivera",
        email: uniqueEmail("pass-form"),
        passphrase: "Bluebird",
      }),
    );
    expect(result).toEqual({
      error: GEAR_PASSPHRASE_EXPIRED,
      passphraseRequired: true,
      code: "PASSPHRASE_REQUIRED",
    });
  });

  test("the dialog's check says no to a wrong guess, and rate-limits guessing", async () => {
    currentIp = uniqueIp();
    restore = await requirePassphrase("Bluebird");

    expect(await checkGearPassphraseAction("Redbird")).toEqual({
      error: expect.stringContaining("doesn't match"),
      wrong: true,
    });
    expect(passphraseCookie).toBeNull();
    for (let i = 0; i < 9; i++) await checkGearPassphraseAction("Redbird");
    expect(await checkGearPassphraseAction("Bluebird")).toEqual({
      error: expect.stringContaining("Too many attempts"),
    });
  });

  test("the RPC refuses a direct anon call without it", async () => {
    restore = await requirePassphrase("Bluebird");
    const [item] = await gearItems(1);

    const { error } = await anonClient().rpc("request_gear_items", {
      p_inventory_item_ids: [item],
      p_name: "Jamie Rivera",
      p_email: uniqueEmail("pass-direct"),
      p_phone: null,
      p_ip_address: uniqueIp(),
      p_as_is_acknowledged: true,
      p_as_is_text: gearAsIsText(DEFAULT_LEXICON),
    });
    expect(error?.message).toBe("PASSPHRASE_REQUIRED");
    expect(await getInventoryItemStatus(item)).toBe("available");
  });

  test("anon learns that a passphrase is required, never what it is", async () => {
    restore = await requirePassphrase("Bluebird");

    const { data, error } = await anonClient()
      .from("public_gear_request_settings")
      .select("slot, value");
    expect(error).toBeNull();
    expect(data).toContainEqual({ slot: "passphrase_required", value: true });
    expect(JSON.stringify(data)).not.toContain("Bluebird");
  });
});
