import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getPublicBranding, getPublicTenant } from "@/lib/branding";
import { BrandLogo } from "@/components/brand-logo";
import { publicSiteLink } from "@/lib/portal/paths";
import { getRequestHost } from "@/lib/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoLoginOffered } from "./demo-availability";
import { DemoButton } from "./demo-button";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log In",
};

export default async function PortalLoginPage() {
  // Which organization's public site to offer, if any. `unresolved` and
  // `unavailable` both mean there is nothing to name, and the link is dropped
  // rather than guessed at.
  //
  // Sign-in itself still never consults the host: there is no server action
  // here, just GoTrue in the browser, and an account is platform-wide anyway.
  // The host rule from #956 is enforced one screen later, by the portal shell,
  // which is the first thing that would render another organization's data.
  const supabase = await createSupabaseServerClient();
  const [tenantResult, branding, requestHost] = await Promise.all([
    getPublicTenant(supabase),
    // The logo the host's tenant has set, if any. It was
    // `/chatter-logo-transparent.png` hardcoded, so every tenant's login page
    // carried Chatter Snow's mark -- visible on portal.rickiecruz.com, which
    // was then the platform's own host (#795 Phase 3).
    getPublicBranding(supabase),
    getRequestHost(),
  ]);
  const backLink = publicSiteLink(
    requestHost,
    tenantResult.status === "resolved" ? tenantResult.tenant : null,
  );

  // Decided here rather than in the button, so the credentials stay in the
  // server tree entirely; the client only ever learns that a demo is on offer.
  // It is on offer only on the demo tenant's own host -- the credentials being
  // configured says something about the deployment, which serves every tenant.
  const demoAvailable = isDemoLoginOffered(tenantResult);

  return (
    <main className="app-shell flex items-center justify-center px-6 py-12 sm:px-10">
      <Card className="w-full max-w-md [--card-spacing:--spacing(8)] sm:[--card-spacing:--spacing(10)]">
        <CardHeader>
          <BrandLogo
            logoUrl={branding.logoUrl}
            alt=""
            className="mx-auto h-32 w-32"
            priority
          />
          {/* The page had no heading at all, so the only thing a screen
              reader met before the controls was the logo's alt text. The
              logo is decorative next to a real h1, hence alt="". */}
          <h1 className="brand-display mt-2 text-center text-3xl font-semibold tracking-brand">
            Operations Portal
          </h1>
        </CardHeader>

        <CardContent className="mt-2 flex flex-col gap-7">
          {demoAvailable && <DemoButton />}

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          {backLink && (
            <Link
              href={backLink.href}
              className="app-muted inline-flex items-center justify-center gap-1.5 text-sm hover:underline"
            >
              <ArrowLeft className="size-4" />
              Back to {backLink.label}
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
