"use client";

import { PERSON_TYPES, type PersonType, type RoleKey } from "./people-shared";
import { PERSON_ROLES, personRoleLabel } from "@/lib/person-roles";
import { useLexicon } from "@/components/lexicon-context";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PronounsField } from "@/components/pronouns-field";
import { LogoField } from "../website/logo-field";

export type PersonFormState = {
  name: string;
  preferredName: string;
  email: string;
  phone: string;
  pronouns: string;
  instagramHandle: string;
  notes: string;
  logoUrl: string;
  website: string;
  roles: Record<RoleKey, boolean>;
  /**
   * Publish this organization to the public sponsor wall (#1024). Only
   * meaningful alongside the sponsor role on an organization, which is the
   * only combination that renders the control -- and the only one
   * parsePersonForm will act on.
   */
  sponsorWallPublic: boolean;
  personType: PersonType;
  /**
   * The postal address (#1164). Staff-editable here and self-editable on
   * `/my/details`, which is the only pair of surfaces that write it -- the
   * person's own form carries exactly these six fields, so a correction they
   * make and one a staffer makes are the same change to the same columns.
   */
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
};

export function emptyPersonForm(
  defaultRole?: RoleKey,
  defaultPersonType: PersonType = "individual",
): PersonFormState {
  return {
    name: "",
    preferredName: "",
    email: "",
    phone: "",
    pronouns: "",
    instagramHandle: "",
    notes: "",
    logoUrl: "",
    website: "",
    roles: {
      is_donor: defaultRole === "is_donor",
      is_sponsor: defaultRole === "is_sponsor",
      is_volunteer: defaultRole === "is_volunteer",
      is_attendee: defaultRole === "is_attendee",
      is_staff: defaultRole === "is_staff",
      is_partner: defaultRole === "is_partner",
      is_recipient: defaultRole === "is_recipient",
    },
    sponsorWallPublic: false,
    personType: defaultPersonType,
    addressLine1: "",
    addressLine2: "",
    addressCity: "",
    addressRegion: "",
    addressPostalCode: "",
    addressCountry: "",
  };
}

/**
 * Whether `form` differs from `baseline` in anything a person would call
 * typing. Field by field rather than `!==` over the object: `roles` is a
 * nested object, so two fresh `emptyPersonForm()` results compared by
 * reference were always "different", and the New Person dialog armed its
 * "Leave site?" prompt on every people page before anyone opened it -- which
 * is what blocked the directory's search form from submitting.
 */
export function personFormDirty(
  form: PersonFormState,
  baseline: PersonFormState,
): boolean {
  return (Object.keys(baseline) as (keyof PersonFormState)[]).some((key) => {
    if (key === "roles") {
      return (Object.keys(baseline.roles) as RoleKey[]).some(
        (role) => form.roles[role] !== baseline.roles[role],
      );
    }
    return form[key] !== baseline[key];
  });
}

export function PersonFormFields({
  form,
  update,
  idPrefix,
}: {
  form: PersonFormState;
  update: <K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) => void;
  idPrefix: string;
}) {
  // What this organization calls the seven roles (#911). From the shell's
  // context rather than a prop: this form renders inside the New Person dialog
  // on eight segment pages and inside the profile card's edit mode, and a prop
  // threaded through all of them is one that gets dropped.
  const vocabulary = useLexicon();

  function toggleRole(key: RoleKey, checked: boolean) {
    update("roles", { ...form.roles, [key]: checked });
  }

  // Only the rendering branches on type. Values already on the record are
  // left alone rather than cleared, so switching an organization to an
  // individual by mistake does not throw away its logo and website.
  const isOrganization = form.personType === "organization";

  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-name`} required>
            Name
          </FieldLabel>
          <Input
            id={`${idPrefix}-name`}
            required
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-preferredName`}>
            Preferred name
          </FieldLabel>
          <Input
            id={`${idPrefix}-preferredName`}
            value={form.preferredName}
            placeholder="Optional"
            onChange={(event) => update("preferredName", event.target.value)}
          />
        </Field>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-phone`}>Phone</FieldLabel>
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </Field>
      </Field>

      <PronounsField
        id={`${idPrefix}-pronouns`}
        value={form.pronouns}
        onChange={(value) => update("pronouns", value)}
        description="As the person gives them. Shown wherever we introduce or write about them."
      />

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-instagramHandle`}>
          Instagram handle
        </FieldLabel>
        <Input
          id={`${idPrefix}-instagramHandle`}
          placeholder="e.g. yourorganization"
          value={form.instagramHandle}
          onChange={(event) => update("instagramHandle", event.target.value)}
        />
      </Field>

      {/* The postal address (#1164). Two lines under one label, like every
          address form: the second line is optional and naming it "Address line
          2" above its own box is a label nobody reads. */}
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-addressLine1`}>Address</FieldLabel>
        <Input
          id={`${idPrefix}-addressLine1`}
          value={form.addressLine1}
          onChange={(event) => update("addressLine1", event.target.value)}
        />
        <Input
          aria-label="Address line 2"
          value={form.addressLine2}
          onChange={(event) => update("addressLine2", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-addressCity`}>City</FieldLabel>
          <Input
            id={`${idPrefix}-addressCity`}
            value={form.addressCity}
            onChange={(event) => update("addressCity", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-addressRegion`}>
            State or region
          </FieldLabel>
          <Input
            id={`${idPrefix}-addressRegion`}
            value={form.addressRegion}
            onChange={(event) => update("addressRegion", event.target.value)}
          />
        </Field>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-addressPostalCode`}>
            Postal code
          </FieldLabel>
          <Input
            id={`${idPrefix}-addressPostalCode`}
            value={form.addressPostalCode}
            onChange={(event) =>
              update("addressPostalCode", event.target.value)
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-addressCountry`}>
            Country
          </FieldLabel>
          <Input
            id={`${idPrefix}-addressCountry`}
            value={form.addressCountry}
            onChange={(event) => update("addressCountry", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-personType`}>Type</FieldLabel>
        <Select
          value={form.personType}
          onValueChange={(value) =>
            update("personType", (value as PersonType) ?? "individual")
          }
        >
          <SelectTrigger id={`${idPrefix}-personType`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERSON_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          Decides what the record holds: an organization has a logo, a website
          and members; an individual has profile answers.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Roles</FieldLabel>
        <div className="flex flex-wrap gap-4">
          {PERSON_ROLES.map((role) => (
            <label key={role.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.roles[role.key]}
                onCheckedChange={(checked) => toggleRole(role.key, checked)}
              />
              {personRoleLabel(role.key, vocabulary)}
            </label>
          ))}
        </div>
        <FieldDescription>
          These mark someone manually. Roles are also set automatically from
          donations, sponsorships, event registrations, volunteer records, won
          partnerships, and gear requested or handed over, so a role earned that
          way stays on even when unchecked here.
        </FieldDescription>
      </Field>

      {/*
        The one role with a public surface (#1024). Organizations only, for
        the same reason the logo and website below are: the wall shows a mark,
        and an individual with no logo would be published as their own name.
        Marking someone a sponsor is a directory fact; putting them on the
        public site is a separate decision, so it gets its own tick rather
        than riding on the role.
      */}
      {isOrganization && form.roles.is_sponsor && (
        <Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.sponsorWallPublic}
              onCheckedChange={(checked) =>
                update("sponsorWallPublic", checked)
              }
            />
            Show on the public sponsor wall
          </label>
          <FieldDescription>
            Puts this organization on the sponsorship page, using the name, logo
            and website on this record. Sponsors credited on a published public
            event are already there and need no tick here.
          </FieldDescription>
        </Field>
      )}

      {isOrganization && (
        <Field orientation="responsive">
          <LogoUrlField
            id={`${idPrefix}-logoUrl`}
            value={form.logoUrl}
            onChange={(value) => update("logoUrl", value)}
          />
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-website`}>Website</FieldLabel>
            <Input
              id={`${idPrefix}-website`}
              type="url"
              placeholder="https://..."
              value={form.website}
              onChange={(event) => update("website", event.target.value)}
            />
          </Field>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </Field>
    </>
  );
}

/**
 * The sponsor logo box, with the picture it points at (#1028), and an upload
 * beside it that keeps transparency (#1488).
 *
 * It was a bare `<Input>` while every other picture field in the portal --
 * branding, Site Content slots, inventory photos, event fliers -- showed a
 * preview, and a logo that cannot load is invisible without one: the public
 * wall silently falls back to the sponsor's name (#914), so nothing anywhere
 * said the link was dead. Chatter Snow shipped one that way.
 *
 * In a box roughly the shape of the widest mark the wall draws, because
 * neither wall layout crops a logo.
 */
function LogoUrlField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <LogoField
      id={id}
      uploadLabel="Upload a logo"
      label="Logo URL"
      value={value}
      onChange={onChange}
      ratio="4 / 1"
      description="Shown on the public sponsor wall."
    />
  );
}

export function packPersonFormData(form: PersonFormState) {
  const formData = new FormData();
  formData.set("name", form.name);
  formData.set("preferredName", form.preferredName);
  formData.set("email", form.email);
  formData.set("phone", form.phone);
  formData.set("pronouns", form.pronouns);
  formData.set("instagramHandle", form.instagramHandle);
  formData.set("notes", form.notes);
  formData.set("logoUrl", form.logoUrl);
  formData.set("website", form.website);
  formData.set("isDonor", String(form.roles.is_donor));
  formData.set("isSponsor", String(form.roles.is_sponsor));
  formData.set("isVolunteer", String(form.roles.is_volunteer));
  formData.set("isAttendee", String(form.roles.is_attendee));
  formData.set("isStaff", String(form.roles.is_staff));
  formData.set("isPartner", String(form.roles.is_partner));
  formData.set("isRecipient", String(form.roles.is_recipient));
  // Sent on every save, like the roles themselves: the server rewrites the
  // whole tag set each time, so an omitted flag would read as "unpublish".
  formData.set("sponsorWallPublic", String(form.sponsorWallPublic));
  formData.set("personType", form.personType);
  formData.set("addressLine1", form.addressLine1);
  formData.set("addressLine2", form.addressLine2);
  formData.set("addressCity", form.addressCity);
  formData.set("addressRegion", form.addressRegion);
  formData.set("addressPostalCode", form.addressPostalCode);
  formData.set("addressCountry", form.addressCountry);
  return formData;
}
