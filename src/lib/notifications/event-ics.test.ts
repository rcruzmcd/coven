import { describe, expect, test } from "bun:test";
import { renderEventIcs, type CalendarEvent } from "./event-ics";

const NOW = new Date("2026-03-01T12:30:00.000Z");

const base: CalendarEvent = {
  uid: "event-abc123@chattersnow.example",
  summary: "Pride Ride Day",
  startsAt: "2026-03-15T01:00:00.000Z",
  endsAt: null,
  location: "Hunter Mountain",
  url: "https://chattersnow.example/events/e/abc123",
};

/** The unfolded lines, which is what every assertion below is really about. */
function lines(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

describe("renderEventIcs", () => {
  test("wraps one published event, stamped from the clock it is given", () => {
    const ics = renderEventIcs(base, NOW);

    expect(lines(ics)).toContain("BEGIN:VCALENDAR");
    expect(lines(ics)).toContain("VERSION:2.0");
    expect(lines(ics)).toContain("METHOD:PUBLISH");
    expect(lines(ics)).toContain("BEGIN:VEVENT");
    expect(lines(ics)).toContain("UID:event-abc123@chattersnow.example");
    expect(lines(ics)).toContain("SUMMARY:Pride Ride Day");
    expect(lines(ics)).toContain("LOCATION:Hunter Mountain");
    expect(lines(ics)).toContain("END:VEVENT");
    expect(lines(ics)).toContain("END:VCALENDAR");

    // The clock is injected so this is an assertion rather than a coin toss.
    expect(lines(ics)).toContain("DTSTAMP:20260301T123000Z");
  });

  test("is a published event, not an invitation with an RSVP", () => {
    const ics = renderEventIcs(base, NOW);
    // A METHOD:REQUEST with these would put Accept/Decline in front of the
    // recipient, and nothing in this application reads the answer.
    expect(ics).not.toContain("METHOD:REQUEST");
    expect(ics).not.toContain("ORGANIZER");
    expect(ics).not.toContain("ATTENDEE");
  });

  test("stamps times in UTC, whatever zone the process is in", () => {
    const ics = renderEventIcs(
      { ...base, endsAt: "2026-03-15T04:30:00.000Z" },
      NOW,
    );
    expect(lines(ics)).toContain("DTSTART:20260315T010000Z");
    expect(lines(ics)).toContain("DTEND:20260315T043000Z");
  });

  test("carries no end at all for an event that has none", () => {
    // Not a guessed duration: a default would be data nobody entered.
    expect(renderEventIcs(base, NOW)).not.toContain("DTEND");
  });

  test("leaves out a place the event does not have", () => {
    expect(renderEventIcs({ ...base, location: null }, NOW)).not.toContain(
      "LOCATION",
    );
    expect(renderEventIcs({ ...base, location: "   " }, NOW)).not.toContain(
      "LOCATION",
    );
  });

  test("escapes the characters that would otherwise split a property", () => {
    const ics = renderEventIcs(
      {
        ...base,
        summary: "Ski, ride; repeat",
        location: "Base lodge\nSecond floor",
      },
      NOW,
    );
    expect(lines(ics)).toContain("SUMMARY:Ski\\, ride\\; repeat");
    expect(lines(ics)).toContain("LOCATION:Base lodge\\nSecond floor");
  });

  test("escapes a backslash once, not twice over", () => {
    const ics = renderEventIcs({ ...base, summary: "A\\B" }, NOW);
    expect(lines(ics)).toContain("SUMMARY:A\\\\B");
  });

  test("ends every line with CRLF, including the last", () => {
    const ics = renderEventIcs(base, NOW);
    expect(ics.endsWith("\r\n")).toBe(true);
    // A stray bare LF is what Outlook refuses, and it would not show up on the
    // clients this is most likely to be read on.
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  test("folds a long line at 75 octets, continuing with a space", () => {
    const ics = renderEventIcs({ ...base, summary: "Snow ".repeat(40) }, NOW);

    for (const line of ics.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain("\r\n ");
    // Unfolding puts it back exactly, which is the only thing folding may do.
    expect(lines(ics)).toContain(`SUMMARY:${"Snow ".repeat(40)}`);
  });

  test("never splits a multi-byte character across a fold", () => {
    const ics = renderEventIcs({ ...base, summary: "❄️".repeat(40) }, NOW);
    expect(ics).not.toContain("�");
    expect(lines(ics)).toContain(`SUMMARY:${"❄️".repeat(40)}`);
  });

  test("describes the event with its own page when nothing else is given", () => {
    const ics = renderEventIcs(base, NOW);
    expect(lines(ics)).toContain(`URL:${base.url}`);
    expect(lines(ics)).toContain(`DESCRIPTION:${base.url}`);
  });

  test("writes a Markdown description as plain text (#1873)", () => {
    const ics = renderEventIcs(
      { ...base, description: "**Bring** water\n\n- helmet\n- gloves" },
      NOW,
    );

    const description = lines(ics).find((line) =>
      line.startsWith("DESCRIPTION:"),
    );
    expect(description).toBe(
      "DESCRIPTION:Bring water\\n\\n- helmet\\n- gloves",
    );
    expect(description).not.toContain("**");
  });
});
