// Integration test (#1792): a content piece stands on its own and can be
// linked to a calendar item, an event, both or neither -- and, since #1838, a
// program. Deleting the item, event or program clears the link and keeps the
// piece, and the composite (tenant_id, event_id) and (tenant_id, program_id)
// keys refuse another tenant's event or program. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createCalendarItem,
  createContentPiece,
  createProgram,
  createPublishedEvent,
  serviceRoleClient,
} from "../../../../../test/integration-setup";

const pieceIds: string[] = [];

async function piece(
  calendarItemId: string | null,
  eventId: string | null = null,
) {
  const created = await createContentPiece(calendarItemId, { eventId });
  pieceIds.push(created.id);
  return created.id;
}

async function links(id: string) {
  const { data, error } = await adminClient
    .from("content_opportunities")
    .select("calendar_item_id, event_id")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

afterAll(async () => {
  await adminClient.from("content_opportunities").delete().in("id", pieceIds);
});

describe("content piece links (integration)", () => {
  test("a piece can be standalone, event-linked, item-linked or both", async () => {
    const item = await createCalendarItem();
    const event = await createPublishedEvent();
    try {
      const standalone = await piece(null);
      const eventLinked = await piece(null, event.id);
      const itemLinked = await piece(item.id);
      const both = await piece(item.id, event.id);

      expect(await links(standalone)).toEqual({
        calendar_item_id: null,
        event_id: null,
      });
      expect(await links(eventLinked)).toEqual({
        calendar_item_id: null,
        event_id: event.id,
      });
      expect(await links(itemLinked)).toEqual({
        calendar_item_id: item.id,
        event_id: null,
      });
      expect(await links(both)).toEqual({
        calendar_item_id: item.id,
        event_id: event.id,
      });
    } finally {
      await adminClient
        .from("content_opportunities")
        .update({ calendar_item_id: null, event_id: null })
        .in("id", pieceIds);
      await item.cleanup();
      await event.cleanup();
    }
  });

  test("deleting the event clears the link and keeps the piece", async () => {
    const event = await createPublishedEvent();
    const id = await piece(null, event.id);

    // Not a delete blocker: the event goes, the piece stays.
    await event.cleanup();

    expect(await links(id)).toEqual({ calendar_item_id: null, event_id: null });
  });

  test("deleting the program clears the link and keeps the piece (#1838)", async () => {
    const program = await createProgram();
    const created = await createContentPiece(null, { programId: program.id });
    pieceIds.push(created.id);

    await program.cleanup();

    const { data, error } = await adminClient
      .from("content_opportunities")
      .select("program_id")
      .eq("id", created.id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ program_id: null });
  });

  test("deleting the calendar item clears the link and keeps the piece", async () => {
    const item = await createCalendarItem();
    const id = await piece(item.id);

    // Straight delete, not item.cleanup(), which removes the item's pieces.
    const { error } = await adminClient
      .from("calendar_items")
      .delete()
      .eq("id", item.id);
    expect(error).toBeNull();

    expect(await links(id)).toEqual({ calendar_item_id: null, event_id: null });
  });

  // The second tenant is suspended, so the sole-active-tenant default the
  // rest of the suite relies on keeps resolving while it exists.
  describe("another tenant's event", () => {
    const service = serviceRoleClient();
    const run = crypto.randomUUID().slice(0, 8);
    let tenantId: string;
    let otherEventId: string;
    let otherProgramId: string;

    beforeAll(async () => {
      const { data: tenant, error } = await service
        .from("tenants")
        .insert({
          name: `Content Piece Isolation ${run}`,
          slug: `content-piece-isolation-${run}`,
          status: "suspended",
        })
        .select("id")
        .single();
      if (error) throw error;
      tenantId = tenant.id as string;

      const {
        data: { user },
      } = await adminClient.auth.getUser();

      const { data: event, error: eventError } = await service
        .from("events")
        .insert({
          tenant_id: tenantId,
          created_by: user!.id,
          name: `Other tenant event ${run}`,
          starts_at: new Date(Date.now() + 86_400_000).toISOString(),
          timezone: "America/Chicago",
          visibility: "private",
          status: "draft",
        })
        .select("id")
        .single();
      if (eventError) throw eventError;
      otherEventId = event.id as string;

      const { data: program, error: programError } = await service
        .from("programs")
        .insert({
          tenant_id: tenantId,
          created_by: user!.id,
          name: `Other tenant program ${run}`,
        })
        .select("id")
        .single();
      if (programError) throw programError;
      otherProgramId = program.id as string;
    });

    afterAll(async () => {
      await service.from("events").delete().eq("id", otherEventId);
      await service.from("programs").delete().eq("id", otherProgramId);
      // A new tenant is provisioned with retention policies of its own.
      await service
        .from("retention_policies")
        .delete()
        .eq("tenant_id", tenantId);
      const { error } = await service
        .from("tenants")
        .delete()
        .eq("id", tenantId);
      if (error) throw error;
    });

    test("is refused on insert and on update", async () => {
      const { error: insertError } = await adminClient
        .from("content_opportunities")
        .insert({ title: `Cross-tenant ${run}`, event_id: otherEventId });
      expect(insertError?.code).toBe("23503");

      const id = await piece(null);
      const { error: updateError } = await service
        .from("content_opportunities")
        .update({ event_id: otherEventId })
        .eq("id", id);
      expect(updateError?.code).toBe("23503");
      expect((await links(id)).event_id).toBeNull();
    });

    test("another tenant's program is refused on insert and on update (#1838)", async () => {
      const { error: insertError } = await adminClient
        .from("content_opportunities")
        .insert({ title: `Cross-tenant ${run}`, program_id: otherProgramId });
      expect(insertError?.code).toBe("23503");

      const id = await piece(null);
      const { error: updateError } = await service
        .from("content_opportunities")
        .update({ program_id: otherProgramId })
        .eq("id", id);
      expect(updateError?.code).toBe("23503");
    });
  });
});
