import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatGivingAmount,
  givingEmbedSrc,
  type GivingSettings,
} from "@/lib/giving";

/**
 * The Give card at the top of the Donations page (#1389), rendered only once
 * a tenant has switched giving on and pasted a URL.
 *
 * Every button here points at `/support/donate` rather than at the provider,
 * so the configured URL is assembled server-side in exactly one place and the
 * route a printed card or a QR code carries is the same one this page uses --
 * a route nothing linked to is a route that rots.
 *
 * The tax note is the tenant's own sentence or nothing at all. The platform
 * says nothing about what a gift is worth at tax time, here or anywhere:
 * `support.giving_tax_note` ships empty and an organization whose exemption is
 * pending, one giving through a fiscal sponsor and one holding its own
 * determination letter each write a different true one (docs/legal-basis.md
 * rule 1).
 */
export function GiveCard({
  settings,
  title,
  body,
  taxNote,
}: {
  settings: GivingSettings;
  title: string;
  body: string;
  taxNote: string;
}) {
  const embedSrc = givingEmbedSrc(settings);
  // Inert without the provider's own parameter name, which is the point: a
  // provider that takes no amount parameter gets a plain link rather than a
  // broken one.
  const amounts = settings.amountParam ? settings.suggestedAmounts : [];
  const providerLabel = settings.providerLabel.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="app-muted max-w-3xl text-sm leading-relaxed">{body}</p>

        {amounts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {amounts.map((amount) => (
              <Link
                key={amount}
                href={`/support/donate?amount=${amount}`}
                data-analytics-placement="give_card_amount"
                className={cn(buttonVariants({ variant: "secondary" }))}
              >
                {formatGivingAmount(amount)}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {/* A `Link` wearing the button's classes, not a `Button` rendering a
              link: `nativeButton={false}` stamps `role="button"` on the anchor,
              and this navigates -- the same call `account-menu.tsx` makes. */}
          <Link
            href="/support/donate"
            data-analytics-placement="give_card"
            className={cn(buttonVariants())}
          >
            {amounts.length > 0 ? "Give another amount" : title}
          </Link>
          {providerLabel ? (
            <p className="app-muted text-sm">Opens on {providerLabel}.</p>
          ) : null}
        </div>

        {settings.recurringAvailable ? (
          <p className="app-muted text-sm leading-relaxed">
            You can also give monthly.
          </p>
        ) : null}

        {taxNote ? (
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            {taxNote}
          </p>
        ) : null}

        {embedSrc ? (
          // The src is rebuilt from the configured URL's own origin, path and
          // query (`givingEmbedSrc`), so the only host that can ever be framed
          // here is the one already published as the giving link -- an
          // allowlist derived from the setting rather than a second setting to
          // get wrong. `sandbox` is the narrowest set a hosted payment form
          // needs; `allow-same-origin` is what lets the provider reach its own
          // session, and it is safe alongside a fixed third-party origin.
          <iframe
            src={embedSrc}
            title={providerLabel ? `Give on ${providerLabel}` : title}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="h-[42rem] w-full rounded-xl border border-[var(--line)]"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
