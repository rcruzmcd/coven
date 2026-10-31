import { afterEach, describe, expect, test } from "bun:test";
import { setFormCapture, trackForm } from "@/lib/analytics/form-events";

function recorder() {
  const calls: [string, Record<string, string>][] = [];
  setFormCapture((event, properties) => {
    calls.push([event, properties]);
  });
  return calls;
}

afterEach(() => setFormCapture(null));

describe("trackForm", () => {
  test("does nothing until a capture is set", () => {
    expect(() =>
      trackForm("event_registration", "form_viewed", { event_id: "e1" }),
    ).not.toThrow();
  });

  // #1707: what each event sends, exactly -- `event_id` because the
  // allowlist names it for this form, and nothing else.
  test("each event sends exactly its allowlisted properties", () => {
    const calls = recorder();
    const context = { event_id: "e1" };
    trackForm("event_registration", "form_viewed", context);
    trackForm("event_registration", "form_started", context);
    trackForm("event_registration", "form_step_viewed", {
      ...context,
      step: "event",
    });
    trackForm("event_registration", "form_submitted", context);
    trackForm("event_registration", "form_completed", context);
    trackForm("event_registration", "form_failed", {
      ...context,
      step: "review",
      error_code: "EVENT_AT_CAPACITY",
    });
    const base = { form: "event_registration", event_id: "e1" };
    expect(calls).toEqual([
      ["form_viewed", base],
      ["form_started", base],
      ["form_step_viewed", { ...base, step: "event" }],
      ["form_submitted", base],
      ["form_completed", base],
      [
        "form_failed",
        { ...base, step: "review", error_code: "EVENT_AT_CAPACITY" },
      ],
    ]);
  });

  test("drops anything outside the allowlist that gets past the types", () => {
    const calls = recorder();
    const sneaky = { event_id: "e1", email: "someone@example.org" };
    trackForm("event_registration", "form_completed", sneaky);
    expect(calls).toEqual([
      ["form_completed", { form: "event_registration", event_id: "e1" }],
    ]);
  });

  test("an unknown form or event is not sent at all", () => {
    const calls = recorder();
    const untyped = trackForm as (
      form: string,
      event: string,
      properties: Record<string, string>,
    ) => void;
    untyped("contact", "form_viewed", { event_id: "e1" });
    untyped("event_registration", "form_abandoned", { event_id: "e1" });
    expect(calls).toEqual([]);
  });

  test("an unknown property, step, form or event is a type error", () => {
    recorder();
    trackForm("event_registration", "form_viewed", {
      event_id: "e1",
      // @ts-expect-error -- not on the allowlist
      name: "Someone",
    });
    trackForm("event_registration", "form_step_viewed", {
      event_id: "e1",
      // @ts-expect-error -- not a registration step
      step: "payment",
    });
    // @ts-expect-error -- the form's context is required
    trackForm("event_registration", "form_viewed", {});
    // @ts-expect-error -- not a known form
    trackForm("contact", "form_viewed", { event_id: "e1" });
    // @ts-expect-error -- not a form event
    trackForm("event_registration", "form_abandoned", { event_id: "e1" });
  });
});
