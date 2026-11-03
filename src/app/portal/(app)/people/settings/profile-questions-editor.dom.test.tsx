import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { useEffect, useReducer } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ProfileQuestionsActions from "./actions";
import type { PersonQuestion } from "@/lib/person-questions";

const refreshMock = mock(() => {});

/**
 * The URL, for real: the tab and the selected question live in `?tab=` and
 * `?question=`, written with `history.pushState` and read back through
 * `useSearchParams` -- the auto-reply editor's test does the same.
 */
let params = new URLSearchParams();
const listeners = new Set<() => void>();

function useSearchParamsMock() {
  const [, bump] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);
  return params;
}

const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  usePathname: () => "/portal/people/settings",
  useSearchParams: useSearchParamsMock,
  useRouter: () => ({ refresh: refreshMock }),
}));

const saveMock = mock<(questions: unknown) => Promise<{ success: true }>>(
  async () => ({ success: true }),
);
mock.module("./actions", () => ({
  ...ProfileQuestionsActions,
  savePersonQuestionsAction: saveMock,
}));

const { ProfileQuestionsEditor } = await import("./profile-questions-editor");

function question(overrides: Partial<PersonQuestion> & { id: string }) {
  return {
    kind: "short_text",
    prompt: "Home mountain",
    help: null,
    column_label: null,
    required: false,
    options: [],
    min_value: null,
    max_value: null,
    show_if: null,
    place: null,
    allow_other: false,
    key: null,
    ask_after_registration: true,
    ask_on_my_details: true,
    snapshot_at_checkin: false,
    program_ids: [],
    archived_at: null,
    ...overrides,
  } satisfies PersonQuestion;
}

const programs = [
  { id: "program-snow", name: "Snow days" },
  { id: "program-yoga", name: "Yoga" },
];

const realPushState = window.history.pushState.bind(window.history);

beforeEach(() => {
  saveMock.mockClear();
  refreshMock.mockClear();
  window.history.pushState = ((_state, _title, url) => {
    params = new URLSearchParams(String(url).split("?")[1] ?? "");
    for (const listener of listeners) listener();
  }) as typeof window.history.pushState;
});

afterEach(() => {
  window.history.pushState = realPushState;
  params = new URLSearchParams();
});

/** The Data group starts closed. */
async function openData(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Data" }));
}

describe("ProfileQuestionsEditor", () => {
  test("says nothing is asked until a question is added", () => {
    render(
      <ProfileQuestionsEditor
        questions={[]}
        archived={[]}
        programs={programs}
        usage={{}}
      />,
    );
    expect(
      screen.getByText(/Until you add one, nobody is asked anything/),
    ).toBeInTheDocument();
    // Nothing to save, so no save bar.
    expect(
      screen.queryByRole("button", { name: "Save questions" }),
    ).not.toBeInTheDocument();
  });

  test("offers no consent kind and saves a person question's own fields", async () => {
    const user = userEvent.setup();
    render(
      <ProfileQuestionsEditor
        questions={[question({ id: "q-mountain" })]}
        archived={[]}
        programs={programs}
        usage={{}}
      />,
    );

    await user.click(screen.getByLabelText("Answer type"));
    expect(
      screen.queryByRole("option", { name: "Consent checkbox" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await openData(user);
    await user.type(screen.getByLabelText("Code"), "home_mountain");
    await user.click(screen.getByRole("checkbox", { name: "Snow days" }));
    await user.click(
      screen.getByRole("switch", { name: /Ask on their details page/ }),
    );
    await user.click(screen.getByRole("button", { name: "Save questions" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const [payload] = saveMock.mock.calls[0] as [Record<string, unknown>[]];
    expect(payload[0]).toMatchObject({
      id: "q-mountain",
      kind: "short_text",
      prompt: "Home mountain",
      key: "home_mountain",
      program_ids: ["program-snow"],
      ask_after_registration: true,
      ask_on_my_details: false,
    });
    expect(payload[0]).not.toHaveProperty("shares_contact");
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("refuses a malformed code before the round trip", async () => {
    const user = userEvent.setup();
    render(
      <ProfileQuestionsEditor
        questions={[question({ id: "q-mountain" })]}
        archived={[]}
        programs={[]}
        usage={{}}
      />,
    );
    await openData(user);
    await user.type(screen.getByLabelText("Code"), "Home Mountain");
    await user.click(screen.getByRole("button", { name: "Save questions" }));
    expect(
      await screen.findByText(/A question code is lower-case letters/),
    ).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });

  test("says how many answered, and restores an archived question", async () => {
    const user = userEvent.setup();
    render(
      <ProfileQuestionsEditor
        questions={[question({ id: "q-mountain" })]}
        archived={[
          question({
            id: "q-old",
            prompt: "Old question",
            archived_at: "2026-10-01T00:00:00Z",
          }),
        ]}
        programs={[]}
        usage={{ "q-mountain": 3, "q-old": 1 }}
      />,
    );
    expect(screen.getByText(/Answered by 3 people/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Archived (1)" }));
    expect(params.get("tab")).toBe("archived");
    expect(screen.getByText(/answered by 1 person/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.queryByText("Archived questions")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save questions" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const [payload] = saveMock.mock.calls[0] as [{ id: string }[]];
    expect(payload.map((q) => q.id)).toEqual(["q-mountain", "q-old"]);
  });

  test("lists every question's type, required flag and where it's asked", () => {
    render(
      <ProfileQuestionsEditor
        questions={[
          question({ id: "q-mountain", required: true }),
          question({
            id: "q-level",
            prompt: "Ski level",
            kind: "number",
            ask_after_registration: false,
            snapshot_at_checkin: true,
          }),
        ]}
        archived={[]}
        programs={[]}
        usage={{ "q-level": 2 }}
      />,
    );
    const rows = within(screen.getByRole("list", { name: "Questions" }))
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(rows[0]).toContain("Home mountain");
    expect(rows[0]).toContain("Required");
    expect(rows[0]).toContain("Registration");
    expect(rows[0]).toContain("My details");
    expect(rows[1]).toContain("Ski level");
    expect(rows[1]).not.toContain("Required");
    expect(rows[1]).not.toContain("Registration");
    expect(rows[1]).toContain("Check-in snapshot");
    expect(rows[1]).toContain("answered by 2 people");
    // One editor, for the first question.
    expect(screen.getAllByLabelText(/^Prompt/)).toHaveLength(1);
  });

  test("selects from the keyboard, keeps it in the URL and focuses the editor", async () => {
    const user = userEvent.setup();
    render(
      <ProfileQuestionsEditor
        questions={[
          question({ id: "q-mountain" }),
          question({ id: "q-level", prompt: "Ski level" }),
        ]}
        archived={[]}
        programs={[]}
        usage={{}}
      />,
    );
    expect(screen.getByLabelText(/^Prompt/)).toHaveValue("Home mountain");

    screen.getByRole("button", { name: /Ski level/ }).focus();
    await user.keyboard("{Enter}");
    expect(params.get("question")).toBe("q-level");
    expect(screen.getByLabelText(/^Prompt/)).toHaveValue("Ski level");
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Question 2 editor" }),
      ).toHaveFocus(),
    );
  });

  test("reorders with Alt+Arrow and saves the new order", async () => {
    const user = userEvent.setup();
    render(
      <ProfileQuestionsEditor
        questions={[
          question({ id: "q-mountain" }),
          question({ id: "q-level", prompt: "Ski level" }),
        ]}
        archived={[]}
        programs={[]}
        usage={{}}
      />,
    );
    screen.getByRole("button", { name: /Home mountain/ }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(screen.getByText("1 unsaved change to the questions")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Save questions" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const [payload] = saveMock.mock.calls[0] as [{ id: string }[]];
    expect(payload.map((q) => q.id)).toEqual(["q-level", "q-mountain"]);
    // Saved, so the bar goes.
    await waitFor(() =>
      expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument(),
    );
  });

  test("counts unsaved changes, warns before leaving and discards", async () => {
    const user = userEvent.setup();
    render(
      <ProfileQuestionsEditor
        questions={[question({ id: "q-mountain" })]}
        archived={[]}
        programs={[]}
        usage={{}}
      />,
    );
    await user.type(screen.getByLabelText(/^Prompt/), "?");
    await user.click(screen.getByRole("button", { name: "Add question" }));
    expect(
      screen.getByText("2 unsaved changes to the questions"),
    ).toBeVisible();

    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Questions" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);
    expect(screen.getByLabelText(/^Prompt/)).toHaveValue("Home mountain");
  });
});
