# Public page widths: how wide is a page?

**Updated:** 2026-09-16

The rule for how much of the viewport a public page's content occupies, and
where a shorter reading measure belongs when one is needed. Settled in
[#1218](https://github.com/rcruzmcd/coven/issues/1218).

Read this before adding a public route, a page shell, or a `max-w-*` on
anything that wraps a whole page.

## Why there is a rule

The site header and footer are `mx-auto max-w-6xl` inside `px-6 sm:px-10`
(`src/app/(public)/layout.tsx`) — the same column and the same padding
`PageShell` gives a page. A page that picks a narrower column is therefore
centred inside its own chrome: its content starts to the right of the logo
above it and ends to the left of the footer below it.

Most sections took the default and lined up. Four did not, each for a reason
that was sound on its own page and invisible from any other:

| Route                              | Was         | Why it was chosen                                                    |
| ---------------------------------- | ----------- | -------------------------------------------------------------------- |
| `/brand`                           | `max-w-4xl` | Nothing recorded. It arrived with the page's first commit (#845).    |
| `/my`                              | `max-w-3xl` | "One column of cards; `max-w-6xl` sets 120-character lines" (#1179). |
| `/my/details`, `/my/notifications` | `max-w-2xl` | Single forms (#1179).                                                |
| `/my/sign-in`                      | `max-w-md`  | A lone card (#1179).                                                 |

Meanwhile three other sections had written the opposite decision into their own
comments — `privacy/layout.tsx`, `terms/layout.tsx`,
`confirm-notification-email/page.tsx` all say some version of _"deliberately the
default `max-w-6xl` … so the page's left edge lines up with the header and
footer"_. Both instincts were defensible. Having both, with nothing to say which
applied, is what produced a site whose pages start in four different places.

It also produced smaller oddities that nobody chose. `MyNav` renders inside
each page's shell, so the account area's navigation was `max-w-3xl` on the hub
and `max-w-2xl` on the three pages it links to — a nav that moved as you used
it. `my/error.tsx` is one boundary over five routes at four widths, so every
thrown error was also a width jump.

## The rule

> **Every public page renders in `PageShell`, and `PageShell` has one column:
> `max-w-6xl`. There is no per-page width.**

`PageShell` (`src/components/page-shell.tsx`) takes no width argument, so this
is not a convention to remember — there is nothing to pass. It also supplies
the `<main id="main-content">` that the layout's skip link targets, which is
the second reason every page goes through it.

### Where a shorter measure goes

A 1152px line of body copy is unreadable, and the rule does not ask for one.
Cap the **element**, not the shell:

```tsx
<PageShell>
  <h1>…</h1>
  <p className="app-muted max-w-3xl">Body copy at a readable measure.</p>
  <ul className="grid sm:grid-cols-3">…</ul>
</PageShell>
```

This is the split `privacy/layout.tsx` describes and the one ~40 paragraphs
across the site already use. It keeps the page's left edge on the header's
while the text still breaks where it should.

A page that is _nothing but_ prose has no grid or image to sit beside that
column, and a lone measure in a wide frame looks like a mistake. That is what
`src/components/legal-page-shell.tsx` exists for: a section rail on the left
and the document beside it, filling the same `max-w-6xl`. Reach for it before
reaching for a narrower page.

### Loading, error and not-found files

`loading.tsx`, `error.tsx` and `not-found.tsx` render in place of a page, so
each one wraps itself in `PageShell` exactly as the page does. They now agree
by construction; before this rule they were hand-matched, and `my/error.tsx`
could not match all five of the routes it covered.

## The one exception

`src/app/links` sits outside the `(public)` group, renders its own `<main>`
and its own `SkipLink`, and ships **no site header or footer**
(`src/app/links/layout.tsx`). Its `max-w-sm` has no chrome to line up with: it
is a phone-width bio page opened from Instagram. It does not use `PageShell`
and is not governed by this rule.

## Why two layouts still leave the shell to their pages

`(public)/events/layout.tsx` and `(public)/my/layout.tsx` are gates, with no
`PageShell`. Until #1218 that was because their routes wanted different widths.
`/my` still needs it structurally: its `loading.tsx`/`error.tsx` files above
would nest a second `<main>` inside the layout's. `/events` needed it for the
intercepted sheet `@modal` slot, which #1427 removed; its pages keep their own
shells so the two layouts stay alike.

## Related

- [#1218](https://github.com/rcruzmcd/coven/issues/1218) — this rule.
- [#211](https://github.com/rcruzmcd/coven/issues/211) — raised the
  same inconsistency for `/home` and the event detail page and left the call
  open. #1218 closes it: the event page takes the standard column.
- [#412](https://github.com/rcruzmcd/coven/issues/412) — `/about`
  widened for the same reason, one page at a time.
- [#845](https://github.com/rcruzmcd/coven/issues/845) — `/brand`,
  where the `max-w-4xl` came from.
- [#1179](https://github.com/rcruzmcd/coven/issues/1179) — gave the
  account area a shell at all, with the per-route widths this rule replaces.
- `docs/portal-navigation.md` — the equivalent rule for the ops portal.
