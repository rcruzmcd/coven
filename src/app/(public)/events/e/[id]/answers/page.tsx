import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { answerRowsToAnswers } from "@/lib/registration-questions";
import { ANSWER_LINK_INVALID } from "@/lib/registration-answer-requests";
import { lookUpAnswerLink } from "./answer-link";
import { AnswersForm } from "./answers-form";
import { RegistrationContactCard } from "@/app/(public)/events/registration-contact-card";
import { CarpoolAssignmentCard } from "@/components/carpool-assignment-card";
import { eventCarpoolNotice } from "@/lib/event-carpools";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Your registration answers",
  // A URL carrying a token is worth actively keeping out of an index, and out
  // of the Referer of anything this page loads or links to. next.config.ts
  // sends the same two as headers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where an emailed request for missing registration answers lands (#1502).
 *
 * Public by design: most registrants have no account, and the token is the
 * permission -- to this one registration's answers and nothing else. So the
 * page shows the event's name, a first name and the questions, and none of
 * the registration's contact or party details: a forwarded link gives away
 * almost nothing.
 */
export default async function RegistrationAnswersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  const token = typeof t === "string" ? t : "";
  const lookup = await lookUpAnswerLink(token, id);

  if ("error" in lookup) {
    return (
      <PageShell>
        <Heading>This link no longer works</Heading>
        <div className="mt-6 max-w-xl">
          <Alert>
            <AlertDescription>
              {lookup.error === "rate_limited"
                ? "Too many attempts. Please try again in a few minutes."
                : ANSWER_LINK_INVALID}
            </AlertDescription>
          </Alert>
        </div>
      </PageShell>
    );
  }

  const { link } = lookup;
  const site = link.carpool
    ? await getPublicSite(await createSupabaseServerClient())
    : null;
  return (
    <PageShell>
      <Heading>{link.eventName}</Heading>
      <div className="mt-6 flex max-w-xl flex-col gap-6">
        <p>
          {link.firstName ? `Hi ${link.firstName}, ` : ""}
          {link.questions.length > 0
            ? "here are this event's questions. Answer what you can and save — you can come back to this link to change an answer until the event ends."
            : link.contact
              ? "you can change how we reach you here until the event ends."
              : link.carpool
                ? "here's your carpool for this event. Come back to this link to see any changes."
                : "this event has no questions to answer any more. There's nothing to do here."}
        </p>
        {/* #1651. First, since for most registrants on a carpool event this
            link is the only place they see their car. */}
        {link.carpool && site ? (
          <CarpoolAssignmentCard
            carpool={link.carpool}
            orgName={site.name ?? "the organizers"}
            notice={eventCarpoolNotice(
              link.carpool.notice,
              site.content.paragraphs("events.carpool_cost_notice"),
            )}
          />
        ) : null}
        {/* #1647. Only the cards that apply: an event with no questions on a
            tenant that requires a handle shows this one alone. */}
        {link.contact ? (
          <RegistrationContactCard
            target={{ kind: "link", token }}
            contact={link.contact}
          />
        ) : null}
        {link.questions.length > 0 ? (
          <AnswersForm
            token={token}
            questions={link.questions}
            initialAnswers={answerRowsToAnswers(link.answerRows)}
          />
        ) : null}
      </div>
    </PageShell>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <div className="w-fit">
      <div className="rainbow-accent w-full" />
      <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
        {children}
      </h1>
    </div>
  );
}
