import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getPublicGivingSettings } from "@/lib/public-giving";
import { givingIsPublished } from "@/lib/giving";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  return { title: publicTitle(site, site.content.text("support.heading")) };
}

export default async function SupportPage() {
  const supabase = await createSupabaseServerClient();
  const [{ content }, giving] = await Promise.all([
    getPublicSite(supabase),
    getPublicGivingSettings(supabase),
  ]);

  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
            {content.text("support.heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("support.intro")}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/support/donations" className="hover:underline">
                {content.text("support.donations_heading")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              {content.text("support.donations_card")}
            </p>
            {/* The card's own copy is unchanged whether giving is on or off
                (#1389) -- what changes is that there is somewhere to go. A
                tenant that has configured no giving path gets today's card. */}
            {givingIsPublished(giving) ? (
              <Link
                href="/support/donate"
                data-analytics-placement="support_page"
                className={cn(buttonVariants(), "mt-4")}
              >
                {content.text("support.giving_title")}
              </Link>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/support/sponsorship" className="hover:underline">
                {content.text("support.sponsorship_heading")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              {content.text("support.sponsorship_card")}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
