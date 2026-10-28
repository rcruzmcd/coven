# Serving more than one organization

**Updated:** 2026-09-11

The operator's runbook for tenants (#707 Phase 4): how an organization is
provisioned, put on its own domain, branded, supported, exported and deleted.
The model behind it -- `tenants`, `tenant_id` on every table, membership
instead of a super-admin -- is §6 of the spec, in
[`docs/spec/multi-tenancy.md`](spec/multi-tenancy.md), and in the planning
repo's `decisions/2026-09-05-multi-tenancy-model.md`.

The platform itself is **Coven**, sold to small nonprofits and small
businesses; a tenant is one customer organization of it.

This is no longer hypothetical. Three tenants are live, and **Chatter Snow is
simply the first of them**, not the product:

| Tenant       | Plan       | Hosts                                                                                                    |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------- |
| Chatter Snow | (customer) | `www.chattersnow.org`, `portal.chattersnow.org`, and `uat.chattersnow.org` for the `development` preview |
| Platform     | `internal` | `coven.rcmlabs.dev` (Coven's marketing site), portal at `coven.rcmlabs.dev/portal`                       |
| Demo         | `demo`     | `demo.rcmlabs.dev`, portal at `demo.rcmlabs.dev/portal`                                                  |

The demo and platform tenants are on `rcmlabs.dev` subdomains rather than
`chattersnow.org` because neither belongs to Chatter Snow -- demoing the
platform on a customer's domain would present that customer's brand as the
product. Host -> tenant resolution is data-driven, so moving them was a
`custom_domain` update (and, for the demo, `DEMO_HOST`), not a code change:
they moved off `rickiecruz.com` subdomains in October 2026, and the old hosts
308 to the new ones. Moving the platform again is the same: the Domain button
on Administration → Platform, then a redirect from the old host.

Most of it can also be done from the portal, at Administration → **Platform**
(#707 Phase 5c) — provisioning, the domain, the status and the export. That
page resolves only inside the platform's own tenant: the RPCs behind it require
`platform_tenants:manage` **and** a full (non-support) membership **and** a
tenant on the `internal` plan, so a customer's admin granting themselves the
resource in their own matrix — which they can, they own their matrix — still
gets nothing. Deletion and support grants are deliberately not there; see
below. The commands stay the fallback, and the only route when the portal
itself is what is broken.

Every command below runs as `service_role` against whichever project the
environment names. `bun run tenant:*` reads `.env.local`, which is the local
stack; for the linked project run the script directly with the right env
file:

```bash
bun --env-file=.env.production.local scripts/tenant-cli.ts list
```

## Provisioning a tenant

```bash
bun run tenant:provision \
  --name "Example Nonprofit" \
  --slug example-nonprofit \
  --domain example.org \
  --admin director@example.org
```

`provision_tenant()` creates the tenant and everything it needs to be signed
into:

- **every role the template tenant holds** -- the oldest tenant on the
  `internal` plan -- with its label and its **whole** permission matrix. Every
  migration that seeds `role_permissions` does so by role name across all
  tenants, so the template's matrix is always the current platform default and
  provisioning never has to be updated when a resource is added. Roles the
  template added itself are copied too (#910): the template tenant is where the
  platform's starter set is curated, so a role an operator adds there is a
  default for new organizations, and one they retire there is one a new tenant
  should not be given. `admin` is the hard requirement -- provisioning refuses
  a template without it. A new tenant can then relabel or retire anything but
  `admin` from Administration > Roles;
- the catalog defaults a fresh database gets from migrations: the inventory
  category vocabulary, the agenda templates (current versions included) and
  the calendar category vocabulary. The content brief templates were copied
  here too until #1230 retired them;
- its **module entitlements**, seeded from `plan_modules` for `--plan` and
  _not_ copied from the template tenant: the template's entitlements are what
  the platform sold that organization. See "Modules" below;
- the platform-default settings (`finance.*`, `content.*`, `org.*`), and
  nothing else from the template's `app_settings` -- not its page visibility
  or branding, nothing from `site_content` (copy or photos), and no articles
  -- a new tenant's Learn section is empty until it writes its own (#894),
  unless a content pack is named (see "Content packs" below), in which case
  that pack's categories and articles arrive as **drafts**;
- a staged `pending_role_grants` row for `--admin`, which
  `claim_pending_role_grants()` turns into the admin role and the membership
  the first time that address signs in.

The command then mints the first admin's invite link and prints it. Nothing
is emailed; send it to them yourself. It lands on `https://<domain>/auth/confirm`
(or `NEXT_PUBLIC_SITE_URL` when there is no domain), so the domain has to be
serving before they click it -- see the next section.

With neither a `--domain` nor a `NEXT_PUBLIC_SITE_URL` there is nowhere to
build a link on, and the command says so and still exits 0 (#805): the tenant
is created either way, and the admin's role is staged inside
`provision_tenant()` as a `pending_role_grants` row. An address that already
has an account never needs the link -- it claims the role on its next portal
navigation. The link matters only for an admin who has never signed in.

`--plan` defaults to `white_label`; `--template <tenant id>` copies from a
different tenant. `tenant:list` shows what exists.

**From the portal:** Administration → Platform → "Provision an organization",
which takes the same name, slug, domain, plan and first-admin email and ends
with the invite link on screen. It does not offer `--template`: choosing a
template is choosing whose permission matrix a customer inherits, and that is
not a dropdown. Use the command when you need one.

A new tenant starts with every module its plan gives it, which today is all of
them for all three plans. Withhold one afterwards from Administration → Platform
→ Modules, or with `tenant:modules`.

### What is not seeded

The public observance calendar, the nonprofit-status milestones and the
volunteer role types describe Chatter Snow, not the platform, so a new tenant
starts without them. Retention policies are still one platform-wide set (see
"Still owed" below).

Module entitlements are seeded, but from `plan_modules` rather than from the
template tenant — for the same reason retention rules always arrive in
`dry_run`: what the template was sold is not what this organization was sold.

**No legal acknowledgement is seeded either, and recording one is the last step
of provisioning** (#1321). A new tenant's `/privacy` is live from the moment it
exists, serving the platform's neutral default, because its forms collect
personal information from the same moment — so the new organization has a
privacy policy under its own name that nobody there has read. Provisioning is
not finished until an administrator opens **Website → Legal documents** and
confirms they have read it; until they do, the panel says nobody has, and the
portal's attention list asks. Nothing is blocked in the meantime: the page must
stay reachable while the forms collect, so an unconfirmed default is a prompt
and never a 404.

## Custom domains

The host is what decides which tenant a public request is for
(`public_tenant_id()`, Phase 3): a request's `Host` is matched against
`tenants.custom_domain`, exactly or as a parent domain, longest match wins.
So `custom_domain = 'example.org'` covers `www.example.org` and
`portal.example.org` too, and one column serves both the site and the portal.
(A request with no meaningful Host can name its tenant instead — see
"Naming the tenant instead of the host" below.)

To put a tenant on its domain:

1. **Set `custom_domain`** -- `--domain` at provisioning, the **Domain**
   button on Administration → Platform, or later in SQL:
   ```sql
   update public.tenants set custom_domain = 'example.org' where slug = 'example-nonprofit';
   ```
   Store it lowercased; the check constraint refuses anything else. (The
   portal lowercases for you, and shows steps 2 and 3 beside the field, since
   neither can be automated from here.)
2. **Add the domains to the Vercel project**: `example.org`, `www.example.org`
   and `portal.example.org` (Project → Settings → Domains, or
   `vercel domains add`). Vercel issues the certificates. The customer points
   DNS at Vercel -- `A`/`ALIAS` for the apex, `CNAME` for the subdomains --
   as the dashboard instructs.
3. **Allow the domain in Supabase Auth**: Authentication → URL Configuration →
   Redirect URLs, add `https://example.org/**` and
   `https://portal.example.org/**`. Invite links and OAuth callbacks redirect
   back to the tenant's own origin (`getRequestOrigin()` in
   `src/lib/request-origin.ts`), and GoTrue refuses an origin it has not
   been told about. The auth/API hostname itself stays the shared Supabase
   one; a Supabase custom domain is Pro-only and not needed.

4. **Add the apex to `NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS`** (Vercel → Settings →
   Environment Variables), a comma-separated list of apex domains:
   `chattersnow.org,example.org`. This is what makes
   `example.org/portal/home` 308 to `portal.example.org/home`. Listing the
   apex alone is enough — `www.example.org` matches without being named, and
   the target is always `portal.<apex>`. Next inlines the value into the
   bundle at build time, so **a change here needs a redeploy**, not a restart.

   Since #1161 this list also decides **the scope of the auth session
   cookie**, so that one account works on both of the tenant's hosts: an
   administrator signed in at `portal.example.org` is already signed in at
   `www.example.org/my`. Listing an apex here therefore says two things about
   it — that `portal.<apex>` resolves, _and_ that the bare, `www.` and
   `portal.` names are one tenant's and may share a session. Those are the
   same fact, which is why one list answers both, but it does mean the entry
   is no longer purely cosmetic.

   Only those three names share the cookie. Any other subdomain —
   `uat.example.org`, a preview — stays host-only, deliberately: a
   `.example.org` cookie written on a staging host would collide with
   production's by name and sign people in and out of the wrong one. A tenant
   that serves its portal on the _same_ host as its public site (the demo
   tenant's `demo.rcmlabs.dev/portal`) needs nothing here at all, and must
   not be listed: it has no second host to reach, and the shared cookie would
   widen to a domain other tenants sit on. The older server-only
   `PORTAL_REDIRECT_HOSTS` still works for the redirect, but only the
   `NEXT_PUBLIC_` name can scope the cookie — the browser writes that cookie
   too, so a value it cannot read is a value the two sides can disagree
   about.

`portal.<anything>` is a portal host: `src/proxy.ts` rewrites bare paths on
it into the `/portal` route group, for every tenant alike.

The apex → `portal.` redirect is the one part that is not automatic, because
it is a promise only the owner of a domain can make: it assumes
`portal.<domain>` resolves, and redirecting into a subdomain nobody has
pointed here would turn a working page into a dead one. Step 4 is where a
tenant says they have made it. Until then — and on every preview and local
run, where the variable is unset — `/portal/...` simply works as a path. The
redirect is cosmetic, never a gate.

This used to be two literals in `src/lib/portal/paths.ts`, `PORTAL_HOST =
"portal.chattersnow.org"` and `PUBLIC_HOSTS = {chattersnow.org,
www.chattersnow.org}`, which made one tenant's DNS the platform's routing
table and sent _every_ public host to that tenant's subdomain (#795 Phase 2).

### Naming the tenant instead of the host (#813 Phase 2)

A request can also say which tenant it is for outright, with an
`x-tenant-slug` header carrying `tenants.slug`:

```
x-tenant-slug: example-nonprofit
```

This exists for a consumer that is not this app on that tenant's domain — an
events embed on a customer's own site, a mobile app, a per-tenant static build
— whose `Host` names its own origin and so resolves to nothing. The slug was
chosen over a per-tenant API key because it already exists, is already unique
and stable, needs no issuance UI, and is what an embed snippet would hardcode
anyway.

Three rules, all in `public_tenant_id()`:

- **The slug wins.** A request carrying both headers gets the slug's tenant.
- **A slug that names nobody resolves to nothing.** It does not fall through to
  the host, and it does not fall through to the sole-active-tenant fallback —
  so a typo in an embed snippet renders an empty site rather than quietly
  serving the template tenant's sample data.
- **Status still decides.** `resolve_tenant_id_from_slug()` requires
  `status = 'active'`, so a suspended or archived tenant is as unreachable by
  slug as it is by domain, and module entitlements (#902) are read for
  whichever tenant the slug resolved to.

A blank header is treated as no header, so a proxy that always sets it cannot
take a site down. What sends it is the versioned HTTP layer at
`/api/v1/t/{tenant}/...`, which stamps the slug from its own path — see
[`docs/public-api.md`](public-api.md). The header is no more trusted than
`x-tenant-host`: it picks which tenant's _public_ surface the caller is
talking to, which is exactly what visiting that tenant's site does. Everything
session-scoped still goes through the membership-checked
`current_tenant_id()`.

## Sending mail as a tenant

Every tenant's mail already goes out under its own name: the From header is
`"<tenants.name>" <EMAIL_FROM>`, composed per message from the tenant the
message is for (#857). There is nothing to configure for that, and it needs no
DNS.

**Links in that mail point at the tenant's own site**, also with nothing to
configure: `https://<custom_domain>` when the tenant has one, and
`NEXT_PUBLIC_SITE_URL` when it does not — the same order `provision_tenant()`
uses when it mints an invite link (#860). They target the **apex**, not
`portal.<domain>`, even though every link is a `/portal/...` path: the apex is
the one host a tenant is guaranteed to have pointed here, and the section above
explains how `/portal/...` gets to the portal from there either way. This
matters more than it looks — the tenant is resolved from the hostname and the
session cookie is bound to it, so a link on the wrong tenant's host does not
just 404, it strands the recipient's session.

**What the mail says is the tenant's too.** The receipts the public forms send
straight back — an event registration, a volunteer application, a gear request
— are written per tenant under Administration → Automatic Replies
(`/portal/administration/automatic-replies`, #1235), and each one can be
switched off there on its own. They are rows in `auto_reply_templates` rather
than `app_settings` keys, gated on `system_settings:manage` like the settings
below, and audited: Administration → Audit Log shows who changed the wording
and what it was before.

The rows are **sparse**, which is what makes this safe to leave alone: a slot a
tenant has never rewritten is absent from `slots`, and absent means "still the
platform's wording", so improving a default reaches every tenant who never
touched it. A tenant with no row at all — which is every tenant on a fresh
`provision_tenant()`, since nothing is seeded — gets byte-identically the email
the platform sent before the table existed. Resetting a field deletes its key
rather than writing today's default in, so a tenant who resets goes back to
tracking the defaults rather than freezing a copy of them.

Branding is deliberately not part of that editor. The logo, the colours and the
footer around the words come from the tenant's `brand.*` tokens through the
shared email shell (`src/lib/notifications/email-shell.ts`, #1238), set under
Organization Settings → Branding: a slot is a sentence, the shell is the paper
it is printed on. The shell is not only the automatic replies' — every
renderer in `src/lib/notifications/` composes into it, so the digest, the ops
report, the staff submission notices, a staff message and the address-change
and claim notices all leave a tenant looking like one sender.

Two more things can be varied per tenant, and they need very different amounts
of work.

**Reply-To is the tenant's own, and self-service.** Administration → System
Settings → Notifications, "Reply-To address". This is the one that matters
most: the application sends through Resend while the mailboxes people actually
read are on Zoho, so a reply to the sending address bounces. Left empty it
falls back to `EMAIL_REPLY_TO`. It carries no domain restriction — a Reply-To
is a routing preference, and any real mailbox is a legitimate answer to it.

**Sending from the tenant's own address takes an operator.** In order:

1. **`custom_domain` must already be set** for the tenant — the section above.
   It is what proves the domain is theirs.
2. **Verify the domain in Resend** (Domains → Add Domain) and have the customer
   publish the DKIM and SPF records it gives you. Mind the ceiling before
   promising this to anyone: **Resend Free allows 3 verified domains, 3,000
   emails a month and 100 a day; Pro at $20/month raises it to 10 domains**
   (checked September 2026 — re-check, it moves). The platform's own domain
   plus the first two customers fit on Free.
3. **Add the domain to `EMAIL_VERIFIED_DOMAINS`** (Vercel → Settings →
   Environment Variables), comma-separated:
   `chattersnow.org,example.org`. Unset, it defaults to the domain of
   `EMAIL_FROM`, which is exactly the behaviour that came before this existed —
   so no tenant override takes effect until an operator opts in here. A Vercel
   environment variable only reaches **new** deployments, so **redeploy**.
4. **The tenant fills the field in** — the same Notifications panel, "Send from
   your own address". Until steps 1-3 are done that field renders read-only,
   showing the platform address and saying who to ask, rather than accepting a
   value that would be ignored.

The rule an address has to pass is both of these at once: its domain is in
`EMAIL_VERIFIED_DOMAINS` **exactly** (a provider verifies a domain, not its
subtree, so `mail.example.org` is its own verification), **and** it is the
tenant's `custom_domain` or a subdomain of it. The second half is not
belt-and-braces. Any tenant administrator can write their own
`notifications.from_address`, so without it, one verified customer domain would
let every other tenant send DKIM-signed mail as that customer.

The rule is enforced where the mail is sent, in `resolveMailIdentity()`
(`src/lib/email/identity.ts`), not only where the setting is saved: the generic
`updateAppSettingAction` takes a free-form key, so the panel's validation is
there to explain a refusal, not to be the control.

A misconfiguration never fails a send. An address that does not pass falls back
to the platform sender and logs a warning naming the tenant; so does an
unreadable settings row. That is the opposite of the `notifications.email_enabled`
kill switch, which fails closed — mail going out after somebody switched it off
is unrecoverable, whereas a night of reminders not sent because a Reply-To could
not be read is simply worse than sending them from the platform's address.

Two limitations, both deliberate:

- A tenant whose mail domain is neither its `custom_domain` nor a subdomain of
  it cannot be configured without a code change. Real, but uncommon enough not
  to be worth a second ownership table yet.
- On the shared platform domain, the display name is the tenant's own `name`,
  and a tenant administrator can rename their tenant. Display-name spoofing is
  therefore possible there; only a per-tenant sending domain fixes it.

Not supported, and not planned: a tenant supplying its own Resend API key. That
is a provider secret in the database, and Supabase Vault to hold it safely is
more machinery than the problem is worth at this size.

## Local development: one tenant

A fresh local database (`bun run db:reset`) has exactly one tenant, and it is
neither the platform tenant nor Chatter Snow:

| Field           | Value                 |
| --------------- | --------------------- |
| name            | **Example Nonprofit** |
| slug            | `example-nonprofit`   |
| plan            | `internal`            |
| status          | `active`              |
| `custom_domain` | none                  |

And nothing else: no platform tenant, no `chatter-snow` tenant, no demo tenant.
`20260905190000_seed_initial_tenant.sql` is the only migration that inserts a
tenant at the top level (the others do so inside `provision_tenant()`), and
`supabase/seed.sql` inserts none -- every sample row it writes lands in this
tenant. It exists because a database with none is unusable: `default
current_tenant_id()` needs something to resolve to.

Its name and slug come from `app.initial_tenant_name` / `app.initial_tenant_slug`
when set, and otherwise fall back to **Example Nonprofit** / `example-nonprofit`
(#795 Phase 3). They used to fall back to Chatter Snow, which made one client the
platform's bootstrap identity. A white-label deployment overrides them before
`supabase db push`:

```sql
alter database postgres set app.initial_tenant_name = 'Riverside Trails';
alter database postgres set app.initial_tenant_slug = 'riverside-trails';
```

The settings cannot be made _required_: `supabase db reset` drops and recreates
the database, so an `alter database ... set` is wiped before migrations run and
there is no hook to set one first.

Chatter Snow's production tenant is untouched — that migration ran there long
ago and migrations do not re-run, so its row still says `chatter-snow`. This is
why every migration that writes Chatter Snow's own copy, palette, sizing guide,
legal documents, learn articles and lexicon (`20260908040000`,
`20260908050000`, `20260908060000`, `20260908070000`, `20260909020000`,
`20260909030000`, `20260912010000`, `20260912030000`, `20260912130000`) is
scoped `where slug = 'chatter-snow'`: on a hosted project they find their
tenant, and on a fresh local or CI database they correctly find nothing.

### Why it is on the `internal` plan

Production has three tenants with one job each: the platform tenant is
`internal` and has no public site, Chatter Snow is `white_label`, and the demo
is `demo`. The local tenant is one row doing all of those jobs at once:

- **The client tenant.** Every seeded event, donation, item and person is its.
- **The platform operator.** `is_platform_operator()` requires being inside a
  tenant on the `internal` plan (`20260906180000`), so
  **Administration → Platform** is reachable locally as `admin@example.test`.
  It is not reachable that way on Chatter Snow's own production portal.
- **The provisioning template.** `provision_tenant()` copies its roles and
  permission matrix from the oldest `internal` tenant when no template is
  named (`20260906110000`), which locally is this one.

Keep that in mind when reading a local Platform screen: what it shows is the
platform's own tenant administering itself, not the shape a client sees.

### Accounts and memberships

All eight `@example.test` accounts in `supabase/seed.sql` hold exactly one
membership, in that tenant. Two paths write it: the
`ensure_membership_for_role` trigger (`20260906030000`) joins an account to a
tenant the moment it is given a role there, which covers the seven accounts
with roles; and `seed.sql` cross-joins every seeded account with the one
tenant, which is what gives `noaccess@example.test` -- no role at all -- its
membership. No `user_tenant_selection` row is needed: `current_tenant_id()`
resolves a sole membership by itself (`20260905180000`).

Those are now the only two paths anywhere. A third used to exist:
`ensure_tenant_membership()` joined any signed-in account holding no membership
to the tenant the request host resolved to, on every portal request. #1191
dropped it. It was written when only a staffer could have an account, and once
a constituent signed in with the same account on both hosts (#1161) it handed a
membership -- and an audit entry, and a row in Administration -> Users -- to any
member of the public who opened `/portal`. **A membership now follows a role or
an explicit grant, and nothing else creates one.** What remains in its place is
`has_tenant_membership()`, which only reads: the portal shell uses it to tell an
account that belongs to nothing (refused at `/portal/login?error=no_access`)
from one whose organization is suspended (the NoTenant page).

### So there is no tenant switching locally

The TenantSwitcher never appears on a fresh local database. With one
membership it renders a plain home link rather than a menu
(`src/app/portal/(app)/tenant-switcher.tsx`): "a menu whose only entry is the
thing you are already looking at is noise." It only becomes a control once an
account holds two memberships, which a reset never produces -- see the next
section for how to get there on purpose.

`supabase/seed.sql` gives local and CI their own copy of the site -- generic
Example Nonprofit text for the slots whose registry defaults are prompts, so
the public site renders as a real site and the e2e specs have stable words to
assert. Slots that are already right for any organization ("Gear library",
"Our Mission", "Get in touch") are left to the registry, and the list slots are
left as prompts on purpose: that is what a newly provisioned tenant sees, and it
is worth seeing.

### Adding a second tenant locally

`bun run tenant:provision` will do it, and it refuses the local stack unless
`--local` is passed (#906), the same way `demo:reset` has since #604: the
refusal names what breaks and the flag, and with `--local` the command warns
and names the way back. The check is `scripts/tenant/local-guard.ts`.

- **What breaks the moment it is active.** Locally there is no custom domain on
  the first tenant, so everything sessionless resolves through the
  sole-active-tenant fallback, and a second _active_ tenant switches that off.
  The blast radius is spelled out under "The rollout order is load-bearing" in
  the demo section below: the public site loses its content and its name, the
  gated sections 404, anonymous intake fails, and `bun run test:integration`
  and `bun run test:e2e` fail until the tenant is gone. The portal is
  unaffected -- `current_tenant_id()` is membership-based and never consults
  the host.
- **How to work with one anyway: pass a host.** The integration suites send
  `x-tenant-host` (`test/integration-setup.ts`). A browser needs a
  `custom_domain` on the tenant and a matching request host, or
  `TENANT_HOST_OVERRIDE` naming it (`src/lib/supabase/server.ts`).
- **How to end up in both tenants.** Provisioning alone gives the seeded admin
  nothing: `provision_tenant()` stages a `pending_role_grants` row for
  `--admin`, and `claim_pending_role_grants()` turns it into a role and a
  membership on that address's next portal navigation
  (`src/lib/portal/tenants.ts`). Provision with `--admin admin@example.test`
  and, after one page load, the seeded admin is a member of both -- at which
  point the TenantSwitcher becomes a real menu.
- **The way back, in this order.** `bun run tenant:archive <slug>` and then
  `bun run tenant:delete <slug> --confirm <slug>`; `delete_tenant()` refuses
  anything that is not archived, which is why archive comes first. The public
  site and both suites recover as soon as the second tenant is archived.
- **The demo equivalent** is `bun run demo:reset --local` and
  `bun run demo:teardown`, which carry the same guard.
- **A worked example** is `e2e/unresolved-host.spec.ts`, which provisions a
  second active tenant through the RPC to exercise the host-resolution 404 and
  archives and deletes it again when it is done.

`bun run tenant:plan` refuses to move the last active `internal` tenant off
`internal` (`scripts/tenant/plan-guards.ts`), so `example-nonprofit` cannot be
re-planned locally while it is the only one.

## Branding and content

Both are the tenant admin's, not the operator's:

- **Administration → Organization Settings → Branding**: the colour tokens, the
  accent gradient, the logo and the typography set, stored as `brand.*` rows in
  `app_settings` and applied as a `<style>` over `globals.css`
  (`src/lib/branding.ts`). Blank means the platform default.

  Typography (#1260) is the one brand token that is not a value an admin
  types: `next/font/google` resolves at build time, so the families the
  platform can offer are the ones declared in `src/app/layout.tsx`, and what a
  tenant stores under `brand.typography` is a key into the five curated sets in
  `src/lib/branding.ts` -- `neutral` (Inter, the platform's own), `rounded`
  (Quicksand with a Rock Salt accent), `editorial` (Source Serif 4 over Inter),
  `statement` (Fraunces over Nunito Sans) and `friendly` (Figtree). A set
  carries three families and its display letter-spacing, because `-0.04em` is
  tuned for Quicksand and is wrong on a serif. An unknown key resolves to the
  default rather than reaching the `<style>` block. Chatter Snow's `rounded`
  row is seeded by `20260918020000_brand_typography.sql`, which is why nothing
  on its site changed when this shipped. It is picked (#1261) from a list of
  specimens rather than a dropdown of names, each option drawn in the families
  it would apply, because "Editorial" set in everybody else's typeface says
  nothing about the only thing being chosen; "Platform default" is the first
  option and stores a blank value, so it follows the platform's default rather
  than pinning today's. That page is the one screen that renders all eight
  families at once, and it is a signed-in portal page, so the `preload: false`
  discipline stays as it is. The public `/brand` guide documents whatever the
  tenant has picked (#1262): §02 reads the set through `resolvedTypography()`
  and names each family, its licence and its Google Fonts page, so a volunteer
  making a flyer can install the same faces. Email is deliberately out of scope:
  web fonts do not load in most mail clients, so a branded email carries the
  tenant's colours and its logo and not its typeface.

  **Branding reaches email** (#1238). `tenantMailContext()` brings
  `brand.primary`, `brand.primary_deep` and `brand.logo_url` back in the same
  read as the sender identity, and `renderEmailShell()` puts the logo at the
  top of every outbound message and the tenant's accent on its links. Three
  consequences worth knowing before changing a token:

  - **The logo URL has to be fetchable with no session.** A Drive link that
    renders in a browser because you are signed in to Drive is a broken image
    in an inbox. A `brand.logo_url` stored as a path this site serves is
    resolved against the tenant's own origin, so those work.
  - **A brand colour that fails a contrast floor is not used.** Link text needs
    4.5:1 against the shell's white background and the wordmark 3:1; a colour
    that fails falls to the tenant's deep colour and then to the platform's
    purple, rather than rendering something nobody can read.
  - **Nothing exists only inside the logo.** Most clients block remote images,
    so a tenant with no logo gets its name as a text wordmark, a blocked logo
    falls back to that name as alt text, and the footer names the organization
    either way. The plain-text part carries no logo and never will.

- **Administration → Organization Settings → General**: the words this
  organization uses for what it lends (#896). The platform says "Inventory"
  and "Items"; an organization that runs a gear library, a tool library or a
  pantry says so here, and the public navigation, the portal sidebar, the
  page-visibility panel, the contact form's topic and every unwritten line of
  site copy follow. Four terms, registered in `src/lib/lexicon.ts` and stored
  one `app_settings` row each under `lexicon.*` (read through `public_lexicon`
  by host and `tenant_lexicon` by session); a blank field means the platform's
  own word. Chatter Snow's four rows are seeded by
  `20260912030000_per_tenant_lexicon.sql`, which is why nothing on its site
  changed when this shipped. The registry is meant to stay at four or five
  terms -- it names what an organization lends, not its whole vocabulary.

- **Administration → Site Content**: every organization-specific line of copy
  on the public site, page by page, stored in `site_content`. The registry of
  slots and Chatter Snow's copy as each default is `src/lib/site-content.ts`;
  a new tenant renders that until it rewrites a slot. The four legal pages
  are published whole as structured documents under `legal.*` -- a tenant
  either publishes its own or the platform's renders. Since #858 the
  platform's is genuinely neutral (`src/lib/legal-defaults.ts`): it describes
  what this application does for a nonprofit, names the organization and its
  `org.email_*` addresses, and leaves out everything only that organization
  can answer -- so it is a starting point for their own counsel rather than
  legal advice, which the editor says beside the slot. Read that text with
  `bun run docs:legal`; [legal-basis.md](legal-basis.md) has the rules it is
  written under and the record of who approved it. Chatter Snow's own
  three documents are its tenant's rows
  (`20260909020000_chatter_snow_owns_its_legal_documents.sql`); the
  accessibility statement (#1368) is the one it has no row for, so it renders
  the platform's once put in force. Whether each document is served is a
  separate per-tenant decision, in **Administration →
  Website → Legal documents** (#859): the terms, the code of conduct and the
  accessibility statement 404 and stay out of the footer until that
  organization puts them in force, and the privacy policy is always served
  because the public forms are always collecting. The accessibility statement
  is the closest that call has been — the reader who most needs a route for
  reporting a barrier is the least able to hunt for one — and it goes the same
  way, because a conformance claim published under an organization's name
  covers that organization's own alt text, uploads, linked documents and
  venues, none of which is the platform's to assert. It is one `app_settings` row per document
  (`legal_publication.<key>`, read through `public_legal_publication`), and no
  row is seeded — a newly provisioned tenant serves its privacy policy and
  nothing else. **The terms of use are a prerequisite for the
  `constituent_accounts` module** (#1295): the Platform page refuses to turn
  the signed-in area on for an organization that has not put them in force,
  and once it is on that organization cannot take them back out until the
  module goes off. #859 decided adoption for a public site that was a set of
  one-shot forms; accounts are a standing relationship the organization can
  suspend, and the terms are the only thing that governs one. The dependency
  is declared in `src/lib/legal-documents.ts` (`LegalDocument.gates`) and
  enforced in the two Server Actions the two switches call, so seeding, the
  demo reset and the e2e fixtures — all of which write these rows as
  `service_role` — are free to set whatever state they need. **The participant
  waiver is the fourth legal document and the one with no platform text**
  (#686): a release of legal rights cannot be written for an organization that
  has not written it, so `legal.waiver` has no entry in `PLATFORM_LEGAL_PROSE`
  and its default is absence — `/waiver` 404s, the footer omits it and the
  registration form asks about no agreement until that tenant publishes its
  own. The registry records this as `hasPlatformDefault: false`, and the
  adoption gate runs both ways: the Legal documents switch refuses to put it in
  force while nothing is published (and is disabled, with the reason beside
  it), and `publish_site_content()` refuses a publish that would empty a waiver
  already in force. Where one _is_ adopted, both registration paths show it in
  full, take an unticked box, and record
  `event_registrations.waiver_accepted_at` and `waiver_version` — a pointer
  into `legal_document_versions`, readable by anybody at
  `/waiver?version=N`. **Anything that writes `legal.waiver` text directly must
  write a version row with it**: versions come only from
  `publish_site_content()`, and text with no version leaves the waiver in force
  with nothing to cite, which refuses every registration. **Publishing a
  `legal.*` slot records what the site was collecting at that moment** (#1292):
  one `app_settings` row per document, `legal_surface.<key>`, holding the
  sorted keys of `collectionSurface()` (`src/lib/legal-surface.ts`) — the same
  definition that writes the platform's own document. It is written by
  `publish_site_content` inside the publish transaction rather than by the
  Server Action afterwards, so a publish cannot succeed while the fingerprint
  silently does not, and it is deliberately private: no view serves
  `legal_surface.%` to `anon`. Its purpose is drift. An organization's own
  privacy policy is the one document the platform may not rewrite, so when a
  module is switched on or off afterwards the Legal documents panel says which
  one moved and what the text now describes wrongly, and an `attention`-level
  item appears in the portal's attention list for anyone holding
  `site_content:manage`. Nothing is blocked and nothing is re-inserted into the
  document. There is no backfill: a document published before this existed
  reads as _unknown_ and asks to be re-published, rather than being reported as
  describing nothing. **The mirror-image question is whether anybody here ever
  read the platform's text** (#1321), which #1292 cannot answer for the reason
  it gives: the platform's document regenerates on every request and so cannot
  drift. A tenant serving it has published nothing for #600 to gate and has no
  version row from #601, so one `app_settings` row per document,
  `legal_acknowledged.<key>`, is the only record — who confirmed it, when, and
  the `PLATFORM_LEGAL_LAST_UPDATED` value the text carried when they read it.
  Private, like `legal_surface.%` and for the same reason: no view serves it to
  `anon`. That stored version is what makes the record go stale by itself, so
  bumping the constant and editing the prose — or enabling a module, which
  moves the text through `collectionSurface()` — tells every default-serving
  organization that the document moved rather than changing it under them
  silently. The same panel line and the same `legal_documents_drift` attention
  item carry it, because the administrator's job is the same either way: open
  the document and read it. A document is answered by exactly one of the two —
  its own text can drift, the platform's can go unread — so the two never
  double-count and never leave one unaccounted for. Chatter Snow is unaffected,
  since #858 it publishes its own three. **An organization may ask for a
  second pair of eyes before any of the three publishes** (#600): one
  `app_settings` row, `legal_approval.required`, off until that tenant switches
  it on in the same panel. With it on, a `legal.*` slot can only be published
  by somebody other than the person whose draft it is, and that person is asked
  what approved the text and what they made of it; both land on the
  `site_content` row, which `audit_log` snapshots on the same publish, so the
  approval sits beside the exact words it approved rather than on the version
  row (#601). It is enforced in `publish_site_content` rather than
  in the Server Action, since that function is the only write path onto the
  public site. It is deliberately **not** a platform-wide rule: a
  single-administrator tenant is an expected, supported state — the portal
  ships `access_management_single_administrator` for it — and a hard four-eyes
  gate would leave such an organization unable to publish its own privacy
  policy at all, pinned to the platform's default with no way out short of
  buying another seat. For the same reason a tenant with fewer than two holders
  of `site_content:manage` is refused when it tries to switch the gate on, and
  switching it back off is never refused. **Every publish of a `legal.*` slot
  is also a version** (#601): one append-only `legal_document_versions` row per
  tenant, per document, holding the published `value` as served, the instant it
  took effect, the organization's zone at that moment, and the #1292 collection
  surface it was published against. Written by `publish_site_content` inside
  the same transaction and by nothing else — the table has no insert grant, no
  update policy and no delete policy, so a correction is a new version rather
  than a rewrite of an old one. The public site reads it through
  `public_legal_document_versions` (definer, `public_tenant_id()`, `document`,
  `version`, `content`, `effective_at` and `time_zone` — the surface is
  deliberately not exposed), which is what lets `/privacy?version=2` answer
  "which version was in force when I registered" to a person rather than to a
  developer reading `audit_log`. The live document says which version it is and
  lists the rest; a superseded one says so and links the one in force; and a
  tenant serving the platform's default has no version of its own and is told
  that, keyed to `PLATFORM_LEGAL_LAST_UPDATED`. Adoption still decides the
  route: a permalink is the same route as the live document, so `/terms` and
  `/code-of-conduct` 404 at every version for a tenant that never put them in
  force. Documents already published when the table shipped were backfilled as
  version 1 from `site_content.published_at` and `published_by`. The site's
  photos are
  slots here too (`site_images.*`, a Google Drive link each, blank for the
  placeholder icon), edited beside the copy they sit next to and published
  the same way; a new tenant starts with placeholders everywhere.

- **Website → Giveaway rules**: the answers a promotion's official rules are
  built from, given once per organization (#1322). Beside Legal documents
  because it is the same kind of decision and carries the same disclaimer: the
  platform owns a neutral template (`src/lib/giveaway-rules.ts` for the twelve
  sections, `src/lib/giveaway-rules-template.ts` for the prose, held to the
  same rules as `legal-defaults.ts`), and the organization owns everything only
  it can answer — sponsor name and address, who may and may not enter, where
  the promotion is open, how somebody enters without donating or buying, what
  is published about a winner, publicity, and who to ask about the rules. One
  `app_settings` row per question, `giveaway_rules.<key>`, private: no view
  serves them to `anon`, and `provision_tenant()` does not copy them (it takes
  `finance.%`, `content.%` and `org.%` only), so a new tenant starts with every
  question unanswered. **Nothing here is published by itself.** What the public
  site serves is a frozen document belonging to one promotion: the per-giveaway
  half lives in that event's Giveaway tab, where the entry period, prizes, odds
  and drawing date are derived from the giveaway's own rows, any section can be
  rewritten for that promotion alone, and publishing writes a
  `giveaway_rules_versions` row holding the text and the numbers together. A
  promotion whose rules nobody has published has no public page and
  `/giveaways/<id>/rules` 404s — the same stance #859 takes on a legal document
  nobody adopted, one promotion at a time. Publishing is refused while a
  section is still unanswered rather than publishing a gap, editing afterwards
  creates a new version with its own effective date, and earlier versions stay
  readable. None of it is clearance to run a promotion; see
  [spec/giveaways.md](spec/giveaways.md#58-giveaways).

- **Website → Site Content → Organization → Security reporting**: who a
  security researcher should write to, published at
  `/.well-known/security.txt` (#975). Two slots — an address (or an
  `https://` link to a reporting form) and an optional note about who answers
  and how long it takes — and unlike every other slot the default is blank on
  purpose: **a tenant that has nominated nobody serves no file at all**. An
  organization with nowhere to send a report should not publish a document
  saying where to send one, and a 404 at a well-known path reads as "not
  offered" rather than as a broken promise. The file itself is rendered per
  host (`src/app/.well-known/security.txt/route.ts`), so `Canonical` is the
  domain it was fetched from — RFC 9116 treats a mismatch as invalid, which is
  what the static file this replaced was on every host but Chatter Snow's. The
  organization's own prose sits above two paragraphs the platform adds, which
  describe the portal's data and ask a reporter not to rummage in it; those are
  true whoever the tenant is. `Policy` points at that tenant's terms, and only
  once it has put them in force. Chatter Snow's address and note are its own
  rows (`20260912130000_chatter_snow_owns_its_security_contact.sql`).

- **Administration → Site Content → Articles**: the guides in the Learn
  section, which are a _collection_ rather than slots -- an organization
  creates as many categories and articles as it wants, and the platform ships
  none (#894). A category is a page at `/learn/<address>`; an article is a
  heading, an introduction, a list of points, body paragraphs, further-reading
  links and a disclaimer, and nothing more -- this is not a rich text editor.
  Saving keeps a draft and publishing moves the whole category at once, so a
  reader never sees half a reordered page; removing an article is itself a
  publish, for the same reason. Chatter Snow's eight snow-sports categories
  are its own rows
  (`20260912010000_chatter_snow_owns_its_learn_articles.sql`), not a platform
  default any other tenant inherits.

- **Administration → Site Content → Articles → Content packs** (platform
  tenant only): a **pack** is a named set of the platform tenant's own article
  categories, offered to the other organizations (#895). It is a label on the
  platform's articles rather than a second content system: the platform writes
  articles exactly as any tenant does, and the pack is the subset it is willing
  to hand over. A pack is invisible until it is switched to _Offered_, and only
  its **published** categories and articles are ever copied.

  Other tenants see the offered packs on their own Articles screen and adopt
  one with a button; provisioning offers the same packs (`--pack` on
  `bun run tenant:provision`, checkboxes on the Platform screen).

  **Adoption is a copy.** The adopting organization gets its own rows, as
  drafts, and owns them from that moment — nobody's published page is rewritten
  by a platform edit, which is the same reason #858 made the platform's legal
  document a _default_ rather than the tenant's document. The price is accepted
  rather than designed around: **a pack improved after adoption does not reach
  anyone who already took it.** There is no versioning, no diff and no upstream
  update, and `content_pack_adoptions` records what was copied with the pack's
  key and name as plain text precisely because there is nothing left to link
  to.

  Adoption refuses rather than renaming when a category's address is already in
  use — an address is identity, and it also stops a second adoption silently
  duplicating a pack. Rename or remove the colliding page and adopt again.

  No pack ships with the platform. Chatter Snow's snow-sports writing is
  Organization Material under `decisions/2026-09-05-portal-ip-ownership.md`, so
  it stays Chatter Snow's rows and is not the first pack.

The `site_content` resource is separate from `administration`, so writing
for the site -- articles included -- can be granted to a role without handing
it the rest. Authoring a pack is `platform_tenants:manage`, which resolves only
inside the platform tenant; adopting one is `site_content:manage`, the
permission that already decides who may put words on the public site.

## Support access

Platform staff have no standing access anywhere. To work inside a tenant
they hold a `support` membership: time-boxed (at most 90 days), carrying a
reason, and -- this is the Phase 4 decision -- **granted by the tenant's own
admin** from Administration → Users → Support access. The tenant sees who is
in and until when, and can end it early. A support account cannot grant,
extend or end support access, for itself or anyone; the RPCs refuse a caller
whose own membership is a support grant, and the table policies still refuse
any direct write to a support row.

Before it can be granted, the staff member's account has to exist: they sign
in once (they land on the "no organization" screen), and the tenant admin
enters that email.

Once it is granted, **work the grant on the tenant's own portal host**. Since
#956 a portal session is scoped to the organization that owns the host it is
served from, so a support grant in `example-nonprofit` is exercised at
`portal.example.org`, not from `coven.rcmlabs.dev/portal`. Session cookies are
host-only, so this was already a separate sign-in in practice; what changed is
that the platform host no longer offers a switcher into the tenant. A tenant
with no `custom_domain` yet has no host of its own, which leaves its portal
unpinned and reachable the way it always was.

The operator can _see_ whether a tenant currently has support open, on
Administration → Platform — read-only, and deliberately so: who is in and
until when is the operator's business, letting themselves in is not.

The fallback, for an organization that has locked itself out, is the
service-role script -- with their agreement, and for as short a time as the
work needs:

```bash
bun run tenant:support example-nonprofit --email staff@platform.org \
  --reason "Ticket #123: restore admin access" --days 2 --role admin
```

It writes the same membership row the UI would, so it shows on the tenant's
Support access list and in their audit log, and the isolation suite covers
it like any other membership.

## One host, one tenant

A portal session is scoped to the organization that owns the host it was
served from (#956). On `portal.example.org`, an account that belongs to
Example Nonprofit gets Example Nonprofit — and an account that does not gets a
"wrong organization" screen naming both, a link to the portal of one it _is_
in, and a sign-out button. Nothing below the shell renders.

Until #956 the portal ignored the host entirely. Nothing leaked —
`current_tenant_id()` is membership-based, so every account only ever saw its
own organization — but signing in on the public demo's domain with a paying
tenant's credentials served that tenant's operations portal, which is not a
thing any of the three hosts should be able to do.

Three consequences worth knowing:

- **The tenant switcher disappears on a host that owns a tenant.** It only
  appears where the host settles nothing — a local run, a preview, or a tenant
  with no `custom_domain` yet. Elsewhere the address bar is the switcher.
- **The rule is inert on a host no tenant claims.** That is deliberate and it
  is what keeps local development, CI and a freshly provisioned tenant working:
  a tenant whose DNS is not set up yet is reachable from whatever host its
  invite was sent from, exactly as before.
- **The database was not changed.** `current_tenant_id()` still answers from
  membership plus the user's selection, and the pin is applied by writing that
  selection. Teaching the function to read the request host instead would have
  split the session in two: `storage.objects`' policies call the same function,
  but storage-api never receives `x-tenant-host`, so a gear photo would be
  minted in one tenant and refused in another.

## Users that belong to several tenants

An account is platform-wide; a membership is per tenant. Deactivation
(`deactivated_users`) is therefore platform-wide too, so the users screen
only offers it for an account whose _only_ membership is the current
tenant. An account that also belongs elsewhere shows "Remove" instead, which
drops its roles and membership here and touches nothing else
(`remove_tenant_member()`). The database enforces the same split: the
`deactivated_users` write policies check `user_is_only_in_current_tenant()`.

## Export

A tenant's admin downloads everything from Administration → Organization Settings
→ Data (`export_current_tenant_data()`); the operator can do it for any
tenant:

```bash
bun run tenant:export example-nonprofit --out example.json
```

**From the portal:** Administration → Platform → **Export**, on any tenant's
row.

One JSON document: the tenant row, its memberships with account emails, its
audit trail, and every row of every table that carries `tenant_id`, keyed by
table name. The table list comes from the catalog, so a table added later is
in the export without anyone remembering. It contains personal data; handle
it accordingly.

## Deletion

Two steps, on purpose:

```bash
bun run tenant:archive example-nonprofit
bun run tenant:delete example-nonprofit --confirm example-nonprofit
```

The **status** dropdown on Administration → Platform does the archiving half
(and suspend, and reactivate) — but not the deletion, which is why this is
still two commands. It refuses to suspend or archive the `internal` tenant:
platform access is a membership there rather than a bypass, so taking
it off the air takes that page down with it, and there is no second door. The
CLI can still do it.

Archiving takes the tenant off its hosts and out of every member's switcher
immediately and is reversible (`status = 'active'` again). Deletion is not:
`delete_tenant()` refuses any tenant that is not archived, then deletes
every row of every tenant table by `tenant_id` -- retrying tables whose rows
are still referenced until their children are gone, since every foreign key
between tenant tables is composite -- then the audit rows, then the tenant.
Memberships cascade. Accounts are not touched: `auth.users` is platform-wide
and the person may belong to another tenant; remove orphaned accounts from
the Supabase dashboard if they should go too.

Take an export first. The platform's own tenant is deleted the same way;
there is no special case.

## Changing a tenant's plan

`tenants.plan` is written nowhere but the insert inside `provision_tenant()`.
There is no RPC for it and the Platform page deliberately does not offer it, so
this command is the only way:

```bash
bun run tenant:plan example-nonprofit --plan white_label
```

The plan decides three things and nothing else: `internal` is what
`is_platform_operator()` requires of the caller's own tenant, the oldest
`internal` tenant is what `provision_tenant()` templates from, and the plan's
row in `plan_modules` is what a tenant's module entitlements are seeded from at
provisioning (see the next section). `demo` is what `current_tenant_is_demo()`
reads and what `seed_demo_tenant()` insists on.

Changing a plan does **not** re-seed modules. A tenant's `tenant_modules` rows
are what it was sold; the plan only decides what it starts with.

It refuses to move the **last active `internal` tenant** off that plan.
Platform administration resolves only inside one, and it is a membership rather
than a bypass, so there would be no way back in and no super-admin to open one
— the same reasoning behind `platform_set_tenant_status()` refusing to archive
the internal tenant. Provision the replacement first, then move the old one.
The guards are in `scripts/tenant/plan-guards.ts` and unit tested; the database
has no opinion here, so they are the only check there is.

## Modules: what a tenant has been sold

A **module** is a named group of resources — Events, Finance, Inventory,
Governance and so on — that a tenant is either entitled to or not. They are the
answer to "this nonprofit runs no gear library, why are we showing them
Inventory", and to "we sold them the volunteer half and not the money half".

The flags are **the platform's, not the customer's**. A tenant admin owns their
own permission matrix, so anything they can write is not a gate: `tenant_modules`
has a select policy for its own tenant and **no insert, update or delete policy
for anyone**. Every write goes through an operator RPC or the CLI.

A module that is off is enforced in the database, not in the navigation. All
three of the functions the portal resolves access through subtract it —
`has_permission()` (every RLS predicate and every definer RPC),
`my_permissions()` (the sidebar, the command palette, `requirePermission()` in
every route layout, the dashboard) and `people_with_permission()` (the
sessionless recipient resolver behind inbound submission mail). A customer whose
Volunteers module is off does not get volunteer-application email either.

**Off is hidden and frozen, never deleted.** The rows stay, the tenant's export
still contains them, `delete_tenant()` still removes them, and turning the module
back on restores the section with its history intact. Nothing about a module
deletes tenant data.

### The public site (#902)

Those three functions are all about a signed-in person in a tenant, and the
public site has neither a session nor a permission — so gating them alone left a
tenant with Inventory off still publishing a gear library at `/inventory`, with a
working request form. The public surface has its own choke point and modules sit
above it:

- **`PUBLIC_PAGE_SLOTS`** (`src/lib/page-visibility.ts`) gains a `module` per
  slot. A slot whose module is off is forced hidden whatever the board stored:
  the section drops out of the nav and footer and its URLs 404. The override is
  one-way — a module being _on_ never publishes a section the board has hidden,
  and turning a module back on returns the decision to them rather than making
  it for them.
- **`public_tenant_modules`** is the anon-readable view it reads, answering for
  the tenant the request _host_ resolves to (`public_tenant_id()`), since
  `tenant_module_enabled()` answers only for a membership a visitor does not
  have.
- **Every RPC `anon` can call** checks the module on the tenant it resolved.
  Hiding a page does not stop a form post, and this is the half that makes it a
  gate rather than a hidden link. Each raises the code it already used for
  "there is nothing here for you", so the visitor sees a true sentence and the
  forms' existing error handling is unchanged.

Slot-to-module mapping, with the two that are judgement calls:

| Slot                      | Module           |
| ------------------------- | ---------------- |
| `events`                  | `events`         |
| `gears`, `gears-sizing`   | `inventory`      |
| `programs`                | `programs`       |
| `support`                 | `finance`        |
| `get-involved-volunteer`  | `volunteers`     |
| `contact`                 | `communications` |
| `about`, `learn`, `brand` | none             |
| `get-involved`            | none             |

**`support` goes with Finance** because it is the fundraising ask and the
donations and sponsorships it collects are Finance's records.

**`get-involved` is deliberately not mapped to `volunteers`**, though #902
proposed it. The section is Attend, Volunteer and Become a Partner, and only the
middle one is about volunteers — Attend is about events and the partner page is
a pitch that funnels to `/contact?topic=partnership`. So the volunteer pages got
a slot of their own (`get-involved-volunteer`, gated at
`get-involved/volunteer/layout.tsx`, covering the status lookup beneath it) and
the section stays the board's.

About, Learn and Brand have no module at all: they are the organization's own
pages whatever it is paying for.

In Website → Page visibility, a slot whose module is
off renders read-only and off, saying the section is not part of this
organization's plan. Site Content marks the same pages unpublishable, from the
same read.

### The catalog

| Module              | Resources                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `events`            | `events`, `event_impact`, `event_incidents`, `event_volunteer_hours`                                          |
| `artwork`           | `artwork_submissions`                                                                                         |
| `publications`      | `publications`                                                                                                |
| `calendar`          | `content_calendar`                                                                                            |
| `programs`          | `programs`, `programs_reports`                                                                                |
| `inventory`         | `inventory`, `inventory_reports`, `inventory_intake`                                                          |
| `volunteers`        | `volunteers`, `volunteer_hours_logging`                                                                       |
| `communications`    | `communications`                                                                                              |
| `finance`           | `finance`, `finance_approvals`, `finance_reports`, `finance_self_approval`, `event_expenses`, `event_revenue` |
| `reimbursements`    | `reimbursements`, `reimbursement_approvals`, `reimbursement_self_approval`                                    |
| `people`            | `people`, `people_intake` — **core**                                                                          |
| `governance`        | `governance`                                                                                                  |
| `access_management` | `access_management_assets`, `access_management_reviews`                                                       |
| `administration`    | `administration`, `system_settings`, `site_content`, `platform_tenants` — **core**                            |

Two of those placements are decisions rather than tidying:

- **`event_expenses` and `event_revenue` are Finance, not Events**, though
  `resources.section` says Events. They are the money tabs on an event, and a
  tenant that is not buying Finance should not see money on an event detail
  page. So turning Finance off takes two tabs off Events, on purpose.
- **`platform_tenants` is in the core `administration` module**, so no
  configuration can gate the operator out of the page that un-gates things.

**Core** modules (`people`, `administration`) cannot be turned off for anyone.
The RPC refuses it, the CLI guard refuses it, and a trigger on `tenant_modules`
refuses it underneath both — the CLI writes as `service_role`, which bypasses
row-level security but not triggers.

### The surfaces that don't read `my_permissions()` (#903)

Almost the whole portal follows module gating for free, because it all resolves
through the three functions above: the sidebar, the command palette, the quick
actions, breadcrumbs, the section-index redirects, the 48 route layouts that
call `requirePermission()`, the notification-preference kinds, and the dashboard,
which derives every widget and every attention item from the permission map.
Four surfaces read something else, and each needed its own gate.

- **Administration → Permissions** selected straight `from("resources")`, the
  platform's global catalog, so the matrix offered a column for every resource
  the product has. An admin could set `finance: manage` on a role and watch it
  do nothing — the grant is genuinely written, and `my_permissions()` correctly
  reports `none` — which reads as a bug in the permissions screen. The matrix is
  now **filtered** to the tenant's enabled modules. That is the opposite call
  from `20260908010000`, which left the inert `platform_tenants` grant visible as
  a row someone set, and the two differ on purpose: that grant is inert per
  _user_, so hiding it would hide a real assignment from the operator reading
  the same screen, while a disabled module is off for the whole organization.
  Nothing is deleted — existing grants on a hidden resource stay in
  `role_permissions`, so re-enabling a module brings the section back with its
  matrix intact.
- **The weekly ops report** reads its counts straight off the tables as
  `service_role` (the portal's `count_pending_*` RPCs answer for `auth.uid()`,
  and a cron job has no session), so a tenant with Finance off was still being
  told how many expense approvals were waiting. Each count is now gated on its
  module, and a gated count is never read rather than read and discarded. The
  recipients were already gated, through `people_with_permission()`. A tenant
  with nothing left to report gets no email at all, which is the behaviour a
  quiet day already had.
- **The welcome tour** opened by naming seven sections. Every section, quick
  action and attention item it names is now taken from the reader's permission
  map, so the tour cannot advertise a section the tenant was not sold.
- **The event detail page** rendered all seventeen cards regardless. Its
  Expenses, Revenue, Donations and Distributions cards read Finance and
  Inventory tables — `event_expenses` and `event_revenue` belong to the
  **Finance** module, not Events — so a tenant without Finance was offered an
  Expenses card and an "Add expense" button that could not save. Those four
  cards now carry the gate their server actions already enforced, and the phase
  strip is built per reader.

Walking the portal with Finance, Inventory and Volunteers off turned up three
more, all of the same shape and all fixed here.

- **Volunteers → Directory** links into `/portal/people/volunteers`, and
  `people` is a core module, so the link itself was never a dead end — but it
  was the only sub-item left in the Volunteers section, which therefore kept a
  Volunteers heading in the sidebar for a tenant that was never sold the module.
  `NavSubItem.alsoRequires` now says a cross-link needs its own section as well
  as its route's guard.
- **Finance → Reimbursements** was a link the sidebar rendered and
  `finance/layout.tsx` refused: Reimbursements is its own module living under
  the `/portal/finance` prefix, and that layout admitted only the two Finance
  resources. The same mismatch held for Expenses shown to an approver, and for
  Administration's Access Management and Platform links under
  `administration/layout.tsx`. Each of those parent layouts is now the union of
  what its children admit; every child still re-checks on its own, so nothing is
  given away.
- **The People directory's empty states** advised a second route in — "or
  approve an application from Volunteers › Applications", "or record a donation
  from Inventory › Donations". Those clauses are now `crossSectionHint` and are
  appended only for a reader who can reach the section they name. The sentence
  before them stands alone, and the segment's own New button is directly above
  it.

`src/lib/portal/nav-guards.test.ts` is the invariant that stops the second of
those coming back: it reads every route layout on disk and asserts that every
way of _seeing_ a sidebar link is a way of _opening_ it.

The finance pages name an event on each row but do not link to it, so Events
being off leaves no dead link behind.

The nightly retention sweep is the fourth sessionless surface and is a
deliberate exception — see "A disabled module's retention clocks keep running"
under Data retention.

### Where a value comes from

Resolution order, in `module_enabled_for_tenant()`: the tenant's own
`tenant_modules` row, else its plan's row in `plan_modules`, else
`modules.default_enabled`, else on.

It **fails open** — the opposite of page visibility, and deliberately. A missing
`page_visibility` row means "nobody has approved publishing this yet", so the
safe answer is dark. A missing module row means "this tenant predates the
table", and blacking out an existing organization's Finance section because a
seed missed it is the worse failure.

Both the portal and the CLI show which of the three answered, because "on
because we said so for this organization" and "on because nobody has said
otherwise" call for different actions.

### Setting them

**From the portal:** Administration → Platform → **Modules** on the
organization's row. Switches, with core modules shown but disabled, and a line
under each saying where its current value comes from. Turning one off asks for a
confirmation and says what will happen; turning one on does not. Nobody is
notified — tell the customer yourself.

**From the command line**, which is the fallback for when the portal is what is
broken:

```bash
bun run tenant:modules example-nonprofit
bun run tenant:modules example-nonprofit --disable finance
bun run tenant:modules example-nonprofit --enable finance
```

With no flag it lists; with one it sets and then lists. It writes as
`service_role` and so goes around the RPC's gate entirely, which is why the
refusals live in `scripts/tenant/module-guards.ts` and are unit tested: an
unknown module key, a core module, and turning anything off on the `internal`
tenant — that last one being the operator dismantling their own controls, with
no super-admin to put them back.

Every write is audited. `tenant_modules` is registered in `audited_tables`, so
insert, update and delete all land in `audit_log` whichever route wrote them,
including provisioning's initial seed. `record_id` is the **tenant**, since
`tenant_modules` is keyed by `(tenant_id, module_key)` and has no surrogate id;
which module changed and what it became are in `old_data`/`new_data`.

## Writing migrations on a multi-tenant database

Since Phase 2 the `tenant_id` column default resolves to the caller's tenant,
else the host's, else the sole active tenant, else null. A migration runs
with none of those, so on a database with more than one tenant **a seed
insert into a tenant table that does not name a tenant fails** on the
`not null` constraint. Seed per tenant instead:

```sql
insert into public.app_settings (tenant_id, key, value)
select t.id, 'some.key', to_jsonb(1) from public.tenants t
on conflict (tenant_id, key) do nothing;
```

Permission rows already work this way (`join public.roles r on r.name = ...`
reaches every tenant's role of that name), which is what keeps
`provision_tenant()` correct without maintenance.

## Data retention

Every tenant has its own rules, its own runs and its own log (#707 Phase 5b,
`20260906160000`). A tenant gets the platform-default clocks the moment it is
created -- an `after insert` trigger on `tenants` copies them from the oldest
tenant -- and every one of them arrives in `dry_run`, whatever the source
tenant has set. Turning a rule on is a decision each organization makes for
itself after reviewing a few nights of its own counts (#722); inheriting
somebody else's answer is the one thing provisioning must not do.

Administration → Data Retention therefore shows an organization its own rules
and its own history and nothing else. `trigger_retention_run()` sweeps the
caller's tenant; `set_retention_policy_mode()` changes the caller's rule, and
reports a key that exists only in another tenant as unknown.

Before this, both of those RPCs were granted to `authenticated`, gated only on
`administration:manage`, and acted on one global table -- so any tenant's admin
could turn on and run an enforcing purge over every tenant's donor and
participant data. That was the last standing cross-tenant control.

The nightly `pg_cron` job (`20260905140000`) is unchanged and must not be
rescheduled: it calls `run_retention_purge(p_dry_run => false, p_trigger =>
'cron')`, the new fourth argument `p_tenant_id` defaults to null, and null
means every active tenant -- one run row, one log and one status per tenant, so
one organization's bad clock cannot discard another's sweep.

Two rules are deliberately platform-wide. `rate_limit_hits` holds an IP address
and a route and has no tenant to belong to, so the sweep purges it once and
takes the **shortest** period any tenant has set -- the privacy-correct
direction for that data, and the reason the page labels that row as shared.
Each tenant's run still logs the rule, so the page explains it rather than
appearing to have skipped it.

`constituent_accounts` (#1296) is the second, for a stronger reason: an account
has **no tenant** until a claim is approved. Somebody signs up at `/my` against
whichever host they were on and nothing records which, because #1161 resolves a
constituent's tenant from the request rather than from a membership. So
`run_retention_purge()` decides this rule once, above the tenant loop, on the
shortest period any tenant has set -- and enforces it only where **every**
active tenant has the rule enforcing. One organization that has not agreed to
the period is a veto, because the row it would remove is as much the next
organization's sign-up as its own; a tenant with no row for the rule reads as
`off` and vetoes too. The rule can only ever reach an account that is attached
to nothing at all: `retention_unclaimed_account_ids()` excludes anyone with a
directory record, a role, a membership, a deactivation record or an open claim,
and then `retention_auth_user_is_referenced()` walks every remaining foreign key
to `auth.users` outside the `auth` schema and keeps the identity if anything
points at it. Each tenant's run logs the rule with the platform-wide count, and
the page says whose count it is.

### A disabled module's retention clocks keep running (#903)

**Decided: keep purging.** `run_retention_purge()` runs as `pg_cron` with no
session, so none of #900's three choke points applies to it, and it sweeps every
active tenant's rules whatever modules that tenant has. A tenant with Inventory
off for a year therefore comes back to find its gear history aged out by a rule
nobody was looking at, and that is the intended behaviour rather than an
oversight.

The argument is that retention is a privacy promise, not a feature. The rows a
disabled module holds are still personal data about real participants, donors
and volunteers; "we stopped deleting your data on schedule because the customer
stopped paying for the section it lives in" is not a sentence this platform
wants to be able to say, and a regulator reading the retention policy would not
find an exception for it. Off means hidden and frozen to the _tenant_ -- the
rows stay, the export still contains them, re-enabling restores the section --
and none of that is a promise to stop the clock.

The cost is real and is accepted: a tenant that turns Inventory back on after a
year does not get the year of history it would have had, and nobody was being
shown the counts in the meantime. What makes it survivable is that the clocks
are the tenant's own. Every rule arrives in `dry_run`, an organization turns
each one on for itself after reviewing its counts, and a rule nobody enabled
purges nothing -- so the data lost is data that organization decided, on the
record, it did not want kept.

This is written down because the first time anybody notices will be after the
data is gone. If it is ever revisited, the change is a module check inside
`run_retention_purge()`'s per-rule loop, not a reschedule of the cron job.

## The demo tenant

The portal's login screen offers a one-click demo (#604). It is not a special
mode: it is a tenant whose `plan` is `demo`, with an ordinary account holding
the admin role inside it, kept apart by the same policies and composite foreign
keys as any paying tenant. `DEMO_EMAIL` and `DEMO_PASSWORD` are server-only, so
the credentials themselves never reach the browser; `demoSignInAction()` signs
in on the server and redirects to `/portal/home`.

`isDemoLoginOffered()` in `src/app/portal/login/demo-availability.ts` decides
whether the button is drawn, and both halves of its condition matter. The
credentials being set is a fact about the **deployment**, and one deployment
serves every tenant -- gating on them alone put "Explore the demo" on every
tenant's login page, offering a white-label customer's staff a one-click
sign-in to somebody else's sample organization. So the second half is the
tenant the request host resolves to: `plan = 'demo'`, read from `public_tenant`
(`20260910000000`), the same constrained enum `current_tenant_is_demo()` and
`seed_demo_tenant()` insist on rather than a slug. A host no tenant claims and
a failed tenant read both get no button. `demoSignInAction()` re-checks the
same condition, because a Server Action is a POST endpoint every host on the
deployment can reach whether or not the button was drawn.

One consequence worth knowing before you go looking for the button: it is
absent on `uat.chattersnow.org` and on preview and local runs, because
`TENANT_HOST_OVERRIDE` resolves those to Chatter Snow's own tenant. The demo is
exercised on `demo.rcmlabs.dev`.

### The rollout order is load-bearing

`public_tenant_id()` falls back to "the sole active tenant" **only while
exactly one is active**, and `20260905190000` creates the Chatter Snow tenant
with no `custom_domain`. The moment a second tenant goes active, that fallback
switches off — and until the first tenant has a domain of its own, nothing
replaces it. The public site would lose events, the calendar, the gear
catalogue, sponsors, programs, branding and the organization's own name;
`page_visibility` would come back empty so `/programs`, `/learn` and `/support`
would 404; every anonymous intake RPC would fail; and `default_tenant_id()`
would return null so any sessionless insert would violate `not null`. The
portal keeps working throughout: `current_tenant_id()` is membership-based and
never consults the host, and the host rule the portal shell added in #956 is
inert on a host no tenant claims (see “One host, one tenant” below).

The failure is invisible until it isn't, so the domain goes first and is
verified **positively** while the fallback is still masking any mistake:

1. `update public.tenants set custom_domain = 'chattersnow.org' where slug =
'chatter-snow';` — lowercase, per the check constraint. The parent-domain
   match in `resolve_tenant_id_from_host()` covers `www.` and `portal.`.
2. Confirm `resolve_tenant_id_from_host('www.chattersnow.org')` and
   `resolve_tenant_id_from_host('portal.chattersnow.org')` both return that
   tenant's id. A null here is the whole failure, and it is silent until the
   demo goes live.
3. Set `TENANT_HOST_OVERRIDE` on the Vercel **Preview** and **Development**
   environments. `vercel.json` deploys `development` and `main` against the
   same Supabase project, and a request to
   `chattersnow-web-git-development-*.vercel.app` matches no `custom_domain` —
   which is a single unique column, so a second host cannot simply be listed
   against the tenant. `src/lib/supabase/server.ts` prefers the override over
   the request `Host` when it is set.
4. Add `demo.rcmlabs.dev` to the Vercel project and to the Supabase Auth
   redirect allowlist. `src/proxy.ts` needs no change: it is not a `portal.`
   host, so `/portal/login` passes through as a path, which is why the demo
   portal is reached at `demo.rcmlabs.dev/portal`. It is on a different
   apex from any customer domain, so nothing about it depends on
   longest-suffix matching against `chattersnow.org`; a `demo.` subdomain of a
   customer's own domain would have, and would also have put the demo behind
   that customer's brand.
5. Only then run the reset against the linked project.

### Resetting it

```bash
DEMO_EMAIL=… DEMO_PASSWORD=… DEMO_SLUG=demo DEMO_HOST=demo.rcmlabs.dev \
  bun --env-file=.env.production.local scripts/demo-reset.ts
```

`.github/workflows/demo-reset.yml` runs exactly that nightly, on a `Demo`
GitHub environment with **no required reviewers** — an environment gate blocks
a whole job before any step runs, so a `Production`-gated cron job would sit
pending approval forever and the demo would quietly stop resetting. Its
secrets are `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `DEMO_EMAIL`,
`DEMO_PASSWORD`, `DEMO_SLUG` and `DEMO_HOST`. No Supabase CLI and no database
password: everything goes through PostgREST and the GoTrue admin API as
`service_role`.

A run re-asserts the fixed `DEMO_PASSWORD` on the demo account every time
rather than rotating it — nothing here can write a new password back into
Vercel's environment, and re-asserting is what undoes a visitor changing it at
`/portal/set-password`. It then archives and `delete_tenant()`s the old demo
tenant, provisions a new one with `p_plan: 'demo'` and `p_admin_email: null`
(so no `pending_role_grants` row is ever staged, and the claim-by-email hazard
does not arise), grants the demo account admin directly, and calls
`seed_demo_tenant()`.

Two independent guards stand between a mistyped `DEMO_SLUG` and somebody's live
data: `assertDemoTenant()` in `scripts/demo/guards.ts` refuses any tenant whose
plan is not `demo` and refuses the `chatter-snow` slug outright, and
`seed_demo_tenant()` refuses a non-demo tenant in its first statement.

**Never leave a demo tenant on the local stack.** The integration and e2e
suites depend on the sole-active-tenant fallback, and a second active tenant
switches it off. `demo-reset.ts` refuses a local URL unless `--local` is passed
and warns loudly when it is; `bun run demo:teardown` removes it again.

### What is blocked inside a demo tenant

A visitor holds admin there anonymously, so every control that still reaches
outside the tenant is closed by `current_tenant_is_demo()`:

| Surface                                          | Block                                                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging a `pending_role_grants` row              | Both the insert policy and `createInviteLinkAction`. #759 is the general fix; this is defence in depth                                                                              |
| `grant_support_access` / `revoke_support_access` | Refused before the address lookup, so the error taxonomy is not an account-existence oracle and no real account gets a membership in its switcher                                   |
| `deactivated_users` insert                       | The demo account's only membership is the demo tenant, so `user_is_only_in_current_tenant()` is true and a visitor could otherwise deactivate it platform-wide until the next reset |

Three things are deliberately **not** blocked, each checked: retention (#760
scoped `trigger_retention_run` and `set_retention_policy_mode` per tenant),
export (already `current_tenant_id()`-scoped, and exporting invented data is
worth showing off), and renaming the tenant (the update policy grants `name`
only — `custom_domain`, `slug`, `status` and `plan` are `service_role`).

### The demo tenant does not offer constituent accounts

**A decision, not a gap** (#1177, epic #1160). `constituent_accounts` — the
module behind `/my`, the signed-in area on a tenant's public website
(`docs/spec/constituent-accounts.md`) — is `false` for the `demo` plan, and it
stays that way. Nobody should turn it on for this tenant.

The product reason is that there is nothing to show. What that area is worth to
a person is their own accumulated history: the donations they made, the gear
they were handed, the shifts they worked. A tenant rebuilt from seed every night
has none of that, so a visitor who signed up, claimed a record and had it
approved would find the whole thing gone by morning — a demonstration of the
opposite of the feature.

The operational reason is the one that makes it a trap rather than a
preference. **The nightly reset cannot clear what sign-up creates.**
`delete_tenant()` removes everything carrying a `tenant_id`, `people` and
`person_claims` included, and `scripts/demo-reset.ts` touches `auth.users` only
to find or re-create the demo account itself. A self-serve sign-up creates an
`auth.users` row that belongs to no tenant. So:

- Every demo sign-up would survive every reset, permanently, on the Auth
  instance shared by every tenant on this project — including the paying ones.
- Its `people` link is deleted with the tenant, so the account would come back
  the next night unlinked and facing the claim form again. The reset would go
  _around_ the account rather than resetting it.
- Sign-up is open to anyone and `demo.rcmlabs.dev` is public, which makes the
  combination an unauthenticated, unbounded row creator against the production
  Auth project.

Turning the module on for the demo therefore means building the sweep first, and
the constraints on it are worth stating here so nobody writes it from the wrong
end:

- It must never delete the demo account itself, nor any account belonging to
  another tenant. The Auth instance is shared, so "every user except the demo
  one" is catastrophically wrong.
- The safe selector is the demo tenant's own `people.auth_user_id` values,
  collected **before** `delete_tenant()` removes those rows — that set is by
  construction only accounts linked to this tenant.
- Accounts that signed up and never had a claim approved have no `people` row at
  all, so they need their own trail: a `person_claims` row, or the tenant
  recorded at sign-up.
- Cap it. The sweep should refuse to run when the count looks implausible rather
  than delete a thousand users because a query went wrong, and the selector
  needs a test that proves it cannot widen.

Note that this is a decision about the **demo** tenant and not about the
platform tenant or a customer's. `constituent_accounts` defaults to off for
every tenant on every plan; a white-label customer turning it on is the ordinary
case the module exists for, and their tenant is not reset nightly.

## Storage

One bucket holds per-tenant data: `gear-photos` (#781), laid out flat as
`{tenant_id}/{uuid}.jpg`. It is public to read and RLS-gated to write, and the
tenant prefix is the isolation -- enforced by policies on `storage.objects`
(20260907160000), not by anything `tenant_isolation_gaps()` can see, since that
function only scans `public`. `src/lib/storage/gear-photos.integration.test.ts`
is what asserts it instead.

**Deleting a tenant has to sweep the bucket first.** `delete_tenant()` cannot:
removing `storage.objects` rows in SQL leaves the underlying files on disk on
hosted Supabase. Run `deleteTenantGearPhotos(serviceRoleClient(), tenantId)`
from `src/lib/storage/orphan-purge.ts` **before** `delete_tenant()` -- afterwards
the tenant id is gone and there is nothing left to derive the prefix from.

The private `documents` bucket (#1489) is laid out as
`{tenant_id}/{module}/{uuid}/{file name}` and has the same obligation: run
`deleteTenantDocuments(serviceRoleClient(), tenantId)` from
`src/lib/storage/documents-purge.ts` before `delete_tenant()` too. Its policies
(20260930120000) check the tenant prefix and the module's permission, and
`src/lib/storage/documents.integration.test.ts` asserts them.

**The export deliberately carries no bytes.** `inventory_items.photo_url` holds
a public, durable URL that resolves with no credentials, so a receiving
organization can fetch every photo from the export as it stands. Inlining
megabytes of base64 into a JSON document would be worse in every way. A
governance `document_path` or a finance `receipt_path` is different -- the bucket is private and the path
resolves to nothing without a session in that tenant -- so moving an
organization's uploaded documents means downloading them with the service-role
client before teardown.

## Still owed

- The teardown procedure above covers `gear-photos` and `documents`. The other
  per-tenant buckets (`artwork-submissions`, `site-photos`,
  `publication-files`) have tenant-prefix policies but no teardown helper yet.
  Every new bucket needs both.
