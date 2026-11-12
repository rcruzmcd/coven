import { describe, expect, test } from "bun:test";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";
import {
  renderUploadLinkEmail,
  type UploadLinkMessage,
} from "./upload-link-email";

const BASE: UploadLinkMessage = {
  orgName: "Chatter Snow",
  eventName: "Learn to Ride Day",
  label: "Sam — photographer",
  expiresAt: "2026-03-21T05:59:59.000Z",
  timeZone: "America/Denver",
  url: "https://portal.example.test/portal/media-upload/abc",
  siteUrl: "https://example.test",
};

describe("renderUploadLinkEmail", () => {
  test("names the event, who it is for, the expiry and the link", () => {
    const email = renderUploadLinkEmail(BASE);
    expect(email.subject).toBe(
      "Upload your photos and videos from Learn to Ride Day for Chatter Snow",
    );
    expect(email.text).toContain(
      "Chatter Snow sent you a link to upload photos and videos from Learn to Ride Day.",
    );
    expect(email.text).toContain("It was made for Sam — photographer.");
    expect(email.text).toContain(`Upload photos and videos: ${BASE.url}`);
    // The date-to-time joiner is ICU's call ("Mar 20, 2026, 11:59 PM MDT" on
    // the CI runner, "… at 11:59 PM MDT" on macOS), so only pin the parts
    // this module decides: the zone's local date and time, with its zone.
    const expires = formatDateTimeInZone(
      BASE.expiresAt,
      BASE.timeZone,
      DATE_TIME_WITH_ZONE,
    );
    expect(expires).toMatch(/^Mar 20, 2026.+11:59 PM MDT$/);
    expect(email.text).toContain(`works until ${expires}.`);
    expect(email.html).toContain(`href="${BASE.url}"`);
  });

  test("escapes the event name and label in HTML", () => {
    const email = renderUploadLinkEmail({
      ...BASE,
      eventName: "<b>Ride</b> & Slide",
      label: "<i>Sam</i>",
    });
    expect(email.html).not.toContain("<b>Ride</b>");
    expect(email.html).not.toContain("<i>Sam</i>");
    expect(email.html).toContain("&lt;b&gt;Ride&lt;/b&gt; &amp; Slide");
  });
});
