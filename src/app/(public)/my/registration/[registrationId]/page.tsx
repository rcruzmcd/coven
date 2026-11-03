import type { Metadata } from "next";
import { ClaimHandoff } from "@/app/(public)/my/claim-handoff";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { myRegistrationClaimPath } from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import {
  answerRowsToAnswers,
  toRegistrationQuestion,
  type RegistrationQuestion,
} from "@/lib/registration-questions";
import { RegistrationContactCard } from "@/app/(public)/events/registration-contact-card";
import { CarpoolAssignmentCard } from "@/components/carpool-assignment-card";
import { eventCarpoolNotice } from "@/lib/event-carpools";
import { toRegistrantCarpool } from "@/lib/carpool-assignment";
import { PhotoConsentCard } from "./photo-consent-card";
import { RegistrationAnswersCard } from "./registration-answers-card";
import { RegistrationOptionsCard } from "./registration-options-card";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Your registration"),
    // One person's record. Nothing under /my is worth finding in a search
    // result, and the area carries no robots.ts to say so for it.
    robots: { index: false, follow: false },
  };
}

/** Where the registration sign-up hand-off lands (#1258). See `ClaimHandoff`. */
export default async function MyRegistrationPage({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) {
  const { registrationId } = await params;
  const { personId } = await requireConstituentSession(
    myRegistrationClaimPath(registrationId),
  );

  const supabase = await createSupabaseServerClient();

  // #599, reversed by #1376. The one thing on this page that is theirs to
  // change rather than to read: asking not to be photographed. It is the
  // self-service one of the three routes the registration form names, and the
  // narrowest -- the other two, an organizer and email, reach everybody, and
  // this one reaches only somebody who has claimed an account.
  //
  // Read through `my_photo_consent()`, which resolves the person itself, so an
  // id belonging to somebody else returns no rows and renders nothing. That is
  // the same silence `ClaimHandoff` keeps above: a page that said "not yours"
  // would be a way to test ids.
  //
  // `asked` is whether the organization publishes a photo notice *now* -- that
  // is, whether there is anything to object to. It is computed from the
  // tenant's slot alone, with no reference to this row's own columns, so the
  // control appears for every registrant of a tenant that publishes one,
  // including the overwhelming majority whose columns are null. The paragraphs
  // come from the live slot for the same reason: somebody objecting is
  // objecting to today's words, which is what the RPC snapshots.
  const { data: photoRows } = await supabase.rpc("my_photo_consent", {
    p_registration_id: registrationId,
  });
  const photo = photoRows?.[0] ?? null;

  // #1407. The event's registration question, with this person's answer and
  // how much of each option they could hold. Through the same person
  // resolution as the photo read above, so somebody else's id renders
  // nothing.
  const { data: optionRows } = await supabase.rpc(
    "my_registration_option_counts",
    { p_registration_id: registrationId },
  );
  const options = optionRows ?? [];
  const optionsCard =
    options.length > 0 && options[0].prompt ? (
      <RegistrationOptionsCard
        registrationId={registrationId}
        question={{
          prompt: options[0].prompt,
          options: options.map((row) => ({
            id: row.option_id,
            label: row.label,
            isFull: row.available === 0,
            available: row.available,
          })),
        }}
        initialCounts={Object.fromEntries(
          options.map((row) => [row.option_id, row.quantity]),
        )}
        partySize={options[0].party_size}
        editable={options[0].editable}
      />
    ) : null;

  // #1501. The event's registration questions with this person's answers.
  // Same person resolution again, so somebody else's id renders nothing, and
  // an event with no questions returns no rows and renders no card. This is
  // also where somebody who registered before the questions existed answers
  // them.
  const { data: questionRows } = await supabase.rpc(
    "my_registration_questions",
    { p_registration_id: registrationId },
  );
  const answerRows = questionRows ?? [];
  const questions = answerRows
    .map(toRegistrationQuestion)
    .filter((question): question is RegistrationQuestion => question !== null);
  const answersCard =
    questions.length > 0 ? (
      <RegistrationAnswersCard
        registrationId={registrationId}
        questions={questions}
        initialAnswers={answerRowsToAnswers(answerRows)}
        answerTexts={Object.fromEntries(
          answerRows.flatMap((row) =>
            row.answer_text
              ? [[row.question_id, row.answer_text] as const]
              : [],
          ),
        )}
        editable={answerRows[0].editable}
      />
    ) : null;
  // #1647. The handle or the contact in its place, where the organization
  // requires one. Same person resolution, so somebody else's id renders
  // nothing.
  const { data: contactRows } = await supabase.rpc("my_registration_contact", {
    p_registration_id: registrationId,
  });
  const contact = contactRows?.[0] ?? null;
  const contactCard = contact?.requires_instagram ? (
    <RegistrationContactCard
      target={{ kind: "my", registrationId }}
      contact={contact}
      editable={contact.editable}
    />
  ) : null;
  // #1651. Their car, driver and car-mates, on an event that organizes
  // carpools. Same person resolution, so somebody else's id renders nothing.
  const { data: carpoolData } = await supabase.rpc("my_registration_carpool", {
    p_registration_id: registrationId,
  });
  const carpool = toRegistrantCarpool(carpoolData);
  const site = await getPublicSite(supabase);
  const { content } = site;
  const carpoolCard = carpool ? (
    <CarpoolAssignmentCard
      carpool={carpool}
      orgName={site.name ?? "the organizers"}
      notice={eventCarpoolNotice(
        carpool.notice,
        content.paragraphs("events.carpool_cost_notice"),
      )}
    />
  ) : null;

  return (
    <ClaimHandoff
      title="Your registration"
      lede="You're registered either way — this only decides whether it ends up on your account."
      record={{ kind: "registration", id: registrationId }}
      personId={personId}
      after={
        carpoolCard ||
        contactCard ||
        optionsCard ||
        answersCard ||
        photo?.asked ? (
          <div className="flex flex-col gap-6">
            {carpoolCard}
            {contactCard}
            {optionsCard}
            {answersCard}
            {photo?.asked ? (
              <PhotoConsentCard
                registrationId={registrationId}
                paragraphs={content.paragraphs("events.photo_consent")}
                consent={photo.consent}
              />
            ) : null}
          </div>
        ) : null
      }
    />
  );
}
