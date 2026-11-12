"use client";

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { CircleCheck, QrCode, Smartphone } from "lucide-react";
import {
  AsIsAcknowledgementFields,
  type AcknowledgeInput,
} from "@/components/as-is-acknowledgement-form";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import type { DistributionDraft } from "@/lib/inventory-distribution-draft";
import type { Lexicon } from "@/lib/lexicon";
import {
  acknowledgementMethodPhrase,
  emailLinkUnavailableReason,
  SKIPPED_REASON_LABELS,
  SKIPPED_REASONS,
  type AcknowledgementView,
  type EmailLinkAvailability,
  type SkippedReason,
} from "@/lib/distribution-acknowledgement";
import {
  acknowledgeOnStaffDeviceAction,
  getStaffDeviceAcknowledgementAction,
  showAcknowledgementCodeAction,
} from "./distribution-draft-actions";

/** How often the staff screen looks for the recipient's acknowledgement while
 *  the code is showing. */
const POLL_MS = 3000;

const ACKNOWLEDGES = "__acknowledges__";

/** The checkout's state the modal records with. */
export type CheckoutState = {
  removedTags: string[];
  skippedReason: SkippedReason | null;
  skippedNote: string;
  /** With a reason, email the recipient a link to acknowledge afterwards. */
  emailLink: boolean;
};

export const EMPTY_CHECKOUT: CheckoutState = {
  removedTags: [],
  skippedReason: null,
  skippedNote: "",
  emailLink: true,
};

/** Whether recording will email the recipient a link: a reason was given,
 *  the box is ticked, and a link can be sent at all. */
export function willEmailLink(
  draft: DistributionDraft | null,
  availability: EmailLinkAvailability,
  state: CheckoutState,
): boolean {
  return (
    state.skippedReason !== null &&
    state.emailLink &&
    !draft?.acknowledgement &&
    emailLinkUnavailableReason(availability, draft?.recipient ?? null) === null
  );
}

/** The numbered codes that have to come off before the handout is recorded. */
export function tagsToRemove(
  draft: DistributionDraft | null,
  markDistributed: boolean,
): { itemId: string; code: string; description: string }[] {
  if (!markDistributed || !draft) return [];
  return draft.items.flatMap((item) =>
    item.numberedCode
      ? [
          {
            itemId: item.id,
            code: item.numberedCode,
            description: item.description,
          },
        ]
      : [],
  );
}

/** Whether Record may be pressed: every tag ticked, and the recipient has
 *  acknowledged, or need not, or staff said why not. */
export function checkoutReady(
  draft: DistributionDraft | null,
  markDistributed: boolean,
  needsAcknowledgement: boolean,
  state: CheckoutState,
): boolean {
  const tagsDone = tagsToRemove(draft, markDistributed).every((tag) =>
    state.removedTags.includes(tag.code),
  );
  const acknowledged =
    !needsAcknowledgement ||
    Boolean(draft?.acknowledgement) ||
    (state.skippedReason !== null &&
      (state.skippedReason !== "other" || state.skippedNote.trim() !== ""));
  return tagsDone && acknowledged;
}

/**
 * The handout's checkout (#1519): the tags come off, then the recipient
 * acknowledges the gear as-is -- on their own phone through a one-time QR
 * code, or on this device handed to them. Staff can record without it only by
 * saying why.
 */
export function DistributionCheckout({
  eventId,
  draft,
  markDistributed,
  needsAcknowledgement,
  emailLink,
  state,
  onStateChange,
  onDraftChanged,
}: {
  eventId: string | null;
  draft: DistributionDraft | null;
  markDistributed: boolean;
  needsAcknowledgement: boolean;
  /** Whether a link to acknowledge afterwards can be emailed (#1519). */
  emailLink: EmailLinkAvailability;
  state: CheckoutState;
  onStateChange: (next: CheckoutState) => void;
  /** Re-read the draft, which carries the acknowledgement. */
  onDraftChanged: () => Promise<unknown>;
}) {
  const id = useId();
  const tags = tagsToRemove(draft, markDistributed);
  const acknowledgement = draft?.acknowledgement ?? null;
  const linkUnavailable = emailLinkUnavailableReason(
    emailLink,
    draft?.recipient ?? null,
  );
  const [code, setCode] = useState<{ url: string; qrDataUri: string } | null>(
    null,
  );
  const [codeUnavailable, setCodeUnavailable] = useState(false);
  const [staffView, setStaffView] = useState<{
    view: AcknowledgementView;
    lexicon: Lexicon;
  } | null>(null);
  const [staffInput, setStaffInput] = useState<AcknowledgeInput>({
    typedName: "",
    acknowledged: false,
  });
  const [staffError, setStaffError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // While the code is showing, look for the recipient's acknowledgement.
  const waiting = Boolean(code) && !acknowledgement;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void onDraftChanged(), POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, onDraftChanged]);

  function toggleTag(tag: string, checked: boolean) {
    onStateChange({
      ...state,
      removedTags: checked
        ? [...state.removedTags, tag]
        : state.removedTags.filter((code) => code !== tag),
    });
  }

  function showCode() {
    setError(null);
    startTransition(async () => {
      const result = await showAcknowledgementCodeAction(eventId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if ("unavailable" in result) {
        setCodeUnavailable(true);
        return;
      }
      setCode(result);
    });
  }

  function handToRecipient() {
    setError(null);
    startTransition(async () => {
      const result = await getStaffDeviceAcknowledgementAction(eventId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setStaffInput({ typedName: "", acknowledged: false });
      setStaffError(null);
      setStaffView(result);
    });
  }

  function acknowledgeHere(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The surface is portalled out of the checkout's DOM but not out of its
    // React tree, so without this the submit would also reach the checkout's
    // own form and record the handout.
    event.stopPropagation();
    setStaffError(null);
    startTransition(async () => {
      const result = await acknowledgeOnStaffDeviceAction(eventId, staffInput);
      if ("error" in result) {
        setStaffError(result.error);
        return;
      }
      setStaffView(null);
      await onDraftChanged();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {tags.length > 0 && (
        <FieldSet>
          <FieldLegend>Take the tags off</FieldLegend>
          <FieldDescription>
            Recording frees these numbered codes for other gear, so each tag has
            to come off before the item leaves.
          </FieldDescription>
          <FieldGroup className="gap-3">
            {tags.map((tag) => (
              <Field key={tag.code} orientation="horizontal">
                <Checkbox
                  id={`${id}-tag-${tag.code}`}
                  checked={state.removedTags.includes(tag.code)}
                  onCheckedChange={(checked) =>
                    toggleTag(tag.code, checked === true)
                  }
                />
                <FieldLabel htmlFor={`${id}-tag-${tag.code}`}>
                  Tag {tag.code} removed from {tag.description}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      )}

      <FieldSet>
        <FieldLegend>The recipient acknowledges</FieldLegend>
        {!needsAcknowledgement ? (
          <FieldDescription>
            Not needed: every item is held under a request the recipient already
            acknowledged as-is.
          </FieldDescription>
        ) : acknowledgement ? (
          <Alert>
            <CircleCheck />
            <AlertDescription>
              Acknowledged by {acknowledgement.typedName}{" "}
              {acknowledgementMethodPhrase(acknowledgement.method)}.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <FieldDescription>
              The recipient reads that the gear is given as-is, types their name
              and ticks the box themselves.
            </FieldDescription>
            <div className="flex flex-wrap gap-2">
              {!codeUnavailable && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  focusableWhenDisabled
                  onClick={showCode}
                >
                  <QrCode />
                  {code ? "Show a new code" : "Show a code for their phone"}
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                focusableWhenDisabled
                onClick={handToRecipient}
              >
                <Smartphone />
                Hand them this device
              </Button>
            </div>
            {codeUnavailable && (
              <FieldDescription>
                This organization has no public site for a phone to open, so
                hand them this device instead.
              </FieldDescription>
            )}
            {code && (
              <div className="flex flex-col items-center gap-2 rounded-md border border-[var(--line)] p-4">
                {/* A data URI from bwip-js, as on the printed labels. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={code.qrDataUri}
                  alt="QR code for the recipient to scan"
                  className="size-56 bg-white"
                />
                <p className="app-muted flex items-center gap-2 text-sm">
                  <Spinner /> Waiting for them to acknowledge...
                </p>
              </div>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Field>
              <FieldLabel htmlFor={`${id}-skip`}>
                Record without it, because
              </FieldLabel>
              <Select
                value={state.skippedReason ?? ACKNOWLEDGES}
                onValueChange={(value) =>
                  onStateChange({
                    ...state,
                    skippedReason:
                      value && value !== ACKNOWLEDGES
                        ? (value as SkippedReason)
                        : null,
                  })
                }
              >
                <SelectTrigger id={`${id}-skip`} className="w-full">
                  <SelectValue placeholder="They acknowledge it">
                    {(value: string) =>
                      value in SKIPPED_REASON_LABELS
                        ? SKIPPED_REASON_LABELS[value as SkippedReason]
                        : "They acknowledge it"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ACKNOWLEDGES}>
                    They acknowledge it
                  </SelectItem>
                  {SKIPPED_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {SKIPPED_REASON_LABELS[reason]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {state.skippedReason && (
              <Field>
                <FieldLabel
                  htmlFor={`${id}-skip-note`}
                  required={state.skippedReason === "other"}
                >
                  Note
                </FieldLabel>
                <Textarea
                  id={`${id}-skip-note`}
                  maxLength={500}
                  required={state.skippedReason === "other"}
                  value={state.skippedNote}
                  onChange={(event) =>
                    onStateChange({ ...state, skippedNote: event.target.value })
                  }
                />
              </Field>
            )}
            {state.skippedReason &&
              (linkUnavailable ? (
                <FieldDescription>{linkUnavailable}</FieldDescription>
              ) : (
                <Field orientation="horizontal">
                  <Checkbox
                    id={`${id}-email-link`}
                    checked={state.emailLink}
                    onCheckedChange={(checked) =>
                      onStateChange({ ...state, emailLink: checked === true })
                    }
                  />
                  <div className="flex flex-col gap-1">
                    <FieldLabel htmlFor={`${id}-email-link`}>
                      Email {draft?.recipient?.name ?? "them"} a link to
                      acknowledge it afterwards
                    </FieldLabel>
                    <FieldDescription>
                      Sent to {draft?.recipient?.email} when you record. The
                      link works for 30 days.
                    </FieldDescription>
                  </div>
                </Field>
              ))}
          </>
        )}
      </FieldSet>

      {/* "Hand them this device": the form surface, which fills a phone's
          screen, holding the same fields as the recipient's own phone. */}
      <PortalFormSurface
        open={staffView !== null}
        onOpenChange={(open) => {
          if (!open) setStaffView(null);
        }}
        withTrigger={false}
        title="Before you take these"
        description="Read this, then type your name and tick the box."
        onSubmit={acknowledgeHere}
        footer={
          <Button type="submit" disabled={isPending} focusableWhenDisabled>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "I understand"
            )}
          </Button>
        }
      >
        {staffView && (
          <AsIsAcknowledgementFields
            view={staffView.view}
            lexicon={staffView.lexicon}
            value={staffInput}
            onChange={setStaffInput}
            disabled={isPending}
          />
        )}
        {staffError && (
          <Alert variant="destructive">
            <AlertDescription>{staffError}</AlertDescription>
          </Alert>
        )}
      </PortalFormSurface>
    </div>
  );
}
