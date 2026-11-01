import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The action module reaches the admin client, which is `server-only`-guarded
// and throws outside Next's bundler. Neutralising the guard lets it load so
// that the mock below can replace its one export; nothing in it runs.
mock.module("server-only", () => ({}));

type RegisterForEventResult =
  | { error: string; step: "about" | "event" | "review" }
  | { success: true; registrationId: string; answersPath: string | null };

const registerForEventActionMock = mock<
  (eventId: string, formData: FormData) => Promise<RegisterForEventResult>
>(async () => ({ success: true, registrationId: "reg-1", answersPath: null }));

mock.module("./event-registration-actions", () => ({
  registerForEventAction: registerForEventActionMock,
}));

const { EventRegistrationForm } =
  await import("./event-registration-form-fields");

import { PHOTO_CONSENT_HEADING } from "@/lib/photo-consent";
import { CARPOOL_COST_NOTICE_HEADING } from "@/lib/event-carpools";
import type { RegistrationQuestion } from "@/lib/registration-questions";

// Structural rather than `typeof userEvent`: the default export and what
// `userEvent.setup()` returns are different types, and both are passed here.
type Clicker = { click: (element: Element) => Promise<unknown> };

/**
 * Moves from "About you" to "This event" (#1413), where the party size, the
 * minors question and the event's own question are. A no-op once there, so a
 * case can call it without knowing which step it is on.
 */
async function toThisEvent(user: Clicker = userEvent) {
  if (screen.queryByRole("group", { name: /This event|Your riding/ })) return;
  await user.click(screen.getByRole("button", { name: "Next" }));
}

/** Presses Next through to the review step (#1413) and submits from there. */
async function submit(user: Clicker = userEvent) {
  for (let press = 0; press < 2; press++) {
    const next = screen.queryByRole("button", { name: "Next" });
    if (!next) break;
    await user.click(next);
  }
  await user.click(
    screen.getByRole("button", { name: "Complete registration" }),
  );
}

/** Fills the two required fields on "About you". */
async function fillAboutYou(
  user: {
    type: (element: Element, text: string) => Promise<unknown>;
  } = userEvent,
) {
  await user.type(screen.getByLabelText(/^Name/), "Jane");
  await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
}

/**
 * #685: the minors question is required, so every case that expects a
 * submission has to answer it. "No" is the answer that leaves the rest of the
 * form exactly as it was. It is on "This event", so this goes there first.
 */
async function sayNoMinors(user: Clicker = userEvent) {
  await toThisEvent(user);
  await user.click(screen.getByLabelText(/under 18/i));
  await user.click(
    screen.getByRole("option", { name: /everyone is 18 or over/i }),
  );
}

/** The (eventId, FormData) the action was last called with, as plain fields. */
function lastSubmission() {
  const call = registerForEventActionMock.mock.calls.at(-1);
  if (!call) throw new Error("the registration action was never called");
  return Object.fromEntries(call[1].entries()) as Record<string, string>;
}

describe("EventRegistrationForm", () => {
  beforeEach(() => {
    registerForEventActionMock.mockClear();
  });

  // #686. The whole of the degraded path: a tenant that has adopted no
  // participant agreement sees the form exactly as it was before this shipped,
  // and posts nothing about one.
  test("says nothing about an agreement when the tenant takes none", async () => {
    render(<EventRegistrationForm eventId="event-1" />);

    expect(screen.queryByRole("checkbox", { hidden: true })).toBeNull();

    await userEvent.type(screen.getByLabelText(/^Name/), "Jane");
    await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await sayNoMinors();
    await submit();

    const submission = lastSubmission();
    expect(submission.waiverAccepted).toBeUndefined();
    expect(submission.waiverVersion).toBeUndefined();
  });

  // #1591. The success screen hands over the same link the email carries.
  test("offers the registrant's own answers link once registered", async () => {
    registerForEventActionMock.mockImplementationOnce(async () => ({
      success: true,
      registrationId: "reg-1",
      answersPath: "/events/e/event-1/answers?t=abc",
    }));
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);
    await fillAboutYou(user);
    await sayNoMinors(user);
    await submit(user);

    expect(
      await screen.findByRole("link", { name: "Change your answers" }),
    ).toHaveAttribute("href", "/events/e/event-1/answers?t=abc");
  });

  test("offers no answers link for an event without one", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);
    await fillAboutYou(user);
    await sayNoMinors(user);
    await submit(user);

    expect(await screen.findByText(/You're registered!/)).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Change your answers" }),
    ).toBeNull();
  });

  test("the agreement's box starts unticked", async () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        waiver={{ version: 3, title: "Participant Waiver" }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );
    await fillAboutYou();
    await sayNoMinors();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("The agreement itself")).toBeVisible();
    const box = screen.getByRole("checkbox", {
      name: /I have read and accept/,
    });
    expect(box).not.toBeChecked();
    // Named, not "the agreement above" (#1402): the full text is now behind a
    // button, so the box says which document it accepts.
    expect(box).toHaveAccessibleName(
      "I have read and accept the Participant Waiver",
    );
    // A pre-ticked box is not an acceptance, and `required` is what makes the
    // browser say which control is missing rather than silently refusing.
    expect(box).toBeRequired();
  });

  test("posts the acceptance and the version it was shown", async () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        waiver={{ version: 3, title: "Participant Waiver" }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );

    await fillAboutYou();
    await sayNoMinors();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: /I have read and accept/ }),
    );
    await submit();

    expect(lastSubmission()).toMatchObject({
      waiverAccepted: "on",
      // Sent so the server can refuse a submission made against text that has
      // been republished since it was rendered.
      waiverVersion: "3",
    });
  });

  // An untouched box does not submit at all: `required` blocks it in the
  // browser, which is why the label says so rather than the button going grey.
  // That is a convenience and never the gate -- `accepted_waiver_version()`
  // refuses the same submission server-side, which is what an integration test
  // covers and this cannot.
  test("an untouched box does not submit", async () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        waiver={{ version: 3, title: "Participant Waiver" }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );

    await userEvent.type(screen.getByLabelText(/^Name/), "Jane");
    await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await sayNoMinors();
    await submit();

    expect(registerForEventActionMock).not.toHaveBeenCalled();
  });

  // #1407
  describe("the event's registration question", () => {
    const question = {
      prompt: "What does each person need?",
      options: [
        { id: "own", label: "Own gear", isFull: false },
        { id: "ticket", label: "Need a ticket", isFull: true },
        { id: "both", label: "Ticket and gear", isFull: false },
      ],
    };

    test("is not asked by an event without one", () => {
      render(<EventRegistrationForm eventId="event-1" />);
      expect(screen.queryByText(question.prompt)).toBeNull();
    });

    test("locks a full option and posts the counts chosen", async () => {
      render(
        <EventRegistrationForm
          eventId="event-1"
          registrationOptions={question}
        />,
      );
      expect(screen.getByText(question.prompt)).toBeTruthy();
      expect(
        (screen.getByLabelText("Need a ticket") as HTMLInputElement).disabled,
      ).toBe(true);

      await userEvent.type(screen.getByLabelText(/^Name/), "Jane");
      await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
      await toThisEvent();
      const partySize = screen.getByLabelText("Number attending");
      await userEvent.clear(partySize);
      await userEvent.type(partySize, "3");
      await sayNoMinors();
      await userEvent.type(screen.getByLabelText("Own gear"), "2");
      await userEvent.type(screen.getByLabelText("Ticket and gear"), "1");
      await submit();

      const submission = lastSubmission();
      expect(submission["optionCount.own"]).toBe("2");
      expect(submission["optionCount.both"]).toBe("1");
      // Untouched is absent, which the RPC reads as none.
      expect(submission["optionCount.ticket"]).toBeUndefined();
    });

    test("does not submit counts that miss the party size", async () => {
      render(
        <EventRegistrationForm
          eventId="event-1"
          registrationOptions={question}
        />,
      );
      await userEvent.type(screen.getByLabelText(/^Name/), "Jane");
      await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
      await sayNoMinors();
      await submit();

      expect(registerForEventActionMock).not.toHaveBeenCalled();
      expect(
        await screen.findByText(/what each person in your party needs/),
      ).toBeTruthy();
    });
  });

  test("a visitor with no session gets the blank form it always had", () => {
    render(<EventRegistrationForm eventId="event-1" />);

    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("");
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  // #1257: an account between signing up and having its claim approved has no
  // `people` row, so it lands here rather than on MyEventRegistrationForm --
  // but the application is already holding its name and address, and asking it
  // to retype them is how a second copy of somebody gets made.
  test("prefills name and email from the account's own session", () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue("Jane Rivers");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("jane@example.com");
    expect(screen.getByText("Signed in as jane@example.com.")).toBeVisible();
  });

  test("a provider that gave no name prefills the address alone", () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: null }}
      />,
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("jane@example.com");
  });

  test("the prefilled form still posts through the anonymous action", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );

    await sayNoMinors(user);
    await submit(user);

    expect(registerForEventActionMock).toHaveBeenCalledTimes(1);
    expect(registerForEventActionMock.mock.calls[0][0]).toBe("event-1");
    expect(lastSubmission()).toMatchObject({
      name: "Jane Rivers",
      email: "jane@example.com",
    });
  });

  // A prefill, not an attribution: the account's address is a starting point,
  // and somebody registering a partner from their own browser overwrites it.
  test("an edited prefill is what gets submitted", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );

    await user.clear(screen.getByLabelText(/^Email/));
    await user.type(screen.getByLabelText(/^Email/), "sam@example.com");
    await sayNoMinors(user);
    await submit(user);

    expect(lastSubmission()).toMatchObject({ email: "sam@example.com" });
  });

  // #1259. The acceptance criterion in one test: the question reads the same
  // for a visitor with no session and for an account, because a question only
  // some people see answers "do you have a record of me?" for anybody who can
  // fill in a form.
  test("asks everyone whether they have been before, in the same words", () => {
    const { unmount } = render(<EventRegistrationForm eventId="event-1" />);
    expect(
      screen.getByLabelText("Have you been to one of our events before?"),
    ).toBeVisible();
    unmount();

    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );
    expect(
      screen.getByLabelText("Have you been to one of our events before?"),
    ).toBeVisible();
  });

  test("submits nothing for the question when it is left alone", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await sayNoMinors(user);
    await submit(user);

    // Empty, which `parseAttendedBefore` reads as unanswered. Not "no".
    expect(lastSubmission().attendedBefore).toBe("");
  });

  test("submits a first-timer's answer", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await user.click(
      screen.getByLabelText("Have you been to one of our events before?"),
    );
    await user.click(
      screen.getByRole("option", { name: "No, this would be my first" }),
    );
    await sayNoMinors(user);
    await submit(user);

    expect(lastSubmission().attendedBefore).toBe("no");
  });
});

// #685. The three things the block has to get right: it is asked of everybody
// identically, it is required, and what it reveals is the organization's own
// rule rather than one the platform wrote.
describe("EventRegistrationForm and the minors question", () => {
  beforeEach(() => {
    registerForEventActionMock.mockClear();
  });

  test("asks everyone, in the same words", async () => {
    const { unmount } = render(<EventRegistrationForm eventId="event-1" />);
    await fillAboutYou();
    await toThisEvent();
    expect(
      screen.getByLabelText(/Is anyone in your party under 18\?/),
    ).toBeVisible();
    unmount();

    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );
    await toThisEvent();
    expect(
      screen.getByLabelText(/Is anyone in your party under 18\?/),
    ).toBeVisible();
  });

  test("nothing about an accompanying adult until the answer is yes", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        minorAccompaniment={["An adult has to be with them for the whole day."]}
      />,
    );

    expect(screen.queryByLabelText(/Accompanying adult/i)).toBeNull();
    expect(
      screen.queryByText("An adult has to be with them for the whole day."),
    ).toBeNull();

    await fillAboutYou(user);
    await toThisEvent(user);
    await user.click(screen.getByLabelText(/under 18/i));
    await user.click(screen.getByRole("option", { name: "Yes" }));

    expect(
      screen.getByText("An adult has to be with them for the whole day."),
    ).toBeVisible();
    expect(screen.getByLabelText(/Accompanying adult's name/i)).toBeVisible();
  });

  test("a yes posts the four contacts with it", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await toThisEvent(user);
    await user.click(screen.getByLabelText(/under 18/i));
    await user.click(screen.getByRole("option", { name: "Yes" }));
    await user.type(
      screen.getByLabelText(/Accompanying adult's name/i),
      "Jane Rivers",
    );
    await user.type(
      screen.getByLabelText(/Accompanying adult's mobile/i),
      "555-0101",
    );
    await user.type(
      screen.getByLabelText(/Emergency contact's name/i),
      "Robin Rivers",
    );
    await user.type(
      screen.getByLabelText(/Emergency contact's phone/i),
      "555-0102",
    );
    await submit(user);

    expect(lastSubmission()).toMatchObject({
      partyIncludesMinor: "yes",
      accompanyingAdultName: "Jane Rivers",
      accompanyingAdultPhone: "555-0101",
      emergencyContactName: "Robin Rivers",
      emergencyContactPhone: "555-0102",
    });
  });

  test("a submission says the question was asked", async () => {
    render(<EventRegistrationForm eventId="event-1" />);
    await fillAboutYou();
    await sayNoMinors();
    await submit();
    expect(lastSubmission()).toMatchObject({
      minorsAsked: "on",
      partyIncludesMinor: "no",
    });
  });

  // #1416. A tenant with the question off: nothing about under-18s renders,
  // nothing is sent, and the form submits without it.
  test("a tenant that does not ask shows and sends nothing about it", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        asksAboutMinors={false}
        minorAccompaniment={["An adult has to be with them for the whole day."]}
      />,
    );

    await fillAboutYou(user);
    await toThisEvent(user);
    expect(screen.queryByLabelText(/under 18/i)).toBeNull();
    expect(screen.queryByLabelText(/Accompanying adult/i)).toBeNull();
    expect(
      screen.queryByText("An adult has to be with them for the whole day."),
    ).toBeNull();

    await submit(user);
    const submission = lastSubmission();
    expect(submission).not.toHaveProperty("minorsAsked");
    expect(submission).not.toHaveProperty("partyIncludesMinor");
    expect(submission).not.toHaveProperty("accompanyingAdultName");
    expect(screen.queryByText(/Anyone under 18/)).toBeNull();
    expect(await screen.findByText(/You're registered/)).toBeVisible();
  });

  // Changed their mind. Nobody agreed to give a guardian's number for a party
  // that has none, so the form stops sending them.
  test("going back to no sends no contacts", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await toThisEvent(user);
    await user.click(screen.getByLabelText(/under 18/i));
    await user.click(screen.getByRole("option", { name: "Yes" }));
    await user.type(
      screen.getByLabelText(/Accompanying adult's name/i),
      "Jane Rivers",
    );
    await sayNoMinors(user);
    await submit(user);

    const submission = lastSubmission();
    expect(submission.partyIncludesMinor).toBe("no");
    expect(submission.accompanyingAdultName).toBeUndefined();
    expect(submission.emergencyContactPhone).toBeUndefined();
  });

  // #599 put a box here; #1376 removed it. The paragraphs are a tenant slot,
  // so the whole block appears and disappears with it -- and the absent case
  // is almost every tenant.
  describe("photos and video (#1376)", () => {
    const SCOPE = [
      "We use photos and video from our events in our own newsletters, on this site, and on our social media accounts.",
      "Registering for one of our events means you are happy for us to do that. Tell any organizer if you would rather we did not.",
    ];

    // Structurally typed for the reason `sayNoMinors` above is: the default
    // export and what `userEvent.setup()` returns are different types, and
    // both get passed here.
    async function fillAndSubmit(
      user: {
        click: (element: Element) => Promise<unknown>;
        type: (element: Element, text: string) => Promise<unknown>;
      } = userEvent,
    ) {
      await user.type(screen.getByLabelText(/^Name/), "Jane");
      await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
      await sayNoMinors(user);
      await submit(user);
    }

    test("says nothing, and posts nothing, when the tenant has written none", async () => {
      render(<EventRegistrationForm eventId="event-1" />);

      expect(screen.queryByRole("checkbox", { hidden: true })).toBeNull();
      expect(
        screen.queryByRole("heading", {
          name: PHOTO_CONSENT_HEADING,
          hidden: true,
        }),
      ).toBeNull();
      await fillAndSubmit();

      expect(lastSubmission().photoConsent).toBeUndefined();
    });

    test("renders the paragraphs, with no box of its own", async () => {
      render(<EventRegistrationForm eventId="event-1" photoConsent={SCOPE} />);

      // `hidden: true` throughout: these are on the review step, and the
      // question is what the form carries rather than what is on screen.
      expect(
        screen.getByRole("heading", {
          name: PHOTO_CONSENT_HEADING,
          hidden: true,
        }),
      ).toBeInTheDocument();
      for (const paragraph of SCOPE) {
        expect(screen.getByText(paragraph)).toBeInTheDocument();
      }

      // No waiver here, so the form carries no checkbox at all.
      expect(screen.queryAllByRole("checkbox", { hidden: true })).toHaveLength(
        0,
      );
    });

    // With a waiver in force the only box on the form is its own. #599's box
    // sat beside it and #1376 removed it, so a test that merely counted
    // "at least one" would not notice it coming back.
    test("the only checkbox on the form is the waiver's", async () => {
      render(
        <EventRegistrationForm
          eventId="event-1"
          photoConsent={SCOPE}
          waiver={{ version: 1, title: "Participant Waiver" }}
          waiverBlock={<p>The agreement itself.</p>}
        />,
      );

      await fillAboutYou();
      await sayNoMinors();
      await userEvent.click(screen.getByRole("button", { name: "Next" }));

      const boxes = screen.getAllByRole("checkbox");
      expect(boxes).toHaveLength(1);
      expect(boxes[0]).toHaveAccessibleName(
        "I have read and accept the Participant Waiver and the photo and video release",
      );
    });

    // The wire guard, and the point of the whole change: a registration taken
    // through this form records nothing about photos, so the row rests at
    // null -- no objection on record, agreement implied by registering.
    test("posts no photoConsent field even with paragraphs written", async () => {
      render(<EventRegistrationForm eventId="event-1" photoConsent={SCOPE} />);

      await fillAndSubmit();

      expect(registerForEventActionMock).toHaveBeenCalled();
      expect(lastSubmission().photoConsent).toBeUndefined();
      for (const key of Object.keys(lastSubmission())) {
        expect(key).not.toMatch(/photo/i);
      }
    });

    // #1376 dropped the guardian branch with the box it reworded: a
    // platform-written sentence saying a registering adult's submission binds
    // the under-18s in their party would be a guardianship claim the platform
    // is in no position to make.
    test("says nothing about a guardian capacity when the party includes a minor", async () => {
      const user = userEvent.setup();
      render(<EventRegistrationForm eventId="event-1" photoConsent={SCOPE} />);

      await fillAboutYou(user);
      await toThisEvent(user);
      await user.click(screen.getByLabelText(/under 18/i));
      await user.click(screen.getByRole("option", { name: "Yes" }));

      expect(screen.queryByText(/parent or guardian/i)).toBeNull();
    });

    // #789's order of accumulation, now two notices and then the one
    // agreement the form actually takes.
    test("sits between the privacy notice and the agreement", () => {
      const { container } = render(
        <EventRegistrationForm
          eventId="event-1"
          photoConsent={SCOPE}
          waiver={{ version: 1, title: "Participant Waiver" }}
          waiverBlock={<p>The agreement itself.</p>}
        />,
      );

      const text = container.textContent ?? "";
      const notice = text.indexOf("We use what you enter here");
      const photos = text.indexOf(PHOTO_CONSENT_HEADING);
      const agreement = text.indexOf("I have read and accept");

      expect(notice).toBeGreaterThanOrEqual(0);
      expect(photos).toBeGreaterThan(notice);
      expect(agreement).toBeGreaterThan(photos);
    });
  });
});

// #1415. The riding questions are step 2 where the tenant has the module, and
// the follow-up after the confirmation is gone.
describe("EventRegistrationForm and the riding questions", () => {
  const RIDER_PROFILE = { mountains: ["Whistler", "Mount Hood"] };

  beforeEach(() => {
    registerForEventActionMock.mockClear();
  });

  test("a tenant without the module is asked nothing about riding", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await fillAboutYou(user);
    await toThisEvent(user);
    expect(screen.getByRole("group", { name: /This event/ })).toBeVisible();
    expect(
      screen.queryByText(/Do you ski or snowboard/),
    ).not.toBeInTheDocument();

    await sayNoMinors(user);
    await submit(user);
    expect(lastSubmission()).not.toHaveProperty("ridingAsked");
    expect(await screen.findByText(/You're registered/)).toBeVisible();
    expect(
      screen.queryByText(/Do you ski or snowboard/),
    ).not.toBeInTheDocument();
  });

  test('step 2 is "Your riding", and the discipline is required', async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm eventId="event-1" riderProfile={RIDER_PROFILE} />,
    );

    await fillAboutYou(user);
    await toThisEvent(user);
    expect(screen.getByRole("group", { name: /Your riding/ })).toBeVisible();

    await sayNoMinors(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    // Unanswered, so Next stays on the step.
    expect(screen.getByRole("group", { name: /Your riding/ })).toBeVisible();
    expect(registerForEventActionMock).not.toHaveBeenCalled();
  });

  test("posts the answers, shows them on review, and asks nothing after", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm eventId="event-1" riderProfile={RIDER_PROFILE} />,
    );

    await fillAboutYou(user);
    await sayNoMinors(user);
    await user.click(
      screen.getByRole("combobox", { name: /ski or snowboard/ }),
    );
    await user.click(screen.getByRole("option", { name: "Skis" }));
    await user.click(
      screen.getByRole("combobox", { name: /Experience on skis/ }),
    );
    await user.click(screen.getByRole("option", { name: "Advanced" }));
    await user.click(screen.getByRole("combobox", { name: /mountain/ }));
    await user.click(screen.getByRole("option", { name: "Mount Hood" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    const review = screen.getByRole("group", { name: /Review and agree/ });
    expect(review).toHaveTextContent("Skis or snowboard");
    expect(review).toHaveTextContent("Mount Hood");
    expect(
      screen.getByRole("button", { name: "Edit your riding" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );
    expect(lastSubmission()).toMatchObject({
      ridingAsked: "on",
      ridingDiscipline: "ski",
      skiExperienceLevel: "advanced",
      preferredMountain: "Mount Hood",
    });
    expect(await screen.findByText(/You're registered/)).toBeVisible();
    expect(screen.queryByText("One more thing")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Do you ski or snowboard/),
    ).not.toBeInTheDocument();
  });
});

describe("EventRegistrationForm on an adults-only event (#1417)", () => {
  beforeEach(() => registerForEventActionMock.mockClear());

  const confirmation = () =>
    screen.queryByRole("checkbox", {
      name: /Everyone in my party is 18 or over/,
    });

  test("any other event asks nothing about it", async () => {
    render(<EventRegistrationForm eventId="event-1" />);
    await fillAboutYou();
    await toThisEvent();
    expect(confirmation()).toBeNull();
  });

  test("step 2 asks for the confirmation, unticked, and not the minors question", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        adultsOnly
        asksAboutMinors={false}
      />,
    );
    await fillAboutYou(user);
    await toThisEvent(user);

    expect(confirmation()).not.toBeChecked();
    expect(screen.queryByLabelText(/under 18\?/i)).toBeNull();

    // Required: Next stays on step 2 until it is ticked.
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(confirmation()).toBeVisible();
  });

  test("posts the confirmation and shows it on review", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        adultsOnly
        asksAboutMinors={false}
      />,
    );
    await fillAboutYou(user);
    await toThisEvent(user);
    await user.click(confirmation()!);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(
      screen.getByText("Everyone in my party is 18 or over", {
        selector: "dd",
      }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );
    expect(lastSubmission().adultsOnlyConfirmed).toBe("on");
  });
});

describe("EventRegistrationForm and the event's questions (#1501)", () => {
  beforeEach(() => {
    registerForEventActionMock.mockClear();
  });

  const questions: RegistrationQuestion[] = [
    {
      id: "getting",
      kind: "single_choice",
      prompt: "Getting there",
      help: null,
      required: true,
      options: [
        { id: "drive", label: "Driving, can offer seats" },
        { id: "own", label: "Making my own way" },
      ],
      min_value: null,
      max_value: null,
      show_if: null,
    },
    {
      id: "seats",
      kind: "number",
      prompt: "Seats available",
      help: null,
      required: true,
      options: [],
      min_value: 1,
      max_value: 7,
      show_if: { any: [{ question_id: "getting", option_ids: ["drive"] }] },
    },
    {
      id: "share",
      kind: "consent",
      prompt: "OK to share my contact details",
      help: null,
      required: false,
      options: [],
      min_value: null,
      max_value: null,
      show_if: null,
    },
  ];

  test("an event without questions posts no answers field", async () => {
    render(<EventRegistrationForm eventId="event-1" />);
    await fillAboutYou();
    await sayNoMinors();
    await submit();
    expect(lastSubmission().registrationAnswers).toBeUndefined();
  });

  test("a required question stops the submission on this step", async () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        registrationQuestions={questions}
      />,
    );
    await fillAboutYou();
    await sayNoMinors();
    // The step's own `required` holds the reader on it.
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("group", { name: /This event/ })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Complete registration" }),
    ).toBeNull();
    expect(registerForEventActionMock).not.toHaveBeenCalled();
  });

  test("a condition reveals its question, and the answers post as JSON", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        registrationQuestions={questions}
      />,
    );
    await fillAboutYou(user);
    await sayNoMinors(user);
    expect(screen.queryByLabelText(/Seats available/)).toBeNull();

    await user.click(screen.getByLabelText(/Getting there/));
    await user.click(
      screen.getByRole("option", { name: "Driving, can offer seats" }),
    );
    await user.type(screen.getByLabelText(/Seats available/), "3");
    await submit(user);

    expect(JSON.parse(lastSubmission().registrationAnswers)).toEqual({
      getting: "drive",
      seats: 3,
      // Unticked is an answer: "no".
      share: false,
    });
  });
});

describe("EventRegistrationForm and the Instagram requirement (#1647)", () => {
  beforeEach(() => registerForEventActionMock.mockClear());

  const noInstagram = () =>
    screen.queryByRole("checkbox", { name: "I don't have Instagram" });

  test("a tenant that does not require it shows the optional handle and nothing else", async () => {
    render(<EventRegistrationForm eventId="event-1" />);
    expect(screen.getByLabelText(/^Instagram handle/)).not.toBeRequired();
    expect(noInstagram()).toBeNull();

    await fillAboutYou();
    await sayNoMinors();
    await submit();
    const sent = lastSubmission();
    expect(sent.instagramRequired).toBeUndefined();
    expect(sent.noInstagram).toBeUndefined();
  });

  test("required, the handle stops Next until it is given", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" requiresInstagram />);
    expect(screen.getByLabelText(/^Instagram handle/)).toBeRequired();
    await fillAboutYou(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText(/^Instagram handle/)).toBeVisible();
  });

  test("ticking the box swaps the handle for a preferred contact, posted and shown on review", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" requiresInstagram />);
    await fillAboutYou(user);
    await user.type(screen.getByLabelText(/^Instagram handle/), "typed.first");
    await user.click(noInstagram()!);
    expect(screen.queryByLabelText(/^Instagram handle/)).toBeNull();

    await user.click(screen.getByLabelText(/Preferred contact method/));
    await user.click(screen.getByRole("option", { name: "Text message" }));
    await user.type(screen.getByLabelText(/^Phone number/), "555-0142");
    await sayNoMinors(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Text message · 555-0142")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    const sent = lastSubmission();
    expect(sent).toMatchObject({
      instagramRequired: "on",
      noInstagram: "on",
      preferredContactMethod: "text",
      preferredContactDetail: "555-0142",
    });
    expect(sent.instagramHandle).toBeUndefined();
  });

  test("email may leave the address blank", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" requiresInstagram />);
    await fillAboutYou(user);
    await user.click(noInstagram()!);
    await user.click(screen.getByLabelText(/Preferred contact method/));
    await user.click(screen.getByRole("option", { name: "Email" }));
    expect(screen.getByLabelText(/^Email address/)).not.toBeRequired();
    await sayNoMinors(user);
    await submit(user);
    expect(lastSubmission()).toMatchObject({
      noInstagram: "on",
      preferredContactMethod: "email",
      preferredContactDetail: "",
    });
  });
});

// #1650. Notice, on step 2 under the event's questions and again on the review
// step -- never a box, and nothing posted about it.
describe("EventRegistrationForm on a carpool event (#1650)", () => {
  const NOTICE = ["Costs are split in the car and settled with the driver."];

  beforeEach(() => {
    registerForEventActionMock.mockClear();
  });

  test("tells them on This event and again on review, with no box", async () => {
    render(
      <EventRegistrationForm eventId="event-1" carpoolCostNotice={NOTICE} />,
    );
    await fillAboutYou();
    await sayNoMinors();

    expect(
      screen.getByRole("heading", { name: CARPOOL_COST_NOTICE_HEADING }),
    ).toBeVisible();
    // Step 2's copy, and the review step's (hidden until reached).
    expect(screen.getAllByText(NOTICE[0], { exact: true })).toHaveLength(2);
    expect(screen.queryAllByRole("checkbox", { hidden: true })).toHaveLength(0);

    await submit();
    for (const key of Object.keys(lastSubmission())) {
      expect(key).not.toMatch(/carpool/i);
    }
  });

  test("says nothing about carpools without a notice", async () => {
    render(<EventRegistrationForm eventId="event-1" />);
    expect(
      screen.queryByRole("heading", {
        name: CARPOOL_COST_NOTICE_HEADING,
        hidden: true,
      }),
    ).toBeNull();
  });
});
