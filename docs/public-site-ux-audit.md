# Public site UX audit — header, navigation, mobile

Findings-only audit of the public site, prompted by the header looking wrong after the board hid four sections via the page-visibility gate added in [#586](https://github.com/rcruzmcd/coven/pull/586). Run against `development` on 2026-09-01 with a local Supabase stack and `bun run dev`.

**Local state under audit** — `about`, `programs`, `learn` and `support` all set to `false` in `public_page_visibility`, leaving four visible sections. This is the state the header screenshots were taken in:

```
[logo] Chatter Snow        Home  Events v  Gear v  Get Involved v  Contact        [*]
```

Scope is the public site with depth on responsive and keyboard behaviour: 375 / 768 / 1024 / 1280 / 1920px, a keyboard-only pass, the mobile nav sheet, and the header's behaviour as sections are toggled.

This audit deliberately targets what axe cannot see. `bun run test:a11y` currently reports **0 violations across 25 public and 43 portal routes**, so everything below is information architecture, affordance, layout, and semantics that automated scanning passes by.

**Status.** The header and page-visibility cluster (1–10, 12, 13) has been fixed, as have findings 11 and 21; everything else from 14 on is recorded for triage and untouched. Findings 21 and 22 surfaced while implementing the fixes — both are pre-existing and neither was caused by that work.

---

## Summary

| #   | Finding                                                                             | Area          | Severity | Status |
| --- | ----------------------------------------------------------------------------------- | ------------- | -------- | ------ |
| 1   | Hiding a section removes its nav link but leaves its pages live and indexable       | Visibility    | Critical | Fixed  |
| 2   | Two permanent (308) redirects now dead-end on 404s                                  | Visibility    | Serious  | Fixed  |
| 3   | Header wraps to two rows from 640–767px today, and to 1024px once sections return   | Responsive    | Serious  | Fixed  |
| 4   | Section landing pages are unreachable from the nav on every device                  | IA            | Serious  | Fixed  |
| 5   | Active state is rendered two different ways depending on item type                  | Header        | Moderate | Fixed  |
| 6   | Header distributes four flex children, leaving ~537px of dead space                 | Header        | Moderate | Fixed  |
| 7   | Footer omits About and Learn permanently; nav data is duplicated across three lists | IA            | Moderate | Fixed  |
| 8   | Mobile sheet: untappable group headers, 32px touch targets                          | Mobile        | Moderate | Fixed  |
| 9   | "Home" nav item duplicates the logo                                                 | Header        | Minor    | Fixed  |
| 10  | Gear dropdown presents four anchors into one page as four destinations              | IA            | Minor    | Fixed  |
| 11  | No skip link; seven tab stops before main content on every page                     | Keyboard      | Moderate | Fixed  |
| 12  | No `aria-label` on either `<nav>`; footer links are not a navigation landmark       | Semantics     | Moderate | Fixed  |
| 13  | Header has no call to action once Support is hidden                                 | Conversion    | Moderate | Fixed  |
| 14  | Homepage carousel gives no indication that slides 2 and 3 exist on mobile           | Mobile        | Moderate | Open   |
| 15  | "See event details" links to the events list, not the event                         | Content       | Minor    | Open   |
| 16  | Dark mode drops the purple brand entirely                                           | Design system | Moderate | Open   |
| 17  | Heading hierarchy problems on `/programs` and `/get-involved/attend`                | Semantics     | Minor    | Open   |
| 18  | Inconsistent card affordance between `/learn` and `/support`                        | Consistency   | Minor    | Open   |
| 19  | Events list ships every past event to the browser, unbounded                        | Performance   | Minor    | Open   |
| 20  | `prefers-reduced-motion` guards only one animation                                  | Motion        | Minor    | Open   |
| 21  | Carousel arrow causes 8px of horizontal scroll on `/home` at 1024–1136px            | Responsive    | Moderate | Fixed  |
| 22  | `page-visibility.spec.ts` races other specs over a shared `app_settings` row        | Test infra    | Serious  | Open   |

---

## 1. Hiding a section removes its nav link but leaves its pages live — Critical

`requireVisiblePage()` is called in only three of the eight registered sections. `PUBLIC_PAGE_SLOTS` in `src/lib/page-visibility.ts` registers eight slots; `src/app/(public)/{programs,learn,support}/layout.tsx` gate. `about/`, `contact/`, `gears/` and `get-involved/` layouts only wrap `PageShell`, and `events/` has no `layout.tsx` at all.

Measured live, with `about` toggled **off**:

```
307  /about            -> redirects to /about/story
200  /about/story      <-- still live
200  /about/mission    <-- still live
200  /about/team       <-- still live
404  /programs
404  /learn
404  /support
```

The board turns About off in Website → Page visibility, watches it vanish from the menu, and reasonably concludes the section is dark. It is not: three pages remain publicly reachable and crawlable. For a section held back pending board approval, that is the whole point of the feature failing silently.

This also contradicts the rule the feature's own commit message sets out — _"The gate goes in each section's layout, because a link the nav no longer renders is still a live page."_ Programs, Learn and Support follow it; the other five sections never had it applied.

**Suggested fix.** Add `await requireVisiblePage("<slot>")` to the four existing layouts and add `(public)/events/layout.tsx`. Back it with a unit test asserting every slot in `PUBLIC_PAGE_SLOTS` has a gated layout, so the next section added can't be ungated by omission.

## 2. Two permanent redirects dead-end on 404s — Serious

`next.config.ts` declares three legacy redirects with `permanent: true` (HTTP 308). Two of them target sections that are now gated:

```
/about/programs   308 -> /programs        final: 404
/about/donations  308 -> /support         final: 404
/about/volunteer  308 -> /get-involved    final: 200
```

308 is cached by browsers indefinitely and treated as permanent by search engines. Anyone who follows one of these while the target is hidden gets the redirect burned into their browser, and will not re-request the original URL after the board re-enables the section.

**Suggested fix.** Point them at pages that are always live, or drop to `permanent: false` while their targets are gated. A redirect whose destination is behind a runtime toggle can't be static and permanent at the same time.

## 3. The header wraps to two rows below 768px — Serious

The swap is `hidden sm:block` on the desktop nav and `sm:hidden` on the hamburger — 640px. Measured widths of the real rendered components at 1280px:

| Piece                                      | Width     |
| ------------------------------------------ | --------- |
| Logo + wordmark                            | 184px     |
| Nav, 5 groups (current, 4 sections hidden) | 387px     |
| Nav, 9 groups (all sections visible)       | 694px     |
| Theme toggle                               | 44px      |
| **Header total, all sections visible**     | **954px** |

Against the available inner width (`max-w-6xl` minus horizontal padding):

| Viewport | Inner width | Full nav fits? |
| -------- | ----------- | -------------- |
| 640px    | 560px       | no — wraps     |
| 768px    | 688px       | no — wraps     |
| 1024px   | 944px       | no — wraps     |
| 1280px   | 1152px      | yes            |

The header wrapper carries `flex-wrap`, so instead of overflowing it silently breaks onto a second row rather than showing a scrollbar or the hamburger.

**Part of this is already happening, in the current reduced state.** Even with only five groups the header needs 647px, so the 640–767px band wraps today. Measured header inner height on `/home`:

| Viewport | Header inner height | Rows               |
| -------- | ------------------- | ------------------ |
| 640px    | 100px               | 2 — logo, then nav |
| 660px    | 100px               | 2 — logo, then nav |
| 700px    | 100px               | 2 — logo, then nav |
| 768px    | 44px                | 1                  |

So for the ~127px between the breakpoint turning the desktop nav on (640px) and the width at which it actually fits (768px), every visitor gets a double-height header with the logo stranded on its own row. Restoring the four hidden sections extends that broken band from 640px all the way to 1024px.

Playwright has no project in this band either; the projects are chromium, firefox, webkit and Pixel 7 — so nothing in CI would have caught it.

**Suggested fix.** Move the desktop/mobile swap to `lg:` (1024px), and add a tablet viewport to the Playwright projects so the band is covered.

## 4. Section landing pages are unreachable from the nav — Serious

`/about`, `/gears` and `/get-involved` all have real landing pages (the first two redirect onward to `/about/story` and `/gears/library`; `/get-involved` is a 112-line page of its own). None of them is linked from the nav on any device:

- **Desktop** — a Base UI `NavigationMenuTrigger` opens its panel; it does not navigate. The panel lists only children.
- **Mobile** — the group header is a `<p className="app-eyebrow">`, plain text with no link.

The footer is the only route to them. So a visitor who wants the Get Involved overview has to scroll past the entire page to find it.

**Suggested fix.** Add an explicit overview entry as the first item of each dropdown. Events already does this correctly with "All Events" → `/events`; Gear and Get Involved need the same, and About needs it if that group returns.

## 5. Active state is rendered two different ways — Moderate

This is the visual oddity in the original screenshot: "Home" sits in a filled pill that no other item has.

Root cause, in `src/components/ui/navigation-menu.tsx`:

- `NavigationMenuLink` (line 135) carries `data-active:bg-muted/50` → a plain link, when active, gets a **background pill plus the rainbow underline**.
- `navigationMenuTriggerStyle` (line 57) has **no** `data-active` rule at all, only `data-popup-open:` → an active dropdown group gets **only the rainbow underline**.

Confirmed on two pages: on `/home` the active "Home" link renders pill + underline; on `/events` the active "Events" trigger renders underline alone. Both boxes are 36px tall, so this is purely the background rule, not a sizing difference.

**Suggested fix.** Pick one signal. The rainbow underline is the brand device and already works on both item types, so suppress the active background on top-level links and let the underline carry it. Apply this at the call site in `site-nav.tsx` — `data-active:bg-muted/50` is the correct treatment for links _inside_ the dropdown panels, and the primitive is shared with the portal.

## 6. Header distributes four flex children, not two — Moderate

`SiteNav` returns a **fragment** of three siblings: `<nav>`, `<ThemeToggle/>`, and the mobile `<Sheet>` trigger. The header wrapper in `(public)/layout.tsx:59` is `flex flex-wrap items-center justify-between`, so it is spreading four children, not the two it reads as.

Measured gaps between children on `/home`:

| Viewport | Inner width | Gap 1 | Gap 2 | Dead space |
| -------- | ----------- | ----- | ----- | ---------- |
| 768px    | 688px       | 36px  | 37px  | 73px       |
| 1024px   | 944px       | 164px | 165px | 329px      |
| 1280px+  | 1152px      | 268px | 269px | **537px**  |

At 1280px and above, 537px of a 1152px header — 47% — is void, and the gap widens every time the board hides a section. That is the "two large voids" in the screenshot, and it is a structural consequence of the fragment, not a spacing choice anyone made.

**Suggested fix.** Wrap `SiteNav`'s output in a single element so the header has two children (logo | nav cluster). `NavigationMenuList` also carries `flex-1 justify-center` (line 36), which should be overridden from the call site rather than in the shared primitive.

## 7. Footer omits About and Learn; nav data lives in three places — Moderate

`FOOTER_LINKS` in `(public)/layout.tsx:9` is a third hardcoded list alongside `NAV_GROUPS` in `site-nav.tsx` and `PUBLIC_PAGE_SLOTS` in `src/lib/page-visibility.ts`. It has six entries and **no About entry and no Learn entry at all** — so those two sections will stay missing from the footer even after the board turns them back on, with nothing to signal why.

The three lists also disagree on targets: the nav links to leaf pages (`/gears/library`), the footer links to section roots (`/gears`, which then redirects). Adding a section means editing three files and getting all three consistent.

**Suggested fix.** Extract the nav config to a shared module and derive both the nav and the footer from it.

## 8. Mobile sheet: untappable headers and 32px touch targets — Moderate

Measured inside the open sheet at 375px:

| Element                                         | Height          | Target |
| ----------------------------------------------- | --------------- | ------ |
| Sub-links (All Events, Gear Library, Attend, …) | **32px**        | 44px   |
| Top-level links (Home, Contact)                 | **36px**        | 44px   |
| Group headers (Events, Gear, Get Involved)      | not interactive | —      |

Every link in the mobile menu is below the 44px minimum, on the one surface where touch is the only input. `ThemeToggle` and the hamburger already meet it via a hand-applied `size-11`, so the standard is established in this codebase and the sheet simply doesn't follow it.

The group headers compound finding 4: they are 12px uppercase `app-eyebrow` text, which reads as a label rather than a control, and they are the only place a section name appears on mobile — with no way to reach the section.

**Suggested fix.** Raise link heights to `min-h-11` and make group headers links to their section landing page.

## 9. "Home" duplicates the logo — Minor

`{ label: "Home", href: "/home" }` is the only entry in `NAV_GROUPS` with no `slot` (so it is never hidden). The logo immediately to its left already links to `/home`. It costs 55px of a nav that is already struggling for room at tablet widths, and it is the item responsible for the odd pill in finding 5.

## 10. Gear dropdown presents one page as four destinations — Minor

Six entries, of which four are `#anchors` into the single `/gears/donate` page:

```
Gear Library     -> /gears/library
Sizing Guide     -> /gears/sizing
How It Works     -> /gears/donate#how-it-works
Request Gear     -> /gears/donate#request
Donate Gear      -> /gears/donate#donate
Gear Drives      -> /gears/donate#gear-drives
```

In the mobile sheet this makes Gear visually dominate the menu at nearly half its height. Choosing any of the last four lands on the same page, which reads as four dead ends to anyone who tries more than one.

**Suggested fix.** Collapse the four anchors into a single "Donate or request gear" → `/gears/donate`.

## 11. No skip link — Moderate

`grep -rniE "skip.?(to|link|nav|content)" src e2e` returns nothing. Measured tab order from the top of `/home` at 1280px:

```
1. Chatter Snow (logo)      5. Get Involved
2. Home                     6. Contact
3. Events                   7. Switch to dark mode
4. Gear                     8. Previous slide  <-- first main content
```

Seven tab stops before main content, on every page, with `<main>` on the homepage containing only five focusable elements. With all nine sections visible it becomes eleven. WCAG 2.4.1 (Bypass Blocks, level A) — axe does not flag a missing skip link because it cannot know the header repeats.

**Fixed** (issue #595). `src/components/skip-link.tsx` is now the first element in the public layout, targeting a `<main id="main-content" tabIndex={-1}>`. The id is supplied by `PageShell` for the ten sections that wrap it and by `/home`'s hand-rolled `<main>`; `/gears/sizing` lost the `<main>` it was nesting inside the `/gears` `PageShell`. `e2e/skip-link.spec.ts` covers all three paths.

Two things turned up while fixing it. The portal already had a skip link, so the audit's `grep` was out of date — but it sat inside `SidebarInset`, which renders _after_ `<Sidebar>`, so a keyboard user tabbed through all 25–40 stops it was meant to skip before reaching it. It now renders before the sidebar and is covered by the same spec. And `/gears/sizing` had been shipping nested `<main>` landmarks with doubled page padding, which axe also passed.

## 12. Unnamed navigation landmarks — Moderate

Landmarks on `/home`:

```
header  aria-label=null
nav     aria-label=null
nav     aria-label=null
main    aria-label=null
footer  aria-label=null
```

Two `<nav>` landmarks, neither named — a screen reader announces "navigation" twice with nothing to tell them apart. Separately, the footer link row is a plain `<div>` (`layout.tsx:79`), so footer navigation is not a landmark at all and won't appear in a landmark list.

**Suggested fix.** `aria-label` on each nav ("Main", "Site footer"), and wrap the footer links in `<nav>`.

## 13. The header has no call to action — Moderate

There is no action of any kind in the header — only links and a theme toggle. The site's one prominent CTA is the rainbow "Donate" button on the homepage, and it is gated behind `support` (`home/page.tsx:94`), so hiding Support removed the only conversion affordance above the fold and left nothing in its place.

For a nonprofit whose primary asks are attendance, volunteering and donations, the header is the obvious place for a persistent one.

**Suggested fix.** A persistent rainbow CTA beside the theme toggle, reusing `Button variant="rainbow"`, pointing at a target that isn't gated off.

## 14. Carousel gives no sign that more slides exist on mobile — Moderate

`(public)/home/page.tsx` renders three admin-configurable images in a `Carousel`. `CarouselPrevious` and `CarouselNext` are both `hidden sm:flex`, and the component has no dot/indicator support. Below 640px there is no arrow, no dot, and no partial next-slide peeking — two thirds of the homepage's hero imagery is invisible to anyone who doesn't happen to try a horizontal swipe.

(For the record, the carousel does **not** auto-advance — `opts={{ loop: true }}` only controls wrap-around when navigating — so this is a discoverability problem, not a motion one.)

## 15. "See event details" goes to the list — Minor

The homepage "Next up" card names a specific event, then offers a button reading "See event details" whose `href` is `/events` (`home/page.tsx:120`) — the full list of upcoming and past events, where the user has to find that event again.

## 16. Dark mode drops the brand — Moderate

In `.dark`, the shadcn semantic tokens go achromatic: `--primary: oklch(0.922 0 0)`, with `--secondary`, `--muted` and `--accent` all neutral grey. Light mode is purple-branded throughout. Related trap: `--purple-deep` **inverts** from `#32134f` to a light lavender, so every `text-[var(--purple-deep)]` in the codebase flips meaning between themes.

Work on this is already in flight in the working tree (`globals.css` gained dark values for `--surface`, `--purple`, `--purple-deep`, `--purple-soft`, `--line` and `--rainbow-soft`, plus `dark:bg-black/50` on the dialog/sheet/alert-dialog overlays). Noted here so the remaining achromatic semantic tokens aren't forgotten once that lands.

## 17. Heading hierarchy — Minor

- `/programs` uses `app-eyebrow` as its `<h2>` — 12px uppercase with `0.2em` letter-spacing, making section headings visually **smaller than the body copy** beneath them.
- `/get-involved/attend` opens with an `<h1>` reading "Get involved", verbatim identical to its parent `/get-involved`. Two different pages, one title.

## 18. Inconsistent card affordance — Minor

`/learn` wraps whole cards in a `Link` with a `hover:bg-muted/50` treatment. `/support` renders visually similar cards where only the title is a link and the card body is inert. Two card patterns that look alike and behave differently.

## 19. Events list is unbounded — Minor

`(public)/events/page.tsx` selects every row from `public_events` with no limit and no date filter, then `event-list.tsx` splits upcoming from past on the client. Every past event the organisation has ever run is serialised into the page payload forever. Fine today; it only ever grows.

## 20. `prefers-reduced-motion` guards one animation — Minor

The only reduced-motion block in `globals.css` (line 175) covers `.bell-ring`. Not covered: the 0.35s dropdown open/close transitions, the sheet and dialog enter/exit animations from `tw-animate-css`, the carousel's scroll animation, and `transition-all` on buttons.

## 21. Carousel arrow causes horizontal scroll at 1024–1136px — Moderate

`/home` scrolls horizontally by exactly 8px in a narrow band of desktop widths. Measured:

| Viewport | Document overflow | `carousel-next` right edge |
| -------- | ----------------- | -------------------------- |
| 1000px   | 0px               | 952                        |
| 1024px   | **8px**           | **1032** (viewport 1024)   |
| 1060px   | **8px**           | **1068** (viewport 1060)   |
| 1100px   | **8px**           | **1108** (viewport 1100)   |
| 1140px   | 0px               | 1130                       |

The cause is `CarouselNext`, which is positioned outside the carousel's own box. The carousel is capped at `max-w-5xl` (1024px), so once the viewport reaches 1024px the carousel stops growing while the arrow keeps sitting beyond its right edge, poking past the page's padding until the `max-w-6xl` container starts centring with enough margin again at ~1140px.

Only `/home` is affected — `/events` and `/contact` measured 0 overflow at the same widths. Not caused by the header work: this reproduces with the carousel and homepage untouched by that change.

**Fixed** (issue #593). The arrows now flip outside the carousel box at `xl` rather than `lg` (`src/components/ui/carousel.tsx`). The arrow sits 48px past the carousel's edge, so it needs `viewport / 2 >= 512 + 48`, i.e. at least 1120px — `lg` fired about 96px too early. `e2e/home.spec.ts` asserts zero document overflow at 1000, 1024, 1060, 1100, 1140 and 1280px.

## 22. `page-visibility.spec.ts` races other specs over shared state — Serious

`e2e/page-visibility.spec.ts` toggles the real `page_visibility.support` row in `app_settings` to prove the gate works. It correctly guards against racing _itself_ — `test.describe.configure({ mode: "serial" })` plus a skip for non-chromium projects — but Playwright's serial mode is scoped to the describe block, not the run. `e2e/support.spec.ts` executes in a parallel worker, loads the site while Support is toggled off, and fails:

```
✘ [chromium] › support.spec.ts:12 › nav resolves to Donations
  Error: expect(getByRole('heading', { name: 'Donations', level: 1 })).toBeVisible()
         element(s) not found
```

Reproduces every run when the two files are scheduled together, and passes every time `support.spec.ts` runs alone. This is a plausible identity for the "2/39 background flake rate on `development`" recorded in the commit message of `027ce33`.

Worth resolving before more sections get gated: every slot now has a route gate, so any future spec that toggles a slot can take out every other spec touching that section. Options are a dedicated slot no other spec navigates, or running the mutating file in its own project with a dependency edge.

---

## Known and accepted

**`/events/[id]` was intentionally orphaned — resolved by #846 and #847.** Event cards in `(public)/events/event-list.tsx` used to call `onSelect` to open `EventDetailSheet` rather than linking to the route, so nothing on the site linked to `/events/[id]` even though the page existed and rendered. That was confirmed as deliberate at the time of the audit; the consequences on record were:

- No shareable URL for an individual event — a member cannot link one to a friend, a Discord, or an Instagram bio.
- Individual events are not crawlable from the listing, so they can't surface in search.
- Browser Back does not close the sheet; it leaves the events page entirely.
- `/events/[id]` is not covered by any nav or in-page link, so regressions there are invisible outside its own e2e spec.

#846 made the home page's upcoming cards real links to `/events/[id]`. #847 did the same for the listing and reunited the two presentations: the cards are anchors, and a parallel + intercepting route (`(public)/events/@modal/(.)[id]`) renders the sheet over the listing while the URL becomes the event's own. A shared link, a refresh or a search result renders the full page; Back closes the sheet. Both presentations now read one query and one content component, and `/events/[id]` is scanned by following a real anchor rather than a pinned seed id.

---

## Method

- Local Supabase (`bun run db:status`) plus `bun run dev` on `127.0.0.1:3000`, `development` at `28bd4fb`.
- Visibility state read from the `public_page_visibility` view; **not modified**, so the audit reflects the exact state the header screenshots were taken in.
- Route statuses via `curl -o /dev/null -w "%{http_code}"`, redirect chains via `curl -L -w "%{url_effective}"`.
- Header screenshots and all width/height figures measured with Playwright at 375 / 768 / 1024 / 1280 / 1920px, reading `getBoundingClientRect()` on the live components.
- Nine-group header width measured non-destructively by cloning a live `NavigationMenuTrigger` and swapping its label, so the figure uses the real font, padding and chevron rather than an estimate.
- Keyboard pass driven through Playwright: tab order from the top of the document, dropdown open on Enter, Escape behaviour, focus restoration.
- Dropdown keyboard behaviour was **verified working** and is not a finding: triggers open on Enter and Escape returns focus to the originating trigger, as Base UI provides.
