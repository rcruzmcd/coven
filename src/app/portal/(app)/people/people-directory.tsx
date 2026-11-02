import Link from "next/link";
import { Eye, ListChecks } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/portal/empty-state";
import { IconLink } from "@/components/portal/icon-link";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { SortHeaderLink } from "@/components/portal/sort-header-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type HideBelow,
} from "@/components/ui/table";
import {
  buildHref,
  PAGE_SIZE,
  escapeLikePattern,
  pageRange,
  parsePage,
  parsePerPage,
  quoteOrValue,
  totalPagesFor,
} from "@/lib/pagination";
import { SearchField } from "@/components/search-field";
import { LinkPendingPulse } from "@/components/link-pending";
import {
  ListNavigationProvider,
  ListPendingRegion,
} from "@/components/portal/list-navigation";
import { StatTile } from "../home/stat-tile";
import { NewPersonDialog } from "./new-person-dialog";
import { PROFILE_QUESTIONS_PATH } from "./profile-questions/profile-questions-draft";
import {
  accountEmailToShow,
  PEOPLE_WITH_ROLES,
  PersonAccountBadge,
  rolesFor,
  type PersonRow,
  type PersonType,
} from "./people-shared";
import { getPortalVocabulary } from "@/lib/tenant-person-roles";
import {
  emptyManageDescription,
  resolveSegment,
  resolveStats,
  visibleSegments,
  type PeopleSegment,
} from "./people-segments";
import { PeopleSegmentNav } from "./people-segment-nav";
import { SegmentCounterpartNote } from "./segment-counterpart-note";

/**
 * Every column the directory table and its row links need. `primary_contact`
 * is a computed relationship on the view rather than the usual column embed:
 * primary_contact_person_id points at people itself, and from the view both
 * directions of that self-reference are visible, which PostgREST rejects as
 * ambiguous (see 20260903030000).
 */
/**
 * Annotated `string` rather than left as a literal (#813 Phase 1): with the
 * schema-typed client, PostgREST's select parser walks this 26-column list and
 * its embedded `primary_contact(...)` relationship at the type level, and TypeScript
 * gives up with "type instantiation is excessively deep". Widening the constant
 * stops the parse; the result is typed by the `PersonRow` assertion below,
 * which is what typed it before the generated types existed either.
 */
const PERSON_COLUMNS: string =
  "id, name, preferred_name, email, notification_email, notification_email_pending, phone, pronouns, instagram_handle, notes, logo_url, website, auth_user_id, is_donor, is_sponsor, is_volunteer, is_attendee, is_staff, is_partner, is_recipient, person_type, address_line1, address_line2, address_city, address_region, address_postal_code, address_country, has_portal_access, primary_contact_person_id, primary_contact(id, name, email, phone)";

/**
 * The shared body behind /portal/people and its role segments. Donors,
 * Sponsors, and Attendees were near-identical copies of this file; everything
 * that genuinely differs between them lives in the PeopleSegment config.
 */
const SORTABLE_COLUMNS = ["name", "email", "phone"] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

/**
 * Roles is missing from this on purpose: the cell is a string joined in JS
 * from six boolean flags, so there is no column for Postgres to order by.
 * Sorting it would mean ordering on one flag and calling it something else.
 */
const COLUMNS: { key: SortColumn; label: string; hideBelow?: HideBelow }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email", hideBelow: "md" },
  { key: "phone", label: "Phone", hideBelow: "lg" },
];

export async function PeopleDirectory({
  segment: segmentTemplate,
  searchParams,
}: {
  segment: PeopleSegment;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "people", "manage");
  // Its own permission, and its own module: on a tenant without the
  // constituent area, `has_permission()` is false for everyone here and the
  // link never renders (#1162).
  const canReviewClaims = hasPermission(
    permissions,
    "constituent_claims",
    "manage",
  );
  // The settings view beside this list (#1743): what the organization asks
  // about a person. Its module gates the permission, as with claims.
  const canEditProfileQuestions = hasPermission(
    permissions,
    "person_answers",
    "manage",
  );
  // Every word this page shows -- the heading, the New button, the role facet,
  // the Roles column, both empty states -- is the tenant's (#911). The keys it
  // filters and sorts on are not.
  const vocabulary = await getPortalVocabulary(supabase);
  const segment = resolveSegment(segmentTemplate, vocabulary);

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "name";
  const dir: "asc" | "desc" = raw("dir") === "desc" ? "desc" : "asc";

  const page = parsePage(raw("page"));
  const perPage = parsePerPage(raw("perPage"));

  // Accounts is the only segment that asks for more than the shared list, and
  // what it asks for is a security-definer lookup per row (20260916150000), so
  // it is appended rather than folded into the constant.
  const columns: string = segment.extraSelect
    ? `${PERSON_COLUMNS}, ${segment.extraSelect}`
    : PERSON_COLUMNS;

  let query = supabase
    .from(PEOPLE_WITH_ROLES)
    .select(columns, { count: "exact" })
    .order(sort, { ascending: dir === "asc" })
    .order("id", { ascending: true });

  if (segment.filterColumn) query = query.eq(segment.filterColumn, true);
  if (segment.personType) query = query.eq("person_type", segment.personType);
  if (search) {
    // preferred_name too, as the command palette and the person picker do:
    // the name someone goes by is the one staff type.
    const pattern = quoteOrValue(`%${escapeLikePattern(search)}%`);
    query = query.or(
      `name.ilike.${pattern},preferred_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
    );
  }

  const { offset, to } = pageRange(page, perPage);
  const [{ data: people, count }, { data: peopleOptions }, stats] =
    await Promise.all([
      query.range(offset, to),
      supabase
        .from("people")
        .select(
          "id, name, preferred_name, email, phone, person_type, auth_user_id",
        )
        .order("name", { ascending: true })
        // `people.person_type` is `text` guarded by the
        // `people_person_type_check` constraint, which the type generator
        // cannot read, so it comes back as `string` (#813 Phase 1). The
        // constraint is the guarantee; this states it where the rows are read.
        .overrideTypes<{ person_type: PersonType }[]>(),
      segment.stats ? segment.stats(supabase) : Promise.resolve(null),
    ]);
  const segmentStats = stats && resolveStats(stats, vocabulary);
  const peopleRows = (people ?? []) as unknown as PersonRow[];
  // The Accounts segment is a list of accounts that happens to be rendered as
  // people, so it says which door each one opens and, where it differs, which
  // address it signs in as. No new column for either: the budget is three
  // (`table-column-budget.test.ts`) and this table already spends it.
  const showsAccounts = segment.filterColumn === "has_account";

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  // On filterParams rather than in each href, so sorting and paging both
  // carry the reader's choice without either having to remember to.
  if (perPage !== PAGE_SIZE) filterParams.set("perPage", String(perPage));

  // Every segment -- donors, sponsors, staff and the rest -- renders through
  // this component, so these hrefs have to be built from `segment.basePath`
  // rather than a literal path.
  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildHref(segment.basePath, filterParams, {
      sort: column,
      dir: nextDir,
    });
  }

  function pageHref(nextPage: number) {
    return buildHref(segment.basePath, filterParams, {
      sort,
      dir,
      page: nextPage,
    });
  }

  function perPageHref(nextPerPage: number) {
    // Back to page one: a bigger page renumbers them all, and page 4 of 9 is
    // nothing in particular once each page holds 25.
    return buildHref(segment.basePath, filterParams, {
      sort,
      dir,
      perPage: nextPerPage,
      page: 1,
    });
  }

  const totalPages = totalPagesFor(count, perPage);
  const hasActiveFilters = !!search;

  // Searching narrows the current view: carry a non-default sort and page
  // size through the submission (the other list pages do the same), never
  // the page number, which means nothing once the rows change.
  const sortIsDefault = sort === "name" && dir === "asc";
  const preserve = {
    sort: sortIsDefault ? "" : sort,
    dir: sortIsDefault ? "" : dir,
    perPage: perPage !== PAGE_SIZE ? String(perPage) : "",
  };

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          {segment.title}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      {segment.counterpart && (
        <SegmentCounterpartNote
          counterpart={segment.counterpart}
          permissions={permissions}
        />
      )}

      {/* Everything below navigates through the URL -- segments, sort, page,
          search -- so it all shares one pending state, and the table card
          dims while any of it is in flight. */}
      <ListNavigationProvider>
        <PeopleSegmentNav
          segments={visibleSegments(permissions)}
          active={segment.value}
          vocabulary={vocabulary}
        />

        {segmentStats && segmentStats.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {segmentStats.map((stat) => (
              <StatTile
                key={stat.label}
                label={stat.label}
                value={stat.value}
                caption={stat.caption}
              />
            ))}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div className="rainbow-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
            <SearchField
              action={segment.basePath}
              defaultValue={search}
              placeholder="Search name, email, phone..."
              preserve={preserve}
            />

            {/* Only on the full list: a duplicate pair can straddle two
              segments, so the queue belongs on the one page holding both
              halves of it. */}
            {canManage && segment.isAllPeople && (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/portal/people/duplicates" />}
              >
                <LinkPendingPulse>Find duplicates</LinkPendingPulse>
              </Button>
            )}

            {/* Beside Find duplicates and for the same reason: a claim is
              matched against the whole directory, so the queue belongs on the
              page that lists all of it. */}
            {canReviewClaims && segment.isAllPeople && (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/portal/people/claims" />}
              >
                <LinkPendingPulse>Account claims</LinkPendingPulse>
              </Button>
            )}

            {/* Beside the other whole-directory entries: the questions are
              asked of everybody, whatever segment they sit in. */}
            {canEditProfileQuestions && segment.isAllPeople && (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={PROFILE_QUESTIONS_PATH} />}
              >
                <ListChecks className="size-4" />
                <LinkPendingPulse>Profile questions</LinkPendingPulse>
              </Button>
            )}

            {canManage && segment.newPerson && (
              <NewPersonDialog
                people={peopleOptions ?? []}
                defaultRole={segment.newPerson.defaultRole}
                defaultPersonType={segment.newPerson.defaultPersonType}
                triggerLabel={segment.newPerson.triggerLabel}
              />
            )}
          </div>

          <ListPendingRegion>
            <Card>
              <CardContent className="px-0">
                {peopleRows.length === 0 ? (
                  <EmptyState
                    title={
                      hasActiveFilters
                        ? `No ${segment.nounPlural} match your filters`
                        : segment.emptyTitle
                    }
                    description={
                      hasActiveFilters
                        ? "Clear or loosen the filters to see more."
                        : canManage
                          ? emptyManageDescription(segment, permissions)
                          : segment.emptyDescriptionView
                    }
                  />
                ) : (
                  <Table stickyFirstColumn stickyHeader="page">
                    <TableHeader>
                      <TableRow>
                        <TableHead sortDirection={sort === "name" ? dir : null}>
                          <SortHeaderLink
                            href={sortHref("name")}
                            label="Name"
                            dir={sort === "name" ? dir : null}
                          />
                        </TableHead>
                        <TableHead>Roles</TableHead>
                        {COLUMNS.filter((column) => column.key !== "name").map(
                          (column) => (
                            <TableHead
                              key={column.key}
                              hideBelow={column.hideBelow}
                              sortDirection={sort === column.key ? dir : null}
                            >
                              <SortHeaderLink
                                href={sortHref(column.key)}
                                label={column.label}
                                dir={sort === column.key ? dir : null}
                              />
                            </TableHead>
                          ),
                        )}
                        <TableHead className="w-0">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {peopleRows.map((person) => (
                        <TableRow key={person.id}>
                          <TableCell
                            className="max-w-xs truncate font-medium"
                            title={person.name ?? undefined}
                          >
                            <Link
                              href={`/portal/people/${person.id}`}
                              className="hover:underline"
                            >
                              {person.name ?? "—"}
                            </Link>
                            {showsAccounts && (
                              <>
                                {" "}
                                <PersonAccountBadge person={person} />
                              </>
                            )}
                          </TableCell>
                          <TableCell className="app-muted">
                            {rolesFor(person, vocabulary).join(", ") || "—"}
                          </TableCell>
                          <TableCell hideBelow="md" className="app-muted">
                            {person.email ?? "—"}
                            {showsAccounts && accountEmailToShow(person) && (
                              <span className="block text-xs">
                                Signs in as {accountEmailToShow(person)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell hideBelow="lg" className="app-muted">
                            {person.phone ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <IconLink
                              href={`/portal/people/${person.id}`}
                              label={`View ${person.name ?? segment.noun}`}
                            >
                              <Eye />
                            </IconLink>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </ListPendingRegion>

          {peopleRows.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              count={count}
              pageSize={perPage}
              hrefFor={pageHref}
              perPageHrefFor={perPageHref}
            />
          )}
        </div>
      </ListNavigationProvider>
    </>
  );
}
