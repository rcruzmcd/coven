import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../test/toast-testing";
import { LEGAL_DOCUMENTS, legalDocument } from "@/lib/legal-documents";
import type { LegalDocumentDrift } from "@/lib/legal-surface";
import type { LegalAcknowledgement } from "@/lib/legal-acknowledgement";

const saveMock = mock(async (_key: string, _inForce: boolean) => ({
  success: true as const,
}));
const acknowledgeMock = mock(async (_key: string) => ({
  success: true as const,
}));
const approvalMock = mock(async (_required: boolean) => ({
  success: true as const,
}));

mock.module("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
// Replaced outright rather than spread over the real module: `settings-actions`
// is a "use server" file, and since #1295 it reaches the server Supabase client
// to read this tenant's modules. Importing it to spread it would drag
// `cookies()` into a DOM test.
mock.module("./settings-actions", () => ({
  updateLegalPublicationAction: saveMock,
  acknowledgeLegalDocumentAction: acknowledgeMock,
  updateLegalApprovalAction: approvalMock,
  updatePageVisibilityAction: saveMock,
  updateLayoutSettingAction: saveMock,
}));

const { LegalDocumentsPanel } = await import("./legal-documents-panel");

const TERMS = legalDocument("terms")!;
const HELD = TERMS.gates[0].refuseWithdrawing;
// #600's gate, off and irrelevant, for the suites that are about something
// else. The suite at the bottom is the one that varies it.
const NO_GATE = { required: false, approvers: 3 };

function renderPanel(status: { inForce: boolean; heldInForceBy?: string }) {
  renderWithToaster(
    <LegalDocumentsPanel
      documents={LEGAL_DOCUMENTS}
      statuses={LEGAL_DOCUMENTS.map((document) => ({
        key: document.key,
        inForce: document.key === "terms" ? status.inForce : false,
        ownDocument: false,
        heldInForceBy:
          document.key === "terms" ? status.heldInForceBy : undefined,
      }))}
      gate={NO_GATE}
    />,
  );
}

const clickTerms = () =>
  userEvent.click(screen.getByRole("switch", { name: TERMS.label }));

// #1295. The organization cannot withdraw the document the accounts on its own
// public website are governed by. The control stays where it was and says why
// it will not move, rather than vanishing the way the privacy policy's does --
// this is a state the organization can get out of by asking.
//
// Asserted through the switch's behaviour rather than its `disabled` attribute:
// the Base UI switch is not a plain `<button disabled>`, and what matters here
// is that the write does not happen.
describe("a document a live module depends on", () => {
  beforeEach(() => {
    saveMock.mockClear();
  });

  test("says why it cannot be withdrawn, and will not withdraw", async () => {
    renderPanel({ inForce: true, heldInForceBy: HELD });

    expect(screen.getByText(HELD)).toBeTruthy();
    await clickTerms();
    expect(saveMock).not.toHaveBeenCalled();
  });

  // Nothing depends on a document nobody has adopted: the module that would is
  // refused on the other side until this switch goes on.
  test("a document not yet in force is never held", async () => {
    renderPanel({ inForce: false, heldInForceBy: HELD });

    expect(screen.queryByText(HELD)).toBeNull();
    await clickTerms();
    expect(saveMock).toHaveBeenCalledWith("terms", true);
  });

  test("an unheld document still switches off", async () => {
    renderPanel({ inForce: true });

    expect(screen.queryByText(HELD)).toBeNull();
    await clickTerms();
    expect(saveMock).toHaveBeenCalledWith("terms", false);
  });
});

// #1292. The panel's job ends at making the drift visible: it never blocks the
// switch and never rewrites the text, so every assertion here is about words.
describe("a published document whose surface has moved", () => {
  function renderPrivacy(drift?: LegalDocumentDrift) {
    renderWithToaster(
      <LegalDocumentsPanel
        documents={LEGAL_DOCUMENTS}
        statuses={LEGAL_DOCUMENTS.map((document) => ({
          key: document.key,
          inForce: document.alwaysInForce,
          ownDocument: document.key === "privacy",
          drift: document.key === "privacy" ? drift : undefined,
        }))}
        gate={NO_GATE}
      />,
    );
  }

  test("says what was turned on, and what the text does not describe", () => {
    renderPrivacy({
      status: "checked",
      publishedAt: "2026-03-04T12:00:00Z",
      added: ["artworkSubmissions"],
      removed: [],
    });

    expect(screen.getByText("Artwork")).toBeTruthy();
    expect(
      screen.getByText(/does not describe artwork submissions/),
    ).toBeTruthy();
    // The date the text was written against, so the administrator can tell
    // whether this is news.
    expect(screen.getByText(/Mar 4, 2026/)).toBeTruthy();
  });

  test("says what was turned off, and what the text still describes", () => {
    renderPrivacy({
      status: "checked",
      publishedAt: null,
      added: [],
      removed: ["volunteerApplications", "volunteerHours"],
    });

    // One module, one name, one sentence -- not "Volunteers and Volunteers".
    expect(screen.getByText("Volunteers")).toBeTruthy();
    expect(
      screen.getByText(/still describes volunteer applications and hours/),
    ).toBeTruthy();
  });

  // The state every tenant that has ever published is in on day one, including
  // the first one. It must not read as an accusation.
  test("asks for a re-publish when nothing was ever recorded", () => {
    renderPrivacy({ status: "unknown" });

    expect(screen.getByText(/before we started recording/)).toBeTruthy();
    expect(screen.queryByText(/does not describe/)).toBeNull();
  });

  test("says nothing at all when the text still matches", () => {
    renderPrivacy({
      status: "checked",
      publishedAt: "2026-03-04T12:00:00Z",
      added: [],
      removed: [],
    });

    expect(screen.queryByText(/does not describe/)).toBeNull();
    expect(screen.queryByText(/still describes/)).toBeNull();
    expect(screen.queryByText(/before we started recording/)).toBeNull();
  });

  // The platform's own document regenerates from the live configuration on
  // every request, so there is nothing for it to be out of date with.
  test("says nothing where the tenant serves no text of its own", () => {
    renderPrivacy(undefined);

    expect(screen.queryByText(/does not describe/)).toBeNull();
    expect(screen.queryByText(/before we started recording/)).toBeNull();
  });
});

// #1321. The tenant is being served the platform's own text, which cannot go
// stale against the site the way #1292's drift does -- but it can go unread,
// and it can be rewritten underneath an organization that read it once.
describe("a document served from the platform's own text", () => {
  const CONFIRMED = {
    personId: "11111111-1111-1111-1111-111111111111",
    personName: "Dana Whitfield",
    acknowledgedAt: "2026-03-04T12:00:00Z",
    platformLastUpdated: "March 1, 2026",
  };

  function renderPrivacy(acknowledgement?: LegalAcknowledgement) {
    renderWithToaster(
      <LegalDocumentsPanel
        documents={LEGAL_DOCUMENTS}
        statuses={LEGAL_DOCUMENTS.map((document) => ({
          key: document.key,
          inForce: document.alwaysInForce,
          ownDocument: false,
          acknowledgement:
            document.key === "privacy" ? acknowledgement : undefined,
        }))}
        gate={NO_GATE}
      />,
    );
  }

  const confirm = () =>
    userEvent.click(screen.getByRole("button", { name: "I have read this" }));

  beforeEach(() => {
    acknowledgeMock.mockClear();
  });

  // The state every tenant is in the day it is provisioned: /privacy is live,
  // because the forms are collecting, and nobody there has read it.
  test("says nobody has confirmed it, and offers to record that somebody has", async () => {
    renderPrivacy({ status: "never" });

    expect(screen.getByText(/Nobody here has confirmed/)).toBeTruthy();
    await confirm();
    expect(acknowledgeMock).toHaveBeenCalledWith("privacy");
  });

  // The failure the ticket is really about: the words changed and the printed
  // date moved on a document nobody re-read.
  test("names the version it moved to, and when it was last read", async () => {
    renderPrivacy({
      status: "stale",
      confirmed: CONFIRMED,
      updatedTo: "September 21, 2026",
    });

    expect(screen.getByText("September 21, 2026")).toBeTruthy();
    expect(screen.getByText(/Dana Whitfield/)).toBeTruthy();
    expect(screen.getByText(/Mar 4, 2026/)).toBeTruthy();
    await confirm();
    expect(acknowledgeMock).toHaveBeenCalledWith("privacy");
  });

  // Said out loud rather than left blank: the point of the row is that an
  // organization can answer "when did we last read our own privacy policy".
  test("a settled confirmation is stated, and asks for nothing", () => {
    renderPrivacy({ status: "confirmed", confirmed: CONFIRMED });

    expect(screen.getByText(/Dana Whitfield/)).toBeTruthy();
    expect(screen.getByText(/March 1, 2026/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "I have read this" }),
    ).toBeNull();
  });

  // A service-role script or a person with no people row yet. The date is
  // still the answer; "confirmed by nobody" would be worse than saying nothing.
  test("states the date when it cannot name who confirmed it", () => {
    renderPrivacy({
      status: "confirmed",
      confirmed: { ...CONFIRMED, personId: null, personName: null },
    });

    expect(screen.getByText(/Confirmed here on Mar 4, 2026/)).toBeTruthy();
  });

  // Publishing your own text is the confirmation; there is no platform
  // document in the way to have gone unread.
  test("says nothing where the tenant serves text of its own", () => {
    renderPrivacy(undefined);

    expect(screen.queryByText(/Nobody here has confirmed/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "I have read this" }),
    ).toBeNull();
  });
});

// #600. The gate is the organization's own decision, off until it makes it,
// and refused outright where there is nobody to be the second pair of eyes.
describe("the second-approver gate", () => {
  function renderGate(gate: { required: boolean; approvers: number }) {
    renderWithToaster(
      <LegalDocumentsPanel
        documents={LEGAL_DOCUMENTS}
        statuses={LEGAL_DOCUMENTS.map((document) => ({
          key: document.key,
          inForce: document.alwaysInForce,
          ownDocument: false,
        }))}
        gate={gate}
      />,
    );
  }

  const clickGate = () =>
    userEvent.click(
      screen.getByRole("switch", {
        name: "Ask a second person before a legal document is published",
      }),
    );

  beforeEach(() => {
    approvalMock.mockClear();
  });

  test("an organization with two publishers can switch it on", async () => {
    renderGate({ required: false, approvers: 2 });

    await clickGate();
    expect(approvalMock).toHaveBeenCalledWith(true);
  });

  // The lockout the whole design exists to avoid, blocked at the door it
  // arrives by: with one publisher, every publish would be self-approved and
  // therefore refused, and the tenant would be pinned to the platform's text.
  test("a single-publisher organization is told why it cannot, and does not", async () => {
    renderGate({ required: false, approvers: 1 });

    expect(screen.getByText(/nobody to be the second approver/)).toBeTruthy();
    await clickGate();
    expect(approvalMock).not.toHaveBeenCalled();
  });

  // The way out of a tenant that has lost its second administrator. Switching
  // off is never blocked, whatever the staffing.
  test("switching it back off still works with one publisher left", async () => {
    renderGate({ required: true, approvers: 1 });

    expect(
      screen.getByText(/no legal document can be published at all/),
    ).toBeTruthy();
    await clickGate();
    expect(approvalMock).toHaveBeenCalledWith(false);
  });
});

// #600. What the panel is for once the gate is on: who is waiting on whom.
describe("a legal document with a draft waiting", () => {
  function renderPrivacy(
    publishState: {
      pending: {
        draftedAt: string | null;
        draftedBy: string | null;
        draftedByViewer: boolean;
      } | null;
      approval: {
        approvedAt: string | null;
        approvedBy: string | null;
        reference: string;
        notes: string;
      } | null;
    },
    required = true,
  ) {
    renderWithToaster(
      <LegalDocumentsPanel
        documents={LEGAL_DOCUMENTS}
        statuses={LEGAL_DOCUMENTS.map((document) => ({
          key: document.key,
          inForce: document.alwaysInForce,
          ownDocument: document.key === "privacy",
          publishState:
            document.key === "privacy"
              ? publishState
              : { pending: null, approval: null },
        }))}
        gate={{ required, approvers: 3 }}
      />,
    );
  }

  const DRAFT = {
    draftedAt: "2026-03-04T12:00:00Z",
    draftedBy: "Dana Whitfield",
    draftedByViewer: false,
  };

  test("somebody else's draft is the one waiting for the reader", () => {
    renderPrivacy({ pending: DRAFT, approval: null });

    expect(screen.getByText("Dana Whitfield")).toBeTruthy();
    expect(screen.getByText(/waiting for you/)).toBeTruthy();
  });

  test("the reader's own draft is the one they cannot publish", () => {
    renderPrivacy({
      pending: { ...DRAFT, draftedByViewer: true },
      approval: null,
    });

    expect(screen.getByText(/Somebody else here has to read it/)).toBeTruthy();
  });

  // With the gate off a draft is still worth saying out loud -- it is text the
  // public is not being served -- but nobody is waiting on anybody.
  test("with the gate off, a draft asks for no second person", () => {
    renderPrivacy({ pending: DRAFT, approval: null }, false);

    expect(screen.getByText(/Publish it from Pages/)).toBeTruthy();
    expect(screen.queryByText(/waiting for you/)).toBeNull();
  });

  test("an approval on the published text names who gave it, and against what", () => {
    renderPrivacy({
      pending: null,
      approval: {
        approvedAt: "2026-03-06T12:00:00Z",
        approvedBy: "Ash Okonkwo",
        reference: "Board meeting, 4 March",
        notes: "Counsel read it first.",
      },
    });

    expect(screen.getByText("Ash Okonkwo")).toBeTruthy();
    expect(screen.getByText("Board meeting, 4 March")).toBeTruthy();
    expect(screen.getByText(/Counsel read it first./)).toBeTruthy();
  });
});

// Arriving from the bell's "legal documents to review" item, the page has to
// say which rows that count was about, and why, before anything else.
describe("documents the bell counted", () => {
  function renderStatuses(
    privacy: LegalAcknowledgement | undefined,
    termsDrift?: LegalDocumentDrift,
  ) {
    renderWithToaster(
      <LegalDocumentsPanel
        documents={LEGAL_DOCUMENTS}
        statuses={LEGAL_DOCUMENTS.map((document) => ({
          key: document.key,
          inForce: document.alwaysInForce || document.key === "terms",
          ownDocument: document.key === "terms",
          acknowledgement: document.key === "privacy" ? privacy : undefined,
          drift: document.key === "terms" ? termsDrift : undefined,
        }))}
        gate={NO_GATE}
      />,
    );
  }

  test("are summarized at the top, with why, and badged in their rows", () => {
    renderStatuses(
      { status: "never" },
      {
        status: "checked",
        publishedAt: "2026-03-04T12:00:00Z",
        added: ["artworkSubmissions"],
        removed: [],
      },
    );

    expect(screen.getByText("2 legal documents to review")).toBeTruthy();
    expect(
      screen.getByText(/nobody here has confirmed they have read it/),
    ).toBeTruthy();
    expect(
      screen.getByText(/your site has changed since you published it/),
    ).toBeTruthy();
    expect(screen.getAllByText("Needs review")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: TERMS.label }).getAttribute("href"),
    ).toBe("#legal-document-terms");
  });

  test("a settled page shows no summary and no badge", () => {
    renderStatuses({
      status: "confirmed",
      confirmed: {
        personId: null,
        personName: null,
        acknowledgedAt: "2026-03-04T12:00:00Z",
        platformLastUpdated: "March 1, 2026",
      },
    });

    expect(screen.queryByText(/to review/)).toBeNull();
    expect(screen.queryByText("Needs review")).toBeNull();
  });
});
