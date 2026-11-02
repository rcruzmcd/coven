import { parsePronouns } from "@/lib/pronouns";

import { isPersonType, type PersonType } from "./people-shared";

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

/** The manual role assertions behind the form's role checkboxes. */
export type PersonRoleTag =
  | "donor"
  | "sponsor"
  | "volunteer"
  | "attendee"
  | "staff"
  | "partner"
  | "recipient";

/**
 * The role columns are no longer written directly: since
 * 20260903010000_sync_person_role_flags they are recomputed from the records
 * that create each role, unioned with these manual tags, so a column write
 * would just be erased by the next recompute. The parsed form therefore
 * carries the checkbox state separately from the person's own columns.
 */
export type ParsedPersonForm = {
  data: PersonFormData;
  roles: PersonRoleTag[];
  /**
   * The subset of `roles` this save is publishing (#1024). Only `sponsor` can
   * be here today -- it is the one role with a public surface, the sponsor
   * wall on /support/sponsorship -- and only for an organization, since the
   * wall shows the logo and website that live on that branch of the record.
   *
   * Both conditions are re-checked here rather than trusted from the hidden
   * checkbox: the form omits the control for an individual, but FormData is
   * whatever the request says it is.
   */
  publicRoles: PersonRoleTag[];
};

export type PersonFormData = {
  name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  pronouns: string | null;
  instagram_handle: string | null;
  notes: string | null;
  logo_url: string | null;
  website: string | null;
  person_type: PersonType;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
};

export function parsePersonForm(
  formData: FormData,
): { error: string } | ParsedPersonForm {
  const name = String(formData.get("name") ?? "").trim();
  const preferredName = String(formData.get("preferredName") ?? "").trim();
  // Lowercased, not just trimmed: people.email is the schema's person
  // identity key (resolve_or_create_person_by_email and every auth-linking
  // RPC match on lower(email)), and since
  // 20260904170000_normalize_person_email.sql a trigger canonicalizes it on
  // write. Doing the same here keeps what the form shows and what the row
  // stores identical, and matches createPendingGrantAction's handling of
  // pending_role_grants.email.
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const pronouns = parsePronouns(formData.get("pronouns"));
  const instagramHandle = String(formData.get("instagramHandle") ?? "")
    .trim()
    .replace(/^@/, "");
  const notes = String(formData.get("notes") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const is_donor =
    formData.get("isDonor") === "on" || formData.get("isDonor") === "true";
  const is_sponsor =
    formData.get("isSponsor") === "on" || formData.get("isSponsor") === "true";
  const is_volunteer =
    formData.get("isVolunteer") === "on" ||
    formData.get("isVolunteer") === "true";
  const personTypeRaw = String(formData.get("personType") ?? "individual");
  const is_attendee =
    formData.get("isAttendee") === "on" ||
    formData.get("isAttendee") === "true";
  const is_staff =
    formData.get("isStaff") === "on" || formData.get("isStaff") === "true";
  const is_partner =
    formData.get("isPartner") === "on" || formData.get("isPartner") === "true";
  const is_recipient =
    formData.get("isRecipient") === "on" ||
    formData.get("isRecipient") === "true";
  const sponsorWallPublic =
    formData.get("sponsorWallPublic") === "on" ||
    formData.get("sponsorWallPublic") === "true";
  // The postal address (#1164). Trimmed and nothing else: a format check here
  // is a way to refuse a real address, and the columns cap length themselves.
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim();
  const addressCity = String(formData.get("addressCity") ?? "").trim();
  const addressRegion = String(formData.get("addressRegion") ?? "").trim();
  const addressPostalCode = String(
    formData.get("addressPostalCode") ?? "",
  ).trim();
  const addressCountry = String(formData.get("addressCountry") ?? "").trim();

  // Also a check constraint since #1206 (donor_identified_or_anonymous): this
  // form writes public.people directly, so the table is reachable over
  // PostgREST by anything holding the permission, and a person nothing names
  // is a row nobody can find in the directory, a merge review or an export.
  if (!name) return { error: "Name is required." };
  if (!isPersonType(personTypeRaw)) {
    return {
      error: "Select whether this is an individual or an organization.",
    };
  }
  if (
    !is_donor &&
    !is_sponsor &&
    !is_volunteer &&
    !is_attendee &&
    !is_staff &&
    !is_partner &&
    !is_recipient
  ) {
    return {
      error:
        "Select at least one role for this person — Donor, Sponsor, Volunteer, Attendee, Staff, Partner, or Recipient.",
    };
  }
  if ("error" in pronouns) return pronouns;
  if (instagramHandle && !INSTAGRAM_HANDLE_PATTERN.test(instagramHandle)) {
    return {
      error:
        "Instagram handle can only contain letters, numbers, periods, and underscores.",
    };
  }
  if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
    return { error: "Logo URL must start with http:// or https://." };
  }
  if (website && !/^https?:\/\//i.test(website)) {
    return { error: "Website must start with http:// or https://." };
  }

  const roles: PersonRoleTag[] = [];
  if (is_donor) roles.push("donor");
  if (is_sponsor) roles.push("sponsor");
  if (is_volunteer) roles.push("volunteer");
  if (is_attendee) roles.push("attendee");
  if (is_staff) roles.push("staff");
  if (is_partner) roles.push("partner");
  if (is_recipient) roles.push("recipient");

  const publicRoles: PersonRoleTag[] = [];
  if (sponsorWallPublic && is_sponsor && personTypeRaw === "organization") {
    publicRoles.push("sponsor");
  }

  return {
    roles,
    publicRoles,
    data: {
      name,
      preferred_name: preferredName || null,
      email: email || null,
      phone: phone || null,
      pronouns: pronouns.pronouns,
      instagram_handle: instagramHandle || null,
      notes: notes || null,
      logo_url: logoUrl || null,
      website: website || null,
      person_type: personTypeRaw,
      address_line1: addressLine1 || null,
      address_line2: addressLine2 || null,
      address_city: addressCity || null,
      address_region: addressRegion || null,
      address_postal_code: addressPostalCode || null,
      address_country: addressCountry || null,
    },
  };
}
