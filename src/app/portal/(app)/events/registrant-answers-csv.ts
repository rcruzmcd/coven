/**
 * The registrants tab's "Download answers (CSV)" (#1501), as a pure function
 * so what lands in the file can be tested without a database. The route
 * handler beside the event page does the reading and the permission check.
 *
 * Contact details are the point of care here. Registering never implies
 * sharing (#1318, docs/legal-basis.md): an event's consent question marked
 * `shares_contact` is the only thing that puts a registrant's email and phone
 * into this file, and only on the rows that ticked it. An event with no such
 * question has no Email or Phone columns at all, so a file made for a partner
 * cannot carry them by accident.
 *
 * The Instagram handle is the exception, by the organization's choice: it is a
 * public handle the registrant gave so the organization can tag and find them,
 * and the export carries it on every row that has one, consent or not. So does
 * the *method* a registrant without Instagram asked to be reached by (#1647):
 * "Text message" says nothing about anybody. The number or address behind it
 * is a contact detail like the phone, and follows the same consent.
 *
 * Profile answers (#1744) -- how a registrant rides, at what level -- are not
 * contact details, so they are not under that consent. They appear for a
 * reader cleared for them (`person_answers: view`, which carries the
 * person_questions module), one column per current question, read the way
 * every figure reads them (#1746): a snapshotted question as of check-in
 * where the registration was snapshotted, as it stands now where it was not.
 */

import { preferredContactMethodLabel } from "@/lib/registration-contact";

export type AnswersCsvQuestion = {
  id: string;
  prompt: string;
  shares_contact: boolean;
};

/** A current profile question, as the export heads and reads it. */
export type AnswersCsvProfileQuestion = {
  id: string;
  prompt: string;
  column_label?: string | null;
  snapshot_at_checkin: boolean;
};

type ProfileAnswerWords = { question_id: string | null; answer_text: string };

export type AnswersCsvRegistration = {
  name: string;
  party_size: number;
  email: string | null;
  phone: string | null;
  instagram_handle: string | null;
  /** #1647. The no-Instagram contact; absent reads as none. */
  preferred_contact_method?: string | null;
  preferred_contact_detail?: string | null;
  /**
   * When the registrant last changed their own answers after registering
   * (#1591), or null where they never have.
   */
  answers_changed_at?: string | null;
  /**
   * Only read when the file is built with profile questions: the
   * registration's check-in snapshots and the person's current answers.
   */
  profile?: {
    snapshots: readonly ProfileAnswerWords[];
    answers: readonly ProfileAnswerWords[];
  };
  answers: {
    question_id: string | null;
    answer_text: string;
    value: unknown;
  }[];
};

/**
 * Whether this registration agreed to its contact details being shared: it
 * ticked a `shares_contact` question and declined none. Unanswered is not
 * agreement -- that is a registration from before the question existed, or a
 * walk-in nobody asked.
 */
export function sharesContact(
  questions: readonly AnswersCsvQuestion[],
  registration: AnswersCsvRegistration,
): boolean {
  const consentIds = new Set(
    questions
      .filter((question) => question.shares_contact)
      .map((question) => question.id),
  );
  const consents = registration.answers.filter(
    (answer) => answer.question_id && consentIds.has(answer.question_id),
  );
  return (
    consents.length > 0 && consents.every((answer) => answer.value === true)
  );
}

/**
 * One field, quoted where it has to be (RFC 4180), and with a leading `=`,
 * `+`, `-`, `@`, tab or carriage return neutralised by a `'` so a spreadsheet
 * opens it as text rather than running it as a formula. The answers are free
 * text typed by the public.
 */
export function csvField(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Name, party size, one column per current question in the event's order
 * (each its answer in words, blank where unanswered), then Answers changed --
 * the instant the registrant last changed them after registering, in UTC
 * (ISO 8601), blank where they never have (#1591) -- then one column per
 * profile question it is given (#1746), then Instagram and Preferred contact on
 * every row, then Email, Phone and Contact detail only where the event has a
 * `shares_contact` question -- filled only on the rows that agreed. CRLF line endings, as RFC 4180 and Excel
 * expect.
 */
export function registrantAnswersCsv(
  questions: readonly AnswersCsvQuestion[],
  registrations: readonly AnswersCsvRegistration[],
  {
    profileQuestions = [],
  }: { profileQuestions?: readonly AnswersCsvProfileQuestion[] } = {},
): string {
  const withContact = questions.some((question) => question.shares_contact);
  const header = [
    "Name",
    "Party size",
    ...questions.map((question) => question.prompt),
    "Answers changed",
    ...profileQuestions.map(
      (question) => question.column_label ?? question.prompt,
    ),
    "Instagram",
    "Preferred contact",
    ...(withContact ? ["Email", "Phone", "Contact detail"] : []),
  ];

  const rows = registrations.map((registration) => {
    const byQuestion = new Map(
      registration.answers.map((answer) => [
        answer.question_id,
        answer.answer_text,
      ]),
    );
    const shares = withContact && sharesContact(questions, registration);
    const snapshots = registration.profile?.snapshots ?? [];
    const current = registration.profile?.answers ?? [];
    return [
      registration.name,
      registration.party_size,
      ...questions.map((question) => byQuestion.get(question.id) ?? null),
      registration.answers_changed_at ?? null,
      ...profileQuestions.map((question) => {
        const source =
          question.snapshot_at_checkin && snapshots.length > 0
            ? snapshots
            : current;
        return (
          source.find((answer) => answer.question_id === question.id)
            ?.answer_text ?? null
        );
      }),
      // Bare, as stored: an `@` prefix would come out as `'@` from
      // csvField's formula guard.
      registration.instagram_handle || null,
      preferredContactMethodLabel(registration.preferred_contact_method),
      ...(withContact
        ? [
            shares ? registration.email || null : null,
            shares ? registration.phone || null : null,
            shares ? registration.preferred_contact_detail || null : null,
          ]
        : []),
    ];
  });

  return [header, ...rows]
    .map((row) => row.map(csvField).join(","))
    .join("\r\n")
    .concat("\r\n");
}

/** `spring-social-answers-2026-10-01.csv`; ASCII only, for the header. */
export function registrantAnswersCsvFilename(
  eventName: string,
  date: string,
): string {
  const slug = eventName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "event"}-answers-${date}.csv`;
}
