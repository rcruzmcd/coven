import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BRAND_PREFIX,
  brandingFromRows,
  brandSettingKey,
  LOGO_URL_TOKEN,
  type BrandingRow,
} from "@/lib/branding";
import {
  EMPTY_EMAIL_BRANDING,
  type EmailBranding,
} from "@/lib/notifications/email-shell";

/**
 * Who a tenant's mail comes from, where a reply to it goes (#857), and which
 * origin its links point at (#860).
 *
 * Outbound mail used to be multi-tenant on the recipient side and
 * single-tenant on the sender side: sendEmail() read EMAIL_FROM and
 * EMAIL_REPLY_TO off the environment and had no tenant input at all, so a
 * digest for one organization arrived from another's address and a reply
 * landed in another's inbox. The Reply-To is the sharper half -- the mailboxes
 * people read are on Zoho while the app sends through Resend, so a reply to
 * the sending address bounces, which is the whole reason EMAIL_REPLY_TO
 * exists.
 *
 * The origin is here rather than in a module of its own because it is answered
 * by a column this file already reads: tenants.custom_domain decides both
 * whether a tenant may send from its own address and which site its recipients
 * should be sent to. Two readers would mean two queries per tenant per run for
 * one row.
 *
 * Split the way ops-report.ts and ops-report-job.ts are: everything above
 * tenantMailContext() is pure, so the precedence rules and the header
 * composition are unit-testable without a database, and the one function that
 * touches Postgres does nothing but two reads. No `server-only`: this reads no
 * secret, the same as src/lib/notifications/settings.ts, and staying importable
 * keeps its test free of the mock.module dance send.test.ts needs.
 */

/** Where replies to this tenant's mail should go. Per tenant, in app_settings. */
export const REPLY_TO_SETTING_KEY = "notifications.reply_to";

/**
 * The address this tenant's mail is sent from, when the operator has verified
 * its domain with the provider. Constrained -- see isAllowedFromAddress().
 */
export const FROM_ADDRESS_SETTING_KEY = "notifications.from_address";

/**
 * The `brand.*` rows the email shell reads (#1238), fetched in the same pass
 * as the sender identity.
 *
 * Here rather than in a reader of its own because it is the same row set, on
 * the same table, for the same tenant: a job that walks fifty tenants should
 * do one `app_settings` read each, not two. Only the three tokens an email can
 * use -- the rest of the namespace is a gradient, an app icon and a typeface,
 * and none of those belongs in a mail client.
 */
export const BRAND_MAIL_SETTING_KEYS = [
  brandSettingKey("primary"),
  brandSettingKey("primary_deep"),
  brandSettingKey(LOGO_URL_TOKEN),
] as const;

/**
 * The `brand.*` rows as the shell's narrow view of them.
 *
 * Folded through `brandingFromRows()` rather than read straight off the rows,
 * so a malformed colour is dropped and a Google Drive share link is turned
 * into a thumbnail URL by exactly the same code the website uses. Two
 * resolutions of one field would be two answers to "what is this tenant's
 * logo?".
 */
export function emailBrandingFromRows(
  rows: readonly { key: string; value: unknown }[],
): EmailBranding {
  const branding = brandingFromRows(
    rows
      .filter((row) => row.key.startsWith(BRAND_PREFIX))
      .map((row) => ({
        token: row.key.slice(BRAND_PREFIX.length),
        value: row.value,
      })) as BrandingRow[],
  );
  return {
    logoUrl: branding.logoUrl,
    primary: branding.colors.primary ?? null,
    primaryDeep: branding.colors.primary_deep ?? null,
  };
}

/** What a message is sent as. `from` is a composed header, `replyTo` a bare address. */
export type MailIdentity = {
  from: string;
  replyTo?: string;
  /**
   * The tenant's origin, for links that belong to the message rather than its
   * body -- today the List-Unsubscribe URL (#1921), which deliverEmail()
   * composes. Set by tenantMailContext(); absent, no such header is sent.
   */
  origin?: string;
};

export type MailIdentityInput = {
  /** tenants.name -- the display name every recipient sees. */
  tenantName: string | null;
  /** tenants.custom_domain, the operator-set domain this tenant owns. */
  tenantCustomDomain: string | null;
  /** Raw jsonb from app_settings; anything unusable reads as unset. */
  fromAddressSetting: unknown;
  replyToSetting: unknown;
  /** EMAIL_FROM / EMAIL_REPLY_TO -- the platform's own fallbacks. */
  platformFrom: string | null;
  platformReplyTo: string | null;
  /** What verifiedSendingDomains() resolved for this deployment. */
  verifiedDomains: string[];
};

/**
 * A display name is decoration, and an unbounded tenant name in a header is
 * not. Long enough for any real organization's name.
 */
const MAX_DISPLAY_NAME = 60;

/**
 * Deliberately loose: this guards against a stray word or a truncated paste,
 * not against an address a mail server would refuse. The provider is the only
 * thing that can really answer that, and its answer is recorded in the ledger.
 *
 * Lives here rather than in ops-report.ts, where it started, because the email
 * layer must not have to import the ops report to validate an address. That
 * module re-exports it, so its own callers did not have to move.
 */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

/**
 * The address out of `Name <addr@example.org>`, or the value itself when it is
 * already bare. EMAIL_FROM has always been handed to the provider verbatim, so
 * a deployment may well have the composed form in it, and every rule below --
 * the domain check, the display name -- needs the address on its own.
 */
export function bareAddress(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const angled = value.match(/<([^<>]+)>\s*$/);
  const address = (angled ? angled[1] : value).trim().toLowerCase();
  return address ? address : null;
}

/**
 * An app_settings value as an address, or null. A missing row, a null, the
 * empty string that stands in for "unset" (app_settings has no delete grant),
 * a value typed into the table by hand -- all read as unset rather than as a
 * guess.
 */
export function settingAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim().toLowerCase();
  return address && isEmailAddress(address) ? address : null;
}

/** The domain half of an address, lowercased. */
export function emailDomain(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at < 0) return null;
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain ? domain : null;
}

/**
 * The domains the operator has verified on the provider account.
 *
 * Unset falls back to the domain of EMAIL_FROM, which reproduces the behaviour
 * that came before this exactly: the platform's own domain is the only one
 * that sends, and no tenant override can take effect until an operator opts in
 * by naming more. Read per call rather than at module scope, like
 * portalRedirectHosts(), so a test can vary it.
 */
export function verifiedSendingDomains(platformFrom: string | null): string[] {
  const configured = (process.env.EMAIL_VERIFIED_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length > 0) return configured;

  const address = bareAddress(platformFrom);
  const fallback = address ? emailDomain(address) : null;
  return fallback ? [fallback] : [];
}

/**
 * Whether a tenant may send from this address. Two conditions, and both are
 * load-bearing:
 *
 *   * the domain is one the operator has verified with the provider --
 *     **exactly**. A provider verifies a domain, not its subtree, so
 *     `mail.example.org` is a separate verification from `example.org`;
 *   * it is the tenant's own `custom_domain`, or a subdomain of it. Owning a
 *     parent implies control of a child, so this half *is* a suffix match --
 *     but only in that direction, since anyone can be handed a subdomain.
 *
 * Without the second condition the first is not a control at all: once one
 * tenant's domain is verified, any other tenant's administrator could point
 * `notifications.from_address` at an address on it and send DKIM-signed mail as
 * them. `custom_domain` is writable only through platform_set_tenant_domain(),
 * behind require_platform_operator(), and the tenants update policy grants
 * `authenticated` the `name` column alone -- so a tenant administrator cannot
 * self-assign another tenant's domain, which is what makes this hold.
 *
 * Enforced here, at send time, rather than only where the setting is saved:
 * updateAppSettingAction() takes a free-form key, so any holder of
 * `system_settings:manage` can write this row without going through the panel's
 * validation. The action validates too, for the error message; this is the
 * boundary.
 */
export function isAllowedFromAddress(
  address: string,
  options: { verifiedDomains: string[]; tenantCustomDomain: string | null },
): boolean {
  const domain = emailDomain(address);
  if (!domain) return false;
  if (!options.verifiedDomains.includes(domain)) return false;

  const owned = options.tenantCustomDomain?.trim().toLowerCase();
  if (!owned) return false;
  return domain === owned || domain.endsWith(`.${owned}`);
}

/**
 * `"Tenant Name" <addr@example.org>`, or the bare address when there is no
 * usable name.
 *
 * Control characters are stripped before anything else, and that is the one
 * security-relevant line in this function: a CR or LF reaching a header is
 * header injection. The quoting is unconditional -- a quoted-string is always
 * legal, so quoting everything removes every "does a comma, a dot, a colon
 * need escaping here?" question at the cost of nothing.
 *
 * Non-ASCII passes through as UTF-8 rather than becoming an RFC 2047
 * encoded-word. RFC 5322's qtext is ASCII-only, but RFC 6532 permits UTF-8 and
 * the provider encodes the header for us; an encoded-word branch would have to
 * chunk to respect the 75-character limit per word, for a case that is already
 * handled. Check what Resend does with it before "fixing" this.
 */
export function formatSender(name: string | null, address: string): string {
  const display = displayName(name);
  return display ? `"${display}" <${address}>` : address;
}

function displayName(name: string | null): string {
  if (typeof name !== "string") return "";

  const collapsed = name
    // Control characters, including CR and LF: header injection guard.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!collapsed) return "";

  const truncated =
    collapsed.length > MAX_DISPLAY_NAME
      ? collapsed.slice(0, MAX_DISPLAY_NAME).trimEnd()
      : collapsed;
  return truncated.replace(/([\\"])/g, "\\$1");
}

/**
 * The site a tenant's recipients should be sent to (#860).
 *
 * Every scheduled email used to be built from one NEXT_PUBLIC_SITE_URL, handed
 * to a job that walks several tenants -- so on a database with more than one
 * tenant, a member of the second got a digest whose "open this action item"
 * links pointed at the first tenant's domain. At best a 404; at worst an
 * invitation to sign in somewhere that is not their organization. Invisible
 * until a second tenant is live, which is exactly when nobody is looking.
 *
 * The origin is a property of the tenant a message is for, not of the
 * deployment: `https://<custom_domain>` when the tenant has one, and the
 * platform's own origin when it does not -- the same order provision_tenant()
 * already uses when it mints an invite link, and what keeps local, CI and
 * preview runs working unchanged.
 *
 * The apex, deliberately, rather than `portal.<domain>`, even though the links
 * are all /portal/... paths. custom_domain is a parent-domain match, so the
 * apex is the one host a tenant is guaranteed to have pointed here;
 * src/proxy.ts 308s /portal/... on to the subdomain for hosts listed in
 * PORTAL_REDIRECT_HOSTS, and where it does not, /portal/... simply resolves as
 * a path. Linking to a subdomain nobody has pointed yet would turn a working
 * link into a dead one, and the redirect is cosmetic rather than a gate.
 */
export function resolveTenantOrigin(
  customDomain: string | null,
  fallback: string,
): string {
  const domain = customDomain?.trim().toLowerCase();
  return domain ? `https://${domain}` : fallback;
}

/**
 * The identity one tenant's mail goes out with.
 *
 * From: the tenant's own address when it passes isAllowedFromAddress(),
 * otherwise the platform's. The display name is the tenant's name either way --
 * that is the part that needs no DNS and no operator, and it is what stops a
 * recipient seeing another organization's name on their own reminder.
 *
 * Reply-To: the tenant's configured address, or the platform's, or nothing.
 * Note it carries no domain restriction, unlike From, and the asymmetry is
 * deliberate rather than an oversight: a From address is an identity claim
 * about who sent a message, while a Reply-To is a routing preference, and any
 * real mailbox is a legitimate answer to "where should replies go?".
 *
 * A per-message Reply-To is not resolved here -- deliverEmail() layers it on
 * top, so the contact-message notice can point replies at the person who wrote
 * in.
 */
export function resolveMailIdentity(input: MailIdentityInput): MailIdentity {
  const override = settingAddress(input.fromAddressSetting);
  const allowed =
    override !== null &&
    isAllowedFromAddress(override, {
      verifiedDomains: input.verifiedDomains,
      tenantCustomDomain: input.tenantCustomDomain,
    });

  // "" rather than null when nothing resolves at all: sendEmail() refuses an
  // empty sender, which is the same answer it gave before any of this existed.
  const address = (allowed ? override : bareAddress(input.platformFrom)) ?? "";

  const replyTo =
    settingAddress(input.replyToSetting) ??
    bareAddress(input.platformReplyTo) ??
    undefined;

  return {
    from: address ? formatSender(input.tenantName, address) : "",
    ...(replyTo ? { replyTo } : {}),
  };
}

/** Everything one tenant's mail needs that the database has to answer. */
export type TenantMailContext = {
  identity: MailIdentity;
  origin: string;
  /**
   * The tenant's own name, for a message that has to say who is asking rather
   * than only appear to come from them (#1049). Falls back to the platform's
   * wording when the tenant read failed, for the same reason `origin` does.
   */
  displayName: string;
  /**
   * The logo and the two colours the shared email shell draws with (#1238).
   * Empty for a tenant that has set no branding, which renders the platform's
   * own shell -- the same thing every tenant's mail looked like before this.
   */
  branding: EmailBranding;
};

/**
 * The identity and the origin for one named tenant, off a single read.
 *
 * Runs on the service-role client, which bypasses RLS, so tenant_id is passed
 * explicitly rather than left to current_tenant_id() -- that resolves to null
 * for a sessionless caller. One query for both settings rather than two.
 *
 * Every read failure falls back to the platform identity and logs, rather than
 * failing closed the way isOrgEmailEnabled() does. The kill switch fails closed
 * because mail going out after somebody turned it off is unrecoverable; this is
 * the opposite trade -- refusing to send a night's reminders because a Reply-To
 * was unreadable is worse than sending them from the platform's own address.
 */
export async function tenantMailContext(
  admin: SupabaseClient,
  tenantId: string,
  options: { fallbackOrigin: string },
): Promise<TenantMailContext> {
  const platformFrom = process.env.EMAIL_FROM ?? null;
  const platformReplyTo = process.env.EMAIL_REPLY_TO ?? null;

  const [tenant, settings] = await Promise.all([
    admin
      .from("tenants")
      .select("name, custom_domain")
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("app_settings")
      .select("key, value")
      .eq("tenant_id", tenantId)
      .in("key", [
        REPLY_TO_SETTING_KEY,
        FROM_ADDRESS_SETTING_KEY,
        ...BRAND_MAIL_SETTING_KEYS,
      ]),
  ]);

  if (tenant.error) {
    console.error(
      `[email] could not read tenant ${tenantId} for its sender identity; using the platform's`,
      tenant.error,
    );
  }
  if (settings.error) {
    console.error(
      `[email] could not read the mail settings for tenant ${tenantId}; using the platform's`,
      settings.error,
    );
  }

  const byKey = new Map(
    (settings.data ?? []).map((row) => [row.key as string, row.value]),
  );
  const fromAddressSetting = byKey.get(FROM_ADDRESS_SETTING_KEY);
  const tenantCustomDomain = (tenant.data?.custom_domain as string) ?? null;
  const verifiedDomains = verifiedSendingDomains(platformFrom);

  // A well-formed address the rule refuses is somebody's misconfiguration, not
  // an ordinary unset value, and nothing else would ever say so: the send
  // succeeds, from an address the tenant did not choose, and the ledger records
  // it as sent.
  const override = settingAddress(fromAddressSetting);
  if (
    override &&
    !isAllowedFromAddress(override, { verifiedDomains, tenantCustomDomain })
  ) {
    console.warn(
      `[email] tenant ${tenantId} is configured to send from ${override}, which is not a verified domain it owns; using the platform sender`,
    );
  }

  // A failed tenant read leaves the domain null, so the links fall back to the
  // platform origin rather than to nothing -- the same trade as the identity
  // below, and for the same reason: a digest with a slightly wrong link is
  // recoverable, a digest that was never sent is not.
  const origin = resolveTenantOrigin(
    tenantCustomDomain,
    options.fallbackOrigin,
  );

  return {
    identity: {
      ...resolveMailIdentity({
        tenantName: (tenant.data?.name as string) ?? null,
        tenantCustomDomain,
        fromAddressSetting,
        replyToSetting: byKey.get(REPLY_TO_SETTING_KEY),
        platformFrom,
        platformReplyTo,
        verifiedDomains,
      }),
      origin,
    },
    origin,
    displayName: ((tenant.data?.name as string) ?? "").trim() || "the portal",
    // A failed settings read leaves this empty, which is the unbranded shell
    // rather than no email -- the same trade the identity and the origin make
    // above, and the logo is the least load-bearing thing in the message.
    branding: settings.error
      ? EMPTY_EMAIL_BRANDING
      : emailBrandingFromRows(
          (settings.data ?? []) as { key: string; value: unknown }[],
        ),
  };
}
