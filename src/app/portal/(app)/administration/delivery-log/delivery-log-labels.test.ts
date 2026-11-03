// The delivery log renders `notification_deliveries.kind` as a label, and the
// column is free text -- a sender can introduce a kind without a migration and
// without touching this route. This file is the thing that notices: it imports
// the kind constant of every sender that calls deliverEmail() and asserts each
// one reaches a written label rather than the humanized fallback.
//
// Three of those senders import "server-only", which throws outside Next's
// bundler, so it is mocked here. That is the whole reason
// delivery-log-labels.ts writes its nine unregistered keys as literals
// instead of importing them: the cost is paid once, in this file, rather than
// on the path of every module that parses a URL.
import { describe, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));

import {
  ARTWORK_SUBMISSION_CONFIRMATION_KIND,
  CONTACT_MESSAGE_CONFIRMATION_KIND,
  NOTIFICATION_KINDS,
} from "@/lib/notifications/kinds";
import { AUTO_REPLIES } from "@/lib/notifications/auto-replies";
import {
  anonymousRecipientLabel,
  deliveryKindLabel,
  DELIVERY_KIND_VALUES,
} from "./delivery-log-labels";

const { STAFF_MESSAGE_KIND } = await import("@/lib/outbound-messages");
const { OPS_REPORT_KIND } = await import("@/lib/notifications/ops-report");
const { AUTO_REPLY_TEST_KIND } =
  await import("@/lib/notifications/auto-reply-test-send");
const { EMAIL_CHANGE_CONFIRMATION_KIND, EMAIL_CHANGED_KIND } =
  await import("@/lib/notifications/email-change-notifications");
const {
  NOTIFICATION_EMAIL_CONFIRMATION_KIND,
  NOTIFICATION_EMAIL_CHANGED_KIND,
} = await import("@/lib/notifications/notification-email-confirmation");
const { EVENT_ACCESS_GRANTED_KIND } =
  await import("@/lib/notifications/event-access-notification");
const { SIGN_IN_CODE_KIND } = await import("@/lib/notifications/sign-in-code");

/** Every kind any sender passes to deliverEmail(), from its own module. */
const KINDS_SENDERS_WRITE = [
  ...NOTIFICATION_KINDS.map((kind) => kind.key),
  STAFF_MESSAGE_KIND,
  OPS_REPORT_KIND,
  AUTO_REPLY_TEST_KIND,
  EMAIL_CHANGE_CONFIRMATION_KIND,
  EMAIL_CHANGED_KIND,
  NOTIFICATION_EMAIL_CONFIRMATION_KIND,
  NOTIFICATION_EMAIL_CHANGED_KIND,
  EVENT_ACCESS_GRANTED_KIND,
  SIGN_IN_CODE_KIND,
];

describe("deliveryKindLabel", () => {
  test("labels every kind a sender can write, in words and not snake_case", () => {
    for (const kind of KINDS_SENDERS_WRITE) {
      const label = deliveryKindLabel(kind);
      expect({ kind, label }).toEqual({ kind, label: expect.any(String) });
      expect(label).not.toContain("_");
      expect(label.length).toBeGreaterThan(0);
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });

  // The assertion that actually catches drift. A kind absent from this list
  // is a kind the filter cannot offer and that only reaches a label through
  // the humanize() fallback -- which sometimes happens to read correctly
  // ("gear request confirmation"), so the label alone cannot be trusted to
  // report the gap.
  test("offers every one of those kinds as a filter", () => {
    for (const kind of KINDS_SENDERS_WRITE) {
      expect({ kind, offered: DELIVERY_KIND_VALUES.includes(kind) }).toEqual({
        kind,
        offered: true,
      });
    }
  });

  // The two registries disagree about one thing and it matters here: a
  // preference switch is named in the plural ("Artwork submission receipts")
  // and a log row is one message. The auto-reply registry wins where both
  // hold the kind.
  test("prefers the auto-reply registry's singular name", () => {
    for (const reply of AUTO_REPLIES) {
      expect(deliveryKindLabel(reply.kind)).toBe(reply.label);
    }
  });

  test("humanizes a kind from a newer deploy rather than showing the key", () => {
    expect(deliveryKindLabel("grant_report_reminder")).toBe(
      "Grant report reminder",
    );
  });
});

describe("anonymousRecipientLabel", () => {
  // #1310's acceptance criterion: a null person_id must never render blank.
  test("names the audience of each kind that sends with no directory row", () => {
    expect(anonymousRecipientLabel(OPS_REPORT_KIND)).toBe(
      "The organization's ops report inbox",
    );
    expect(anonymousRecipientLabel(CONTACT_MESSAGE_CONFIRMATION_KIND)).toBe(
      "The person who wrote in",
    );
    expect(anonymousRecipientLabel(ARTWORK_SUBMISSION_CONFIRMATION_KIND)).toBe(
      "The person who submitted artwork",
    );
  });

  test("still says something for a kind it has never seen", () => {
    expect(anonymousRecipientLabel("grant_report_reminder")).toBe(
      "Someone outside the directory",
    );
  });
});
