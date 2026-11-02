import { afterEach, describe, expect, test } from "bun:test";
import {
  holdFormEvents,
  linkClickEvent,
  notFoundPath,
  setFormCapture,
  trackForm,
  trackGear,
  trackSite,
} from "@/lib/analytics/form-events";

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
    untyped("newsletter", "form_viewed", { event_id: "e1" });
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
    trackForm("newsletter", "form_viewed", { event_id: "e1" });
    // @ts-expect-error -- not a form event
    trackForm("event_registration", "form_abandoned", { event_id: "e1" });
  });
});

// #1712, #1711: a single-step form carries no context and no step.
describe("single-step forms", () => {
  test("contact sends only its form name, and an error code on failure", () => {
    const calls = recorder();
    trackForm("contact", "form_viewed", {});
    trackForm("contact", "form_submitted", { topic: "gear" });
    trackForm("contact", "form_failed", { error_code: "RATE_LIMITED" });
    expect(calls).toEqual([
      ["form_viewed", { form: "contact" }],
      ["form_submitted", { form: "contact", topic: "gear" }],
      ["form_failed", { form: "contact", error_code: "RATE_LIMITED" }],
    ]);
  });

  test("a gear request's item count rides on form_submitted alone", () => {
    const calls = recorder();
    trackForm("gear_request", "form_submitted", { item_count: "3" });
    const sneaky = { item_count: "3" } as Record<never, never>;
    trackForm("gear_request", "form_completed", sneaky);
    expect(calls).toEqual([
      ["form_submitted", { form: "gear_request", item_count: "3" }],
      ["form_completed", { form: "gear_request" }],
    ]);
  });

  test("a step, or a missing item count, is a type error", () => {
    recorder();
    // @ts-expect-error -- contact has no steps
    trackForm("contact", "form_failed", { step: "event", error_code: "X" });
    // @ts-expect-error -- the item count is required
    trackForm("gear_request", "form_submitted", {});
  });

  // #1713: the /my sign-in says which way was pressed, and only on submit.
  test("a sign-in's method rides on form_submitted alone", () => {
    const calls = recorder();
    trackForm("my_sign_in", "form_submitted", { method: "google" });
    const sneaky = { method: "password", email: "a@b.c" } as Record<
      never,
      never
    >;
    trackForm("my_sign_in", "form_completed", sneaky);
    expect(calls).toEqual([
      ["form_submitted", { form: "my_sign_in", method: "google" }],
      ["form_completed", { form: "my_sign_in" }],
    ]);
  });

  test("an unknown method, or a topic's label, is a type error", () => {
    recorder();
    // @ts-expect-error -- not a sign-in method
    trackForm("my_sign_in", "form_submitted", { method: "magic_link" });
    // @ts-expect-error -- the topic is required on a contact submit
    trackForm("contact", "form_submitted", {});
  });
});

describe("trackGear", () => {
  test("sends a category at most, and nothing outside the allowlist", () => {
    const calls = recorder();
    trackGear("gear_added_to_cart", { category: "skis" });
    trackGear("gear_added_to_cart");
    trackGear("gear_cart_opened");
    const sneaky = { item_id: "i1" } as Record<never, never>;
    trackGear("gear_passphrase_rejected", sneaky);
    expect(calls).toEqual([
      ["gear_added_to_cart", { category: "skis" }],
      ["gear_added_to_cart", {}],
      ["gear_cart_opened", {}],
      ["gear_passphrase_rejected", {}],
    ]);
  });

  test("an unknown property is a type error", () => {
    recorder();
    // @ts-expect-error -- no item names
    trackGear("gear_added_to_cart", { name: "Powder skis" });
  });
});

// An event fired on mount, before posthog-js has loaded, is held and sent
// once it has -- but only while the provider says it is loading.
describe("events sent while PostHog loads", () => {
  test("are held and sent, in order, once it has loaded", () => {
    holdFormEvents();
    trackForm("contact", "form_viewed", {});
    trackSite("not_found", { path: "/events" });
    const calls = recorder();
    expect(calls).toEqual([
      ["form_viewed", { form: "contact" }],
      ["not_found", { path: "/events" }],
    ]);
  });

  test("are dropped when nothing is loading", () => {
    trackForm("contact", "form_viewed", {});
    expect(recorder()).toEqual([]);
  });

  test("are dropped when the provider unmounts first", () => {
    holdFormEvents();
    trackForm("contact", "form_viewed", {});
    setFormCapture(null);
    expect(recorder()).toEqual([]);
  });
});

// #1714: signals beyond forms.
describe("trackSite", () => {
  test("sends only allowlisted properties, link clicks by beacon", () => {
    const sent: unknown[] = [];
    setFormCapture((event, properties, options) => {
      sent.push([event, properties, options?.leaving]);
    });
    trackSite("donate_clicked", { placement: "give_card" });
    const sneaky = { filter: "type", value: "skis" } as {
      filter: "type";
    };
    trackSite("gear_filter_applied", sneaky);
    expect(sent).toEqual([
      ["donate_clicked", { placement: "give_card" }, true],
      ["gear_filter_applied", { filter: "type" }, false],
    ]);
  });

  test("an unknown filter or placement is a type error", () => {
    recorder();
    // @ts-expect-error -- filters are named, never valued
    trackSite("gear_filter_applied", { filter: "skis" });
    // @ts-expect-error -- not a placement
    trackSite("donate_clicked", { placement: "footer" });
  });
});

describe("linkClickEvent", () => {
  const here = "https://www.example.org/support";

  test("the donate redirect, by placement, never its amount", () => {
    expect(
      linkClickEvent("/support/donate?amount=25", "give_card_amount", here),
    ).toEqual({
      event: "donate_clicked",
      properties: { placement: "give_card_amount" },
    });
    expect(linkClickEvent("/support/donate", undefined, here)).toEqual({
      event: "donate_clicked",
      properties: { placement: "other" },
    });
    expect(linkClickEvent("/support/donate", "made-up", here)).toEqual({
      event: "donate_clicked",
      properties: { placement: "other" },
    });
  });

  test("a link to another site is its host alone", () => {
    expect(
      linkClickEvent(
        "https://instagram.com/someone?igsh=abc#top",
        undefined,
        here,
      ),
    ).toEqual({
      event: "outbound_clicked",
      properties: { host: "instagram.com" },
    });
  });

  test("anything else sends nothing", () => {
    expect(linkClickEvent("/events", undefined, here)).toBeNull();
    expect(linkClickEvent("mailto:hi@example.org", undefined, here)).toBeNull();
    expect(linkClickEvent("tel:5550100", undefined, here)).toBeNull();
    expect(linkClickEvent("http://[bad", undefined, here)).toBeNull();
  });
});

describe("notFoundPath", () => {
  test("keeps a route name and drops everything after it", () => {
    expect(notFoundPath("/artwork/AB12CD34")).toBe("/artwork");
    expect(notFoundPath("/acknowledge/tok_123")).toBe("/acknowledge");
    expect(notFoundPath("/get-involved/nope")).toBe("/get-involved");
    expect(notFoundPath("/")).toBe("/");
  });

  test("a first segment that could be a code is not sent", () => {
    expect(notFoundPath("/Xk93jd")).toBe("/:other");
    expect(notFoundPath("/a1b2c3")).toBe("/:other");
    expect(notFoundPath(`/${"a".repeat(41)}`)).toBe("/:other");
  });
});
