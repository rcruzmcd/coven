import {
  hasAnyPermission,
  type PermissionCheck,
  type PermissionMap,
} from "@/lib/auth/permissions";
import { applyLexicon, type Lexicon } from "@/lib/lexicon";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PersonType, RoleKey } from "./people-shared";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export type SegmentStat = {
  /** A `{term}` template, like every other word in this file. */
  label: string;
  value: number;
  caption: string;
};

/**
 * One view of the shared `people` directory. Donors, Sponsors, and Attendees
 * used to be near-identical copies of the People page -- donors/page.tsx and
 * sponsors/page.tsx were byte-identical after substituting the word -- so the
 * only things that actually varied are collected here and the page body is
 * shared. Adding the specced Staff type is now a config entry rather than a
 * fifth copy.
 */
/**
 * A boolean column on `people_with_roles` a segment can narrow by. The six
 * role flags, plus `has_account` -- which is not a role at all but is the same
 * shape to query, and exists on the view (20260916130000) precisely so that
 * "who holds an account" could be a filter rather than a second screen (#1193).
 */
export type DirectoryFlag = RoleKey | "has_account";

/**
 * The line under a segment's heading: what this list is, and the surface that
 * answers the neighbouring question (#1198).
 *
 * Only Accounts carries one, because only Accounts has a counterpart -- the
 * other eight are views of the directory, and the directory is where the
 * reader already is. `docs/portal-navigation.md` states the rule the two
 * sentences make visible: Administration → Users answers who may act on the
 * organization's behalf, People answers who the organization knows.
 *
 * `scope` always renders; `crossSurface` only for a reader who can open what it
 * names, on the same reasoning as `crossSectionHint`. So the first sentence has
 * to stand on its own, and does.
 *
 * Neither field is a `{term}` template. An account is not one of the seven
 * relationships a tenant renames, and the section it points at is named the
 * same in every tenant.
 */
export type SegmentCounterpart = {
  scope: string;
  crossSurface: {
    /** Prose before the link, e.g. "Staff who can sign in are in". */
    before: string;
    linkLabel: string;
    href: string;
    access: readonly PermissionCheck[];
  };
};

export type PeopleSegment = {
  /** Stable id, and the last path segment for everything but the full list. */
  value: string;
  /** Route this segment lives at, used for pagination and filter links. */
  basePath: string;
  title: string;
  /**
   * Column to restrict the directory to. Omitted for the full directory,
   * which offers the role facet instead.
   */
  /** Narrows the segment to one flag. Roles are additive, so this stacks. */
  filterColumn?: DirectoryFlag;
  /** Narrows the segment to one entity type, which roles cannot express. */
  personType?: PersonType;
  /**
   * What a reader must hold for this segment to exist at all -- absent from
   * the strip, and a 404 at its own route. See the note on `crossSectionHint`
   * for why this is the exception rather than the rule.
   */
  access?: readonly PermissionCheck[];
  /**
   * Columns only this segment needs, appended to the directory's shared select.
   * `account_email` is a security-definer computed column (20260916150000), so
   * every other segment is spared the per-row lookup.
   */
  extraSelect?: string;
  /**
   * The one segment that lists everybody. It offers no filter of its own since
   * #957: the strip is the role facet, and a facet that duplicated it was the
   * two-ways-to-do-one-thing the ticket asked to avoid. What it does have that
   * the others do not is the duplicates queue -- a duplicate pair can straddle
   * two segments, so it belongs on the page that lists both halves.
   */
  isAllPeople?: boolean;
  newPerson?: {
    triggerLabel: string;
    defaultRole?: RoleKey;
    defaultPersonType?: PersonType;
  };
  /** Noun used in row action labels, e.g. "sponsor". Lower case. */
  noun: string;
  /**
   * Its plural, e.g. "sponsors". Spelled out rather than `noun + "s"`, which is
   * what the filtered empty state used to do -- and which made the People
   * directory say "No persons match your filters".
   */
  nounPlural: string;
  emptyTitle: string;
  /** Shown when the viewer can add records; the other when they cannot. */
  emptyDescriptionManage: string;
  emptyDescriptionView: string;
  /**
   * A second sentence naming another section, appended to
   * `emptyDescriptionManage` only when the reader can reach that section
   * (#903).
   *
   * Nearly all of these segments are filters on the `people` directory -- role
   * flags on a person row, not modules -- so `people` being core keeps them
   * reachable. Accounts is the one exception, and carries `access` to say so.
   * What was not reachable was the advice: "or approve an
   * application from Volunteers > Applications" is a dead end for a tenant
   * whose Volunteers module is off, and "record a donation from Inventory >
   * Donations" for one without Inventory. Split out rather than gated as a
   * whole string, so the sentence before it still stands on its own.
   */
  crossSectionHint?: {
    text: string;
    access: readonly PermissionCheck[];
  };
  /** A line under the heading naming the other half of a split pair (#1198). */
  counterpart?: SegmentCounterpart;
  /** Optional tiles above the table. */
  stats?: (supabase: SupabaseServerClient) => Promise<SegmentStat[]>;
};

/**
 * Recurring vs first-time attendance, derived from check-ins rather than
 * registrations: signing up and turning up are different things, and the
 * distinction is the point of the tiles.
 */
async function attendeeStats(
  supabase: SupabaseServerClient,
): Promise<SegmentStat[]> {
  const { data } = await supabase
    .from("event_registrations")
    .select("person_id, event_id")
    .not("checked_in_at", "is", null)
    .not("person_id", "is", null);

  const eventsByPerson = new Map<string, Set<string>>();
  for (const registration of data ?? []) {
    const personId = registration.person_id as string;
    const events = eventsByPerson.get(personId) ?? new Set<string>();
    events.add(registration.event_id as string);
    eventsByPerson.set(personId, events);
  }

  let recurring = 0;
  let firstTime = 0;
  for (const events of eventsByPerson.values()) {
    if (events.size > 1) recurring += 1;
    else firstTime += 1;
  }

  return [
    {
      label: "Recurring {attendee_plural:lower}",
      value: recurring,
      caption: "Checked in to more than one event",
    },
    {
      label: "First-time {attendee_plural:lower}",
      value: firstTime,
      caption: "Checked in to exactly one event so far",
    },
  ];
}

export const PEOPLE_SEGMENT: PeopleSegment = {
  value: "people",
  basePath: "/portal/people",
  title: "People",
  isAllPeople: true,
  newPerson: { triggerLabel: "New Person" },
  noun: "person",
  nounPlural: "people",
  emptyTitle: "No people added yet",
  emptyDescriptionManage: "Add the first one with New Person above.",
  emptyDescriptionView:
    "People appear here once someone is added to the directory or registers for an event.",
};

export const DONORS_SEGMENT: PeopleSegment = {
  value: "donors",
  basePath: "/portal/people/donors",
  title: "{donor_plural}",
  filterColumn: "is_donor",
  newPerson: { triggerLabel: "New {donor}", defaultRole: "is_donor" },
  noun: "{donor:lower}",
  nounPlural: "{donor_plural:lower}",
  emptyTitle: "No {donor_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {donor} above.",
  crossSectionHint: {
    text: "You can also record a donation and its {donor:lower} from Inventory › Donations.",
    access: [{ resource: "inventory", level: "manage" }],
  },
  emptyDescriptionView:
    "{donor_plural} appear here once someone is added with the {donor:lower} role or recorded on a donation.",
};

export const SPONSORS_SEGMENT: PeopleSegment = {
  value: "sponsors",
  basePath: "/portal/people/sponsors",
  title: "{sponsor_plural}",
  filterColumn: "is_sponsor",
  newPerson: { triggerLabel: "New {sponsor}", defaultRole: "is_sponsor" },
  noun: "{sponsor:lower}",
  nounPlural: "{sponsor_plural:lower}",
  emptyTitle: "No {sponsor_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {sponsor} above.",
  crossSectionHint: {
    text: "You can also record a {sponsor:lower} on an event's Sponsors tab.",
    access: [{ resource: "events", level: "manage" }],
  },
  emptyDescriptionView:
    "{sponsor_plural} appear here once someone is added with the {sponsor:lower} role or recorded on an event's Sponsors tab.",
};

export const VOLUNTEERS_SEGMENT: PeopleSegment = {
  value: "volunteers",
  // Not /portal/volunteers: that is the volunteer *programme* (role types,
  // participation, applications). This is the directory filtered to people who
  // volunteer, so it lives under People and inherits its people:view guard.
  // The other six joined it under /portal/people in #957.
  basePath: "/portal/people/volunteers",
  title: "{volunteer_plural}",
  filterColumn: "is_volunteer",
  newPerson: { triggerLabel: "New {volunteer}", defaultRole: "is_volunteer" },
  noun: "{volunteer:lower}",
  nounPlural: "{volunteer_plural:lower}",
  emptyTitle: "No {volunteer_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {volunteer} above.",
  crossSectionHint: {
    text: "You can also approve an application from Volunteers › Applications.",
    access: [{ resource: "volunteers", level: "manage" }],
  },
  emptyDescriptionView:
    "{volunteer_plural} appear here once someone applies, signs up for an event shift, or has hours logged.",
};

export const ATTENDEES_SEGMENT: PeopleSegment = {
  value: "attendees",
  basePath: "/portal/people/attendees",
  title: "{attendee_plural}",
  filterColumn: "is_attendee",
  newPerson: { triggerLabel: "New {attendee}", defaultRole: "is_attendee" },
  noun: "{attendee:lower}",
  nounPlural: "{attendee_plural:lower}",
  emptyTitle: "No event {attendee_plural:lower} yet",
  emptyDescriptionManage:
    "{attendee_plural} appear here once someone registers for an event, or add one with New {attendee} above.",
  emptyDescriptionView:
    "{attendee_plural} appear here once someone registers for or is checked in at an event.",
  stats: attendeeStats,
};

export const STAFF_SEGMENT: PeopleSegment = {
  value: "staff",
  basePath: "/portal/people/staff",
  title: "{staff_plural}",
  filterColumn: "is_staff",
  newPerson: { triggerLabel: "New {staff}", defaultRole: "is_staff" },
  noun: "{staff:lower}",
  nounPlural: "{staff_plural:lower}",
  emptyTitle: "No {staff_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {staff} above.",
  crossSectionHint: {
    text: "You can also assign someone on an event's Staff tab.",
    access: [{ resource: "events", level: "manage" }],
  },
  emptyDescriptionView:
    "{staff_plural} appear here once someone is added with the {staff:lower} role or assigned on an event's Staff tab.",
};

export const PARTNERS_SEGMENT: PeopleSegment = {
  value: "partners",
  basePath: "/portal/people/partners",
  title: "{partner_plural}",
  filterColumn: "is_partner",
  newPerson: {
    // A partner is almost always an organization, and the form requires a
    // role, so the dialog opens on the shape this segment is about.
    triggerLabel: "New {partner}",
    defaultRole: "is_partner",
    defaultPersonType: "organization",
  },
  noun: "{partner:lower}",
  nounPlural: "{partner_plural:lower}",
  emptyTitle: "No {partner_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {partner} above.",
  crossSectionHint: {
    text: "You can also close a partnership as won from Governance › Partnerships.",
    access: [{ resource: "governance", level: "manage" }],
  },
  emptyDescriptionView:
    "{partner_plural} appear here once a partnership opportunity is closed as won, or someone is added with the {partner:lower} role.",
};

export const ORGANIZATIONS_SEGMENT: PeopleSegment = {
  value: "organizations",
  basePath: "/portal/people/organizations",
  title: "Organizations",
  personType: "organization",
  newPerson: {
    triggerLabel: "New Organization",
    // Organizations are most often entered as sponsors, and the person form
    // requires at least one role, so the dialog opens with a workable default
    // rather than an entity type and no role.
    defaultRole: "is_sponsor",
    defaultPersonType: "organization",
  },
  noun: "organization",
  nounPlural: "organizations",
  emptyTitle: "No organizations added yet",
  emptyDescriptionManage:
    "Add the first one with New Organization above, or tick “This is an organization” on any person record.",
  emptyDescriptionView:
    "Organizations appear here once a person record is marked as one.",
};

/**
 * Who holds an account on the organization's website (#1193).
 *
 * Not a role and not an entity type: it is a state a directory record acquires
 * when a claim is approved (#1162) or an administrator links a staff login. It
 * is here rather than on a page of its own because the answer is the directory
 * filtered, which is what the strip is for -- the reasoning is in
 * `planning/coven/design/2026-09-16-staff-users-vs-constituent-accounts-ia.md`.
 *
 * The only gated segment. `constituent_claims:view` carries the module
 * entitlement with it (20260910010000), so a tenant that has not turned the
 * constituent area on has no reader who passes this.
 *
 * No `newPerson`: an account is something a person makes for themselves.
 */
export const ACCOUNTS_SEGMENT: PeopleSegment = {
  value: "accounts",
  basePath: "/portal/people/accounts",
  // A literal rather than a `{term}` template: the tenant renames the seven
  // relationships it has with people, and an account is not one of them.
  title: "Accounts",
  filterColumn: "has_account",
  access: [{ resource: "constituent_claims", level: "view" }],
  extraSelect: "account_email",
  noun: "account holder",
  nounPlural: "account holders",
  emptyTitle: "Nobody has an account yet",
  emptyDescriptionManage:
    "People appear here once they make an account on the website and a claim is approved from Account claims.",
  emptyDescriptionView:
    "People appear here once they make an account on the website and a claim is approved.",
  counterpart: {
    scope:
      "People who hold an account on the organization's website, which lets them see their own record and nothing else.",
    crossSurface: {
      before: "Staff who can sign in to the portal are in",
      linkLabel: "Administration › Users",
      href: "/portal/administration/users",
      access: [{ resource: "administration", level: "manage" }],
    },
  },
};

/**
 * The strip, in the order it reads (#957).
 *
 * All first, then six of the seven role segments in `PERSON_ROLES` order, then
 * Organizations -- which is last because it is the odd one out: #625 split
 * `is_organization` out of the role flags into a `person_type`, so it narrows
 * by what kind of record a row is rather than by what the person does. It is
 * still a view of the same directory, which is why it is here at all.
 *
 * The seventh role, Recipient, deliberately has no segment (#1073). The other
 * six name counterparties; a segment of recipients is a browsable roster of aid
 * recipients, which is a different privacy posture and a different product
 * decision -- this schema already clears their request notes on retention
 * (20260905170000), redacts them out of snapshots (20260907150000) and can
 * delete their profile answers on request (delete_person_answers()), none of which is true
 * of anyone else. Their history is on their own record, on the aspect card, for
 * a staffer who opened it for a reason.
 *
 * Accounts (#1193) comes after Organizations, which pushes the odd one out one
 * place along: it narrows by neither what a person does nor what kind of record
 * they are, but by whether they can sign in to the website. It is also the only
 * one a reader can be absent from, so a strip that ended on it reads the same
 * as today's for everyone who cannot see it.
 */
export const PEOPLE_SEGMENTS: readonly PeopleSegment[] = [
  PEOPLE_SEGMENT,
  DONORS_SEGMENT,
  SPONSORS_SEGMENT,
  VOLUNTEERS_SEGMENT,
  ATTENDEES_SEGMENT,
  STAFF_SEGMENT,
  PARTNERS_SEGMENT,
  ORGANIZATIONS_SEGMENT,
  ACCOUNTS_SEGMENT,
];

/**
 * The segments a reader may see, which for everyone but an account-claims
 * reviewer is all of them.
 *
 * Both the strip and the segment's own route read this: a link nobody can
 * follow and a route with no link are the two halves of the same mistake, and
 * `docs/portal-navigation.md` forbids the second outright.
 */
export function visibleSegments(
  permissions: PermissionMap,
): readonly PeopleSegment[] {
  return PEOPLE_SEGMENTS.filter(
    (segment) =>
      !segment.access || hasAnyPermission(permissions, segment.access),
  );
}

/**
 * What the strip calls a segment, in the tenant's own words (#911).
 *
 * "All" rather than the full segment's own title: with the other seven beside
 * it, "People" would read as one view among them rather than as the page they
 * are all views of -- and the heading above already says People.
 */
export function segmentNavLabel(
  segment: PeopleSegment,
  vocabulary: Lexicon,
): string {
  return segment.isAllPeople ? "All" : applyLexicon(segment.title, vocabulary);
}

/**
 * The segment a `?role=` value names, for the alias `/portal/people` keeps so
 * that links written before #957 still land somewhere sensible.
 */
export function segmentForRole(role: string): PeopleSegment | undefined {
  return PEOPLE_SEGMENTS.find(
    (segment) =>
      segment.filterColumn === role &&
      // Roles only. `?role=has_account` is not a role, and honouring it would
      // be a way into a gated segment through a parameter kept for old links.
      segment.filterColumn !== "has_account" &&
      !segment.isAllPeople,
  );
}

/**
 * A segment's "you can add one here" copy, with its cross-section hint dropped
 * for a reader who cannot reach the section it names (#903).
 *
 * The hint is genuinely useful when it applies -- "or close a partnership as
 * won from Governance > Partnerships" is how most partner rows actually come
 * into being -- and is only ever advice, never the only way in: every one of
 * these segments has its own New button right above the sentence. So the
 * ungated half always stands alone, and this only ever removes.
 */
/**
 * One segment in the tenant's own words (#911).
 *
 * A copy rather than a resolution at each render site: a segment's words reach
 * a heading, a button, two empty states, a row's action label and a page's
 * `<title>`, and one of those was always going to be missed. Everything the
 * caller reads off the returned object is a word; nothing on it is a template.
 *
 * `basePath`, `filterColumn`, `personType` and the permission checks are
 * identifiers rather than copy and pass through untouched. So does
 * `counterpart`, which is copy but holds no template: see its own note.
 */
export function resolveSegment(
  segment: PeopleSegment,
  vocabulary: Lexicon,
): PeopleSegment {
  const named = (template: string) => applyLexicon(template, vocabulary);
  return {
    ...segment,
    title: named(segment.title),
    noun: named(segment.noun),
    nounPlural: named(segment.nounPlural),
    emptyTitle: named(segment.emptyTitle),
    emptyDescriptionManage: named(segment.emptyDescriptionManage),
    emptyDescriptionView: named(segment.emptyDescriptionView),
    newPerson: segment.newPerson && {
      ...segment.newPerson,
      triggerLabel: named(segment.newPerson.triggerLabel),
    },
    crossSectionHint: segment.crossSectionHint && {
      ...segment.crossSectionHint,
      text: named(segment.crossSectionHint.text),
    },
  };
}

/** The same, for the tiles a segment loads after it is resolved. */
export function resolveStats(
  stats: readonly SegmentStat[],
  vocabulary: Lexicon,
): SegmentStat[] {
  return stats.map((stat) => ({
    ...stat,
    label: applyLexicon(stat.label, vocabulary),
  }));
}

/**
 * @param segment already resolved by `resolveSegment`; this returns copy, not
 * a template.
 */
export function emptyManageDescription(
  segment: PeopleSegment,
  permissions: PermissionMap,
): string {
  const hint = segment.crossSectionHint;
  if (!hint || !hasAnyPermission(permissions, hint.access)) {
    return segment.emptyDescriptionManage;
  }
  return `${segment.emptyDescriptionManage} ${hint.text}`;
}
