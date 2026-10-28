# Constituent accounts — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.23 and the constituent-accounts data model. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

**Also relevant:** correcting your own contact details and acting from your account are specified in [§5.9](people.md#59-people-directory); self-logged volunteer hours and `volunteer_hour_submissions` are in [§5.17](volunteers.md#517-volunteer-management); the module catalog and `public_tenant_modules` are in [§6, "Multi-tenancy"](multi-tenancy.md#6-data-model--multi-tenancy); the `constituent_claims` entitlement is a row in the matrix in [§5.3](access-control.md#53-authentication-and-authorization).

## 5.23 Constituent accounts

**Implemented** (epic #1160: issues #1161, #1162, #1163, #1164, #1165). A tenant may offer the people it serves an account on its own public website. The area is `/my`, on the tenant's public host, and it holds a person's own history with the organization — what they gave, what they were handed, where they volunteered, which events they registered for — plus the contact details the organization writes to and three things they can do as themselves.

The audience is the donor, volunteer, attendee or gear recipient whose record the organization created _for_ them: a row in the People directory that describes somebody who has never had a way to read it. Everything in this section exists to close that gap without handing anyone a permission.

### The module, and why it is off

`constituent_accounts` is the **first row in the module catalog with `default_enabled = false`** (#1161). Every other module is `true` because every other module was already shipping to every tenant when #900 wrote the catalog down; this one is new behaviour on a tenant's public website, and whether an organization invites the public to hold accounts on it is the organization's decision rather than the platform's. All three plans — `internal`, `demo`, `white_label` — seed `false` for the same reason, so `provision_tenant()` still gives a new tenant a complete set of rows and none of them turns this on.

`module_enabled_for_tenant()` reads the tenant's own row, then its plan's, then the catalog default, and only then falls open to `true`. The fail-open arm is for a key that is not in the catalog at all — a tenant predating the table, not an unentitled one — so a catalog row saying `false` resolves to `false`. "Fails open" and "defaults to off" sound like they should collide, so an integration test pins it rather than leaving it to a reading of the function.

**The terms of use have to be in force before the module can be turned on** (#1295). An account is a standing credentialed relationship the organization can suspend, and a place where a person asserts things about themselves that staff act on — account eligibility, responsibility for your own credentials, a claim somebody reviews, hours that are provisional until confirmed, and what happens when an account closes are exactly what a terms of use governs. #859 decided which legal documents a tenant serves for a public site that was a set of one-shot forms, and on a tenant that has adopted no terms none of the above is governed by anything.

The fix gates the module on the document rather than making the document unconditional. Serving the platform's terms automatically would have published a document that reads as though it governs accounts and did not — its `using-this-site` section covers unauthorized access and false information on a form, and there was no account section at all — and it would reverse #859's principle that the platform publishes no legal position under an organization's name until that organization says it is theirs. So the platform's terms gained a `your-account` section carrying `requires: "constituentAccounts"` (the #1291 mechanism, so a tenant without the area does not publish the heading), and the dependency is declared in `src/lib/legal-documents.ts` as `LegalDocument.gates`. It runs both ways, or the gate is one click from being empty: the Platform page refuses to enable the module for an organization whose terms are not in force, and that organization's Legal documents panel refuses to withdraw them while the module is on, each with the sentence written for the person reading it. Both refusals sit in the Server Action the switch calls — the same layer as #859's "the privacy policy is always served" — which leaves seeding, the demo reset and the e2e fixtures free to write any state they need through `service_role`.

**A tenant that has said nothing has no constituent area at all.** `requireConstituentArea()` (`src/lib/constituent/guard.ts`) answers every route under `/my` with `notFound()`, not a redirect and not an explanation: on a tenant that has not enabled this, `/my` is not a page that exists, and "this organization does not offer accounts" tells a stranger about a product decision they have no stake in. The gate is also in the database, on every RPC — see "One gate, one place" below.

### The public host is not a public route

`/my` sits on the same host as the public website and is **not** a public route. [§4](../technical-spec.md#4-system-boundaries)'s restriction — no donor contact details, no financial records, no individual recipient information — is a statement about what an **unauthenticated visitor** may read, which is what [§7.4](../technical-spec.md#74-no-sensitive-data-for-the-anonymous-role) says precisely for the `anon` role. `/my` has a session and an approved claim behind it, and it shows one person their own row. Nothing here is reachable by `anon`: every function in this section is `revoke execute … from public, anon`, and `/my/sign-in` is the one route in the area a signed-out visitor can render at all (and it carries `robots: { index: false }`, because a sign-in form is not an answer to any search anybody meant to make).

The distinction matters in the other direction too. A person reading their **own** gear history is the opposite disclosure from the one [§5.9](people.md#59-people-directory) refuses when it gives the recipient role no segment, no badge and no browsable list. That refusal is about a roster of aid beneficiaries being legible to staff who have no reason for it; what keeps this the opposite is `my_history_person_id()`, whose row set no caller can widen.

### One identity, two surfaces

There is one account per person across the portal and the public site (#1161). An administrator who signs in at `portal.<apex>` is already signed in at `www.<apex>/my`, already linked to their own directory record, and `/my/sign-in` redirects them straight into the area rather than offering a form that would suggest the account they hold does not count. **What differs between the two surfaces is authorization, not identity** — the portal additionally requires a role, the public site does not. There is no separate consumer login and there is never a second `auth.users` row for the same person.

That is a cookie decision. A Supabase auth cookie with no `Domain` attribute is host-only, so without one the session is simply not sent to the public host and "one account" quietly becomes "signed out over there". `sessionCookieDomain()` (`src/lib/auth/session-cookie.ts`) supplies the `Domain`, and **the apex list decides it rather than a rule about the hostname**: counting labels is wrong on every multi-label suffix (`.co.uk`, and `.vercel.app`, which is on the public suffix list). The list it reads is `NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS` — the operator has already told us which apexes span several hosts, because only the owner of a domain can promise that `portal.<apex>` resolves here, and that promise _is_ the statement that the apex, `www.` and `portal.` are one tenant's three names.

Three consequences follow, each deliberate:

- **Only those three names.** A host that merely ends with a listed apex does not qualify. `uat.chattersnow.org` is a real deployment, and a `.chattersnow.org` cookie written there would collide with production's by name — signing into uat would overwrite the session on `www`, in both directions. Preview hosts stay host-only, which is correct for them anyway, since they serve both surfaces from one host.
- **Single-host tenants get no domain.** The demo and platform tenants serve their portals at `demo.rcmlabs.dev/portal` and `coven.rcmlabs.dev/portal`, on the same host as their public sites, so nothing needs to cross; giving either one would put the session on `.rcmlabs.dev`, where it would reach the other tenant. The apex is not listed.
- **Both bundles must agree.** The browser client writes this cookie too, so a server that scoped it to `.apex` while the browser left it host-only would produce two cookies of the same name, both sent — the failure this prevents, in a harder-to-see form. Hence the `NEXT_PUBLIC_` variable and never the server-only one: a value only one side can see is a value the two sides can disagree about.

There are also two installable apps, one per surface (#1171). A PWA install is keyed to origin plus `scope`, so the two origins above are already two installs whatever a manifest says: the public site installs under the organization's plain name, the portal as `<Name> Ops`. On a host that serves both surfaces from one origin — the demo tenant, a preview, a local run — the public app narrows its `scope` to `/my`, which makes the constituent area the installable part of the site there; the manifest is advertised only when this module is on, since without it `/my` 404s. `docs/technical-spec.md` §5 has the whole rule, including the caveat that iOS gives each installed app its own cookie jar, so the shared-domain session above does not carry between them and each asks for sign-in once.

### Tenant resolution without a membership

**A constituent has no `tenant_memberships` row, and must never acquire one.** This is the load-bearing decision under everything else in this section.

`my_person_id()` and `current_tenant_id()` both resolve through `tenant_memberships`. A person who has never worked for the organization is not a member of it in any sense this schema means, so on those functions a constituent reads null and every policy written against them comes back empty. The alternative was to give them a membership row — but that table's own comment says it "grants access to an entire tenant's data", and it has exactly two roles, `member` and the time-boxed `support` grant reserved for platform staff. Adding a third, deliberately powerless one would mean re-auditing every predicate that today means "is a member": a large, quiet blast radius for what is really a reading question.

So **the tenant comes from the request host instead**, the same way it does for every other public-site read. `public_tenant_id()` resolves it, `my_public_person_id()` (#1161) is the read-only counterpart of `my_person_id()` for that surface, and `public_module_enabled()` (#1163) is the counterpart of `tenant_module_enabled()`.

The decision has a second effect that is the reason it is pinned by a test rather than left as a reading of the code. `resolve_current_person_id()` and `ensure_current_person()` both link an account to a directory record **by email match, with no review** — they were written for a world where the only way to hold a session was an administrator's invite. They are safe today only because both return null when `current_tenant_id()` is null. If a constituent ever acquired a membership, those two functions would become an auto-link path around the claim, and `person_claims` would become decorative.

### One gate, one place

`my_constituent_person_id(module_key)` (#1165) is the predicate every `/my` read and write opens with: the caller's own `people.id` in the tenant the request host resolves to, and only when that tenant has the constituent area and, where the action belongs to one, the owning module. `my_history_person_id()` and `my_contact_person_id()` are one-line delegations to it. A null `module_key` means "the constituent area itself and nothing further", which is what contact details, notification preferences and the claim flow need — a person's own address belongs to no feature module.

**The scoping is in the function, never in the caller.** Not one of these takes a person, an account or a tenant as an argument, so there is no parameter to tamper with: the row set is decided entirely by `auth.uid()` and the request host. The integration test signs in twice to prove it.

The module check is in the database rather than only on the page because a page is not what stops a request (#902): every one of these RPCs is reachable with curl by anyone holding a session, so "the tenant turned Finance off" has to mean the rows do not come back, not that the section is hidden. **Null is the answer to every failure** — no session, no link, area off, module off — and each section returns no rows for it. There is nothing to tell apart: a constituent whose tenant has just switched Inventory off is in the same position as one who has never been handed anything.

### Signing up, and claiming a record

An account and a `people` row are two different things, and **sign-up creates only the first**.

Sign-up is open: `/my/sign-in` offers the same two methods the portal does — Google OAuth and email/password — against the same accounts, and `signUp` is the first in the codebase, because until #1161 every account was created by an administrator's invite. It promises nothing about the resulting account's history, because the most it can honestly say is that the account exists. Its error handling is deliberately vague for one reason: the provider's own messages distinguish "already registered" from "weak password", and the first of those answers "does this address have an account here?" for anyone who asks. The same wording covers a fresh sign-up and an address that already had an account, which is what stops it being an address-enumeration oracle.

Linking that account to a directory record is a **reviewed claim** (#1162), and an approved claim is the only path that writes `people.auth_user_id` for a constituent. Staff never see this flow — their row already carries `auth_user_id`, written by `ensure_current_person()` on their first portal sign-in.

**The claimant learns nothing.** `submit_person_claim()` returns nothing at all: no id, no count, no hint. The page says the same sentence whether the address matched a donor, matched nobody, the account already had a claim open, or the account was already linked. That silence is the security property — "we already have a record for this address" answers "is this person a donor here?" for anyone who asks, and a response that varied by name would turn the matcher into a search box over the directory. The one thing the function will say out loud is that the caller is going too fast: it is rate-limited (5 per 15 minutes by IP, the shared `check_rate_limit()` of [§7.9](../technical-spec.md#79-rate-limit-public-write-endpoints)), and a statement about the caller's own behaviour is safe where every other branch is silence.

What the claimant types — name, and optionally email, phone, Instagram handle and a note — is stored **as typed, on the claim, and never normalized into `people`**. It is evidence for a reviewer, and a claim that is refused must leave nothing behind in the directory.

### A public write is a claim source

A registration is the moment somebody has told the organization who they are, so the confirmation that follows one offers to keep it (#1258). The offer sits in the **post-write follow-up slot**, after the write and authorized by the returned record id, and it is **never a gate**: the registration is already saved, the confirmation email is already on its way, and skipping is one click that changes nothing.

A **public gear request** is the same moment and carries the same offer (#1359), in its cart receipt. Both render one component and one pair of sentences, which is what stops the two surfaces promising different things about the same situation; only the noun changes.

Three readers, three offers, decided on the server because only the server sees the module and the session:

| Who                             | What they are offered                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Signed out                      | An account: `/my/sign-in` carrying `/my/registration/[registrationId]` as its `next`, and the claim made there |
| Signed in, no record linked yet | One button, nothing to retype — the registration row already holds what they typed                             |
| Signed in and linked            | Nothing. It is already on their record, and the confirmation already links to `/my`                            |

The hand-off is a **route** rather than a query parameter because `safeMyDestination()` only carries a `next` that is a path inside `/my`, and the record has to survive whatever making an account costs — a password, a Google round trip, or an email confirmation opened tomorrow on another device. Those pages read nothing about the record: an id that names nothing, an id from another tenant and an id belonging to somebody else all render the same thing, because a page that said "we could not find that registration" would be a way to test ids.

`submit_claim_from_registration()` is the claimant's half again, with the evidence taken from the registration instead of a form. It copies `stated_name`, `stated_email`, `stated_phone` and `stated_instagram_handle` **as typed** off `event_registrations` and notes which event they came from, so the reviewer gets a claim whose tier-1 candidate is normally the record the registration attached to — `person_claim_candidates()` needs no change. **`claimed_person_id` stays null**: the registration knows which record it matched, but the claimant never picked it from anything they were shown, and a claim that named a record would be the application deciding on self-asserted evidence.

`submit_claim_from_gear_request()` is the same function again with a gear request as its evidence — with one difference, and it is in what the reviewer reads rather than in what the claimant is told. `gear_requests` stores no typed contact fields: #1032 kept that header to facts about the submission, and the requester is a foreign key. So the evidence is read off the `people` row the request attached to. That row was matched **on the typed address**, so `stated_email` is the address that was typed either way, and for a requester the directory had never seen the whole row is what they typed; where it differs is a returning requester whose name or phone a staffer has since corrected, and there the reviewer sees the better version of a record they can already read. `claimed_person_id` stays null here too, so the claim still never names the record.

Everything that makes the form's half safe is kept, because it is the same half. It returns nothing in every branch — matched, unmatched, already linked, a claim already open, module off, no such registration — it is rate-limited (5 per 15 minutes by IP) as the one thing it will say out loud, it carries the module gate in the database rather than only on the page, and it never writes `people.auth_user_id`. The demo tenant is covered by that same gate, permanently (#1177).

The copy promises only what happens. It reads identically whether the registration matched a record or nobody, it never says "we found you", and the most it offers is that somebody will check: _"You'll be able to see this on your account once we've confirmed who you are."_

**A verified email does not auto-approve.** GoTrue has confirmed the address and `people.email` matching it is the same tier-1 evidence a reviewer acts on — but a registration is self-asserted, one wrong approval hands somebody another person's giving history, and the queue is small. An approved claim remains the only path that writes `people.auth_user_id`. Auto-approval is a separate decision, to be taken with reviewer volume in hand.

**Order in the slot, with the rider profile.** Two follow-ups want the same place, and the order is decided rather than incidental: the account offer first, because it is the one with a deadline — the reader is about to close the sheet and the registration it carries is claimable for a week — then the rider profile ([§5.9](people.md#59-people-directory)), which keeps as long as the person does. Both are skippable in one click and neither is a gate. If the two ever stop reading calmly as two, the rider profile moves into the confirmation email rather than the sheet becoming a three-step wizard.

### Reviewing a claim

The staff side is `/portal/people/claims`, gated on the `constituent_claims` resource — a permission distinct from managing the directory, because deciding whether an account gets to read one person's giving and volunteering history is a different question from whether a staffer may correct that person's phone number. It ships as `admin`-only, the conservative default this schema uses for a new resource with no obvious fit among the existing roles, and an administrator can widen it from Administration › Permissions. A pending claim also raises an attention item on the portal home and a `person_claim` notification kind, both of which carry the module gate with them, so on a tenant without the area they are silent for everyone.

`person_claim_candidates()` proposes, and never decides. It returns ranked candidates in three tiers, strongest first, with each candidate reported at the best tier it reaches:

1. **`email`** — the claimant's _verified_ address (`auth.users.email_confirmed_at`, not the address typed into the form, which is an assertion about somebody else's mailbox) against `people.email`.
2. **`instagram`** — often the only identifier on a record created from an event registration. Handles are compared through `normalize_instagram_handle()`, which takes a profile URL, a leading `@` or a bare handle and returns null when nothing usable is left.
3. **`name`** — `pg_trgm` similarity at or above 0.45, and only when neither identifier hit. Always presented as possible, never preselected.

Anonymous records are excluded, an already-linked candidate is flagged rather than hidden, and the whole thing is capped at 25. It is one function for all three tiers so the tiers cannot drift apart, and it takes a **claim id rather than free text**: a callable "does this name exist here?" is an enumeration oracle over the directory whatever its access rules say, so no such entry point exists. It is definer and gated on `constituent_claims:view` for the same reason the claimant is told nothing.

`review_person_claim()` is the decision, in one transaction so a claim cannot be marked approved against a link that did not happen. Approving against an existing record writes that record's `auth_user_id`; **approving against no record creates one**, which is the right answer for a genuine newcomer and is why `claimed_person_id` is nullable — refusing to approve without a match would push staff into attaching people to near-miss records to get them through. One account is one person per tenant and one person is one account: `people_auth_user_id_key` enforces the first, and an explicit check enforces the second so that a second claim against the same record fails with a sentence about the person rather than a constraint name. Rejecting records the decision and leaves the directory untouched, and a rejected claim does not block the person trying again after they have spoken to somebody.

Every claim is **audited**, because linking an account to a person's giving history is a decision someone made. Everything the claimant typed is redacted in the snapshot — not just their prose, since an address and a handle are exactly as personal as the note beside them — so what the trail keeps is that somebody asked, when, who decided, and which record it ended on ([§5.11](audit.md#511-audit-and-history)).

### Reading your own history

`/my` shows four sections (#1163), each a `security definer` function scoped to the caller's own row, each gated on the module that owns it as well as on the constituent area:

| Section      | Function                 | Module gate            | What it shows                                                                                                                      |
| ------------ | ------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Events       | `my_event_history()`     | `events`               | Registrations, and whether each was checked in; the event's own `timezone` travels with it                                         |
| Volunteering | `my_volunteer_history()` | `volunteers`           | Applications, event sign-ups, confirmed ledger hours, and the person's own pending and declined submissions as `hours_unconfirmed` |
| Giving       | `my_giving_history()`    | `finance`, `inventory` | Monetary donations and in-kind donations, from their respective modules                                                            |
| Gear         | `my_gear_history()`      | `inventory`            | Requests and handovers, discriminated by `kind` and never merged                                                                   |

`/portal/people/[id]` already assembles all of this for staff. **What is new is not the query but the access path:** a constituent holds no permissions, no role and no tenant membership, and every underlying table is RLS-gated on a `view` or `manage` permission they will never have. Reading your own giving through `finance:view` is not a thing that can be arranged.

It is deliberately **not** built by relaxing the portal's policies. Two readers, two paths, one set of underlying tables — widening `inventory:view` so that a recipient could read their own handovers would hand every recipient the whole gear library.

What each section returns is **narrower than the staff shape on purpose**: no internal notes, no approver, no reason codes, nothing the retention purge exists to clear. A person needs enough to recognize their own record, not every column a staffer sees. Gear is the clearest case — requests and handovers stay separate rows, because an open request must not read as a receipt; `received` counts `distributed` movements only, since a `reserved` one is the library's own bookkeeping rather than something that happened to the person; and the requester's own note comes back while `inventory_movements.reason` and `.notes` do not, because staff write those about the movement.

An event is displayed in its own timezone on the public site, per the date/time rules in [§6.1](../technical-spec.md#61-dates-and-times).

### Keeping your own record current

Specified in full in [§5.9](people.md#59-people-directory) — the fourteen-column allowlist that _is_ the argument list of `set_my_contact_details()`, the separation of `people.email` from the auth account's address, the confirmed email-change mechanism, and the audit row every self-edit writes. Not repeated here.

### Acting from your account

Also [§5.9](people.md#59-people-directory): registering for an event as yourself (`register_myself_for_event()`) and choosing which emails you get (`my_notification_preferences()` / `set_my_notification_preference()`). The property they share is that **the caller never says who they are**: the person comes from `auth.uid()` and the request host, so no argument can steer a write onto someone else's record, and neither path can mint a `people` row.

Logging your own volunteer hours was a third (`log_my_volunteer_hours()`, provisional until confirmed — [§5.17](volunteers.md#517-volunteer-management)) until #1303 removed `/my/hours` as a duplicate of `/portal/volunteers/participation`. The function and its two pickers (`my_loggable_events()`, `my_volunteer_role_types()`) are still defined and still granted to `authenticated`; nothing in the application calls them.

### The tenant's words

`/my` heads a section with what the organization calls its volunteers, and there is no session-resolved tenant to read the words through. `public_person_role_labels` is the public-site sibling of `tenant_person_role_labels` ([§5.9](people.md#59-people-directory)), over the one `people.role_labels` key — **one enumerated key rather than a prefix**, so it adds nothing to the reserved public namespaces of [§7.4](../technical-spec.md#74-no-sensitive-data-for-the-anonymous-role) and no future private setting can land under it by accident. It is granted to `authenticated` only, unlike the rest of the `public_*` family, because nothing signed out names a person role today.

### The demo tenant

The demo tenant does not offer constituent accounts, permanently and by decision (#1177). The area's value is a person's accumulated history and a tenant rebuilt from seed every night has none — and, more to the point, the nightly reset cannot clear what open sign-up creates: an `auth.users` row belongs to no tenant, so `delete_tenant()` leaves it behind on an Auth instance shared with every paying tenant. `docs/tenants.md` records the decision, the reasoning and the constraints on the sweep that would have to be built before the module could ever be turned on there.

### How long any of it is kept

Three clocks, added by #1296 and transcribed from the board record that amends the 2026-09-02 one, all in `dry_run` until the board rules on them:

- **A claim** is deleted 2 years after it is decided, or 2 years after it was sent where nobody decided — `updated_at` carries both, since `set_updated_at` maintains it and it defaults to `created_at`. Nothing is left behind: every stated field and both notes are in `audited_tables.redacted_columns`, so the snapshot never held them, and what the audit trail keeps is the decision.
- **A self-logged hour entry** is deleted 2 years after its last change, but only where `status <> 'confirmed'`. A confirmed entry is the record that the volunteer entered those hours themselves rather than a staffer entering them for them, and it stays with the `volunteer_hours` row it produced.
- **An account** is deleted 2 years after its last sign-in, and only where it is attached to nothing at all — no directory record, no role, no membership, no claim, and no remaining foreign key to `auth.users` outside the `auth` schema. An account matched to a record follows the record instead. This is the one rule in the purge with no tenant to scope to, which changes how it is enforced; `docs/tenants.md` has the mechanics.

`portal_accounts` was reworded in the same issue. Its clock starts when a role ends, and a constituent holds no role by design, so the published entry promised a member of the public that their account is kept indefinitely. It now names the population it is about, and `constituent_accounts` answers for the other one. Both entries are published only where the tenant has the area (#1291).

### Out of scope, and still open

- **Cancelling a registration.** `event_registrations` has no cancelled state and no delete path anywhere in the application, staff included, so the only thing a button could do is destroy the row — taking the attendance figure and any assigned discount code with it. Changing your mind is a message to the organization until there is a model for it.
- **Photo upload, editing anything about another person** (a household, a dependent), and **deleting your own record**, which is a retention/GDPR question interacting with `docs/tenants.md`'s export-and-deletion section.
- **Withdrawing a claim** is the claimant's only edit and has no screen yet; the policy exists.

## 6. Data model — Constituent accounts

- `person_claims`: **implemented** (issue #1162) — a request from a website account to be linked to a person in the directory. `tenant_id`; `auth_user_id` (FK → `auth.users`, deliberately _not_ a `people` foreign key, since which person this is is the open question); `claimed_person_id` (nullable, composite tenant foreign key to `people`, `on delete set null` — null is ordinary and means "I am new here", or that nothing was proposed, which the claimant cannot tell apart); the stated fields (`stated_name` required and non-blank, `stated_email`, `stated_phone`, `stated_instagram_handle` constrained to `^[A-Za-z0-9._]{1,30}$`, `note`); `status` (`pending`/`approved`/`rejected`/`withdrawn`); the reviewer triple (`reviewed_by`, `reviewed_at`, `review_note`) with a check constraint that a decided claim names its author and its moment; and the usual `created_at`/`updated_at`/`updated_by`. A partial unique index keeps **one pending claim per account per tenant** (the shape `pending_role_grants` uses) — partial, so a rejected claim does not block a second attempt. Audited, with every stated field and both notes redacted.
  - **Policies.** The claimant reads, opens and withdraws their own rows, pinned to `auth.uid()` **and** `public_tenant_id()`: `auth.uid()` alone would already keep one claimant out of another's rows, but one account may hold a claim in two tenants, and without the tenant half the organization whose site they are on would serve both. Withdrawing is the claimant's only update, and only from `pending` to `withdrawn`. Reviewers read through `current_tenant_id()` plus `constituent_claims:view`. Everything a reviewer _writes_ goes through the definer RPC, which is not bound by these policies.
- `modules` / `plan_modules` / `tenant_modules`: the `constituent_accounts` row (sort order 140, `default_enabled = false`, not core) and its three plan rows, all `false`. Catalogued in [§6, "Multi-tenancy"](multi-tenancy.md#6-data-model--multi-tenancy).
- `resources` / `role_permissions`: the `constituent_claims` resource in the People section, owned by the `constituent_accounts` module, seeded `manage` for `admin` and `none` for every other seeded role. Catalogued in [§6, "Identity and access"](access-control.md#6-data-model--identity-and-access).
- `people.auth_user_id`: unique on `(tenant_id, auth_user_id)`. For a constituent it is written by exactly one thing, `review_person_claim()`.
- `volunteer_hour_submissions` is in [§6, "Volunteers"](volunteers.md#6-data-model--volunteers); the address columns added to `people` are in [§5.9](people.md#59-people-directory).

**Functions and views.** `my_constituent_person_id(text)` and its two delegations `my_history_person_id(text)` / `my_contact_person_id()`; `my_public_person_id()`; `public_module_enabled(text)`; the four readers `my_event_history()`, `my_volunteer_history()`, `my_giving_history()`, `my_gear_history()`; the claim trio `submit_person_claim()`, `person_claim_candidates()`, `review_person_claim()` plus `normalize_instagram_handle()`; and the `public_person_role_labels` view. Every one of them is `security definer`, and every one is revoked from `public` and `anon` except `public_module_enabled()`, which answers an entitlement question the anonymous public site already asks. `pg_trgm` arrives with the matcher, its first caller in this schema.
