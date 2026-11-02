"use client";

import { useRef } from "react";
import { ArrowLeft, Ban, Check, Undo2 } from "lucide-react";
import type { EventRegistrant } from "./registrants-actions";
import { RegistrantMessageActions } from "./registrant-message-actions";
import { RegistrantAnswers } from "./registrant-answers";
import { setRegistrantPersonAnswersAction } from "./registrants-actions";
import { ProfileAnswers } from "@/components/portal/profile-answers";
import type { PersonAnswerRow, PersonQuestion } from "@/lib/person-questions";
import { RegistrantContact } from "./registrant-contact";
import { RegistrantGroupChat } from "./registrant-group-chat";
import { RegistrantReminder } from "./registrant-reminder";
import type { EventGroupChat } from "@/lib/registration-group-chat";
import {
  carpoolAssignments,
  carpoolLine,
  carpoolsHref,
  type EventCarpools,
} from "@/lib/event-carpools";
import Link from "next/link";
import { RegistrantBadges } from "./registrant-badges";
import type { RegistrationQuestion } from "@/lib/registration-questions";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RecordMessages } from "@/components/portal/record-messages";
import { useDeepLinkedSheet } from "@/components/portal/use-deep-linked-sheet";
import {
  messagingDisabledReason,
  type MessageActor,
  type RecordMessageRow,
} from "@/lib/outbound-messages";
import { REGISTRANT_MESSAGE_ERRORS } from "./registrant-messaging";
import { attendedBeforeLabel } from "@/lib/attended-before";
import { formatOptionCounts } from "@/lib/registration-options";
import { formatCodeWithPin } from "@/lib/discount-codes";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What a deep link names, so a future notification can open the portal at one
 * registration the way #742's links open it at one application.
 */
export const REGISTRANT_PARAM = "registrant";

/**
 * The row actions, for the phone check-in sheet (#1558), whose rows carry
 * only the check-in button: cancelling a registration lives here instead, with Cancel at the bottom and well away from Check in.
 */
export type RegistrantDoorActions = {
  pending: boolean;
  onToggleCheckIn: () => void;
  /** Absent without `events: manage`, and once they are through the door. */
  onCancel?: () => void;
};

/**
 * One registration, in full, and the correspondence about it (#1317).
 *
 * There was no registrant detail surface before this: the tab is a table whose
 * only per-row affordance was check-in. A
 * composer on its own would have reintroduced the problem it exists to fix --
 * a message sent with nowhere to see what was already sent is a message that
 * lives in somebody's sent items again -- so the history comes with it.
 *
 * Two audiences, deliberately. Door staff hold `events: view`, open this to
 * read a party size or a note, and see no messaging controls at all; the
 * organizer holds `events: manage` and sees the whole thing. The profile
 * answers follow their own gate -- they come back absent from
 * listEventRegistrantsAction() for a viewer who is not cleared for them -- so
 * this sheet cannot become a second place that data leaks from.
 */
export function RegistrantDetailSheet({
  registrant,
  eventName,
  messages,
  messageActors,
  orgName,
  replyTo,
  orgEmailEnabled,
  canManage,
  waiverInForce,
  photoConsentInForce,
  optionsPrompt = null,
  registrationQuestions = [],
  profileQuestions,
  profileAnswers,
  canEditProfileAnswers = false,
  groupChat = null,
  carpools = null,
  onClosed,
  onSent,
  onAnswersSaved,
  door,
}: {
  registrant: EventRegistrant;
  eventName: string;
  /** What has been sent about this registration, newest first. */
  messages: RecordMessageRow[];
  messageActors: MessageActor[];
  /** For the composer's default subject; blank if the tenant is unresolved. */
  orgName: string;
  /** The tenant's Reply-To, so the composer can say where a reply lands. */
  replyTo: string | null;
  orgEmailEnabled: boolean;
  canManage: boolean;
  /** The event's group chat (#1648); null when its switch is off. */
  groupChat?: EventGroupChat;
  /** The event's carpool plan (#1649); null when its switch is off. */
  carpools?: EventCarpools;
  /**
   * Whether this organization takes a participant waiver today (#686), which
   * is what separates "we never asked" from "this registration predates the
   * agreement". Nothing here ever means "they declined": declining is not
   * submitting, so a refusal leaves no registration to open.
   */
  waiverInForce: boolean;
  /**
   * Whether this organization publishes a photo notice today (#599, #1376).
   *
   * It no longer means "asks", because nothing asks: registering carries the
   * agreement and the record below holds an objection. It still decides
   * whether the field appears on a registrant with nothing on their row —
   * "no objection on record" is worth showing where there is something to
   * object to, and means nothing where the organization says nothing about
   * photos at all.
   */
  photoConsentInForce: boolean;
  /**
   * The event's registration question (#1407), or null where it asks none.
   * A registration can still carry an answer then -- the question was removed
   * after it was given -- and the answer is shown under a plain label.
   */
  optionsPrompt?: string | null;
  /**
   * The event's current registration questions (#1501). Answers to questions
   * archived since still show, from the registration's own rows.
   */
  registrationQuestions?: readonly RegistrationQuestion[];
  /**
   * The tenant's profile questions and this registrant's answers (#1744).
   * Absent for a reader not cleared for them, and answers are absent for a
   * registration with no person record, either of which leaves the section
   * out. Edited through set_registrant_person_answers(), which is also the
   * door path.
   */
  profileQuestions?: readonly PersonQuestion[];
  profileAnswers?: readonly PersonAnswerRow[];
  canEditProfileAnswers?: boolean;
  /** The sheet is mounted per target, so closing it unmounts it. */
  onClosed: () => void;
  onSent?: () => void;
  onAnswersSaved?: () => void;
  /** #1558. Set by the phone check-in sheet, which this fills the screen of. */
  door?: RegistrantDoorActions;
}) {
  // Always mounted open: the tab renders this only once it has a registrant to
  // show, so the hook's job here is the other half of its contract -- taking
  // `?registrant=` back out of the URL once the sheet has been dismissed, so a
  // refresh does not re-open it.
  const { open, onOpenChange } = useDeepLinkedSheet(REGISTRANT_PARAM, true);
  // Opening focuses the sheet itself, not its first tabbable element: that is
  // the tooltip-wrapped Close, whose tooltip would open on focus and swallow
  // the first Escape, leaving the sheet up.
  const popupRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) onClosed();
      }}
    >
      <SheetContent
        ref={popupRef}
        side="right"
        showCloseButton={false}
        initialFocus={popupRef}
        className={door ? "data-[side=right]:w-full" : undefined}
      >
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <Tooltip>
            <SheetClose
              render={
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Close"
                      className={door ? "size-11" : undefined}
                    />
                  }
                />
              }
            >
              <ArrowLeft />
            </SheetClose>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SheetTitle className={cn(door && "text-lg break-words")}>
              {registrant.name}
            </SheetTitle>
            <SheetDescription>
              Registered {formatDateTime(registrant.created_at)}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {door && (
            <div className="mb-6 flex flex-col gap-3">
              {/* What has to be known before they are through the door, above
                  the button that lets them through. */}
              <div className="flex flex-wrap gap-1 empty:hidden">
                <RegistrantBadges registrant={registrant} />
              </div>
              <Button
                type="button"
                size="lg"
                variant={registrant.checked_in_at ? "secondary" : "default"}
                className="h-12 w-full text-base"
                disabled={door.pending}
                onClick={door.onToggleCheckIn}
              >
                {registrant.checked_in_at ? (
                  <>
                    <Undo2 /> Undo check-in
                  </>
                ) : (
                  <>
                    <Check /> Check in party of {registrant.party_size}
                  </>
                )}
              </Button>
            </div>
          )}
          <FieldGroup>
            <ReadOnlyField label="Pronouns" htmlFor="registrant-pronouns">
              {registrant.pronouns || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Email" htmlFor="registrant-email">
              {registrant.email || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Phone" htmlFor="registrant-phone">
              {registrant.phone || "—"}
            </ReadOnlyField>
            {/* #1647. The handle, or the contact given in its place, and
                where staff change either. */}
            <RegistrantContact
              registrant={registrant}
              canManage={canManage}
              onSaved={onAnswersSaved}
            />
            {groupChat && (
              <RegistrantGroupChat
                registrant={registrant}
                groupChat={groupChat}
                canManage={canManage}
                onSaved={onAnswersSaved}
              />
            )}
            <RegistrantReminder
              registrant={registrant}
              canManage={canManage}
              orgEmailEnabled={orgEmailEnabled}
              onSent={onSent}
            />
            {carpools && (
              <ReadOnlyField label="Carpool" htmlFor="registrant-carpool">
                <Link
                  href={carpoolsHref(registrant.event_id)}
                  className="underline-offset-2 hover:underline"
                >
                  {carpoolLine(
                    carpoolAssignments(carpools.cars).get(registrant.id) ??
                      null,
                  )}
                </Link>
              </ReadOnlyField>
            )}
            <ReadOnlyField label="Party size" htmlFor="registrant-party-size">
              {registrant.party_size}
            </ReadOnlyField>
            {(optionsPrompt || registrant.option_counts.length > 0) && (
              <ReadOnlyField
                label={optionsPrompt ?? "Options"}
                htmlFor="registrant-options"
              >
                {registrant.option_counts.length > 0
                  ? formatOptionCounts(registrant.option_counts)
                  : "Not answered"}
              </ReadOnlyField>
            )}
            {/* #1589: only where one is held, with the PIN beside it. */}
            {(registrant.discount_codes ?? []).length > 0 && (
              <ReadOnlyField
                label="Discount code"
                htmlFor="registrant-discount-code"
              >
                {registrant.discount_codes?.map((held) => (
                  <span key={held.code} className="block">
                    {formatCodeWithPin(held)}
                  </span>
                ))}
              </ReadOnlyField>
            )}
            <ReadOnlyField label="Been before" htmlFor="registrant-been-before">
              {attendedBeforeLabel(registrant.attended_before) ?? "Not asked"}
            </ReadOnlyField>
            {/* Only for a party that has one. A row reading "no" on every
                other registrant would be a line about children on every
                record in the product, which is not what asking the question
                bought (#685). Null -- nobody asked -- shows nothing either:
                there is no answer to report. */}
            {registrant.party_includes_minor === true && (
              <>
                <ReadOnlyField
                  label="Under 18 in the party"
                  htmlFor="registrant-includes-minor"
                >
                  Yes
                </ReadOnlyField>
                {/* `minorContacts` is null for a reader without
                    `events: manage`, and it is null because the database
                    refuses them rather than because this component chose not
                    to ask: the four columns are revoked from `authenticated`
                    and served only by a definer view. So the door shift sees
                    the fact and not the guardian's number, and cannot reach
                    it with curl either. */}
                {registrant.minorContacts && (
                  <>
                    <ReadOnlyField
                      label="Accompanying adult"
                      htmlFor="registrant-accompanying-adult"
                    >
                      {registrant.minorContacts.accompanying_adult_name || "—"}
                      {registrant.minorContacts.accompanying_adult_phone
                        ? ` · ${registrant.minorContacts.accompanying_adult_phone}`
                        : ""}
                    </ReadOnlyField>
                    <ReadOnlyField
                      label="Emergency contact"
                      htmlFor="registrant-emergency-contact"
                    >
                      {registrant.minorContacts.emergency_contact_name || "—"}
                      {registrant.minorContacts.emergency_contact_phone
                        ? ` · ${registrant.minorContacts.emergency_contact_phone}`
                        : ""}
                    </ReadOnlyField>
                  </>
                )}
              </>
            )}
            {/* #1417. Only on a registration that carries one: every other
                registrant was never asked. */}
            {registrant.adults_only_confirmed_at && (
              <ReadOnlyField
                label="All 18 or over"
                htmlFor="registrant-adults-only"
              >
                Confirmed {formatDateTime(registrant.adults_only_confirmed_at)}
              </ReadOnlyField>
            )}
            <ReadOnlyField label="Checked in" htmlFor="registrant-checked-in">
              {registrant.checked_in_at
                ? formatDateTime(registrant.checked_in_at)
                : "Not yet"}
            </ReadOnlyField>
            {/* Hidden entirely on a tenant that has never taken a waiver and
                has none now: a row saying "not recorded" on every registrant
                of every event would be noise about a document that does not
                exist. It appears the moment one is adopted, and stays for any
                registration that carries an acceptance even if the agreement
                is later withdrawn. */}
            {(waiverInForce || registrant.waiver_accepted_at) && (
              <ReadOnlyField label="Agreement" htmlFor="registrant-waiver">
                {registrant.waiver_accepted_at ? (
                  <>
                    Accepted version {registrant.waiver_version} on{" "}
                    {formatDateTime(registrant.waiver_accepted_at)}.{" "}
                    {/* The permalink is the whole reason the column stores a
                        version rather than a copy of the text: somebody
                        reading this during a dispute reaches the exact words
                        without asking anybody. */}
                    <a
                      href={`/waiver?version=${registrant.waiver_version}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      Read that version
                    </a>
                  </>
                ) : (
                  // Not an em dash. "We had no agreement in force when they
                  // registered" and "they declined" are different facts, and
                  // only the first one can produce a row to read this on.
                  "Not recorded — no agreement was in force when they registered"
                )}
              </ReadOnlyField>
            )}
            {/* Photos, and the one field here that has to be able to say "do
                not" (#599, #1376). The waiver's two-state rendering above
                deliberately cannot -- its own comment says so -- because
                declining a waiver is declining to register, and no row
                survives it. This record has three states and all three are
                real:

                  objected  -- the date, and an instruction, because this is
                               the record somebody acts on
                  none      -- said plainly rather than left blank: "no
                               objection recorded" is a fact about the record,
                               and an empty cell reads as a gap in it
                  withdrawn -- the date, and the words they were shown

                Unlike the agreement it is shown on every registrant whose row
                carries something AND on those whose row does not, whenever the
                organization publishes a notice: an organizer scanning for
                objections needs to see that this row has none rather than that
                this field is missing. */}
            {(photoConsentInForce || registrant.photo_consent !== null) && (
              <ReadOnlyField label="Photos" htmlFor="registrant-photo-consent">
                {registrant.photo_consent === null ? (
                  "No objection recorded"
                ) : (
                  <>
                    {registrant.photo_consent
                      ? "Confirmed they are happy to be photographed or recorded"
                      : "Asked not to be photographed or recorded"}
                    {registrant.photo_consent_at
                      ? `, ${formatDateTime(registrant.photo_consent_at)}.`
                      : "."}
                    {/* The words snapshotted onto this row, not a link to the
                        words as they read today. A content slot has no version table
                        and no permalink -- which is why the column is a
                        snapshot (#1319's shape) -- so this disclosure is the
                        only place the actual text can be reached, and a
                        question about it months later has to be answerable
                        from the row itself. */}
                    {registrant.photo_consent_text && (
                      <details className="mt-1">
                        <summary className="app-muted cursor-pointer text-xs">
                          What they were asked
                        </summary>
                        <p className="app-muted mt-1 text-xs whitespace-pre-line">
                          {registrant.photo_consent_text}
                        </p>
                      </details>
                    )}
                  </>
                )}
              </ReadOnlyField>
            )}
            <ReadOnlyField label="Notes" htmlFor="registrant-notes">
              {registrant.notes || "—"}
            </ReadOnlyField>
          </FieldGroup>

          {profileQuestions &&
            profileAnswers &&
            (profileQuestions.length > 0 || profileAnswers.length > 0) && (
              <div className="mt-6">
                <ProfileAnswers
                  idPrefix="registrant-profile"
                  questions={profileQuestions}
                  answers={profileAnswers}
                  canManage={canEditProfileAnswers}
                  onSave={(answers) =>
                    setRegistrantPersonAnswersAction(registrant.id, answers)
                  }
                  onSaved={onAnswersSaved}
                />
              </div>
            )}

          <RegistrantAnswers
            registrationId={registrant.id}
            questions={registrationQuestions}
            answers={registrant.answers}
            canManage={canManage}
            onSaved={onAnswersSaved}
            changedAt={registrant.answers_changed_at}
          />

          {canManage ? (
            <section className="mt-6 flex flex-col gap-3">
              <h3 className="app-muted text-sm font-semibold">Messages</h3>
              <RegistrantMessageActions
                registrationId={registrant.id}
                registrantName={registrant.name}
                toEmail={registrant.email}
                eventName={eventName}
                orgName={orgName}
                replyTo={replyTo}
                onSent={onSent}
                asksQuestions={registrationQuestions.length > 0}
                disabledReason={messagingDisabledReason(
                  orgEmailEnabled,
                  registrant.email,
                  REGISTRANT_MESSAGE_ERRORS.NO_EMAIL,
                )}
              />
              <RecordMessages
                messages={messages}
                actors={messageActors}
                emptyMessage="Nothing has been sent to this registrant from the portal. The confirmation they received when they registered is not listed here — it was sent by the application itself."
              />
            </section>
          ) : null}

          {door?.onCancel && (
            <div className="mt-8 border-t pt-4">
              <Button
                type="button"
                variant="destructive"
                className="h-11 w-full"
                disabled={door.pending}
                onClick={door.onCancel}
              >
                <Ban /> Cancel registration
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
