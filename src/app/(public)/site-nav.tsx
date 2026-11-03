"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type NavGroup,
  type NavSettings,
  isSlotVisible,
  visibleGroups,
} from "@/lib/public-nav";
import { DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";
import { AccountMenu, AccountSheetRows } from "./account-menu";
import { useAccountNav } from "./account-nav-provider";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Shared box for the top-level items so a plain link and a dropdown trigger are
 * the same shape. `data-active:bg-transparent` is the important part: the base
 * NavigationMenuLink style sets `data-active:bg-muted/50` while the trigger has
 * no data-active rule at all, so an active plain link used to render a filled
 * pill that an active dropdown never got. The rainbow underline is the brand's
 * active signal -- this leaves it as the only one, on both kinds of item.
 * Links *inside* the dropdown panels keep the pill, where it reads correctly.
 */
// The horizontal padding pays for the account control (#1175), which needs 52px
// in a header that had five to spare. Measured with every section visible and
// the browser at 1024: the nav is 651px at `px-2.5`, 615px at `px-2` and 584px
// at `px-1.5`, and the budget below wants it at 604px or less -- so `px-2` is
// not enough on its own and the tightest step is used for the one band that
// needs it. `xl` relaxes to `px-2`, where the container is 1152px wide and 615
// fits with the CTA and the widened control beside it.
//
// Only horizontal, and the nav is `hidden lg:block`, so this never touches a
// tap target: below `lg` these items are rows in the sheet instead. What it
// does narrow is the rainbow underline, which the item's own box draws -- it
// reads as tighter tracking rather than as a smaller control.
const TOP_LEVEL_ITEM =
  "rainbow-underline h-9 px-1.5 py-1.5 font-medium data-active:bg-transparent xl:px-2";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string, group: NavGroup) {
  if (!group.links) return isActive(pathname, group.href);
  return group.links.some((link) => isActive(pathname, link.href));
}

function MobileNavLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-11 items-center rounded-lg px-2 text-sm font-medium hover:bg-muted"
    >
      {children}
    </Link>
  );
}

function MobileSubNavLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-11 items-center rounded-lg pl-6 pr-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}

export function SiteNav({
  hiddenSlots = [],
  supportLabel,
  lexicon = DEFAULT_LEXICON,
  nav,
}: {
  hiddenSlots?: readonly string[];
  /**
   * The "Support <organization>" entry names the organization, so it is the
   * one nav label that is site content rather than structure (#707 Phase 4).
   */
  supportLabel?: string;
  /**
   * This organization's words for what it lends (#896). The Gear group's
   * labels are templates, so without it the nav would read the platform's
   * "Items" and "Library" on a site that calls them something else.
   */
  lexicon?: Lexicon;
  /** The tenant's top-level order and labels (#1726); omitted is the default. */
  nav?: NavSettings;
}) {
  const pathname = usePathname();
  // Whether this tenant offers constituent accounts, and who is signed in
  // (#1175) -- from the browser since #1467, so the page itself can be cached.
  // Off outside the public layout's provider, which renders no control at all.
  const account = useAccountNav();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);
  const groups = visibleGroups(hiddenSlots, lexicon, nav).map((group) =>
    group.links && supportLabel
      ? {
          ...group,
          links: group.links.map((link) =>
            link.href === "/support" ? { ...link, label: supportLabel } : link,
          ),
        }
      : group,
  );
  const showEventsCta = isSlotVisible(hiddenSlots, "events");

  return (
    // One element, not a fragment. The header wrapper is `justify-between`, so
    // returning three siblings made it distribute four children instead of two
    // and spread ~537px of dead space across a 1152px header -- widening every
    // time the board hid another section.
    <div className="flex items-center gap-2">
      {/* Swaps at `lg`, not `sm`: the full nine-group nav needs 954px, so
          turning it on at 640px wrapped the header onto a second row for the
          whole tablet band. */}
      <nav aria-label="Main" className="hidden lg:block">
        <NavigationMenu>
          <NavigationMenuList className="flex-none justify-end">
            {groups.map((group) =>
              !group.links ? (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuLink
                    className={TOP_LEVEL_ITEM}
                    render={<Link href={group.href} />}
                    active={isActive(pathname, group.href)}
                  >
                    {group.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ) : (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuTrigger
                    className={TOP_LEVEL_ITEM}
                    data-active={isGroupActive(pathname, group) || undefined}
                  >
                    {group.label}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-56 gap-1">
                      {group.links.map((link) => (
                        <li key={link.href}>
                          <NavigationMenuLink
                            render={<Link href={link.href} />}
                            active={pathname === link.href}
                            closeOnClick
                          >
                            {link.label}
                          </NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ),
            )}
          </NavigationMenuList>
        </NavigationMenu>
      </nav>

      {/* The header had no action at all: the site's only prominent CTA was the
          homepage Donate button, which is gated behind `support`.

          The breakpoints look fussy but each one is load-bearing, and the
          numbers below were measured in a browser at each width with every
          section visible -- not derived. Re-measure and correct them when you
          change anything in this header: they are the only record of the
          budget, and a stale one is worse than none.

          At `lg` there is 944px to spend, and the nav is out while the
          hamburger is not yet in: logo 220 + gap 16 + nav 584 + gap 8 +
          toggle 44 + gap 8 + account 44 = 924, twenty to spare. That is why
          the CTA stands down across `lg`..`xl` -- it does not fit -- and why
          the nav runs at its tightest padding there.

          At `xl` there is 1152px, the nav relaxes a step to 615, the CTA is
          back and the account control has widened to carry the name:
          logo 220 + gap 16 + cluster 887 = 1123, twenty-nine to spare.

          Below `lg` the nav is a sheet and the cluster is 267px, which leaves
          room everywhere down to 390. Narrower than that the header wraps to a
          second row, as it did before any of this.

          **The budget is eight sections**, which is every section a customer
          tenant has. #1328 added a ninth, `audiences`, and it does not fit:
          re-measured on a tenant with all nine visible, the nav is 696px at
          `lg` (against 591 for eight) and 732px at `xl` (against 623), and the
          header wraps to two rows at every desktop width from 1024 to 1600.
          That is accepted rather than unnoticed. `audiences` is the platform's
          own pitch, off for every tenant until somebody turns it on, and the
          site that turns it on is a marketing site -- no Events, no Programs,
          no Get Involved -- so its nav is far under budget. The configuration
          that wraps is the local seed, which turns on every section at once so
          the e2e and a11y sweeps have something to visit, and is not a site
          anybody serves. A tenth section, or a customer that really does want
          all nine, needs the nav to overflow rather than the header to wrap,
          and that is a change to this component rather than another entry in
          this list.

          #1471 added that tenth, `publications`, knowing this. It is off until
          a tenant has an issue out, and the tenant it was built for shows
          about five sections, so the realistic nav stays inside the eight.
          A customer with every section on now has nine and wraps at desktop
          widths, the same accepted cost as above, until the overflow exists. */}
      {showEventsCta && (
        <Button
          variant="rainbow"
          nativeButton={false}
          render={<Link href="/events" />}
          className="hidden sm:inline-flex lg:hidden xl:inline-flex"
        >
          Join an event
        </Button>
      )}

      <ThemeToggle />

      {/* Last before the hamburger, where the web has trained people to look
          for an account. Hidden below `sm`: on a phone this would be a fifth
          control in a header that already wraps, so it moves into the sheet
          below instead. Renders nothing at all on a tenant without the
          module. */}
      <AccountMenu account={account} className="hidden sm:inline-flex" />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 lg:hidden"
                    aria-label="Open menu"
                  />
                }
              />
            }
          >
            <MenuIcon />
          </SheetTrigger>
          <TooltipContent>Open menu</TooltipContent>
        </Tooltip>
        <SheetContent side="right" size="sm">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav
            aria-label="Main"
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4"
          >
            {groups.map((group) =>
              !group.links ? (
                <MobileNavLink
                  key={group.label}
                  href={group.href}
                  onNavigate={closeMobile}
                >
                  {group.label}
                </MobileNavLink>
              ) : (
                <div key={group.label} className="flex flex-col gap-0.5">
                  {/* Was an inert <p>, which made the section landing pages
                      unreachable from mobile entirely. */}
                  <MobileNavLink href={group.href} onNavigate={closeMobile}>
                    {group.label}
                  </MobileNavLink>
                  {group.links
                    .filter((link) => link.href !== group.href)
                    .map((link) => (
                      <MobileSubNavLink
                        key={link.href}
                        href={link.href}
                        onNavigate={closeMobile}
                      >
                        {link.label}
                      </MobileSubNavLink>
                    ))}
                </div>
              ),
            )}
          </nav>
          {/* Pinned below the scrolling section list rather than trailing it,
              so sign out in particular is one tap from anywhere in the menu --
              the same arrangement the portal's mobile menu uses. `sm:hidden`
              because from `sm` up the header carries the control itself and two
              of them would be two places to sign out. */}
          <AccountSheetRows
            account={account}
            onNavigate={closeMobile}
            className="sm:hidden"
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
