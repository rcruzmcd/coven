import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortalDeviceProvider } from "@/lib/portal/device-context";
import { NO_RECORD_MESSAGES } from "@/lib/outbound-messages";

// The phone's door list reaches the detail sheet's messaging island, and
// through it the `server-only` sender; see registrants-tab.dom.test.tsx.
mock.module("server-only", () => ({}));
const RegistrantsActions = await import("../events/registrants-actions");
const ImpactDerivedActions = await import("../events/impact-derived-actions");

// CheckInModal is a thin Sheet wrapper around the real RegistrantsTab (the
// same component the event detail page's Registrants card uses). On the event
// page the phase provider feeds that card; here the modal does, because it
// renders outside the event tabs -- so its job is wiring capacity/mode and the
// two shared reads through, and holding those reads back until the sheet is
// open (the portal home renders one of these per upcoming event). Check-in
// behavior itself is covered in registrants-tab.dom.test.tsx.
const registrantsTabPropsMock = mock((_props: unknown) => null);

const RegistrantsTabModule = await import("../events/registrants-tab");
mock.module("../events/registrants-tab", () => ({
  ...RegistrantsTabModule,
  RegistrantsTab: (props: { capacity: number | null; mode: string }) => {
    registrantsTabPropsMock(props);
    return <div data-testid="registrants-tab" />;
  },
}));

const listEventRegistrantsActionMock = mock(async () => ({
  data: {
    registrants: [],
    cancelled: [],
    messages: NO_RECORD_MESSAGES,
    messaging: null,
    waiverInForce: false,
    photoConsentInForce: false,
    registrationOptions: null,
    registrationQuestions: [],
  },
}));
const getEventImpactDerivedActionMock = mock(async () => ({ data: null }));

mock.module("../events/registrants-actions", () => ({
  ...RegistrantsActions,
  listEventRegistrantsAction: listEventRegistrantsActionMock,
}));
mock.module("../events/impact-derived-actions", () => ({
  ...ImpactDerivedActions,
  getEventImpactDerivedAction: getEventImpactDerivedActionMock,
}));

const { CheckInModal } = await import("./check-in-modal");

describe("CheckInModal", () => {
  beforeEach(() => {
    registrantsTabPropsMock.mockClear();
    listEventRegistrantsActionMock.mockClear();
    getEventImpactDerivedActionMock.mockClear();
  });

  test("is closed by default and does not mount the registrants panel", () => {
    render(
      <CheckInModal
        eventId="event-1"
        eventName="Winter Gear Giveaway"
        capacity={40}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Check in" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("registrants-tab")).toBeNull();
  });

  test("holds its reads back until the sheet is opened", async () => {
    const user = userEvent.setup();
    render(
      <CheckInModal
        eventId="event-42"
        eventName="Spring Cleanup"
        capacity={null}
      />,
    );

    expect(listEventRegistrantsActionMock).not.toHaveBeenCalled();
    expect(getEventImpactDerivedActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Check in" }));

    await waitFor(() => {
      expect(listEventRegistrantsActionMock).toHaveBeenCalledTimes(1);
      expect(getEventImpactDerivedActionMock).toHaveBeenCalledTimes(1);
    });
  });

  test("opens to the event's registrants in edit mode", async () => {
    const user = userEvent.setup();
    render(
      <CheckInModal
        eventId="event-42"
        eventName="Spring Cleanup"
        capacity={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(
      screen.getByRole("heading", { name: "Check in · Spring Cleanup" }),
    ).toBeInTheDocument();
    expect(registrantsTabPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ capacity: null, mode: "edit" }),
    );
  });

  // #1558
  test("on a phone, opens the door list instead of the card", async () => {
    const user = userEvent.setup();
    render(
      <PortalDeviceProvider device="mobile">
        <CheckInModal
          eventId="event-42"
          eventName="Spring Cleanup"
          capacity={null}
        />
      </PortalDeviceProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(
      screen.getByRole("heading", { name: "Check in · Spring Cleanup" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("searchbox", { name: "Search registrants" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("registrants-tab")).toBeNull();
    // The door list has no summary, so nothing reads the derived figures.
    expect(listEventRegistrantsActionMock).toHaveBeenCalledTimes(1);
    expect(getEventImpactDerivedActionMock).not.toHaveBeenCalled();
  });

  test("supports a custom trigger label", () => {
    render(
      <CheckInModal
        eventId="event-1"
        eventName="Winter Gear Giveaway"
        capacity={null}
        triggerLabel="Check in attendees"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Check in attendees" }),
    ).toBeInTheDocument();
  });
});
