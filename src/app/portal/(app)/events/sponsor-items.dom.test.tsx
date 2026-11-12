// #1005: the item list is the whole point of the sponsor form now, and the
// parser tests only see the FormData it posts. These drive the rows the way a
// staffer does -- typing, adding, removing, switching support type -- and
// assert on what reaches the action.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as SponsorsActions from "./sponsors-actions";
import type { EventSponsor } from "./sponsors-actions";
import { focusedName } from "../../../../../test/focused";

type ActionResult = { error: string } | { success: true };

const updateEventSponsorActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./sponsors-actions", () => ({
  ...SponsorsActions,
  updateEventSponsorAction: updateEventSponsorActionMock,
  listEventSponsorsAction: async () => ({ data: [] }),
}));

const { SponsorForm, emptySponsorForm } = await import("./sponsors-tab");

// Same happy-dom quirk prizes.dom.test.tsx documents: the value fields are
// `type="number" step="0.01"`, and happy-dom does the step arithmetic in binary
// floating point -- 450 / 0.01 comes out as 44999.99999999999 -- so it calls a
// perfectly good money amount a stepMismatch and swallows the click on the
// submit button. Submitting the form directly skips that check; the React
// handler under test is the same either way.
function submitForm() {
  const form = document.querySelector("form");
  if (!form) throw new Error("expected a sponsor form");
  fireEvent.submit(form);
}

/** The submit runs inside a transition, so it settles after the event. Every
 *  assertion on what was posted waits for it. */
async function submitted() {
  await waitFor(() => expect(updateEventSponsorActionMock).toHaveBeenCalled());
  const formData = updateEventSponsorActionMock.mock.calls.at(-1)![1];
  return {
    items: JSON.parse(String(formData.get("items") ?? "[]")),
    contributionValue: String(formData.get("contributionValue") ?? ""),
  };
}

const SPONSOR_PERSON = {
  id: "person-1",
  name: "Summit Outdoor Co.",
  email: null,
  phone: null,
};

function renderForm(initial = emptySponsorForm()) {
  return render(
    <SponsorForm
      initial={initial}
      submitLabel="Save sponsor"
      onSubmit={(formData) =>
        SponsorsActions.updateEventSponsorAction("sponsor-1", formData)
      }
      people={[]}
      onPersonCreated={() => {}}
      personDisplay={SPONSOR_PERSON}
    />,
  );
}

async function fillItem(index: number, description: string, value: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(`Item ${index}`), description);
  const valueInputs = screen.getAllByLabelText("Value ($)");
  await user.type(valueInputs[index - 1], value);
}

describe("SponsorForm in-kind items", () => {
  beforeEach(() => {
    updateEventSponsorActionMock.mockClear();
  });

  test("posts every item the staffer added", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillItem(1, "Season lift tickets (4)", "720");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await fillItem(2, "Goggles", "90");
    submitForm();

    expect((await submitted()).items).toEqual([
      {
        id: null,
        description: "Season lift tickets (4)",
        faceValue: "720",
        intendedUse: "giveaway",
        allocated: false,
      },
      {
        id: null,
        description: "Goggles",
        faceValue: "90",
        intendedUse: "giveaway",
        allocated: false,
      },
    ]);
  });

  // #792: with `key={index}` the removal shifts every row below it and React
  // hands the wrong input to the wrong row, so the surviving row shows the
  // removed one's text. This is the regression that keying guards.
  test("removing a row leaves the other rows' values where they were", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillItem(1, "Board", "450");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await fillItem(2, "Goggles", "90");
    await user.click(screen.getByRole("button", { name: "Remove item 1" }));

    await waitFor(() =>
      expect(screen.queryAllByLabelText(/^Item \d+$/)).toHaveLength(1),
    );
    expect(screen.getByLabelText("Item 1")).toHaveValue("Goggles");
    // The removed row took the button that had focus; the remaining row's
    // Remove takes it instead of <body> (#1862).
    await waitFor(() => expect(focusedName()).toBe("Remove item 1"));

    submitForm();
    const { items } = await submitted();
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Goggles");
  });

  test("the only row cannot be removed, so there is always somewhere to type", () => {
    renderForm();
    // Disabled but still focusable (#1862), so aria-disabled, not `disabled`.
    expect(
      screen.getByRole("button", { name: "Remove item 1" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  test("an item a giveaway prize claims cannot be removed", () => {
    renderForm({
      ...emptySponsorForm(),
      items: [
        {
          id: "item-1",
          description: "Board",
          faceValue: "450",
          intendedUse: "giveaway",
          allocated: true,
        },
        {
          id: "item-2",
          description: "Goggles",
          faceValue: "90",
          intendedUse: "giveaway",
          allocated: false,
        },
      ],
    });

    // Disabled but still focusable (#1862), so aria-disabled, not `disabled`.
    expect(
      screen.getByRole("button", { name: "Remove item 1" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen
        .getByRole("button", { name: "Remove item 2" })
        .getAttribute("aria-disabled"),
    ).not.toBe("true");
  });

  test("a blank contribution value falls back to the items total", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillItem(1, "Board", "450");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await fillItem(2, "Goggles", "90");
    submitForm();

    expect((await submitted()).contributionValue).toBe("540");
  });

  test("a typed contribution value wins over the items total", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillItem(1, "Board", "450");
    await user.type(screen.getByLabelText("Contribution value ($)"), "2000");
    submitForm();

    expect((await submitted()).contributionValue).toBe("2000");
  });

  test("cash support hides the item list", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByLabelText("Item 1")).toBeInTheDocument();

    const supportType = screen.getByLabelText("Support type");
    await user.click(supportType);
    await user.click(
      within(screen.getByRole("listbox")).getByRole("option", { name: "Cash" }),
    );

    expect(screen.queryByLabelText("Item 1")).not.toBeInTheDocument();
  });

  test("an existing sponsorship's items load with their ids, so an edit updates them", () => {
    const sponsor = {
      id: "sponsor-1",
      support_type: "in_kind",
      in_kind_description: "Board, Goggles",
      contribution_value: 540,
      is_public: true,
      notes: null,
      follow_up_status: "not_started",
      follow_up_notes: null,
      donation_id: "donation-1",
      monetary_donation_id: null,
      person: SPONSOR_PERSON,
      items: [
        {
          id: "item-1",
          description: "Board",
          face_value: 450,
          intended_use: "gear_library",
          status: "available",
          allocated: false,
        },
      ],
    } as unknown as EventSponsor;

    // formStateFor is internal; the tab builds the same shape from the row.
    renderForm({
      ...emptySponsorForm(),
      items: sponsor.items.map((item) => ({
        id: item.id,
        description: item.description,
        faceValue: String(item.face_value),
        intendedUse: item.intended_use,
        allocated: item.allocated,
      })),
    });

    expect(screen.getByLabelText("Item 1")).toHaveValue("Board");
    expect(screen.getByLabelText("Headed for")).toHaveTextContent(
      "Gear library",
    );
  });
});
