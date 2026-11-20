/**
 * The paper every outbound email is printed on (#1238): the tenant's logo, its
 * colours, and the table scaffolding that survives a mail client.
 *
 * Before this, each renderer in this directory opened with its own copy of the
 * same `<div style="font-family: ...; max-width: 560px;">` and linked in the
 * same literal `#4c1d95` -- Chatter Snow's purple, sent from every tenant on
 * the platform. A tenant could upload a logo, pick a palette, see all of it on
 * its public site and its portal, and then the confirmation its registrants
 * actually received looked like nobody's organization at all.
 *
 * Three rules this file exists to hold:
 *
 *   * **Nothing may exist only inside the image.** Most clients block remote
 *     images by default, so the header has to read correctly with every image
 *     off: a tenant with no logo gets its name as a text wordmark, and a
 *     tenant with one gets that name as the image's `alt`, styled so the
 *     blocked state still reads as a wordmark rather than as grey system text.
 *     The footer names the organization either way.
 *   * **Email HTML is not web HTML.** Tables, inline styles, no stylesheet, no
 *     web font, no flex and no grid: Outlook on Windows renders through Word.
 *     Typography is deliberately not a brand token here (#1260) -- a web font
 *     does not load in most mail clients, so a branded email carries the
 *     tenant's colours and its logo and not its typeface.
 *   * **A colour nobody can read is worse than the platform's.** A brand
 *     colour is picked to work as a page accent against a tinted background,
 *     and a pale one is unreadable as link text on white. Every colour below
 *     goes through a contrast floor and falls back rather than render.
 *
 * Pure, with no runtime imports, for the same reason the renderers it serves
 * are: the preview (#1236) reaches this file through them from a Server
 * Action, and the whole thing is unit-tested under `bun run test` with no
 * database and no mail provider in the way. The plain-text part of a message
 * never passes through here at all -- there is no logo in text/plain and there
 * never should be.
 */

import { contrastRatio } from "@/lib/color-contrast";

/** Only the `brand.*` tokens an email can use. See `tenantMailContext()`. */
export type EmailBranding = {
  /** `brand.logo_url`, already resolved by `brandingFromRows()`. */
  logoUrl: string | null;
  /** `brand.primary` -- the accent, used for links. */
  primary: string | null;
  /** `brand.primary_deep` -- text and buttons, used for the wordmark. */
  primaryDeep: string | null;
};

/** What a tenant that has set no branding at all renders as. */
export const EMPTY_EMAIL_BRANDING: EmailBranding = {
  logoUrl: null,
  primary: null,
  primaryDeep: null,
};

/**
 * The shell's own background and text, stated rather than inherited.
 *
 * Explicit on purpose: a transparent wordmark plus a client's dark mode is how
 * a logo disappears, and a shell that leaves the background to the client is a
 * shell that cannot promise the brand colour above it is readable.
 */
export const EMAIL_BACKGROUND = "#ffffff";
export const EMAIL_TEXT = "#1c1917";
export const EMAIL_MUTED = "#57534e";
export const EMAIL_HAIRLINE = "#e7e5e4";

/** What every renderer linked in before a tenant could have an opinion. */
export const EMAIL_DEFAULT_ACCENT = "#4c1d95";

/**
 * System faces only. Named here so the three places that need it -- the
 * header, the body cell and the footer -- say it once; Word does not reliably
 * inherit `font-family` into a table cell, so each cell restates it.
 */
export const EMAIL_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** The column width every renderer already wrote by hand. */
export const EMAIL_CONTENT_WIDTH = 560;

/**
 * The rendered width the logo is capped at, and the reason the panel asks for
 * a source at least twice that: the `width` attribute is what Outlook obeys,
 * so a narrower image is scaled *up* to it rather than left alone.
 */
export const EMAIL_LOGO_WIDTH = 180;

/**
 * WCAG AA for body text. Link text in an email is body text, whatever the
 * tenant meant the colour for on their website.
 */
export const EMAIL_LINK_CONTRAST = 4.5;

/**
 * WCAG AA for large text, which the wordmark is: 20px bold clears the 18.66px
 * bold threshold. A floor of 4.5 here would reject brand colours that are
 * perfectly legible at that size, and the fallback is the platform's purple --
 * which is to say, somebody else's brand.
 */
export const EMAIL_WORDMARK_CONTRAST = 3;

/** The resolved colours one tenant's mail is drawn in. */
export type EmailPalette = {
  background: string;
  text: string;
  muted: string;
  hairline: string;
  /** Links and accents. The tenant's, when it can be read. */
  link: string;
  /** The text wordmark, and the styling a blocked logo's alt text falls to. */
  wordmark: string;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/;

/**
 * Restated rather than imported from `@/lib/branding`, which is the one place
 * this file would otherwise have a runtime dependency. The rows reaching here
 * have already been through `brandingFromRows()`, so this is a second belt on
 * a value that is meant to arrive validated -- cheap, and it keeps the module
 * standalone.
 */
function hexColor(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return HEX_COLOR.test(trimmed) ? trimmed : null;
}

export { contrastRatio };

/**
 * The first candidate a reader could actually read, or the platform's accent.
 *
 * A ladder rather than a single colour with a yes/no, because the two brand
 * colours are not interchangeable: `primary` is the accent a tenant picked for
 * links, and `primary_deep` is the one they picked for text, so a tenant whose
 * accent is too pale for link text has already told us what their dark colour
 * is. Reaching for it is closer to their brand than reaching for ours.
 */
function firstReadable(
  candidates: (string | null)[],
  floor: number,
  fallback: string,
): string {
  for (const candidate of candidates) {
    const color = hexColor(candidate);
    if (color && contrastRatio(color, EMAIL_BACKGROUND) >= floor) return color;
  }
  return fallback;
}

/** What this tenant's mail is coloured in, floors applied. */
export function emailPalette(branding: EmailBranding): EmailPalette {
  return {
    background: EMAIL_BACKGROUND,
    text: EMAIL_TEXT,
    muted: EMAIL_MUTED,
    hairline: EMAIL_HAIRLINE,
    link: firstReadable(
      [branding.primary, branding.primaryDeep],
      EMAIL_LINK_CONTRAST,
      EMAIL_DEFAULT_ACCENT,
    ),
    wordmark: firstReadable(
      [branding.primaryDeep, branding.primary],
      EMAIL_WORDMARK_CONTRAST,
      EMAIL_DEFAULT_ACCENT,
    ),
  };
}

/**
 * The logo as something a mail client can actually fetch, or null.
 *
 * `brand.logo_url` is allowed to be a path this site serves -- Chatter Snow's
 * own logo is `/chatter-logo-transparent.png` (#1267) -- and a path is
 * meaningless in an inbox, so it is resolved against the tenant's own origin.
 * Anything that is not then `http(s)` is dropped rather than emitted: a
 * `data:` or `javascript:` value typed into the field must not reach an `src`,
 * and an unfetchable one would render as a broken image where the text
 * fallback reads correctly.
 *
 * What this cannot check is whether the URL is *reachable without a session*.
 * A Google Drive thumbnail renders fine in a browser and is unreliable
 * hotlinked from a mail client, which is why the branding panel says so and
 * why the text fallback below has to be good rather than merely present.
 */
export function emailLogoUrl(
  logoUrl: string | null,
  siteUrl: string,
): string | null {
  const value = logoUrl?.trim();
  if (!value) return null;

  const base = siteUrl.trim();
  let resolved: URL;
  try {
    resolved = base ? new URL(value, base) : new URL(value);
  } catch {
    return null;
  }
  if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
    return null;
  }
  return resolved.toString();
}

/** Everything the shell needs that is not the message itself. */
export type EmailShellContext = {
  /** `tenants.name`. The wordmark, the `alt` text and the footer. */
  orgName: string;
  /** The tenant's own origin, from `tenantMailContext()`. May be blank. */
  siteUrl: string;
  branding: EmailBranding;
};

/**
 * The two shell inputs a renderer that takes its origin positionally does not
 * already hold: the digest, the ops report, the staff submission notices and
 * the claim notices all receive a payload and a `siteUrl` and know nothing
 * about which organization they are for.
 *
 * Optional at every one of those call sites, and absent renders a shell with
 * no header and no footer -- the message, in the platform's own colours, which
 * is what all of them looked like before this. That keeps a renderer callable
 * from a test without inventing an organization, while the senders, which all
 * hold a `TenantMailContext` already, always pass one.
 */
export type EmailOrgBrand = {
  /** `tenants.name`, from `tenantMailContext().displayName`. */
  orgName: string;
  branding: EmailBranding;
};

/** An `EmailOrgBrand` and an origin as the shell's own input. */
export function emailShellContext(
  brand: EmailOrgBrand | undefined,
  siteUrl: string,
): EmailShellContext {
  return {
    orgName: brand?.orgName ?? "",
    siteUrl,
    branding: brand?.branding ?? EMPTY_EMAIL_BRANDING,
  };
}

export type EmailShellInput = EmailShellContext & {
  /** The message, already escaped, without a wrapper of its own. */
  bodyHtml: string;
};

/**
 * One message, wrapped in its tenant's shell.
 *
 * The layout is a table inside a table inside an Outlook-only ghost table.
 * Word has no `max-width`, so without the conditional the column would run the
 * full width of a maximized Outlook window; every other client ignores the
 * conditional and obeys the `max-width` on the div. The hairline above the
 * footer is a one-pixel row with a background rather than a `border-top`, for
 * the same reason -- Word's border handling on a cell is not something to bet
 * a rule on.
 */
export function renderEmailShell(input: EmailShellInput): string {
  const palette = emailPalette(input.branding);
  const orgName = input.orgName.trim();
  const logo = emailLogoUrl(input.branding.logoUrl, input.siteUrl);
  const width = EMAIL_CONTENT_WIDTH;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: ${palette.background}; margin: 0; padding: 0;">
  <tr>
    <td align="left" style="padding: 24px 16px;">
      <!--[if mso]><table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <div style="max-width: ${width}px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
${header(orgName, logo, palette)}
          <tr>
            <td style="font-family: ${EMAIL_FONT_STACK}; color: ${palette.text}; font-size: 15px; line-height: 1.5;">
${input.bodyHtml}
            </td>
          </tr>
${footer(orgName, input.siteUrl, palette)}
        </table>
      </div>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>`;
}

/**
 * The logo, or the organization's name set as one.
 *
 * The typographic properties on the `<img>` are not decoration: a client that
 * has blocked the image draws the `alt` text on that element, inheriting them,
 * so the blocked state is the same wordmark in the same colour rather than
 * 13px of grey system text. That is the state most inboxes open an email in.
 */
function header(
  orgName: string,
  logo: string | null,
  palette: EmailPalette,
): string {
  if (!logo && !orgName) return "";

  const type = `font-family: ${EMAIL_FONT_STACK}; font-size: 20px; font-weight: 700; line-height: 1.3; color: ${palette.wordmark};`;
  const content = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(orgName)}" width="${EMAIL_LOGO_WIDTH}" style="display: block; border: 0; outline: none; text-decoration: none; width: ${EMAIL_LOGO_WIDTH}px; max-width: 100%; height: auto; ${type}">`
    : escapeHtml(orgName);

  return `          <tr>
            <td style="padding: 0 0 24px; ${type}">${content}</td>
          </tr>`;
}

/**
 * The organization's name under a rule, linked to its own site.
 *
 * Its job is the acceptance criterion the header cannot meet on its own: with
 * every remote image blocked, an email still has to name the organization it
 * came from in text somebody is certain to see. Several messages already sign
 * off with the name, and the small duplication is the price of not depending
 * on which of them do.
 */
function footer(
  orgName: string,
  siteUrl: string,
  palette: EmailPalette,
): string {
  if (!orgName) return "";
  const origin = siteUrl.trim().replace(/\/+$/, "");
  const name = escapeHtml(orgName);
  const content = origin
    ? `<a href="${escapeHtml(origin)}" style="color: ${palette.muted}; text-decoration: none;">${name}</a>`
    : name;

  return `          <tr>
            <td height="1" style="height: 1px; font-size: 1px; line-height: 1px; background-color: ${palette.hairline};">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding: 12px 0 0; font-family: ${EMAIL_FONT_STACK}; font-size: 12px; line-height: 1.5; color: ${palette.muted};">${content}</td>
          </tr>`;
}

/**
 * The organization's name is tenant-supplied text and the logo URL was typed
 * into a settings field, so neither may close a tag or open an attribute of
 * its own. Its own copy rather than the shared one in `auto-reply-email.ts`,
 * which would be this module's only runtime import.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
