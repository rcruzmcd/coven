import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listRolesAction,
  listUsersAction,
} from "../../administration/users/actions";
import { roleLabelMap } from "@/lib/format";
import {
  isOrganization,
  type OrganizationMembership,
  type PersonRow,
} from "../people-shared";
import { AccountCard } from "./account-card";
import { OrganizationsCard } from "./organizations-card";
import { ProfileCard } from "./profile-card";
import { PublicTeamCard, type PublicTeamMembership } from "./public-team-card";
import { listOtherPeople } from "./person-data";
import {
  loadCurrentPersonQuestions,
  loadPersonAnswers,
} from "@/lib/person-answers-data";
import { directoryPersonAccount, resolvePersonAccount } from "./person-account";

/**
 * The cards that belong to the person rather than to any one role.
 *
 * One component per card, each its own async server component, so the page can
 * give each one a Suspense boundary and a column. They were a single component
 * emitting five cards behind one skeleton until #1108, which cost two things:
 * the whole group popped in at once, several cards' worth of layout arriving in
 * one jump; and the group awaited its two query waves in series, so Profile --
 * the card everyone comes for -- could not render until `list_portal_users()`
 * had answered for a card only an administrator sees.
 *
 * The shared whole-directory read they used to pass between them now lives in
 * `person-data.ts` behind React `cache()`, so splitting them up did not turn
 * one select into three.
 *
 * Permissions come in as props. The page has already resolved them, and reading
 * them again per card would be four more round trips for an answer that cannot
 * change inside one request.
 */

export async function PersonProfileCard({
  person,
  canManage,
  canDeleteAnswers,
  answerAccess,
}: {
  person: PersonRow;
  canManage: boolean;
  canDeleteAnswers: boolean;
  /** Profile questions (#1744); nothing is read without `canView`. */
  answerAccess: { canView: boolean; canManage: boolean };
}) {
  const supabase = await createSupabaseServerClient();
  const [people, { data: sponsorTag }, questions, answers] = await Promise.all([
    listOtherPeople(person.id),
    // The only read of a manual role tag anywhere in the form (#1024). The
    // role checkboxes are seeded from the *derived* flags on
    // people_with_roles, which answer "holds this role" rather than "was
    // tagged by hand", so the publication flag -- which lives on the tag and
    // nowhere else -- has no source of truth without this.
    supabase
      .from("person_role_tags")
      .select("is_public")
      .eq("person_id", person.id)
      .eq("role", "sponsor")
      .maybeSingle(),
    answerAccess.canView
      ? loadCurrentPersonQuestions(supabase)
      : Promise.resolve([]),
    answerAccess.canView
      ? loadPersonAnswers(supabase, [person.id])
      : Promise.resolve(new Map()),
  ]);

  return (
    <ProfileCard
      person={person}
      people={people}
      canManage={canManage}
      canDeleteAnswers={canDeleteAnswers}
      sponsorWallPublic={sponsorTag?.is_public ?? false}
      profileQuestions={questions}
      profileAnswers={answers.get(person.id) ?? []}
      canManageAnswers={answerAccess.canManage}
    />
  );
}

export async function PersonOrganizationsCard({
  person,
  canManage,
}: {
  person: PersonRow;
  canManage: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const [people, { data: memberships }] = await Promise.all([
    listOtherPeople(person.id),
    supabase
      .from("person_organizations")
      .select(
        "id, role, is_primary, organization:people!person_organizations_organization_id_fkey(id, name, preferred_name, email, phone), person:people!person_organizations_person_id_fkey(id, name, preferred_name, email, phone)",
      )
      .eq(isOrganization(person) ? "organization_id" : "person_id", person.id),
  ]);

  return (
    <OrganizationsCard
      personId={person.id}
      isOrganization={isOrganization(person)}
      memberships={(memberships ?? []) as unknown as OrganizationMembership[]}
      people={people}
      canManage={canManage}
    />
  );
}

/**
 * The public team page is a page of people, so an organization has no listing
 * to show and the page does not render this for one (#1014).
 */
export async function PersonPublicTeamCard({
  person,
  canManage,
}: {
  person: PersonRow;
  canManage: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("public_team_members")
    .select("id, public_role, photo_url, bio, sort_order")
    .eq("person_id", person.id)
    .maybeSingle();

  return (
    <PublicTeamCard
      personId={person.id}
      personName={person.name}
      membership={(data ?? null) as PublicTeamMembership | null}
      canManage={canManage}
    />
  );
}

export async function PersonAccountCard({
  person,
  canManagePerson,
  canUnlinkAccount,
}: {
  person: PersonRow;
  canManagePerson: boolean;
  /** constituent_claims:manage, which the unlink is written under (#1193). */
  canUnlinkAccount: boolean;
}) {
  // list_portal_users() reports role *names*; the account card renders the
  // tenant's own wording for them (#910).
  const [portalUsers, roles] = await Promise.all([
    listUsersAction(),
    listRolesAction(),
  ]);

  const { account, linkable } = resolvePersonAccount(
    person.id,
    person.email,
    portalUsers && "data" in portalUsers ? portalUsers.data : [],
  );

  return (
    <AccountCard
      personId={person.id}
      personName={person.name}
      // Both actions degrade to an empty list without administration:manage, so
      // a claims reviewer falls back to what the person row itself says (#1193).
      account={account ?? directoryPersonAccount(person)}
      hasPortalAccess={person.has_portal_access}
      linkable={linkable}
      roleLabels={roleLabelMap(roles && "data" in roles ? roles.data : [])}
      notificationEmail={person.notification_email}
      notificationEmailPending={person.notification_email_pending}
      canManagePerson={canManagePerson}
      canUnlinkAccount={canUnlinkAccount}
    />
  );
}
