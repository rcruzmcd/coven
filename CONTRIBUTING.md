# Contributing to Coven

**Status:** Draft — pending board resolution and attorney review
**Updated:** 2026-09-05

This repository is proprietary, not open source. See `LICENSE` for what that
means and `docs/licensing.md` for how ownership is divided between the generic
platform (the Core) and Chatter Snow's own material.

## Before your first contribution

**Every contributor other than the copyright holder must sign the Contributor
License Agreement in `CLA.md` before their first pull request is merged.** This
applies to volunteers, board members, contractors, and anyone contributing code,
schema, documentation, or design assets — paid or unpaid, one commit or many.

To sign: read `CLA.md`, then open a pull request adding your name, GitHub
handle, and the date to the signature roster at the bottom of that file, from
the account you will contribute with. That pull request is your signature.

If you are contributing on behalf of an employer, or your employment agreement
assigns your inventions or copyrights to someone else, tell the maintainer
before you start. An entity CLA signed by someone authorized to bind that
employer will be needed instead.

The reason is practical rather than bureaucratic. Copyright in a contribution
belongs to its author by default. Once code from a second author is in the
repository without an agreement, the project can no longer be cleanly
relicensed, assigned to Chatter Snow, Inc., or licensed to anyone else — and
undoing that requires tracking down every past contributor for permission.
Signing up front costs a few minutes; not signing can cost the ability to make
any future decision about the codebase at all.

## What you should know before writing code

- Read `CLAUDE.md` for build, lint, test, and architecture conventions.
- Read `docs/licensing.md` before adding anything organization-specific. In
  short: don't hardcode "Chatter Snow" into platform code, keep brand values in
  tokens, and keep program copy in content rather than components.
- **Never copy production data anywhere.** Not into fixtures, tests, demos,
  screenshots, issue comments, or AI prompts. Every row in every table concerns
  a real person — a participant, donor, volunteer, or staff member. Use
  synthetic records.
- Never commit secrets, API keys, or service credentials. If you commit one by
  accident, say so immediately; rotating a leaked key is routine, discovering it
  later is not.

## Working agreement

- Branch from `development`; open pull requests against `development`.
- Keep pull requests scoped to one change. Schema migrations and the code that
  depends on them belong in the same pull request.
- Run typecheck, lint, and the unit tests before requesting review.
- Database changes are migrations, never manual edits to a hosted database.
- If a change touches permissions, RLS, or anything handling personal data, say
  so explicitly in the pull request description so it gets the review it needs.
- **A permission check is not finished until `src/lib/auth/permission-docs.ts`
  says what it does.** Adding, moving or tightening a `requirePermission()` /
  `has_permission()` check, or adding a row to `public.resources`, means
  updating that module in the same pull request, so the administrator granting
  the role can still predict what the grant does. Read `docs/permissions.md`
  first; `src/lib/auth/permission-docs.test.ts` enforces it.

## Reporting a security issue

Do not open a public issue. Contact the maintainer directly. If the issue
involves exposure of participant, donor, or volunteer data, say so in the first
message so it can be triaged immediately — that is a notification-obligation
question, not just a bug.
