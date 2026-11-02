/**
 * What a tenant's site actually collects, as the legal documents describe it
 * (#1291).
 *
 * `platformLegalDocument()` used to publish, as fact, that every site running
 * this application takes volunteer applications, event registrations, rider
 * profiles (now profile questions, #1746), gear requests, artwork submissions and contact messages. A tenant
 * running a contact form and nothing else published all six under its own name,
 * hedged by one sentence saying some of the forms above may not exist. That is
 * an honest dodge rather than an accurate policy, and the privacy policy is the
 * one document #859 keeps served for every tenant whatever else it has adopted.
 *
 * The signal was already computed: the switch the board set
 * (`page_visibility.*`) and the module entitlement the platform sold
 * (`public_tenant_modules`), both of which the public layout reads on every
 * request anyway.
 *
 * This is a named record rather than the raw visibility map so the prose beside
 * it reads as prose: `org.surfaces.volunteerApplications`, not
 * `visibility["get-involved-volunteer"]`.
 *
 * It takes no dependency on `@/lib/page-visibility`, which reaches `cache()`,
 * `next/navigation` and the server Supabase client -- `site-content.ts` types a
 * field against `CollectionSurface` and is imported by client components. The
 * cost is that the slot and module behind each surface are named here rather
 * than read from `PUBLIC_PAGE_SLOTS`; `legal-surface.test.ts` holds the two
 * lists together.
 */
export type CollectionSurface = {
  contact: boolean;
  volunteerApplications: boolean;
  eventRegistrations: boolean;
  /**
   * Whether the tenant asks a person its own profile questions (#1746), after
   * registering or on `/my/details`: a current question with either switch on.
   * Not the module alone, which is on for every tenant: one asking nothing
   * collects nothing. Replaces the rider profile, which rode on
   * `eventRegistrations`.
   */
  profileQuestions: boolean;
  gearRequests: boolean;
  artworkSubmissions: boolean;
  /**
   * Whether this tenant offers accounts on its *public* site (#1160, #1161).
   *
   * Everything under `/my`: signing up with an email address and a password,
   * claiming a directory record, correcting your own contact details,
   * choosing which emails you get. The policy's account bullet used to say
   * "for the people who run the organization", which stopped being true the
   * day a visitor could create one.
   */
  constituentAccounts: boolean;
  /**
   * Whether a volunteer can log their own hours (#1165).
   *
   * Separate from `volunteerApplications` because the gates genuinely differ:
   * the application form is the public volunteer *page*, so hiding that slot
   * takes it away, while self-logging answers to the Volunteers module alone.
   * A tenant that hides the public page and keeps the module still collects
   * self-logged hours, and the policy has to say so.
   *
   * #1296 paired this with `constituentAccounts`, because the form that logged
   * hours was `/my/hours`. #1303 removed that form as a duplicate of the
   * portal's, which is where a volunteer logs their own hours now -- so the
   * module stands alone again. The clock on `volunteer_hour_submissions` is
   * filtered by this key, and those rows are still written.
   */
  volunteerHours: boolean;
  /**
   * Whether the portal records volunteer screening outcomes (#1360).
   *
   * Its own key rather than a reuse, for the reason `volunteerHours` is:
   * `volunteerApplications` carries the public volunteer *page* slot, so a
   * tenant that hides the form while still recruiting volunteers by hand would
   * lose both the disclosure and the retention row for rows it is still
   * writing. Screening answers to the Volunteers module alone, like
   * self-logged hours, and unlike either of those it is not a public form at
   * all -- nothing is collected from the person, so the bullet it feeds sits
   * outside the "information you type into a form yourself" list.
   */
  volunteerScreening: boolean;
  /**
   * Whether the portal offers "Continue with Google", which is the only reason
   * Google appears in the subprocessor list.
   *
   * Always true today: `src/app/portal/login/login-form.tsx` renders the button
   * unconditionally, so there is no per-tenant switch to read and claiming
   * otherwise would break rule 1 in `legal-defaults.ts` -- only what the
   * software does. It is a field rather than a hard-coded bullet so that the
   * day the button becomes configurable, the policy follows it from here.
   */
  googleSignIn: boolean;
  /**
   * Whether the public site sends PostHog its form funnel (#1480): the
   * `form_analytics` module. Not a form of its own, so it adds a sentence and a
   * subprocessor rather than a "what we collect" bullet.
   */
  formAnalytics: boolean;
};

/**
 * The page-visibility slot and module behind each collected-from surface, as
 * `PUBLIC_PAGE_SLOTS` maps them. A null slot means the surface has no public
 * page to hide, and its module answers alone: `(public)/artwork/[code]` is
 * reached by the code on an open call rather than from the nav, `/my` is gated
 * by its module in `requireConstituentArea()` and again on every RPC, and
 * self-logged hours are behind a portal permission rather than a public page.
 */
export const SURFACE_GATES: Readonly<
  Record<string, { slot: string | null; module: string }>
> = {
  contact: { slot: "contact", module: "communications" },
  volunteerApplications: {
    slot: "get-involved-volunteer",
    module: "volunteers",
  },
  eventRegistrations: { slot: "events", module: "events" },
  // And a question actually asked: `collectionSurface()`'s third argument.
  profileQuestions: { slot: null, module: "person_questions" },
  gearRequests: { slot: "gears", module: "inventory" },
  artworkSubmissions: { slot: null, module: "artwork" },
  constituentAccounts: { slot: null, module: "constituent_accounts" },
  volunteerHours: { slot: null, module: "volunteers" },
  volunteerScreening: { slot: null, module: "volunteers" },
  formAnalytics: { slot: null, module: "form_analytics" },
};

/**
 * Fails **open**, matching `moduleEnabled()` and `module_enabled_for_tenant()`:
 * a key missing from either map -- an unreadable read, a tenant that predates a
 * module row -- leaves the bullet in the policy. Over-describing what you
 * collect is a survivable error; under-describing it is the one this exists to
 * prevent.
 *
 * Both inputs are consulted, even though `getPageVisibility()` has already
 * folded the module into its answer. Its portal counterpart
 * `getTenantPageVisibility()` has not -- it reads `app_settings` directly --
 * and the starter document in the Site Content editor is built from that one.
 *
 * `constituent_accounts` is the one module in the catalog seeded
 * `default_enabled = false`, so a tenant that has said nothing reads an
 * explicit `false` here rather than falling through to open. Only a failed read
 * reaches the open branch for it, which is the same trade as everywhere else.
 */
function live(
  surface: keyof typeof SURFACE_GATES,
  visibility: Record<string, boolean>,
  modules: Record<string, boolean>,
): boolean {
  const { slot, module } = SURFACE_GATES[surface];
  if (modules[module] === false) return false;
  return slot === null || visibility[slot] !== false;
}

export function collectionSurface(
  visibility: Record<string, boolean>,
  modules: Record<string, boolean>,
  /** From `get*AsksProfileQuestions()`; open, like everything else here. */
  asksProfileQuestions = true,
): CollectionSurface {
  return {
    contact: live("contact", visibility, modules),
    volunteerApplications: live("volunteerApplications", visibility, modules),
    eventRegistrations: live("eventRegistrations", visibility, modules),
    profileQuestions:
      live("profileQuestions", visibility, modules) && asksProfileQuestions,
    gearRequests: live("gearRequests", visibility, modules),
    artworkSubmissions: live("artworkSubmissions", visibility, modules),
    constituentAccounts: live("constituentAccounts", visibility, modules),
    volunteerHours: live("volunteerHours", visibility, modules),
    volunteerScreening: live("volunteerScreening", visibility, modules),
    googleSignIn: true,
    formAnalytics: live("formAnalytics", visibility, modules),
  };
}

/**
 * The surfaces that are on, sorted -- one definition of "what this tenant
 * collects", small enough to store and compare.
 *
 * Nothing in #1291 reads it; #1292 records it at publish time as the
 * fingerprint a tenant's own document was written against, so it can say when
 * the configuration has moved on from the text.
 */
export function surfaceKeys(surface: CollectionSurface): string[] {
  return Object.keys(surface)
    .filter((key) => surface[key as keyof CollectionSurface])
    .sort();
}

/**
 * What a surface is called in a sentence about a legal document (#1292).
 *
 * Two words per key, because the drift line needs both: the thing an
 * administrator switched -- named as the control that moved is named -- and
 * the collecting the document does or does not describe. "Artwork was enabled
 * ... your policy does not describe artwork submissions" reads as one sentence
 * about one change; either half used in both places reads as a template.
 */
export const SURFACE_LABELS: Readonly<
  Record<keyof CollectionSurface, { subject: string; collects: string }>
> = {
  contact: { subject: "Contact", collects: "contact messages" },
  volunteerApplications: {
    subject: "Volunteers",
    collects: "volunteer applications",
  },
  eventRegistrations: { subject: "Events", collects: "event registrations" },
  profileQuestions: {
    subject: "Profile questions",
    collects: "answers to your profile questions",
  },
  gearRequests: { subject: "Inventory", collects: "item requests" },
  artworkSubmissions: { subject: "Artwork", collects: "artwork submissions" },
  constituentAccounts: {
    subject: "Accounts",
    collects: "accounts on your public site",
  },
  volunteerHours: {
    subject: "Volunteers",
    collects: "hours volunteers log for themselves",
  },
  volunteerScreening: {
    subject: "Volunteers",
    collects: "volunteer screening outcomes",
  },
  googleSignIn: {
    subject: "Google sign-in",
    collects: "signing in with Google",
  },
  formAnalytics: {
    subject: "Form analytics",
    collects: "form analytics with PostHog",
  },
};

/**
 * How a published document's fingerprint compares with what this tenant
 * collects now (#1292).
 *
 * `added` is collecting the document cannot describe, because it did not exist
 * when the text was written; `removed` is collecting the document still
 * describes and the organization no longer does. Both are wrong in a privacy
 * policy and wrong in opposite directions, so they are reported separately
 * rather than as one count of differences.
 */
export type SurfaceDrift = { added: string[]; removed: string[] };

/**
 * Where a published document's fingerprint is stored: one `app_settings` row
 * per document, `legal_surface.<document key>` (#1292).
 *
 * A third prefix beside `page_visibility.` and `legal_publication.`, and
 * deliberately **not** one of the reserved public namespaces in
 * `src/lib/public-namespaces.ts`: no view serves it to `anon`, because which
 * switches an organization has flipped since it last published is nobody's
 * business but its own.
 */
export const LEGAL_SURFACE_PREFIX = "legal_surface.";

/**
 * An absent fingerprint is **unknown**, not "collected nothing" (#1292).
 *
 * Every document published before the fingerprint existed has no record of
 * what it covered. Reading that as an empty set would report every live
 * surface as added and hand every tenant that has ever published a false drift
 * warning on the day this ships -- starting with the first tenant, whose three
 * documents are its own. How to say "unknown" is the caller's problem; it only
 * has to survive the comparison, which is what the `null` return is for.
 */
export function surfaceDrift(
  published: readonly string[] | null | undefined,
  current: readonly string[],
): SurfaceDrift | null {
  if (!published) return null;
  const before = new Set(published);
  const now = new Set(current);
  return {
    added: current.filter((key) => !before.has(key)),
    removed: published.filter((key) => !now.has(key)),
  };
}

/**
 * One published legal document's drift state, as the portal renders it.
 *
 * Lives here rather than beside the read in `@/lib/legal-publication` because
 * the Legal documents panel is a client component and that module must not
 * reach the client bundle.
 */
export type LegalDocumentDrift =
  /** Published before the fingerprint existed: no claim either way. */
  | { status: "unknown" }
  | {
      status: "checked";
      publishedAt: string | null;
      added: string[];
      removed: string[];
    };

/** Whether a document's drift state is worth saying anything about. */
export function hasDrifted(drift: LegalDocumentDrift | undefined): boolean {
  return (
    drift?.status === "checked" &&
    (drift.added.length > 0 || drift.removed.length > 0)
  );
}

/**
 * The surfaces named, de-duplicated, in the order given.
 *
 * De-duplication is not cosmetic: `volunteerApplications` and `volunteerHours`
 * are both "Volunteers", because one module governs both, and switching it off
 * moves both keys at once. "Volunteers and Volunteers was disabled" is the
 * line that would otherwise ship.
 */
export function namedSurfaces(
  keys: readonly string[],
  field: "subject" | "collects",
): string[] {
  const named: string[] = [];
  for (const key of keys) {
    const label = SURFACE_LABELS[key as keyof CollectionSurface];
    if (!label) continue;
    if (!named.includes(label[field])) named.push(label[field]);
  }
  return named;
}

/** "a", "a and b", "a, b and c" -- the list as prose rather than as a CSV. */
export function joinPhrases(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}
