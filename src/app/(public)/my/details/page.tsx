import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import type { MyContactDetails } from "@/lib/constituent/contact";
import { loadMyPersonQuestions } from "@/lib/person-questions-public";
import { ContactForm } from "./contact-form";
import { EmailChangeForm } from "./email-form";
import { MyPageLayout } from "../my-page-layout";

const MY_DETAILS_PATH = `${MY_PATH_PREFIX}/details`;

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Your details"),
    // One person's record. Nothing under /my is worth finding in a search
    // result, and the area carries no robots.ts to say so for it.
    robots: { index: false, follow: false },
  };
}

/**
 * Correcting your own contact details (#1164).
 *
 * A page of its own rather than a section of `/my`, on the rule
 * docs/portal-navigation.md states: keeping your record current is a different
 * job from reading what you have done, not a different view of it. The link
 * between them is the navigation.
 *
 * An account that is signed in but not yet linked to a record is sent back to
 * `/my`, which is where the claim form is. There is nothing to edit until a
 * staffer has approved the claim, and a form with no record behind it would
 * fail at the database with nothing useful to say.
 *
 * ## What a card means here
 *
 * The page carried four of them, one per group, and they were the same box
 * four times over -- while three of the four saved together on one button at
 * the foot of the page and the fourth had a button of its own. Identical
 * chrome over two different commits is the thing a reader cannot see past:
 * nothing on screen said what "Save" saved.
 *
 * So a card now means *this commits on its own*, and only the email block
 * qualifies -- an address changes when a link sent to it comes back, not when
 * a form is submitted. `ContactForm`'s three groups are plain sections under
 * their own legends, which is the structure #1181 established and the card
 * borders were only redrawing. The card sits last for the same reason:
 * everything above the Save button belongs to it.
 */
export default async function MyDetailsPage() {
  const { personId } = await requireConstituentSession(MY_DETAILS_PATH);
  if (!personId) redirect(MY_PATH_PREFIX);

  const supabase = await createSupabaseServerClient();

  // Read through my_contact_details(), not `.from("people")`: the people select
  // policy requires people:view, which the person reading their own record has
  // no reason to hold. The RPC takes no argument, so there is nothing here that
  // decides whose record comes back.
  const { data } = await supabase.rpc("my_contact_details");
  const details = ((data ?? []) as MyContactDetails[])[0];

  // The guard said there is a record and the RPC says there is not, which can
  // only mean the tenant turned the area off between the two. `/my` is where
  // that is handled once, with a 404.
  if (!details) redirect(MY_PATH_PREFIX);

  // The profile questions this organization asks here (#1744), with the
  // reader's own answers. Through a definer read, for the reason above.
  const profile = await loadMyPersonQuestions(supabase);

  return (
    <MyPageLayout
      current="details"
      title="Your details"
      intro="Keep this current and we will reach you. Everything here is yours to change; the rest of your record is ours to keep."
    >
      <ContactForm
        details={details}
        profileQuestions={profile.myDetails}
        profileAnswers={profile.answers}
      />

      <Card>
        <CardHeader>
          {/* Not "Sign-in email", which #1181 sketched: this column is the
              address the organization writes to, and the form below says in
              so many words that it is not how you sign in. */}
          <CardTitle className="brand-display text-lg font-semibold">
            Your email address
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmailChangeForm
            email={details.email}
            pendingEmail={details.email_pending}
            pendingExpiresAt={details.email_pending_expires_at}
          />
        </CardContent>
      </Card>
    </MyPageLayout>
  );
}
