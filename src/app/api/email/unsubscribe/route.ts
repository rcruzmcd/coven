import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import { switchOffNotificationKind } from "@/lib/notifications/switch-off-kind";

/**
 * The target of every message's List-Unsubscribe header (#1921).
 *
 * POST is the RFC 8058 one-click: a mailbox provider calls it, with no cookie
 * and no human, when the recipient presses its "Unsubscribe" button. It acts
 * on the signed token alone.
 *
 * GET never changes anything. Link scanners and preview fetchers follow every
 * URL in a message, and a GET that unsubscribed would switch people off for
 * having opened their mail. A person who does follow the link lands on the
 * screen that holds the switch -- `/my` for a receipt, their account for a
 * staff notice -- where they can turn it off themselves.
 */

function secret(): string | undefined {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || undefined;
}

export async function POST(request: Request) {
  const key = secret();
  const claim = key
    ? verifyUnsubscribeToken(new URL(request.url).searchParams.get("t"), key)
    : null;
  if (!claim) {
    return NextResponse.json({ error: "Invalid link." }, { status: 400 });
  }

  const ok = await switchOffNotificationKind(
    createSupabaseAdminClient(),
    claim,
    "[unsubscribe]",
  );
  return ok
    ? NextResponse.json({ unsubscribed: claim.kind })
    : NextResponse.json({ error: "Could not unsubscribe." }, { status: 500 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = secret();
  const claim = key
    ? verifyUnsubscribeToken(url.searchParams.get("t"), key)
    : null;
  const audience = claim
    ? NOTIFICATION_KINDS.find((kind) => kind.key === claim.kind)?.audience
    : undefined;
  const destination =
    audience === "constituent" ? "/my/notifications" : "/portal/account";
  return NextResponse.redirect(new URL(destination, url.origin), 303);
}
