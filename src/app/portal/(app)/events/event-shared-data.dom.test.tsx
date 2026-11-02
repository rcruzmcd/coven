import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as RegistrantsActions from "./registrants-actions";
import * as ImpactDerivedActions from "./impact-derived-actions";
import { TabRefreshProvider, useTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";

const listEventPeopleActionMock = mock(async () => ({
  data: [],
  canCreate: false,
}));
const listEventRegistrantsActionMock = mock(async () => ({ data: [] }));
const getEventImpactDerivedActionMock = mock(async () => ({
  data: {
    participants: 0,
    checkedIn: 0,
    firstTimeParticipants: 0,
    recurringParticipants: 0,
    volunteerParticipants: 0,
    discountCodesAssigned: 0,
    autoAssignDiscountCodes: false,
    peopleServed: { distributed: 0, recipients: 0, value: 0 },
  },
}));

mock.module("./event-people-actions", () => ({
  listEventPeopleAction: listEventPeopleActionMock,
}));
mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  listEventRegistrantsAction: listEventRegistrantsActionMock,
}));
mock.module("./impact-derived-actions", () => ({
  ...ImpactDerivedActions,
  getEventImpactDerivedAction: getEventImpactDerivedActionMock,
}));

const { EventSharedDataProvider, useEventSharedData } =
  await import("./event-shared-data");

function Notifier({ tab }: { tab: TabValue }) {
  const { notify } = useTabRefresh<TabValue>();
  return (
    <button type="button" onClick={() => notify(tab)}>
      notify {tab}
    </button>
  );
}

function PeopleNames() {
  const { people, addLocalPerson } = useEventSharedData();
  return (
    <div>
      <ul>
        {(people.data ?? []).map((person) => (
          <li key={person.id}>{person.name}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() =>
          addLocalPerson({
            id: "new-1",
            name: "Rowan Diaz",
            email: null,
            phone: null,
          })
        }
      >
        add person
      </button>
    </div>
  );
}

function renderPhase(
  resources: ("registrants" | "impactDerived" | "people")[],
  children: React.ReactNode = null,
) {
  return render(
    <TabRefreshProvider>
      <EventSharedDataProvider eventId="event-1" resources={resources}>
        <Notifier tab="registrants" />
        <Notifier tab="discount-codes" />
        <Notifier tab="sponsors" />
        <Notifier tab="volunteers" />
        <Notifier tab="distributions" />
        <Notifier tab="expenses" />
        {children}
      </EventSharedDataProvider>
    </TabRefreshProvider>,
  );
}

describe("EventSharedDataProvider", () => {
  beforeEach(() => {
    listEventPeopleActionMock.mockClear();
    listEventRegistrantsActionMock.mockClear();
    getEventImpactDerivedActionMock.mockClear();
  });

  test("fetches only the resources the phase declares", () => {
    renderPhase(["registrants"]);

    expect(listEventRegistrantsActionMock).toHaveBeenCalledTimes(1);
    expect(getEventImpactDerivedActionMock).not.toHaveBeenCalled();
    expect(listEventPeopleActionMock).not.toHaveBeenCalled();
  });

  test("a registrants toolbar action refreshes the derived figures too", async () => {
    const user = userEvent.setup();
    renderPhase(["registrants", "impactDerived"]);

    await user.click(
      screen.getByRole("button", { name: "notify registrants" }),
    );

    await waitFor(() => {
      expect(listEventRegistrantsActionMock).toHaveBeenCalledTimes(2);
      expect(getEventImpactDerivedActionMock).toHaveBeenCalledTimes(2);
    });
  });

  test("a discount-code toolbar action refreshes only the derived figures", async () => {
    const user = userEvent.setup();
    renderPhase(["registrants", "impactDerived"]);

    await user.click(
      screen.getByRole("button", { name: "notify discount-codes" }),
    );

    await waitFor(() => {
      expect(getEventImpactDerivedActionMock).toHaveBeenCalledTimes(2);
    });
    expect(listEventRegistrantsActionMock).toHaveBeenCalledTimes(1);
  });

  test.each(["volunteers", "distributions", "expenses"] as const)(
    "a %s toolbar action refreshes the derived figures (#1619)",
    async (tab) => {
      const user = userEvent.setup();
      renderPhase(["impactDerived"]);

      await user.click(screen.getByRole("button", { name: `notify ${tab}` }));

      await waitFor(() => {
        expect(getEventImpactDerivedActionMock).toHaveBeenCalledTimes(2);
      });
    },
  );

  test("a sponsors toolbar action refreshes the shared people list", async () => {
    const user = userEvent.setup();
    renderPhase(["people"]);

    await user.click(screen.getByRole("button", { name: "notify sponsors" }));

    await waitFor(() => {
      expect(listEventPeopleActionMock).toHaveBeenCalledTimes(2);
    });
  });

  test("a person created from one card is selectable from every card", async () => {
    const user = userEvent.setup();
    renderPhase(["people"], <PeopleNames />);

    await user.click(screen.getByRole("button", { name: "add person" }));

    expect(await screen.findByText("Rowan Diaz")).toBeInTheDocument();
  });
});
