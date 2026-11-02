import { describe, expect, test } from "bun:test";
import type { MyContactDetails } from "./contact";
import { EMPTY_CONTACT_PREFILL, accountName, contactPrefill } from "./viewer";

const person: MyContactDetails = {
  person_id: "11111111-1111-4111-8111-111111111111",
  name: "Jane Doe",
  preferred_name: "Janey",
  email: "jane@example.com",
  email_pending: null,
  email_pending_expires_at: null,
  phone: "555-1234",
  pronouns: "she/her",
  instagram_handle: "jane.doe",
  address_line1: null,
  address_line2: null,
  address_city: null,
  address_region: null,
  address_postal_code: null,
  address_country: null,
};

const account = { email: "signed-in@example.com", name: "Jane" };

describe("contactPrefill", () => {
  test("gives a visitor with no session nothing", () => {
    expect(contactPrefill(null)).toEqual(EMPTY_CONTACT_PREFILL);
  });

  test("fills a linked reader's form from their record", () => {
    expect(contactPrefill({ kind: "linked", person, account })).toEqual({
      name: "Janey",
      email: "jane@example.com",
      phone: "555-1234",
      instagramHandle: "jane.doe",
      // The session's address, not the record's: they can differ, and only
      // one of them tells a shared browser whose form this is.
      signedInAs: "signed-in@example.com",
      linked: true,
    });
  });

  test("falls back to the directory name when there is no preferred one", () => {
    expect(
      contactPrefill({
        kind: "linked",
        person: { ...person, preferred_name: null },
        account,
      }),
    ).toMatchObject({ name: "Jane Doe" });
  });

  // §5.23: an account with no approved claim is told nothing about whether the
  // directory knows it, so only what the session holds about itself is filled.
  test("fills an unlinked account's form from the session alone", () => {
    expect(
      contactPrefill({
        kind: "account",
        account: { email: "someone@example.com", name: "Someone" },
      }),
    ).toEqual({
      name: "Someone",
      email: "someone@example.com",
      phone: "",
      instagramHandle: "",
      signedInAs: "someone@example.com",
      // An account whose claim has not been approved is not linked, and the
      // form treats it exactly as it treats a visitor whose fields it filled.
      linked: false,
    });
  });
});

describe("accountName", () => {
  test("prefers the provider's full name, then its alternatives", () => {
    expect(accountName({ full_name: "Jane Doe", name: "jdoe" })).toBe(
      "Jane Doe",
    );
    expect(accountName({ name: "jdoe" })).toBe("jdoe");
    expect(accountName({ preferred_name: "Janey" })).toBe("Janey");
  });

  test("ignores blanks and anything that is not a string", () => {
    expect(accountName({ full_name: "   ", name: 42 })).toBeNull();
    expect(accountName(undefined)).toBeNull();
  });
});
