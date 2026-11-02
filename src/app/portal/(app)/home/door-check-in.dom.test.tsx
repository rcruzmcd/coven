import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  EventRegistrant,
  EventRegistrantsData,
} from "../events/registrants-actions";
import type { TabData } from "@/hooks/use-tab-data";
import { NO_RECORD_MESSAGES } from "@/lib/outbound-messages";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// The detail sheet's messaging island reaches the `server-only` sender
// through its Server Actions; see registrants-tab.dom.test.tsx.
mock.module("server-only", () => ({}));
const RegistrantsActions = await import("../events/registrants-actions");
const PeopleActions = await import("../people/actions");

type ActionResult =
  { error: { code: string; message: string } } | { success: true };

const checkInMock = mock<(id: string) => Promise<ActionResult>>(async () => ({
  success: true,
}));
const undoMock = mock<(id: string) => Promise<ActionResult>>(async () => ({
  success: true,
}));
const restoreMock = mock<(id: string) => Promise<ActionResult>>(async () => ({
  success: true,
}));

mock.module("../events/registrants-actions", () => ({
  ...RegistrantsActions,
  checkInRegistrantAction: checkInMock,
  undoCheckInAction: undoMock,
  restoreRegistrationAction: restoreMock,
  listEventRegistrationOptionsAction: async () => ({ data: null }),
  listEventRegistrationQuestionsAction: async () => ({ data: [] }),
}));
mock.module("../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: async () => ({ data: [] }),
}));

type ToastOptions = {
  action?: { label: string; onClick: () => void };
};
const toastSuccessMock = mock<
  (title: string, options?: ToastOptions) => string
>(() => "");
const toastErrorMock = mock<(title: string) => string>(() => "");
mock.module("@/components/ui/toast", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    close: mock(() => {}),
  },
  Toaster: () => null,
}));

const { DoorCheckIn } = await import("./door-check-in");

function registrant(
  id: string,
  name: string,
  overrides: Partial<EventRegistrant> = {},
): EventRegistrant {
  return {
    id,
    event_id: "event-1",
    name,
    email: `${id}@example.test`,
    phone: null,
    instagram_handle: null,
    has_no_instagram: null,
    preferred_contact_method: null,
    preferred_contact_detail: null,
    pronouns: null,
    party_size: 1,
    notes: null,
    created_at: "2026-10-01T12:00:00Z",
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
    profileSummary: null,
    ...overrides,
  };
}

const registrants = [
  registrant("reg-1", "María Fernanda Castillo-Wojciechowski", {
    party_size: 3,
    pronouns: "she/her",
    party_includes_minor: true,
  }),
  registrant("reg-2", "Alex Chen", {
    checked_in_at: "2026-10-10T18:42:00Z",
    party_size: 2,
  }),
  registrant("reg-3", "Jamie Abbott", { phone: "555-0199" }),
];

const manager = { orgName: "Chatter", replyTo: null, orgEmailEnabled: true };

function payload(
  overrides: Partial<EventRegistrantsData> = {},
): EventRegistrantsData {
  return {
    registrants,
    cancelled: [],
    messages: NO_RECORD_MESSAGES,
    messaging: null,
    waiverInForce: false,
    registrationOptions: null,
    registrationQuestions: [],
    photoConsentInForce: false,
    groupChat: null,
    ...overrides,
  };
}

const refresh = mock(() => {});

function renderDoor(overrides: Partial<EventRegistrantsData> = {}) {
  const data: TabData<EventRegistrantsData> = {
    data: payload(overrides),
    loadError: null,
    refresh,
  };
  return render(
    <Sheet open>
      <SheetContent showCloseButton={false}>
        <DoorCheckIn
          eventId="event-1"
          eventName="Queer Ride Day"
          capacity={150}
          registrants={data}
          onChanged={refresh}
        />
      </SheetContent>
    </Sheet>,
  );
}

function rowNames() {
  const list = screen.getByRole("list", { name: "Registrants" });
  return within(list)
    .getAllByRole("button", { name: /^Details for / })
    .map((button) => button.getAttribute("aria-label")?.slice(12));
}

describe("DoorCheckIn", () => {
  beforeEach(() => {
    checkInMock.mockClear();
    checkInMock.mockImplementation(async () => ({ success: true }));
    undoMock.mockClear();
    restoreMock.mockClear();
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    refresh.mockClear();
  });

  test("opens on Not here, by last name, with the progress line", () => {
    renderDoor();

    expect(screen.getByRole("button", { name: "Not here 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(rowNames()).toEqual([
      "Jamie Abbott",
      "María Fernanda Castillo-Wojciechowski",
    ]);
    expect(screen.getByText("1 / 3 parties in")).toBeInTheDocument();
    expect(screen.getByText("2 of 6 people · cap 150")).toBeInTheDocument();
    expect(screen.getByText("Party of 3 · she/her")).toBeInTheDocument();
    expect(screen.getByText("Includes a minor")).toBeInTheDocument();
  });

  test("the In and All tabs", async () => {
    const user = userEvent.setup();
    renderDoor();

    await user.click(screen.getByRole("button", { name: "In 1" }));
    expect(rowNames()).toEqual(["Alex Chen"]);
    expect(screen.getByText(/^Party of 2 · In at /)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All 3" }));
    expect(rowNames()).toEqual([
      "Jamie Abbott",
      "María Fernanda Castillo-Wojciechowski",
      "Alex Chen",
    ]);
  });

  test("a search looks across every tab, phone included", async () => {
    const user = userEvent.setup();
    renderDoor();

    await user.type(
      screen.getByRole("searchbox", { name: "Search registrants" }),
      "chen",
    );
    expect(rowNames()).toEqual(["Alex Chen"]);

    await user.clear(
      screen.getByRole("searchbox", { name: "Search registrants" }),
    );
    await user.type(
      screen.getByRole("searchbox", { name: "Search registrants" }),
      "0199",
    );
    expect(rowNames()).toEqual(["Jamie Abbott"]);
  });

  test("checking in paints at once, and the receipt's Undo reverses it", async () => {
    const user = userEvent.setup();
    let settle: (result: ActionResult) => void = () => {};
    checkInMock.mockImplementation(
      () => new Promise<ActionResult>((resolve) => (settle = resolve)),
    );
    renderDoor();

    await user.click(
      screen.getByRole("button", { name: "Check in Jamie Abbott" }),
    );

    // Before the server has answered.
    expect(checkInMock).toHaveBeenCalledWith("reg-3");
    expect(screen.getByRole("button", { name: "In 2" })).toBeInTheDocument();
    expect(screen.getByText("2 / 3 parties in")).toBeInTheDocument();
    expect(rowNames()).toEqual(["María Fernanda Castillo-Wojciechowski"]);

    settle({ success: true });
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Jamie Abbott checked in.",
        expect.anything(),
      ),
    );
    expect(refresh).toHaveBeenCalled();

    const options = toastSuccessMock.mock.calls[0][1];
    expect(options?.action?.label).toBe("Undo");
    options?.action?.onClick();

    await waitFor(() => expect(undoMock).toHaveBeenCalledWith("reg-3"));
    await waitFor(() =>
      expect(screen.getByText("1 / 3 parties in")).toBeInTheDocument(),
    );
  });

  test("tapping a checked-in row's button undoes it", async () => {
    const user = userEvent.setup();
    renderDoor();

    await user.click(screen.getByRole("button", { name: "In 1" }));
    const button = screen.getByRole("button", { name: "Check in Alex Chen" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.click(button);

    expect(undoMock).toHaveBeenCalledWith("reg-2");
    expect(screen.getByRole("button", { name: "In 0" })).toBeInTheDocument();
  });

  test("a refused check-in puts the row back", async () => {
    const user = userEvent.setup();
    checkInMock.mockImplementation(async () => ({
      error: { code: "forbidden", message: "You can't check people in." },
    }));
    renderDoor();

    await user.click(
      screen.getByRole("button", { name: "Check in Jamie Abbott" }),
    );

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("You can't check people in."),
    );
    expect(screen.getByText("1 / 3 parties in")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  test("no match offers the walk-in with the name filled in", async () => {
    const user = userEvent.setup();
    renderDoor();

    await user.type(
      screen.getByRole("searchbox", { name: "Search registrants" }),
      "Robin Okafor",
    );
    expect(
      screen.getByText("No one registered matches “Robin Okafor”"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Check in “Robin Okafor” as a walk-in",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Check in a walk-in",
    });
    expect(within(dialog).getByRole("combobox")).toHaveValue("Robin Okafor");
  });

  test("a search lists matching cancellations, restorable by a manager", async () => {
    const user = userEvent.setup();
    renderDoor({
      messaging: manager,
      cancelled: [
        registrant("reg-9", "Sam Gone", {
          cancelled_at: "2026-10-09T12:00:00Z",
        }),
      ],
    });

    await user.type(
      screen.getByRole("searchbox", { name: "Search registrants" }),
      "sam",
    );
    await user.click(
      screen.getByRole("button", { name: "Restore registration for Sam Gone" }),
    );
    expect(restoreMock).toHaveBeenCalledWith("reg-9");
  });

  test("cancellations show without Restore to an events: view reader", async () => {
    const user = userEvent.setup();
    renderDoor({
      cancelled: [registrant("reg-9", "Sam Gone")],
    });

    await user.type(
      screen.getByRole("searchbox", { name: "Search registrants" }),
      "sam",
    );
    expect(screen.getByText("Sam Gone")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Restore registration/ }),
    ).toBeNull();
  });

  test("tapping a row opens its details, with check-in on top and cancel below", async () => {
    const user = userEvent.setup();
    renderDoor({ messaging: manager });

    await user.click(
      screen.getByRole("button", {
        name: "Details for María Fernanda Castillo-Wojciechowski",
      }),
    );

    const details = await screen.findByRole("dialog", {
      name: "María Fernanda Castillo-Wojciechowski",
    });
    const checkIn = within(details).getByRole("button", {
      name: "Check in party of 3",
    });
    const cancel = within(details).getByRole("button", {
      name: "Cancel registration",
    });
    // Cancel comes after everything else, check-in before it.
    expect(
      checkIn.compareDocumentPosition(cancel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(checkIn);
    expect(checkInMock).toHaveBeenCalledWith("reg-1");
    expect(
      await within(details).findByRole("button", { name: "Undo check-in" }),
    ).toBeInTheDocument();
  });

  test("no cancel in the details for an events: view reader", async () => {
    const user = userEvent.setup();
    renderDoor();

    await user.click(
      screen.getByRole("button", { name: "Details for Jamie Abbott" }),
    );
    const details = await screen.findByRole("dialog", { name: "Jamie Abbott" });
    expect(
      within(details).queryByRole("button", { name: "Cancel registration" }),
    ).toBeNull();
  });
});
