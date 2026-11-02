import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { detailTitle } from "@/lib/portal/detail-title";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { FieldCardSkeleton } from "@/components/portal/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { AspectActions } from "../aspects/aspect-action-row";
import { PERSON_ASPECTS } from "../aspects/registry";
import { aspectsFor } from "../aspects/types";
import {
  PEOPLE_WITH_ROLES,
  PersonAccountBadge,
  isOrganization,
  rolesFor,
  type PersonRow,
} from "../people-shared";
import { applyLexicon } from "@/lib/lexicon";
import { personRoleLabel } from "@/lib/person-roles";
import { getPortalVocabulary } from "@/lib/tenant-person-roles";
import { ContactFor } from "./contact-for";
import { PartnershipsCard } from "./partnerships-card";
import { PersonActivity, type ActivitySection } from "./person-activity";
import { PersonScreeningCard } from "./screening-card";
import {
  PersonAccountCard,
  PersonOrganizationsCard,
  PersonProfileCard,
  PersonPublicTeamCard,
} from "./person-core-cards";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: await detailTitle({
      table: "people",
      column: "name",
      id,
      fallback: "Person",
    }),
  };
}

/**
 * primary_contact is a computed relationship on the view; see PERSON_COLUMNS
 * in people-directory.tsx for why, and for why this is annotated `string`
 * rather than left as a literal (#813 Phase 1).
 */
const PERSON_DETAIL_COLUMNS: string =
  "id, name, email, notification_email, notification_email_pending, phone, pronouns, instagram_handle, notes, logo_url, website, auth_user_id, is_donor, is_sponsor, is_volunteer, is_attendee, is_staff, is_partner, is_recipient, person_type, riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain, address_line1, address_line2, address_city, address_region, address_postal_code, address_country, has_portal_access, account_email, primary_contact_person_id, primary_contact(id, name, email, phone)";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);

  // The only await in the page body. Everything else is a sibling async
  // component, so all of their queries start in the same wave rather than
  // waiting on one another -- and each streams in behind its own Suspense
  // boundary instead of the route's all-or-nothing loading.tsx.
  const [{ data: person }, vocabulary] = await Promise.all([
    supabase
      .from(PEOPLE_WITH_ROLES)
      .select(PERSON_DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle(),
    getPortalVocabulary(supabase),
  ]);

  if (!person) notFound();
  const personRow = person as unknown as PersonRow;

  const canManage = hasPermission(permissions, "people", "manage");
  // A rider profile deletion request reaches whoever is running the event as
  // often as it reaches the directory, and a lead working the door holds
  // events:manage without necessarily holding people:manage (#602). Matches the
  // gate on delete_rider_profile itself.
  const canDeleteRiderProfile =
    canManage || hasPermission(permissions, "events", "manage");
  // Profile questions (#1744): read with person_answers:view, written by
  // set_person_answers(), which also wants people:manage. The module carries
  // the resource, so both are false on a tenant without it.
  const answerAccess = {
    canView: hasPermission(permissions, "person_answers", "view"),
    canManage:
      canManage && hasPermission(permissions, "person_answers", "manage"),
  };
  const canManageAccounts = hasPermission(
    permissions,
    "administration",
    "manage",
  );
  // Undoing a claim decision belongs to whoever makes them (#1193).
  const canUnlinkAccount = hasPermission(
    permissions,
    "constituent_claims",
    "manage",
  );
  // Screening outcomes are their own resource rather than part of Volunteers
  // (#1360): whether somebody was cleared is a narrower question than whether
  // a coordinator may work the application queue.
  const canViewScreening = hasPermission(
    permissions,
    "volunteer_screening",
    "view",
  );
  const canRecordScreening = hasPermission(
    permissions,
    "volunteer_screening",
    "manage",
  );

  // One section per role the person actually holds. The flags come from the
  // records behind them (20260903030000), so a person without is_donor provably
  // has no donations -- before the registry every card rendered for everybody,
  // empty or not.
  //
  // The tab strip names the *role* in the tenant's words while the card inside
  // names the records ("Donor" over "Donations (3)"), which is why the label
  // here comes from the role registry rather than from the aspect's own
  // `{term}` template -- that template is written for the screen-reader name on
  // the action group below, and reads as a heading rather than as a tab.
  const sections: ActivitySection[] = aspectsFor(PERSON_ASPECTS, personRow).map(
    (aspect) => ({
      key: aspect.key,
      label: personRoleLabel(aspect.key, vocabulary),
      panel: (
        <Suspense fallback={<FieldCardSkeleton rows={3} />}>
          <aspect.HistoryCard
            personId={personRow.id}
            actions={
              <AspectActions
                // The registry's label is a template in the tenant's own words
                // (#911); it names this group for a screen reader.
                aspect={{
                  ...aspect,
                  label: applyLexicon(aspect.label, vocabulary),
                }}
                permissions={permissions}
              />
            }
          />
        </Suspense>
      ),
    }),
  );

  return (
    <>
      <PortalBreadcrumbs current={personRow.name ?? "Person"} />

      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          {personRow.name ?? "—"}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      {/* What this record *is*, next to its name. These badges sat inside the
          Profile card until #1108, where they answered the first question
          anyone brings to the page -- is this a volunteer, an organization,
          somebody who can sign in -- only after a scroll, and vanished
          entirely while the profile was being edited.

          `rolesFor` rather than the aspect list below, deliberately: it is the
          one function that decides which roles may be *named* on a chip, and
          it declines Recipient for the reason its own comment gives. The
          sections below still carry Recipient, which is the disclosure #1073
          asked for -- one record, opened on purpose -- rather than a label
          legible at a glance to every holder of people:view. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {rolesFor(personRow, vocabulary).map((role) => (
          <Badge key={role} variant="secondary">
            {role}
          </Badge>
        ))}
        {isOrganization(personRow) && (
          <Badge variant="outline">Organization</Badge>
        )}
        <PersonAccountBadge person={personRow} />
      </div>

      <Suspense>
        <ContactFor personId={personRow.id} />
      </Suspense>

      {/* Two thirds and one third, rather than two halves. An equal grid is
          row-major, so every row was as tall as its tallest card and Profile --
          by far the biggest, carrying a whole inline form -- left a hole beside
          whatever short card it happened to land next to. Cards stack within a
          column instead, so a height mismatch costs nothing and a card
          streaming in pushes only what is below it. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Suspense fallback={<FieldCardSkeleton rows={6} />}>
            <PersonProfileCard
              person={personRow}
              canManage={canManage}
              canDeleteRiderProfile={canDeleteRiderProfile}
              answerAccess={answerAccess}
            />
          </Suspense>

          <PersonActivity sections={sections} />

          {/* Not a section above: it returns null for the many people with no
              partnership involvement at all, and a tab cannot be withdrawn
              once the strip has drawn it. */}
          <Suspense fallback={<FieldCardSkeleton rows={3} />}>
            <PartnershipsCard
              personId={personRow.id}
              showPipeline={!personRow.is_partner}
            />
          </Suspense>

          {/* Beside the registry rather than in it (#1360): an aspect card
              renders for every holder of people:view and takes no permissions
              prop, and this is the one card on the page that must not. */}
          <Suspense fallback={<FieldCardSkeleton rows={2} />}>
            <PersonScreeningCard
              personId={personRow.id}
              canView={canViewScreening}
              canManage={canRecordScreening}
            />
          </Suspense>
        </div>

        <div className="flex flex-col gap-6">
          <Suspense fallback={<FieldCardSkeleton rows={3} />}>
            <PersonOrganizationsCard person={personRow} canManage={canManage} />
          </Suspense>

          {!isOrganization(personRow) && (
            <Suspense fallback={<FieldCardSkeleton rows={3} />}>
              <PersonPublicTeamCard person={personRow} canManage={canManage} />
            </Suspense>
          )}

          {/* Two readers, one card (#1193): an administrator, who sees the
              account's roles and status, and a claims reviewer, who sees that
              it exists and can detach it. */}
          {(canManageAccounts || canUnlinkAccount) && (
            <Suspense fallback={<FieldCardSkeleton rows={3} />}>
              <PersonAccountCard
                person={personRow}
                canManagePerson={canManage}
                canUnlinkAccount={canUnlinkAccount}
              />
            </Suspense>
          )}
        </div>
      </div>
    </>
  );
}
