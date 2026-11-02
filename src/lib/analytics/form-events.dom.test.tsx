import { afterEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "@/components/ui/checkbox";
import { setFormCapture, useFormStarted } from "@/lib/analytics/form-events";

function recorder() {
  const calls: string[] = [];
  setFormCapture((event) => {
    calls.push(event);
  });
  return calls;
}

afterEach(() => setFormCapture(null));

function Form() {
  const startTracking = useFormStarted("event_registration", {
    event_id: "e1",
  });
  return (
    <form {...startTracking}>
      <label>
        Name <input name="name" />
      </label>
      <label>
        Agree <Checkbox name="agree" />
      </label>
      <button type="button">Help</button>
    </form>
  );
}

describe("useFormStarted", () => {
  test("sends form_started once, on the first keystroke", async () => {
    const calls = recorder();
    render(<Form />);
    await userEvent.type(screen.getByLabelText("Name"), "Sam");
    expect(calls).toEqual(["form_started"]);
  });

  test("a pick in a drawn control counts as starting", async () => {
    const calls = recorder();
    render(<Form />);
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.type(screen.getByLabelText("Name"), "S");
    expect(calls).toEqual(["form_started"]);
  });

  test("a click on a plain button does not", async () => {
    const calls = recorder();
    render(<Form />);
    await userEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(calls).toEqual([]);
  });
});
