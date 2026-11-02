import { describe, expect, test } from "bun:test";
import {
  emptyPersonForm,
  packPersonFormData,
  personFormDirty,
} from "./person-form-fields";
import { parsePersonForm } from "./person-form";

describe("emptyPersonForm", () => {
  test("has no roles set when no default is given", () => {
    const form = emptyPersonForm();
    expect(form.roles).toEqual({
      is_donor: false,
      is_sponsor: false,
      is_volunteer: false,
      is_attendee: false,
      is_staff: false,
      is_partner: false,
      is_recipient: false,
    });
  });

  test("sets only the given default role", () => {
    const form = emptyPersonForm("is_sponsor");
    expect(form.roles).toEqual({
      is_donor: false,
      is_sponsor: true,
      is_volunteer: false,
      is_attendee: false,
      is_staff: false,
      is_partner: false,
      is_recipient: false,
    });
  });
});

describe("packPersonFormData", () => {
  test("round-trips through parsePersonForm", () => {
    const form = emptyPersonForm("is_sponsor");
    form.name = "Jane Donor";
    form.preferredName = "Janey";
    form.email = "jane@example.com";

    const result = parsePersonForm(packPersonFormData(form));
    expect(result).toEqual({
      roles: ["sponsor"],
      publicRoles: [],
      data: {
        name: "Jane Donor",
        preferred_name: "Janey",
        email: "jane@example.com",
        phone: null,
        pronouns: null,
        instagram_handle: null,
        notes: null,
        logo_url: null,
        website: null,
        person_type: "individual",
        address_line1: null,
        address_line2: null,
        address_city: null,
        address_region: null,
        address_postal_code: null,
        address_country: null,
      },
    });
  });

  test("packs role booleans as their string form", () => {
    const form = emptyPersonForm("is_donor");
    const formData = packPersonFormData(form);
    expect(formData.get("isDonor")).toBe("true");
    expect(formData.get("isSponsor")).toBe("false");
  });

  test("defaults the sponsor wall opt-in closed, and packs it every time", () => {
    // Sent on every save even when false: the server rewrites the whole tag
    // set, so an omitted flag would read as "unpublish" on an unrelated edit.
    const form = emptyPersonForm("is_sponsor", "organization");
    expect(form.sponsorWallPublic).toBe(false);
    expect(packPersonFormData(form).get("sponsorWallPublic")).toBe("false");
  });

  test("round-trips the sponsor wall opt-in for an organization", () => {
    const form = emptyPersonForm("is_sponsor", "organization");
    form.name = "Local Roasters Coffee";
    form.sponsorWallPublic = true;

    const result = parsePersonForm(packPersonFormData(form));
    expect("publicRoles" in result && result.publicRoles).toEqual(["sponsor"]);
  });

  test("packs the person type", () => {
    const form = emptyPersonForm("is_donor", "organization");
    const formData = packPersonFormData(form);
    expect(formData.get("personType")).toBe("organization");
  });
});

describe("personFormDirty", () => {
  test("two fresh empty forms are not dirty, with or without a default role", () => {
    expect(personFormDirty(emptyPersonForm(), emptyPersonForm())).toBe(false);
    expect(
      personFormDirty(
        emptyPersonForm("is_sponsor", "organization"),
        emptyPersonForm("is_sponsor", "organization"),
      ),
    ).toBe(false);
  });

  test("a toggled role is dirty even though every scalar matches", () => {
    const form = emptyPersonForm();
    form.roles = { ...form.roles, is_volunteer: true };
    expect(personFormDirty(form, emptyPersonForm())).toBe(true);
  });

  test("typing and then clearing a field is not dirty", () => {
    const form = emptyPersonForm();
    form.name = "Jane";
    expect(personFormDirty(form, emptyPersonForm())).toBe(true);
    form.name = "";
    expect(personFormDirty(form, emptyPersonForm())).toBe(false);
  });
});
