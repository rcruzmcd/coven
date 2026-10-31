"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PronounsField } from "@/components/pronouns-field";
import { AttendedBeforeField } from "@/components/attended-before-field";
import {
  EMPTY_MINOR_CONTACTS,
  MinorAccompanimentFields,
  type MinorContactValues,
} from "@/components/minor-accompaniment-fields";
import { PartyIncludesMinorField } from "@/components/party-includes-minor-field";
import { AdultsOnlyConfirmationField } from "@/components/adults-only-confirmation-field";
import { ADULTS_ONLY_CONFIRMED_FIELD } from "@/lib/adults-only";
import { MINORS_ASKED_FIELD } from "@/lib/minors";
import { PhotoConsentNotice } from "@/components/photo-consent-notice";
import { CarpoolCostNotice } from "@/components/carpool-cost-notice";
import { waiverAcceptanceLabel } from "@/lib/photo-consent";
import { RegistrationOptionCountsField } from "@/components/registration-option-counts-field";
import { RegistrationQuestionsFields } from "@/components/registration-questions-fields";
import {
  answerSummaryRows,
  answersError,
  draftToAnswers,
  emptyAnswerDraft,
  setAnswersField,
  type AnswerDraft,
  type RegistrationQuestion,
} from "@/lib/registration-questions";
import {
  optionCountsError,
  setOptionCounts,
  type OptionCounts,
  type RegistrationOptionsQuestion,
} from "@/lib/registration-options";
import { InstagramOrContactFields } from "@/components/instagram-or-contact-fields";
import {
  contactError,
  contactValuesFrom,
  setContactFields,
  type ContactValues,
} from "@/lib/registration-contact";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import type { MyContactDetails } from "@/lib/constituent/contact";
import { registerMyselfForEventAction } from "./my-registration-actions";
import type { WaiverOnFile } from "./my-registration";
import type { RegistrationStep } from "./registration-step";
import { RegistrationSteps } from "./registration-steps";
import { trackForm } from "@/lib/analytics/form-events";
import {
  attendedBeforeRows,
  contactSummaryRows,
  eventSummaryRows,
} from "./registration-summary";
import {
  EMPTY_RIDING,
  RidingFields,
  ridingSummaryRows,
  ridingValuesFromPerson,
  setRidingFields,
  type RidingValues,
} from "./riding-fields";
import type { PublicRiderProfile } from "@/lib/rider-profile";

/**
 * Registering as yourself (#1165).
 *
 * Shorter than the anonymous form by the two fields that cause the trouble:
 * name and email are read off the record rather than typed, so a registration
 * cannot land on a second copy of somebody because they typed a different
 * address this time. They are shown, because a person is entitled to see which
 * name they are about to appear under, and changing either is a link to
 * `/my/details` -- where a name is saved and an address is confirmed before it
 * moves.
 *
 * The rest is about this one attendance and travels on the registration alone:
 * a phone number corrected here reaches the organizer of this event and does
 * not silently rewrite the record. The one exception is the riding answers
 * (#1415), which describe the person rather than this attendance: they start
 * from the record and are written back to it.
 */
export function MyEventRegistrationForm({
  eventId,
  person,
  waiver = null,
  waiverBlock = null,
  waiverOnFile = null,
  asksAboutMinors = true,
  requiresInstagram = false,
  adultsOnly = false,
  minorAccompaniment = [],
  photoConsent = [],
  carpoolCostNotice = [],
  registrationOptions = null,
  registrationQuestions = [],
  riderProfile = null,
}: {
  eventId: string;
  person: MyContactDetails;
  /**
   * The participant agreement's version, when this organization takes one
   * (#686). Asked of a signed-in caller exactly as it is of an anonymous one:
   * holding an account is not agreement to anything, and a path that skipped
   * it would be the shortest way to a registration with nothing behind it.
   */
  waiver?: { version: number; title: string } | null;
  /** The agreement itself, rendered on the server. */
  waiverBlock?: React.ReactNode;
  /**
   * The acceptance this person already has on file (#1401). When it is for
   * the version being shown, the agreement and its box give way to one line
   * saying so, and the RPC copies the acceptance onto the registration. A
   * different version -- the page raced a republish -- asks in full.
   */
  waiverOnFile?: WaiverOnFile | null;
  /**
   * Whether this organization asks about under-18s at registration (#1416).
   * Off, the question and the contacts it reveals do not render and nothing
   * about them is sent. On -- the default, and every tenant that has not
   * turned it off -- is #685's form unchanged.
   */
  asksAboutMinors?: boolean;
  /**
   * Whether this organization requires an Instagram handle (#1647), as on the
   * anonymous form.
   */
  requiresInstagram?: boolean;
  /**
   * Whether the event is adults only (#1417): step 2 asks for the
   * confirmation, as on the anonymous form.
   */
  adultsOnly?: boolean;
  /**
   * This organization's rule for a party that includes anyone under 18
   * (#685). Empty on a tenant that has written none.
   */
  minorAccompaniment?: string[];
  /**
   * This organization's photos-and-video paragraphs (#599, #1376). Empty on a
   * tenant that has written none, and empty means the form says nothing at
   * all. Shown to a signed-in caller exactly as to an anonymous one: holding
   * an account is not permission to photograph anybody, and it is not a reason
   * to tell somebody less.
   */
  photoConsent?: string[];
  /**
   * The carpool cost-split notice (#1650), shown under the event's questions
   * and again on the review step. Empty -- every event that does not organize
   * carpools -- renders nothing. Notice only: no box, nothing sent back.
   */
  carpoolCostNotice?: string[];
  /**
   * The event's registration question (#1407). Null for an event that asks
   * none, which leaves this form exactly as it was.
   */
  registrationOptions?: RegistrationOptionsQuestion | null;
  /**
   * The event's registration questions (#1501), answered once for the whole
   * registration. Empty for an event that asks none, which leaves this form
   * exactly as it was.
   */
  registrationQuestions?: RegistrationQuestion[];
  /**
   * The riding questions on step 2 (#1415), as on the anonymous form. Null on
   * a tenant without the rider_profile module.
   */
  riderProfile?: PublicRiderProfile | null;
}) {
  const [phone, setPhone] = useState(person.phone ?? "");
  const [pronouns, setPronouns] = useState(person.pronouns ?? "");
  // #1647. The handle starts from their record, as it always has; the
  // no-Instagram contact is about this registration and starts empty.
  const [contact, setContact] = useState<ContactValues>(() =>
    contactValuesFrom({ instagram_handle: person.instagram_handle }),
  );
  const [partySize, setPartySize] = useState("1");
  // Empty until they say otherwise (#1259). Deliberately not seeded from
  // `my_event_history()`: prefilling it would cost this public page a second
  // round trip to pre-tick a control that is one click either way, and it
  // would blur the one self-reported answer into the derived figure it exists
  // to sit beside.
  const [attendedBefore, setAttendedBefore] = useState("");
  // #685. Required here as on the anonymous form, and starting empty for the
  // same reason: holding an account says nothing about who is coming with you.
  const [partyIncludesMinor, setPartyIncludesMinor] = useState("");
  const [minorContacts, setMinorContacts] =
    useState<MinorContactValues>(EMPTY_MINOR_CONTACTS);
  // #1417. Unticked, always, as on the anonymous form.
  const [adultsOnlyConfirmed, setAdultsOnlyConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  // #1415. Filled in from their own record -- this reader is signed in and
  // linked to it, which is the only case where prefilling discloses nothing.
  const [riding, setRiding] = useState<RidingValues>(() =>
    riderProfile
      ? ridingValuesFromPerson(person, riderProfile.mountains)
      : EMPTY_RIDING,
  );
  // #1407, starting empty as on the anonymous form.
  const [optionCounts, setOptionCountsState] = useState<OptionCounts>({});
  // #1501. Nothing chosen and every box unticked: a preselected answer is one
  // the form gave on their behalf, and a pre-ticked consent is no consent.
  const [answerDraft, setAnswerDraft] = useState<AnswerDraft>(() =>
    emptyAnswerDraft(registrationQuestions),
  );
  const answers = draftToAnswers(registrationQuestions, answerDraft);
  // Unticked, always (#686).
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [error, setError] = useState<{
    message: string;
    step: RegistrationStep;
  } | null>(null);
  const [registered, setRegistered] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onFile =
    waiver && waiverOnFile?.version === waiver.version ? waiverOnFile : null;

  const displayName =
    person.preferred_name?.trim() || person.name?.trim() || "";

  function handleSubmit() {
    setError(null);

    const contactProblem = contactError(contact, requiresInstagram);
    if (contactProblem) {
      setError({ message: contactProblem, step: "about" });
      return;
    }

    if (registrationOptions) {
      const message = optionCountsError(optionCounts, Number(partySize));
      if (message) {
        setError({ message, step: "event" });
        return;
      }
    }

    const answerProblem = answersError(registrationQuestions, answers);
    if (answerProblem) {
      setError({ message: answerProblem.message, step: "event" });
      return;
    }

    const formData = new FormData();
    formData.set("partySize", partySize);
    if (adultsOnly && adultsOnlyConfirmed) {
      formData.set(ADULTS_ONLY_CONFIRMED_FIELD, "on");
    }
    if (riderProfile) setRidingFields(formData, riding);
    if (registrationOptions) setOptionCounts(formData, optionCounts);
    if (registrationQuestions.length > 0) setAnswersField(formData, answers);
    formData.set("notes", notes);
    formData.set("phone", phone);
    formData.set("pronouns", pronouns);
    setContactFields(formData, contact, requiresInstagram);
    formData.set("attendedBefore", attendedBefore);
    if (asksAboutMinors) {
      formData.set(MINORS_ASKED_FIELD, "on");
      formData.set("partyIncludesMinor", partyIncludesMinor);
    }
    if (asksAboutMinors && partyIncludesMinor === "yes") {
      for (const [key, value] of Object.entries(minorContacts)) {
        formData.set(key, value);
      }
    }
    if (waiver) {
      // Nothing ticked when it is on file: there was no box. The version still
      // goes, so a republish since this page rendered is refused as a change
      // rather than as a box they were never shown (#1401).
      formData.set("waiverAccepted", waiverAccepted && !onFile ? "on" : "");
      formData.set("waiverVersion", String(waiver.version));
    }

    startTransition(async () => {
      const result = await registerMyselfForEventAction(eventId, formData);
      if ("error" in result) {
        setError({ message: result.error, step: result.step });
        trackForm("event_registration", "form_failed", {
          event_id: eventId,
          step: result.step,
          error_code: result.code ?? "INVALID_FORM",
        });
        return;
      }
      trackForm("event_registration", "form_completed", { event_id: eventId });
      setRegistered(true);
    });
  }

  if (registered) {
    return (
      <Alert>
        <div className="rainbow-accent mb-2 w-10" />
        <AlertDescription>
          You&apos;re registered! We look forward to seeing you there.
          <span className="mt-1 block">
            {person.email
              ? `We've emailed a copy to ${person.email}.`
              : "It is on your account."}{" "}
            <Link href={MY_PATH_PREFIX} className="underline">
              See it on your account
            </Link>
            .
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  // Something to agree to or be told, or the agreement already on file. With
  // neither -- a tenant with no agreement, no photo paragraphs and no carpool
  // notice -- the last step is the summary alone.
  const hasReview =
    waiver !== null ||
    [...photoConsent, ...carpoolCostNotice].some((paragraph) =>
      paragraph.trim(),
    );

  return (
    <RegistrationSteps
      eventId={eventId}
      error={error}
      isPending={isPending}
      onSubmit={handleSubmit}
      eventLegend={riderProfile ? "Your riding" : undefined}
      about={
        <>
          <p className="app-muted text-sm leading-relaxed">
            Registering as {displayName || "yourself"}
            {person.email ? ` (${person.email})` : ""}.{" "}
            <Link href={`${MY_PATH_PREFIX}/details`} className="underline">
              Not you, or out of date?
            </Link>
          </p>

          <Field orientation="responsive">
            <Field>
              <FieldLabel htmlFor="my-registration-phone">Phone</FieldLabel>
              <Input
                id="my-registration-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <FieldDescription>
                For this event only. We keep what is on your record.
              </FieldDescription>
            </Field>
            <PronounsField
              id="my-registration-pronouns"
              value={pronouns}
              onChange={setPronouns}
            />
          </Field>

          <InstagramOrContactFields
            idPrefix="my-registration"
            values={contact}
            onChange={setContact}
            required={requiresInstagram}
            disabled={isPending}
            instagramLabel="Instagram"
          />

          {/* The same question the anonymous form asks, in the same words, from
                the same component (#1259). This reader is the one place the ticket
                allows it to be skipped or prefilled from their own history, and it
                is neither: a self-reported answer is a different fact from the
                check-in ledger, and the ledger only knows the events this tenant
                ran here. */}
          <AttendedBeforeField
            id="my-registration-attended-before"
            value={attendedBefore}
            onChange={setAttendedBefore}
          />
        </>
      }
      event={
        <>
          <Field>
            <FieldLabel htmlFor="my-registration-party">
              How many of you?
            </FieldLabel>
            <Input
              id="my-registration-party"
              type="number"
              min="1"
              inputMode="numeric"
              value={partySize}
              onChange={(event) => setPartySize(event.target.value)}
            />
          </Field>

          {/* The same question the anonymous form asks, in the same words, from
                the same component (#685). A signed-in caller is not exempt: an
                account says who is registering and nothing about who is coming
                with them. */}
          {asksAboutMinors && (
            <>
              <PartyIncludesMinorField
                id="my-registration-party-includes-minor"
                value={partyIncludesMinor}
                onChange={setPartyIncludesMinor}
                disabled={isPending}
              />
              {partyIncludesMinor === "yes" && (
                <MinorAccompanimentFields
                  idPrefix="my-registration"
                  paragraphs={minorAccompaniment}
                  values={minorContacts}
                  onChange={setMinorContacts}
                  disabled={isPending}
                />
              )}
            </>
          )}

          {adultsOnly && (
            <AdultsOnlyConfirmationField
              id="my-registration-adults-only"
              checked={adultsOnlyConfirmed}
              onChange={setAdultsOnlyConfirmed}
              disabled={isPending}
            />
          )}
          {riderProfile && (
            <RidingFields
              idPrefix="my-registration"
              mountains={riderProfile.mountains}
              values={riding}
              onChange={setRiding}
              disabled={isPending}
            />
          )}

          {registrationOptions && (
            <RegistrationOptionCountsField
              idPrefix="my-registration"
              question={registrationOptions}
              counts={optionCounts}
              onChange={setOptionCountsState}
              partySize={Number(partySize)}
              disabled={isPending}
            />
          )}
          <RegistrationQuestionsFields
            idPrefix="my-registration"
            questions={registrationQuestions}
            draft={answerDraft}
            onChange={setAnswerDraft}
            disabled={isPending}
          />
          <CarpoolCostNotice paragraphs={carpoolCostNotice} />

          <Field>
            <FieldLabel htmlFor="my-registration-notes">
              Anything we should know?
            </FieldLabel>
            <Textarea
              id="my-registration-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </>
      }
      summary={{
        about: [
          ...(displayName ? [{ label: "Name", value: displayName }] : []),
          ...(person.email ? [{ label: "Email", value: person.email }] : []),
          ...(phone.trim() ? [{ label: "Phone", value: phone.trim() }] : []),
          ...(pronouns.trim()
            ? [{ label: "Pronouns", value: pronouns.trim() }]
            : []),
          ...contactSummaryRows(contact, requiresInstagram),
          ...attendedBeforeRows(attendedBefore),
        ],
        event: eventSummaryRows({
          partySize,
          partyIncludesMinor,
          minorContacts,
          adultsOnlyConfirmed: adultsOnly && adultsOnlyConfirmed,
          riding: riderProfile ? ridingSummaryRows(riding) : [],
          registrationOptions,
          optionCounts,
          answers: answerSummaryRows(registrationQuestions, answers),
          notes,
        }),
      }}
      review={
        hasReview ? (
          <>
            {/* Above the agreement, the same order the anonymous form uses and
                for the same reason: prose sitting beneath "I accept" reads as
                part of what is being accepted. This form carries no privacy
                notice of its own -- that is #684's territory and a signed-in
                caller has already been told -- so this is the only notice here,
                and the waiver's box below it is the only control taking
                anything (#1376). */}
            <PhotoConsentNotice paragraphs={photoConsent} />
            <CarpoolCostNotice paragraphs={carpoolCostNotice} />

            {/* Immediately above the button that acts on it, the same placement
                the anonymous form uses. This form carries no privacy notice --
                that is #684's territory and a signed-in caller has already been
                told -- so the agreement is the last thing read before
                submitting. The server refuses an unticked box independently of
                the `required` here; see `accepted_waiver_version()`. */}
            {waiver && onFile && (
              /* Already accepted, this version (#1401). One line in place of
                 the longest block on the form, and still a link to the words,
                 since having agreed to something is no reason not to be able to
                 read it again. A republish makes this disappear on its own: the
                 RPC behind `onFile` only answers for the version in force. */
              <p className="app-muted text-sm">
                {waiver.title} v{waiver.version} · accepted{" "}
                {/* The browser's own zone, like every date a reader is shown
                    about themselves, so the server's rendering of it can differ
                    by a day at the edges. */}
                <time dateTime={onFile.accepted_at} suppressHydrationWarning>
                  {formatAcceptedDay(onFile.accepted_at)}
                </time>{" "}
                ·{" "}
                <Link
                  href={`/waiver?version=${waiver.version}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${waiver.title}, version ${waiver.version}, in a new tab`}
                  className="hover:text-foreground underline underline-offset-4"
                >
                  view
                </Link>
              </p>
            )}

            {waiver && !onFile && (
              <>
                {waiverBlock}
                <Field orientation="horizontal">
                  <Checkbox
                    id="my-registration-waiver"
                    checked={waiverAccepted}
                    onCheckedChange={(next) => setWaiverAccepted(next === true)}
                    disabled={isPending}
                    required
                  />
                  <FieldLabel htmlFor="my-registration-waiver" required>
                    {waiverAcceptanceLabel(waiver.title, photoConsent)}
                  </FieldLabel>
                </Field>
              </>
            )}
          </>
        ) : null
      }
    />
  );
}

/** "Oct 4, 2026", in the reader's own zone. */
function formatAcceptedDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
