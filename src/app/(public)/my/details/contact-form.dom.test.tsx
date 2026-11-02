import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyContactDetails } from "@/lib/constituent/contact";
import type { SaveContactDetailsResult } from "./actions";

// The real module is a Server Action file: it reaches for a Supabase server
// client and Next's request headers at import, neither of which exists here.
// The form's own job is what it does with what the action returns.
const saveMock = mock<(payload: FormData) => Promise<SaveContactDetailsResult>>(
  async () => ({ saved: true }),
);
const saveAnswersMock = mock<
  (
    answers: Record<string, unknown>,
  ) => Promise<{ saved: true } | { error: string }>
>(async () => ({ saved: true }));
mock.module("./actions", () => ({
  saveMyContactDetailsAction: saveMock,
  saveMyPersonAnswersAction: saveAnswersMock,
}));

const { ContactForm } = await import("./contact-form");

const DETAILS: MyContactDetails = {
  person_id: "p1",
  name: "Jane Doe",
  preferred_name: "Janey",
  email: "jane@example.test",
  email_pending: null,
  email_pending_expires_at: null,
  phone: "555-1234",
  pronouns: "she/her",
  instagram_handle: "jane.doe",
  preferred_mountain: "Hunter",
  riding_discipline: null,
  ski_experience_level: null,
  snowboard_experience_level: null,
  address_line1: "1 Summit Road",
  address_line2: null,
  address_city: "Hunter",
  address_region: "NY",
  address_postal_code: "12442",
  address_country: "USA",
};

const HANDLE_ERROR =
  "An Instagram handle can only contain letters, numbers, periods and underscores.";

function save() {
  return screen.getByRole("button", { name: /^save$/i });
}

/**
 * The summary above the button, told apart from the per-field messages it
 * points at -- a FieldError is a `role="alert"` too, which is the whole point
 * of binding one to each field.
 */
function summary(): HTMLElement {
  const alerts = screen
    .getAllByRole("alert")
    .filter((element) => element.getAttribute("data-slot") === "alert");
  expect(alerts).toHaveLength(1);
  return alerts[0]!;
}

beforeEach(() => {
  saveMock.mockClear();
  saveMock.mockImplementation(async () => ({ saved: true }));
  saveAnswersMock.mockClear();
  saveAnswersMock.mockImplementation(async () => ({ saved: true }));
});

describe("ContactForm", () => {
  test("gives each group its own section and its legend as the heading", () => {
    render(<ContactForm details={DETAILS} />);

    for (const legend of [
      "How to reach you",
      "Where to send things",
      "What you ride",
    ]) {
      expect(screen.getByRole("group", { name: legend })).toBeInTheDocument();
    }
    // The card that used to hold all fourteen of them.
    expect(screen.queryByText("Everything else")).toBeNull();
  });

  test("leaves out the rider group without the rider_profile module, and still sends the stored answers", async () => {
    // #1408. The group is the module's; the values travel as loaded so
    // set_my_contact_details() -- which ignores them without the module --
    // never sees a blank it could mistake for a deletion.
    const user = userEvent.setup();
    render(<ContactForm details={DETAILS} showRider={false} />);

    expect(screen.queryByRole("group", { name: "What you ride" })).toBeNull();
    expect(screen.queryByLabelText("Home mountain")).toBeNull();

    await user.type(screen.getByLabelText("Phone"), "9");
    await user.click(save());

    const formData = saveMock.mock.calls[0]![0] as FormData;
    expect(formData.get("preferredMountain")).toBe("Hunter");
  });

  // Both boxes used to live in one Field, the second carrying only an
  // aria-label -- a box with no explanation on screen (#1181).
  test("labels both address lines visibly", () => {
    render(<ContactForm details={DETAILS} />);

    expect(screen.getByText("Street address")).toBeInTheDocument();
    expect(screen.getByText("Apartment, suite, etc.")).toBeInTheDocument();
    expect(screen.getByLabelText("Apartment, suite, etc.")).toHaveAttribute(
      "autocomplete",
      "address-line2",
    );
  });

  describe("the dirty gate", () => {
    test("save is dead until something changes", async () => {
      const user = userEvent.setup();
      render(<ContactForm details={DETAILS} />);

      expect(save()).toBeDisabled();

      await user.type(screen.getByLabelText("Phone"), "5");
      expect(save()).toBeEnabled();
    });

    test("and dead again once the change is saved", async () => {
      const user = userEvent.setup();
      render(<ContactForm details={DETAILS} />);

      await user.type(screen.getByLabelText("Phone"), "5");
      await user.click(save());

      await waitFor(() => expect(save()).toBeDisabled());
    });

    // The same state the sticky treatment keys off. Asserting the sentence
    // rather than the classes: what matters is that an edited form says so
    // while the button is following you down the page, and stops saying it the
    // moment the edit is committed.
    test("says so while there is something to save, and not before", async () => {
      const user = userEvent.setup();
      render(<ContactForm details={DETAILS} />);
      const unsaved = /changes are not saved yet/i;

      expect(screen.queryByText(unsaved)).toBeNull();

      await user.type(screen.getByLabelText("Phone"), "5");
      expect(screen.getByText(unsaved)).toBeInTheDocument();

      await user.click(save());
      await waitFor(() => expect(screen.queryByText(unsaved)).toBeNull());
    });

    test("typing back to the original value is not a change", async () => {
      const user = userEvent.setup();
      render(<ContactForm details={DETAILS} />);

      const mountain = screen.getByLabelText("Home mountain");
      await user.clear(mountain);
      expect(save()).toBeEnabled();

      await user.type(mountain, "Hunter");
      expect(save()).toBeDisabled();
    });
  });

  describe("a rejected field", () => {
    beforeEach(() => {
      saveMock.mockImplementation(async () => ({
        error: HANDLE_ERROR,
        fieldErrors: { instagramHandle: HANDLE_ERROR },
      }));
    });

    async function submitAndFail() {
      const user = userEvent.setup();
      render(<ContactForm details={DETAILS} />);
      await user.type(screen.getByLabelText("Instagram"), "!");
      await user.click(save());
      return user;
    }

    test("is marked, described by its message, and given focus", async () => {
      await submitAndFail();

      const handle = screen.getByLabelText("Instagram");
      await waitFor(() =>
        expect(handle).toHaveAttribute("aria-invalid", "true"),
      );

      const described = handle.getAttribute("aria-describedby");
      expect(described).toBe("my-instagramHandle-error");
      expect(document.getElementById(described!)).toHaveTextContent(
        HANDLE_ERROR,
      );
      // The message lands beside the input rather than hundreds of pixels
      // below it, next to the save button.
      expect(
        within(
          screen.getByRole("group", { name: "How to reach you" }),
        ).getByText(HANDLE_ERROR),
      ).toBeInTheDocument();
      expect(handle).toHaveFocus();
    });

    test("is listed in the summary as a way back to it", async () => {
      await submitAndFail();

      await waitFor(() =>
        expect(within(summary()).getByRole("link", { name: "Instagram" })),
      );
      expect(
        within(summary()).getByRole("link", { name: "Instagram" }),
      ).toHaveAttribute("href", "#my-instagramHandle");
    });

    test("stops being marked the moment it is edited", async () => {
      const user = await submitAndFail();

      await waitFor(() =>
        expect(screen.getByLabelText("Instagram")).toHaveAttribute(
          "aria-invalid",
          "true",
        ),
      );

      await user.type(screen.getByLabelText("Instagram"), "a");

      expect(screen.getByLabelText("Instagram")).not.toHaveAttribute(
        "aria-invalid",
      );
    });
  });

  test("a failure with no field to blame marks nothing", async () => {
    saveMock.mockImplementation(async () => ({
      error: "Could not save your details. Please try again.",
    }));
    const user = userEvent.setup();
    render(<ContactForm details={DETAILS} />);

    await user.type(screen.getByLabelText("Phone"), "5");
    await user.click(save());

    await waitFor(() =>
      expect(summary()).toHaveTextContent("Could not save your details"),
    );
    expect(within(summary()).queryByRole("link")).toBeNull();
    expect(screen.getByLabelText("Instagram")).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  // This is an edit form. The public forms replace themselves on success; the
  // record here has to stay on screen for the next correction.
  test("a saved form stays on screen and says so", async () => {
    const user = userEvent.setup();
    render(<ContactForm details={DETAILS} />);

    await user.type(screen.getByLabelText("Phone"), "5");
    await user.click(save());

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Saved.");
    expect(screen.getByLabelText("Phone")).toBeInTheDocument();
    expect(save()).toBeInTheDocument();
  });

  test("sends the whole allowlist, because the RPC writes all of it", async () => {
    const user = userEvent.setup();
    render(<ContactForm details={DETAILS} />);

    await user.type(screen.getByLabelText("Apartment, suite, etc."), "Unit 2");
    await user.click(save());

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0]![0];
    expect(payload.get("addressLine2")).toBe("Unit 2");
    // Untouched fields travel too: a partial payload would blank them.
    expect(payload.get("preferredName")).toBe("Janey");
    expect(payload.get("addressLine1")).toBe("1 Summit Road");
  });

  describe("profile questions (#1744)", () => {
    const HOUSEHOLD = {
      id: "q-household",
      kind: "number" as const,
      prompt: "Household size",
      help: null,
      required: true,
      options: [],
      min_value: 1,
      max_value: 20,
      show_if: null,
    };

    test("pre-fills the reader's answers and saves only what changed", async () => {
      const user = userEvent.setup();
      render(
        <ContactForm
          details={DETAILS}
          profileQuestions={[HOUSEHOLD]}
          profileAnswers={{ "q-household": 2 }}
        />,
      );

      expect(
        screen.getByRole("group", { name: "A few questions about you" }),
      ).toBeInTheDocument();
      const field = screen.getByLabelText(/Household size/);
      expect(field).toHaveValue(2);
      expect(save()).toBeDisabled();

      await user.clear(field);
      await user.type(field, "4");
      await user.click(save());

      await waitFor(() =>
        expect(saveAnswersMock).toHaveBeenCalledWith({ "q-household": 4 }),
      );
      // The contact fields did not change, so they are not re-sent.
      expect(saveMock).not.toHaveBeenCalled();
      expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    });

    test("holds a changed answer to required before sending anything", async () => {
      const user = userEvent.setup();
      render(
        <ContactForm
          details={DETAILS}
          profileQuestions={[HOUSEHOLD]}
          profileAnswers={{ "q-household": 2 }}
        />,
      );

      await user.clear(screen.getByLabelText(/Household size/));
      await user.click(save());

      expect(summary()).toHaveTextContent("Please answer “Household size”.");
      expect(saveAnswersMock).not.toHaveBeenCalled();
      expect(saveMock).not.toHaveBeenCalled();
    });
  });
});
