# The public content API

A versioned HTTP contract over one organization's public content and its
intake forms (#813 Phase 3). It exists so the public site is **one consumer
among several** rather than the only one that can exist: an events embed on a
customer's own website, a mobile app, a per-tenant static build.

Everything it serves is already public — it is what a visitor to that
organization's own site can see. Nothing about donors, finance, inventory
valuations, governance or anybody's membership is reachable from it at any
path, because every handler reads through the same `public_*` views and intake
RPCs the website does, as `anon`, with no session and no service-role key
anywhere in the layer.

## Shape

```
GET  /api/v1/t/{tenant}/site
GET  /api/v1/t/{tenant}/content
GET  /api/v1/t/{tenant}/events
GET  /api/v1/t/{tenant}/events/{event}
GET  /api/v1/t/{tenant}/calendar
GET  /api/v1/t/{tenant}/gear             ?category= &condition= &gender= &q=
GET  /api/v1/t/{tenant}/gear-request-settings
GET  /api/v1/t/{tenant}/volunteer-roles
GET  /api/v1/t/{tenant}/articles
GET  /api/v1/t/{tenant}/articles/{article}
GET  /api/v1/t/{tenant}/article-categories
GET  /api/v1/t/{tenant}/programs
GET  /api/v1/t/{tenant}/team
GET  /api/v1/t/{tenant}/sponsors
GET  /api/v1/t/{tenant}/lexicon
GET  /api/v1/t/{tenant}/legal

POST /api/v1/t/{tenant}/contact
POST /api/v1/t/{tenant}/volunteer-applications
POST /api/v1/t/{tenant}/volunteer-applications/status
POST /api/v1/t/{tenant}/events/{event}/registrations
POST /api/v1/t/{tenant}/gear-requests
POST /api/v1/t/{tenant}/rider-profile
POST /api/v1/t/{tenant}/person-answers

GET  /api/v1/openapi.json
```

`{tenant}` is `tenants.slug`. The handler stamps it as the `x-tenant-slug`
header the database resolves from (#813 Phase 2), so an unknown, suspended or
archived organization is a 404 and never somebody else's content.

There is no authentication and no key. Slug-in-path was chosen over a
per-tenant API key because the slug already exists, is already unique and
stable, needs no issuance UI, and is what an embed snippet would hardcode
anyway. A key can be layered on later for attribution without replacing it.

## The document is generated, not written

`/api/v1/openapi.json` is built from the same zod schemas the handlers use:
`src/lib/api/schemas.ts` for request bodies, `src/lib/api/response-schemas.ts`
for answers. A field cannot appear in the document unless the code has it.

Two of those schemas are built from the platform's own registries rather than
listed by hand — `/content`'s properties from `SITE_CONTENT_SLOTS`, and
`/site`'s from the brand, page-visibility and layout registries — so adding a
slot (#888) changes the API **and** its description in the same commit.

`src/app/api/v1/public-api.integration.test.ts` calls every endpoint against a
real stack and parses each answer with its own schema, so a handler that stops
matching its documentation fails a test rather than a consumer.

## Errors

One envelope everywhere:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "…",
    "fields": { "email": "…" }
  }
}
```

`code` is the contract and is what a consumer should branch on; `message` is a
sentence for a developer reading a log, not copy for an end user. `fields`
appears on a 422 from a form post.

| Code                 | Status | When                                                                |
| -------------------- | ------ | ------------------------------------------------------------------- |
| `not_found`          | 404    | No such organization, or no such thing inside it                    |
| `invalid_request`    | 422    | The body did not parse or did not validate                          |
| `rate_limited`       | 429    | `check_rate_limit()` said no; `Retry-After` is the 15-minute window |
| `origin_not_allowed` | 403    | A browser origin this organization has not allow-listed             |
| `conflict`           | 409    | The event is full, closed, or already has this submission           |
| `server_error`       | 500    | Ours                                                                |

**A disabled module is a 404**, everywhere, deliberately. #902 made the intake
RPCs refuse when the module that owns them is off, reusing each RPC's existing
"no such thing" answer to do it. Which modules an organization has bought is
not something its public API should tell a stranger, and "this organization
does not have this" is the truthful answer either way.

## Registering where an organization takes a participant agreement

`POST /events/{event}/registrations` is the one write whose requirements depend
on what the organization has adopted, so a consumer that ignores this breaks
the day its customer adopts a waiver (#1366).

`GET /legal` reports each document with an `in_force` flag and a `url` on the
organization's own site. When `waiver` is in force, a registration is refused
with `invalid_request` and a `waiver_accepted` field message until the body
carries `waiver_accepted: true` — the agreement is a release of legal rights,
and the platform will not record a registration as having accepted one that
nobody was shown. **Show the document at that `url`, then send the flag.**

`waiver_version` is optional. Send it if you track which version the person
read, and a version that is no longer in force is refused with `conflict`
rather than quietly accepted against text nobody saw. Omit it and the
registration accepts whatever is in force at the moment it lands.

Where no waiver is in force — which is almost every organization — omit both
and nothing changes.

`photo_consent` is the other field that depends on configuration, and it is
never a gate (#599, #1376). Its type and its optionality have not changed; what
it records has. Where `GET /content` returns a non-empty
`events.photo_consent`, that organization **publishes a photo notice at
registration** — show those paragraphs, because registering carries agreement
to what they say.

Send `false` to record that somebody asked not to be photographed or recorded.
**The registration is still taken** — an objection is never a refusal — and the
record exists so that whoever is holding a camera can check it. Send `true`
only where somebody told you explicitly that photos are fine; the paragraphs it
is filed against are read from the organization's own row, so a `true` asserts
that the person saw them. Omitting the field records nothing, and nothing is
never read as an objection.

**Omitting it is what this organization's own registration form now does.**
There is no control on it: registering is the agreement, and objecting happens
afterwards, by telling an organizer, by email, or from the registrant's own
registration page. So a caller that has not genuinely asked should omit the
field rather than send `true`.

## Profile questions after registering

`POST /person-answers` (#1746) is registration's second step for a headless
consumer: `{registration_id, answers}`, with `answers` keyed by **question
key**, since a consumer cannot read the questions' ids. A choice is named by
its option key. The registration id is the credential, for a day, and the
step is never pre-filled, so a question left out keeps the stored answer. A
question with no key cannot be answered here.

`POST /rider-profile` keeps its v1 contract: its four fields are mapped onto
the questions keyed `riding_discipline`, `ski_level`, `snowboard_level` and
`preferred_mountain`, as Chatter Snow's are seeded. An organization without
all four answers `410 gone`. One behaviour changed with the move: an omitted
`preferred_mountain` now leaves the stored one rather than clearing it, as the
site's own step does.

## Caching

Reads answer `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
and a weak `ETag`, and honour `If-None-Match` with a 304. Writes and errors are
`no-store`.

A minute is short enough that an organization publishing a correction sees it
on an embed about as fast as on its own site, and long enough that an embed on
a busy page costs one Supabase request a minute rather than one per visitor.

That is also the whole of the plan-limit argument, and it is worth being
precise about which limit binds (Supabase checked 2026-10-06, Vercel 2026-09-29):

- **Supabase Pro** includes _unlimited API requests_ and **250 GB egress and
  250 GB cached egress per month**, billed past that at $0.09 and $0.03 per GB.
  So the thing to conserve is bytes leaving the database, not request count —
  and a CDN hit never reaches it at all.
- **Vercel Pro** (the project moved off Hobby on 2026-09-29) includes 1 TB of
  Fast Data Transfer, 10,000,000 Edge Requests and 1,000,000 function
  invocations a month; Fast Origin Transfer is billed on demand from the first
  byte. So a cache hit is still the cheap path, and a miss that reaches a
  function is what costs. Pro also permits commercial use, which Hobby did not,
  so a customer's paid embed needs no plan change.

No edge-level read limiter is deployed. On these plans the cache is the lever,
and adding a per-IP counter in front of a document a CDN is already serving
would cost a function invocation to save a cached response. If read abuse ever
shows up in the logs, Vercel's WAF or a counter in Postgres is the follow-up;
the writes are already limited per caller IP by `check_rate_limit()`.

## Cross-origin rules

Reads answer `Access-Control-Allow-Origin: *`. The rows behind them are public,
and an allow-list on a public read would only inconvenience a customer whose
embed stopped working.

Writes are allow-listed per tenant through `tenants.allowed_origins`
(`service_role` only, like `custom_domain`):

```sql
update public.tenants
   set allowed_origins = array['https://example.org', 'https://www.example.org']
 where slug = 'example-nonprofit';
```

Matching is exact on the serialized origin — no wildcards, no subdomain rule,
because that is the string a browser sends and the string a response has to
echo. The list is never served: `public_origin_allowed()` answers one boolean
about one origin, since the list is a map of an organization's partners.

**This is for the tenant's sake, not the database's.** CORS is a rule browsers
keep; `curl` sends no `Origin` and is refused by nothing here, which is why a
request with no `Origin` is allowed to post. What it prevents is somebody
embedding an organization's volunteer form on a page that organization has
never seen and collecting real applications into their real database under
their real name. What limits abuse is the rate limiter.

## Not in v1

- **Artwork-call submissions.** They upload images through signed storage URLs
  in a two-step flow (`claim_artwork_upload_slots` → PUT → `submit_artwork`),
  and publishing that would make a storage provider's upload protocol part of
  this contract. Revisit when a consumer needs it.
- **Legal document bodies.** `/legal` says which documents are in force and
  links to them on the organization's own site; the text is still code defaults
  rather than data (#600, #601).
- **`confirm_notification_email`.** A signed-link confirmation for portal
  users, not public content.
- **Anything authenticated.** The portal's write paths are #1082.
