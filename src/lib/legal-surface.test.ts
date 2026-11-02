import { describe, expect, test } from "bun:test";
import {
  collectionSurface,
  hasDrifted,
  joinPhrases,
  namedSurfaces,
  surfaceDrift,
  surfaceKeys,
  SURFACE_GATES,
  SURFACE_LABELS,
  type CollectionSurface,
} from "@/lib/legal-surface";
import { PUBLIC_PAGE_SLOTS } from "@/lib/page-visibility";

const ALL_OFF: Record<string, boolean> = {
  contact: false,
  "get-involved-volunteer": false,
  events: false,
  gears: false,
};

const NO_MODULES: Record<string, boolean> = {
  communications: false,
  volunteers: false,
  events: false,
  inventory: false,
  artwork: false,
  constituent_accounts: false,
  form_analytics: false,
  person_questions: false,
};

describe("collectionSurface", () => {
  // The direction that matters: a tenant nobody has configured yet, or one
  // whose configuration could not be read, keeps every bullet. Over-describing
  // what you collect is survivable; under-describing it is not.
  test("fails open on empty maps", () => {
    expect(collectionSurface({}, {})).toEqual({
      contact: true,
      volunteerApplications: true,
      eventRegistrations: true,
      profileQuestions: true,
      gearRequests: true,
      artworkSubmissions: true,
      constituentAccounts: true,
      volunteerHours: true,
      volunteerScreening: true,
      googleSignIn: true,
      formAnalytics: true,
    });
  });

  test("a hidden page turns its surface off", () => {
    const surface = collectionSurface(ALL_OFF, {});
    expect(surface.contact).toBe(false);
    expect(surface.volunteerApplications).toBe(false);
    expect(surface.eventRegistrations).toBe(false);
    expect(surface.gearRequests).toBe(false);
    // No slot behind these, so page visibility has nothing to say.
    expect(surface.artworkSubmissions).toBe(true);
    expect(surface.constituentAccounts).toBe(true);
    expect(surface.volunteerHours).toBe(true);
  });

  // The public volunteer page and self-logged hours share a module but not a
  // slot: `log_my_volunteer_hours()` checks only the module, so hiding the page
  // takes the application form away and leaves the hours form standing.
  test("hiding the volunteer page does not take self-logged hours with it", () => {
    const surface = collectionSurface({ "get-involved-volunteer": false }, {});
    expect(surface.volunteerApplications).toBe(false);
    expect(surface.volunteerHours).toBe(true);
  });

  // The reverse of the pairing #1296 introduced, undone by #1303: the form
  // that logged hours was in `/my`, so the constituent area gated the surface
  // too. A volunteer logs their own hours in the portal now, so turning the
  // area off takes nothing away -- and since the retention table filters the
  // `volunteer_hour_submissions` clock on this key, a surface that said
  // otherwise would publish no period for rows the tenant still receives.
  test("self-logged hours do not need the constituent area", () => {
    const surface = collectionSurface({}, { constituent_accounts: false });
    expect(surface.constituentAccounts).toBe(false);
    expect(surface.volunteerHours).toBe(true);
  });

  // `getTenantPageVisibility()`, which the Site Content editor's starter is
  // built from, reads app_settings directly and does not fold the entitlement
  // in the way its public counterpart does. So the module has to be checked
  // here, not assumed to have been checked already.
  test("a disabled module turns its surface off whatever the board stored", () => {
    const everythingShown = {
      contact: true,
      "get-involved-volunteer": true,
      events: true,
      gears: true,
    };
    expect(collectionSurface(everythingShown, NO_MODULES)).toEqual({
      contact: false,
      volunteerApplications: false,
      eventRegistrations: false,
      profileQuestions: false,
      gearRequests: false,
      artworkSubmissions: false,
      constituentAccounts: false,
      volunteerHours: false,
      volunteerScreening: false,
      googleSignIn: true,
      formAnalytics: false,
    });
  });

  // The button in src/app/portal/login/login-form.tsx is unconditional, so the
  // subprocessor bullet is too. If this ever fails, the policy needs a real
  // signal rather than a constant.
  test("Google sign-in is on for every tenant, because the button is", () => {
    expect(collectionSurface(ALL_OFF, NO_MODULES).googleSignIn).toBe(true);
  });
});

// The gate table duplicates what PUBLIC_PAGE_SLOTS already says, because
// legal-surface must stay importable from client code. This is what stops the
// copy drifting.
describe("SURFACE_GATES", () => {
  test("every slot it names is registered, with the same module", () => {
    for (const [surface, gate] of Object.entries(SURFACE_GATES)) {
      if (gate.slot === null) continue;
      const slot = PUBLIC_PAGE_SLOTS.find(
        (candidate) => candidate.key === gate.slot,
      );
      expect(slot, `${surface} -> ${gate.slot}`).toBeDefined();
      expect(slot!.module, `${surface} -> ${gate.slot}`).toBe(gate.module);
    }
  });

  test("there is a gate for every surface but Google sign-in", () => {
    const surfaces = Object.keys(collectionSurface({}, {})).filter(
      (key) => key !== "googleSignIn",
    );
    expect(Object.keys(SURFACE_GATES).sort()).toEqual(surfaces.sort());
  });
});

describe("profileQuestions (#1746)", () => {
  test("needs the module and a question actually asked", () => {
    expect(collectionSurface({}, {}).profileQuestions).toBe(true);
    expect(collectionSurface({}, {}, false).profileQuestions).toBe(false);
    expect(
      collectionSurface({}, { person_questions: false }, true).profileQuestions,
    ).toBe(false);
  });
});

describe("surfaceKeys", () => {
  test("lists what is on, sorted", () => {
    const surface: CollectionSurface = {
      contact: true,
      volunteerApplications: false,
      eventRegistrations: true,
      profileQuestions: false,
      gearRequests: false,
      artworkSubmissions: false,
      constituentAccounts: false,
      volunteerHours: false,
      volunteerScreening: false,
      googleSignIn: true,
      formAnalytics: false,
    };
    expect(surfaceKeys(surface)).toEqual([
      "contact",
      "eventRegistrations",
      "googleSignIn",
    ]);
  });

  test("is empty when nothing is collected", () => {
    expect(
      surfaceKeys({
        contact: false,
        volunteerApplications: false,
        eventRegistrations: false,
        profileQuestions: false,
        gearRequests: false,
        artworkSubmissions: false,
        constituentAccounts: false,
        volunteerHours: false,
        volunteerScreening: false,
        googleSignIn: false,
        formAnalytics: false,
      }),
    ).toEqual([]);
  });
});

// #1292. The whole feature rests on absent reading as *unknown*: a tenant that
// published before the fingerprint existed -- which on the day this ships is
// every tenant that has published anything -- must not be told its policy is
// wrong on the strength of a record nobody kept.
describe("surfaceDrift", () => {
  test("is null when the document carries no fingerprint", () => {
    expect(surfaceDrift(null, ["contact"])).toBeNull();
    expect(surfaceDrift(undefined, ["contact"])).toBeNull();
    expect(hasDrifted({ status: "unknown" })).toBe(false);
  });

  test("reports nothing when the surface has not moved", () => {
    const drift = surfaceDrift(
      ["contact", "googleSignIn"],
      ["contact", "googleSignIn"],
    );
    expect(drift).toEqual({ added: [], removed: [] });
    expect(
      hasDrifted({ status: "checked", publishedAt: null, ...drift! }),
    ).toBe(false);
  });

  test("an empty fingerprint is a fingerprint, not an absent one", () => {
    expect(surfaceDrift([], ["contact"])).toEqual({
      added: ["contact"],
      removed: [],
    });
  });

  test("names what was turned on after the document was written", () => {
    expect(
      surfaceDrift(["contact"], ["artworkSubmissions", "contact"]),
    ).toEqual({ added: ["artworkSubmissions"], removed: [] });
  });

  test("names what the document still describes and the site no longer does", () => {
    expect(
      surfaceDrift(["contact", "volunteerApplications"], ["contact"]),
    ).toEqual({ added: [], removed: ["volunteerApplications"] });
  });

  test("reports both directions separately", () => {
    const drift = surfaceDrift(
      ["contact", "volunteerApplications"],
      ["artworkSubmissions", "contact"],
    );
    expect(drift).toEqual({
      added: ["artworkSubmissions"],
      removed: ["volunteerApplications"],
    });
    expect(
      hasDrifted({ status: "checked", publishedAt: null, ...drift! }),
    ).toBe(true);
  });
});

describe("naming surfaces in a sentence", () => {
  test("every surface has a label", () => {
    expect(Object.keys(SURFACE_LABELS).sort()).toEqual(
      Object.keys(collectionSurface({}, {})).sort(),
    );
  });

  // One module governs both, so switching it off moves both keys at once --
  // and "Volunteers and Volunteers was disabled" is the line that would ship.
  test("collapses two surfaces that share one switch", () => {
    expect(
      namedSurfaces(["volunteerApplications", "volunteerHours"], "subject"),
    ).toEqual(["Volunteers"]);
    expect(
      namedSurfaces(["volunteerApplications", "volunteerHours"], "collects"),
    ).toEqual([
      "volunteer applications",
      "hours volunteers log for themselves",
    ]);
  });

  test("ignores a key no registry knows about", () => {
    expect(namedSurfaces(["retiredSurface"], "subject")).toEqual([]);
  });

  test("joins phrases as prose", () => {
    expect(joinPhrases([])).toBe("");
    expect(joinPhrases(["Artwork"])).toBe("Artwork");
    expect(joinPhrases(["Artwork", "Events"])).toBe("Artwork and Events");
    expect(joinPhrases(["Artwork", "Events", "Contact"])).toBe(
      "Artwork, Events and Contact",
    );
  });
});
