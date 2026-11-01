# The platform's legal basis

The four documents in `src/lib/legal-defaults.ts` — a privacy policy, terms of
use, a code of conduct and an accessibility statement — are what a tenant is
served when it has published none of its own. They are four of the five in
`src/lib/legal-documents.ts`; the fifth, the participant waiver, is the one the
platform does not write. See rule 5. Since #859 `/privacy` is served
**unconditionally**, so from
the moment a tenant is provisioned this text is that organization's published
privacy policy, under its own name and its own brand.

That makes it the one thing in the codebase that speaks _as_ a customer rather
than to one, and the reason it needs an approval record at all.

## Reading it

```bash
bun run docs:legal              # every collection surface on: the maximal form
bun run docs:legal --minimal    # every surface off: the shortest a tenant is served
```

The script calls the same `platformLegalDocument()` the public routes call, so
what it prints is what is served. **Do not commit a rendered copy into this
repository.** A copy is correct on the day it is written and wrong at the next
commit, and a stale legal document that looks authoritative is worse than none
— the same argument the `PLATFORM_LEGAL_LAST_UPDATED` date exists to make.

The two renderings differ by a lot, and both matter to a reviewer: bullets,
retention rows and whole sections drop out when the collection surface behind
them is off (#1291), so a tenant running a contact form and nothing else
publishes a much shorter policy than a tenant running everything.

## The rules the prose is written under

Stated in full at the top of `src/lib/legal-defaults.ts`, and worth holding to
in any edit:

1. **Only what the software does.** Every factual claim is about behaviour in
   this repository. Where only the organization can answer — its governing law,
   its charitable status, the risks its activities carry — the section is absent
   rather than vague.
2. **No commitments on a tenant's behalf.** No response-time promises, no
   reviewer counts, no numbers a tenant has not agreed to.
3. **No links to routes that may not exist.** Every public page except the legal
   ones can be hidden per tenant, so the documents name the forms they describe
   rather than linking to them.
4. **Only what _this tenant's_ software does.** A bullet, a retention row or a
   section that belongs to a collection surface drops out when that surface is
   off.
5. **A document the platform cannot write, it does not write.** Rule 2 taken to
   its end. The participant waiver (#686) is a release of legal rights, which
   cannot be asserted for an organization that has not asserted it, so there is
   no `legal.waiver` entry in `PLATFORM_LEGAL_PROSE` and no neutral draft to
   fall back on. A tenant that has written none has nothing: `/waiver` 404s,
   the footer omits it, and its registration form asks about no agreement. The
   registry records this as `hasPlatformDefault: false`, and it is the only
   entry that carries it — `legal-defaults.test.ts` asserts that the flag and
   the prose cannot drift apart, and that a document which is always in force
   must have something to serve.

It is a starting point for an organization's own counsel to rewrite, not legal
advice, and the Site Content editor says so where the slot is edited.

## The accessibility statement, and what it may claim

Added #1368, and the one document whose factual claims are about this
repository's own testing rather than about what the application collects. That
makes rule 1 unusually easy to satisfy and unusually easy to get wrong in the
flattering direction, so two things are load-bearing:

- **The conformance claim is partial, and says what it rests on.** The
  automated scan is thorough — every route derived from the app tree, axe-core
  against `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`/`wcag22aa`, two themes, two
  viewports, the surfaces that only exist once opened, gated on a checked-in
  baseline — and it still finds only the minority of barriers a machine can
  recognise. No full manual screen-reader pass has been done across the site;
  `docs/a11y-scan-findings.md` says so in its own words. "Aims to meet WCAG 2.2
  AA", with no basis given, is the same overclaim in nicer clothes.
  Overclaiming conformance to a disabled reader is not a neutral error.
- **It is scoped to the public website, explicitly rather than by silence.**
  Every entry in `e2e/a11y-baseline.json` today is a portal route, and the
  document says both that it covers the public site and that the staff area has
  known problems it does not. `legal-defaults.test.ts` holds that against the
  baseline file, so a public route joining it fails a test rather than leaving a
  false sentence published.

Three things only the organization can answer — **who to contact, what it
commits to when it is told, and whether its own events and venues are
accessible**. The platform's text therefore carries no response time and no
promise a tenant has not made, and the Site Content slot description is what
names those as the parts to replace. This is also why the statement is
`alwaysInForce: false` despite being the document whose reader is least able to
go hunting for an alternative: the parts under an organization's control — its
alt text, its uploads, the documents it links, the buildings it meets in — are
not the platform's to assert.

## What approving means

Approving says: _this is what the platform is willing to assert, on behalf of an
organization that has said nothing, until that organization writes its own._

There is no board here. The platform's approver is its owner, unlike a tenant's
documents, which are approved by that tenant's own governance — Chatter Snow's
by its board, tracked in its own ticket.

**An approval is against a `PLATFORM_LEGAL_LAST_UPDATED` value.** Any change to
the prose bumps that constant in the same commit, which supersedes the approval
below and calls for a new row. A change that only removes text a surface no
longer applies to is still a change.

## Approval log

| Date       | Version approved   | Approver                            | Scope and notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-31 | October 31, 2026   | _Pending — Rickie (platform owner)_ | Widens what the privacy policy says PostHog counts (#1714), still only for a tenant with the `form_analytics` module on. The cookies-and-analytics paragraph gains one sentence: PostHog also counts a press of a donate button, a link followed to another website (the website, not the page), a page that could not be found (only the first part of its address) and which catalog filter was used (not what was picked); the PostHog subprocessor bullet adds "a few clicks, such as a donate button". What each event may carry is `SiteEvents` in `src/lib/analytics/form-events.ts`: a donate button's placement from a fixed list, an outbound link's host alone, a missing page's first path segment only when it reads as a route name (anything that could be a code is sent as `/:other`), and a filter's name. **Same module, not a second one:** a tenant that wants form funnels but not click counts is not a case anyone has asked for, and one switch keeps one policy paragraph per answer; splitting it later is a module and a third variant of the paragraph. Supersedes the 2026-10-23 row as the current version. Approval requested in the pull request that makes the change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-23 | October 23, 2026   | _Pending — Rickie (platform owner)_ | Names **PostHog** in the privacy policy (#1480), only for a tenant with the `form_analytics` module on: the cookies-and-analytics paragraph says PostHog counts how many people start and finish the site's forms, in aggregate, with no cookies, nothing stored on the device and no name, contact details or form answers sent; and the subprocessor list gains a PostHog bullet. A tenant without the module reads the previous text unchanged. What each event may carry is the allowlist in `src/lib/analytics/form-events.ts`: the form's name, its step, an error code, for event registration the event's id (#1707) -- the event's, never the registrant's -- for a gear request the number of items (#1711), for a contact message its topic's fixed value and for the `/my` sign-in which method was used -- password, new account or Google (#1713). The gear cart's steps before its form (#1711) -- an item added, the cart opened, the passphrase asked for or refused -- carry at most the item's catalog category key, never its id or name. None of it is about the person, so the policy text needs no change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-06 | October 6, 2026    | _Pending — Rickie (platform owner)_ | Replaces the privacy policy's backup sentence. It said a backup is "taken nightly and deleted after 90 days", describing an encrypted GitHub Actions dump to Cloudflare R2 that never once completed and has been removed now that Supabase is on Pro. It now describes what exists: Supabase's own daily backups, kept for 7 days on the Pro plan, so deleted information may persist for up to 7 days. Drops "encrypted", which described the removed workflow's own age encryption rather than anything this sentence can now vouch for. No other prose changes. Approval requested in the pull request that makes the change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-24 | September 24, 2026 | Rickie (platform owner)             | Removes the word **consent** from every photo sentence in all three documents, and replaces it with notice plus a standing right to object (#1376). Registering for an event is itself the agreement to being photographed, and the remedy is removal — a reversal of #599, decided by the platform owner, who declined a decline box as well as a consent box. The privacy policy's event-registration bullet no longer describes an answer being kept; it describes an **objection** being kept, and names the three routes in order of reach — any organizer at the event, email, and, only for somebody who has claimed an account, their own registration page. The terms' `photos-and-content` paragraph and the code of conduct's photo paragraph both drop "we rely on the consent process described at registration", a process that no longer exists; the terms keep the takedown route and the sentence saying an image shared onward by somebody else is out of the organization's hands, which is what stops the remedy being a promise nobody can keep. **The platform asserts only the mechanism and the remedy**, which are facts about this software. That registering carries the agreement is the organization's own claim, made in its own `events.photo_consent` paragraphs — rule 2, and the same argument that made the scope a tenant slot. Calling implied agreement "consent" would misstate the lawful basis: agreement implied by submitting a form is not an unambiguous affirmative act. Partially supersedes the 2026-09-22 photo row below rather than extending it, and supersedes every row beneath as the current version. Approval requested in the pull request that makes the change. |
| 2026-09-23 | September 23, 2026 | Rickie (platform owner)             | Adds a fifth legal document and the platform's fourth piece of prose, the accessibility statement (#1368). It says what is tested and how, that an automated check finds a minority of the barriers that exist, that **no full manual screen-reader pass has been done**, and that the conformance claim is therefore **partial rather than complete**; it is scoped to the public website explicitly rather than by silence, because every entry in `e2e/a11y-baseline.json` today is a portal route. Both sentences that depend on that are held against the baseline file by `legal-defaults.test.ts`, so a public route joining it fails a test rather than leaving a false statement published under an organization's name. The three things only an organization can answer — who to contact, what it commits to when told, and whether its own events and venues are accessible — carry no numbers here and are named as the parts to replace in the Site Content slot description. Shares its version string with the two rows below, which moved the prose under the same constant first; being last, this approval covers the text as it now renders and supersedes them. Approval requested in the pull request that adds it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-09-22 | September 23, 2026 | Rickie (platform owner)             | Adds one sentence to the privacy policy's event-registration bullet: where the organization asks whether somebody is happy to be photographed or recorded, the answer — **including a no** — is kept with the registration, with the date and a copy of what they were asked, and they can change it at any time from their registration page (#599). Conditional in its own wording rather than gated on a collection surface, the same construction the #686 row below uses and for the same reason given in the code comment beside it: a surface key meaning "this tenant asks about photos" would feed the drift fingerprint. It is the only clause in these three documents that promises a **control** rather than describing a field, and `set_my_photo_consent()` is what makes it true — a consent that cannot be withdrawn is not consent. #1367 moved `PLATFORM_LEGAL_LAST_UPDATED` to September 23 shortly before this landed, so both changes render under that one version string; it was the last when it landed, covering the text as it then rendered and superseding every row below, and is itself superseded by the row above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-23 | September 23, 2026 | Rickie (platform owner)             | Adds a section to the terms of use, `items-we-give-away`, carried only by a tenant whose site takes item requests (#1367): what the organization gives away is given as-is, nothing is inspected, tested, serviced, repaired or certified, no safety-critical work is done on it, and having it checked is the recipient's to arrange. Every claim is about what the software and the organization running it do _not_ do, which is rule 1 — cataloguing donated equipment and passing it on is not an inspection, and saying so commits nobody to anything. The snow-sports specifics a first tenant needs (binding mounting, DIN setting, boot fitting) are deliberately absent: they are that tenant's own text. Its heading and its nouns resolve through the lexicon, so an organization that lends tools reads "tools" and has agreed to no different claim. The same paragraphs are what a requester reads above the box they tick on the public cart — one constant, `GEAR_AS_IS_SUMMARY`, held to the document by `legal-defaults.test.ts`. Approval requested in the pull request that adds it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-09-22 | September 22, 2026 | Rickie (platform owner)             | Adds to the privacy policy's event-registration bullet what registration now asks about anyone under 18 (#685): the question itself, the accompanying adult and emergency contact a "yes" collects, that no date of birth or age is ever asked, and that the two contacts are readable only by the people who run the organization. The section's opening sentence gains a clause naming the one field where somebody supplies **another person's** details — the emergency contact never visits the site and cannot be given notice at the point of collection, so the document says so instead. The third change to land on this calendar day and therefore the third row against the same `PLATFORM_LEGAL_LAST_UPDATED` value: the constant is a date, and #686, #1360 and this one all moved the prose under it. It was the last of the three when it landed, superseding the two below rather than sitting beside them, and is itself superseded by the rows above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-09-22 | September 22, 2026 | Rickie (platform owner)             | Adds the volunteer-screening disclosure (#1360): a paragraph in "What we collect" saying the portal records only the outcome of a screening — which level, the date, and when the clearance runs to — and never the check, its result or anything a provider returns, plus a sentence in "Who can see it" that the outcome sits behind a separate permission from the rest of the volunteers module. Both are claims about the software rather than about any organization's process, checkable against `person_screenings`, which has no column a result could be written into. Adds the matching retention row. Shares its version string with the #686 row below: the constant is a date and both changes landed on it. Approval requested in the pull request that adds it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-09-22 | September 22, 2026 | Rickie (platform owner)             | Adds one sentence to the privacy policy's event-registration bullet: where the organization asks somebody to accept a participant agreement before registering, the record of that acceptance — that it happened, when, and which version was shown — is kept with the registration (#686). Conditional in its own wording rather than gated on a collection surface, for the reason given in the code comment beside it. No other prose changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-21 | September 21, 2026 | Rickie (platform owner)             | First recorded approval of all three documents. Covers the text as rendered by `bun run docs:legal` at this version, which is the first to name Sentry in the privacy policy's subprocessor list (#1340). The prior state was not an approval: the documents had been served since #858 and #1291 with no reviewer and no record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## What submitting a public form means

**Decided 2026-09-21 by the platform owner (#1318): submitting a public form is
not acceptance of the legal documents.** **Partially superseded 2026-09-24 for
event registration only (#1376)** — see "Registering carries the photo
agreement" below, which is the one thing a submission now carries and is
deliberately not called consent.

The public forms — event registration, volunteer application, gear request,
contact — collect information. They do not take agreement to anything. A privacy
policy is a notice rather than a contract: it binds the organization whether or
not the visitor read it. Since #684 each of those forms says at the point of
collection what is done with what is entered and links `/privacy`, and the
footer links it on every page. That notice is the whole of what a submission
means, with the single exception recorded below.

Nothing asserts acceptance of the terms of use or the code of conduct either,
and that is a decision rather than an omission waiting to be fixed. Those
routes 404 until a tenant adopts them (#859), so a site-wide agreement sentence
would have to disappear per tenant; and blanket assent to a stack of documents
nobody opened is not what consent looks like.

Where the platform does take agreement, it is scoped to the thing being
submitted and worded by the organization for that purpose:

- **Artwork submissions** — an unticked box confirming the work is the artist's
  own, and agreeing to the call's own `rights_note` (#876, #877) where it has
  one. The timestamp is stored on the submission.
- **The participant waiver** (#686) — an unticked box naming the
  organization's own agreement, beneath its title, the organization's own
  summary of it and a button that opens every word of that version in a
  full-screen sheet (#1402, recorded below).
  `event_registrations.waiver_accepted_at` and `waiver_version` record
  when, and which version, both resolved server-side. Taken on the signed-in
  registration path too: holding an account is not agreement to anything.
  **On file for a linked person** (#1401): a signed-in registrant whose account
  is linked to a directory record, and who has already accepted the version in
  force, sees one line naming that version, the date they accepted it and a
  link to it, in place of the agreement and its box.
  `person_waiver_acceptances` holds those acceptances per tenant, person and
  version; only `register_myself_for_event()` writes it, and each registration
  still copies the version and date it relied on into its own pair. A republish
  makes every file stale and the full agreement and box return. Anonymous and
  unlinked registrants always see it in full, because an email match is not
  identity — anyone can type anyone's address — so an anonymous acceptance is
  never put on anybody's file.
- **Items given as-is** (#1367) — an unticked box on the public request form,
  beneath a summary in the platform's own words of what taking a donated item
  means. Declining it is declining the item, which is what makes it a gate
  rather than a notice. `gear_requests.as_is_acknowledged_at` records when, and
  `as_is_text` snapshots the wording that was on screen — resolved on the
  server from `src/lib/gear-as-is.ts`, never sent by the browser. Taken on the
  signed-in request path too, for the reason the waiver is: holding an account
  is not agreement to anything.
- **Event registration questions of the consent kind** (#1501) — an unticked,
  declinable box worded by the organization for one event, such as agreeing to
  have a name and contact details passed to a partner arranging carpools.
  Declining never refuses the registration; the box is never `required`. The
  answer and the words shown are stored on `event_registration_answers`
  (`answer_text`, `prompt_as_shown`). Where the question is marked
  `shares_contact`, the portal's answers export includes a registrant's email
  and phone only on rows where it was ticked — registering alone shares
  nothing. The answers go with the name when the retention job anonymizes the
  registration.

The carpool cost-split notice (#1650) is deliberately **not** on this list. On
an event that organizes carpools, the registration form, its confirmation and
the assignment card tell a registrant that costs are split in the car and
settled with the driver, and that the people in their car see their first name
and Instagram handle. That is notice in the organization's own words
(`events.carpool_cost_notice`), not an agreement: there is no box, nothing is
stored about having seen it, and its default avoids "agree" and "consent".

The #599 photo-consent bullet stood in this list until #1376 removed it.
Nothing is taken on that form any more, so it is no longer an exception of this
kind — the one thing registration now carries is recorded in its own subsection
at the end of this section.

What follows from this:

- No consent checkbox for the privacy policy on any public form. A box that
  cannot be declined dilutes the ones that can.
- No stored pointer to a legal document version on a submission **that did not
  obtain one**. Such a column would assert an acceptance the interface never
  made. `event_registrations.waiver_version` is the single exception and the
  only one this shape permits, because the waiver's full text is one tap from
  where it is accepted, its box names it, and the box can be left unticked. Nothing stores a pointer to the
  privacy policy, the terms or the code of conduct, and nothing may.
  A **snapshot** is a different thing and is allowed where an acceptance was
  genuinely obtained: `artwork_submissions.consented_terms` (#1319) and
  `gear_requests.as_is_text` (#1367) and `event_media.rights_terms` (#1620,
  a photographer's upload-link confirmation) each hold the words the person was shown,
  because those words live in a call row or a component constant with no
  version identity and no permalink to point at. The test is #1319's — a
  pointer where the text has an address, a snapshot where it does not, and
  neither where nothing was accepted.
- Reopening this needs a legal reason rather than a design one — a tenant whose
  terms of use genuinely bind a registrant, say. It would be that tenant's claim
  to make, in that tenant's wording, and conditional on what it has adopted.

**Reopened once, on those terms, 2026-09-22 by the platform owner (#686).** The
participant waiver meets all three conditions: it is per tenant, it is in that
tenant's own words, and it exists only where that tenant has adopted one. It
takes a real acceptance and stores a version pointer, and the bullet above is
written to say so. It is not a precedent for the site-wide notices, which take
no acceptance and still store no pointer.

One thing it does not resolve, recorded here because it is a retention decision
rather than an engineering one: `purge_expired_records()` anonymizes a
registration three years after its event, and the acceptance survives while the
name and email do not — so the row ends up reading "Removed accepted waiver
v2". Three years is short against the limitation periods that make a waiver
worth holding. The honest answers are a separate acceptances table with its own
clock, or exempting waiver-bearing registrations from the name and email strip.
Carried to #1320 group E.

**The same question about the photo columns is resolved rather than carried,
and resolved the other way (#599, restated for #1376).** `20260922080000` nulls
all three beside the name, the email and the `person_id`, and that behaviour is
still right — but the reasoning has to be made against the new semantics rather
than left attached to the old ones.

Both are records of something somebody said, so what separates them is what
they are about: an acceptance is a fact about an **act**, and it still means
something once the name has gone, which is why #686 kept it. The photo columns
are a fact about a person's **face**. Under #1376 the surviving state worth
arguing about is the objection, and **an instruction about a face nobody can
identify is no more useful than a permission was**: "do not photograph this
person" protects nobody once there is no name to check a photograph against,
and it cannot be acted on at a door where nobody can be recognised as its
subject. A withdrawn objection is weaker still. What would survive either way
is a three-year-old statement attached to a row nobody can identify, which is a
liability rather than a record.

`null` after the purge is also the honest resting state under the new model
rather than a loss of information: it is what every registration this platform
takes already records, and it says only that there is nothing to act on.
Nothing had asserted that the waiver pair survives at all until #599;
`retention.integration.test.ts` asserts both halves in one test, since one rule
doing opposite things is the only place they can be compared.

### How the waiver is presented

**Decided 2026-09-22 by the platform owner (#1402), reversing #686's
presentation.** #686 put the whole agreement inline, in a capped scroll box
inside the registration form, so that "did they see it" was answerable. It is
now shown as:

1. the agreement's title in bold, and the organization's own `summary`
   paragraphs — its words, not the platform's; a tenant that has written none
   shows the title alone;
2. a **Read the full agreement** button opening every word of the same version
   in a full-screen sheet, beside the `/waiver?version=N` permalink the
   registration's pointer resolves to;
3. an unticked, required box directly above the submit button naming the
   document: "I have read and accept the _title_".

The reasons: a scroll box inside a scrolling page takes the finger over on a
phone and shows a few lines at a time, and it is not the stronger form in court
either. _Sgouros v. TransUnion_ (7th Cir. 2016) refused terms presented in a
small scroll box with nothing prompting the reader to scroll. What courts have
upheld is a conspicuous route to the full text beside an affirmative act:
_Meyer v. Uber_ (2d Cir. 2017) on a link next to the action; _Nguyen v. Barnes &
Noble_ (9th Cir. 2014) on why the box stays, since a link without an
affirmative act fails; and _Corwin v. NYC Bike Share_ (S.D.N.Y. 2017), which
enforced a liability release accepted through an "I have read and agree" box
against ordinary negligence.

What is deliberately **not** done: nothing forces the reader to scroll to the
bottom, or to open the sheet, before the box can be ticked. It is an
accessibility barrier, and no case found requires it. Recording that the
person opened the full text was proposed as optional and is not built; it would
need its own column and a change to the registration RPCs, and would be a
separate decision.

Unchanged: the version check in the registration RPCs, the version pointer,
and the rule that the box is never pre-ticked. The organization's waiver text
itself still wants its own lawyer's review — this decides how it is shown, not
what it says.

### Registering carries the photo agreement

**Decided 2026-09-24 by the platform owner (#1376), partially superseding the
2026-09-21 decision above for event registration alone.** Registering for one
of an organization's events is itself the agreement to being photographed
there, where that organization has published what it does with photos. Offered
the alternative of keeping a decline box as an opt-out, the answer was "no
box". There is no control on the form.

It is recorded here rather than as a fifth bullet in the list above because it
is categorically different from all four. Each of those is **an unticked box
somebody actively ticked**. This is carried by the act of submitting, which is
the thing #1318 decided a submission does not do — hence _partially
superseded_, not extended.

**It is deliberately not called consent, and the word appears on no surface a
human reads.** Agreement implied by submitting a form is not an unambiguous
affirmative act, so a privacy policy that called it consent would make a false
statement about the lawful basis. The honest framing, and the intended one, is
**notice plus a standing right to object**. The columns keep their names —
renaming `photo_consent` to `photo_objection` would mean retyping two RPCs, the
grant list, the published API field, the generated types and every test, for a
name — and `20260923020000` flips what they mean in `comment on` statements
alone, touching no row.

**The platform writes none of the implication.** What an organization does with
a photo, and whether registering for its events carries agreement to it, are
claims about that organization — rule 2, and the same argument that made
`events.photo_consent` a tenant slot in the first place. A tenant that has
written nothing says nothing: no heading, no notice, a form byte-identical to
the one before #599, and that is where almost every tenant is. The
registration form adds no sentence of the platform's own beneath a tenant's
paragraphs: it once said there was no box and listed the routes below, and
was dropped as redundant with a tenant's own text, which is where saying how
to object belongs.

**The remedy is objection, by three routes, of which one is self-service.**
Telling any organizer at the event, emailing, or — only for somebody who has
claimed an account — saying so from `/my/registration/[id]` through
`set_my_photo_consent()`. That last one resolves through
`my_constituent_person_id('events')`, and most registrants have never claimed
an account, so the privacy policy names the organizer and the email first and
qualifies the third rather than promising it. Under #599 the registration
page was a bonus on top of a box already ticked; here it is one route among
three.

**What the columns hold now.** `null` is **no objection on record** and is the
resting state of every registration this platform takes; `false` is **objected
— do not photograph**, the one state with an operational job, and it is what an
organizer checks before pointing a camera; `true` is an objection withdrawn, or
an explicit confirmation from a public-API caller that genuinely asked.
`photo_consent_text` still snapshots the organization's paragraphs, written by
`set_my_photo_consent()` from the tenant's own row and never from the client —
#1319's shape, because a content slot has no version table and no permalink.
Nothing may read `null` as an objection, and **nothing writes `true` at
registration**: a form with no affirmative control cannot produce an
affirmative record.

No row was backfilled and none needed to be. `false` means exactly what it
meant before, and `null` meant "nothing to act on" under both models — so
somebody who ticked a box in September 2026 really did agree, and their
`photo_consent_text` really is what they were shown.

**The portal badge is why the columns survived at all.** Dropping them would
have deleted the `No photos` badge the door shift checks, and "photos can be
deleted" is a remedy after the fact rather than a list of people who asked not
to be photographed. Rebuilding a column to hold an objection would have
arrived somewhere functionally identical.

## What this does not cover

- **A tenant that has published its own documents.** Those are that tenant's
  `site_content` rows and that tenant's decision; nothing here applies to them.
- **Whether a tenant has read this text.** An approval here is the platform's
  own, and it is not a substitute for somebody in the organization reading the
  words published under their name. Since #1321 that is recorded per tenant per
  document — `legal_acknowledged.<key>` in `app_settings`, holding who
  confirmed it, when, and the `PLATFORM_LEGAL_LAST_UPDATED` value they read —
  and bumping the constant above makes every one of those records stale, which
  is what tells a default-serving organization the text moved. So an approval
  row below is also a decision to ask every such tenant to read the document
  again; that is the intended cost of a prose change, not a reason to avoid
  one.
- **A citable version identity for _this_ text.** `PLATFORM_LEGAL_LAST_UPDATED`
  is the version key in all but name, and there is still no archive of
  superseded platform text and no permalink to one: the default is regenerated
  from the live configuration on every request, so there is no snapshot to
  keep. A **tenant's own** documents have had both since #601 —
  `legal_document_versions` and `/<document>?version=N` — which is what
  `event_registrations.waiver_version` points at.
