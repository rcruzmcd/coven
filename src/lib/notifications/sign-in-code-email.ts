import {
  emailPalette,
  EMPTY_EMAIL_BRANDING,
  renderEmailShell,
  type EmailBranding,
} from "@/lib/notifications/email-shell";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The one-time sign-in code (#1765), as text and HTML.
 *
 * Sent by the application rather than by Supabase Auth's own mailer so it
 * goes out in the tenant's name, from its address and in its colours (#857,
 * #1238) -- Auth's template is one per project, and every tenant shares the
 * project. It carries the code and nothing else: no name, no record, nothing
 * that says whether this address was known before the code was asked for.
 */
export function renderSignInCodeEmail(notice: {
  orgName: string;
  code: string;
  siteUrl: string;
  branding?: EmailBranding;
}): RenderedEmail {
  const branding = notice.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const lead = `Your code for ${notice.orgName} is:`;
  const expiry = "It works once, for the next hour.";
  const ignore =
    "If you did not ask for it, ignore this message. Nobody can use it without access to this mailbox.";

  return {
    subject: `${notice.code} is your ${notice.orgName} code`,
    text: [lead, "", notice.code, "", expiry, "", ignore].join("\n"),
    html: renderEmailShell({
      orgName: notice.orgName,
      siteUrl: notice.siteUrl,
      branding,
      bodyHtml: `  <p style="margin: 0 0 16px;">${escapeHtml(lead)}</p>
  <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 0 0 24px;">${escapeHtml(notice.code)}</p>
  <p style="color: ${palette.muted}; font-size: 13px; margin: 0 0 6px;">${escapeHtml(expiry)}</p>
  <p style="color: ${palette.muted}; font-size: 13px; margin: 0;">${escapeHtml(ignore)}</p>`,
    }),
  };
}

/** The organization's name is tenant-supplied text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
