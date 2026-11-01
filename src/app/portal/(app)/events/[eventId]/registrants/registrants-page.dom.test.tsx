import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import type {
  EventRegistrant,
  EventRegistrantsData,
} from "../../registrants-actions";
import { NO_RECORD_MESSAGES } from "@/lib/outbound-messages";

// The page writes its view with history.replaceState and reads it back
// through useSearchParams, which Next keeps in step. happy-dom has no Next
// router, so this stands in for that link: the URL lives here, a
// replaceState writes it and notifies, and the hook re-reads it.
let currentUrl = new URL("http://localhost/portal/events/event-1/registrants");
const listeners = new Set<() => void>();
function visit(search: string) {
  currentUrl = new URL(
    `/portal/events/event-1/registrants${search}`,
    currentUrl,
  );
  listeners.forEach((listener) => listener());
}
const originalReplaceState = window.history.replaceState;
afterAll(() => {
  window.history.replaceState = originalReplaceState;
});
window.history.replaceState = ((
  _data: unknown,
  _unused: string,
  url?: string | URL | null,
) => {
  if (url) visit(new URL(url, currentUrl).search);
}) as typeof window.history.replaceState;
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
const search = () => currentUrl.search;
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => currentUrl.pathname,
  useSearchParams: () =>
    new URLSearchParams(useSyncExternalStore(subscribe, search, search)),
  useParams: () => ({}),
  redirect: () => {},
  notFound: () => {},
}));

function registrant(overrides: Partial<EventRegistrant>): EventRegistrant {
  return {
    id: "reg",
    event_id: "event-1",
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
    rider: null,
    ...overrides,
  };
}

const registrants = [
  registrant({
    id: "reg-1",
    name: "Christina Fasanello-Okonkwo",
    email: "christina.fasanello.okonkwo@gmail.com",
    instagram_handle: null,
    has_no_instagram: null,
    preferred_contact_method: null,
    preferred_contact_detail: null,
    pronouns: "they/she",
    party_size: 2,
    option_counts: [
      {
        option_id: "gear",
        label: "Need ticket and gear",
        quantity: 1,
        sort_order: 1,
      },
    ],
  }),
  registrant({
    id: "reg-2",
    name: "Jo Park",
    created_at: "2026-08-02T12:00:00Z",
    checked_in_at: "2026-08-28T21:12:00Z",
  }),
];

function payload(
  overrides: Partial<EventRegistrantsData> = {},
): EventRegistrantsData {
  return {
    registrants,
    cancelled: [],
    messages: NO_RECORD_MESSAGES,
    messaging: {
      orgName: "Example",
      replyTo: null,
      orgEmailEnabled: true,
    } as EventRegistrantsData["messaging"],
    waiverInForce: false,
    photoConsentInForce: false,
    registrationOptions: {
      prompt: "Do you need a ticket?",
      options: [
        {
          id: "gear",
          label: "Need ticket and gear",
          cap: 10,
          price: null,
          taken: 1,
        },
        {
          id: "none",
          label: "Don't need anything",
          cap: null,
          price: null,
          taken: 0,
        },
      ],
    },
    registrationQuestions: [],
    riderMountains: null,
    groupChat: null,
    ...overrides,
  };
}

let data = payload();
const RegistrantsActions = await import("../../registrants-actions");
const checkInMock = mock(async () => ({ success: true as const }));
mock.module("../../registrants-actions", () => ({
  ...RegistrantsActions,
  listEventRegistrantsAction: async () => ({ data }),
  checkInRegistrantAction: checkInMock,
}));
mock.module("../../impact-derived-actions", () => ({
  getEventImpactDerivedAction: async () => ({ error: "not needed" }),
}));
mock.module("@/components/ui/toast", () => ({
  toast: { error: () => "", success: () => "", close: () => {} },
  Toaster: () => null,
}));

const { RegistrantsPage } = await import("./registrants-page");

function renderPage(canManage = true) {
  return render(
    <RegistrantsPage
      eventId="event-1"
      eventName="Night Ride"
      startsAt="2027-01-17T21:00:00Z"
      timezone="America/New_York"
      capacity={60}
      registrationOpen
      canManage={canManage}
    />,
  );
}

function rowNames() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
}

describe("RegistrantsPage", () => {
  beforeEach(() => {
    data = payload();
    checkInMock.mockClear();
    visit("");
  });
  afterEach(() => visit(""));

  test("summarises in tiles rather than a sentence", async () => {
    renderPage();
    const summary = within(await screen.findByLabelText("Summary"));
    expect(summary.getByText("Attending")).toBeInTheDocument();
    expect(summary.getByText("of 60")).toBeInTheDocument();
    expect(summary.getByText("Checked in")).toBeInTheDocument();
    expect(summary.getByText("of 3")).toBeInTheDocument();
  });

  test("breaks riders down by discipline and level", async () => {
    const rider = {
      riding_discipline_at_event: null,
      ski_experience_level_at_event: null,
      snowboard_experience_level_at_event: null,
      riding_discipline: null,
      ski_experience_level: null,
      snowboard_experience_level: null,
      preferred_mountain: null,
    };
    data = payload({
      registrants: [
        registrant({
          id: "reg-1",
          rider: {
            ...rider,
            riding_discipline: "ski",
            ski_experience_level: "beginner",
          },
        }),
        registrant({
          id: "reg-2",
          rider: {
            ...rider,
            riding_discipline: "both",
            ski_experience_level: "advanced",
            snowboard_experience_level: "beginner",
          },
        }),
        registrant({ id: "reg-3", rider }),
      ],
    });
    renderPage();
    const riders = within(
      await screen.findByRole("region", { name: /^Riders/ }),
    );
    expect(
      riders.getByText("Riders · 1 skis, 0 snowboard, 1 both"),
    ).toBeInTheDocument();
    expect(
      riders.getByText("2 of 3 registrations answered"),
    ).toBeInTheDocument();
    expect(riders.getByRole("heading", { name: "Skis" })).toBeInTheDocument();
    expect(
      riders.getByRole("heading", { name: "Snowboard" }),
    ).toBeInTheDocument();
  });

  test("no Riders section for a reader without rider answers", async () => {
    renderPage();
    await screen.findByLabelText("Summary");
    expect(screen.queryByRole("region", { name: /^Riders/ })).toBeNull();
  });

  test("an option tile filters the table, and the URL says so", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Jo Park");

    await user.click(
      screen.getByRole("button", { name: /Need ticket and gear/ }),
    );

    expect(currentUrl.search).toBe("?option=gear");
    expect(rowNames()).toEqual([
      expect.stringContaining("Christina Fasanello-Okonkwo"),
    ]);
    expect(
      screen.getByRole("button", {
        name: /Need ticket and gear/,
        pressed: true,
      }),
    ).toBeInTheDocument();
  });

  test("a URL with filters lands on the same rows", async () => {
    visit("?checkedIn=in&q=jo");
    renderPage();
    await screen.findByText("Jo Park");

    expect(
      screen.queryByText("Christina Fasanello-Okonkwo"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("jo");
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 2");
  });

  test("searching writes the query into the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Jo Park");

    await user.type(
      screen.getByRole("searchbox", { name: "Search registrants" }),
      "okonkwo",
    );

    expect(new URLSearchParams(currentUrl.search).get("q")).toBe("okonkwo");
    expect(screen.queryByText("Jo Park")).not.toBeInTheDocument();
  });

  test("check-in is a labelled button, and a checked-in row shows the time", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Jo Park");

    await user.click(
      screen.getByRole("button", {
        name: "Check in Christina Fasanello-Okonkwo",
      }),
    );
    expect(checkInMock).toHaveBeenCalledWith("reg-1");
    expect(
      screen.queryByRole("button", { name: "Check in Jo Park" }),
    ).not.toBeInTheDocument();
  });

  test("opening a registration puts it in the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Jo Park" }));

    expect(new URLSearchParams(currentUrl.search).get("registrant")).toBe(
      "reg-2",
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  test("a manager gets the two door actions and the More menu", async () => {
    renderPage();
    await screen.findByText("Jo Park");

    expect(
      screen.getByRole("button", { name: "+ Check in walk-in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Add registrant" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  test("an events: view reader reads the list and changes nothing", async () => {
    data = payload({ messaging: null });
    renderPage(false);
    await screen.findByText("Jo Park");

    expect(
      screen.queryByRole("button", { name: /Check in/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /More/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /More actions for/ }),
    ).not.toBeInTheDocument();
  });

  describe("registration questions (#1512)", () => {
    const carpool = {
      id: "carpool",
      kind: "single_choice" as const,
      prompt: "Do you want to carpool to this event?",
      column_label: "Carpool",
      help: null,
      required: false,
      options: [
        { id: "need", label: "Needs ride" },
        { id: "drive", label: "Can drive" },
      ],
      min_value: null,
      max_value: null,
      show_if: null,
    };
    const seats = {
      ...carpool,
      id: "seats",
      kind: "number" as const,
      prompt: "How many open seats do you have?",
      column_label: "seats",
      options: [],
      show_if: { any: [{ question_id: "carpool", option_ids: ["drive"] }] },
    };
    const extra = [1, 2, 3].map((index) => ({
      ...carpool,
      id: `q${index}`,
      kind: "short_text" as const,
      prompt: `Question ${index}`,
      column_label: null,
      options: [],
    }));

    beforeEach(() => {
      data = payload({
        registrationQuestions: [carpool, seats, ...extra],
        registrants: [
          registrant({
            id: "reg-1",
            name: "Christina Fasanello-Okonkwo",
            answers: [
              {
                question_id: "carpool",
                prompt_as_shown: carpool.prompt,
                answer_text: "Can drive",
                value: "drive",
                sort_order: 0,
              },
              {
                question_id: "seats",
                prompt_as_shown: seats.prompt,
                answer_text: "2",
                value: 2,
                sort_order: 1,
              },
            ],
          }),
          registrant({ id: "reg-2", name: "Jo Park" }),
        ],
      });
    });

    test("a follow-up folds into its parent's column", async () => {
      renderPage();
      await screen.findByText("Jo Park");

      expect(screen.getByText("Can drive · 2 seats")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /^seats,/ }),
      ).not.toBeInTheDocument();
    });

    test("the Columns menu shows a hidden column and writes the URL", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Jo Park");
      expect(
        screen.queryByRole("button", { name: /^Question 3,/ }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Columns" }));
      await user.click(
        await screen.findByRole("menuitemcheckbox", { name: "Question 3" }),
      );

      expect(currentUrl.searchParams.get("cols")).toBe("carpool,q1,q2,q3");
      expect(
        await screen.findByRole("button", { name: /^Question 3,/ }),
      ).toBeInTheDocument();
    });

    test("an answer chip filters the rows", async () => {
      visit("?ans=carpool:drive");
      renderPage();
      await screen.findByText("Christina Fasanello-Okonkwo");

      expect(screen.queryByText("Jo Park")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Carpool: Can drive/ }),
      ).toBeInTheDocument();
    });
  });
});
