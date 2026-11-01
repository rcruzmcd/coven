import { GEAR_AS_IS_SUMMARY } from "@/lib/gear-as-is";
import { applyLexicon, applyLexiconAll, type Lexicon } from "@/lib/lexicon";
import type { CollectionSurface } from "@/lib/legal-surface";
import { RETENTION_POLICIES } from "@/lib/retention";
import {
  LEGAL_DOCUMENT_OUTLINES,
  type LegalDocumentContent,
} from "@/lib/site-content";

/**
 * The documents a tenant that has published none of its own is served (#858).
 *
 * These used to be Chatter Snow's, rendered from JSX and described in the
 * editor as "the platform's document": provisioning a tenant published another
 * organization's legal position, complete with snow-sports risk, a gear library
 * and New Jersey governing law, under the new tenant's brand. Chatter Snow's
 * documents are now its own tenant's published rows, and what is left here is
 * what the platform can honestly say for *any* nonprofit running *this*
 * application.
 *
 * Three rules held while writing them, and are worth holding to:
 *
 *   1. **Only what the software does.** Every factual claim below is about
 *      behaviour in this repository -- the forms that exist, the retention job
 *      that runs, the providers the deployment uses. Where only the
 *      organization can answer (its governing law, its charitable status, the
 *      risks its activities carry), the section is absent rather than vague.
 *   2. **No commitments on a tenant's behalf.** Numbers a tenant has not agreed
 *      to -- "we acknowledge within 5 days", "two board members review it" --
 *      are the same hazard as borrowed terms, so the process is described
 *      without them. Chatter Snow's own document keeps its board's numbers,
 *      because its board agreed to them.
 *   3. **No links to routes that may not exist.** Every public page except the
 *      legal ones can be hidden per tenant (`page_visibility.*`), so these
 *      documents name the forms they describe rather than linking to them. The
 *      exceptions are /privacy, which #859 keeps served for every tenant, and a
 *      #fragment, which stays inside the document it is written in.
 *   4. **Only what *this tenant's* software does** (#1291). Rule 1 was read too
 *      narrowly at first: the prose described every form in the repository, so
 *      a tenant running a contact form and nothing else published a policy
 *      about volunteer applications, rider profiles, gear requests and open
 *      calls, hedged by one sentence admitting some of them might not exist.
 *      A bullet, a retention row or a whole section that belongs to a
 *      collection surface now names it -- `CollectionSurface` in
 *      `@/lib/legal-surface` -- and drops out when that surface is off.
 *
 * This is a starting point for an organization's own counsel to rewrite, not
 * legal advice, and the Site Content editor says so where the slot is edited.
 */

export type LegalOrgContext = {
  /** The organization's name, from `tenants.name`. */
  name: string;
  /** `org.email_general` -- general enquiries. */
  emailGeneral: string;
  /** `org.email_privacy` -- access, correction and deletion requests. */
  emailPrivacy: string;
  /** `org.email_conduct` -- code of conduct reports. */
  emailConduct: string;
  /**
   * What this tenant's site actually collects (#1291), from the page
   * visibility and module entitlements it is running under. Decides which
   * bullets, retention rows and whole sections the documents below carry.
   */
  surfaces: CollectionSurface;
  /**
   * This organization's own words for what it lends (#896, #1367).
   *
   * Only the `items-we-give-away` section needs it today, and it is resolved
   * over the whole document rather than in that one block: a placeholder that
   * reaches a published legal page is a brace on screen an administrator has
   * to report, and `applyLexicon` leaves text with no placeholder in it
   * untouched. `lexicon.test.ts` sweeps every section of every document for a
   * surviving one, the same way it sweeps the nav registries.
   */
  lexicon: Lexicon;
};

/**
 * Printed on every document here. Bump it in the same commit as any change to
 * the prose below: a stale date on a legal page is worse than none.
 */
export const PLATFORM_LEGAL_LAST_UPDATED = "October 31, 2026";

type Prose = (org: LegalOrgContext) => string[];

type DocumentProse = {
  /** Search and link-preview description, used when the tenant has no document. */
  description: (org: LegalOrgContext) => string;
  summary: Prose;
  /** One entry per id in this document's `LEGAL_DOCUMENT_OUTLINES` entry. */
  sections: Record<string, Prose>;
};

const mailto = (address: string) => `[${address}](mailto:${address})`;

/**
 * A bullet list. `false` entries are dropped rather than rendered, so a bullet
 * that belongs to a collection surface can be written inline as
 * `surfaces.x && "..."` and simply not appear when that surface is off (#1291).
 */
const bullets = (items: readonly (string | false)[]) =>
  items
    .filter((item): item is string => item !== false)
    .map((item) => `- ${item}`)
    .join("\n");

/** The same, for whole paragraphs in a section's list. */
const paragraphs = (items: readonly (string | false)[]) =>
  items.filter((item): item is string => item !== false);

const PRIVACY: DocumentProse = {
  description: (org) =>
    `What personal information ${org.name} collects through this site, why we collect it, how long we keep it, and how to ask for a copy or a deletion.`,
  summary: (org) => [
    `${org.name} uses this site to run its events, programs and other work. This policy explains what personal information the site collects, why we collect it, who can see it, how long we keep it, and how to ask us for a copy or a deletion.`,
    `The short version: we try to collect only what we need to run our programs and keep in touch with you, we don't sell or rent it to anyone, and you can ask us to delete it — apart from the few records we're legally required to keep — by emailing ${mailto(org.emailPrivacy)}.`,
  ],
  sections: {
    // One bullet per form this site actually has (#1291). The list used to be
    // every form in the software, followed by a sentence saying some of them
    // might not exist -- an honest dodge rather than an accurate policy.
    "what-we-collect": ({ surfaces }) => [
      // "Yourself" stopped being the whole truth when registration began
      // asking for an emergency contact (#685): that person never came to the
      // site and cannot be told anything at the point of collection, so the
      // sentence names them rather than glossing them. We still buy nothing.
      "Everything below is information you type into a form yourself — including, in one place, somebody else's name and number that you give us. We don't buy personal information about you from anyone else.",
      bullets([
        surfaces.contact &&
          "**Contact form** — your name, email address, the topic you pick, and your message. We use it to read what you sent and reply to you, and we email you back to confirm it arrived — that confirmation names the topic and the date, never what you wrote.",
        surfaces.volunteerApplications &&
          "**Volunteer application** — your name, email address, and, if you choose to give them, your phone number, the roles you're interested in, and your availability. We use it to review your application, follow up with you, and let you check its status with the reference code we give you.",
        surfaces.eventRegistrations &&
          // The closing sentence is deliberately conditional in its own
          // wording rather than gated on a collection surface (#686). "Where
          // we ask you to accept" is a true claim about this software on every
          // tenant, including the ones that ask nobody; a surface key for
          // "this organization has adopted a waiver" would have to feed
          // `legal_surface.*`, and every tenant with its own published
          // documents would be told they had drifted the day they adopted one.
          //
          // The photo sentence is conditional in the same way and for the same
          // reason (#599, #1376). What it describes is no longer an answer to
          // a question: registering for an event is itself the agreement, so
          // what this document can honestly say is that an **objection** is
          // kept, and by which routes it can be made. It never calls that
          // consent -- agreement implied by submitting a form is not an
          // unambiguous affirmative act, and a privacy policy asserting
          // otherwise would misstate the lawful basis.
          //
          // The three routes are named in order of reach, deliberately.
          // `set_my_photo_consent()` resolves through
          // `my_constituent_person_id('events')`, so the registration-page
          // control exists only for somebody who has claimed an account --
          // most registrants have not -- which is why the organizer and the
          // email come first and the last clause is qualified rather than
          // promised outright.
          //
          // Whether registering carries the agreement at all is the
          // organization's claim, made in its own `events.photo_consent`
          // paragraphs. This sentence describes only the record and the
          // remedy, which are facts about this software (rule 2).
          "**Event registration** — your name, email address, party size, and, optionally, your phone number, social handle and any notes you add. If you fill in a participant profile, we also store what it asks for: which activity you do, your experience level, and where you prefer to go. We use it to hold your spot, plan the event around who is coming, and send you the details. Where we ask you to accept a participant agreement before you register, we keep a record that you accepted it, when, and which version of it you were shown. We ask whether anyone in your party is under 18, and if you say yes we ask for the name and number of the adult coming with them and for an emergency contact — we never ask anyone's date of birth or age. The people running the event see that your party includes someone under 18; only the people who run the organization see those two contacts. Where the event pages say what we do with photos and video, you can tell us at any time that you'd rather not be photographed — say so to any organizer at the event, email us, or, if you have an account here, from your registration page. We keep that with your registration, with the date and a copy of what you were shown, so that the people running the event know.",
        surfaces.gearRequests &&
          "**Gear requests** — your name, email address, and, optionally, your phone number and any notes about what you need. We use it to match you with what you asked for and arrange a time to hand it over.",
        surfaces.artworkSubmissions &&
          "**Artwork submissions** — your name, email address, the images you upload, and, if you give them, the title, the medium, an artist statement, a credit name and a link to your work. We use it to review your submission for the open call you sent it to, and we email you back to confirm it arrived — that confirmation names the piece, the call and how many images we received, and never sends the images themselves.",
        // Two shapes of the same bullet. "For the people who run the
        // organization" was true until #1161 put sign-up on the public site,
        // and is the wrong sentence on a tenant that has turned that on.
        (surfaces.constituentAccounts
          ? "**Accounts** — the email address you sign in with, the password you set, and a session cookie that keeps you signed in. Anyone can create an account on this site to see their own records; the people who run the organization sign in to the operations portal with the same kind of account."
          : "**Portal accounts** — for the people who run the organization: the email address you sign in with, and a session cookie that keeps you signed in.") +
          (surfaces.googleSignIn
            ? " Signing in with Google shares that account's email address and name with us."
            : ""),
        surfaces.constituentAccounts &&
          "**Matching your account to our records** — the name we would have you under, and, if you give them, an email address, a phone number, a social handle and a note explaining who you are. Somebody here reads it and decides whether the record is yours. We keep what you sent either way, so there is a record of the decision.",
        surfaces.constituentAccounts &&
          "**What you keep up to date yourself** — once your account is matched to a record, you can correct the name you prefer, your pronouns, your phone number, your social handle and your postal address, tell us which activity you do, your experience level and where you prefer to go, and choose which of our emails you get. What you save replaces what we had.",
        surfaces.volunteerHours &&
          "**Hours you log yourself** — if you volunteer with us and log your own hours: how many, the date, which event and which role they were for, and any note you add. They stay pending until somebody here confirms them.",
      ]),
      // Not a bullet, because the list above is introduced by "information you
      // type into a form yourself" and nobody types this: it is recorded by
      // the organization about a volunteer. A trailing paragraph is where that
      // already goes — the IP-address sentence below has the same shape and
      // the same reason (#1360).
      //
      // The last sentence is the one that matters, and it is a claim about the
      // software rather than about anyone's process, so it is true on every
      // tenant: `person_screenings` has columns for a level and two dates and
      // no column any result could be written into.
      ...(surfaces.volunteerScreening
        ? [
            "If you volunteer with us in a role our policy says needs screening — references, a conversation, or a background check — we record only the outcome: which level you were cleared for, the date of the decision, and, where the clearance is time-limited, the date it runs to. That is all this site stores. It holds no reference, no interview, no check, no result of one, and nothing a screening provider sends back.",
          ]
        : []),
      "We also record the IP address a form submission came from and store it with that submission. It is used only to stop spam and abuse — to limit how many times the same sender can submit a form in a short window — and it is deleted when the submission it belongs to is deleted.",
    ],
    "what-we-dont-do": () => [
      bullets([
        "We don't sell, rent, or trade your personal information, and we don't share it with advertisers.",
        "We don't use advertising or cross-site tracking cookies on this site.",
        "We don't take payments or store card details on this site.",
        "We don't publish your information. Names and photos appear on the public site only where someone has agreed to that separately.",
      ]),
    ],
    "how-long-we-keep-it": ({ surfaces }) => [
      "We keep personal information only for as long as we reasonably need it for the purposes described here. When we no longer need it, we delete it, or we strip the personal details and keep only the count — how many people came to an event, how many were there for the first time — which tells us nothing about you.",
      // Only the clocks that can run here (#1291). Every period below is still
      // enforced by the purge for every tenant; this is about which of them
      // this organization's policy has any business publishing.
      bullets(
        RETENTION_POLICIES.filter(
          (policy) => policy.surface === undefined || surfaces[policy.surface],
        ).map((policy) => `**${policy.what}** — ${policy.howLong}`),
      ),
      "These periods are enforced by a scheduled job, not by hand: it runs nightly and removes or anonymizes whatever has passed its date, and keeps a record of what it did so we can check the policy is being applied.",
      "Our database provider also keeps backups of the database so the site can be restored after a failure. A backup is taken daily and kept for 7 days, so information removed from the live site — by the scheduled job or at your request — may persist in a backup for up to 7 days after that. Backups are used only to restore the site, not to look up information that has been deleted.",
      "Some records have to outlive those periods because the law or our own accounting requires it — donation and financial records we need for our reporting and tax filings, for example. A few organizational records, such as tax filings, financial statements, and governance records, we keep permanently. If you ask us to delete your information and something falls into one of those categories, we'll tell you what we have to keep and why.",
    ],
    "who-can-see-it": (org) =>
      paragraphs([
        `Inside ${org.name}, what you submit is visible to the people whose role covers it — the people running events see event registrations, whoever coordinates volunteers sees volunteer applications, and so on. Access is enforced in the database by the permissions attached to each role, not just hidden in the interface.`,
        // True of this software rather than of any organization's practice:
        // `person_screenings` is gated on its own permission and never on the
        // one that covers the rest of the volunteers module (#1360).
        org.surfaces.volunteerScreening &&
          "A screening outcome is held more narrowly still. It is visible only to the people whose role carries the screening permission, which is a separate grant from the one that covers volunteer roles, applications and participation — so coordinating volunteers does not by itself show you who has been screened.",
        // Both halves of this paragraph have to be true for it to be: it is
        // about volunteers seeing registrations.
        org.surfaces.eventRegistrations &&
          org.surfaces.volunteerApplications &&
          "Running an event means the volunteers staffing it may need to see who registered — a check-in list, a head count, who asked for something or noted something we should know about on the day. We don't publish participant lists, and we don't give your name or contact details to a venue, a partner, or a sponsor unless you have agreed to that separately, or the venue requires it to let the group in and we've told you so when you registered.",
        org.surfaces.constituentAccounts &&
          "An account on this site shows you your own record and nothing else. It carries no role here and no access to anyone else's information, and holding one does not admit you to the operations portal.",
        "Outside the organization, we rely on a small number of service providers to run the site. They handle information on our behalf, under their own terms and privacy policies:",
        bullets([
          `**Supabase** — hosts our database and handles ${org.surfaces.constituentAccounts ? "sign-in" : "portal sign-in"}.`,
          "**Vercel** — hosts this website and provides the aggregate traffic counts we use to see which pages get visited.",
          // The `form_analytics` module (#1480); see "cookies-and-analytics".
          org.surfaces.formAnalytics &&
            "**PostHog** — counts page views, how far people get through our forms and a few clicks, such as a donate button, in aggregate. It receives no names, contact details or form answers.",
          "**Resend** — delivers the email this site sends, such as a confirmation or a reply to something you submitted.",
          // Unconditional, unlike Google below: errors happen on every page of
          // every deployment, and there is no per-tenant switch to read. The
          // second sentence is the honest part -- `sendDefaultPii` is left at
          // its default of false, tracing is off and Session Replay is not
          // enabled, so nothing about the person is sent on purpose. Keep the
          // sentence and the configuration in step: turning any of those on
          // makes this bullet false (#1340).
          "**Sentry** — receives a technical report when something on the site goes wrong, so we can find and fix it. Those reports describe the failure rather than you: we don't attach your account details to one, and we don't record your session.",
          org.surfaces.googleSignIn &&
            `**Google** — only if someone chooses to sign in${org.surfaces.constituentAccounts ? "" : " to the portal"} with a Google account.`,
        ]),
        "We'll also share information if we're legally required to, or if it's necessary to protect someone's safety.",
      ]),
    "how-we-protect-it": () => [
      "We use reasonable administrative, technical, and organizational safeguards to protect what you give us: information travels to the site over an encrypted connection, portal accounts are individual rather than shared, and access to each kind of record is limited to the roles that need it and enforced by the database itself.",
      "No website or database is perfectly secure, and we can't promise otherwise. If a breach ever affects your information, we'll tell you and the authorities we're required to tell, as promptly as we can.",
    ],
    "cookies-and-analytics": ({ surfaces }) => [
      "The public site sets no cookies of its own. The one cookie we do set is the session cookie that keeps the people running the organization signed in to the operations portal, and it's only set once someone signs in.",
      // Keep in step with the PostHog options in
      // src/components/analytics/form-analytics.tsx (#1480): cookieless, no
      // person profiles, nothing captured but page views and named events
      // whose properties are allowlisted in src/lib/analytics. The second
      // sentence is the #1714 signals; keep it in step with `SiteEvents`.
      surfaces.formAnalytics
        ? "We use Vercel Web Analytics to count page views, and PostHog to count how many people start and finish our forms, such as event registration, so we can see where a form is hard to finish. PostHog also counts a few clicks and dead ends: a press of a donate button, a link followed to another website (which website, not which page), a page that could not be found (only the first part of its address) and which filter was used in a catalog (not what was picked). Both report in aggregate, set no cookies, store nothing on your device and don't follow you across other websites. Neither receives your name, your contact details or anything you type into a form. We don't run Google Analytics or any advertising analytics on this site."
        : "We use Vercel Web Analytics to count page views. It reports visits in aggregate, sets no cookies and stores nothing on your device, and doesn't follow you across other websites. We don't run Google Analytics or any advertising analytics on this site.",
    ],
    "other-sites": () => [
      "We link out to partner organizations, sponsors, venues, and our own social accounts. Once you follow one of those links you're on someone else's site, and what they collect is covered by their privacy policy, not this one — worth a read before you hand them anything. The same goes for any ticketing or payment service we may use in the future; if we add one, we'll name it here first.",
    ],
    "your-choices": (org) =>
      paragraphs([
        org.surfaces.constituentAccounts &&
          "If you hold an account on this site, the quickest route is to sign in: your own details and which of our emails you get are yours to change there, and what you save takes effect immediately.",
        `Email ${mailto(org.emailPrivacy)} and you can ask us to:`,
        bullets([
          "send you a copy of what we hold about you,",
          "correct anything that's wrong,",
          "delete your information, subject to the records we're required to keep, and",
          "stop emailing you about our events, programs, or volunteering.",
        ]),
        "So that we don't hand your information to someone else, please write from the email address you gave us, or be ready to confirm the details of the submission you're asking about.",
      ]),
    minors: () => [
      "This site isn't directed at children under 13, and we don't knowingly collect their personal information through it. Where a program is open to people under 18, we ask a parent or guardian to complete the forms. If you believe a child has given us information through this site, email us and we'll delete it.",
    ],
    changes: () => [
      "If we start collecting something new or using it differently, we'll update this page and change the date at the top. For a change that materially affects information you've already given us, we'll say so directly rather than relying on you to re-read the page.",
    ],
    contact: (org) => [
      `Questions about this policy, or about anything we hold on you, go to ${mailto(org.emailPrivacy)}. You can also reach us at ${mailto(org.emailGeneral)}.`,
    ],
  },
};

const TERMS: DocumentProse = {
  description: (org) =>
    `The terms you agree to when you use the ${org.name} website, sign up for an event, apply to volunteer${org.surfaces.constituentAccounts ? ", hold an account with us" : ""}, or get in touch.`,
  summary: (org) => [
    `These terms cover this website and the things you can do through it — reading about us, signing up for an event, applying to volunteer, asking for something we offer${org.surfaces.constituentAccounts ? ", holding an account with us" : ""}, and getting in touch. By using the site you're agreeing to them. If you don't agree, please don't use the site.`,
    `The short version: ${org.name} is a nonprofit. Signing up here is a request, not a confirmed spot, and the site itself takes no money.`,
    "How we handle the information you give us is covered separately, in our [privacy policy](/privacy).",
  ],
  sections: {
    "who-we-are": (org) => [
      `${org.name} runs this website. Where these terms refer to our board, organizers, or volunteers, that describes how we govern and run ourselves.`,
      "Our legal and tax status, and whether a contribution to us is tax-deductible, are stated where we ask for support. Nothing on this site should be read as claiming a status we don't hold.",
    ],
    "using-this-site": () => [
      "Use the site for its intended purpose, and please don't:",
      bullets([
        "submit someone else's personal information, or sign someone up for something without their say-so,",
        "submit deliberately false information on a form, including a fake name or an email address that isn't yours,",
        "send harassing, threatening, hateful, or discriminatory content through any form on this site,",
        "try to get into parts of the site you haven't been given access to, including the operations portal, or interfere with how the site runs for anyone else, or",
        "scrape, bulk-download, or automatically submit to the site. We rate-limit form submissions to keep spam out.",
      ]),
      "We may decline or remove a submission, or turn down a request to participate, if it breaks these terms.",
    ],
    // #1295. #859 decided adoption for a site that was a set of one-shot forms.
    // A tenant with `constituent_accounts` on offers a standing credentialed
    // relationship instead, and the platform's terms had no account section at
    // all -- so serving them unconditionally would have published a document
    // that reads as though it governs accounts and does not. It says only what
    // the software does: rule 1 at the top of this file.
    "your-account": ({ surfaces }) =>
      paragraphs([
        "You can create an account on this site to see your own records with us. An account is for that and nothing else: it carries no role here, gives you no access to anyone else's information, and holding one does not admit you to the operations portal.",
        "The account is yours alone. Use an email address you actually control, keep your password to yourself, and don't let anyone else sign in as you — we treat what is done through your account as done by you. Tell us if you think somebody else has got into it.",
        "Asking us to match your account to a record we already hold is a statement about yourself, and somebody here reads it before anything is linked. We may decline a request we can't match, or one we have reason to think isn't yours, and claiming to be someone you aren't is a breach of these terms.",
        "What an account shows you depends on what we record about you and on which parts of this site we are running, and it can change. We may suspend or close an account — if these terms are broken, if the account isn't yours, or if we stop offering accounts at all — and we'll tell you when we do, unless we're prevented from it.",
        "Closing an account doesn't erase our records of you. It ends the sign-in; what we hold about your involvement with us stays under our [privacy policy](/privacy), which is also where you'll find how long we keep it and how to ask for a copy or a deletion.",
        "There is no charge for an account, and nothing here promises we will go on offering them.",
      ]),
    "events-and-programs": () => [
      "Registering through this site is a request for a spot, not a confirmed one. Spots are limited, and we'll confirm by email. Event details — dates, times, locations, and whether an event happens at all — can change. Anything not explicitly included in an event is your own responsibility and your own cost.",
      "Everyone at one of our events is also covered by our code of conduct, which sets out what we expect from each other and how to report a problem.",
      "Participants under 18 may take part only where a parent or legal guardian has completed the required forms and given permission. Individual programs may set additional rules, supervision requirements, age limits, or screening, and those apply on top of these terms. Parental permission on its own doesn't make a program open to a minor.",
    ],
    volunteering: (org) => [
      `Applying to volunteer doesn't create a job, an employment relationship, or a promise of a role, and volunteering with ${org.name} is unpaid. Some roles may require screening before you can take them on. Volunteers act on our behalf only within the role they've been given.`,
    ],
    // #1367. The platform can write this one, unlike the participant waiver:
    // every claim in it is about what the software and the organization
    // running it do *not* do, which is rule 1 of `docs/legal-basis.md`. An
    // organization that catalogs donated equipment and passes it on has not,
    // by doing so, inspected or certified anything, and saying so asserts
    // nothing on its behalf.
    //
    // The first paragraphs are `GEAR_AS_IS_SUMMARY` verbatim, because they are
    // also what somebody reads above the box they tick when they ask for
    // something. Two places saying nearly the same thing about liability is
    // the failure mode worth spending a test on, so there is one constant and
    // `legal-defaults.test.ts` holds this section to it.
    "items-we-give-away": () => [
      ...GEAR_AS_IS_SUMMARY,
      "Where you ask us for something through this site, we show you this before you ask, and we keep a record that you saw it alongside the request.",
    ],
    "accessibility-and-inclusion": () => [
      "We want our programs, events, and communications to be welcoming and usable. If you need an accommodation to take part in something — at an event, on this site, or in how we contact you — tell us and we'll work with you to find a reasonable way to make it happen. If something here is inaccessible, we'd rather hear about it than not.",
    ],
    "educational-content": () => [
      "Articles and guides on this site are informational starting points, not personalized advice, instruction, or a certification program. For anything involving safety, equipment, or an injury, check with a qualified professional.",
    ],
    "donations-and-payments": () => [
      "This site doesn't take payments and doesn't store card details. If that changes, we'll update this page and the privacy policy first, and we'll be explicit about our tax status at that time.",
    ],
    "photos-and-content": (org) => [
      `The text, images, logo, and design on this site belong to ${org.name} or the people who made them, and are used here with permission. Please don't reuse them commercially or in a way that suggests we endorse you. You're welcome to link to us, and to share our event and program pages as they are.`,
      "We take photos and video at events and use them for our own communications. If you'd rather not be photographed, tell any organizer at the event — that holds for the rest of it — or tell us before or after, and we keep it on the record so the people running the event know. For anyone under 18, a parent or guardian can say the same on their behalf.",
      `If a photo of you appears on this site or on one of our social media accounts and you'd rather it didn't, email ${mailto(org.emailGeneral)} and we'll take it down. We can only remove things we control — once an image has been shared onward by someone else, that's out of our hands.`,
      "You keep ownership of anything you send us — a message, an application, a request. You're giving us permission to use, store, and share it as far as we reasonably need to in order to answer you, run the program you contacted us about, and keep our records.",
    ],
    "other-sites-and-venues": () => [
      "We link to partners, venues, and other organizations. We don't control those sites or venues and aren't responsible for their content, their terms, their safety practices, or how they handle your information.",
    ],
    "other-agreements": () => [
      "These terms cover this website. Separate agreements cover separate activities — event waivers and participation agreements, volunteer agreements, our code of conduct, and any rules a venue sets. Where one of those applies to something you're doing, it governs that activity, and nothing on this page replaces it or waives it on your behalf.",
    ],
    "no-warranties": () => [
      "We provide this site as-is. We can't promise it will always be available, up to date, accurate, or free of errors, and we don't make any warranty about it beyond what the law requires of us.",
    ],
    "limitation-of-liability": (org) => [
      `To the fullest extent the law allows, ${org.name} and its board members, volunteers, and organizers aren't liable for indirect or consequential losses arising from your use of this site.`,
      "Nothing here limits any liability that can't be limited by law, and nothing here is a waiver of your rights in connection with an in-person event — those are addressed by the agreements described under [other agreements](#other-agreements), where they apply.",
    ],
    indemnification: (org) => [
      `To the fullest extent the law allows, you agree to be responsible for claims, losses, damages, and reasonable expenses that arise from your breach of these terms, your misuse of this site, or your intentional or negligent conduct in connection with our activities — except to the extent they were caused by ${org.name}'s own negligence, or by anything we can't lawfully disclaim responsibility for.`,
    ],
    changes: () => [
      "We'll update this page when things change, and change the date at the top. For a change that materially affects something you've already signed up for, we'll tell you directly rather than relying on you to re-read the page.",
    ],
    severability: () => [
      "If any part of these terms turns out to be unenforceable, the rest stays in effect to the fullest extent the law allows.",
    ],
    contact: (org) => [
      `Questions about these terms go to ${mailto(org.emailGeneral)}.`,
    ],
  },
};

const CODE_OF_CONDUCT: DocumentProse = {
  description: (org) =>
    `What we expect from everyone at ${org.name} events and in our spaces, what isn't tolerated, and how to report a problem.`,
  summary: (org) => [
    `This page is what we expect from each other at ${org.name}, what we won't accept, and what to do when something goes wrong.`,
    "It applies to everyone — participants, guests, volunteers, board members, partners, and sponsors — at every event we run, in the spaces and group chats we host, on our social accounts, and any time you're representing us or acting on our behalf. What you say in your own life is your own business; this is about the spaces we run and the times you're standing in for us.",
    `Something happened? At an event, find any of our organizers or volunteers. Any time, email ${mailto(org.emailConduct)}. You don't need to be certain, be the person it happened to, or have proof.`,
  ],
  sections: {
    "what-we-expect": () => [
      bullets([
        "Treat people the way they ask to be treated. Use the name and pronouns someone gives you. If you get it wrong, correct yourself and move on — a short apology is better than a long one.",
        "Assume a range of experience. Beginners are the point, not an inconvenience.",
        "Ask before you touch someone or their belongings. Ask before you photograph or film them, and stop if they say no.",
        'Take "no" the first time — about an activity, a drink, a photo, a ride home, a conversation, a number.',
        "Look after the people around you. If someone seems isolated, unwell, in over their head, or uncomfortable, check in.",
        "Respect people's privacy. What someone tells you about themselves — their identity, their health, their story — stays with you unless they've said otherwise. The only exceptions are narrow: passing something on to deal with a safety concern, or because we're legally required to.",
      ]),
      "We take photos and video at events for our own newsletters, site, and social accounts. You can tell any organizer you'd rather not be photographed, and that holds for the rest of the event — you don't have to give a reason, and nobody will ask you for one. You can also tell us before or after, and our terms of use set out how to get a photo taken down.",
    ],
    "what-isnt-tolerated": () => [
      "**How we treat each other**",
      bullets([
        "Harassment or discrimination based on gender identity or expression, sexual orientation, race, ethnicity, national origin, religion, disability, body size, age, health status, or socioeconomic status.",
        "Deliberate misgendering, deadnaming, or pressing someone about their body, their health, or how they identify.",
        "Outing anyone — to this group, to their family, to their employer, or online. This includes tagging people in photos from an event without asking.",
        'Unwanted sexual attention, sexual comments, or touching. Flirting that continues after a "no" is harassment.',
        "Photographing or filming someone who has asked you not to, or posting a photo of someone who has asked you to take it down.",
        "Intimidation, stalking, following someone, or repeated unwanted contact after an event.",
        "Retaliating against someone for making a report or supporting someone who did.",
      ]),
      "**Staying safe**",
      bullets([
        "Violence, threats of violence, or encouraging either.",
        "Carrying a weapon where the law, the venue, or we don't allow it. If you're not sure, the answer at one of our events is no.",
        "Taking part impaired, or behaving in a way that puts other people at risk.",
        "Ignoring venue staff or emergency personnel.",
      ]),
      '"It was a joke" is not a defense. The effect on the person matters more than the intent behind it.',
    ],
    "reporting-a-problem": (org) => [
      "If something happens, tell us. You don't need to be certain, be the person it happened to, or have proof.",
      "**At an event:** find any of our organizers or volunteers. They can move you away from a situation, stay with you, or handle it on the spot.",
      `**Any time:** email ${mailto(org.emailConduct)}. Tell us what happened, roughly when, and what you'd like to see happen — and say if you'd rather a particular person not be involved in handling it.`,
      "You can report anonymously if you'd rather — leave your name out of the email, or ask an organizer to pass something on without attaching you to it. It's a real option and people should use it if they need it. It does cost something: we can't come back to you with questions or tell you what came of it, and that sometimes limits what we're able to do.",
      "Reporting in good faith is protected, whatever we end up concluding. If we can't establish what happened, that is not the same as deciding you lied, and nobody will be treated as though it were. Knowingly making a false report, or lying to us during a review, is a different thing — it hurts the person it's aimed at and the trust this whole process depends on, and we'll handle it under this code like anything else here.",
      "In an emergency, or if someone is in immediate danger, call your local emergency number first. We'll deal with the rest afterward.",
    ],
    "how-we-handle-a-report": () => [
      "We aim to acknowledge a report promptly. Where it is practicable, more than one person reviews it, and anyone with a personal stake in it steps out of the process. Where that isn't possible, we'll tell you, and find someone outside the organization.",
      "We share what you told us only with the people who need it to respond, and we'll tell you before we share it more widely than that. We won't contact anyone else about it without checking with you first, unless someone is in danger or we're legally required to. What we can't promise is secrecy: looking into something usually means talking to the person it's about, and sometimes to witnesses.",
      "Depending on what we find, the response can be a conversation, a warning, being asked to leave an event, being removed from a volunteer or organizational role where our governing documents allow it, or being barred from our events for a period or for good. We'll tell you what we did about your report, as far as we're able. We won't share the private details of someone else's situation, and asking us to won't change that.",
      "We can act on urgent safety concerns immediately, before a full review, and we can decline to keep anyone at an event. We'd rather lose an attendee than lose the room.",
    ],
    "if-you-disagree": (org) => [
      `If you were the subject of a report and you think we got it wrong, you can ask for a second look. Email ${mailto(org.emailConduct)} within a reasonable time of our decision and tell us what you think we missed. It gets reviewed by people who weren't part of the original decision, or — if there aren't any — by someone outside the organization.`,
      "We won't reverse a decision just because someone is unhappy with it, and anything we did for immediate safety stays in place while an appeal is looked at. But everyone gets one honest second look.",
    ],
    questions: (org) => [
      `Questions about this code — including suggestions for improving it — go to ${mailto(org.emailGeneral)}. Please use ${mailto(org.emailConduct)} for reports, so they don't sit in a general inbox.`,
    ],
  },
};

/**
 * The accessibility statement (#1368).
 *
 * The one document here whose factual claims are about this repository's own
 * testing, which makes rule 1 unusually easy to satisfy and unusually easy to
 * get wrong in the flattering direction. Two things are load-bearing and have
 * to survive any edit:
 *
 *   * **The conformance claim is partial, and the basis is stated.** An
 *     automated check finds a minority of the barriers on a page, and no full
 *     manual screen-reader pass has been done across the site --
 *     `docs/a11y-scan-findings.md` says so in its own words. "Aims to meet
 *     WCAG 2.2 AA", with no basis given, is the same overclaim in nicer
 *     clothes. Overclaiming conformance to a disabled reader is not a neutral
 *     error.
 *   * **It is scoped to the public website, explicitly rather than by
 *     silence.** Every entry in `e2e/a11y-baseline.json` today is a portal
 *     route, and a reader left to assume the wider reading would be reading a
 *     claim nobody made. `legal-defaults.test.ts` holds the two sentences that
 *     depend on that being true, so a public route joining the baseline fails a
 *     test rather than leaving a false statement published.
 *
 * Three things only the organization can answer -- who to contact, what it
 * commits to when it is told, and whether its own events and venues are
 * accessible. So the prose carries no response time and no promise a tenant has
 * not made, and the Site Content slot description is what names those as the
 * parts to replace.
 */
const ACCESSIBILITY: DocumentProse = {
  description: (org) =>
    `What ${org.name} aims for on this website, how it is tested, what we know is not there yet, and how to tell us when something here gets in your way.`,
  summary: (org) => [
    `${org.name} wants this website to work for everyone who comes to it — including people using a screen reader, a keyboard and no mouse, magnification, speech input, or a browser set to larger text, higher contrast or less motion.`,
    "The standard we build and test against is WCAG 2.2 Level AA. **We are not claiming we have met it.** What we can tell you is what is tested, how, and what that testing cannot see — which is the rest of this page, so that you can weigh the claim rather than take our word for it.",
    `If something here gets in your way, tell us at ${mailto(org.emailGeneral)}. You don't need to know what the problem is called or which rule it breaks.`,
  ],
  sections: {
    "what-we-aim-for": () => [
      "Our target is Level AA of the [Web Content Accessibility Guidelines](https://www.w3.org/TR/WCAG22/) version 2.2 — WCAG, the W3C's standard for what makes a web page usable by people with disabilities. Among a great many other things, that means every page can be operated with the keyboard alone, text and controls meet a minimum contrast, images carry a text alternative, form fields have real labels, and nothing depends on your seeing a colour, hearing a sound or noticing a movement.",
      "**This statement covers this public website.** It does not cover the signed-in area our staff and volunteers use to run the organization. That area is built from the same components and checked the same way, but it has known problems this website does not, and folding the two together would tell you something that isn't true of either.",
    ],
    "how-we-test": () => [
      "Every page of this site is checked automatically before a change to it can be released, and that check is broader than a one-off audit:",
      bullets([
        "**Every page, not a sample.** The list of pages to check is derived from the site itself rather than kept by hand, so a page added today is covered today.",
        "**The whole rule set.** The checks run the axe-core rules for WCAG 2.0, 2.1 and 2.2, at levels A and AA.",
        "**Both themes, both sizes.** Light and dark, phone width and desktop width — a contrast failure or a tap target that is too small can exist in one and not the other.",
        "**What only exists once you open it.** Dialogs, slide-over panels, dropdowns, tab panels and the error state of a form are opened and checked too, not just the page as it first loads.",
        "**A written record of what is already known.** Outstanding failures are listed in the code, and a failure that is not on that list stops the release — so something that has been fixed cannot quietly come back.",
      ]),
      "Alongside that, parts of the site have been worked through with the keyboard alone, and the shared controls most likely to trap somebody — the dropdown menus among them — have keyboard tests of their own that run with everything else.",
      "**Every accessibility failure we currently know about is in the staff area, not on this public website.**",
    ],
    "what-we-know-isnt-there-yet": () => [
      "**An automated check finds a minority of the barriers that exist.** It can tell that an image has no text alternative; it cannot tell whether the alternative somebody wrote is any good, whether a page's headings make sense read aloud, whether an error message says what to do next, or whether a form can actually be completed by someone who cannot see it. Those need a person.",
      "**No full screen-reader pass has been done across this site.** Keyboard operation has been checked by hand in places, and individual components have been fixed after being tested that way. A complete pass over every page with VoiceOver or NVDA has not happened.",
      "**So our conformance claim is partial rather than complete.** Partial is the accurate word for a claim resting on thorough automated coverage and incomplete manual coverage, and we would rather give you that than a headline you can't check.",
      "A page can also regress between releases in a way the automated checks do not catch. If you hit something, the fastest route to it being fixed is you telling us.",
    ],
    "where-this-statement-stops": () => [
      "Some of what you meet on this site is outside what the testing above reaches, and it is better to say so than to let the claim cover it:",
      bullets([
        "**Where a link takes you.** We link to partners, venues and other organizations. We choose what to link and we can stop linking it, but we do not control how those sites are built and make no claim about them.",
        "**Documents rather than pages.** If we link a PDF, a spreadsheet or a slide deck, it is not covered by the checks above and may not be accessible at all. Ask us and we will find another way to get you what is in it.",
        "**What is typed into the site.** The words, the images and the descriptions of those images are written by people at our organization. The software makes an accessible page possible; it cannot make a photograph's description a good one.",
        "**Our events, our venues and anything on paper.** Whether a building has step-free access, whether a room has a hearing loop, whether an activity can be adapted — none of that is a question about this website, and this page cannot answer it. Ask us before you come.",
      ]),
    ],
    "telling-us-about-a-problem": (org) => [
      `Email ${mailto(org.emailGeneral)}. Tell us which page you were on, what you were trying to do and what happened instead. If you know what you were using — a screen reader and which one, the keyboard alone, magnification, voice control, a phone rather than a computer — that helps us reproduce it, but none of it is required. "The menu doesn't open when I press Enter" is a perfectly good report.`,
      "You are not complaining, and you do not need to be sure the fault is ours. We would rather look into something and find it was not than never hear about it.",
      "If a barrier here is stopping you doing what you came here to do, say so, and tell us how to reach you. We would rather get you there another way while the page is being fixed than leave you waiting for it.",
    ],
    "when-this-was-last-reviewed": () => [
      "The date at the top of this page is when this text last changed.",
      "The automated part of what it describes is not an audit from an earlier date: it runs against every change to this site, so what is written above about testing is true of the version you are reading now.",
      "The parts only a person can do — the screen-reader pass, and whether the words on our pages read well aloud — are the parts a date matters for. When that work is done, this page is where it will be written down.",
    ],
  },
};

const PLATFORM_LEGAL_PROSE: Record<string, DocumentProse> = {
  "legal.privacy": PRIVACY,
  "legal.terms": TERMS,
  "legal.code_of_conduct": CODE_OF_CONDUCT,
  "legal.accessibility": ACCESSIBILITY,
};

/** The `legal.*` slot keys the platform has a document for. */
export const PLATFORM_LEGAL_SLOT_KEYS = Object.keys(PLATFORM_LEGAL_PROSE);

function prose(slotKey: string): DocumentProse {
  const found = PLATFORM_LEGAL_PROSE[slotKey];
  if (!found) throw new Error(`No platform document for ${slotKey}`);
  return found;
}

/**
 * The platform's document for a `legal.*` slot, named for this organization.
 *
 * The section order and headings come from `LEGAL_DOCUMENT_OUTLINES` and the
 * prose is looked up by id, so a heading with no prose is a build-time-visible
 * mistake rather than an empty section on a published page.
 *
 * A section whose `requires` surface is off is removed from the outline before
 * that lookup happens (#1291), so it takes its heading, its anchor and its
 * entry in the section rail with it. The "prose must exist" throw is unchanged
 * for every section that survives.
 */
export function platformLegalDocument(
  slotKey: string,
  org: LegalOrgContext,
): LegalDocumentContent {
  const outline = LEGAL_DOCUMENT_OUTLINES[slotKey];
  const { sections } = prose(slotKey);
  // Over the whole document rather than the one section that needs it
  // (#1367): a `{item_plural}` that survived into a published legal page is a
  // brace on screen, and `applyLexicon` is a no-op on a string with no
  // placeholder in it.
  const named = (text: string) => applyLexicon(text, org.lexicon);
  return {
    title: named(outline.title),
    last_updated: PLATFORM_LEGAL_LAST_UPDATED,
    summary: applyLexiconAll(prose(slotKey).summary(org), org.lexicon),
    sections: outline.sections
      .filter(
        (section) =>
          section.requires === undefined || org.surfaces[section.requires],
      )
      .map((section) => {
        const write = sections[section.id];
        if (!write) {
          throw new Error(`No prose for ${slotKey} section "${section.id}"`);
        }
        // `requires` is outline metadata, not content: the published document
        // carries an id, a title and prose and nothing else.
        return {
          id: section.id,
          title: named(section.title),
          paragraphs: applyLexiconAll(write(org), org.lexicon),
        };
      }),
  };
}

/** Search and link-preview description for the platform's own document. */
export function platformLegalDescription(
  slotKey: string,
  org: LegalOrgContext,
): string {
  return applyLexicon(prose(slotKey).description(org), org.lexicon);
}
