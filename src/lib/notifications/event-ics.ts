/**
 * One event as an iCalendar file, for the registration confirmation to attach
 * (#1068). A registration is a commitment to be somewhere at a time, and the
 * useful thing to do with one is put it on a calendar.
 *
 * A hand-rolled builder rather than a dependency: RFC 5545 is large, but the
 * subset a single published VEVENT needs is small and every part of it is
 * asserted in the test beside this file. What the rest of this module is about
 * is the handful of details that mail clients are unforgiving about.
 *
 * METHOD:PUBLISH, with no ORGANIZER and no ATTENDEE. This is "here is an event
 * you can add", not an invitation: the registration *is* the RSVP, it is
 * already recorded, and a METHOD:REQUEST would put an Accept/Decline prompt in
 * front of the recipient whose answer nothing in this application reads.
 *
 * Times go out in UTC, which is the one place in this codebase that is right
 * rather than the event's own zone (contrast the email body, which reads in
 * `events.timezone` per #1057). A calendar client converts a UTC instant into
 * whatever zone the reader is in, which is what someone travelling to the event
 * actually wants; a zoned or floating time would need a VTIMEZONE block
 * carrying that zone's whole DST history to mean anything.
 */

/** What the file describes. Every text field arrives unescaped. */
export type CalendarEvent = {
  /**
   * Globally unique and *stable*, e.g. `event-<uuid>@example.org`. Keyed on the
   * event rather than on the registration on purpose: a later reminder mail
   * carrying the same uid updates the entry already on someone's calendar
   * instead of adding a second copy of the same event.
   */
  uid: string;
  summary: string;
  startsAt: string;
  /** Omitted from the file when null -- see below. */
  endsAt: string | null;
  location: string | null;
  /** The public event page, as a URL property and in the description. */
  url: string;
  description?: string;
};

export function renderEventIcs(
  event: CalendarEvent,
  now: Date = new Date(),
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    // Identifies the software, not the organization: a tenant name here would
    // make the same event's file differ per tenant for no reader's benefit.
    "PRODID:-//Coven//Coven//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${icsUtc(now.toISOString())}`,
    `DTSTART:${icsUtc(event.startsAt)}`,
    // No DTEND and no DURATION when the organization has not recorded an end.
    // RFC 5545 leaves such an event zero-length, which clients show as a point
    // in time; inventing "probably two hours" would be putting data in
    // somebody's calendar that nobody entered.
    ...(event.endsAt ? [`DTEND:${icsUtc(event.endsAt)}`] : []),
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.location?.trim()
      ? [`LOCATION:${escapeText(event.location.trim())}`]
      : []),
    `DESCRIPTION:${escapeText(event.description?.trim() || event.url)}`,
    `URL:${escapeText(event.url)}`,
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // CRLF, and a trailing one. Outlook rejects a bare-LF file outright, and it
  // is the kind of bug that only shows up on the one client you do not have.
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** An ISO instant as the "20260315T010000Z" form every property above wants. */
function icsUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * RFC 5545 escaping for a TEXT value: backslash first, or it would escape the
 * escapes the later replacements add. Newlines become a literal `\n`, since a
 * real one would end the property and orphan the rest of the value.
 *
 * Event names and locations are typed by staff in the portal, so a comma or a
 * semicolon in one is ordinary rather than hostile -- and either would silently
 * split the value into a list without this.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line to 75 octets, continuations marked by a leading space.
 *
 * Measured in UTF-8 bytes rather than characters, and never split inside one:
 * the limit in the spec is octets, and half of a multi-byte character at a fold
 * boundary is a decoding error rather than a long line.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const pieces: string[] = [];
  let start = 0;
  // 75 for the first piece, 74 for the rest: the leading space a continuation
  // carries counts against its own limit.
  let budget = 75;
  while (start < bytes.length) {
    let end = Math.min(start + budget, bytes.length);
    // Walk back off a continuation byte (10xxxxxx) so a character stays whole.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    pieces.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    budget = 74;
  }
  return pieces.join("\r\n ");
}
