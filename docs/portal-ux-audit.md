# Operations portal UX audit

Findings-only audit of the whole operations portal — every route under `src/app/portal`, plus the sign-in surfaces. Companion to `docs/public-site-ux-audit.md`, which covered the public site. Run against `development` on 2026-09-02.

**Method and its limits.** This is a source-level review of all 62 `page.tsx` files, the portal shell, the shared primitives they compose, and the cross-cutting helpers (`src/lib/auth/permissions.ts`, `src/components/ui/*`, `src/components/portal/*`). It was **not** a live browser or screen-reader pass — no dev server, no Supabase stack, no measured screenshots. Where a finding depends on runtime behaviour I say what the code does and what that implies, rather than claiming an observed result. Several findings below are worth confirming in a browser before they're sized.

This audit deliberately targets what automated scanning can't see. `bun run test:a11y` reports 3 violations across 68 routes (`docs/a11y-scan-findings.md`, all one `color-contrast` rule, tracked in [#436](https://github.com/rcruzmcd/coven/issues/436)), so almost everything below is information architecture, task flow, affordance, resilience, and design-system consistency that axe passes by.

**Shape of the portal under audit** — 55 reachable routes, 14 top-level sidebar sections (5 of them with 4–10 sub-items), 105 `<Table>` instances, ~40 create/edit dialogs, 5 roles.

Nothing here is fixed. Every finding is recorded for triage.

---

## Summary

| #   | Finding                                                                                       | Area            | Severity |
| --- | --------------------------------------------------------------------------------------------- | --------------- | -------- |
| 1   | No global search or command palette across 55 routes                                          | IA              | Serious  |
| 2   | Record search is buried inside the Filters sheet on every directory page                      | Task flow       | Serious  |
| 3   | Section index routes redirect to a hardcoded first child, ignoring permissions                | Navigation      | Serious  |
| 4   | Permission denial is a silent redirect to the dashboard with no explanation                   | Feedback        | Serious  |
| 5   | No `error.tsx` anywhere in the portal                                                         | Resilience      | Serious  |
| 6   | No portal `not-found.tsx`; all 8 detail routes `notFound()` into an unstyled default 404      | Resilience      | Serious  |
| 7   | No success feedback anywhere — the portal has no toast system                                 | Feedback        | Serious  |
| 8   | 14 delete affordances fire on a single unconfirmed click                                      | Destructive     | Serious  |
| 9   | Role revoke is a ~16px `X` in a badge: one click, no confirm, no undo                         | Destructive     | Serious  |
| 10  | The `no_access` login state offers no sign-out, trapping wrong-account users                  | Auth            | Serious  |
| 11  | Zero responsive column handling across 105 tables (up to 13 columns wide)                     | Mobile          | Serious  |
| 12  | The portal shell awaits 7 summary queries sequentially before rendering, on every navigation  | Performance     | Serious  |
| 13  | Sign-in always lands on `/portal/home`; the deep link that forced the redirect is dropped     | Auth            | Moderate |
| 14  | No breadcrumbs; one-level back links; duplicate page titles ("Roles" ×2, "Donations" ×2)      | IA              | Moderate |
| 15  | Only 15 of 62 pages set a document title                                                      | IA              | Moderate |
| 16  | Applied filters are invisible once the sheet closes; "Clear" is inside the sheet              | Task flow       | Moderate |
| 17  | Filtering is a native GET submit — a full document navigation per filter change               | Task flow       | Moderate |
| 18  | Sortable headers on 6 of ~50 tables, via two different implementations, none with `aria-sort` | Consistency     | Moderate |
| 19  | Pagination on 10 of ~50 lists; several growth-prone lists are unbounded                       | Performance     | Moderate |
| 20  | Create dialogs have no unsaved-changes guard (edit sheets do); no `beforeunload` anywhere     | Data loss       | Moderate |
| 21  | Row actions are 28px ghost icon buttons — no affordance without hover, tight on touch         | Affordance      | Moderate |
| 22  | The dashboard is ~25 undifferentiated stat rows, only one of which is clickable               | Dashboard       | Moderate |
| 23  | The notification bell disappears entirely at zero; every count uses the red badge             | Dashboard       | Moderate |
| 24  | 15 modules each define a private `Pill`; none use the shared `Badge`                          | Design system   | Moderate |
| 25  | The status palette has no success or warning token — approved/paid/completed are all purple   | Design system   | Moderate |
| 26  | Four top-level nav items are gated by one permission and describe one directory               | IA              | Moderate |
| 27  | The help button is on all ~55 routes but only 25 have an entry                                | Help            | Moderate |
| 28  | No skip link; roughly 25–40 tab stops before main content on every portal page (fixed)        | Keyboard        | Moderate |
| 29  | Nav group toggles have no `aria-expanded`, and change behaviour when the sidebar is collapsed | Semantics       | Moderate |
| 30  | Tab state on event and meeting detail is React state, not URL                                 | Navigation      | Moderate |
| 31  | Permission resolution (2 RPCs) runs uncached in every layout and Server Action                | Performance     | Moderate |
| 32  | Four list routes have no `loading.tsx`                                                        | Perceived speed | Moderate |
| 33  | Login has no "Forgot password?", no `h1`, and no route back to the public site                | Auth            | Moderate |
| 34  | The event "During" phase stacks 6 cards and merges every card's actions into one toolbar      | Density         | Moderate |
| 35  | Nearly every empty state states the absence without offering the next step                    | Onboarding      | Minor    |
| 36  | Pagination never shows a record count, page size, or jump-to-page                             | Task flow       | Minor    |
| 37  | Page titles mix Title Case and sentence case                                                  | Copy            | Minor    |
| 38  | 82 ad-hoc `Intl` formatters across 69 files; `src/lib/format.ts` covers only names            | Design system   | Minor    |
| 39  | The zero-permission dashboard promises a feature instead of explaining the state              | Copy            | Minor    |
| 40  | `activeSectionFor` falls back to `overview`, so `/portal/account` highlights Dashboard        | Navigation      | Minor    |

---

## Navigation and information architecture

### 1. No global search or command palette — Serious

The portal has 55 routes and no way to jump to one by name, and no way to find a record without first knowing which of the 14 sections owns it. There is no `cmdk`/`Command` primitive in `src/components/ui/`, no keyboard shortcut handler anywhere in `src/app/portal`, and no cross-entity search endpoint.

For an operator who knows a donor's name but not whether they live under People, Donors, or Attendees — see finding 26 — the only route is: guess a section, open Filters, type, submit. In a tool people use daily this is the single largest recurring tax.

### 2. Record search is buried inside the Filters sheet — Serious

On People, Donors, Sponsors, Attendees, Inventory items, and Finance donations/expenses/reimbursements, the search input lives inside a right-hand `FiltersSheet` (`src/components/filters-sheet.tsx`). Finding one person is: click **Filters** → wait for the sheet → type → click **Filter** → full page navigation → the sheet is gone.

`src/app/portal/(app)/people/page.tsx:120–180` is the canonical shape. Search is the primary action on a directory page and is currently three interactions deep behind a control labelled with a secondary concept.

### 3. Section index routes redirect to a hardcoded first child — Serious

`/portal/finance`, `/portal/inventory`, `/portal/governance`, `/portal/volunteers`, and `/portal/administration` are all one-line `redirect()` pages pointing at a fixed child:

```
/portal/finance     -> /portal/finance/expenses
/portal/inventory   -> /portal/inventory/items
/portal/governance  -> /portal/governance/board-members
```

`PortalNav` is smarter than this: it recomputes each section's `href` as the first sub-item the user can actually reach (`portal-nav.tsx`, `visibleItems`). The redirect pages don't. A board member holding `finance_reports:view` but not `finance:manage` who hits `/portal/finance` — from a bookmark, a shared link, or typing it — passes `finance/layout.tsx` (which accepts `finance_reports:view`), then fails `finance/expenses/layout.tsx` (which requires `finance:manage` or `finance_approvals:manage`) and is bounced to the dashboard. Finance is reachable for them from the sidebar and unreachable from its own URL.

### 4. Permission denial is a silent redirect — Serious

`requireAnyPermission` in `src/lib/auth/permissions.ts:60` does `redirect("/portal/home")` and nothing else. No message, no query parameter, no record that anything was refused.

Every deep link a colleague shares to a section the recipient can't open therefore behaves as "that link is broken" — the browser lands on the dashboard with no explanation. Combined with finding 3, some of those denials are the app's own doing rather than a genuine entitlement gap. The login page already has the right pattern (`?error=no_access`, rendered by `login-form.tsx:13`); the in-app denial path has no equivalent.

### 14. No breadcrumbs, and two pairs of pages share a title — Moderate

There is no `Breadcrumb` component in the codebase. Detail pages use an ad-hoc single-level back link — all 8 do it consistently, which is good — but a three-level route like `/portal/administration/access-management/assets/[assetId]` gets one hop back and no trail.

Two page titles are ambiguous without a trail: **Roles** is both `/portal/volunteers/roles` and `/portal/administration/roles`; **Donations** is both `/portal/finance/donations` and `/portal/inventory/donations`. The `h1` is identical in each pair, and — see finding 15 — neither pair sets a document title, so the browser tab can't disambiguate them either.

### 15. Only 15 of 62 pages set a document title — Moderate

`src/app/portal/layout.tsx` defines the template `%s | Chatter Snow Portal`, but only 15 pages export `metadata`. The other 47 fall back to the bare default. Every detail route — event, person, meeting, donation, calendar item, asset — is in the fallback set, which is exactly where a tab title carries the most information. Ops work is multi-tab work; a row of tabs all reading "Chatter Snow Portal" is unusable.

### 26. People, Donors, Sponsors, and Attendees are four top-level items for one directory — Moderate

All four are gated on the same check, `{ resource: "people", level: "view" }` (`portal-nav.tsx`), and all four are views over the shared `people` table. They consume four of the sidebar's 14 top-level slots and force the operator to know which lens a person is currently filed under before searching. The People page already has a `role` filter with the same distinctions in it.

### 40. Unmatched routes highlight Dashboard — Minor

`activeSectionFor` (`portal-nav.tsx`) returns `"overview"` for any path it doesn't match. `/portal/account` matches nothing, so the sidebar shows Dashboard as the active section while the user is on their account page.

### 37. Page titles mix two casing conventions — Minor

Title Case: Board Members, Nonprofit Status, System Settings, Audit Log, Conflict of Interest, Annual Requirements, Access Management, Inventory Reports, Financial Reports. Sentence case: Work queue, Brief templates, Program suggestions, My account. And one mixed: Calendar Import. Sidebar labels have the same split.

---

## Resilience and feedback

### 5. No `error.tsx` anywhere in the portal — Serious

`find src/app/portal -name error.tsx` returns nothing, and there is no root `error.tsx` or `global-error.tsx` either. Every portal page is a server component running several Supabase queries; any one that throws — a dropped connection, an RLS change, a malformed parameter — escapes to Next's built-in boundary. In production that renders the bare "Application error: a server-side exception has occurred" page with a digest string: no sidebar, no branding, no retry, no way back into the portal except editing the URL.

For a data-heavy internal tool this is the difference between "that page is having a moment" and "the portal is down."

### 6. No portal `not-found.tsx` — Serious

All seven detail routes call `notFound()`:

```
events/[eventId]                          calendar/[itemId]
people/[id]                               inventory/donations/[donationId]
governance/meetings/[meetingId]           administration/access-management/assets/[assetId]
inventory/distribution/[movementId]
```

The only `not-found.tsx` in the repo is `src/app/(public)/not-found.tsx`, which is scoped to the public route group. So a stale bookmark, a deleted record, or a mistyped id in the portal drops the operator onto Next's default unstyled 404 — outside the shell, with no link back.

### 7. No success feedback anywhere — Serious

The portal has no toast system: no `sonner`, no `useToast`, no equivalent. The universal save pattern (`finance/expenses/new-expense-dialog.tsx:91–105` is representative of roughly 40 dialogs) is:

```
if ("error" in result) { setError(result.error); return; }
setOpen(false);
router.refresh();
```

Errors are handled well — an `Alert` with `role="alert"`, so they're announced. Success is silent. On a list page the refreshed row is arguably its own confirmation, but the sidebar quick actions (`sidebar-quick-actions.tsx`) are available on _every_ page: recording a gear donation while sitting on the Governance section closes the dialog, refreshes a page that shows nothing about donations, and leaves no evidence the record was created. The predictable operator response is to do it again.

### 32. Four list routes have no `loading.tsx` — Moderate

53 of the 57 content routes have one. The gaps are `attendees`, `donors`, `sponsors`, and `people/[id]` — all server-rendered, all joined queries, and the first three all paginated and filterable, so every filter and page change is a navigation with no visible response until the new HTML arrives. <cc-memory filenames="loading-states-when-routes-become-dynamic.md">This is the same class of gap as the earlier lesson about accounting for loading and streaming behaviour whenever a route is server-rendered rather than static.</cc-memory>

### 39. The zero-permission dashboard promises a feature — Minor

`home/page.tsx:185` renders, for any user whose roles light up no dashboard section:

> "Your activity summary will appear here as volunteer participation tracking is added."

Volunteer participation tracking exists. The copy is a stale placeholder that reads as a roadmap promise where the user needs an explanation of their current access and who to ask about it.

---

## Authentication

### 10. The `no_access` state has no way out — Serious

`(app)/layout.tsx` sends a signed-in user with zero permissions to `/portal/login?error=no_access`, which renders: "Your account is signed in but hasn't been granted portal access yet. Contact an administrator."

The login page offers exactly two actions: **Continue with Google** and an email/password form. It has no sign-out control. A person signed into the wrong Google account — a personal address rather than their org one, the most likely way to land here — clicks Continue with Google, the cached session is reused, and they arrive back on the same screen. There is no visible loop exit short of clearing cookies or knowing to visit an unlinked sign-out route.

### 13. Sign-in discards the destination — Moderate

`(app)/layout.tsx` redirects unauthenticated users with `redirect("/portal/login")` — no `next` parameter — and both sign-in paths in `login-form.tsx` hardcode `/portal/home` (`router.replace("/portal/home")` and `next=/portal/home` in the OAuth `redirectTo`).

So every shared portal link — "look at this event", "here's the reimbursement" — lands a signed-out recipient on the dashboard with the original URL gone. The `next` plumbing already exists in `src/app/auth/callback/route.ts`; nothing sets it.

### 33. Login is missing password recovery, a heading, and a way home — Moderate

`src/app/portal/login/page.tsx` renders a logo image and the form. There is no `h1` — the page has no heading at all, which is why the only text a screen reader gets before the controls is the image's alt text. There is no "Forgot password?" link, even though password sign-in is offered and a `/portal/set-password` route exists; a locked-out volunteer's only recovery path is to email an administrator. And there is no link back to `chattersnow.org`.

---

## Destructive and risky actions

The confirmed-delete pattern in this codebase is genuinely good. `administration/access-management/delete-asset-button.tsx` names the record in the title, states the blast radius with a count ("It also removes 3 active permission grants recorded for it"), says it can't be undone, offers Cancel, and disables both buttons while pending. Findings 8 and 9 are about the places that don't follow it.

### 8. Fourteen delete affordances fire on one unconfirmed click — Serious

Files with a `Trash2` button and no `AlertDialog`:

```
events/sponsors-tab.tsx                   events/checklist-tab.tsx
events/discount-codes-tab.tsx             events/incidents-tab.tsx
events/volunteers/shifts.tsx              events/volunteers/signups.tsx
events/volunteers/hours.tsx               volunteers/participation/hours-table.tsx
governance/meetings/attendees-tab.tsx     governance/meetings/decisions-tab.tsx
governance/meetings/action-items-tab.tsx  governance/meetings/resolutions-tab.tsx
people/[id]/organizations-card.tsx
```

Each is a 28px ghost icon button in a table row wired straight to its delete action — `onClick={() => handleDelete(item.id)}` with nothing in between. Several destroy records with real consequences: a board decision, a meeting action item, logged volunteer hours (which feed grant reporting), an event sponsor. There is no undo anywhere in the portal, so a mis-tap in a dense row is permanent.

### 9. Role revoke is a one-click 16px target — Serious

`administration/users/users-table.tsx:184–205` renders each of a user's roles as a `Badge` with an inline `<button>` containing a `size-3` (12px) `X` and `p-0.5` (2px) padding — roughly a 16px hit area, below the 24px WCAG 2.2 SC 2.5.8 minimum. Clicking it calls `revokeRoleAction` immediately.

Two things make this stand out rather than merely being small. First, it's a security action taking effect instantly — the person loses portal access on their next request. Second, the same file already confirms lesser actions: deactivating a user goes through a `deactivateTarget` confirmation, and `pending-access-section.tsx` confirms revoking a _pending_ grant. Revoking a live role is the only one of the three that doesn't ask.

### 20. Create dialogs have no unsaved-changes guard — Moderate

Six edit surfaces do this properly — `edit-inventory-modal`, `edit-donation-sheet`, `edit-distribution-sheet`, `edit-bylaws-modal`, `edit-template-sheet`, `program-details-dialog`, `suggestion-rule-details-sheet` all compute an `isDirty` and intercept close with "You have unsaved changes… Leaving now will discard them."

No create dialog does. `new-expense-dialog.tsx` resets its form on _open_, so pressing Escape or clicking the backdrop halfway through a long expense — payer, event, amount, category, date, notes — discards it with no prompt. There is also no `beforeunload` handler anywhere in the app, so a browser refresh or back navigation loses in-progress work in _both_ create and edit surfaces.

---

## Tables and data density

### 11. No responsive column handling in 105 tables — Serious

`grep -c 'hidden sm:table-cell\|hidden md:table-cell\|md:hidden'` across `src/app/portal` returns **0**. Every table renders every column at every viewport, inside the `overflow-x-auto` container that `src/components/ui/table.tsx` provides.

Column counts run to 13 (`finance/reports`), 10 (`access-management/assets`), and 7 across a dozen more including `events/registrants-tab` and `administration/users`. There is also no sticky first column anywhere (`sticky left-0` appears nowhere), so scrolling right to reach the action buttons — which are always last — takes the row's identifying name off screen. On a 375px phone, minus 48px of `main` padding, a 7-column table shows roughly two columns at a time.

This matters most for the tasks that are inherently mobile: checking in registrants at an event, logging volunteer hours on site, recording a gear distribution from the van. Those are the portal's field workflows and they run through its widest tables.

### 21. Row actions are hover-dependent 28px ghost buttons — Moderate

`variant="ghost"` appears 185 times. Ghost icon buttons at `size="icon-sm"` (28px) are the standard row action across the portal. They have no border or fill until hovered, which on a touch device means no affordance at all — the operator sees a column of grey glyphs and has to infer which are interactive. 28px clears WCAG 2.2 AA's 24px floor but sits well under a comfortable touch target, and in these tables the destructive one sits immediately beside the edit one.

### 18. Sorting exists on 6 tables, two ways, with no announced state — Moderate

`SortHeaderLink` (URL-driven, server-side, survives reload and sharing) is used by 6 tables: inventory items, finance donations/expenses/reimbursements, audit log, events. A second, unrelated implementation using local `useState` appears in `governance/meetings/meetings-table.tsx` and `finance/revenue/revenue-table.tsx` — same visual affordance, different semantics, lost on navigation.

The other ~44 tables have inert headers. People, Donors, Sponsors, Attendees, Communications, and every governance table cannot be sorted at all. Users generalise from the tables that do sort and find dead headers on the ones that don't.

`aria-sort` appears zero times in the codebase, so no sorted table announces its state.

### 19. Pagination on 10 of ~50 lists — Moderate

`Pagination` is used by attendees, donors, sponsors, people, inventory items, inventory donations, finance donations/expenses/reimbursements, and the audit log. Everything else renders its full result set. Among the unbounded lists are several that only grow:

- **Communications** — fed by the public contact form, with client-side search over the whole set.
- **Calendar** items, **Governance meetings**, **Resolutions**, **Finance revenue**.

Each of these ships the entire table to the browser on every visit and will degrade silently rather than at a visible threshold.

### 16. Applied filters are invisible once the sheet closes — Moderate

After filtering, the page shows a **Filters** button with a count badge and nothing else. There is no chip row naming the active filters, and the **Clear** control lives inside the sheet, so removing a filter means reopening the sheet to find out what's on.

The empty state does handle this well — `"No people match your filters."` versus `"No people added yet."` — but a _partially_ filtered result set, which is the common case, gives no signal at all. An operator returning to a tab, or opening a filtered URL someone shared, sees an incomplete table with no visible reason.

### 17. Filtering is a full document navigation — Moderate

The filter forms are `<form method="get">` with a native submit (`src/components/filter-submit-button.tsx` exists specifically because "native GET submissions are full document navigations with no React pending state"). Each filter change therefore re-runs the entire portal layout — see finding 12 — plus the section layout's permission checks, and loses scroll position. There is no debounced or as-you-type filtering anywhere.

### 36. Pagination shows a page number but never a count — Minor

`src/components/ui/pagination.tsx` renders "Page 3 of 12" with Previous/Next. The total row count is already fetched on every one of these pages — it's what computes `totalPages` — but never displayed. There's no page-size control and no jump-to-page, so reaching page 11 of 12 takes ten clicks and ten navigations.

### 35. Empty states name the absence but not the next step — Minor

The copy is impressively consistent — around 45 variations of "No X yet." — but almost all are a bare muted `<p>` with no icon and no call to action. Only two point anywhere:

> "No assets found. Add the first one to start tracking access."
> "No services yet. Add one before creating assets that belong to it."

For a nonprofit standing this portal up, nearly every page starts empty. Forty-odd screens that state a negative and stop is the first-run experience.

---

## Dashboard and attention

### 22. The dashboard is a wall of equal-weight numbers — Moderate

`home/page.tsx` renders "Upcoming" (5 stat rows) and "Financial" (6 stat rows) plus inventory, organization, and access-management cards — roughly 25 label/value/caption rows, all typographically identical. There is no visual hierarchy, no trend, no chart, and no sense of what changed since yesterday.

Critically, **only one row is clickable**: "Outstanding tasks" carries an `href`. Cash position, Registrations, Volunteers, Partners, Expenses, Revenue, Outstanding reimbursements, Event budgets are all dead ends. Seeing "$4,210 outstanding reimbursements" and wanting the list means navigating to Finance → Reimbursements and reconstructing the filter that produced the number. A dashboard figure that can't be opened is a figure the operator has to re-derive.

The "Happening now" card at the top is the exception and the right model — live events with their in-context actions.

### 23. The bell vanishes at zero, and every count is red — Moderate

`notifications-menu.tsx:19` returns `null` when there are no items. The control disappears from the header rather than showing a zero state. Users build spatial memory for header controls; a bell that is sometimes absent can't be used to answer "am I clear?", only "is something wrong?".

Every count also renders as `Badge variant="destructive"` — the same red for a pending expense approval, an unread contact message, and a content-calendar coverage reminder. There is no severity distinction, and the `destructive` token is the one still carrying an unresolved contrast finding ([#436](https://github.com/rcruzmcd/coven/issues/436)).

### 27. Help is offered everywhere and written for half the routes — Moderate

`HelpButton` is in the header on all ~55 routes and resolves content by longest-prefix match, falling back to the generic `/portal` entry. `help-content.tsx` registers 25 keys.

The gaps include the most procedurally complex pages in the portal. `/portal/finance/expenses` and `/portal/finance/reimbursements` — where approval thresholds from System Settings decide what needs a second signature — have no entry, because `/portal/finance/reports` and `/portal/finance/revenue` are registered but `/portal/finance` is not. Eight of the ten governance pages, all volunteer roles, inventory items, programs, calendar templates, and the account page are likewise uncovered. The affordance is identical on covered and uncovered routes, so the operator learns it's unreliable and stops opening it.

---

## Design system consistency

The portal is strong here in several respects worth stating: no hardcoded palette colours anywhere (`text-red-500` and friends: zero hits), 53 of 54 `h1`s share one class string, `Alert` carries `role="alert"`, and the shadcn `Sidebar` provides `role="navigation"` with proper `ul`/`li` structure. The findings below are the exceptions.

### 24. Fifteen modules each define a private `Pill` — Moderate

There are 17 `*-badges.tsx` files. Fifteen define their own local `function Pill(...)`; **none** import the shared `Badge` from `src/components/ui/badge.tsx`. The geometry diverges: `Badge` is `h-5 rounded-4xl px-2 py-0.5 text-xs`, while the copies are `rounded-full px-2 py-0.5 text-xs` with no fixed height, so pills and badges sitting in the same row don't line up.

### 25. There is no success or warning colour — Moderate

`globals.css` defines `--warning: #b45309` and no `--success` at all — and `--warning` is referenced by exactly nothing: no component, no status map, no badge variant. `badgeVariants` offers `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`. The status maps in every module consequently work from four tints, three of which are purple:

```
submitted  bg-muted                 (grey)
approved   bg-primary/10            (purple)
paid       bg-secondary             (light purple)
rejected   bg-destructive/10        (red)
```

Approved and Paid — the two states a finance reviewer most needs to tell apart at a glance — are adjacent purples. Nothing in the portal is ever green, and nothing is ever amber, so an overdue annual requirement and a scheduled one differ only by label. The vocabulary is at least applied consistently across modules (muted = inactive, primary = in flight, secondary = terminal, destructive = failed), which makes this a token gap rather than a drift problem.

Also, `Pill` renders `{status}` under a `capitalize` class — the raw column value. Where a module supplies a label map (`REPORT_STATUS_LABELS` in `event-badges.tsx`) that's fine; where it doesn't, any future multi-word enum will surface as `Not_started`.

### 38. 82 date and currency formatters, none shared — Minor

`new Intl.DateTimeFormat` / `new Intl.NumberFormat` is constructed 82 times across 69 portal files. `src/lib/format.ts` exists but only covers name and role display.

The formats mostly agree today (65 use `dateStyle: "medium"`), and the `timeZone: "UTC"` split — 27 pinned, 40 not — appears deliberate rather than buggy: the pinned ones handle `date` columns, the unpinned ones `timestamptz`, and the spot checks I ran (`grants.application_deadline`, `board_members.term_start`, `meetings.meeting_date`) were each correct. The finding is the absence of a seam. Choosing right requires knowing the column type at every call site, and choosing wrong produces an off-by-one-day date that is invisible in a UTC development environment and wrong for every user west of it.

---

## Keyboard and semantics

### 28. No skip link, and a very long tab path to content — Moderate

There is no skip link in the portal (this repeats public-site finding 11, which is still open). The path to main content for an admin is: sidebar trigger → logo → up to 6 quick-action buttons → 14 nav items, with the open section's sub-items expanded (up to 10 for Governance) → My account → Log out → header trigger → Operations Portal link → name link → theme toggle → help → notifications. That's roughly 25–40 tab stops, on every navigation, before reaching the page.

**Fixed** (issue #595). The portal gained a skip link after this audit was written, but it was rendered inside `SidebarInset` — which comes after `<Sidebar>` — so a keyboard user still tabbed through every stop above before reaching the link meant to skip them. It now renders before the sidebar, as the first focusable element on the page, and shares `src/components/skip-link.tsx` with the public site. `e2e/skip-link.spec.ts` asserts the ordering in both trees.

### 29. Nav group toggles announce no state — Moderate

In `portal-nav.tsx`, a section with sub-items renders a `SidebarMenuButton` with an `onClick` and a rotating `ChevronRight`. There is no `aria-expanded` and no `aria-controls` linking it to the `SidebarMenuSub` it opens, so a screen reader announces "Governance, button" whether the section is open or closed.

The same control also changes behaviour by sidebar state: when collapsed to icons it calls `router.push(item.href)` instead of toggling, so the same click either expands a list or navigates away depending on a mode the user may not have set deliberately, with no signal about which will happen.

### 30. Tab state lives in React, not the URL — Moderate

`event-detail-view.tsx:221` reads `?tab=` on mount and then holds the phase in `useState`, never writing back. `meeting-detail-view.tsx` does the same. So on a 17-tab event page: the browser Back button leaves the event entirely rather than returning to the previous phase, the URL can't be shared to point at a colleague's phase, and a refresh drops back to Overview. `?tab=` works as an entry point but not as state.

### 34. The "During" phase stacks six cards and merges their toolbars — Moderate

The event detail page's two-level structure — 4 phases × their tabs — is a sound answer to 17 tabs. But each phase renders _all_ of its tabs as stacked cards simultaneously: "During" is Attendance + Registrants + Discount codes + Distributions + Incidents + Giveaway on one long page, and "After" is Report + Donations + Expenses + Revenue + Impact.

The toolbar aggregates every visible card's actions into a single row (`event-detail-view.tsx:258–277`), so the During toolbar carries roughly seven buttons — check in a walk-in, add registrant, add discount codes, record distribution, add donation, log incident, giveaway actions — all `variant="secondary"`, all the same weight, with nothing tying each to the card it belongs to. Checking someone in at the door has no more prominence than adding a discount code.

---

## Performance experienced as UX

### 12. The shell blocks on seven sequential queries — Serious

`(app)/layout.tsx` awaits, one after another, with no `Promise.all`:

```
getCurrentUserPermissions      (2 RPCs)
getPendingApprovalsSummary
getOpsInboxSummary
ensureCurrentPerson
ensureMyOnboarding
getContentWorkSummary
getCalendarCoverageReminderSummary
getAccessManagementAttentionSummary
```

That's eight or nine round trips before the sidebar can render, and because it's the layout it runs on **every** portal navigation — including every filter submit (finding 17), which is a full document navigation. The dashboard page below it does the right thing and batches its own queries into `Promise.all`; the shell above it doesn't. These are independent reads and nothing in the sequence depends on the previous result.

### 31. Permission resolution runs uncached at every level — Moderate

`getCurrentUserPermissions` issues two RPCs (`claim_pending_role_grants`, then `my_permissions`) and is not wrapped in React `cache()`. It's called by the root portal layout, again by each nested section layout — `/portal/finance/expenses` hits `finance/layout.tsx` and `finance/expenses/layout.tsx`, so three times on that route — again by the page where it needs permissions, and again inside every Server Action via `checkAnyPermission`. Six-plus redundant RPCs per page load, all returning the same answer, all on the critical path in front of finding 12.

---

## Suggested triage order

Grouped by what a single change fixes, roughly highest value first:

1. **Resilience floor** — add `error.tsx` and `not-found.tsx` inside `(app)` so failures and stale links stay inside the shell (5, 6).
2. **Confirm what can't be undone** — the 14 unguarded deletes and the role-revoke `X` (8, 9), reusing the `DeleteAssetButton` pattern that's already right.
3. **Close the feedback loop** — a toast primitive resolves the silent-save problem and gives findings 4 and 7 somewhere to speak.
4. **Make finding a record cheap** — lift search out of the Filters sheet (2), then consider a command palette (1) and folding the four people views into one (26).
5. **Unblock the shell** — `Promise.all` in the layout and `cache()` around permission resolution (12, 31) are small changes that speed up literally every interaction, filters included.
6. **Auth dead ends** — sign-out on the `no_access` screen, `next` preservation, password recovery (10, 13, 33).
7. **Tables** — responsive column priority and a sticky first column (11), then pagination and sorting coverage (18, 19).
8. **Design system** — a `success`/`warning` token pair and one shared status `Pill`, which together resolve 24 and 25 and make every status column in the portal scannable.
