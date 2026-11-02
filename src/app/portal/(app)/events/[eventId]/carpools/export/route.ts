import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkEventAccess } from "@/lib/auth/event-access";
import { loadEventCarpools } from "@/lib/portal/event-carpools";
import {
  carpoolsCsv,
  carpoolsCsvFilename,
  type CarpoolsCsvRegistration,
} from "../../../carpools-csv";

/**
 * "Download carpools (CSV)" on the carpool board (#1649). Gated on
 * `events: manage`, like the answers export beside it: the file is for whoever
 * arranges the rides, and carries contact details under the same consent rule
 * -- see `carpools-csv.ts`.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const denied = await checkEventAccess(supabase, {
    table: "event_carpool_cars",
    level: "manage",
    eventId,
  });
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: 403 });
  }

  const [event, questions, registrations] = await Promise.all([
    supabase.from("events").select("name").eq("id", eventId).maybeSingle(),
    supabase
      .from("event_registration_questions")
      .select("id, prompt, shares_contact")
      .eq("event_id", eventId)
      .is("archived_at", null),
    supabase
      .from("event_registrations")
      .select(
        "id, name, party_size, email, phone, instagram_handle, preferred_contact_detail, answers_changed_at, answers:event_registration_answers(question_id, answer_text, value)",
      )
      .eq("event_id", eventId)
      .is("cancelled_at", null)
      // #1764. A test registration rides in no carpool.
      .eq("is_test", false),
  ]);

  if (event.error || questions.error || registrations.error) {
    return NextResponse.json(
      { error: "Could not build the export. Please try again." },
      { status: 500 },
    );
  }
  if (!event.data) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const rows = registrations.data ?? [];
  const carpools = await loadEventCarpools(
    supabase,
    eventId,
    rows.map((row) => ({
      registrationId: row.id,
      name: row.name,
      partySize: row.party_size,
      answersChangedAt: row.answers_changed_at,
    })),
  );
  if (!carpools) {
    return NextResponse.json(
      { error: "This event doesn't organize carpools." },
      { status: 404 },
    );
  }

  const csv = carpoolsCsv(
    carpools.cars,
    questions.data ?? [],
    rows as unknown as CarpoolsCsvRegistration[],
  );
  const filename = carpoolsCsvFilename(
    event.data.name,
    new Date().toISOString().slice(0, 10),
  );
  // The byte-order mark makes Excel read the file as UTF-8.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
