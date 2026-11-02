import { redirect } from "next/navigation";

/**
 * Profile questions moved into People settings in #1760.
 *
 * A route rather than a `next.config.ts` redirect, for the reason given in
 * administration/access-management/page.tsx: the portal is served both as
 * `/portal/...` paths and prefix-free on a `portal.` host.
 *
 * Deliberately not guarded: it renders nothing and reads nothing, and the
 * settings page refuses anyone without `person_answers:manage` itself.
 */
export default function ProfileQuestionsMovedPage() {
  redirect("/portal/people/settings");
}
