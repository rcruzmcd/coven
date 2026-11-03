import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRow } from "./event-badges";
import * as EventsActions from "./actions";

type ActionResult = { error: string } | { success: true };
const actionMock = () =>
  mock<(id: string, formData: FormData) => Promise<ActionResult>>(async () => ({
    success: true,
  }));

const carpoolMock = actionMock();

mock.module("./actions", () => ({
  ...EventsActions,
  updateEventCarpoolSettingsAction: carpoolMock,
}));

const { CarpoolSettingsDialog } = await import("./carpool-settings-dialog");
function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "event-1",
    name: "Winter Gear Swap",
    location: "HQ",
    starts_at: "2026-09-01T14:00:00.000Z",
    ends_at: "2026-09-01T18:00:00.000Z",
    timezone: "America/New_York",
    visibility: "public",
    status: "published",
    attendance_count: null,
    attendance_notes: null,
    description: null,
    capacity: null,
    registration_enabled: true,
    registration_deadline: null,
    auto_assign_discount_codes: false,
    budget_amount: null,
    event_lead_id: null,
    event_lead: null,
    report_status: "not_started",
    report_summary: null,
    feedback_notes: null,
    content_notes: null,
    report_submitted_at: null,
    report_submitted_by: null,
    program_ids: [],
    flier_url: null,
    ...overrides,
  };
}

const submittedKeys = (fn: ReturnType<typeof actionMock>) =>
  [...fn.mock.calls[0][1].keys()].sort();

beforeEach(() => {
  carpoolMock.mockClear();
});

describe("CarpoolSettingsDialog (#1780)", () => {
  const question = (
    id: string,
    kind: string,
    archived_at: string | null = null,
  ) => ({ id, kind, prompt: `Question ${id}`, archived_at });

  test("offers only saved, unarchived number questions for seats", async () => {
    const user = userEvent.setup();
    render(
      <CarpoolSettingsDialog
        event={makeEvent({
          carpools_enabled: true,
          registration_questions: [
            question("a", "number"),
            question("b", "text"),
            question("c", "number", "2026-01-01T00:00:00Z"),
          ] as unknown as EventRow["registration_questions"],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Carpool settings" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText("Seats come from"));
    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Typed for each car", "Question a"]);
  });

  test("saves the seats question and notice, and nothing else", async () => {
    const user = userEvent.setup();
    render(<CarpoolSettingsDialog event={makeEvent()} />);

    await user.click(screen.getByRole("button", { name: "Carpool settings" }));
    const dialog = await screen.findByRole("dialog");
    // No number question, so no seats choice to offer.
    expect(within(dialog).queryByLabelText("Seats come from")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(carpoolMock).toHaveBeenCalledTimes(1));
    expect(submittedKeys(carpoolMock)).toEqual([
      "carpoolNoticeMode",
      "carpoolNoticeText",
      "carpoolSeatsQuestionId",
    ]);
    expect(carpoolMock.mock.calls[0][1].get("carpoolNoticeMode")).toBe(
      "organization",
    );
  });
});
