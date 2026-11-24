import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  parseDeliveryEvent,
  verifyResendWebhook,
} from "@/lib/email/resend-webhook";
import { recordDeliveryEvent } from "@/lib/notifications/delivery-events";

/**
 * Resend's webhook (#1921): permanent bounces and spam complaints, recorded on
 * the delivery ledger. Subscribe it to `email.bounced` and `email.complained`
 * in the Resend dashboard; any other event is acknowledged and ignored.
 *
 * RESEND_WEBHOOK_SECRET unset refuses everything, like CRON_SECRET: an
 * unauthenticated endpoint that writes to the ledger and switches people's
 * email off is not something to default open.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  // The raw text, not request.json(): the signature is over the exact bytes.
  const body = await request.text();
  if (
    !secret ||
    !verifyResendWebhook(
      body,
      {
        id: request.headers.get("svix-id"),
        timestamp: request.headers.get("svix-timestamp"),
        signature: request.headers.get("svix-signature"),
      },
      secret,
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = parseDeliveryEvent(parsed);
  if (!event) return NextResponse.json({ ignored: true });

  const ok = await recordDeliveryEvent(createSupabaseAdminClient(), event);
  return ok
    ? NextResponse.json({ recorded: event.event })
    : NextResponse.json({ error: "Could not record" }, { status: 500 });
}
