# Coven

**Coven** — a multi-tenant operations platform for small nonprofits and small
businesses: a public website and an operations portal, served to any number of
organizations from one Next.js App Router application backed by Supabase.

Coven is the product's name. The repository was previously
`chattersnow/chattersnow-web` because it started as Chatter Snow's site; the
commercial product ships under its own name and on its own domain
(`docs/licensing.md`).

**Chatter Snow is the first tenant, not the product.** The platform started as
its site, but every organization the platform serves is
a row in `tenants`, and nothing about which one a request belongs to is
hardcoded: the request host resolves the tenant, and the tenant's own rows carry
its branding, copy, permission matrix and data. Chatter Snow specifics belong in
that tenant's data, never in platform code — see `docs/licensing.md`.

## Where it runs

| Host                         | What it serves                                                   |
| ---------------------------- | ---------------------------------------------------------------- |
| `www.chattersnow.org`        | Chatter Snow's public site (the apex redirects to `www`)         |
| `portal.chattersnow.org`     | Chatter Snow's operations portal                                 |
| `demo.rickiecruz.com`        | The public demo tenant's site                                    |
| `demo.rickiecruz.com/portal` | The demo portal — one click from the login screen, reset nightly |
| `portal.rickiecruz.com`      | The platform tenant's own portal (no public site)                |
| `uat.chattersnow.org`        | The `development` branch, deployed as a Vercel Preview           |

The demo is the fastest way to see the portal: it is an ordinary tenant on the
`demo` plan, kept apart by the same policies as any paying one, and its data is
fictional. Never copy production data into it. See "The demo tenant" in
`docs/tenants.md`.

## Docs

- `CLAUDE.md` — build, lint, test, and architecture conventions. Read this first.
- `docs/technical-spec.md` — what is built and specified today: the hub, holding purpose, technology, system boundaries, security, the route tree, workflows, release criteria, and an index of every section number.
- `docs/spec/` — the spec's per-module files, one per domain (events, finance, inventory, governance, volunteers, …), each pairing that module's requirements with its data model. Open the one you need via the hub's index rather than reading them all.
- `docs/tenants.md` — the operator's runbook: provisioning a tenant, custom domains, branding, support access, the demo tenant, export and deletion (multi-tenancy, #707).
- `CONTRIBUTING.md` — how to contribute, and the CLA required before a first
  contribution.

## License and ownership

This repository is **proprietary, not open source**. It contains two categories
of material with different owners: the generic operations platform that ships
as Coven (the Core) and Chatter Snow's own brand, content, and data.

- `LICENSE` — the terms.
- `docs/licensing.md` — where the boundary falls, and the rules for keeping it
  clean while writing code.

Two things are worth knowing before you touch anything: don't hardcode Chatter
Snow specifics into platform code, and never copy production data into fixtures,
tests, demos, screenshots, or prompts. Every row concerns a real person.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
