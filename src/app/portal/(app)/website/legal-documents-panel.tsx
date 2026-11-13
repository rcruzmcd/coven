"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleAlert, ExternalLink } from "lucide-react";
import {
  acknowledgeLegalDocumentAction,
  updateLegalApprovalAction,
  updateLegalPublicationAction,
} from "./settings-actions";
import type { SettingActionResult } from "@/lib/settings/write-app-setting";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/portal/status-badge";
// Type-only where the module has server helpers: @/lib/legal-documents is the
// registry and is free of them, but the read lives in @/lib/legal-publication,
// which must not reach the client bundle. State arrives as props from the
// server page, same as PageVisibilityPanel.
import { legalDocumentNoun, type LegalDocument } from "@/lib/legal-documents";
// Free of server helpers on purpose, so the drift sentence is written where it
// is tested rather than assembled in JSX.
import {
  hasDrifted,
  joinPhrases,
  namedSurfaces,
  type LegalDocumentDrift,
} from "@/lib/legal-surface";
// Same reasoning: the registry and the words are client-safe, the reads are
// not. The resolved state arrives as a prop.
import {
  needsAcknowledgement,
  type LegalAcknowledgement,
} from "@/lib/legal-acknowledgement";
// And the same again for the approval gate: the registry and the words are
// client-safe, the reads are not.
import {
  MINIMUM_APPROVERS,
  type LegalPublishState,
} from "@/lib/legal-approval";
// Plain data, so the panel reads it directly (#1886).
import { platformLegalChangesSince } from "@/lib/legal-changelog";
import { formatInstantDate } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";

/** What the public site is currently serving at this document's route. */
export type LegalDocumentStatus = {
  key: string;
  inForce: boolean;
  /** Whether the tenant has published a document of its own for this slot. */
  ownDocument: boolean;
  /**
   * Why this document cannot be taken out of force, when a module that depends
   * on it is on (#1295). Undefined is the ordinary case: nothing is holding it,
   * and the switch works both ways.
   */
  heldInForceBy?: string;
  /**
   * Whether the text still describes what the site collects (#1292). Computed
   * on the server and arriving as a prop, like everything else on this type:
   * `@/lib/legal-publication` must not reach the client bundle. Undefined where
   * the question does not arise -- the platform's document is being served, or
   * nothing is.
   */
  drift?: LegalDocumentDrift;
  /**
   * Whether anybody here has confirmed they have read the platform's text for
   * this document, and whether the platform has changed it since (#1321).
   * Undefined where the question does not arise -- the tenant serves its own
   * text, or serves nothing. The exact complement of `drift` above: a document
   * in force carries one or the other, never both.
   */
  acknowledgement?: LegalAcknowledgement;
  /**
   * The draft waiting to be published and the approval recorded on what is
   * published now (#600). Present for every document, since a draft is worth
   * saying out loud whether or not the approval gate is on; what the gate
   * changes is who can publish it.
   */
  publishState?: LegalPublishState;
};

/**
 * Whether this organization requires a second approver on legal documents, and
 * whether it has the people for one (#600).
 */
export type LegalApprovalGate = {
  required: boolean;
  /** How many people here hold `site_content:manage`. */
  approvers: number;
};

/**
 * Why a document is in the bell's "legal documents to review" count, or
 * `null` when it is not.
 *
 * The same two tests `getLegalDriftSummary` adds up, so the rows this page
 * marks are exactly the ones the bell counted. Before this the page said the
 * same things only as muted sentences among half a dozen others, and someone
 * arriving from the bell had nothing to tell them which row to read.
 */
export function reviewReason(status: LegalDocumentStatus): string | null {
  if (hasDrifted(status.drift)) {
    return "your site has changed since you published it";
  }
  if (status.acknowledgement?.status === "stale") {
    return "the platform has updated the text since it was last read";
  }
  if (needsAcknowledgement(status.acknowledgement)) {
    return "nobody here has confirmed they have read it";
  }
  return null;
}

const rowAnchor = (key: string) => `legal-document-${key}`;

/**
 * The answer to "what does the bell want from me?", above everything else on
 * the page: which documents, why each one, and a link to its row.
 */
function ReviewSummary({
  documents,
  byKey,
}: {
  documents: readonly LegalDocument[];
  byKey: Map<string, LegalDocumentStatus>;
}) {
  const flagged = documents.flatMap((document) => {
    const status = byKey.get(document.key);
    const reason = status ? reviewReason(status) : null;
    return reason ? [{ document, reason }] : [];
  });
  if (flagged.length === 0) return null;

  return (
    <Alert>
      <CircleAlert className="text-warning" aria-hidden />
      <AlertTitle>
        {flagged.length} legal document{flagged.length === 1 ? "" : "s"} to
        review
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1">
          {flagged.map(({ document, reason }) => (
            <li key={document.key}>
              <a
                href={`#${rowAnchor(document.key)}`}
                className="font-medium underline underline-offset-4"
              >
                {document.label}
              </a>{" "}
              &mdash; {reason}.
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The drift line, when there is one (#1292).
 *
 * Deliberately a sentence rather than a badge, and `app-muted` rather than an
 * alert: nothing is broken, the organization's lawyer may well have signed the
 * text off, and the only thing the platform is entitled to do is say what it
 * noticed. It never blocks a publish and never edits the document.
 */
function DriftLine({
  document,
  drift,
}: {
  document: LegalDocument;
  drift: LegalDocumentDrift;
}) {
  if (drift.status === "unknown") {
    return (
      <>
        Published before we started recording what a document covers, so we
        cannot tell whether it still matches your site. Re-publish it from Pages
        to start tracking.
      </>
    );
  }

  const added = namedSurfaces(drift.added, "subject");
  const removed = namedSurfaces(drift.removed, "subject");
  if (added.length === 0 && removed.length === 0) return null;

  // The date leads, so that "since" in the clauses after it has something to
  // refer back to and neither clause has to repeat it.
  const on = formatInstantDate(drift.publishedAt, "");

  return (
    <>
      You published your {legalDocumentNoun(document)}
      {on ? ` on ${on}` : ""}.{" "}
      {added.length > 0 ? (
        <>
          <span className="font-medium">{joinPhrases(added)}</span>{" "}
          {added.length === 1 ? "has" : "have"} been turned on since, and your
          text does not describe{" "}
          {joinPhrases(namedSurfaces(drift.added, "collects"))}.{" "}
        </>
      ) : null}
      {removed.length > 0 ? (
        <>
          <span className="font-medium">{joinPhrases(removed)}</span>{" "}
          {removed.length === 1 ? "has" : "have"} been turned off since, and
          your text still describes{" "}
          {joinPhrases(namedSurfaces(drift.removed, "collects"))}.{" "}
        </>
      ) : null}
      Nothing is broken and nothing has been changed for you &mdash; review the
      wording in Pages when you next can.
    </>
  );
}

/**
 * The confirmation line, for a document served from the platform's text
 * (#1321).
 *
 * All three states are said out loud, including the settled one: the whole
 * point of the row is that an organization can answer "when did we last read
 * our own privacy policy, and who", and a record that only appears when
 * something is wrong cannot answer it. `app-muted` throughout, and no alert --
 * nothing here is broken, and the page stays served whatever this says.
 */
function AcknowledgementLine({
  document,
  acknowledgement,
}: {
  document: LegalDocument;
  acknowledgement: LegalAcknowledgement;
}) {
  const label = legalDocumentNoun(document);

  if (acknowledgement.status === "never") {
    return (
      <>
        Your {label} is the platform&rsquo;s neutral default. Nobody here has
        confirmed they have read it.{" "}
        <Link
          href={document.route}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-4"
        >
          Read the current text
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </>
    );
  }

  const { confirmed } = acknowledgement;
  const on = formatInstantDate(confirmed.acknowledgedAt, "");
  // A record written before anybody had a people row, or by a service-role
  // script: the date is still the answer, and "confirmed by nobody" would be
  // worse than not naming anyone.
  const by = confirmed.personName ? ` by ${confirmed.personName}` : "";
  const when = on ? ` on ${on}` : "";

  if (acknowledgement.status === "stale") {
    return (
      <>
        The platform updated this text on{" "}
        <span className="font-medium">{acknowledgement.updatedTo}</span>. It was
        last confirmed here{by}
        {when}, against the earlier version.
      </>
    );
  }

  return (
    <>
      Confirmed here{by}
      {when}, against the text the platform published on{" "}
      {confirmed.platformLastUpdated}.
    </>
  );
}

/**
 * What the platform changed in this document since it was last confirmed
 * (#1886), so a stale row says what to re-read rather than only that something
 * moved. A list cannot sit inside the confirmation line's `<p>`, so it is a
 * sibling of it.
 */
function AcknowledgementChanges({
  document,
  confirmedVersion,
}: {
  document: LegalDocument;
  confirmedVersion: string;
}) {
  const label = legalDocumentNoun(document);
  const { changes, complete } = platformLegalChangesSince(
    document.key,
    confirmedVersion,
  );

  if (changes.length === 0) {
    return (
      <p className="app-muted mt-1 text-sm leading-relaxed">
        {complete
          ? `Nothing in this ${label} changed: the date moved because another of the platform's documents did.`
          : `The platform's change log does not go back to the version confirmed here, and records no change to this ${label}.`}
      </p>
    );
  }

  return (
    <div className="app-muted mt-1 text-sm leading-relaxed">
      <p>
        {complete
          ? "What changed since then:"
          : "The platform's change log does not go back to the version confirmed here. Every change it records:"}
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {changes.map((change) => (
          <li key={change.version}>
            <span className="font-medium">{`${change.version}:`}</span>{" "}
            {change.summary}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The draft waiting on somebody, and the approval on the text being served
 * (#600).
 *
 * Two sentences rather than a badge, like every other line in this row: what
 * an administrator needs from this panel is who is waiting on whom, which a
 * status word cannot say. The pending sentence is written for the reader --
 * their own draft is the one they cannot publish, somebody else's is the one
 * waiting for them -- because "pending approval" answers neither question.
 */
function PublishStateLines({
  document,
  state,
  approvalRequired,
}: {
  document: LegalDocument;
  state: LegalPublishState;
  approvalRequired: boolean;
}) {
  const label = legalDocumentNoun(document);
  const pending = state.pending;
  const approval = state.approval;
  const draftedOn = pending?.draftedAt
    ? formatInstantDate(pending.draftedAt, "")
    : "";
  const approvedOn = approval?.approvedAt
    ? formatInstantDate(approval.approvedAt, "")
    : "";

  return (
    <>
      {pending ? (
        <p className="app-muted mt-1 text-sm leading-relaxed">
          {pending.draftedByViewer ? (
            <>
              You saved a draft of this {label}
              {draftedOn ? ` on ${draftedOn}` : ""}. It is not being served yet.
              {approvalRequired
                ? " Somebody else here has to read it and publish it."
                : " Publish it from Pages when you are ready."}
            </>
          ) : (
            <>
              <span className="font-medium">
                {pending.draftedBy ?? "Somebody"}
              </span>{" "}
              saved a draft of this {label}
              {draftedOn ? ` on ${draftedOn}` : ""}, and it is not being served
              yet.
              {approvalRequired
                ? " It is waiting for you, or for anyone here other than them, to read it and publish it."
                : " Publish it from Pages when you are ready."}
            </>
          )}
        </p>
      ) : null}
      {approval ? (
        <p className="app-muted mt-1 text-sm leading-relaxed">
          The text being served was approved by{" "}
          <span className="font-medium">
            {approval.approvedBy ?? "somebody here"}
          </span>
          {approvedOn ? ` on ${approvedOn}` : ""}, against{" "}
          <span className="font-medium">{approval.reference}</span>.
          {approval.notes ? ` They wrote: ${approval.notes}` : ""}
        </p>
      ) : null}
    </>
  );
}

/**
 * The gate itself: one switch for the whole organization, above the three
 * documents it governs (#600).
 *
 * Above rather than beside them because it is a rule about how publishing
 * works, not a fourth document, and because turning it on changes what the
 * publish dialog in Pages asks for. It is off until somebody here turns it on:
 * see `@/lib/legal-approval` for why this cannot be a platform-wide rule.
 */
function ApprovalGateCard({
  gate,
  onError,
}: {
  gate: LegalApprovalGate;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useOptimistic(gate.required);
  const [isPending, startTransition] = useTransition();
  const enoughApprovers = gate.approvers >= MINIMUM_APPROVERS;

  function handleChange(next: boolean) {
    onError(null);

    startTransition(async () => {
      setChecked(next);
      await runAction<SettingActionResult>(
        () => updateLegalApprovalAction(next),
        {
          success: next
            ? "Legal documents now need a second approver."
            : "Legal documents no longer need a second approver.",
          onError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  const labelId = "legal-approval-required-label";

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 py-4">
        <div className="min-w-0">
          <p id={labelId} className="text-sm font-medium">
            Ask a second person before a legal document is published
          </p>
          <p className="app-muted mt-1 text-sm leading-relaxed">
            With this on, a legal document can only be published by somebody
            other than the person who saved the draft, and they are asked what
            approved the text and what they made of it. Both are recorded in the
            audit log beside the words they approved. Everything else on the
            site publishes as it does today.
          </p>
          {/* The refusal is said here, before the switch is touched, rather
              than only in the toast the action returns: an organization with
              one administrator is a supported state, and being told why the
              control is unavailable is better than finding out by using it. */}
          {enoughApprovers ? null : (
            <p className="app-muted mt-1 text-sm leading-relaxed">
              {checked
                ? "Only one person here can publish website content, so no legal document can be published at all until somebody else is given Site content at Manage — or until this is switched back off."
                : "Only one person here can publish website content, so there is nobody to be the second approver. Give somebody else the Site content permission at Manage first."}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {isPending ? <Spinner className="size-4" /> : null}
          <span className="app-muted w-20 text-right text-xs">
            {checked ? "Required" : "Not required"}
          </span>
          <Switch
            checked={checked}
            onCheckedChange={handleChange}
            // Switching it off is never blocked, whatever the staffing: that
            // is the way out of a tenant that has lost its second
            // administrator, and it has to keep working.
            disabled={isPending || (!checked && !enoughApprovers)}
            aria-labelledby={labelId}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ServingLine({
  document,
  inForce,
  ownDocument,
}: {
  document: LegalDocument;
  inForce: boolean;
  ownDocument: boolean;
}) {
  if (!inForce) {
    return (
      <>
        Not served. {document.route} returns &ldquo;not found&rdquo; and the
        footer omits it.
        {ownDocument
          ? " Your own text is written and waiting."
          : document.hasPlatformDefault
            ? " Nothing of your own is written yet, so putting it in force would serve the platform's starting document."
            : // The one document with nothing behind it (#686). "Putting it in
              // force would serve the platform's starting document" is not
              // merely wrong here, it is the opposite of what happens, and the
              // switch beside this line is disabled for exactly that reason.
              " There is no starting text for this one, so it cannot be put in force until you have written and published your own."}
      </>
    );
  }
  return (
    <>
      Live at{" "}
      <Link
        href={document.route}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 underline underline-offset-4"
      >
        {document.route}
        <ExternalLink className="size-3.5" aria-hidden />
      </Link>
      , serving{" "}
      {ownDocument
        ? "your own text."
        : "the platform's starting document, because nothing of your own is published for it."}
    </>
  );
}

function LegalDocumentRow({
  document,
  status,
  approvalRequired,
  onError,
}: {
  document: LegalDocument;
  status: LegalDocumentStatus;
  /** Whether the gate above is on, which changes who a draft is waiting for. */
  approvalRequired: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  // Same reasoning as PageVisibilityRow: `useOptimistic` rather than plain
  // state, so the switch drops back to the server's own value the moment the
  // transition ends and can never keep showing a change the server refused.
  const [checked, setChecked] = useOptimistic(status.inForce);
  const [isPending, startTransition] = useTransition();
  const [isConfirming, startConfirming] = useTransition();
  // Held in force only matters while it *is* in force: a document nothing has
  // adopted yet has nothing depending on it, and the module that would depend
  // on it cannot be turned on until it is.
  const held = status.inForce ? status.heldInForceBy : undefined;
  // A fingerprint that matches is the ordinary case and says nothing: the line
  // exists for the two states worth reading, drifted and never recorded.
  const drift =
    status.drift &&
    (status.drift.status === "unknown" || hasDrifted(status.drift))
      ? status.drift
      : undefined;
  // A document with no platform text cannot be adopted before it is written
  // (#686): there would be nothing at its route and nothing at the point it is
  // meant to be accepted. `updateLegalPublicationAction` refuses this too --
  // the switch is disabled so nobody has to discover the refusal by tripping
  // it, and `ServingLine` above says why.
  const needsOwnText =
    !document.hasPlatformDefault && !status.ownDocument && !status.inForce;

  function handleConfirm() {
    onError(null);

    startConfirming(async () => {
      await runAction<SettingActionResult>(
        () => acknowledgeLegalDocumentAction(document.key),
        {
          success: `Recorded that you have read the ${legalDocumentNoun(document)}.`,
          onError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  function handleChange(next: boolean) {
    onError(null);

    startTransition(async () => {
      setChecked(next);
      await runAction<SettingActionResult>(
        () => updateLegalPublicationAction(document.key, next),
        {
          success: `${document.label} is ${next ? "now in force" : "no longer served"}.`,
          onError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  const labelId = `legal-publication-${document.key}-label`;
  const flagged = reviewReason(status) !== null;

  return (
    <div
      id={rowAnchor(document.key)}
      className="flex scroll-mt-24 items-start justify-between gap-4 py-4"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span id={labelId} className="text-sm font-medium">
            {document.label}
          </span>
          {flagged ? (
            <StatusBadge tone="warning">Needs review</StatusBadge>
          ) : null}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          {document.description}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          <ServingLine
            document={document}
            inForce={status.inForce}
            ownDocument={status.ownDocument}
          />
        </p>
        {held ? (
          <p className="app-muted mt-1 text-sm leading-relaxed">{held}</p>
        ) : null}
        {drift ? (
          <p className="app-muted mt-1 text-sm leading-relaxed">
            <DriftLine document={document} drift={drift} />
          </p>
        ) : null}
        {status.acknowledgement ? (
          <p className="app-muted mt-1 text-sm leading-relaxed">
            <AcknowledgementLine
              document={document}
              acknowledgement={status.acknowledgement}
            />
          </p>
        ) : null}
        {status.acknowledgement?.status === "stale" ? (
          <AcknowledgementChanges
            document={document}
            confirmedVersion={
              status.acknowledgement.confirmed.platformLastUpdated ?? ""
            }
          />
        ) : null}
        {status.publishState ? (
          <PublishStateLines
            document={document}
            state={status.publishState}
            approvalRequired={approvalRequired}
          />
        ) : null}
        {/* Beside the sentence rather than in the control column on the right,
            where the privacy policy has no switch to sit under and the other
            two have one that means something else entirely. */}
        {needsAcknowledgement(status.acknowledgement) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={handleConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? <Spinner className="size-3.5" /> : null}I have read
            this
          </Button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {isPending ? <Spinner className="size-4" /> : null}
        <span className="app-muted w-20 text-right text-xs">
          {document.alwaysInForce
            ? "Always on"
            : checked
              ? "In force"
              : "Not adopted"}
        </span>
        {/* The privacy policy has no control at all, rather than a control that
            refuses: a switch whose only correct position is "on" invites
            somebody to try the other one. */}
        {document.alwaysInForce ? null : (
          <Switch
            checked={checked}
            onCheckedChange={handleChange}
            // A held document keeps its switch, unlike the privacy policy's
            // missing one: this is a state the organization can get out of by
            // asking, so the control stays where it was and says why it is
            // stuck (#1295).
            disabled={isPending || Boolean(held) || needsOwnText}
            aria-labelledby={labelId}
          />
        )}
      </div>
    </div>
  );
}

export function LegalDocumentsPanel({
  documents,
  statuses,
  gate,
}: {
  documents: readonly LegalDocument[];
  statuses: readonly LegalDocumentStatus[];
  gate: LegalApprovalGate;
}) {
  const [error, setError] = useState<string | null>(null);
  const byKey = new Map(statuses.map((status) => [status.key, status]));

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ReviewSummary documents={documents} byKey={byKey} />

      <ApprovalGateCard gate={gate} onError={setError} />

      <Card>
        <CardContent className="divide-y divide-[var(--line)]">
          {documents.map((document) => (
            <LegalDocumentRow
              key={document.key}
              document={document}
              approvalRequired={gate.required}
              status={
                byKey.get(document.key) ?? {
                  key: document.key,
                  inForce: document.alwaysInForce,
                  ownDocument: false,
                }
              }
              onError={setError}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
