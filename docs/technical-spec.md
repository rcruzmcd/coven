# Coven — Website and Operations Portal

## Technical Specification

- **Status:** Draft for team review
- **Version:** 0.10
- **Date:** 2026-09-10
- **Owner:** the platform, which ships as **Coven** (Chatter Snow is its first tenant)
- **Repository:** [`rcruzmcd/coven`](https://github.com/rcruzmcd/coven) (formerly `chattersnow/chattersnow-web`)
- **Hosts:** see §3.1

## How to read this spec

§5 (functional requirements) and §6 (data model) are split by module under
[`docs/spec/`](spec/). **Read this file plus the one or two domain files your work
touches — not the set.** Section numbers are stable and unchanged, so a `§5.17` in a
migration comment or an issue still means what it always did; the index below says
which file it now lives in.

| Sections                                                                 | File                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| §5.3, §6 identity and access                                             | [`spec/access-control.md`](spec/access-control.md)             |
| §5.11, §6 audit log                                                      | [`spec/audit.md`](spec/audit.md)                               |
| §5.23, §6 constituent accounts                                           | [`spec/constituent-accounts.md`](spec/constituent-accounts.md) |
| §5.24, §6 conduct reports                                                | [`spec/conduct.md`](spec/conduct.md)                           |
| §5.20, §6 content and community calendar                                 | [`spec/content-calendar.md`](spec/content-calendar.md)         |
| §5.2, §5.5, §6 public and events                                         | [`spec/events.md`](spec/events.md)                             |
| §5.6, §5.16, §5.18, §5.21, §5.22, §5.25, §5.26, §6 finance and giveaways | [`spec/finance.md`](spec/finance.md)                           |
| §5.8                                                                     | [`spec/giveaways.md`](spec/giveaways.md)                       |
| §5.12, §6 governance                                                     | [`spec/governance.md`](spec/governance.md)                     |
| §5.4, §5.7, §5.13, §5.19, §6 inventory and donations                     | [`spec/inventory.md`](spec/inventory.md)                       |
| §6 multi-tenancy                                                         | [`spec/multi-tenancy.md`](spec/multi-tenancy.md)               |
| §5.9                                                                     | [`spec/people.md`](spec/people.md)                             |
| §5.14, §5.15, §6 programs and impact                                     | [`spec/programs.md`](spec/programs.md)                         |
| §5.27, §6 publications                                                   | [`spec/publications.md`](spec/publications.md)                 |
| §5.17, §6 volunteers                                                     | [`spec/volunteers.md`](spec/volunteers.md)                     |
| §16, §17 (review addenda)                                                | [`spec/addenda.md`](spec/addenda.md)                           |

§5.1 and §5.10 are cross-cutting rather than per-module and stay in this file, along
with everything else: purpose, goals, technology, system boundaries, security, the route
tree, the key workflows, and the release criteria. There has never been a §10 or a §13.

Throughout the spec, a plain `§N` is in the file you are reading and a `§N` that lives
in another file is a link. A bare `§N` in a migration comment or an issue predates the
split and resolves through the index above.

Those links are load-bearing, so `bun run docs:links` resolves every one of them and CI
fails on a miss (#1196). Watch the anchors: GitHub deletes a character it cannot slug
and does **not** close the gap it leaves, so `## 6. Data model — Multi-tenancy` is
`#6-data-model--multi-tenancy`, with two hyphens. Fourteen links wrote one and landed
the reader at the top of the target file instead.

## 1. Purpose

A small organization needs a public website for sharing what it does, plus a secure admin portal for managing events, money, inventory, people, and operational summaries. That is true of a nonprofit sharing its mission and programs, and equally of a small business — the records are the same shape, and the words differ.

This began as Chatter Snow's own site and is now a **multi-tenant platform**, named **Coven**, serving that need for any number of organizations from one application and one database ([§6, "Multi-tenancy"](spec/multi-tenancy.md#6-data-model--multi-tenancy)). Its market is small nonprofits and small businesses. **Chatter Snow is the first tenant, not the product.** Read every requirement below as a requirement of the platform, satisfied per tenant: "the organization's mission", not "Chatter Snow's mission". Where Chatter Snow appears by name it is an example of a tenant's data, and belongs in that tenant's rows rather than in platform code — `docs/licensing.md` draws the line, and `docs/tenants.md` is the operator's runbook.

Nonprofit vocabulary — donors, programs, volunteers, a board — is the default wording of a platform whose first tenant is a nonprofit, not a statement about who may be a tenant. A business tenant reads the same tables as customers, services, staff and owners. Where a word reaches navigation, it is data (`lexicon.*`, §6 multi-tenancy); everywhere else it is Site Content. Requirements below that name a nonprofit-only concept — §5.12 governance and nonprofit-status tracking above all — are module entitlements a tenant may not hold, not assumptions the platform makes.

The product has two distinct audiences:

> **Public users are primarily consumers of information. Authorized users are operators of the system.**

The public site must remain useful without an account. Operational data must require authentication and role-based authorization. Both are per tenant: the request host decides which organization a public visitor is looking at, and a membership decides which one an operator is working in.

## 2. Goals and Non-Goals

### Goals

1. Publish accessible information about the organization, its mission, programs, leadership, contact details, and ways to support it.
2. Publish upcoming and past events with optional registration.
3. Give authorized staff and volunteers a secure place to manage operational records.
4. Treat donations, inventory changes, distributions, and expenses as records with history, rather than silently overwriting facts.
5. Give administrators a dashboard that summarizes events, inventory, donations, and expenses.

### Non-goals for the initial release

- Full accounting software or tax preparation.
- A public view of the internal inventory record (donor/donation linkage, face value, internal notes, status, or movement history). A curated, read-only public catalog of currently available gear is in scope — see §4 and [§5.4](spec/inventory.md#54-inventory-and-donation-management).
- Automated calendar synchronization.
- Waitlists, capacity automation, confirmation emails, or event photo galleries unless prioritized separately.
- A general-purpose file attachment system (a `file_attachments` table, many files per record, versioning). Records that point at a document hold **one** document: a link to a file the organization already manages (Google Drive/OneDrive), or, since #1485, one uploaded file in the private `documents` Storage bucket, read through short-lived signed URLs — governance records since #1489, expense and reimbursement receipts with #1490. See [§5.6](spec/finance.md#56-expense-management), [§5.12](spec/governance.md#512-governance), [§5.18](spec/finance.md#518-reimbursements), §6.

(Giveaway recording and event attendance headcounts, listed as future capabilities in earlier drafts, are now implemented — see [§5.5](spec/events.md#55-event-management) and [§5.8](spec/giveaways.md#58-giveaways). Volunteer management, previously listed here as a non-goal, is now specified — see [§5.17](spec/volunteers.md#517-volunteer-management).)

## 3. Technology and Deployment

| Area                     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend and application | Next.js App Router, TypeScript, React                                                                                                                                                                                                                                                                                                                                                                                                                  |
| UI components            | shadcn/ui (Tailwind v4 + Base UI primitives), composed with the project's own brand tokens/classes in `globals.css`                                                                                                                                                                                                                                                                                                                                    |
| Hosting                  | Vercel                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Database                 | Supabase PostgreSQL                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Authentication           | Supabase Auth with Google OAuth                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Files                    | Supabase Storage. **Implemented**: a public `gear-photos` bucket (issue #781) and a public `site-photos` bucket (issue #921), both `{tenant_id}/{uuid}.jpg` with RLS-gated write; and a private `artwork-submissions` bucket (issue #870) written only through server-minted signed upload URLs and read only through signed URLs — see §7.5. Document attachments (receipts, governance records) are external links for the initial release — see §2. |
| Data API                 | Supabase-generated API and server-side Next.js routes/actions where orchestration is required                                                                                                                                                                                                                                                                                                                                                          |
| Authorization            | PostgreSQL Row Level Security (RLS), with server-side checks for sensitive workflows                                                                                                                                                                                                                                                                                                                                                                   |
| Source control           | GitHub                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| DNS and domain           | Cloudflare DNS; Vercel manages application deployment and domain integration                                                                                                                                                                                                                                                                                                                                                                           |
| Local development        | Next.js development server and Supabase local stack                                                                                                                                                                                                                                                                                                                                                                                                    |

### 3.1 Hosts and tenants

One deployment serves every tenant. Which one a request belongs to is resolved from its `Host` against `tenants.custom_domain` ([§6, "Multi-tenancy"](spec/multi-tenancy.md#6-data-model--multi-tenancy)), so adding an organization is a DNS entry plus a row — never a branch, a build, or a deploy.

| Host                       | Tenant                     | What it serves                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chattersnow.org`          | Chatter Snow               | Redirects to `www`                                                                                                                                                                                                                                                                                                                                                     |
| `www.chattersnow.org`      | Chatter Snow               | Public site                                                                                                                                                                                                                                                                                                                                                            |
| `portal.chattersnow.org`   | Chatter Snow               | Operations portal                                                                                                                                                                                                                                                                                                                                                      |
| `demo.rcmlabs.dev`         | Demo (`demo` plan)         | Public site of the demo tenant                                                                                                                                                                                                                                                                                                                                         |
| `demo.rcmlabs.dev/portal`  | Demo (`demo` plan)         | Demo portal, one click from the login screen, reset nightly (§6, "The demo tenant"; `docs/tenants.md`)                                                                                                                                                                                                                                                                 |
| `coven.rcmlabs.dev`        | Platform (`internal` plan) | Coven's public marketing site, served as the platform tenant's public pages                                                                                                                                                                                                                                                                                            |
| `coven.rcmlabs.dev/portal` | Platform (`internal` plan) | The platform operator's own portal (Administration → Platform)                                                                                                                                                                                                                                                                                                         |
| `uat.chattersnow.org`      | Chatter Snow               | The `development` branch, deployed as a Vercel **Preview** (chosen on the Hobby plan, which has no separate Development environment; Pro allows a custom environment, but none has been set up). Parent-domain matching resolves it to Chatter Snow without an override; a raw `*.vercel.app` preview host matches no `custom_domain` and needs `TENANT_HOST_OVERRIDE` |

A host is also an **install identity**. Both surfaces are installable PWAs, and they install as **two separate apps** (#1083, #1171). That is not a preference: an install is keyed to origin plus `scope`, and a real tenant already serves its website and its portal from two origins (`www.<domain>` and `portal.<domain>`), so two installs is what the DNS decided. Each surface serves its own manifest from an explicit route handler resolved per request — `/manifest.webmanifest` for the portal, `/site.webmanifest` for the public site — and each links its own from its own layout, so no tree advertises the other's app and the trees outside both (`/links`) advertise neither. Either manifest carries the host's tenant: its `tenants.name`, its `brand.primary_deep` and `brand.background`, and an icon from `/api/app-icon/<size>` that composes the tenant's `brand.app_icon_url` (or, unset, its initials on its own colour) inside the maskable safe zone. The supporter app carries the organization's plain name, because it is the one most people install; the staff app is `<Name> Ops`, a role word rather than a product name. Nothing on anyone's home screen names the platform, and an unresolved host gets a manifest naming no organization either, matching the root-metadata rule in §7.

`start_url` and `scope` are host-aware for the same reason the portal's URLs are. Where a surface owns the origin root it takes `/`: the portal on a `portal.` host (`/home`, `/`), the public site on a host whose `/portal/*` redirects away to a portal subdomain (`/`, `/`), so a visitor moves from `/my` to an event to the donate page without leaving the standalone window. Where one origin serves both — the demo tenant, a preview, a local run — the portal stays at `/portal/home` under `/portal` and the public app narrows to `/my`, so the two scopes cannot overlap. `/my` is gated by the `constituent_accounts` module, which is off by default, so on a shared-origin host the public manifest is advertised and served only when that module is on; a `portal.` host serves no public page and 404s it outright. `id` is `scope` in both cases, which is what lets a tenant rename — or the portal's own rename to `<Name> Ops` — update an existing install rather than duplicate it. The constituent area's own spec is `docs/spec/constituent-accounts.md`.

The service worker (`public/sw.js`, registered over one surface's scope at a time, never under automation or in development) caches `/_next/static/*` and a tenant-neutral `/offline.html` and nothing else — no document, no RSC payload, no `/api` response — so an installed app can never show a stale total or a signed-out shell; offline is an honest banner and a refused submit, not a queued write. One worker file serves both surfaces, because what it caches is tenant- and surface-neutral. CacheStorage is per origin, so signing out of either surface clears both — harmless, since nothing authenticated is ever cached. Note that iOS gives each installed PWA its own cookie jar: the parent-domain session cookie does not carry between the two installed apps, or from Safari into either, so each asks for sign-in once.

The demo and platform tenants sit on `rcmlabs.dev` subdomains rather than `chattersnow.org` because neither is Chatter Snow's: putting a demo of the platform on a customer's domain would present one tenant's brand as the product's. Both are single-host tenants, public site at the root and portal at `/portal`, so neither needs a shared session cookie and `rcmlabs.dev` must stay out of `NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS` (a `.rcmlabs.dev` cookie would reach the other tenant). The platform uses the named `coven.` subdomain rather than the apex because tenant lookup also matches parent domains: an apex `custom_domain` would quietly claim every unclaimed `*.rcmlabs.dev` host. The apex itself is not served from this deployment. They moved there from `rickiecruz.com` subdomains in October 2026 with a `custom_domain` update and a `DEMO_HOST` change, no code change; the old hosts 308 to the new ones.

The repository started as a minimal Next.js application and has since been built out well past the original "coming soon" skeleton. Supabase Auth, Storage, and API services are enabled in `supabase/config.toml`. Schema exists as 100+ ordered migrations under `supabase/migrations/`, now covering the shared `people` directory (donors, sponsors, volunteers), donations, inventory items/movements, events, event sponsors, event expenses/revenue, event attendance (a simple event-level headcount, not per-attendee), event registrations (with check-in), discount codes, giveaways/giveaway prizes/giveaway winners, programs, volunteer role types/hours, reimbursements, governance (board members, meetings, agendas/agenda templates, `meeting_minutes`, action items, decisions, resolutions, conflict-of-interest disclosures, annual requirements), nonprofit-status milestones, the content and community calendar (calendar items, content opportunities, brief templates, program-suggestion rules), `roles`/`user_roles`/`role_permissions`/`pending_role_grants`/`deactivated_users`, and an append-only `audit_log`, plus curated public views (`public_gear_catalog`, `public_events`, `public_event_sponsors`, `public_sponsor_wall`, `public_event_programs`, `public_volunteer_role_types`, `public_calendar_items`) and abuse-protection primitives (`rate_limit_hits`/`check_rate_limit()`, `contact_messages`) backing the public intake forms. `supabase/seed.sql` populates a local dev database with one test account per role (plus a multi-role and a no-role account, all `@example.test`) and sample operational data, so the role matrix and every workflow below can be exercised locally without touching production.

The portal's sidebar nav links to every section named in §8's route tree. Administration > System settings is a real page backed by an `app_settings` key/value table, holding the org's fiscal year ([§5.21](spec/finance.md#521-fiscal-year)), the expense and reimbursement approval thresholds ([§5.16](spec/finance.md#516-financial-controls-and-approval-workflow), [§5.18](spec/finance.md#518-reimbursements)), the register's default sales tax rate (`finance.sales_tax_rate`, [§5.22](spec/finance.md#522-sales-point-of-sale)), and the content calendar's default lead time ([§5.20](spec/content-calendar.md#520-content-and-community-calendar)), with more settings added incrementally as features need them. The public site's Home page is implemented with mission copy, CTAs, and an upcoming-event highlight; Contact, Events (list, detail, registration, check-in), Gears (catalog and request flow), and the public Community Calendar all have working forms/data, alongside About Us, Get Involved, and Support — see §4.

### Environment configuration

Secrets must be stored in environment variables and Vercel project settings, never in source control.

Required application configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` for trusted server-only operations, if required
- Google OAuth credentials configured in Supabase Auth
- Site URL and OAuth redirect URLs for local, preview, and production environments

The secret key must never be exposed to browser code. Production and preview environments should use separate Supabase projects or clearly separated configuration and data policies.

## 4. System Boundaries

### Public website

Public routes may expose approved content and explicitly public records. The public site's nav (`src/app/(public)/site-nav.tsx`) now has seven top-level groups, superseding the original five-section IA (About Us's Programs, Volunteer, and Donations sub-pages were promoted out to their own sections):

- **Home** (`/home`): a landing page, primarily imagery/highlights linking into the other sections.
- **About** (`/about`): the organization's mission and story, plus a **Meet the Team** sub-page (`/about/team`) with staff/leadership profiles. Since issue #917 a tenant chooses how those profiles are arranged, in Website › Layout as `layout.team_layout`: **Cards** (the default, and what every tenant that has said nothing keeps), **Rows** — full-width roster rows that set a long biography at a readable measure and clip it to three lines with an in-page expander — or, since issue #1012, **Portraits**, a dense grid of faces with one biography at a time underneath, for a team larger than either of the others can hold. Every biography is in the server-rendered HTML under all three, whether or not it is on screen. Each member also carries an optional role, shown in all three arrangements. Since issue #1014 a tenant also chooses where those members come from, as `layout.team_source`: **Site Content** (the default) keeps the `about_team.members` copy, while **People** reads the `public_team` view — the people the tenant has put on the page from their records in People, each with a public role, a photo link and a public biography held in `public_team_members`, a row that is itself the opt-in ([§5.9](spec/people.md#59-people-directory)). All three arrangements render either source; the heading, hero photo and missing-bio text stay copy in both.
- **Events** (`/events`): upcoming and past events with detail pages, plus `/events/community` — the public Community Calendar ([§5.20](spec/content-calendar.md#520-content-and-community-calendar)). Initial release renders events as a list; a calendar view is a possible future enhancement pending further research.
- **Gear** (`/inventory`, `/inventory/donate`): the curated, read-only gear availability catalog with a request flow, and a donate-gear informational page.
- **Get Involved** (`/get-involved/attend`, `/get-involved/volunteer`, `/get-involved/partner`): attending events, volunteering (opportunities plus an application form), and partnering.
- **Support** (`/support/donations`, `/support/donate`, `/support/sponsorship`): monetary giving — a per-tenant link to wherever that organization actually collects, plus the stable `/support/donate` redirect ([§5.25](spec/finance.md#525-online-giving)) — and sponsorship information, the latter closing with a wall of the organization's past sponsors ([§5.5](spec/events.md#55-event-management)). Since issue #1013 a tenant chooses how that wall is presented: **Cards** (the default, and what every tenant that has said nothing keeps) or **Band** — one quiet centred row of logos at a single height, for a short wall or one that should support the donate call to action below it — set in Website › Layout as `layout.sponsor_wall_layout`.
- **Contact Us** (`/contact`): a rate-limited contact form that persists inquiries for staff follow-up, plus the organization's published email address and social media links.

A `/programs` page also exists (the pillar/program content originally under `/about/programs`). It is in the nav, and its cards come either from Site Content or from the Programs module — see [§5.14](spec/programs.md#514-program-management).

Four further routes exist for the **platform's own** public site (#1328, #1329, #1330): **`/nonprofits`** and **`/business`**, the two audience paths; **`/modules`**, the module tour; and **`/pricing`**, the price list, whose plans differ by which modules come with them, each adding to the last, rather than by how many people may log in. The first three are one implementation (`src/app/(public)/tour-page.tsx`) behind three URLs — a heading, a list of illustrated sections and a closing note. The audience paths describe what the platform does in each audience's vocabulary (governance leads the nonprofit page and is deliberately absent from the business one) and both say plainly that the wording is a per-tenant setting rather than a separate edition; the module tour describes it in neither vocabulary and closes on the argument that the combination is the product. `/pricing` is its own page, and its plans — including the figures — are a `list` slot, because a price is the thing most likely to change and least likely to deserve a code review.

These are the routes in the tree whose content is about the product rather than about an organization, so their copy is the registry default rather than a prompt. The line the defaults stop at is anything only one deployment knows: a destination is a host and a price is a commercial term, so the `*.ctas` lists, the plan figures and the onboarding fee are the platform tenant's own `site_content` rows (20260920020000, 20260920030000, 20260929200000) rather than defaults every operator would inherit. Each route has its own page-visibility slot — `audiences`, `modules`, `pricing` — **off for every tenant** until somebody turns it on, and `pricing` is off even for the platform tenant until the numbers on it are agreed (#998, open question 4). All four share one `Product` nav group rather than four, because `site-nav.tsx` budgets the header at eight sections. #1325 records the exit criterion: when the routes that exist only for the product's own marketing grow well past a handful, they move to a project of their own.

Public routes must not expose donor contact details, private event data, internal notes, financial records, the internal inventory record (donation linkage, face value, notes, status, or movement history), individual recipient information, or inventory history. The gear availability catalog above is the sole approved exception, and only through its curated field list.

**A public host is not the same thing as a public route**, and the restriction above is about the second. It says what an _unauthenticated visitor_ may read — which is what [§7.4](#74-no-sensitive-data-for-the-anonymous-role) states precisely, for the `anon` role. The distinction exists for **`/my`**, the constituent area (§5.23, [`spec/constituent-accounts.md`](spec/constituent-accounts.md)): it is served from the tenant's public host, it is not in the nav, and it shows a signed-in person their own donations, their own gear and their own volunteering. Every route under it has a session and an approved claim behind it, every function behind it is revoked from `anon`, and the tenant has to have turned the `constituent_accounts` module on for the area to exist at all. Nothing there is readable by an anonymous visitor, so nothing there is an exception to the sentence above.

**Implemented:** all seven sections above are built. Gear (`/inventory`) includes a request flow ([§5.4](spec/inventory.md#54-inventory-and-donation-management)); Get Involved > Volunteer is fed live from `volunteer_role_types` plus a public application form ([§5.17](spec/volunteers.md#517-volunteer-management)); Events includes public registration, check-in-eligible listings, public sponsor display, and the Community Calendar ([§5.2](spec/events.md#52-public-events), [§5.20](spec/content-calendar.md#520-content-and-community-calendar)); Contact and the volunteer-application/event-registration paths are rate-limited (§7). About Us (`/about`) has real mission/story copy and a team roster (bios still "coming soon"). Support > Donations carries in-kind donation information and, for a tenant that has configured one, a Give card pointing at the giving page its own provider hosts ([§5.25](spec/finance.md#525-online-giving)); no payment processor is integrated and none is planned.

**What's next:** Replace the monetary-donations placeholder with a real giving path. Write real team bios and an explicit values section.

`/programs` is reachable from the nav (the claim that its entry is commented out predates `src/lib/public-nav.ts`), and since issue #898 a tenant chooses where its cards come from: **Site Content** (the default, and what every tenant that has said nothing keeps) or the **Programs module**, set in Website › Layout as `layout.programs_source`. See [§5.14](spec/programs.md#514-program-management).

### Operations portal

The authenticated admin portal supports:

- Dashboard summary
- Event management
- Donation and inventory management
- Expense management

Giveaway recording (prizes, winners, ticket totals) and event attendance headcounts are implemented as part of event management. Role-based access control ([§5.3](spec/access-control.md#53-authentication-and-authorization)) is implemented as a data-driven permissions matrix, including Administration > Users/Roles/Permissions for managing accounts, roles, and the permission matrix itself. An audit log ([§5.11](spec/audit.md#511-audit-and-history)) is implemented for donations, inventory items/movements, event expenses, user role changes, calendar items, and content opportunities; events and giveaways are not yet covered. Volunteers (role types, hours logging), governance record-keeping (board members, meetings, agendas, resolutions, bylaws, policies, conflict-of-interest disclosures, annual requirements, nonprofit-status tracking), programs and impact reporting ([§5.14](spec/programs.md#514-program-management), [§5.15](spec/programs.md#515-impact-tracking-and-reporting)), reimbursements ([§5.18](spec/finance.md#518-reimbursements)), and the content and community calendar ([§5.20](spec/content-calendar.md#520-content-and-community-calendar)) are all implemented. What remains planned or placeholder: inventory valuation reporting ([§5.19](spec/inventory.md#519-inventory-valuation-reporting)) and the financial approval workflow's dollar thresholds ([§5.16](spec/finance.md#516-financial-controls-and-approval-workflow)).

## 5. Functional Requirements

The requirements below that belong to a single module live in that module's file under
[`docs/spec/`](spec/) — see the index above. The two that are cross-cutting stay here:
§5.1 (public content) and §5.10 (dashboard and reporting).

### 5.1 Public content

The site shall allow visitors to:

- View a home page introducing Chatter Snow and linking into About Us, Events, Gears, and Contact Us.
- Learn about Chatter Snow, its mission, and its programs on the About Us page.
- Meet the team or leadership on an About Us sub-page.
- Submit a contact inquiry through a form that is persisted for staff follow-up.
- Find the organization's published contact email address and social media links.
- Reach whatever the organization is currently asking for from a social profile's single bio link, through `/links` (#937) — an unlisted page of admin-configured buttons, each one publishable and reorderable from Administration > Site Content.
- Learn how to support the organization.

Content management is not required to be self-service in the first release. The initial implementation may use repository-managed content, while the data model should leave room for a future CMS or admin-managed content. The contact form is a public write path: it must be rate-limited, validated server-side, and must not create or expose any authenticated-only record.

**Implemented:** Home page content (mission summary, upcoming event highlight, and the hero's buttons — since #1327 a content-authored list, `home.ctas`, whose label, destination and shown/hidden switch are each the tenant's, defaulting to the Join an event / Get involved / Donate trio the page used to hard-code, and filtered against page visibility so a button into a hidden section is left off rather than 404ing — see §4), About Us (mission/story), team roster (bios pending), programs (`/about/programs`), volunteer opportunities (`/about/volunteer`), in-kind donation info (`/about/donations`), and a server-mediated, rate-limited contact form (`/contact`) with published email addresses and an Instagram link.

**What's next:** real leadership bios and an explicit values section on About Us; a real monetary-donation path (currently a "coming soon" stub).

### 5.10 Dashboard and reporting

The initial admin dashboard shall summarize:

- Upcoming events
- Inventory by status and type
- Donation inventory totals
- Expenses for a selected period
- Giveaway sales associated with events
- Revenue for a selected period, which since #909 means event revenue plus completed merchandise sales ([§5.22](spec/finance.md#522-sales-point-of-sale)) — the dashboard tile and the Financial Reports Income figure are derived from the same `get_finance_report_data` rollup so the two can never disagree. Since #1576 that rollup also reads giveaway ticket sales, which count as income, and an event's Results card (#1588, formerly Report) computes its Money section from the same definitions (`summarizeByEvent`), so an event's net agrees with its row on Financial Reports

Dashboard values should be derived from stored records and clearly indicate the relevant date range. Expanded reports may later include filters, exports, and pending tasks.

#### Ops inbox and queue claims

The ops inbox (`getOpsInboxSummary`, the portal shell's attention list) counts work waiting on staff in six queues. Since #1668 each queue item can be **claimed**, so staff can see who is working it: every queue table carries `claimed_by_person_id` (a person in the tenant, by composite FK onto `people (tenant_id, id)`) and `claimed_at`, null together. The only write path is `set_queue_item_claim(p_queue, p_id, p_person_id)`, where a null person releases the claim. It checks "claim yourself" and "assign someone else" separately (both are the queue's `manage` today, see `permission-docs.ts`) and refuses a claim on a resolved item. Claiming yourself needs a `people` row in the tenant; without one, Claim is disabled and says why.

A claim marks who is working an item, so it **survives intermediate states and clears on resolution**. The clear is written into each resolution path, with no trigger:

| Queue                  | Keeps the claim                | Clears the claim              | Where                                                 |
| ---------------------- | ------------------------------ | ----------------------------- | ----------------------------------------------------- |
| Item requests          | new, quoted, paid              | fulfilled, cancelled          | `set_gear_request_status`                             |
| Account claims         | pending                        | approved, rejected, withdrawn | `review_person_claim`; the claimant's withdraw policy |
| Self-logged hours      | pending                        | confirmed, declined           | `review_volunteer_hour_submission`                    |
| Volunteer applications | new, being reviewed, contacted | placed, declined, closed      | `volunteers/applications/actions.ts`                  |
| Messages               | new, read                      | resolved                      | `communications/actions.ts`                           |
| Artwork                | pending                        | approved, rejected            | `artwork/actions.ts`                                  |

Reopening a resolved item, where a path allows it, comes back unclaimed. The inbox reports unclaimed counts beside each total ("New item requests (2 unclaimed)"), leaving the suffix off when nothing is claimed, and its link adds `?claimed=none` only when some items are claimed. The daily ops report words its new-arrival lines the same way. Queue lists filter by **All / Unclaimed / Mine / person** through the same `claimed=none|mine|<person id>` parameter.

## 6. Proposed Data Model

The following is a logical model, not a final migration. IDs should be UUIDs and all
material records should include `created_at`, `updated_at`, and the creating/updating user
where appropriate.

The model is grouped by module and each group lives in that module's file under
[`docs/spec/`](spec/) — see the index above. A reference of the form "§6, 'Multi-tenancy'"
means the group of that name, now the "Data model" section of the matching file.

Foreign keys should enforce relationships. Monetary amounts should use a fixed-precision numeric type, not floating-point values.

### 6.1 Dates and times

**A time someone types is in their browser's timezone. It is stored in UTC. The portal shows it in the viewer's browser timezone; the public site shows an event in the event's own timezone. Every displayed time names the zone it is in** (#1057, #1063, #1064).

The labelling is not decoration — it is what makes either half safe. A reader must never have to work out whose clock a bare "5:00 PM" is on.

Why the public site differs: public pages are server-rendered and cached, so the viewer's zone is not knowable when the HTML is built. Rendering every public time in the browser would cost crawlers and no-JS visitors the time entirely and shift it visibly after hydration — and for a physical event the event's own clock is the useful one anyway. A Denver meetup reads "6:00 PM MDT" to a visitor in New York, which is what they need in order to turn up.

An instant is stored in a timezone-aware column (`timestamptz`). A value that is a calendar day rather than an instant — the day a prize was handed over, the day a donation is dated — belongs in a `date` column, because a date-only input written to a `timestamptz` becomes UTC midnight and reads back as the previous day for every viewer west of Greenwich (#1053).

Some records carry a timezone of their own (`events.timezone`, `calendar_items.time_zone`, `artwork_calls.timezone`): where the thing physically happens. **It governs public display only.** It does not say how a typed time is read — a coordinator entering an event types in their own clock wherever they are sitting — and it does not govern the portal, which shows the reader their own time like every other surface.

**A reporting day is a day in the organization's own timezone** (`app_settings.org.timezone`, set at Administration › Organization Settings › General; #1065). This is a third and separate use of a zone, and it governs neither entry nor display: a report has to cut a period somewhere, and cutting it at UTC midnight puts a sale rung at 7pm on 28 February into March, so a February total is quietly short its last evening — by a different amount for every tenant. `get_finance_report_data` brackets its instants in that zone, and any page choosing a default range (fiscal-year-to-date, "this month") anchors "today" on it with `todayInZone` rather than on the server's UTC clock. Only genuine instants need it; a `date` column carries no zone and means the same day to every reader.

**A sales receipt is the one portal surface that reads in the organization's zone rather than the viewer's** (#1076). It is a document rather than a screen: it is printed, pasted into an email and filed, so two people opening the same receipt from different states must read the same time off it -- and it is the same boundary the finance rollup counts the sale on. `ReceiptModel` therefore carries raw instants plus the zone, and `formatReceiptInstant` renders them wherever the receipt is shown, so the printed page and its plain-text twin cannot disagree. Naming the zone is what keeps this safe, exactly as it does everywhere else.

The helpers are in `src/lib/time.ts`, named for the zone each answers in: the `...InBrowser` family for entry, `...InZone` for rendering a record in its own zone, and `DATE_TIME_WITH_ZONE` for the labelled format.

**A server component cannot render the viewer's zone.** `formatInstantDate` and `formatDateTime` in `src/lib/format.ts` build an `Intl.DateTimeFormat` with no `timeZone`, which resolves to the _running process_ — the browser in a client component, but UTC on Vercel in a server component. Any portal surface showing an instant must therefore render it through `<ViewerTime>` (`src/components/viewer-time.tsx`), which reads the zone via `useViewerTimeZone()` and falls back to a zone the caller names until the browser has answered. Use `formatCalendarDate` for `date` columns, which carry no zone and need none.

## 7. Security and Privacy

### 7.1 RLS on every exposed table

Enable RLS on every exposed application table; do not rely on frontend route hiding as authorization.

### 7.2 Public read access is limited to published records

Public read access should be limited to records explicitly marked published/public.

### 7.3 Permissions follow roles

Authenticated users should receive only the permissions associated with their roles.

- **Tenant isolation** (#707): every tenant table carries `tenant_id`, permissions are evaluated per tenant, and platform access is a time-boxed `support` membership rather than a bypass. Phase 3 enforces it: every policy filters on the tenant, every foreign key between tenant tables is composite, the `security definer` RPCs answer for the caller's tenant, the public surface resolves from the request host, and the generated isolation suite (plus `tenant_isolation_gaps()`) asserts all of it on every run. Since #887 that report also covers the construct which bypasses the policies it checks -- a `security definer` view over a tenant table with no tenant predicate, and any write grant on one (see "Multi-tenancy" in [§6](spec/multi-tenancy.md#6-data-model--multi-tenancy)). A gap there is a release blocker for serving a second organization.

### 7.4 No sensitive data for the anonymous role

Financial, donor, recipient, internal note, and audit data must not be available to the anonymous role.

- The corollary for settings and copy (#888): `brand.`, `page_visibility.`, `layout.`, `legal_publication.`, `lexicon.` and `site_images.` are reserved public key namespaces and the whole of `site_content` is public, because the views serving them match a prefix (or nothing at all) rather than an enumerated list. Nothing that is not meant for `anon` may be stored under them; see "Multi-tenancy" in [§6](spec/multi-tenancy.md#6-data-model--multi-tenancy) for the registries and the test that enforces it.

### 7.5 Storage buckets are private by default

Storage buckets must be private by default. Use signed URLs for authorized files and transformed/public assets only where intentionally approved. **The `gear-photos` and `site-photos` buckets are the approved exceptions** (issues #781 and #921). Gear photos are already public — they were anyone-with-the-link Google Drive files, and they render for `anon` on `/inventory` — so a public bucket exposes nothing a signed URL was protecting, while giving stable URLs and clean `next/image` edge caching with no signing step. Objects are named `{tenant_id}/{uuid}.jpg`: unguessable, one folder level deep, and tenant-scoped. Writes stay gated by policies on `storage.objects` (`inventory:manage` or `inventory_intake:manage`, within the caller's own tenant, and never from the demo tenant, whose admin is an anonymous visitor). Two consequences are accepted deliberately: the tenant's UUID appears in every public photo URL (opaque, and it grants nothing on its own), and an object uploaded to an abandoned intake outlives it until the daily `/api/cron/storage-purge` sweep collects it. Nothing private is ever intended to enter this bucket; anything that is gets its own private one. **The `site-photos` bucket (issue #921) is the second, on the same terms and for a stronger reason: its objects _are_ the pictures on the public website, rendered for `anon` with no session anywhere in the request, so there is nothing a signed URL would be protecting. Writes are gated on `site_content:manage` — the same permission that decides the copy beside the picture — within the caller's own tenant and never from the demo tenant. It is a separate bucket rather than a corner of `gear-photos` because that bucket's policies gate on the inventory permissions and its purge sweep deletes anything no `inventory_items.photo_url` points at, which a site photo never will. Two free-tier consequences are deliberate: the browser re-encodes to a 2400px q0.8 JPEG before uploading, because Supabase's own image transformations are Pro-only, and objects are uploaded with a one-year `cacheControl`, because the path is an immutable UUID and a shorter one would re-run Vercel's image optimizer several times a day — on Pro that is billed past 1,000 included transformations a month, fewer than Hobby's 5,000, so the year-long cache matters more now than when it was chosen. Replacing a photo does not delete the old object: `site_content` holds a draft value and a published one, so the picture being replaced on screen may still be the one the live site is serving — only an object uploaded and replaced within the same unsaved editing session is removed; everything else left behind is collected by the daily `/api/cron/storage-purge` sweep once it is a day old and nothing references it (issue #1492): `site_content`'s published and draft values, the branding settings, and the team-member photo, event flier and sponsor-logo columns. **The `artwork-submissions` bucket (issue #870) is the first of those, and the pattern to follow.** It is private, and it carries no `anon` policy at all: an unauthenticated visitor still has to hand over a 10 MB file, and both obvious routes are closed -- Next caps a Server Action body at 1 MB by default and Vercel caps a serverless request body at 4.5 MB, while an `anon` insert policy on `storage.objects` would be an unauthenticated write faucet on the same project as production. So a rate-limited Server Action (`claim_artwork_upload_slots`, 20/15min) mints a one-shot signed upload URL, with the service-role client, for a path the _server_ chooses (`{tenant_id}/{event_id}/{draft_id}/{uuid}.jpg`), and the browser PUTs directly to Storage; `submit_artwork()` then re-checks each recorded path against a pattern built from the resolved tenant and event, so nothing outside them can be named. Reviewers read through one-hour signed URLs minted server-side under an `artwork_submissions:view` policy. Each artwork is stored twice -- the untouched original, because the zine is printed, and a 1600px thumbnail, without which one page of the review grid would pull close to a gigabyte of egress. Abandoned objects are collected by the same daily `/api/cron/storage-purge` sweep, which runs both buckets because the Hobby plan allowed one cron a day. Pro (since 2026-09-29) allows per-minute schedules, but a daily sweep is still all either bucket needs. **The private `event-media` bucket takes the same deliberate anonymous write path for upload links (issue #1620)**: a photographer with no portal account uploads to one event through a link, and still no `anon` policy exists on `storage.objects`. `claim_event_media_link_upload_slots()` (rate-limited, and checking the link's byte cap) precedes service-role signed upload tokens for server-chosen `{tenant_id}/{event_id}/{uuid}.{ext}` paths, and `record_event_media_by_link()` re-checks the link and the path before a row exists — see `docs/spec/events.md`, "Upload links".

### 7.6 Re-validate authorization in multi-step writes

Validate authorization again in server actions or API routes that perform multi-step writes.

### 7.7 Transactions or RPCs for multi-record workflows

Use database transactions or RPCs for workflows such as receiving donations and distributing inventory so related records cannot be partially written.

### 7.8 Validate client input with shared schemas

Validate all client input with shared schemas and enforce database constraints for quantities, amounts, statuses, and required relationships.

### 7.9 Rate-limit public write endpoints

Rate-limit public registration and other write endpoints; add bot protection if abuse appears. **Implemented** (issue #172): a shared `rate_limit_hits` table (`route`, `ip_address`, `created_at`) and `check_rate_limit(route, ip_address, max_attempts, window)` `security definer` RPC (sliding window, fails open on a null IP) back per-route limits on `submit_contact_message()` (5/15min), `register_for_event()` (8/15min, plus a honeypot field), and `submit_volunteer_application()` (5/15min by IP, plus its existing 24h per-email throttle and a honeypot field), and (issue #870) `submit_artwork()` (5/15min, plus a honeypot field), `claim_artwork_upload_slots()` (20/15min, which is what caps how much can be written into the bucket) and `get_artwork_call()` (30/15min).

### 7.10 Log security-sensitive actions safely

Log security-sensitive actions without placing secrets or unnecessary personal data in logs.

### 7.11 Retention, deletion, export, and access procedures

Define retention, deletion, export, and access procedures for donor and recipient personal information before production use. **Implemented** (issue #602): the periods published at `/privacy` are held in `retention_policies` (one row per category, each with its own `off`/`dry_run`/`enforce` mode) and applied by `run_retention_purge()`, scheduled nightly by `pg_cron`. Rows are anonymized rather than deleted wherever the aggregate still feeds impact reporting -- event registrations keep `party_size`, `checked_in_at` and the rider snapshot while losing every identifying field -- and a person is retained whenever any foreign key outside `retention_purgeable_person_refs` still points at them, which is how the donation and financial exemption is enforced. Every run writes counts and sample ids to `retention_runs`/`retention_run_tables`, readable at Administration > Data Retention; a deletion request for a rider profile is actioned there or from the person record via `delete_rider_profile()`. Portal accounts are deactivated and their portal record cleared rather than deleted: `audit_log.actor_id` and ~120 other actor columns reference `auth.users` with no `ON DELETE`, so removing the identity of anyone who has written a row is not possible, and the audit trail is retained separately for governance, security, audit, insurance and legal purposes. **Extended** (issue #720): the two append-only stores that hold copies the purge could not reach -- `audit_log.old_data`/`new_data` and `person_merges.merged_snapshot`/`survivor_before` -- are redacted rather than deleted, by two more rules in the same job, on the same modes and the same run log. Seven years on, the values of the columns registered in `retention_snapshot_personal_columns` are cleared inside those snapshots (the key stays, holding null) and `redacted_at` is stamped; the records themselves are kept permanently. A deletion request does not wait for that clock: `delete_rider_profile()` redacts the merge snapshots naming the person and the audit entries whose snapshot carries their id, at the time of the request and regardless of policy mode. Both periods are proposals pending board approval, recorded in the planning repo, and both rules ship in `dry_run`. **Extended again** (issue #1296): the constituent area (#1160) collects three kinds of personal data the 2026-09-02 decision predates, and `portal_accounts` published a clock -- "for as long as you hold the role" -- that a member of the public, who holds none by design, could never start. Three more rules on the same machinery: `person_claims` and `volunteer_hour_submissions` are ordinary per-tenant rules (2 years, the second only for entries that were declined or never reviewed, since a confirmed one is the provenance of a `volunteer_hours` row), and `constituent_accounts` is the second rule with no tenant to scope to -- an account has none until a claim is approved, so it is decided once for the platform on the shortest period any tenant set, enforced only where every active tenant is enforcing, and reaches only an identity that `retention_unclaimed_account_ids()` and `retention_auth_user_is_referenced()` agree nothing at all refers to. `portal_accounts` is reworded to name the population it is about. All three periods are proposals pending board approval, recorded in the planning repo beside the first two, and all three ship in `dry_run`.

## 8. Application Structure

Use the Next.js App Router with route groups that make the public/portal boundary visible in the codebase. The actual tree (current, differs slightly from the original proposal — the portal lives under `/portal/(app)/` rather than a top-level `(portal)` group; see §4 for the public-site nav restructure this reflects):

```text
src/app/
  (public)/
    home/                       # public landing page — implemented
    about/                      # mission, story, team (bios pending) — implemented
    programs/                    # pillar/program content — implemented but unlinked from nav (issue #46)
    events/
      [id]/                     # direct-link event detail page
      community/                # public Community Calendar (§5.20)
    publications/               # a tenant's periodic publication (§5.27): the index of
      [slug]/                   # issues, then one page per issue. Labelled by lexicon
    giveaways/
      [giveawayId]/rules/       # a promotion's published official rules (§5.8).
                                # Its own route rather than part of the event's,
                                # because the rules outlive the event and every
                                # published version stays readable at ?version=N.
                                # 404s until somebody publishes.
    inventory/
      library/                  # gear catalog + detail/request flow — implemented
      donate/                   # donate-gear info page
    get-involved/
      attend/
      volunteer/                # opportunities (from volunteer_role_types) + application form — implemented
      partner/
    support/
      donations/                # in-kind info + the per-tenant Give card (§5.25) — implemented
      donate/                   # route handler: 302 to the tenant's giving page, 404 when
                                # giving is off. The address a printed card carries (§5.25)
      sponsorship/              # implemented
    contact/                    # form + published email/social — implemented
    my/                         # the constituent area (§5.23) — a signed-in person's own
      sign-in/                  # history, contact details and actions. Public host, not a
      details/                  # public route: every page is behind a session and an
      hours/                    # approved claim, and the whole area 404s unless the tenant
      notifications/            # has the `constituent_accounts` module on (off by default)
  links/                        # link-in-bio page (#937) — one URL for a social profile's
                                # single bio link, its buttons edited at Administration >
                                # Site Content. Outside `(public)` on purpose: that group's
                                # layout is the header nav and footer this page does without.
  auth/
    callback/
    confirm/
  portal/
    login/
    set-password/
    (app)/                      # authenticated portal shell (sidebar layout)
      home/                     # admin dashboard
      entry/
      events/                   # events, sponsors, expenses/revenue tabs, giveaway tab, attendance and results cards
      inventory/                # items, donations, distribution, reports (valuation) — all implemented
      finance/                  # donations, expenses, reimbursements, revenue, reports, sales/ (ledger + register/ + products/)
      people/                   # shared donor/sponsor/volunteer directory + claims/ (the
                                # constituent claim queue, §5.23)
      programs/                 # program CRUD (issue #45) + reports/ (season/program impact rollup, issue #48)
      governance/               # open-work, board-members, meetings (incl. agendas), resolutions, bylaws, policies, conflict-of-interest, annual-requirements, nonprofit-status — all implemented
      volunteers/                # roles (role types) + participation (hours logging) + applications (public intake queue, issue #173) — implemented (issues #49/#50/#173)
      communications/            # contact-form message queue — implemented (issue #173)
      calendar/                 # content & community calendar (§5.20) — implemented, incl. categories/ and import/
      administration/           # users (incl. invite links, deactivation), roles, permissions, audit-log — implemented; organization-settings — implemented (app_settings; System Settings until #992)
```

The exact route structure may evolve, but authenticated portal layouts must verify the session and authorization before rendering protected data. Use server components for read-heavy pages where practical and keep service-role operations server-only.

**UI convention — view/edit vs. create:** creating a new record uses a `Dialog` (a centered, small-form modal — e.g. `new-person-dialog.tsx`, `new-program-dialog.tsx`, `new-event-dialog.tsx`); viewing/editing an existing record uses a `Sheet` (a side panel, which scales better to a record's full detail and, for events, multiple tabs — e.g. `edit-person-modal.tsx`, `edit-inventory-modal.tsx`, `edit-expense-modal.tsx`, `event-details-dialog.tsx` despite its filename). `programs/program-details-dialog.tsx` and `volunteers/roles/role-type-details-dialog.tsx` still use the older Dialog-based view/edit pattern and should be converted to match.

Supabase database changes should be implemented as ordered migrations under `supabase/migrations/`. Seed data should be safe for local development and must not contain real donor or recipient information.

## 9. Key Workflows

### Public event registration

1. Visitor opens a published event.
2. Application verifies registration is enabled and accepts the submitted form.
3. Server validates capacity/deadline rules if enabled.
4. Registration is stored with minimal necessary personal data.
5. Confirmation behavior is applied when the feature is implemented.

### Receive donation

1. Authorized user opens the donation workflow.
2. User records donor and donation type.
3. User records donation items and condition.
4. Server creates donation, donation items, and receipt movements atomically.
5. Inventory availability updates from the new movement.
6. Audit entry records the actor and created records.

### Distribute gear

1. Authorized user selects inventory and quantity.
2. Server checks current availability and permissions.
3. User records event, recipient information if required, and reason.
4. Server creates the distribution movement atomically.
5. Available quantity reflects the movement.
6. Audit entry records who distributed what and when.

### Public contact inquiry

1. Visitor submits the contact form on the Contact Us page.
2. Server validates input and applies rate limiting/bot protection.
3. Server stores the inquiry in `contact_messages` for staff follow-up, then notifies the ops-inbox role holders who have opted in (issue #742 — see §6).
4. Visitor sees a confirmation state; failures are surfaced without exposing delivery internals.
5. A `communications`-permission holder triages the message at `/portal/communications`: opening it marks it read, and it can be marked resolved once handled.

### Record event expense

1. Authorized user selects an event and enters expense details.
2. Server validates amount and event access when an event is associated.
3. User optionally pastes a link to the receipt file stored in an external solution (Google Drive/OneDrive) — no upload for the initial release.
4. Expense record and receipt link are saved.
5. Audit entry records the action.

## 11. Non-Functional Requirements

- **Accessibility:** Meet WCAG 2.2 AA targets for public and portal interfaces, including keyboard access, focus states, form errors, labels, and color contrast.
- **Responsive behavior:** Support current desktop and mobile browsers; operational tables must have a usable mobile treatment.
- **Performance:** Public pages should use optimized images, predictable loading states, and cacheable reads where safe. Private data must not be accidentally cached publicly.
- **Reliability:** Multi-record operational actions must be atomic and recoverable.
- **Observability:** Capture deployment errors, failed workflows, and security-relevant events without exposing personal data.
- **Backups:** Use Supabase backup and recovery capabilities appropriate to the selected plan and document restore ownership and testing.
- **Maintainability:** Keep schema changes in migrations, use TypeScript types generated from the database where practical, and require review through GitHub pull requests.

## 12. Acceptance Criteria for Initial Release

The initial release is ready when:

- An unauthenticated visitor can navigate approved public content without being redirected to sign in.
- Published upcoming and past events render correctly with their public details.
- Private or draft events do not appear publicly.
- A user cannot read donor, recipient, financial, inventory history, or audit data through the anonymous client.
- An unauthenticated visitor can browse the public gear availability catalog (filter/search included) and never sees donor, financial, notes, or status/movement data in the page or its network responses.
- An administrator can authenticate with Google and access the dashboard, events, expenses, and inventory portal areas.
- Donation receipt and inventory update workflows preserve transaction history.
- Inventory counts cannot become negative through normal application workflows.
- Sensitive uploaded files (e.g. inventory/gear photos) are private and access-controlled where applicable; expense/reimbursement/governance records store external file links rather than uploads for the initial release, and those links are only readable by the roles authorized for that record.
- RLS and authorization behavior are covered by automated tests or documented repeatable checks.
- Production deployment works through Vercel with Cloudflare DNS and environment-specific Supabase configuration.

## 14. Risks and Mitigations

| Risk                                                                           | Mitigation                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public exposure of internal inventory or donor data                            | Private-by-default tables/storage and RLS tests                                                                                                                     |
| Inventory counts lose their history                                            | Append-only movement records and controlled correction workflow                                                                                                     |
| Financial records are mistaken for formal accounting                           | Define reporting scope and reconcile with the organization's accounting process                                                                                     |
| No roles exist yet — every authenticated user currently has full portal access | Introduce `roles`/`user_roles`, replace blanket "authenticated full access" RLS policies with role-scoped ones, and review access with real operators before launch |
| Registration creates privacy or capacity problems                              | Start with minimal fields and add capacity/confirmation rules explicitly                                                                                            |
| Giveaway functionality creates compliance exposure                             | Complete legal review before enabling ticket sales                                                                                                                  |
| Production and preview environments share data accidentally                    | Separate environment variables and Supabase projects or strict project policies                                                                                     |

## 15. Success Measures

After launch, the team should evaluate:

- Public event and support page engagement.
- Registration completion and attendance reconciliation.
- Time required to record a donation and distribute gear.
- Inventory reconciliation accuracy.
- Completeness of event revenue and expense records.
- Number and severity of unauthorized access attempts or policy violations.
- Staff and volunteer feedback on portal usability.
