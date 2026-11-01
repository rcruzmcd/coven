// #1714: a public page-not-found is counted by its first path segment, never
// the rest of an address that may hold a token or a code.
import { afterEach, describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { setFormCapture } from "@/lib/analytics/form-events";
import { NotFoundEvent } from "./not-found-event";

/** happy-dom's own hook for the page address; not on the DOM's `Window`. */
function setURL(url: string) {
  (
    window as unknown as { happyDOM: { setURL(url: string): void } }
  ).happyDOM.setURL(url);
}

afterEach(() => {
  setFormCapture(null);
  setURL("about:blank");
});

describe("NotFoundEvent", () => {
  test("sends the route name alone", () => {
    const calls: [string, Record<string, string>][] = [];
    setFormCapture((event, properties) => {
      calls.push([event, properties]);
    });
    setURL("https://www.example.org/artwork/AB12CD34?t=secret");
    render(<NotFoundEvent />);
    expect(calls).toEqual([["not_found", { path: "/artwork" }]]);
  });
});
