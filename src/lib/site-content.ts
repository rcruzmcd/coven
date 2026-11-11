/**
 * The content model for the public site (#707 Phase 4).
 *
 * Every piece of organization-specific copy on the public site is a *slot*:
 * a key, a page it belongs to, a type, and a default. A tenant with no
 * `site_content` rows renders those defaults, and a provisioned tenant starts
 * from a complete site it rewrites slot by slot from Administration > Site
 * Content rather than from a blank page.
 *
 * The defaults used to be Chatter Snow's copy, because this registry was
 * extracted from its pages. That made a newly provisioned nonprofit's public
 * site another organization's -- its headline, its mission, and, in
 * `about_team.members`, real people's names and biographies. Provisioning
 * deliberately copies no site content, and `org`, `home`, `contact` and
 * `events` carry no visibility gate, so that was public from the moment the
 * tenant existed. Chatter Snow now holds its copy in its own rows (#795
 * rollout step 3) and the defaults are prompts: they read as unwritten, which
 * is the honest thing for a site nobody has written yet to look like.
 *
 * The four pages the platform wrote about itself are the deliberate exception,
 * and the reason is narrow: their slots describe the *platform* rather than the
 * organization, and their routes are hidden for every tenant until somebody
 * turns them on. A default that speaks for the platform is the platform's own
 * to write. It still names no product and no company -- see the block above
 * those slots. They are the two audience paths (#1328), the module tour
 * (#1329) and the price list (#1330).
 *
 * The exception stops at anything only *this deployment* knows. A destination
 * is a host and a price is a commercial term, so `*.ctas`, `pricing.plans`'
 * figures and the onboarding fee are the platform tenant's own rows
 * (20260920030000 and its predecessor) rather than defaults every operator
 * would inherit -- see the comment over `pricing.plans`.
 *
 * Only the slots that *named or described* an organization were rewritten.
 * "Get in touch" and "Meet the team" are product chrome that happens to live
 * in a slot -- every organization has a contact page and a team -- and
 * replacing them with prompts would make an unwritten site worse rather than
 * more neutral.
 *
 * "Gear library" was filed under that heading too, and that was the wrong line
 * (#896). It is not chrome: it names *what the organization lends*, which is
 * exactly the thing that differs between tenants. So a default may carry a
 * `{term}` placeholder from the lexicon registry in `src/lib/lexicon.ts`, and
 * `resolveSiteContent` resolves it against the tenant's own words -- an
 * organization that has said it runs a tool library does not then have to
 * retype every heading that contains the word. Placeholders are resolved in
 * *defaults only*: a stored value is the tenant's own writing, and a brace in
 * it is a brace they typed.
 *
 * What is deliberately *not* a slot: the sizing tables (Chatter Snow's, gated
 * to that tenant by #831), the form labels and validation messages (product
 * chrome), and the structure of the pages themselves. The legal documents are
 * a special case -- see `document` below.
 *
 * The Learn guides were on that list until #894, described as "generic
 * snow-sports material any organization can publish as-is". That did not hold:
 * `mountain-basics` and `park-riding-safety` are generic *within snow sports*,
 * and this is not a snow-sports platform. They are now a collection of their
 * own -- `article_categories` and `articles`, modelled in
 * `src/lib/articles.ts` -- because a registry of fixed keys cannot hold an
 * unbounded number of rows a tenant creates.
 *
 * The photos are slots too (#812): an `image` slot is the picture that sits
 * beside a section's copy, keyed `site_images.<slot>` and stored in the same
 * table, so it is drafted, published and reverted exactly as the words are.
 * Its default is always null -- the placeholder icon -- and the public site
 * reads them through `getSiteImageUrls()` in `src/lib/site-images.ts`, which
 * strips the prefix; `about_team.members`' `photo_slot` field names the short
 * form for the same reason.
 *
 * This module is imported by the editor, a client component, so it stays
 * free of server-only imports; the database read lives in
 * `src/lib/public-site.ts`.
 */

import type { Json } from "@/lib/supabase/types";
import { isRenderableImageSrc, resolveImageUrl } from "@/lib/inventory";
import { isPublishableHref } from "@/lib/legal-markup";
import type { CollectionSurface } from "@/lib/legal-surface";
import {
  DEFAULT_LEXICON,
  applyLexicon,
  applyLexiconAll,
  type Lexicon,
} from "@/lib/lexicon";

export type ContentPage = {
  key: string;
  label: string;
  /**
   * The page's own route. Several pages span more than one -- Get Involved
   * carries four, Support three -- so this is only where a section that says
   * nothing else renders; `ContentSection.route` is the precise answer.
   */
  route: string;
  /**
   * The `PUBLIC_PAGE_SLOTS` key in `src/lib/page-visibility.ts` that decides
   * whether this page is live, so the editor can say when copy is being
   * written for a page nobody can reach. Unset where nothing gates the page:
   * `org` and `home` are the site itself, and the legal pages deliberately
   * carry no visibility slot (see `src/app/(public)/privacy/layout.tsx`).
   */
  visibilityKey?: string;
};

export const CONTENT_PAGES: readonly ContentPage[] = [
  { key: "org", label: "Organization", route: "/home" },
  { key: "home", label: "Home", route: "/home" },
  // The two audience paths (#1328). One page shape, two routes, two
  // vocabularies -- see `src/app/(public)/audience-page.tsx`.
  {
    key: "audience_nonprofits",
    label: "For nonprofits",
    route: "/nonprofits",
    visibilityKey: "audiences",
  },
  {
    key: "audience_business",
    label: "For business",
    route: "/business",
    visibilityKey: "audiences",
  },
  // The module tour (#1329) and the price list (#1330), the audience paths'
  // neighbours in the nav and in this registry. Separate visibility slots:
  // each becomes publishable at its own moment.
  {
    // `module_tour` rather than `modules`, though the route and the visibility
    // slot are both `modules`: the page's list slot is the modules, and
    // `modules.modules` is a key nobody would read twice the same way.
    key: "module_tour",
    label: "What it does",
    route: "/modules",
    visibilityKey: "modules",
  },
  {
    key: "pricing",
    label: "Pricing",
    route: "/pricing",
    visibilityKey: "pricing",
  },
  {
    key: "about_story",
    label: "About: Our Story",
    route: "/about/story",
    visibilityKey: "about",
  },
  {
    key: "about_mission",
    label: "About: Mission & Values",
    route: "/about/mission",
    visibilityKey: "about",
  },
  {
    key: "about_team",
    label: "About: Meet the Team",
    route: "/about/team",
    visibilityKey: "about",
  },
  { key: "events", label: "Events", route: "/events", visibilityKey: "events" },
  {
    key: "publications",
    label: "Publications",
    route: "/publications",
    visibilityKey: "publications",
  },
  {
    key: "programs",
    label: "Programs",
    route: "/programs",
    visibilityKey: "programs",
  },
  { key: "learn", label: "Learn", route: "/learn", visibilityKey: "learn" },
  {
    key: "gears",
    label: "Gear",
    route: "/inventory",
    visibilityKey: "gears",
  },
  {
    key: "get_involved",
    label: "Get Involved",
    route: "/get-involved",
    visibilityKey: "get-involved",
  },
  {
    key: "support",
    label: "Support",
    route: "/support",
    visibilityKey: "support",
  },
  {
    key: "contact",
    label: "Contact",
    route: "/contact",
    visibilityKey: "contact",
  },
  { key: "brand", label: "Brand", route: "/brand", visibilityKey: "brand" },
  { key: "links", label: "Links", route: "/links", visibilityKey: "links" },
  { key: "legal", label: "Legal documents", route: "/privacy" },
] as const;

/**
 * A group of slots that read as one thing on the page -- a heading and the
 * body under it, a card and its list. The 86 slots are not a flat list to
 * anyone editing them: `get_involved` is six sections of heading-plus-body,
 * and rendering them as fifteen siblings left the pairing to be inferred from
 * adjacent labels (#792).
 *
 * `route` matters as much as the grouping. `ContentPage.route` is one route
 * per page, but four pages span several -- Get Involved's slots render across
 * `/get-involved`, `/get-involved/attend`, `/get-involved/partner` and
 * `/get-involved/volunteer` -- so a single "view on the site" link pointed at
 * the wrong page for most of them. Every route below was read off the public
 * page that actually reads the slot.
 */
export type ContentSection = {
  key: string;
  page: string;
  label: string;
  description?: string;
  /** Where this section renders, when it is not the page's own route. */
  route?: string;
};

export const CONTENT_SECTIONS: readonly ContentSection[] = [
  {
    key: "org:identity",
    page: "org",
    label: "Identity",
    description: "How the organization names and describes itself site-wide.",
  },
  {
    key: "org:contact",
    page: "org",
    label: "Contact details",
    description: "The addresses and handles published in the footer.",
    route: "/contact",
  },
  {
    key: "org:security",
    page: "org",
    label: "Security reporting",
    description:
      "Where a security researcher should send a report. Published at /.well-known/security.txt, the path scanners and researchers look for. Leave the address blank and no file is served -- better than pointing a reporter somewhere nobody reads.",
    route: "/.well-known/security.txt",
  },

  { key: "home:hero", page: "home", label: "Hero" },
  {
    key: "home:next_event",
    page: "home",
    label: "Upcoming events",
    description:
      "The heading over the upcoming events on the homepage, the link through to the full events listing, and the ribbon on the soonest one. When nothing of your own is upcoming, the ribbon labels the next community calendar item instead.",
  },

  {
    key: "audience_nonprofits:hero",
    page: "audience_nonprofits",
    label: "Hero",
  },
  {
    key: "audience_nonprofits:modules",
    page: "audience_nonprofits",
    label: "What it covers",
    description:
      "One section per part of the platform, in the order they appear. Governance leads here and is deliberately absent from the business page.",
  },

  { key: "audience_business:hero", page: "audience_business", label: "Hero" },
  {
    key: "audience_business:modules",
    page: "audience_business",
    label: "What it covers",
    description:
      "One section per part of the platform, in the order they appear, in the vocabulary a business uses for them.",
  },

  { key: "module_tour:hero", page: "module_tour", label: "Hero" },
  {
    key: "module_tour:sections",
    page: "module_tour",
    label: "What it covers",
    description:
      "One section per part of the platform, in the order they appear. The closing note is the argument the page is making -- that the combination is the thing, not any one part of it.",
  },

  { key: "pricing:hero", page: "pricing", label: "Hero" },
  {
    key: "pricing:plans",
    page: "pricing",
    label: "Plans",
    description:
      "The plan cards, in the order they appear. A plan with no price written is a card with a blank where the number goes, which is why this page stays hidden until the numbers are yours.",
  },
  {
    key: "pricing:details",
    page: "pricing",
    label: "What every plan includes",
    description:
      "What is true of all the plans, and what setting the system up costs on top of them.",
  },

  { key: "about_story:opening", page: "about_story", label: "Opening" },
  { key: "about_story:story", page: "about_story", label: "Our story" },

  { key: "about_mission:mission", page: "about_mission", label: "Mission" },
  { key: "about_mission:values", page: "about_mission", label: "Values" },
  { key: "about_mission:why", page: "about_mission", label: "Why we exist" },

  { key: "about_team:team", page: "about_team", label: "The team" },

  { key: "events:listing", page: "events", label: "Events listing" },
  { key: "events:registration", page: "events", label: "Registration" },
  {
    key: "events:community",
    page: "events",
    label: "Community calendar",
    route: "/events/community",
  },
  {
    key: "events:media_uploads",
    page: "events",
    label: "Photo and video upload links",
    description:
      "Shown on the page an event's upload link opens, for a photographer or videographer without a portal account.",
  },

  {
    key: "publications:print",
    page: "publications",
    label: "Print at home",
    description:
      "Shown beside an issue's “Print at home” download, on every issue that has one.",
  },

  { key: "programs:opening", page: "programs", label: "Opening" },
  { key: "programs:pillars", page: "programs", label: "Pillars" },
  { key: "programs:items", page: "programs", label: "Programs" },

  { key: "learn:opening", page: "learn", label: "Opening" },

  { key: "gears:library", page: "gears", label: "Catalog" },
  {
    key: "gears:donate",
    page: "gears",
    label: "How donating works",
    route: "/inventory/donate",
  },
  {
    key: "gears:request",
    page: "gears",
    label: "Requesting gear",
    route: "/inventory/donate",
  },
  {
    key: "gears:accept",
    page: "gears",
    label: "What we accept",
    route: "/inventory/donate",
  },
  {
    key: "gears:drives",
    page: "gears",
    label: "Gear drives",
    route: "/inventory/donate",
  },

  { key: "get_involved:opening", page: "get_involved", label: "Opening" },
  { key: "get_involved:sponsor", page: "get_involved", label: "Sponsor" },
  { key: "get_involved:gear", page: "get_involved", label: "Donate gear" },
  {
    key: "get_involved:attend",
    page: "get_involved",
    label: "Attend",
    route: "/get-involved/attend",
  },
  {
    key: "get_involved:community",
    page: "get_involved",
    label: "Community",
    route: "/get-involved/attend",
  },
  {
    key: "get_involved:partner",
    page: "get_involved",
    label: "Partner",
    route: "/get-involved/partner",
  },
  {
    key: "get_involved:volunteer",
    page: "get_involved",
    label: "Volunteer",
    route: "/get-involved/volunteer",
  },

  { key: "support:opening", page: "support", label: "Opening" },
  {
    key: "support:donations",
    page: "support",
    label: "Donations",
    route: "/support/donations",
  },
  {
    key: "support:sponsorship",
    page: "support",
    label: "Sponsorship",
    route: "/support/sponsorship",
  },

  { key: "contact:opening", page: "contact", label: "Opening" },

  {
    key: "brand:opening",
    page: "brand",
    label: "Opening",
    description:
      "The introduction to the brand guide. Everything below it on the page -- the palette, the accent gradient, the logo and the type specimens -- is read from the colours and copy set elsewhere in Administration and is not edited here.",
  },
  {
    key: "brand:usage",
    page: "brand",
    label: "Usage",
    description:
      "The judgements a palette cannot express: how the organization talks, how its name is written, and what may and may not be done to the logo.",
  },

  {
    key: "links:page",
    page: "links",
    label: "Links",
    description:
      "The page a social profile's single bio link points at. Everything here is a whole page of its own -- it is not shown in the site's navigation, so the only way anyone reaches it is the link you publish.",
  },

  {
    key: "legal:documents",
    page: "legal",
    label: "Documents",
    description:
      "The text of each document. Whether it is served at all is a separate decision, in Website > Legal documents: the terms, the code of conduct and the accessibility statement are published once your organization has adopted them, the participant waiver once you have written one, and the privacy policy always is (#859).",
  },
] as const;

type ListFieldBase = {
  key: string;
  label: string;
  /** Left blank in the editor when unset; a text field is otherwise required. */
  optional?: boolean;
};

/**
 * A `photo` field: the one control a row's picture is set from.
 *
 * The field stores a URL, and the image slot it may point at instead lives in
 * a *sibling* field, because the site's precedence -- the row's own URL, then
 * the slot it names, then a shared fallback -- is load-bearing for a tenant
 * who set a link directly. Those two used to be asked as two independent
 * free-text boxes, with the precedence documented nowhere near them and the
 * slot name typed by hand: a typo fell through to the fallback silently, and
 * neither box previewed anything (#922).
 */
export type PhotoListField = ListFieldBase & {
  kind: "photo";
  /** The sibling field holding the chosen image slot's short name. */
  slotField: string;
  /**
   * Image slots whose short name starts with this are the choices offered.
   * The registry is the source of truth for those names, so the editor can
   * offer a select over real slots rather than a box to mistype one into.
   */
  slotPrefix: string;
  /** The image slot used when the row names neither a URL nor a slot. */
  fallbackSlot: string;
  /** The aspect the public site crops the photo to, as a CSS ratio. */
  ratio: string;
};

export type ListField =
  | (ListFieldBase & {
      /**
       * `url` is a text field the editor offers as a URL box and that
       * `isPublishableHref()` has to accept, so a destination an editor typed
       * wrong -- or a scheme nobody should be able to publish -- is refused on
       * the way in rather than rendered as an `href` on a public page (#937).
       *
       * `boolean` is a switch. It exists because a list whose rows are *shown
       * or hidden* rather than added and removed has no way to say so
       * otherwise, and deleting a row to hide it for a month is not the same
       * thing.
       */
      kind: "text" | "paragraphs" | "url" | "boolean";
    })
  | PhotoListField;

export type ListItem = Record<string, string | string[] | boolean>;

/** One section of a structured legal document. */
export type LegalDocumentSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

/**
 * A whole legal page as data: the shape `LegalPageShell` renders.
 *
 * Both kinds of document are this shape since #858 -- the platform's neutral
 * default, built in `src/lib/legal-defaults.ts`, and whatever a tenant
 * publishes in its place. Paragraphs may carry the small markup
 * `src/lib/legal-markup.ts` parses: bullets, links and bold, and nothing else.
 */
export type LegalDocumentContent = {
  title: string;
  last_updated: string;
  summary: string[];
  sections: LegalDocumentSection[];
};

/**
 * The shape of the platform's own document: its title and the headings it is
 * organized under, in order.
 *
 * `src/lib/legal-defaults.ts` writes one block of prose per id here and refuses
 * to build a document if the two lists disagree, so the outline the Site
 * Content editor offers and the document the site serves cannot drift (#792).
 * It lives here rather than beside the prose because the editor is a client
 * component that needs the headings without the text.
 *
 * The questions a document has to answer are only the ones the platform can
 * answer for any organization (#858). Snow-sports risk, the gear library, what
 * happens on the mountain and a specific governing law were all headings here
 * while these were Chatter Snow's documents; they are now sections of Chatter
 * Snow's own published document rather than of the platform's default.
 */
export type LegalDocumentOutlineSection = {
  id: string;
  title: string;
  /**
   * The collection surface this section is about (#1291). A section with no
   * `requires` is unconditional; one that names a surface is filtered out of
   * the platform's document -- outline and all -- when that surface is off, so
   * a tenant that runs no events does not publish a heading about them and the
   * section rail does not point at an anchor that is not there.
   *
   * Filtered out of the *outline* rather than answered with an empty array on
   * purpose: `platformLegalDocument()` throws on a section with no prose, which
   * is what makes a heading with no body a build-visible mistake, and that
   * throw stays exactly as it is for everything surviving the filter.
   */
  requires?: keyof CollectionSurface;
};

export type LegalDocumentOutline = {
  title: string;
  sections: readonly LegalDocumentOutlineSection[];
};

export const LEGAL_DOCUMENT_OUTLINES: Record<string, LegalDocumentOutline> = {
  "legal.privacy": {
    title: "Privacy Policy",
    sections: [
      { id: "what-we-collect", title: "What we collect, and why" },
      { id: "what-we-dont-do", title: "What we don’t do" },
      { id: "how-long-we-keep-it", title: "How long we keep it" },
      { id: "who-can-see-it", title: "Who can see it" },
      { id: "how-we-protect-it", title: "How we protect it" },
      { id: "cookies-and-analytics", title: "Cookies and analytics" },
      { id: "other-sites", title: "Other sites we link to" },
      { id: "your-choices", title: "Your choices" },
      { id: "minors", title: "Minors" },
      { id: "changes", title: "Changes to this policy" },
      { id: "contact", title: "Contact" },
    ],
  },
  "legal.terms": {
    title: "Terms of Use",
    sections: [
      { id: "who-we-are", title: "Who we are" },
      { id: "using-this-site", title: "Using this site" },
      {
        id: "your-account",
        title: "Your account",
        requires: "constituentAccounts",
      },
      {
        id: "events-and-programs",
        title: "Events and programs",
        requires: "eventRegistrations",
      },
      {
        id: "volunteering",
        title: "Volunteering",
        requires: "volunteerApplications",
      },
      // Named through the lexicon (#896), like the nav group above the gear
      // library: "gear" is one organization's word for what these tables call
      // inventory, and a heading about what an organization gives away has to
      // be in that organization's noun. `platformLegalDocument()` resolves it,
      // so nothing downstream sees the placeholder.
      {
        id: "items-we-give-away",
        title: "{item_plural} we give away",
        requires: "gearRequests",
      },
      {
        id: "accessibility-and-inclusion",
        title: "Accessibility and inclusion",
      },
      { id: "educational-content", title: "Educational content" },
      { id: "donations-and-payments", title: "Donations and payments" },
      { id: "photos-and-content", title: "Photos, video and what you send us" },
      { id: "other-sites-and-venues", title: "Other websites and venues" },
      { id: "other-agreements", title: "Other agreements" },
      { id: "no-warranties", title: "No warranties" },
      { id: "limitation-of-liability", title: "Limits on liability" },
      { id: "indemnification", title: "Your responsibility to us" },
      { id: "changes", title: "Changes to these terms" },
      { id: "severability", title: "Severability" },
      { id: "contact", title: "Contact" },
    ],
  },
  "legal.code_of_conduct": {
    title: "Code of Conduct",
    sections: [
      { id: "what-we-expect", title: "What we expect" },
      { id: "what-isnt-tolerated", title: "What isn’t tolerated" },
      { id: "reporting-a-problem", title: "Reporting a problem" },
      { id: "how-we-handle-a-report", title: "How we handle a report" },
      { id: "if-you-disagree", title: "If you disagree with a decision" },
      { id: "questions", title: "Questions" },
    ],
  },
  // Headings with nothing under them, and that is the whole entry (#686). The
  // platform ships no waiver prose -- a release of legal rights cannot be
  // written for an organization that has not written it -- so this outline is
  // the starting point the document editor offers and the only thing the
  // platform says about the shape of a participant agreement.
  //
  // A heading list is scaffolding: it makes no factual claim, commits the
  // organization to nothing, and every line of it can be deleted. The prose
  // would be neither, which is why there is none. No `requires` keys either --
  // that field filters the platform's own document against the collection
  // surface (#1291), and there is no document here to filter.
  "legal.waiver": {
    title: "Participant Waiver",
    sections: [
      { id: "who-this-covers", title: "Who this covers" },
      { id: "what-youre-agreeing-to", title: "What you’re agreeing to" },
      { id: "risks", title: "Risks of taking part" },
      { id: "your-responsibilities", title: "Your responsibilities" },
      { id: "if-something-happens", title: "If something happens" },
      { id: "questions", title: "Questions" },
    ],
  },
  // The order is the order a reader needs it in (#1368): what is aimed for,
  // how it is tested, what is known to be missing, where the statement stops,
  // and only then how to report -- so that somebody who scrolls no further than
  // the third heading has already been told the claim is partial.
  "legal.accessibility": {
    title: "Accessibility",
    sections: [
      { id: "what-we-aim-for", title: "What we aim for" },
      { id: "how-we-test", title: "How we test" },
      {
        id: "what-we-know-isnt-there-yet",
        title: "What we know isn’t there yet",
      },
      { id: "where-this-statement-stops", title: "Where this statement stops" },
      { id: "telling-us-about-a-problem", title: "Telling us about a problem" },
      {
        id: "when-this-was-last-reviewed",
        title: "When this was last reviewed",
      },
    ],
  },
};

type SlotBase = {
  key: string;
  page: string;
  /** A `CONTENT_SECTIONS` key. Required, so no slot falls outside the grouping. */
  section: string;
  label: string;
  description?: string;
};

export type ContentSlot = SlotBase &
  (
    | { type: "text"; default: string }
    | { type: "paragraphs"; default: string[] }
    | { type: "list"; fields: readonly ListField[]; default: ListItem[] }
    | { type: "document"; default: null; route: string }
    /**
     * A Google Drive share link or image URL; null is the placeholder icon.
     *
     * `ratio` is the aspect the public site crops this photo to -- "21/9" for
     * a hero strip, "3/4" for the portrait beside Our Story. The editor's
     * preview is drawn at it, because a square thumbnail cannot show whether
     * the heads come off in a 21:9 band (#918).
     */
    | { type: "image"; default: null; ratio: string }
  );

const BULLET: readonly ListField[] = [
  { key: "text", label: "Item", kind: "text" },
];

/**
 * A call-to-action row: the words on a button and where it goes (#1327).
 *
 * Shared by `home.ctas` and the two audience pages rather than written out
 * three times, because `src/lib/site-ctas.ts` reads all three through one
 * `ContentCta` type and a second field list is how the two drift apart.
 *
 * `href` is a `url` field, so `isPublishableHref()` refuses a scheme nobody
 * should be able to publish on the way in -- and accepts an absolute
 * `https://` destination, which is the point: a tenant's single ask may live
 * on a booking host or a donation platform that is not this site at all.
 */
export const CTA_FIELDS: readonly ListField[] = [
  { key: "label", label: "Button text", kind: "text" },
  { key: "href", label: "Destination", kind: "url" },
  { key: "shown", label: "Shown", kind: "boolean" },
];

/**
 * One plan on the price list (#1330): what it is called, what it costs, who it
 * is for, what comes with it, and the button on the card.
 *
 * `price` and `period` are two text fields rather than one, because the card
 * sets them differently -- the figure is the largest thing on it and "per
 * month" is a footnote to the figure -- and text rather than a number because
 * the honest answer is not always one: "Free", "From $99", or a currency this
 * registry has no business assuming.
 *
 * `cta_href` is a `url` field, so a plan can send a reader to a booking host or
 * a payment link that is not this site, the same allowance `CTA_FIELDS` makes.
 * A row with no destination renders as a card with no button, which is right
 * for a plan whose sign-up is a conversation.
 *
 * `shown` rather than deleting a row: a plan withdrawn for a quarter comes back
 * without being retyped, and a plan that is being drafted in the editor should
 * not be on the page while it is half written.
 */
export const PLAN_FIELDS: readonly ListField[] = [
  { key: "name", label: "Plan", kind: "text" },
  { key: "price", label: "Price", kind: "text" },
  { key: "period", label: "Per", kind: "text", optional: true },
  { key: "who", label: "Who it's for", kind: "text" },
  { key: "includes", label: "What's included", kind: "paragraphs" },
  { key: "cta_label", label: "Button text", kind: "text", optional: true },
  { key: "cta_href", label: "Button destination", kind: "url", optional: true },
  { key: "shown", label: "Shown", kind: "boolean" },
];

/**
 * The photo a team member on the Meet the Team page shows.
 *
 * Named rather than inlined in the slot below because the public page imports
 * it too: it resolves a member's picture with `resolvePhoto()`, the same call
 * the editor's preview makes, so the two cannot disagree about which source
 * wins (#922).
 */
export const TEAM_PHOTO_FIELD: PhotoListField = {
  key: "photo_url",
  label: "Photo",
  kind: "photo",
  optional: true,
  slotField: "photo_slot",
  slotPrefix: "about_team_photo_",
  fallbackSlot: "about_team_photo",
  ratio: "1/1",
};

/**
 * The section rows on a tour page (#1328, #1329): a heading, a couple of lines,
 * and a screenshot.
 *
 * Three pages share the shape -- `/nonprofits` and `/business` tell it in each
 * audience's vocabulary, `/modules` tells it in neither -- and they are one
 * component, `src/app/(public)/tour-page.tsx`. Built rather than written three
 * times because the pages differ only in which image slots their screenshots
 * come from: `/nonprofits` must not illustrate itself with `/business`'s
 * pictures, which is why the prefix and the fallback are per page. Everything
 * else about the row is identical, and a second copy of it is how they drift.
 *
 * `photo_slot` is declared here for the same reason `about_team.members`
 * declares it: the `photo` field above owns it, the editor never renders it on
 * its own, and without it a new row would not carry the key at all.
 */
export type TourPageKey =
  "audience_nonprofits" | "audience_business" | "module_tour";

/**
 * The slot a tour page's closing paragraph lives in.
 *
 * The audience pages close on the same note -- there is one product and no
 * nonprofit edition of it -- and the module tour closes on the argument the tour
 * exists to make: any one of these parts is ordinary, having them together is
 * not. Two different things to say, so two keys rather than one shared
 * `<page>.closing` that would be named wrongly on two of the three pages.
 * `same_product` is also a stored key already, and renaming a stored key is a
 * migration for a string nobody sees.
 *
 * Here rather than in `tour-page.tsx` so the answer sits beside the slots it
 * names and a test can check that each one exists.
 */
export function tourClosingSlot(page: TourPageKey): string {
  return page === "module_tour" ? "combination" : "same_product";
}

/**
 * The screenshot control on one tour page's section rows.
 *
 * Named like `TEAM_PHOTO_FIELD` and for the same reason: the public page
 * resolves a row's picture with `resolvePhoto()`, the same call the editor's
 * preview makes, so the two cannot disagree about which source wins (#922).
 */
export function tourPhotoField(page: TourPageKey): PhotoListField {
  return {
    key: "photo_url",
    label: "Screenshot",
    kind: "photo",
    optional: true,
    slotField: "photo_slot",
    slotPrefix: `${page}_photo_`,
    fallbackSlot: `${page}_photo`,
    // Wider than the 21/9 hero strip and narrower than a square: a portal
    // screenshot cropped to either loses the thing it was taken to show.
    ratio: "16/9",
  };
}

export function tourSectionFields(page: TourPageKey): readonly ListField[] {
  return [
    { key: "label", label: "Heading", kind: "text" },
    { key: "body", label: "Body", kind: "text" },
    tourPhotoField(page),
    { key: "photo_slot", label: "Image slot", kind: "text", optional: true },
  ];
}

/** The `app_settings`-era prefix every image slot key still carries, so `public_site_images` can strip it. */
export const IMAGE_SLOT_KEY_PREFIX = "site_images.";

/** The short name a page looks an image up by: `site_images.learn_photo` -> `learn_photo`. */
export function imageSlotName(key: string): string {
  return key.startsWith(IMAGE_SLOT_KEY_PREFIX)
    ? key.slice(IMAGE_SLOT_KEY_PREFIX.length)
    : key;
}

function image(
  name: string,
  page: string,
  section: string,
  label: string,
  description: string,
  /** The aspect the public site crops it to, as a CSS ratio: "21/9", "1/1". */
  ratio: string,
): ContentSlot {
  return {
    key: `${IMAGE_SLOT_KEY_PREFIX}${name}`,
    page,
    section,
    label,
    description,
    type: "image",
    default: null,
    ratio,
  };
}

export const SITE_CONTENT_SLOTS: readonly ContentSlot[] = [
  // Organization --------------------------------------------------------------
  {
    key: "org.short_name",
    page: "org",
    section: "org:identity",
    label: "Short name",
    description:
      "How the organization refers to itself mid-sentence. The full name comes from the organization's record.",
    type: "text",
    default: "Your organization",
  },
  {
    key: "org.tagline",
    page: "org",
    section: "org:identity",
    label: "Site description",
    description:
      "The one-sentence description search engines and link previews show.",
    type: "text",
    default: "A short line describing what your organization does",
  },
  {
    key: "org.image_alt",
    page: "org",
    section: "org:identity",
    label: "Photo description",
    description:
      "The text a screen reader announces for the community photos across the site.",
    type: "text",
    default: "Community members",
  },
  {
    key: "org.email_general",
    page: "org",
    section: "org:contact",
    label: "General email",
    description: "Where the contact page and the footer point.",
    type: "text",
    default: "hello@example.org",
  },
  {
    key: "org.email_privacy",
    page: "org",
    section: "org:contact",
    label: "Privacy email",
    description: "Access, correction and deletion requests.",
    type: "text",
    default: "privacy@example.org",
  },
  {
    key: "org.email_conduct",
    page: "org",
    section: "org:contact",
    label: "Conduct email",
    description: "Code of conduct reports.",
    type: "text",
    default: "conduct@example.org",
  },
  {
    key: "org.instagram_handle",
    page: "org",
    section: "org:contact",
    label: "Instagram handle",
    description: "Without the @. Leave blank to hide the Instagram links.",
    type: "text",
    default: "",
  },
  {
    key: "org.footer_contact_eyebrow",
    page: "org",
    section: "org:contact",
    label: "Footer contact heading",
    type: "text",
    default: "Get in touch",
  },
  {
    key: "org.email_security",
    page: "org",
    section: "org:security",
    label: "Security contact",
    description:
      "An email address, or an https:// link to a reporting form. Blank means no security.txt is published at all.",
    type: "text",
    // Blank, unlike the three addresses above, and the difference is the
    // point (#975): an unwritten `privacy@example.org` is a placeholder on a
    // page someone is reading, while an unwritten security contact is a
    // machine-readable promise that reports sent there are received. Nothing
    // is published until an organization nominates somebody.
    default: "",
  },
  {
    key: "org.security_note",
    page: "org",
    section: "org:security",
    label: "Note to researchers",
    description:
      "What a reporter should know before they write: who answers, how long a reply takes, whether there is a bounty. Rendered as the comment block above the machine-readable fields.",
    type: "paragraphs",
    // Also blank. The platform adds its own paragraphs about the portal's data
    // and about not rummaging in it, which are true whoever the tenant is; a
    // default here would be the platform guessing at how an organization it
    // has never met handles reports.
    default: [],
  },

  // Home ----------------------------------------------------------------------
  {
    key: "home.heading",
    page: "home",
    section: "home:hero",
    label: "Heading",
    type: "text",
    default: "Your headline goes here",
  },
  {
    key: "home.intro",
    page: "home",
    section: "home:hero",
    label: "Introduction",
    type: "text",
    default:
      "A sentence or two introducing your organization and what it does.",
  },
  {
    // Replaced `home.cta_events`, `home.cta_get_involved` and `home.cta_donate`
    // (#1327). Those were three slots that named only the *words* on three
    // buttons whose destinations were literals in the page -- so no tenant
    // could send its one call to action anywhere the platform had not already
    // decided, and a tenant whose single ask is a booking host or a donation
    // platform on another domain could not express it at all.
    //
    // The default below reproduces those three buttons exactly, so a tenant
    // that has never opened this slot renders the home page it rendered
    // before. 20260920010000 carries a tenant's stored labels into it.
    //
    // A row that is switched off keeps its place, like `links.items`: a
    // seasonal ask comes back without being retyped. A destination inside a
    // section the board has hidden is dropped by the page rather than stored
    // differently -- the switch is the tenant's decision and visibility is the
    // board's, and neither should quietly overwrite the other.
    key: "home.ctas",
    page: "home",
    section: "home:hero",
    label: "Buttons",
    description:
      "The buttons under the introduction, in the order they appear. A destination inside a section that is hidden in Page visibility is left off the page until that section is back.",
    type: "list",
    fields: CTA_FIELDS,
    default: [
      { label: "Join an event", href: "/events", shown: true },
      { label: "Get involved", href: "/get-involved", shown: true },
      { label: "Donate", href: "/support", shown: true },
    ],
  },
  {
    key: "home.upcoming_eyebrow",
    page: "home",
    section: "home:next_event",
    label: "Section label",
    description: "The small label above the Upcoming events heading.",
    type: "text",
    default: "On the calendar",
  },
  {
    key: "home.upcoming_heading",
    page: "home",
    section: "home:next_event",
    label: "Heading",
    type: "text",
    default: "Upcoming events",
  },
  {
    key: "home.upcoming_cta",
    page: "home",
    section: "home:next_event",
    label: "Link to all events",
    type: "text",
    default: "See all events",
  },
  {
    key: "home.next_event_eyebrow",
    page: "home",
    section: "home:next_event",
    label: "Soonest event ribbon",
    description:
      "The ribbon on the first card. Also labels the community calendar item shown when nothing of your own is upcoming.",
    type: "text",
    default: "Next up",
  },
  image(
    "home_carousel_1",
    "home",
    "home:hero",
    "Homepage carousel — slide 1",
    "First slide of the homepage image carousel.",
    "21/9",
  ),
  image(
    "home_carousel_2",
    "home",
    "home:hero",
    "Homepage carousel — slide 2",
    "Second slide of the homepage image carousel.",
    "21/9",
  ),
  image(
    "home_carousel_3",
    "home",
    "home:hero",
    "Homepage carousel — slide 3",
    "Third slide of the homepage image carousel.",
    "21/9",
  ),

  // Audience paths ------------------------------------------------------------
  //
  // The one place in this registry whose defaults are finished copy rather
  // than prompts, and the reason is what these two pages are (#1328). Every
  // other slot describes the *organization*, which the platform has never met
  // -- so its default reads as unwritten, and anything else would publish a
  // stranger's words under a tenant's brand. These describe the **platform**,
  // which it can speak for, and the routes are off for every tenant until
  // somebody deliberately turns them on.
  //
  // What they still must not do is name a product or a company: the tenant's
  // own record supplies the name, so the same default reads correctly for the
  // platform tenant and for a white-label operator with a different one.
  //
  // The two pages are the same argument in two vocabularies, and the
  // vocabularies are the argument: a blended "for nonprofits and businesses"
  // headline sells to neither (#998). Governance leads the nonprofit page and
  // is absent from the business one, rather than stretched into "advisory
  // board minutes".

  {
    key: "audience_nonprofits.heading",
    page: "audience_nonprofits",
    section: "audience_nonprofits:hero",
    label: "Heading",
    type: "text",
    default: "Everything a small nonprofit runs on, in one place",
  },
  {
    key: "audience_nonprofits.intro",
    page: "audience_nonprofits",
    section: "audience_nonprofits:hero",
    label: "Introduction",
    type: "text",
    default:
      "Donations, volunteers, programs, events, gear and the board's paperwork in one system, instead of a spreadsheet, a shared drive, a donation form and a booking tool that none of them talk to.",
  },
  {
    key: "audience_nonprofits.ctas",
    page: "audience_nonprofits",
    section: "audience_nonprofits:hero",
    label: "Buttons",
    description:
      "Where this page sends a reader next -- a live demo, a contact form, a price list. Empty until you say, because the destination is the one thing a default cannot guess: it is usually a host of its own.",
    type: "list",
    fields: CTA_FIELDS,
    // Deliberately empty. Every other default on these two pages is copy the
    // platform can honestly write for itself; a destination is not. The demo
    // this page is meant to link to lives on a host that is a `custom_domain`
    // value rather than anything in Core, and a literal here would publish one
    // operator's demo link on another's site.
    default: [],
  },
  {
    key: "audience_nonprofits.modules",
    page: "audience_nonprofits",
    section: "audience_nonprofits:modules",
    label: "Sections",
    type: "list",
    fields: tourSectionFields("audience_nonprofits"),
    default: [
      {
        label: "Governance",
        body: "Board members, meetings, agendas, minutes and resolutions, kept together and searchable. The records a board has to produce at the end of the year, written as you go rather than reconstructed from an inbox.",
        photo_url: "",
        photo_slot: "audience_nonprofits_photo_1",
      },
      {
        label: "Finance",
        body: "Donations, grants and reimbursements in one ledger, with the receipts attached and a fiscal year that matches yours. The totals a funder asks for come out of the system rather than out of a weekend.",
        photo_url: "",
        photo_slot: "audience_nonprofits_photo_2",
      },
      {
        label: "People",
        body: "Members, donors and participants as one record each, so somebody's giving, the events they came to and the hours they volunteered belong to the same person instead of to three different files.",
        photo_url: "",
        photo_slot: "audience_nonprofits_photo_3",
      },
      {
        label: "Volunteers",
        body: "Applications, approvals, shifts and hours. People apply on your own website, and the hours they work land against the programs they worked on.",
        photo_url: "",
        photo_slot: "",
      },
      {
        label: "Programs",
        body: "Programs and the sessions inside them, with who is enrolled and what each one costs to run.",
        photo_url: "",
        photo_slot: "",
      },
      {
        label: "Events",
        body: "Fundraisers and community events, from the public listing through registration and check-in on the day to what the event brought in against what it spent.",
        photo_url: "",
        photo_slot: "",
      },
      {
        label: "Inventory",
        body: "Gear and donated goods: what you have, who has it, and which drive it came in from.",
        photo_url: "",
        photo_slot: "",
      },
      {
        label: "Content calendar",
        body: "One calendar for what you are publishing and what is happening in the community, so the newsletter, the post and the event are planned as one thing.",
        photo_url: "",
        photo_slot: "",
      },
    ],
  },
  {
    key: "audience_nonprofits.same_product",
    page: "audience_nonprofits",
    section: "audience_nonprofits:modules",
    label: "One product, not an edition",
    description:
      "The closing note. There is no separate nonprofit edition and the page should not imply one -- the wording is a per-organization setting, not a different piece of software.",
    type: "text",
    default:
      "This is one product, not a nonprofit edition of one. What it calls things is a setting your organization controls: the same screens read donors or customers, volunteers or staff, programs or services, whichever is yours.",
  },
  image(
    "audience_nonprofits_photo_1",
    "audience_nonprofits",
    "audience_nonprofits:modules",
    "For nonprofits — screenshot 1",
    "The screenshot beside the first section on /nonprofits, and beside any other section whose Screenshot field names it.",
    "16/9",
  ),
  image(
    "audience_nonprofits_photo_2",
    "audience_nonprofits",
    "audience_nonprofits:modules",
    "For nonprofits — screenshot 2",
    "The screenshot beside the second section on /nonprofits.",
    "16/9",
  ),
  image(
    "audience_nonprofits_photo_3",
    "audience_nonprofits",
    "audience_nonprofits:modules",
    "For nonprofits — screenshot 3",
    "The screenshot beside the third section on /nonprofits.",
    "16/9",
  ),
  image(
    "audience_nonprofits_photo",
    "audience_nonprofits",
    "audience_nonprofits:modules",
    "For nonprofits — shared screenshot",
    "Shown for any section on /nonprofits that names no screenshot of its own. Leave it unset and those sections are words only, which reads better than the same picture eight times.",
    "16/9",
  ),

  {
    key: "audience_business.heading",
    page: "audience_business",
    section: "audience_business:hero",
    label: "Heading",
    type: "text",
    default: "One system for the small business that outgrew spreadsheets",
  },
  {
    key: "audience_business.intro",
    page: "audience_business",
    section: "audience_business:hero",
    label: "Introduction",
    type: "text",
    default:
      "Revenue, invoices, expenses, customers, bookings and stock in one system, instead of a spreadsheet, a shared drive, a payment link and a booking tool that none of them talk to.",
  },
  {
    key: "audience_business.ctas",
    page: "audience_business",
    section: "audience_business:hero",
    label: "Buttons",
    description:
      "Where this page sends a reader next -- a live demo, a contact form, a price list. Empty until you say, for the same reason the nonprofit page's is.",
    type: "list",
    fields: CTA_FIELDS,
    default: [],
  },
  {
    key: "audience_business.modules",
    page: "audience_business",
    section: "audience_business:modules",
    label: "Sections",
    type: "list",
    fields: tourSectionFields("audience_business"),
    // No Governance row, and that is the decision rather than an omission
    // (#998): board meetings, minutes and resolutions are the nonprofit moat,
    // and stretching them into "advisory board minutes" would sell a business
    // something it did not ask for.
    default: [
      {
        label: "Finance",
        body: "Revenue, invoices and expenses in one ledger, with the receipts attached and a fiscal year that matches yours. What you made and what it cost you, without reconciling two spreadsheets first.",
        photo_url: "",
        photo_slot: "audience_business_photo_1",
      },
      {
        label: "Customers",
        body: "Customers and contacts as one record each, so what somebody bought, the classes they booked and the last thing you sent them belong to the same person.",
        photo_url: "",
        photo_slot: "audience_business_photo_2",
      },
      {
        label: "Bookings and classes",
        body: "Classes, workshops and bookings, from the public listing through registration and check-in on the day to what each one brought in against what it cost.",
        photo_url: "",
        photo_slot: "audience_business_photo_3",
      },
      {
        label: "Services",
        body: "The services you offer and the sessions inside them, with who is booked and what each one costs to run.",
        photo_url: "",
        photo_slot: "",
      },
      {
        label: "Staff scheduling",
        body: "Shifts, who is on them, and the hours that come out the other end.",
        photo_url: "",
        photo_slot: "",
      },
      {
        label: "Stock and equipment",
        body: "What you hold, where it is, who has it out, and what it is worth.",
        photo_url: "",
        photo_slot: "",
      },
      {
        label: "Content calendar",
        body: "One calendar for what you are publishing and what is happening around you, so the post, the email and the class are planned as one thing.",
        photo_url: "",
        photo_slot: "",
      },
    ],
  },
  {
    key: "audience_business.same_product",
    page: "audience_business",
    section: "audience_business:modules",
    label: "One product, not an edition",
    description:
      "The closing note, and the honest half of a dual-market claim: the same software, with wording each organization sets for itself.",
    type: "text",
    default:
      "This is one product, not a business edition of one. What it calls things is a setting you control: the same screens read customers or donors, staff or volunteers, services or programs, whichever is yours.",
  },
  image(
    "audience_business_photo_1",
    "audience_business",
    "audience_business:modules",
    "For business — screenshot 1",
    "The screenshot beside the first section on /business, and beside any other section whose Screenshot field names it. Use business screens here rather than donor ones -- a visitor who meets a donation ledger on this page leaves.",
    "16/9",
  ),
  image(
    "audience_business_photo_2",
    "audience_business",
    "audience_business:modules",
    "For business — screenshot 2",
    "The screenshot beside the second section on /business.",
    "16/9",
  ),
  image(
    "audience_business_photo_3",
    "audience_business",
    "audience_business:modules",
    "For business — screenshot 3",
    "The screenshot beside the third section on /business.",
    "16/9",
  ),
  image(
    "audience_business_photo",
    "audience_business",
    "audience_business:modules",
    "For business — shared screenshot",
    "Shown for any section on /business that names no screenshot of its own. Leave it unset and those sections are words only.",
    "16/9",
  ),

  // The module tour ----------------------------------------------------------
  //
  // `/modules` (#1329): one section per part of the platform, in nobody's
  // vocabulary in particular. The audience pages tell this in each audience's
  // words; this one is the neutral catalog, for a reader who has not yet
  // decided which of those they are.
  //
  // Not generated from `public.modules`, and that was the tempting shortcut:
  // the catalog is already 14 rows with a label and a description. It is an
  // *entitlement* catalog -- it carries Administration and Access management,
  // and its descriptions are written for an operator deciding what a tenant has
  // been sold. A tour that opens on "Administration: users, roles, settings"
  // sells nothing. If the two ever disagree, the catalog is right about what
  // ships and this page is right about how it is sold.

  {
    key: "module_tour.heading",
    page: "module_tour",
    section: "module_tour:hero",
    label: "Heading",
    type: "text",
    default: "One system for the whole organization, not one tool per problem",
  },
  {
    key: "module_tour.intro",
    page: "module_tour",
    section: "module_tour:hero",
    label: "Introduction",
    type: "text",
    default:
      "Money, people, events, volunteers, programs, what you own and the paperwork your board signs — all of it here, and all of it the same records. An event's volunteer hours, the money it raised and the person who gave it are one set of facts rather than three exports that disagree.",
  },
  {
    key: "module_tour.ctas",
    page: "module_tour",
    section: "module_tour:hero",
    label: "Buttons",
    description:
      "Where this page sends a reader next -- a live demo, a price list, a contact form. Empty until you say, because a destination is usually a host of its own.",
    type: "list",
    fields: CTA_FIELDS,
    // Empty for the reason the audience pages' are: every other default here is
    // copy the platform can honestly write about itself, and a destination is
    // not copy. It is a host, and a literal would publish one operator's demo
    // on another's site.
    default: [],
  },
  {
    key: "module_tour.modules",
    page: "module_tour",
    section: "module_tour:sections",
    label: "Sections",
    description:
      "The parts of the platform, in the order a reader meets them. Remove a row for anything you do not want to sell rather than leaving it unwritten.",
    type: "list",
    fields: tourSectionFields("module_tour"),
    // The modules that actually ship, in the order #998 argues for: the money
    // and the people first, because they are what a reader came to check, and
    // governance late but before the closing note, because it is the part no
    // competing product has and the note is about exactly that.
    default: [
      {
        label: "Finance",
        body: "Money in and money out in one ledger: donations, grants, sales and revenue on one side; expenses, reimbursements and receipts on the other; a fiscal year that matches yours. Every figure keeps its link to the event, program or person it came from, so a report is a question you ask rather than an afternoon you lose.",
        photo_url: "",
        photo_slot: "module_tour_photo_1",
      },
      {
        label: "People",
        body: "One record per person, whatever they are to you — member, donor, customer, participant, volunteer. What they gave, what they booked, the events they came to and the hours they worked all hang off that one record, instead of four files that disagree about their email address.",
        photo_url: "",
        photo_slot: "module_tour_photo_2",
      },
      {
        label: "Events",
        body: "From the listing on your own website through registration and reminders to check-in on the day, and then to what the event brought in against what it cost. The same event carries its volunteers' shifts and its own expenses, so the morning after it you already know how it went.",
        photo_url: "",
        photo_slot: "module_tour_photo_3",
      },
      {
        label: "Volunteers",
        body: "Applications from your own website, approvals, shifts, and the hours that come out the other end — logged against the program or event they were worked on. That is the part that makes an annual report possible without asking anybody to remember last March.",
        photo_url: "",
        photo_slot: "module_tour_photo_4",
      },
      {
        label: "Programs",
        body: "The programs or services you run and the sessions inside them: who is enrolled, who turned up, what it costs to put on and what it takes in.",
        photo_url: "",
        photo_slot: "module_tour_photo_5",
      },
      {
        label: "Inventory",
        body: "What you own or lend: where it is, who has it out, what it is worth, and which drive or purchase it arrived on. Requests and returns are records rather than a thread in somebody's inbox.",
        photo_url: "",
        photo_slot: "module_tour_photo_6",
      },
      {
        label: "Governance",
        body: "Board members and their terms, meetings with agendas, minutes and resolutions, and the documents a board has to be able to produce on request. Written as the year goes rather than reconstructed the week before an audit.",
        photo_url: "",
        photo_slot: "module_tour_photo_7",
      },
      {
        label: "Content calendar",
        body: "One calendar for what you are publishing and what is happening in your community, so the newsletter, the post and the event are planned as one thing instead of three.",
        photo_url: "",
        photo_slot: "module_tour_photo_8",
      },
    ],
  },
  {
    key: "module_tour.combination",
    page: "module_tour",
    section: "module_tour:sections",
    label: "Closing note",
    description:
      "The argument the page is making. Each part above is ordinary on its own; having them in one system is not.",
    type: "text",
    // The closing slot is `same_product` on the two audience pages and
    // `combination` here, because the two pages close on different arguments --
    // there is one product, and the combination is the product. `tour-page.tsx`
    // maps each page to its own, rather than the three sharing a key whose name
    // would be wrong on two of them.
    default:
      "None of this is novel on its own. What is unusual is having it together: donor databases do not keep board minutes, inventory systems do not raise money, scheduling tools do neither. Run a small organization on three of those and the same person types into all three. This is one system, with one answer to who did what.",
  },
  image(
    "module_tour_photo_1",
    "module_tour",
    "module_tour:sections",
    "What it does — screenshot 1",
    "The screenshot beside the first section on /modules. There is one of these per section, in the sections' order, so each part of the platform shows its own; a section's Screenshot field overrides which one it takes.",
    "16/9",
  ),
  image(
    "module_tour_photo_2",
    "module_tour",
    "module_tour:sections",
    "What it does — screenshot 2",
    "The screenshot beside the second section on /modules.",
    "16/9",
  ),
  image(
    "module_tour_photo_3",
    "module_tour",
    "module_tour:sections",
    "What it does — screenshot 3",
    "The screenshot beside the third section on /modules.",
    "16/9",
  ),
  image(
    "module_tour_photo_4",
    "module_tour",
    "module_tour:sections",
    "What it does — screenshot 4",
    "The screenshot beside the fourth section on /modules.",
    "16/9",
  ),
  image(
    "module_tour_photo_5",
    "module_tour",
    "module_tour:sections",
    "What it does — screenshot 5",
    "The screenshot beside the fifth section on /modules.",
    "16/9",
  ),
  image(
    "module_tour_photo_6",
    "module_tour",
    "module_tour:sections",
    "What it does — screenshot 6",
    "The screenshot beside the sixth section on /modules.",
    "16/9",
  ),
  image(
    "module_tour_photo_7",
    "module_tour",
    "module_tour:sections",
    "What it does — screenshot 7",
    "The screenshot beside the seventh section on /modules.",
    "16/9",
  ),
  image(
    "module_tour_photo_8",
    "module_tour",
    "module_tour:sections",
    "What it does — screenshot 8",
    "The screenshot beside the eighth section on /modules.",
    "16/9",
  ),
  image(
    "module_tour_photo",
    "module_tour",
    "module_tour:sections",
    "What it does — shared screenshot",
    "Shown for any section on /modules that names no screenshot of its own. Leave it unset and those sections are words only, which reads better than the same picture eight times.",
    "16/9",
  ),

  // Pricing -------------------------------------------------------------------
  //
  // `/pricing` (#1330): visible numbers rather than "contact sales", and the
  // numbers in a content slot rather than in JSX.
  //
  // That is the whole design decision. A price is the single thing on this site
  // most likely to change and least likely to deserve a code review, so it is
  // typed into Administration -> Site Content by whoever sets prices, takes
  // effect without a deploy, and changes again next quarter without a pull
  // request.
  //
  // **What the defaults below do and do not say.** The *shape* of the price
  // list is the platform's own decision and is written here: three plans that
  // differ by which modules come with them, each one adding to the last, with
  // the people directory, the public website and the administration that runs
  // it in every plan. That follows the entitlements model (#900, `plan_modules`)
  // rather than fighting it: a plan is a set of modules, which is the one thing
  // the platform can already switch per tenant. It replaced the first shape,
  // sized by how many people need a login, on 2026-09-29 -- the platform's costs
  // do not grow with logins, and a volunteer-run organization is exactly who a
  // per-login price punishes. The *figures* are this deployment's commercial
  // terms -- another operator running this code charges its own -- so every
  // default price is an em dash, and the platform tenant's real numbers are its
  // own `site_content` rows (20260920030000, 20260929200000). The `pricing`
  // visibility slot stays off until somebody has agreed to them.

  {
    key: "pricing.heading",
    page: "pricing",
    section: "pricing:hero",
    label: "Heading",
    type: "text",
    default: "What it costs",
  },
  {
    key: "pricing.intro",
    page: "pricing",
    section: "pricing:hero",
    label: "Introduction",
    type: "text",
    default:
      "Plans differ by which parts of the system come with them, and each one includes everything in the one before it. Your people, your public website and the tools that run it are in every plan.",
  },
  {
    key: "pricing.plans",
    page: "pricing",
    section: "pricing:plans",
    label: "Plans",
    description:
      'The cards, in the order they appear. Write the price as you want it read -- the figure and the period are separate, so "$49" and "per month" set differently on the card.',
    type: "list",
    fields: PLAN_FIELDS,
    default: [
      {
        name: "Starter",
        price: "—",
        period: "per month",
        who: "A volunteer-run organization or a one-person business: a website, a contact list, events and a way to be reached.",
        includes: [
          "People and the public website.",
          "Events, with registration.",
          "Volunteers, programs and messages.",
        ],
        cta_label: "",
        cta_href: "",
        shown: true,
      },
      {
        name: "Operations",
        price: "—",
        period: "per month",
        who: "An organization that handles money and things: somebody keeps the books, somebody keeps the stock.",
        includes: [
          "Everything in Starter.",
          "Finance and reimbursements.",
          "Inventory, the content calendar and open calls.",
        ],
        cta_label: "",
        cta_href: "",
        shown: true,
      },
      {
        name: "Complete",
        price: "—",
        period: "per month",
        who: "An organization with a board to answer to, or one that wants every part of the system.",
        includes: [
          "Everything in Operations.",
          "Governance, for nonprofits: meetings, minutes, resolutions and grants.",
          "Conduct reports, technology and access reviews, and accounts for the people you serve.",
        ],
        cta_label: "",
        cta_href: "",
        shown: true,
      },
    ],
  },
  {
    key: "pricing.included_heading",
    page: "pricing",
    section: "pricing:details",
    label: "Included heading",
    type: "text",
    default: "Every plan includes",
  },
  {
    key: "pricing.included",
    page: "pricing",
    section: "pricing:details",
    label: "What every plan includes",
    description:
      "The things that do not differ between plans. #998 asks this page to say three of them plainly: the modules, the custom domain, and the public website.",
    type: "paragraphs",
    default: [
      "The people directory, and the administration that decides who can see and change what. Every plan's modules work from the same records, so moving up a plan adds modules rather than moving your data.",
      "Your own domain, and a public website on it that reads from the same records as the staff portal — your events listing, your programs and your volunteer form are the ones already in the system.",
      "An export of everything you have, whenever you ask for it. If you leave, you leave with your data.",
    ],
  },
  {
    key: "pricing.onboarding_heading",
    page: "pricing",
    section: "pricing:details",
    label: "Setup heading",
    type: "text",
    default: "Setting it up",
  },
  {
    key: "pricing.onboarding",
    page: "pricing",
    section: "pricing:details",
    label: "What setup costs",
    description:
      "What it costs to get started, and what that buys. Say the figure here even if it is nothing -- a setup fee a reader finds out about later is the one they remember.",
    type: "paragraphs",
    // No figure, for the same reason the plans above carry none: what setup
    // costs is this deployment's term, not the platform's. The sentence says
    // what the work *is*, which is true wherever it is run.
    default: [
      "Getting started is a one-time fee: your existing spreadsheets brought in, your domain and your branding set up, and time with whoever is going to run it.",
      "Write what that costs here before this page is published.",
    ],
  },
  {
    key: "pricing.closing",
    page: "pricing",
    section: "pricing:details",
    label: "Closing note",
    type: "text",
    default:
      "The plans are the same whether you are a nonprofit or a business — it is one product, and what it calls things is a setting rather than a separate edition. If none of these fits, because you are smaller than the smallest or you are several organizations at once, say so and we will work it out.",
  },

  // About: Our Story ------------------------------------------------------------
  {
    key: "about_story.heading",
    page: "about_story",
    section: "about_story:opening",
    label: "Heading",
    type: "text",
    default: "About us",
  },
  {
    key: "about_story.intro",
    page: "about_story",
    section: "about_story:opening",
    label: "Introduction",
    type: "paragraphs",
    default: [
      "Introduce your organization here — this is the first thing visitors read on your About page.",
    ],
  },
  {
    key: "about_story.section_heading",
    page: "about_story",
    section: "about_story:story",
    label: "Story heading",
    type: "text",
    default: "Our Story",
  },
  {
    key: "about_story.body",
    page: "about_story",
    section: "about_story:story",
    label: "Story",
    type: "paragraphs",
    default: [
      "Tell your organization's story: how it started, who it is for, and where it is going.",
    ],
  },
  image(
    "about_story_photo",
    "about_story",
    "about_story:story",
    "Our Story photo",
    "Photo alongside the Our Story section on the About page.",
    "3/4",
  ),

  // About: Mission & Values ------------------------------------------------------
  {
    key: "about_mission.heading",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Heading",
    type: "text",
    default: "Our Mission",
  },
  {
    key: "about_mission.statement",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Mission statement",
    description: "Shown in quotation marks.",
    type: "text",
    default: "Your mission statement goes here.",
  },
  {
    key: "about_mission.lead_in",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Lead-in to the list",
    type: "text",
    default: "Introduce the list of what your organization does.",
  },
  {
    key: "about_mission.points",
    page: "about_mission",
    section: "about_mission:mission",
    label: "How we do it",
    type: "list",
    fields: BULLET,
    default: [{ text: "Something your organization does" }],
  },
  {
    key: "about_mission.closing",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Closing line",
    type: "text",
    default: "A closing line for your mission page.",
  },
  {
    key: "about_mission.values_heading",
    page: "about_mission",
    section: "about_mission:values",
    label: "Values heading",
    type: "text",
    default: "Our Values",
  },
  {
    key: "about_mission.values",
    page: "about_mission",
    section: "about_mission:values",
    label: "Values",
    type: "list",
    fields: [
      { key: "name", label: "Value", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
    ],
    default: [
      {
        name: "Value name",
        description: "What this value means in your organization's work.",
      },
    ],
  },
  {
    key: "about_mission.why_heading",
    page: "about_mission",
    section: "about_mission:why",
    label: "Why heading",
    type: "text",
    default: "Why this work matters",
  },
  {
    key: "about_mission.why_body",
    page: "about_mission",
    section: "about_mission:why",
    label: "Why",
    type: "paragraphs",
    default: ["Explain why your organization exists, and who it is for."],
  },
  image(
    "about_mission_photo",
    "about_mission",
    "about_mission:values",
    "Our Mission photo",
    "Photo alongside the Our Values section on the Mission page.",
    "1/1",
  ),
  image(
    "about_mission_bottom_photo",
    "about_mission",
    "about_mission:why",
    "Mission page — bottom photo",
    "Photo shown at the bottom of the Mission page, below the Why LGBTQ+ Snow Sports section.",
    "16/9",
  ),

  // About: Meet the Team ---------------------------------------------------------
  {
    key: "about_team.heading",
    page: "about_team",
    section: "about_team:team",
    label: "Heading",
    type: "text",
    default: "Meet the team",
  },
  // The order inside a section is the order the editor renders it in, so it
  // follows the page: heading, the strip under it, then the member cards. It
  // used to sit below "Missing bio text", four fields away from the heading it
  // is glued to on the site (#918).
  image(
    "about_team_hero_photo",
    "about_team",
    "about_team:team",
    "Meet the Team — top photo",
    "Photo between the Meet the Team heading and the team member cards.",
    "21/9",
  ),
  {
    key: "about_team.members",
    page: "about_team",
    section: "about_team:team",
    label: "Team members",
    type: "list",
    fields: [
      // `name` stays the first `text` field: `listItemLabel()` names each row
      // in the editor -- "Move Sofie Chavez up", "Remove Sofie Chavez" -- by
      // the first one it finds, and a row labelled by its role would be a
      // worse answer for every list of people.
      { key: "name", label: "Name", kind: "text" },
      // Optional, and that is load-bearing rather than merely kind: a member
      // row stored before this field existed has no `role` key, and
      // `isListItem()` rejects a row missing a *required* field -- which would
      // fail the whole slot and quietly replace a tenant's published team with
      // the placeholder below (#917).
      { key: "role", label: "Role", kind: "text", optional: true },
      TEAM_PHOTO_FIELD,
      // Declared so the row's shape is validated and a new row carries the
      // key, but never rendered on its own: the `photo` field above owns it,
      // and the editor skips any field another field claims as its
      // `slotField`.
      {
        key: "photo_slot",
        label: "Image slot",
        kind: "text",
        optional: true,
      },
      { key: "bio", label: "Bio", kind: "paragraphs", optional: true },
    ],
    default: [
      {
        name: "Team member name",
        role: "",
        photo_url: "",
        photo_slot: "",
        bio: ["A short biography."],
      },
    ],
  },
  image(
    "about_team_photo_cass",
    "about_team",
    "about_team:team",
    "Team photo — Cass Lainez",
    "Cass Lainez's photo on the Meet the Team page, chosen in a team member's Photo field.",
    "1/1",
  ),
  image(
    "about_team_photo_rickie",
    "about_team",
    "about_team:team",
    "Team photo — Rickie Cruz",
    "Rickie Cruz's photo on the Meet the Team page, chosen in a team member's Photo field.",
    "1/1",
  ),
  image(
    "about_team_photo_sofie",
    "about_team",
    "about_team:team",
    "Team photo — Sofie Chavez",
    "Sofie Chavez's photo on the Meet the Team page, chosen in a team member's Photo field.",
    "1/1",
  ),
  image(
    "about_team_photo",
    "about_team",
    "about_team:team",
    "Team member photo",
    "Shown for any team member who doesn't have their own photo.",
    "1/1",
  ),
  {
    key: "about_team.bio_placeholder",
    page: "about_team",
    section: "about_team:team",
    label: "Missing bio text",
    type: "text",
    default: "Bio coming soon.",
  },
  {
    key: "about_team.empty",
    page: "about_team",
    section: "about_team:team",
    label: "No team members text",
    description:
      "Shown when the page reads People and nobody has been added to the team page yet.",
    type: "text",
    default: "We're updating this page. Check back soon.",
  },

  // Events ----------------------------------------------------------------------
  {
    key: "events.heading",
    page: "events",
    section: "events:listing",
    label: "Events heading",
    type: "text",
    default: "Upcoming & past events",
  },
  {
    key: "events.intro",
    page: "events",
    section: "events:listing",
    label: "Events introduction",
    type: "text",
    default: "Browse upcoming and past events.",
  },
  {
    key: "events.minor_accompaniment",
    page: "events",
    section: "events:registration",
    label: "If the party includes someone under 18",
    description:
      "Your rule for a party that includes anyone under 18, shown on the registration form as soon as somebody answers yes: who has to come with them, whether that adult registers too and counts in the number attending, and whether you set a minimum age at all. Blank renders nothing here but the line saying what the form asks for and that it never asks a date of birth.",
    type: "paragraphs",
    // Blank, like `get_involved.volunteer_screening` and `org.security_note`,
    // and for the same reason (#685). That the form collects an accompanying
    // adult and an emergency contact is a fact about this software, so the
    // component says it on every tenant. "A parent or guardian must be present
    // for the whole event" is one organization's rule -- `docs/legal-basis.md`
    // rule 2 puts it out of reach of a default, and a tenant that has adopted
    // no safeguarding policy would otherwise be publishing one it never wrote.
    //
    // Nothing is collected by the paragraphs either way. #1318 decided that
    // submitting a public form accepts nothing, so this is notice rather than
    // consent: no checkbox, no column, no stored pointer to a version.
    default: [],
  },
  {
    key: "events.photo_consent",
    page: "events",
    section: "events:registration",
    label: "Photos and video at your events",
    description:
      "What you do with photos and video of the people at your events — your own site and social accounts, press, sponsors, funder reports — and that registering for an event means agreeing to it. This is a notice on the registration form, not a question: there is no box, and writing it is what makes a submission carry the agreement. Leave it blank and the form says nothing at all about photos. Say what you never do with a photo as well, and name how somebody asks you to take one down — the platform tells them they can object to any organizer, by email, or from their registration page, and that promise is only as good as the mailbox you give them.",
    type: "paragraphs",
    // Blank, like `events.minor_accompaniment` above it, and one step further
    // (#599, #1376). There the platform still prints what the form collects,
    // because it collects a guardian's number whatever a tenant has written.
    // Here an unwritten slot means the form says nothing whatsoever: no
    // heading, no notice, and byte-identical to the form before #599 shipped.
    //
    // The reason is `docs/legal-basis.md` rule 2 at its sharpest, and #1376
    // sharpened it again. What an organization does with a photo of somebody's
    // face is off-platform and unknowable from this codebase; worse, since
    // #1376 these paragraphs are what makes *registering itself* carry the
    // agreement, and inventing them here would be the platform implying an
    // agreement on a tenant's behalf. The platform's own sentence beneath them
    // describes only the mechanism and the remedy, which are facts about this
    // software. Almost every tenant is in the blank state and it is the one
    // that must never break.
    //
    // This is why the description above is treated as legal surface rather
    // than helper text: it is the only place a tenant admin is told that
    // filling in a content slot changes what a submission means.
    //
    // Nothing on the form is collected against these words any more. They are
    // still snapshotted onto a registration -- by `set_my_photo_consent()`,
    // when somebody objects -- as the text that objection was made against
    // (#1319's shape, not #686's: no version table and no permalink here).
    default: [],
  },
  {
    key: "events.carpool_cost_notice",
    page: "events",
    section: "events:registration",
    label: "Carpool cost notice",
    description:
      "How carpool costs are shared, shown on events that organize carpools: on the registration form, its review step and confirmation email, and wherever a registrant sees their car. It is a notice, not a question: there is no box and nothing is recorded about having read it. Keep the sentence saying the people in a car see each other's first name and Instagram handle, since that is what registrants are told before they share a car.",
    type: "paragraphs",
    // Unlike `events.photo_consent`, a default the platform can write (#1650):
    // carpool costs are split in the car and settled with the driver, and the
    // organization never collects them, because the software stores no amount
    // (#1649). The last sentence is a fact about the software too -- the
    // assignment card shows car-mates exactly a first name and a handle
    // (#1651). In the organization's own voice, and with no "agree" or
    // "consent" in it: #1318 decided that a public form accepts nothing.
    default: [
      "Carpool costs like gas, tolls and parking are split among everyone in the car. Please talk with your driver about your share — we don't collect or set carpool payments. The people in your car will see your first name and Instagram handle so you can coordinate.",
    ],
  },
  {
    key: "events.photos_notice",
    page: "events",
    section: "events:registration",
    label: "Photos by email",
    description:
      "One sentence under the registration form's email field telling registrants you will also use their address to send them the event's photos afterward, from Registrants > More > Send photos. Leave it blank if you don't send photos, and nothing is shown.",
    type: "text",
    // Blank (#1555): whether an organization mails its photos out is its own
    // practice, not a fact about the software. Notice, not consent (#1318):
    // nothing is collected against it.
    default: "",
  },
  {
    key: "events.photos_email_body",
    page: "events",
    section: "events:registration",
    label: "Send photos message",
    description:
      "The message Send photos starts from on an event's Registrants page. The link to the event's public photos is added after it on its own line, and whoever sends it can still edit both before it goes.",
    type: "paragraphs",
    // A default the platform can write (#1555): it promises nothing beyond
    // what the send does, and the composer is edited before every send.
    default: [
      "Thank you for coming! The photos from the event are up now. Have a look, and share them with anyone who was there.",
    ],
  },
  {
    key: "events.media_upload_rights",
    page: "events",
    section: "events:media_uploads",
    label: "What you do with uploaded photos and video",
    description:
      "What your organization may do with the photos and videos a photographer sends through an upload link — your site and social accounts, press, sponsors, funder reports — and how you credit them. The upload page asks the uploader to confirm the files are theirs to share and that they agree to this, and keeps a copy of these words with each file. Leave it blank and they confirm only that the files are theirs to share and that you may keep them with the event.",
    type: "paragraphs",
    // Blank, for `events.photo_consent`'s reason (#1620): what an organization
    // does with somebody else's photographs is off-platform and unknowable
    // from this codebase, and these words are what the uploader agrees to.
    // The platform's own sentence on the box says only what is true of the
    // software -- the files are kept with the event -- and the box is scoped
    // to the files being uploaded, never a site-wide acceptance (#1318).
    default: [],
  },
  {
    key: "events.community_heading",
    page: "events",
    section: "events:community",
    label: "Community calendar heading",
    type: "text",
    default: "Community Calendar",
  },
  {
    key: "events.community_intro",
    page: "events",
    section: "events:community",
    label: "Community calendar introduction",
    type: "text",
    default:
      "Community observances, seasonal moments, campaigns, and our own events, all in one place. Not everything listed here is hosted or organized by us.",
  },

  // Programs --------------------------------------------------------------------
  // #1472. One block for every issue: how to fold what the print PDF prints.
  // The default describes a saddle-stitched booklet, the common imposition;
  // a tenant printing a one-sheet mini-zine rewrites it.
  {
    key: "publications.print_instructions",
    page: "publications",
    section: "publications:print",
    label: "Folding instructions",
    description:
      "How to turn the print PDF into a booklet. Leave the default if your print file is a stapled booklet; rewrite it if you fold a single sheet instead.",
    type: "paragraphs",
    default: [
      "Print double-sided on letter paper, flipping on the short edge, at actual size.",
      "Keep the sheets in the order they came out, fold the stack in half, and staple twice along the fold.",
    ],
  },
  {
    key: "programs.heading",
    page: "programs",
    section: "programs:opening",
    label: "Heading",
    type: "text",
    default: "Programs",
  },
  {
    key: "programs.intro",
    page: "programs",
    section: "programs:opening",
    label: "Introduction",
    type: "text",
    default: "A line introducing your programs.",
  },
  {
    key: "programs.pillars",
    page: "programs",
    section: "programs:pillars",
    label: "Pillars",
    description: "The groups programs are listed under, in order.",
    type: "list",
    fields: [
      { key: "label", label: "Pillar", kind: "text" },
      { key: "description", label: "Tagline", kind: "text" },
    ],
    default: [
      {
        label: "Pillar name",
        description: "What this group of programs is for.",
      },
    ],
  },
  {
    // Read only when the Programs page is drawing its cards from the Programs
    // module (#898) and the tenant has marked none of them public. In Site
    // Content mode the list below is the page, and an empty one is an empty
    // list nobody wrote -- there is nothing to say about it.
    key: "programs.empty",
    page: "programs",
    section: "programs:items",
    label: "No programs text",
    description:
      "Shown when the page reads the Programs module and no program is marked for the public site.",
    type: "text",
    default: "Programs are being finalized. Check back soon.",
  },
  {
    key: "programs.items",
    page: "programs",
    section: "programs:items",
    label: "Programs",
    description: "Each program names the pillar it belongs under.",
    type: "list",
    fields: [
      { key: "pillar", label: "Pillar", kind: "text" },
      { key: "emoji", label: "Emoji", kind: "text", optional: true },
      { key: "name", label: "Program", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
    ],
    default: [
      {
        pillar: "Pillar name",
        emoji: "",
        name: "Program name",
        description: "What this program offers, and who it is for.",
      },
    ],
  },

  // Learn -----------------------------------------------------------------------
  {
    key: "learn.heading",
    page: "learn",
    section: "learn:opening",
    label: "Heading",
    type: "text",
    default: "Learn",
  },
  {
    key: "learn.intro",
    page: "learn",
    section: "learn:opening",
    label: "Introduction",
    description:
      'The line under the Learn heading. A link to the sizing guide is appended to it while that guide is one of your published pages, so a sentence written to run into it ("... check the") belongs to an organization that publishes one.',
    type: "text",
    // Was Chatter Snow's "Snow sports 101 — orientation basics for anyone new
    // to skiing or riding. Looking for equipment size charts specifically?
    // Check the", which that tenant stores as its own row (20260908040000) and
    // goes on reading. A default is what an organization that has written
    // nothing gets, and it should not hand them another organization's sport
    // (#1331).
    default: "Guides, explanations and answers, written by us.",
  },
  {
    key: "learn.disclaimer",
    page: "learn",
    section: "learn:opening",
    label: "Disclaimer",
    description:
      "The notice under every Learn page. Clear it and the notice does not render at all.",
    type: "text",
    // Deliberately about advice rather than about equipment. The wording this
    // replaced — "safety, equipment setup, or an injury ... a certified
    // technician, instructor, or medical provider" — was hardcoded into
    // `EducationalDisclaimer`, which put a ski technician under the Learn
    // pages of every tenant on the platform, including the one that sells the
    // platform (#1331). Chatter Snow keeps that exact wording as a row.
    default:
      "These articles are general information rather than advice about your situation. For anything involving safety, health, or a legal or financial decision, check with a qualified professional.",
  },
  image(
    "learn_photo",
    "learn",
    "learn:opening",
    "Learn section photo",
    "Photo shown at the bottom of every Learn page (the Learn index and each category page).",
    "21/9",
  ),

  // Gear ------------------------------------------------------------------------
  {
    key: "gears.library_heading",
    page: "gears",
    section: "gears:library",
    label: "Catalog heading",
    type: "text",
    default: "{collection_public}",
  },
  {
    key: "gears.library_intro",
    page: "gears",
    section: "gears:library",
    label: "Catalog introduction",
    type: "text",
    default:
      "Browse donated {item_plural:lower} that are free to take home and keep.",
  },
  {
    key: "gears.donate_heading",
    page: "gears",
    section: "gears:donate",
    label: "How it works heading",
    type: "text",
    default: "How it works",
  },
  {
    key: "gears.donate_intro",
    page: "gears",
    section: "gears:donate",
    label: "How it works",
    type: "text",
    default:
      "Describe how your {collection_public:lower} works: what you collect, who can take it home, and how a request is fulfilled.",
  },
  {
    key: "gears.request_heading",
    page: "gears",
    section: "gears:request",
    label: "Request heading",
    type: "text",
    default: "Don't see what you need?",
  },
  {
    key: "gears.request_body",
    page: "gears",
    section: "gears:request",
    label: "Request",
    type: "text",
    default:
      "If your size or item isn't available right now, send us a message and we'll do our best to match you with {item_plural:lower}.",
  },
  {
    key: "gears.accept_heading",
    page: "gears",
    section: "gears:accept",
    label: "Donate heading",
    type: "text",
    default: "Donate {item_plural:lower}",
  },
  {
    key: "gears.accept_title",
    page: "gears",
    section: "gears:accept",
    label: "What we accept",
    type: "text",
    default: "We accept gently used {item_plural:lower}",
  },
  {
    key: "gears.accept_items",
    page: "gears",
    section: "gears:accept",
    label: "Accepted items",
    type: "list",
    fields: BULLET,
    default: [{ text: "A kind of {item:lower} you accept" }],
  },
  {
    key: "gears.dropoff_body",
    page: "gears",
    section: "gears:accept",
    label: "How to drop off",
    type: "text",
    default:
      "Drop {item_plural:lower} off in person at any event, or contact us to arrange a drop-off, mail-in, or collection.",
  },
  {
    key: "gears.drives_heading",
    page: "gears",
    section: "gears:drives",
    label: "Gear drives heading",
    type: "text",
    default: "Donation drives",
  },
  {
    key: "gears.drives_body",
    page: "gears",
    section: "gears:drives",
    label: "Gear drives",
    description: "A link to Events follows it.",
    type: "text",
    default:
      "We periodically run donation drives and swap events where the community can donate, trade, and pick up {item_plural:lower} in person. See",
  },
  image(
    "gear_placeholder",
    "gears",
    "gears:library",
    "Gear placeholder",
    "Shown in the public catalog for any item that doesn't have its own photo.",
    "1/1",
  ),
  image(
    "gears_donate_photo",
    "gears",
    "gears:donate",
    "Donate gear page photo",
    "Photo on the Donate Gear page.",
    "1/1",
  ),
  image(
    "gears_donate_bottom_photo",
    "gears",
    "gears:drives",
    "Donate gear page — bottom photo",
    "Photo at the bottom of the Donate Gear page, below Gear drives.",
    "16/9",
  ),

  // Get involved ----------------------------------------------------------------
  {
    key: "get_involved.heading",
    page: "get_involved",
    section: "get_involved:opening",
    label: "Heading",
    type: "text",
    default: "Get involved",
  },
  {
    key: "get_involved.intro",
    page: "get_involved",
    section: "get_involved:opening",
    label: "Introduction",
    type: "text",
    default: "A line introducing the ways people can get involved.",
  },
  {
    key: "get_involved.sponsor_heading",
    page: "get_involved",
    section: "get_involved:sponsor",
    label: "Sponsor heading",
    type: "text",
    default: "Sponsor us",
  },
  {
    key: "get_involved.sponsor_body",
    page: "get_involved",
    section: "get_involved:sponsor",
    label: "Sponsor",
    type: "text",
    default:
      "Sponsorships help fund events, {item_plural:lower}, and programs.",
  },
  {
    key: "get_involved.gear_heading",
    page: "get_involved",
    section: "get_involved:gear",
    label: "Donate gear heading",
    type: "text",
    default: "Donate {item_plural:lower}",
  },
  {
    key: "get_involved.gear_body",
    page: "get_involved",
    section: "get_involved:gear",
    label: "Donate gear",
    description: "A link to the Gear page follows it.",
    type: "text",
    default:
      "Have {item_plural:lower} you're not using? Donating them helps someone in the community take part. See what we accept on our",
  },
  {
    key: "get_involved.attend_heading",
    page: "get_involved",
    section: "get_involved:attend",
    label: "Attend heading",
    type: "text",
    default: "Attend",
  },
  {
    key: "get_involved.attend_body",
    page: "get_involved",
    section: "get_involved:attend",
    label: "Attend",
    type: "text",
    default:
      "The easiest way to get involved is to show up. Browse upcoming mountain days and community meetups and come ride with us.",
  },
  {
    key: "get_involved.community_heading",
    page: "get_involved",
    section: "get_involved:community",
    label: "Community heading",
    type: "text",
    default: "Join the community",
  },
  {
    key: "get_involved.community_body",
    page: "get_involved",
    section: "get_involved:community",
    label: "Community",
    description: "The Instagram handle follows it.",
    type: "text",
    default:
      "Follow along, meet other members, and hear about events first on Instagram",
  },
  {
    key: "get_involved.partner_heading",
    page: "get_involved",
    section: "get_involved:partner",
    label: "Partner heading",
    type: "text",
    default: "Become a partner",
  },
  {
    key: "get_involved.partner_body",
    page: "get_involved",
    section: "get_involved:partner",
    label: "Partner",
    type: "text",
    default:
      "Describe the organizations you work with and what a partnership can look like.",
  },
  {
    key: "get_involved.volunteer_heading",
    page: "get_involved",
    section: "get_involved:volunteer",
    label: "Volunteer heading",
    type: "text",
    default: "Volunteer",
  },
  {
    key: "get_involved.volunteer_intro",
    page: "get_involved",
    section: "get_involved:volunteer",
    label: "Volunteer introduction",
    type: "text",
    default:
      "We run on volunteers. Here are some of the ways you can get involved.",
  },
  {
    key: "get_involved.volunteer_screening",
    page: "get_involved",
    section: "get_involved:volunteer",
    label: "What happens after you apply",
    description:
      "What happens between an application arriving and a role starting — references, a conversation, a background check where the role calls for one, who sees the result, and whether a record is a bar. Write it before any screening begins: a check disclosed afterwards means going back to everyone already in the pipeline for consent. Blank renders nothing here but the line saying this form does not ask for a date of birth, a home address, or a Social Security number.",
    type: "paragraphs",
    // Blank, like `org.security_note`, and for a related reason (#690). The
    // platform can say what the application *asks for* -- that is a fact about
    // this software, checkable against `parseVolunteerApplicationForm`, and the
    // component says it on every tenant. "We ask for references and may run a
    // check" is a claim about an organization's own process, and
    // `docs/legal-basis.md` rule 2 puts that out of reach of a default: a
    // tenant that has adopted no screening policy would be publishing a hint
    // that it screens. A tenant that has decided nothing describes nothing.
    //
    // Nothing is collected either way. #1318 decided that submitting a public
    // form accepts nothing, so this is notice rather than consent: no checkbox,
    // no column, no stored pointer to a version.
    default: [],
  },
  {
    key: "get_involved.volunteer_empty",
    page: "get_involved",
    section: "get_involved:volunteer",
    label: "No open roles text",
    type: "text",
    default: "Check back soon for open volunteer roles.",
  },
  image(
    "get_involved_hero_1",
    "get_involved",
    "get_involved:opening",
    "Get Involved — hero image 1",
    "Large hero image at the top of the Get Involved page.",
    "4/3",
  ),
  image(
    "get_involved_hero_2",
    "get_involved",
    "get_involved:opening",
    "Get Involved — hero image 2",
    "Small hero image at the top of the Get Involved page.",
    "1/1",
  ),
  image(
    "get_involved_hero_3",
    "get_involved",
    "get_involved:opening",
    "Get Involved — hero image 3",
    "Small hero image at the top of the Get Involved page.",
    "1/1",
  ),
  image(
    "get_involved_attend_photo",
    "get_involved",
    "get_involved:attend",
    "Attend page photo",
    "Photo on the Attend page.",
    "4/3",
  ),
  image(
    "get_involved_community_photo",
    "get_involved",
    "get_involved:community",
    "Attend page — community photo",
    "Photo alongside the Join the Community section on the Attend page.",
    "4/3",
  ),
  image(
    "get_involved_partner_photo",
    "get_involved",
    "get_involved:partner",
    "Partner page photo",
    "Photo on the Become a Partner page.",
    "21/9",
  ),
  image(
    "get_involved_volunteer_photo",
    "get_involved",
    "get_involved:volunteer",
    "Volunteer page photo",
    "Photo on the Volunteer page.",
    "21/9",
  ),

  // Support ---------------------------------------------------------------------
  {
    key: "support.heading",
    page: "support",
    section: "support:opening",
    label: "Heading",
    type: "text",
    default: "Support us",
  },
  {
    key: "support.intro",
    page: "support",
    section: "support:opening",
    label: "Introduction",
    type: "text",
    default:
      "Describe what donations, sponsorships, and in-kind support make possible.",
  },
  {
    key: "support.donations_card",
    page: "support",
    section: "support:opening",
    label: "Donations card",
    type: "text",
    default: "Support us with a monetary or in-kind donation.",
  },
  {
    key: "support.sponsorship_card",
    page: "support",
    section: "support:opening",
    label: "Sponsorship card",
    type: "text",
    default: "Partner with us through cash, in-kind, or combined support.",
  },
  {
    key: "support.donations_heading",
    page: "support",
    section: "support:donations",
    label: "Donations heading",
    type: "text",
    default: "Donations",
  },
  {
    key: "support.donations_intro",
    page: "support",
    section: "support:donations",
    label: "Donations introduction",
    type: "text",
    default: "Explain what donations pay for.",
  },
  {
    key: "support.giving_title",
    page: "support",
    section: "support:donations",
    label: "Give card title",
    description:
      "Heads the card at the top of the Donations page. The card renders only once giving is switched on in Finance > Donations; until then nothing on this page changes.",
    type: "text",
    default: "Give",
  },
  {
    key: "support.giving_body",
    page: "support",
    section: "support:donations",
    label: "Give card body",
    description:
      "What a gift pays for, in your own words. The button beneath it says where giving happens, so this does not have to.",
    type: "text",
    default:
      "Your gift goes straight into the work: describe what it pays for, and who it reaches.",
  },
  {
    key: "support.giving_tax_note",
    page: "support",
    section: "support:donations",
    label: "Tax note",
    description:
      "Your organization's own statement about whether a gift is tax-deductible, and the only place on this site one belongs. It is blank until you write it, on purpose: an organization whose exemption is pending, one giving through a fiscal sponsor and one holding its own determination letter each have a different true sentence, and none of them is ours to write for you. Leave it blank and nothing is claimed.",
    type: "text",
    default: "",
  },
  {
    key: "support.monetary_title",
    page: "support",
    section: "support:donations",
    label: "Monetary donations title",
    type: "text",
    default: "Monetary donations",
  },
  {
    key: "support.monetary_body",
    page: "support",
    section: "support:donations",
    label: "Monetary donations",
    type: "text",
    default:
      "Describe how people can give money, or say that online giving is coming soon.",
  },
  {
    key: "support.inkind_title",
    page: "support",
    section: "support:donations",
    label: "In-kind donations title",
    type: "text",
    default: "In-kind donations",
  },
  {
    key: "support.inkind_body",
    page: "support",
    section: "support:donations",
    label: "In-kind donations",
    description: "A link to the Gear page follows it.",
    type: "text",
    default:
      "We accept gently used {item_plural:lower}, which we redistribute through our {collection_public:lower}. See what we accept and how to donate on our",
  },
  {
    key: "support.sponsorship_heading",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsorship heading",
    type: "text",
    default: "Sponsorship",
  },
  {
    key: "support.sponsorship_intro",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsorship introduction",
    type: "text",
    default:
      "Explain what sponsorship funds, and what a sponsor gets in return.",
  },
  {
    key: "support.sponsorship_tiers",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsorship options",
    type: "list",
    fields: [
      { key: "name", label: "Option", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
    ],
    default: [
      {
        name: "Sponsorship option",
        description: "What this option involves, and what it supports.",
      },
    ],
  },
  {
    key: "support.sponsorship_cta",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsorship button",
    type: "text",
    default: "Talk to us about sponsoring",
  },
  {
    key: "support.sponsor_wall_heading",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsor wall heading",
    type: "text",
    default: "Past sponsors",
    description:
      "Heads the logos of everyone your organization has publicly credited as a sponsor. The wall itself is not edited here -- it is every sponsor marked public on a published event, so it keeps itself current.",
  },
  {
    key: "support.sponsor_wall_intro",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsor wall introduction",
    type: "text",
    default: "Organizations that have supported our events.",
  },
  image(
    "donations_photo",
    "support",
    "support:donations",
    "Donations page photo",
    "Photo at the bottom of the Donations page.",
    "16/9",
  ),
  image(
    "sponsorship_photo_1",
    "support",
    "support:sponsorship",
    "Sponsorship page — photo 1",
    "First of two small photos at the bottom of the Sponsorship page.",
    "4/3",
  ),
  image(
    "sponsorship_photo_2",
    "support",
    "support:sponsorship",
    "Sponsorship page — photo 2",
    "Second of two small photos at the bottom of the Sponsorship page.",
    "4/3",
  ),

  // Contact ---------------------------------------------------------------------
  {
    key: "contact.heading",
    page: "contact",
    section: "contact:opening",
    label: "Heading",
    type: "text",
    default: "Get in touch",
  },
  {
    key: "contact.intro",
    page: "contact",
    section: "contact:opening",
    label: "Introduction",
    type: "text",
    default:
      "Questions, ideas, or want to get involved? Send us a message and we'll get back to you.",
  },
  image(
    "contact_photo_1",
    "contact",
    "contact:opening",
    "Contact page — photo 1",
    "First of three photos at the bottom of the Contact page.",
    "1/1",
  ),
  image(
    "contact_photo_2",
    "contact",
    "contact:opening",
    "Contact page — photo 2",
    "Second of three photos at the bottom of the Contact page.",
    "1/1",
  ),
  image(
    "contact_photo_3",
    "contact",
    "contact:opening",
    "Contact page — photo 3",
    "Third of three photos at the bottom of the Contact page.",
    "1/1",
  ),

  // Brand ---------------------------------------------------------------------
  //
  // Deliberately few slots. Most of /brand is *derived* -- the palette comes
  // from BRAND_COLOR_TOKENS crossed with the tenant's `brand.*` rows, the
  // gradient from `accent_stops`, the logo from `logo_url`, the specimens from
  // `org.tagline`. Restating any of that here would reintroduce exactly the
  // drift the page exists to end: two places to change a colour, one of which
  // is prose nobody remembers to update.
  //
  // What is left is the part no token can hold -- how an organization talks,
  // how its name is written, and what may be done to its mark.
  {
    key: "brand.heading",
    page: "brand",
    section: "brand:opening",
    label: "Heading",
    type: "text",
    default: "Brand & Design Guide",
  },
  {
    key: "brand.intro",
    page: "brand",
    section: "brand:opening",
    label: "Introduction",
    description:
      "Who this page is for -- typically partners, sponsors, press and anyone producing materials on the organization's behalf.",
    type: "text",
    default:
      "Everything on this page is read from the live site, so it is never out of date. Use it when you are producing anything that carries our name.",
  },
  {
    key: "brand.voice",
    page: "brand",
    section: "brand:usage",
    label: "Voice and tone",
    description:
      "How the organization sounds in writing, as do/don't pairs. Not derivable from anything -- a palette says nothing about how you talk.",
    type: "list",
    fields: [
      { key: "do", label: "Do", kind: "text" },
      { key: "dont", label: "Don't", kind: "text" },
    ],
    default: [
      {
        do: "Say what your organization sounds like at its best.",
        dont: "And the habit it should avoid.",
      },
    ],
  },
  {
    key: "brand.logo_rules",
    page: "brand",
    section: "brand:usage",
    label: "Logo usage",
    description:
      "Clear space, minimum size, and what must not be done to the mark. The rules that belong to the design system are already stated on the page; these are yours.",
    type: "list",
    fields: BULLET,
    default: [{ text: "A rule about how your logo may and may not be used." }],
  },
  {
    key: "brand.name_usage",
    page: "brand",
    section: "brand:usage",
    label: "Name in prose",
    description:
      "How to write the organization's name -- the legal name against the short one, capitalisation, and anything that is commonly got wrong.",
    type: "paragraphs",
    default: [
      "How your organization's name should be written in running text, and which form belongs in a first mention.",
    ],
  },

  // Links -----------------------------------------------------------------------
  //
  // The link-in-bio page (#937). Instagram allows one link in a profile, so
  // this is the page it points at and the list below is what the organization
  // is currently asking people to do. It is edited far more often than the
  // rest of the site -- a gear drive this month, a fundraiser the next -- which
  // is the whole reason it is content rather than a route per campaign.
  {
    key: "links.heading",
    page: "links",
    section: "links:page",
    label: "Heading",
    type: "text",
    default: "Find us here",
  },
  {
    key: "links.intro",
    page: "links",
    section: "links:page",
    label: "Introduction",
    description:
      "One line under the heading, for people arriving from a social profile. Leave blank for none.",
    type: "text",
    default: "",
  },
  {
    key: "links.items",
    page: "links",
    section: "links:page",
    label: "Links",
    description:
      "In the order they appear on the page. A link that is switched off keeps its place here and is not published, so a seasonal one can be turned back on rather than retyped.",
    type: "list",
    fields: [
      { key: "label", label: "Button text", kind: "text" },
      { key: "url", label: "Destination", kind: "url" },
      {
        key: "description",
        label: "Supporting line",
        kind: "text",
        optional: true,
      },
      { key: "published", label: "Published", kind: "boolean" },
    ],
    default: [
      {
        label: "Upcoming events",
        url: "/events",
        description: "Where to find us next.",
        published: true,
      },
    ],
  },

  // Legal -----------------------------------------------------------------------
  {
    key: "legal.privacy",
    page: "legal",
    section: "legal:documents",
    label: "Privacy policy",
    description:
      "Replaces the whole privacy page. Leave unset to serve the platform's starting document -- a neutral draft for your own legal counsel to review and rewrite, not legal advice.",
    type: "document",
    default: null,
    route: "/privacy",
  },
  {
    key: "legal.terms",
    page: "legal",
    section: "legal:documents",
    label: "Terms of use",
    description:
      "Replaces the whole terms page. Leave unset to serve the platform's starting document -- a neutral draft for your own legal counsel to review and rewrite, not legal advice.",
    type: "document",
    default: null,
    route: "/terms",
  },
  {
    key: "legal.code_of_conduct",
    page: "legal",
    section: "legal:documents",
    label: "Code of conduct",
    description:
      "Replaces the whole code of conduct page. Leave unset to serve the platform's starting document -- a neutral draft for your own legal counsel to review and rewrite, not legal advice.",
    type: "document",
    default: null,
    route: "/code-of-conduct",
  },
  {
    key: "legal.waiver",
    page: "legal",
    section: "legal:documents",
    label: "Participant waiver",
    // Deliberately not the "leave unset to serve the platform's starting
    // document" sentence the three above carry: there is no starting document,
    // and saying so is the point (#686).
    description:
      "Shown in full when somebody registers for an event, and accepted with a tick box. There is no starting text for this one -- a release of legal rights is your organization's to write with its own counsel. Until you publish one and put it in force, /waiver is not served and registration asks nothing.",
    type: "document",
    default: null,
    route: "/waiver",
  },
  {
    key: "legal.accessibility",
    page: "legal",
    section: "legal:documents",
    label: "Accessibility statement",
    description:
      "Replaces the whole accessibility page. The platform's starting document describes how this software is tested and what that testing misses; the three things only you can answer -- who to contact, what you commit to when told, and whether your own events and venues are accessible -- are marked in it as the parts to replace.",
    type: "document",
    default: null,
    route: "/accessibility",
  },
] as const;

const SLOTS_BY_KEY = new Map(
  SITE_CONTENT_SLOTS.map((slot) => [slot.key, slot]),
);

export function contentSlot(key: string): ContentSlot | undefined {
  return SLOTS_BY_KEY.get(key);
}

export function slotsForPage(page: string): ContentSlot[] {
  return SITE_CONTENT_SLOTS.filter((slot) => slot.page === page);
}

export function sectionsForPage(page: string): ContentSection[] {
  return CONTENT_SECTIONS.filter((section) => section.page === page);
}

export function slotsForSection(section: string): ContentSlot[] {
  return SITE_CONTENT_SLOTS.filter((slot) => slot.section === section);
}

/** An image slot's editor label, by the short name a page reads it under. */
export function imageSlotLabel(name: string): string | undefined {
  return contentSlot(`${IMAGE_SLOT_KEY_PREFIX}${name}`)?.label;
}

/**
 * The image slots a `photo` field offers, in registry order.
 *
 * The editor builds a select from this, so a slot that does not exist cannot
 * be named (#922). The fallback slot is deliberately not one of the choices:
 * it is already what choosing nothing means.
 */
export function photoSlotChoices(
  field: PhotoListField,
): { name: string; label: string }[] {
  return SITE_CONTENT_SLOTS.filter(
    (slot) =>
      slot.type === "image" &&
      imageSlotName(slot.key).startsWith(field.slotPrefix),
  ).map((slot) => ({ name: imageSlotName(slot.key), label: slot.label }));
}

/** Where the picture a row shows came from. */
export type PhotoSource = "url" | "slot" | "fallback" | "none";

export type ResolvedPhoto = {
  /** Renderable, or null when nothing is set anywhere: the placeholder icon. */
  url: string | null;
  from: PhotoSource;
  /** The slot it came from, for `slot` and `fallback`. */
  slot?: string;
};

/**
 * The picture a `photo` field resolves to: the row's own link, else the image
 * slot it names, else the shared fallback slot.
 *
 * The public page and the editor's preview both call this, so the precedence
 * cannot drift between the two -- which is the whole reason the editor can
 * claim to show what the site will show (#922). `images` is keyed by short
 * slot name, the shape `getSiteImageUrls()` returns; values may be raw or
 * already resolved, since `resolveImageUrl()` is idempotent.
 */
export function resolvePhoto(
  field: PhotoListField,
  /** The row, in whatever shape its caller reads list items as. */
  item: Readonly<Record<string, unknown>>,
  images: Readonly<Record<string, string | null | undefined>>,
): ResolvedPhoto {
  const text = (key: string): string => {
    const value = item[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const own = text(field.key);
  if (own) return { url: resolveImageUrl(own), from: "url" };
  const slot = text(field.slotField);
  const named = slot ? (images[slot] ?? null) : null;
  if (named) return { url: resolveImageUrl(named), from: "slot", slot };
  const shared = images[field.fallbackSlot] ?? null;
  if (shared) {
    return {
      url: resolveImageUrl(shared),
      from: "fallback",
      slot: field.fallbackSlot,
    };
  }
  return { url: null, from: "none" };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isListItem(value: unknown, fields: readonly ListField[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return fields.every((field) => {
    const v = item[field.key];
    // A switch is the one field `optional` says nothing useful about: it
    // cannot be left blank, only left unset, and a row stored before the
    // field existed has no key for it. Rejecting those rows would send the
    // whole slot back to its registry default -- every link an organization
    // had written replaced by the example one -- over a field that has a
    // perfectly good answer without them.
    if (v === undefined)
      return field.kind === "boolean" || Boolean(field.optional);
    switch (field.kind) {
      case "text":
        return typeof v === "string";
      case "paragraphs":
        return isStringArray(v);
      case "boolean":
        return typeof v === "boolean";
      case "url":
        // Publishable, not merely a string -- the same stance `image` takes two
        // cases down. An optional url may be blank; a set one has to be a
        // destination the site will actually put in an `href`.
        if (typeof v !== "string") return false;
        return field.optional && v === "" ? true : isPublishableHref(v);
      case "photo":
        // Renderable when set, the stance an `image` slot takes, so a photo
        // that would 404 is refused on the way in rather than on the page.
        // Blank is the ordinary case: it means "use the slot instead".
        if (typeof v !== "string") return false;
        return v === "" ? true : isRenderableImageSrc(v);
    }
  });
}

function isLegalDocument(value: unknown): value is LegalDocumentContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const doc = value as Record<string, unknown>;
  return (
    typeof doc.title === "string" &&
    typeof doc.last_updated === "string" &&
    isStringArray(doc.summary) &&
    Array.isArray(doc.sections) &&
    doc.sections.every(
      (section) =>
        section &&
        typeof section === "object" &&
        typeof (section as LegalDocumentSection).id === "string" &&
        typeof (section as LegalDocumentSection).title === "string" &&
        isStringArray((section as LegalDocumentSection).paragraphs),
    )
  );
}

/**
 * Whether a stored value has the shape its slot declares. Used on the way
 * in (the editor's action refuses anything else) and on the way out (a row
 * someone edited by hand falls back to the default instead of crashing the
 * page).
 */
export function isValidSlotValue(slot: ContentSlot, value: unknown): boolean {
  switch (slot.type) {
    case "text":
      return typeof value === "string";
    case "paragraphs":
      return isStringArray(value);
    case "list":
      return (
        Array.isArray(value) && value.every((v) => isListItem(v, slot.fields))
      );
    case "document":
      return isLegalDocument(value);
    case "image":
      // Renderable, not merely non-empty. "team-photo.jpg" used to pass here,
      // and `type="url"` on the box only guards the form submit -- "Publish"
      // is a button, so it went straight past to the public site, where it
      // resolved against whatever page was showing it and 404ed (#918).
      return isRenderableImageSrc(typeof value === "string" ? value : null);
  }
}

/**
 * A slot's default with the tenant's own words in it (#896).
 *
 * Only `text`, `paragraphs` and `list` carry copy; `image` and `document`
 * default to null, and a document's text is the separate neutral default in
 * `src/lib/legal-defaults.ts`.
 */
export function lexiconDefault(slot: ContentSlot, lexicon: Lexicon): unknown {
  switch (slot.type) {
    case "text":
      return applyLexicon(slot.default, lexicon);
    case "paragraphs":
      return applyLexiconAll(slot.default, lexicon);
    case "list":
      return slot.default.map((item) =>
        Object.fromEntries(
          Object.entries(item).map(([field, value]) => [
            field,
            // A boolean field has no words in it, so it passes through
            // untouched rather than through a string substitution.
            typeof value === "boolean"
              ? value
              : typeof value === "string"
                ? applyLexicon(value, lexicon)
                : applyLexiconAll(value, lexicon),
          ]),
        ),
      );
    default:
      return slot.default;
  }
}

/** Typed reads over the resolved content, falling back to each slot's default. */
export type SiteContent = {
  text(key: string): string;
  paragraphs(key: string): string[];
  list<T extends ListItem = ListItem>(key: string): T[];
  document(key: string): LegalDocumentContent | null;
  /** The stored URL, unresolved; the public site reads images through `getSiteImageUrls()` instead. */
  image(key: string): string | null;
  /** Which slots are set for this tenant, for the editor. */
  overrides: ReadonlySet<string>;
};

/**
 * One `site_content` row as the views serve it. `value` is `Json` rather than
 * `unknown` (#813 Phase 1): the column is `jsonb`, and `resolveSiteContent`
 * checks each value against the slot registry before anything renders it.
 */
export type SiteContentRow = { key: string; value: Json };

/**
 * Folds the tenant's rows over the registry defaults. Pure.
 *
 * The lexicon is the tenant's words for what it lends (#896), and it reaches
 * the defaults only -- see the note at the top of this file. It falls back to
 * the platform's own words, so a caller with no tenant to speak for (a test,
 * `DEFAULT_SITE_CONTENT`) still reads a complete site rather than one with
 * braces in it.
 */
export function resolveSiteContent(
  rows: readonly SiteContentRow[],
  lexicon: Lexicon = DEFAULT_LEXICON,
): SiteContent {
  const values = new Map<string, unknown>();
  for (const row of rows) {
    const slot = SLOTS_BY_KEY.get(row.key);
    if (slot && isValidSlotValue(slot, row.value)) {
      values.set(row.key, row.value);
    }
  }

  function read<T>(key: string, type: ContentSlot["type"]): T {
    const slot = SLOTS_BY_KEY.get(key);
    if (!slot || slot.type !== type) {
      throw new Error(`Unknown ${type} content slot: ${key}`);
    }
    return (
      values.has(key) ? values.get(key) : lexiconDefault(slot, lexicon)
    ) as T;
  }

  return {
    text: (key) => read<string>(key, "text"),
    paragraphs: (key) => read<string[]>(key, "paragraphs"),
    list: <T extends ListItem>(key: string) => read<T[]>(key, "list"),
    document: (key) => read<LegalDocumentContent | null>(key, "document"),
    image: (key) => read<string | null>(key, "image"),
    overrides: new Set(values.keys()),
  };
}

/** The content with nothing set: the site as shipped. */
export const DEFAULT_SITE_CONTENT: SiteContent = resolveSiteContent([]);

/**
 * A slot's value out of a resolved `SiteContent`, whatever shape it is in.
 *
 * Lives here rather than beside the Site Content editor because the public API
 * serves the same slots (#813 Phase 3) and a second copy of this switch is a
 * second place for a new slot type to be forgotten.
 */
export function readSlot(slot: ContentSlot, content: SiteContent): Json {
  switch (slot.type) {
    case "text":
      return content.text(slot.key);
    case "paragraphs":
      return content.paragraphs(slot.key);
    case "list":
      return content.list(slot.key);
    case "document":
      return content.document(slot.key);
    case "image":
      return content.image(slot.key);
  }
}
