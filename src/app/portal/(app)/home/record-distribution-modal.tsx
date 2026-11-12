"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { List, ScanLine } from "lucide-react";
import type { DistributionDraft } from "@/lib/inventory-distribution-draft";
import type { EmailLinkAvailability } from "@/lib/distribution-acknowledgement";
import {
  listAvailableInventoryItemsAction,
  type AvailableInventoryItem,
} from "./distribution-actions";
import {
  discardDistributionDraftAction,
  getDistributionCheckoutAction,
  getDistributionDraftAction,
  moveDistributionDraftAction,
  recordDistributionDraftAction,
  setDistributionDraftRecipientAction,
} from "./distribution-draft-actions";
import { ScannedDistributionList } from "./scanned-distribution-list";
import {
  checkoutReady,
  DistributionCheckout,
  willEmailLink,
  EMPTY_CHECKOUT,
  type CheckoutState,
} from "./distribution-checkout";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";
import { useEventDateDefaults } from "../events/event-date-defaults";
import { nowDatetimeLocalInBrowser } from "@/lib/time";
import { removeTagsMessage, type ReleasedTag } from "@/lib/inventory-tags";

/**
 * The success toast's detail when recording freed numbered codes (#1444): it
 * stays until dismissed, because it is a job still to do -- taking the tags
 * off the gear.
 */
function removeTagsToast(tags: readonly ReleasedTag[] | undefined) {
  const description = removeTagsMessage(tags ?? []);
  return description ? { description, timeout: 0 } : {};
}

const NO_EVENT = "__none__";

/**
 * Records gear handed out in person, in two steps (#1519): build the handout
 * -- by scanning tags or picking from a list, onto one server-side list
 * (#1420) -- then check out: the numbered tags come off and the recipient
 * acknowledges the gear as-is themselves. Both inputs feed the same list, so
 * no handout reaches the database without the checkout.
 */
export function RecordDistributionModal({
  triggerLabel = "Record distribution",
  open: controlledOpen,
  onOpenChange,
  withTrigger = true,
  eventId,
  eventOptions,
  showRecipientField = false,
  onSaved,
}: {
  triggerLabel?: string;
  /** The event the handout is at. With `eventOptions`, only the default. */
  eventId?: string;
  /** Offers an Event field (#1443) -- the item page, where the event is not
   *  implied by where the modal was opened. */
  eventOptions?: { id: string; name: string }[];
  showRecipientField?: boolean;
  onSaved?: () => void;
} & ControlledOpenProps) {
  const router = useRouter();
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  const [availableItems, setAvailableItems] = useState<
    AvailableInventoryItem[]
  >([]);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [recipient, setRecipient] = useState<PickedPerson | null>(null);

  const [reason, setReason] = useState("");
  // Opened from an event's Distributions card, gear was handed out at that
  // event, so the field opens on the event's start. Opened from Inventory or
  // the home dashboard there is no event in context and it stays "now".
  const eventDates = useEventDateDefaults();
  const defaultOccurredAt = () =>
    eventDates.startsAt || nowDatetimeLocalInBrowser();
  const [occurredAt, setOccurredAt] = useState(defaultOccurredAt);
  const [markDistributed, setMarkDistributed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // How pieces are added. Both build the same server-side list, which
  // outlives the modal, so reopening it -- or adding from a tag opened in
  // another tab -- picks up where it was.
  const [mode, setMode] = useState<"pick" | "scan">("pick");
  const [step, setStep] = useState<"build" | "checkout">("build");
  const [needsAcknowledgement, setNeedsAcknowledgement] = useState(true);
  const [emailLink, setEmailLink] =
    useState<EmailLinkAvailability>("available");
  const [checkout, setCheckout] = useState<CheckoutState>(EMPTY_CHECKOUT);
  const [draft, setDraft] = useState<DistributionDraft | null>(null);
  const [conflictItemId, setConflictItemId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    eventId ?? null,
  );
  const draftEventId = selectedEventId;

  const loadDraft = useCallback(async () => {
    const result = await getDistributionDraftAction(draftEventId);
    if ("error" in result) return null;
    setDraft(result.data);
    return result.data;
  }, [draftEventId]);

  useEffect(() => {
    if (!open) return;
    getDistributionDraftAction(draftEventId).then((result) => {
      if ("error" in result) return;
      setDraft(result.data);
      if (result.data && result.data.items.length > 0) setMode("scan");
      // The recipient is kept on the list (#1443), so a list started in
      // another tab -- or before this one was closed -- comes back with it.
      if (showRecipientField && result.data?.recipient)
        setRecipient(result.data.recipient);
    });
    listAvailableInventoryItemsAction().then((result) => {
      if (!("error" in result)) setAvailableItems(result.data);
    });
    if (showRecipientField) {
      listPeopleAction().then((result) => {
        if (!("error" in result)) setPeople(result.data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // An iPhone NFC tap adds to the list from a new Safari tab; coming back to
  // this one shows what it added.
  useEffect(() => {
    if (!open || mode !== "scan") return;
    function onVisible() {
      if (document.visibilityState === "visible") void loadDraft();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open, mode, loadDraft]);

  function reset() {
    setReason("");
    setOccurredAt(defaultOccurredAt());
    setMarkDistributed(true);
    setRecipient(null);
    setError(null);
    setMode("pick");
    setStep("build");
    setCheckout(EMPTY_CHECKOUT);
    setConflictItemId(null);
    setSelectedEventId(eventId ?? null);
  }

  // The recipient belongs to the server-side list, so an iPhone tap that
  // opens a new tab adds to the same person's handout. Changing it voids an
  // acknowledgement already given (#1519), which the reload shows.
  function selectRecipient(person: PickedPerson | null) {
    setRecipient(person);
    startTransition(async () => {
      const result = await setDistributionDraftRecipientAction(
        draftEventId,
        person?.id ?? null,
      );
      if ("error" in result) setError(result.error);
      await loadDraft();
    });
  }

  function selectEvent(nextEventId: string | null) {
    const previousEventId = selectedEventId;
    setSelectedEventId(nextEventId);
    if (!draft) return;
    // The list is kept per event, so it moves with the choice.
    startTransition(async () => {
      const moved = await moveDistributionDraftAction(
        previousEventId,
        nextEventId,
      );
      if ("error" in moved) {
        setError(moved.error);
        setSelectedEventId(previousEventId);
        return;
      }
      const result = await getDistributionDraftAction(nextEventId);
      if (!("error" in result)) setDraft(result.data);
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function startCheckout() {
    startTransition(async () => {
      const result = await getDistributionCheckoutAction(draftEventId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setNeedsAcknowledgement(result.needsAcknowledgement);
      setEmailLink(result.emailLink);
      await loadDraft();
      setStep("checkout");
    });
  }

  function record() {
    startTransition(async () => {
      const result = await recordDistributionDraftAction({
        eventId: draftEventId,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        reason,
        recipientPersonId: recipient?.id,
        markDistributed,
        removedTags: checkout.removedTags,
        skippedReason: draft?.acknowledgement
          ? undefined
          : (checkout.skippedReason ?? undefined),
        skippedNote: checkout.skippedNote,
        emailLink: willEmailLink(draft, emailLink, checkout),
      });
      if ("error" in result) {
        setError(result.error);
        setConflictItemId(result.itemId ?? null);
        await loadDraft();
        if (result.itemId) setStep("build");
        return;
      }
      setDraft(null);
      handleOpenChange(false);
      toast.success(
        result.count === 1
          ? "Distribution recorded."
          : `${result.count} distributions recorded.`,
        removeTagsToast(result.releasedTags),
      );
      if (result.emailLink === "sent") {
        toast.success("Emailed them a link to acknowledge it.");
      } else if (result.emailLink === "not_sent") {
        toast.error(
          "The handout is recorded, but the link to acknowledge it could not be emailed.",
        );
      }
      router.refresh();
      onSaved?.();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (step === "build") startCheckout();
    else record();
  }

  function clearList() {
    startTransition(async () => {
      const result = await discardDistributionDraftAction(draftEventId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDraft(null);
      setConflictItemId(null);
    });
  }

  const itemCount = draft?.items.length ?? 0;
  const itemsLabel = itemCount === 1 ? "1 item" : `${itemCount} items`;
  const ready =
    step === "checkout" &&
    checkoutReady(draft, markDistributed, needsAcknowledgement, checkout);

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      withTrigger={withTrigger}
      trigger={
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
        >
          {triggerLabel}
        </Button>
      }
      title={step === "build" ? "Record a distribution" : "Check out"}
      description={
        step === "build"
          ? "Record gear being handed out from inventory."
          : `Handing out ${itemsLabel}${recipient?.name ? ` to ${recipient.name}` : ""}.`
      }
      onSubmit={handleSubmit}
      footer={
        <>
          {step === "build" && itemCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="sm:mr-auto"
              disabled={isPending}
              onClick={clearList}
            >
              Clear list
            </Button>
          )}
          {step === "checkout" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => {
                setError(null);
                setStep("build");
              }}
            >
              Back
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              {itemCount > 0 ? "Close" : "Cancel"}
            </Button>
          )}
          <Button
            type="submit"
            disabled={
              isPending || itemCount === 0 || (step === "checkout" && !ready)
            }
          >
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : step === "build" ? (
              `Check out ${itemsLabel}`
            ) : (
              `Record ${itemsLabel}`
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        {step === "checkout" ? (
          <DistributionCheckout
            eventId={draftEventId}
            draft={draft}
            markDistributed={markDistributed}
            needsAcknowledgement={needsAcknowledgement}
            emailLink={emailLink}
            state={checkout}
            onStateChange={setCheckout}
            onDraftChanged={loadDraft}
          />
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setError(null);
                  setMode(mode === "scan" ? "pick" : "scan");
                }}
              >
                {mode === "scan" ? <List /> : <ScanLine />}
                {mode === "scan" ? "Pick from a list" : "Scan tags"}
              </Button>
            </div>
            <ScannedDistributionList
              inputMode={mode}
              eventId={draftEventId}
              draft={draft}
              recipientId={recipient?.id ?? null}
              availableItems={availableItems}
              conflictItemId={conflictItemId}
              releasesCodes={markDistributed}
              onChanged={async () => {
                setConflictItemId(null);
                await loadDraft();
              }}
            />

            <Field>
              <FieldLabel htmlFor="dist-occurredAt">Date &amp; time</FieldLabel>
              <Input
                id="dist-occurredAt"
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </Field>

            {eventOptions && (
              <Field>
                <FieldLabel htmlFor="dist-event">Event</FieldLabel>
                <Select
                  value={selectedEventId ?? NO_EVENT}
                  onValueChange={(value) =>
                    selectEvent(value && value !== NO_EVENT ? value : null)
                  }
                >
                  <SelectTrigger id="dist-event" className="w-full">
                    <SelectValue>
                      {(value: string) =>
                        eventOptions.find((option) => option.id === value)
                          ?.name ?? "No event"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_EVENT}>No event</SelectItem>
                    {eventOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {showRecipientField && (
              <Field>
                <FieldLabel htmlFor="record-distribution-recipient">
                  Recipient
                </FieldLabel>
                <PersonPicker
                  id="record-distribution-recipient"
                  people={people}
                  selected={recipient}
                  onSelect={selectRecipient}
                  onPersonCreated={(person) =>
                    setPeople((prev) => [...prev, person])
                  }
                  placeholder="Search recipient by name or email..."
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="dist-reason">Reason / notes</FieldLabel>
              <Textarea
                id="dist-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id="dist-markDistributed"
                checked={markDistributed}
                onCheckedChange={(checked) =>
                  setMarkDistributed(Boolean(checked))
                }
              />
              <FieldLabel htmlFor="dist-markDistributed">
                Mark item as distributed
              </FieldLabel>
            </Field>
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
