import {
  escapeHtml,
  joinHtmlLines,
  joinTextBlocks,
} from "@/lib/notifications/auto-reply-email";
import {
  emailPalette,
  EMPTY_EMAIL_BRANDING,
  renderEmailShell,
  type EmailBranding,
} from "@/lib/notifications/email-shell";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";

/**
 * An event media upload link, emailed to the photographer it was made for
 * (#1641). It names the event, who the link is for, when it expires and the
 * link itself -- nothing else of the event, since the recipient usually has no
 * portal account.
 *
 * Staff-initiated and not in NOTIFICATION_KINDS, like the event access email:
 * there is no person to switch it off.
 */

export const UPLOAD_LINK_EMAIL_KIND = "event_media_upload_link";

export type UploadLinkMessage = {
  orgName: string;
  eventName: string;
  /** The link's label: who it is for. */
  label: string;
  /** ISO instant the link stops working. */
  expiresAt: string;
  /** The event's own zone, so the expiry reads as the coordinator chose it. */
  timeZone: string;
  /** The upload page, absolute. */
  url: string;
  siteUrl: string;
  branding?: EmailBranding;
};

export function uploadLinkSubject(orgName: string, eventName: string): string {
  return `Upload your photos and videos from ${eventName.trim() || "the event"} for ${orgName}`;
}

export function renderUploadLinkEmail(
  message: UploadLinkMessage,
): RenderedEmail {
  const branding = message.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const eventName = message.eventName.trim() || "the event";
  const lead = `${message.orgName} sent you a link to upload photos and videos from ${eventName}.`;
  const forLine = `It was made for ${message.label.trim()}.`;
  const expires = formatDateTimeInZone(
    message.expiresAt,
    message.timeZone,
    DATE_TIME_WITH_ZONE,
  );
  const linkLabel = "Upload photos and videos";
  const linkNote = `No account needed. The link works until ${expires}. Anyone with it can upload, so please don't pass it on.`;
  const signoff = `— ${message.orgName}`;

  const text = joinTextBlocks([
    `${lead} ${forLine}`,
    `${linkLabel}: ${message.url}\n${linkNote}`,
    signoff,
  ]);

  const html = renderEmailShell({
    orgName: message.orgName,
    siteUrl: message.siteUrl,
    branding,
    bodyHtml: joinHtmlLines([
      `  <p style="margin: 0 0 16px;">${escapeHtml(lead)} ${escapeHtml(forLine)}</p>`,
      `  <p style="margin: 0 0 4px;"><a href="${escapeHtml(message.url)}" style="color: ${palette.link}; font-weight: 600; text-decoration: underline;">${escapeHtml(linkLabel)}</a></p>`,
      `  <p style="color: ${palette.muted}; font-size: 14px; margin: 0 0 20px;">${escapeHtml(linkNote)}</p>`,
      `  <p style="color: ${palette.muted}; margin: 12px 0 0;">${escapeHtml(signoff)}</p>`,
    ]),
  });

  return {
    subject: uploadLinkSubject(message.orgName, message.eventName),
    text,
    html,
  };
}
