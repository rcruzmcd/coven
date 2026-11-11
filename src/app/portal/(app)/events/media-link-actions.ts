"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { checkEventAccess } from "@/lib/auth/event-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEmailAddress, tenantMailContext } from "@/lib/email/identity";
import { deliverEmail } from "@/lib/notifications/deliver";
import {
  hashConfirmationToken,
  isConfirmationToken,
  mintConfirmationToken,
} from "@/lib/notifications/notification-email-token";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  renderUploadLinkEmail,
  UPLOAD_LINK_EMAIL_KIND,
} from "@/lib/notifications/upload-link-email";
import { qrCodeDataUri } from "@/lib/inventory-label-codes";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  GIB,
  UPLOAD_LINK_LABEL_MAX,
  UPLOAD_LINK_MAX_CAP_GB,
  UPLOAD_LINK_MIN_CAP_GB,
  uploadLinkPath,
} from "@/lib/event-media-upload-links";

export type UploadLinkRow = {
  id: string;
  label: string;
  expires_at: string;
  max_bytes: number;
  revoked_at: string | null;
  created_at: string;
  /** Files and bytes recorded through the link. */
  files: number;
  bytes: number;
};

/** The one moment the link's URL exists outside the browser it is shown in. */
export type CreatedUploadLink = { url: string; qr: string };

/**
 * An event's upload links with what was uploaded through each (#1620). Gated
 * on events:view, like the links' select policy.
 */
export async function listEventMediaUploadLinksAction(
  eventId: string,
): Promise<{ links: UploadLinkRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkEventAccess(supabase, {
    table: "event_media_upload_links",
    level: "view",
    eventId,
  });
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("event_media_upload_link_list", {
    p_event_id: String(eventId),
  });
  if (error) {
    console.error("Could not list event media upload links", error);
    return { error: "Could not load the upload links. Please try again." };
  }
  return {
    links: (data ?? []).map((row) => ({
      ...row,
      revoked_at: row.revoked_at ?? null,
      max_bytes: Number(row.max_bytes),
      files: Number(row.files),
      bytes: Number(row.bytes),
    })),
  };
}

/**
 * Creates an upload link (#1620) and hands back its URL and a QR code of it,
 * once: only the token's SHA-256 is stored, so nothing can show it again.
 *
 * events:manage, checked again by create_event_media_upload_link() along with
 * the tenant's uploads setting and the demo tenant. The URL is on the
 * request's own origin, the host the coordinator is on, which serves the page
 * on every host shape (`uploadLinkPath`).
 */
export async function createEventMediaUploadLinkAction(
  eventId: string,
  input: { label: string; expiresAt: string; maxGb: number },
): Promise<{ link: CreatedUploadLink } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to create upload links.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(
    supabase,
    { table: "event_media_upload_links", level: "manage", eventId },
    "You don't have permission to create upload links for this event.",
  );
  if (permissionError) return permissionError;

  const label = String(input?.label ?? "").trim();
  if (!label) return { error: "Say who the link is for." };
  if (label.length > UPLOAD_LINK_LABEL_MAX) {
    return {
      error: `Keep the name under ${UPLOAD_LINK_LABEL_MAX} characters.`,
    };
  }
  const expiresAt = new Date(String(input?.expiresAt ?? ""));
  if (Number.isNaN(expiresAt.getTime())) {
    return { error: "Choose when the link expires." };
  }
  const maxGb = Number(input?.maxGb);
  if (
    !Number.isInteger(maxGb) ||
    maxGb < UPLOAD_LINK_MIN_CAP_GB ||
    maxGb > UPLOAD_LINK_MAX_CAP_GB
  ) {
    return {
      error: `The storage limit has to be a whole number of GB from ${UPLOAD_LINK_MIN_CAP_GB} to ${UPLOAD_LINK_MAX_CAP_GB}.`,
    };
  }

  const { token, hash } = mintConfirmationToken();
  const { error } = await supabase.rpc("create_event_media_upload_link", {
    p_event_id: String(eventId),
    p_label: label,
    p_token_hash: hash,
    p_expires_at: expiresAt.toISOString(),
    p_max_bytes: maxGb * GIB,
  });
  if (error) {
    console.error("Could not create an event media upload link", error);
    const code = error.message;
    return {
      error: code.includes("UPLOADS_DISABLED")
        ? "Event media uploads are turned off for this organization."
        : code.includes("INVALID_EXPIRY")
          ? "The expiry has to be in the future and within a year."
          : code.includes("PERMISSION_DENIED")
            ? "You don't have permission to create upload links for this event."
            : code.includes("EVENT_NOT_FOUND")
              ? "This event no longer exists."
              : "Could not create the link. Please try again.",
    };
  }

  const url = `${await getRequestOrigin()}${uploadLinkPath(token)}`;
  revalidatePath("/portal/events");
  return { link: { url, qr: qrCodeDataUri(url) } };
}

const UPLOAD_LINK_URL = /\/portal\/media-upload\/([^/?#]+)$/;

/**
 * Emails a just-created upload link to the photographer it is for (#1641).
 *
 * Takes the URL the create dialog was handed, because the raw token exists
 * nowhere else; the token's hash must name a live link of this event, so the
 * action mails only a link this coordinator could already see, never any URL
 * the client chooses, and the link it mails is rebuilt here.
 *
 * Addressed to a bare address with no `people` row behind it (personId null,
 * as the event access email), under the tenant's org-email switch, and deduped
 * per link and address so a retried click mails once.
 */
export async function emailEventMediaUploadLinkAction(
  eventId: string,
  input: { url: string; to: string },
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to email upload links.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(
    supabase,
    { table: "event_media_upload_links", level: "manage", eventId },
    "You don't have permission to email upload links for this event.",
  );
  if (permissionError) return permissionError;

  const to = String(input?.to ?? "")
    .trim()
    .toLowerCase();
  if (!isEmailAddress(to)) return { error: "Enter a valid email address." };
  const token = UPLOAD_LINK_URL.exec(String(input?.url ?? ""))?.[1] ?? "";
  if (!isConfirmationToken(token)) {
    return { error: "This link can't be emailed. Copy it instead." };
  }

  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("event_media_upload_links")
    .select("id, tenant_id, label, expires_at, revoked_at")
    .eq("token_hash", hashConfirmationToken(token))
    .eq("event_id", String(eventId))
    .maybeSingle();
  if (
    !link ||
    link.revoked_at ||
    new Date(link.expires_at).getTime() <= Date.now()
  ) {
    return { error: "This link is no longer active." };
  }
  if (!(await isOrgEmailEnabled(admin, link.tenant_id))) {
    return {
      error:
        "Email is turned off for this organization. Copy the link and send it yourself.",
    };
  }

  const { data: event } = await admin
    .from("events")
    .select("name, timezone")
    .eq("id", String(eventId))
    .maybeSingle();
  const origin = await getRequestOrigin();
  const mail = await tenantMailContext(admin, link.tenant_id, {
    fallbackOrigin: origin,
  });
  const outcome = await deliverEmail(admin, {
    tenantId: link.tenant_id,
    personId: null,
    identity: mail.identity,
    kind: UPLOAD_LINK_EMAIL_KIND,
    dedupeKey: `${UPLOAD_LINK_EMAIL_KIND}:${link.id}:${to}`,
    to,
    render: () =>
      renderUploadLinkEmail({
        orgName: mail.displayName,
        eventName: event?.name ?? "",
        label: link.label,
        expiresAt: link.expires_at,
        timeZone: event?.timezone ?? "UTC",
        url: `${origin}${uploadLinkPath(token)}`,
        siteUrl: mail.origin,
        branding: mail.branding,
      }),
    logPrefix: "[upload-link-email]",
  });
  if (outcome === "failed") {
    return {
      error: `Couldn't email the link to ${to}. Copy it and send it yourself.`,
    };
  }
  if (outcome === "skipped") {
    return { error: `The link was already emailed to ${to}.` };
  }
  return { ok: true };
}

/** Revokes an upload link (#1620): no new uploads; what was uploaded stays. */
export async function revokeEventMediaUploadLinkAction(
  linkId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to revoke upload links.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(
    supabase,
    { table: "event_media_upload_links", level: "manage" },
    "You don't have permission to revoke upload links.",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("revoke_event_media_upload_link", {
    p_link_id: String(linkId),
  });
  if (error) {
    console.error("Could not revoke an event media upload link", error);
    return { error: "Could not revoke the link. Please try again." };
  }

  revalidatePath("/portal/events");
  return { ok: true };
}
