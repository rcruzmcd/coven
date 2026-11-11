import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { PlatformAttribution } from "@/components/auth/platform-attribution";
import { Skeleton } from "@/components/ui/skeleton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Sign in"),
    // The one route in the area a signed-out crawler can actually render, and
    // so the one that would otherwise be indexed. A sign-in form is not an
    // answer to any search anybody meant to make.
    robots: { index: false, follow: false },
  };
}

export default async function MySignInPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in -- including an administrator arriving from the portal
  // on the same session, which is the whole point of #1160. Showing them a
  // sign-in form would suggest the account they are holding does not count
  // here.
  if (user) redirect(MY_PATH_PREFIX);

  const { name } = await getPublicSite(supabase);

  return (
    // PageShell owns the column: the page used to centre itself inside a shell
    // it never had, which left it flush against the viewport and outside the
    // <main> the skip link aims at.
    <PageShell>
      <div className="space-y-8">
        <section>
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <h1 className="brand-display mt-4 text-3xl font-semibold tracking-brand sm:text-4xl">
              Sign in
            </h1>
          </div>
          <p className="app-muted mt-4 text-sm leading-relaxed">
            {name
              ? `See your history with ${name} and keep your details up to date.`
              : "See your history with us and keep your details up to date."}
          </p>
        </section>

        {/* The card is capped, not the shell: #1218 keeps every public page
          on PageShell's one column, and a shorter measure belongs on the
          element that needs it. A sign-in form stretched to 1152px puts the
          submit button a screen-width away from the fields above it. */}
        <Card className="rainbow-surface max-w-md">
          <CardContent>
            {/* useSearchParams inside, so the boundary is required. The
              fallback is form-shaped rather than null: an empty card that
              then fills is a pop, and this card is the whole page. */}
            <Suspense fallback={<SignInFormSkeleton />}>
              <SignInForm />
            </Suspense>
          </CardContent>
        </Card>

        <PlatformAttribution className="-mt-4" />
      </div>
    </PageShell>
  );
}

/**
 * Shaped like what arrives: the Google button, the rule, two fields and the
 * submit. The card is the whole page here, so a `null` fallback rendered an
 * empty box that jumped to full height the moment the client bundle landed.
 */
function SignInFormSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-8 w-full rounded-lg" />
      <div className="my-6 h-px bg-[var(--line)]" />
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}
