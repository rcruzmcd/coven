import { describe, expect, test } from "bun:test";
import type { EventRegistrant } from "./registrants-actions";
import type { RegistrationQuestion } from "@/lib/registration-questions";
import {
  filterRegistrants,
  isFiltered,
  parseRegistrantsView,
  REGISTRANTS_PER_PAGE,
  registrantsViewParams,
} from "./registrants-view-state";

function registrant(overrides: Partial<EventRegistrant>): EventRegistrant {
  return {
    id: "reg",
    event_id: "event-1",
    is_test: false,
    name: "Somebody",
    email: "somebody@example.test",
    phone: null,
    instagram_handle: null,
    has_no_instagram: null,
    preferred_contact_method: null,
    preferred_contact_detail: null,
    pronouns: null,
    party_size: 1,
    notes: null,
    created_at: "2026-08-01T12:00:00Z",
    person_id: null,
    attended_before: null,
    checked_in_at: null,
    waiver_accepted_at: null,
    waiver_version: null,
    party_includes_minor: null,
    adults_only_confirmed_at: null,
    confirmed_minimum_age: null,
    cancelled_at: null,
    cancellation_reason: null,
    cancellation_note: null,
    photo_consent: null,
    photo_consent_at: null,
    photo_consent_text: null,
    option_counts: [],
    answers: [],
    answer_request: null,
    answers_changed_at: null,
    group_chat_added_at: null,
    group_chat_added_by_name: null,
    minorContacts: null,
    profileSummary: null,
    ...overrides,
  };
}

const list = [
  registrant({
    id: "a",
    name: "Christina Fasanello-Okonkwo",
    email: "christina.fasanello.okonkwo@gmail.com",
    option_counts: [
      { option_id: "gear", label: "Need gear", quantity: 1, sort_order: 1 },
    ],
    party_includes_minor: true,
  }),
  registrant({
    id: "b",
    name: "Jo Park",
    phone: "555-0199",
    checked_in_at: "2026-08-28T09:00:00Z",
    photo_consent: false,
    group_chat_added_at: "2026-08-20T18:00:00Z",
    group_chat_added_by_name: "Sam Staff",
  }),
  registrant({
    id: "c",
    name: "Paula Garcia",
    option_counts: [
      { option_id: "gear", label: "Need gear", quantity: 0, sort_order: 1 },
    ],
  }),
];

const required: RegistrationQuestion = {
  id: "q1",
  kind: "short_text",
  prompt: "Carpool?",
  help: null,
  required: true,
  options: [],
  min_value: null,
  max_value: null,
  show_if: null,
};

describe("parseRegistrantsView / registrantsViewParams", () => {
  test("a bare URL is the unfiltered first page at 25 rows", () => {
    const view = parseRegistrantsView(new URLSearchParams());
    expect(view).toEqual({
      q: "",
      option: null,
      checkedIn: null,
      missing: false,
      groupChat: null,
      flags: [],
      answers: {},
      columns: null,
      sort: null,
      page: 1,
      perPage: REGISTRANTS_PER_PAGE,
    });
    expect(isFiltered(view)).toBe(false);
  });

  test("round-trips search, filters, sort and page", () => {
    const params = registrantsViewParams(new URLSearchParams(), {
      q: "jo",
      option: "gear",
      checkedIn: "out",
      missing: true,
      groupChat: "not-added",
      flags: ["minor", "no-photos"],
      answers: { q1: "drive", q2: "yes" },
      columns: ["q1", "q3"],
      sort: { key: "name", dir: "desc" },
    });
    const paged = registrantsViewParams(params, { page: 2, perPage: 10 });

    expect(parseRegistrantsView(paged)).toEqual({
      q: "jo",
      option: "gear",
      checkedIn: "out",
      missing: true,
      groupChat: "not-added",
      flags: ["minor", "no-photos"],
      answers: { q1: "drive", q2: "yes" },
      columns: ["q1", "q3"],
      sort: { key: "name", dir: "desc" },
      page: 2,
      perPage: 10,
    });
  });

  test("keeps parameters it does not own, like the open registration", () => {
    const params = registrantsViewParams(
      new URLSearchParams("registrant=reg-1"),
      { q: "jo" },
    );
    expect(params.get("registrant")).toBe("reg-1");
  });

  test("any change but the page sends the reader back to page one", () => {
    const onPage3 = new URLSearchParams("page=3");
    expect(registrantsViewParams(onPage3, { q: "x" }).get("page")).toBeNull();
    expect(registrantsViewParams(onPage3, { page: 4 }).get("page")).toBe("4");
  });

  test("hiding every answer column is not the same as never picking", () => {
    const none = registrantsViewParams(new URLSearchParams(), { columns: [] });
    expect(none.get("cols")).toBe("none");
    expect(parseRegistrantsView(none).columns).toEqual([]);
    expect(
      registrantsViewParams(none, { columns: null }).get("cols"),
    ).toBeNull();
  });

  test("picking columns keeps the page, since it changes no rows", () => {
    const onPage3 = new URLSearchParams("page=3");
    expect(
      registrantsViewParams(onPage3, { columns: ["q1"] }).get("page"),
    ).toBe("3");
  });

  test("an answer filter counts as filtering", () => {
    const view = parseRegistrantsView(new URLSearchParams("ans=q1:drive"));
    expect(isFiltered(view)).toBe(true);
  });

  test("drops defaults and junk instead of writing them", () => {
    const params = registrantsViewParams(
      new URLSearchParams("checkedIn=maybe&flags=minor,nope&perPage=25"),
      {},
    );
    expect(params.toString()).toBe("flags=minor");
  });
});

describe("filterRegistrants", () => {
  const view = parseRegistrantsView(new URLSearchParams());
  const ids = (rows: EventRegistrant[]) => rows.map((row) => row.id);

  test("searches name, email and phone", () => {
    expect(
      ids(filterRegistrants(list, { ...view, q: "OKONKWO@" }, [])),
    ).toEqual(["a"]);
    expect(ids(filterRegistrants(list, { ...view, q: "0199" }, []))).toEqual([
      "b",
    ]);
  });

  test("an option keeps only the parties that took at least one", () => {
    expect(
      ids(filterRegistrants(list, { ...view, option: "gear" }, [])),
    ).toEqual(["a"]);
  });

  test("checked in, or not yet", () => {
    expect(
      ids(filterRegistrants(list, { ...view, checkedIn: "in" }, [])),
    ).toEqual(["b"]);
    expect(
      ids(filterRegistrants(list, { ...view, checkedIn: "out" }, [])),
    ).toEqual(["a", "c"]);
  });

  test("group chat: added, or not added (#1648)", () => {
    expect(
      ids(filterRegistrants(list, { ...view, groupChat: "added" }, [])),
    ).toEqual(["b"]);
    expect(
      ids(filterRegistrants(list, { ...view, groupChat: "not-added" }, [])),
    ).toEqual(["a", "c"]);
  });

  test("flags match any, not all", () => {
    expect(
      ids(
        filterRegistrants(list, { ...view, flags: ["minor", "no-photos"] }, []),
      ),
    ).toEqual(["a", "b"]);
  });

  test("missing answers narrows only where something is required", () => {
    expect(
      ids(filterRegistrants(list, { ...view, missing: true }, [required])),
    ).toEqual(["a", "b", "c"]);
    const answered = registrant({
      id: "d",
      answers: [
        {
          question_id: "q1",
          prompt_as_shown: "Carpool?",
          answer_text: "Yes",
          value: "Yes",
          sort_order: 1,
        },
      ],
    });
    expect(
      ids(
        filterRegistrants([answered], { ...view, missing: true }, [required]),
      ),
    ).toEqual([]);
    // No required question left: the stale toggle filters nothing.
    expect(
      ids(filterRegistrants(list, { ...view, missing: true }, [])),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("filterRegistrants by answer (#1512)", () => {
  const view = parseRegistrantsView(new URLSearchParams());
  const carpool: RegistrationQuestion = {
    ...required,
    id: "carpool",
    kind: "single_choice",
    required: false,
    options: [
      { id: "need", label: "Needs ride" },
      { id: "drive", label: "Can drive" },
    ],
  };
  const answered = (id: string, value: string) =>
    registrant({
      id,
      answers: [
        {
          question_id: "carpool",
          prompt_as_shown: "Carpool?",
          answer_text: value,
          value,
          sort_order: 0,
        },
      ],
    });
  const rows = [answered("a", "need"), answered("b", "drive"), registrant({})];

  test("keeps only the parties that gave that answer", () => {
    expect(
      filterRegistrants(rows, { ...view, answers: { carpool: "drive" } }, [
        carpool,
      ]).map((row) => row.id),
    ).toEqual(["b"]);
  });

  test("a filter on a removed question filters nothing", () => {
    expect(
      filterRegistrants(rows, { ...view, answers: { gone: "x" } }, [carpool]),
    ).toHaveLength(3);
  });
});
