// Transient-UI surfaces for the a11y scan (issue #477, section 1).
//
// Base UI unmounts closed overlays and inactive tab panels, and axe skips
// display:none, so none of this is in the DOM when a route is scanned on
// initial render. That is the biggest hole in the scan: 54 files use Sheet,
// 30 use Dialog, 126 call sites render a destructive Alert only after a failed
// submit. #436's finding was an inactive TabsTrigger -- caught only because the
// trigger itself was visible. The panel behind it still has never been scanned.
//
// A surface opens something, lets the scan run, and closes it again. Opening is
// allowed to find nothing (a role may not see the button, a list may be empty);
// `applies` reports that so the run can distinguish "scanned, clean" from
// "never opened", which is the distinction this whole ticket exists to make.
import type { Page } from "@playwright/test";
import { modal } from "./helpers/dialog";

export type Surface = {
  name: string;
  /** Routes this applies to: a prefix, a pattern, or "*" for every route. */
  routes: "*" | string[];
  /** Returns false when the surface isn't present for this page/role. */
  open: (page: Page) => Promise<boolean>;
  close: (page: Page) => Promise<void>;
  /**
   * Opening this one submits something or navigates, so the route has to be
   * reloaded before the next surface rather than trusted to be as it was.
   */
  mutates?: boolean;
  /**
   * Which viewport passes open it. Defaults to the desktop pass alone, which
   * is where all but a handful of surfaces exist; `["mobile"]` is for the ones
   * a phone gets and a desktop does not -- the shell's "More" sheet, the rail's
   * sheet -- whose desktop equivalent is already on screen and already scanned.
   */
  viewports?: readonly ("desktop" | "mobile")[];
};

/** Any overlay a surface can leave behind, toasts excepted. */
export const OVERLAY_SELECTOR =
  '[role="dialog"]:not([data-slot="toast"]), [role="alertdialog"], [role="listbox"], [data-slot="tooltip-content"]';

async function pressEscape(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page
    .waitForFunction(
      (selector) => !document.querySelector(selector),
      OVERLAY_SELECTOR,
      { timeout: 2_000 },
    )
    .catch(() => {});
}

/** An event's own URL, as the listing's cards link to it. */
const EVENT_DETAIL_HREF = /^\/events\/e\/[0-9a-f-]{36}$/;

async function firstEventHref(page: Page): Promise<string | null> {
  const hrefs = await page
    .locator('a[href^="/events/"]')
    .evaluateAll((anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
  return hrefs.find((href) => EVENT_DETAIL_HREF.test(href)) ?? null;
}

/** An event's detail page in the portal, not one of its sub-pages. */
const PORTAL_EVENT_DETAIL_PATH = /^\/portal\/events\/[0-9a-f-]{36}$/;

/**
 * Moves an event's detail page to its Social content section (#1795). Same
 * path, so the scan files the result under this route; false when the page is
 * not an event's or the section is not offered to this role.
 */
async function openEventSocialSection(page: Page): Promise<boolean> {
  const url = new URL(page.url());
  if (!PORTAL_EVENT_DETAIL_PATH.test(url.pathname)) return false;
  url.searchParams.set("tab", "social");
  await page
    .goto(url.toString(), { waitUntil: "networkidle", timeout: 30_000 })
    .catch(() => {});
  // The section's title is not a heading, so wait for what only the section
  // renders: its empty state, or the Unscheduled sub-list beside its posts.
  const main = page.getByRole("main");
  return await main
    .getByText("No social posts planned for this event yet")
    .or(main.getByRole("heading", { name: /^Unscheduled/ }))
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(
      () => true,
      () => false,
    );
}

/**
 * Clicks a control if it's there, and reports whether the surface opened.
 *
 * `waitFor` deciding the answer is the point (#1294). It used to be allowed to
 * fail and this still returned `true`, so a surface that never opened was
 * scanned closed and banked a clean baseline entry -- which is exactly the
 * "scanned, clean" vs "never opened" distinction this file exists to make.
 * Reporting `false` instead drops the surface from the run honestly; it cannot
 * introduce a violation, and `--check` only reports a baselined violation as
 * fixed for keys the run actually scanned.
 */
async function clickIfPresent(
  page: Page,
  selector: () => ReturnType<Page["getByRole"]>,
  waitFor?: () => Promise<void>,
): Promise<boolean> {
  const control = selector().first();
  if ((await control.count()) === 0) return false;
  if (!(await control.isVisible().catch(() => false))) return false;
  await control.click({ timeout: 5_000 }).catch(() => {});
  if (!waitFor) return true;
  return await waitFor().then(
    () => true,
    () => false,
  );
}

export const SURFACES: Surface[] = [
  {
    // Every portal page carries one, and its body has never been scanned:
    // app-muted on leading-relaxed small text, exactly the contrast shape that
    // #290 and #436 kept finding elsewhere.
    name: "help-sheet",
    routes: ["/portal"],
    open: (page) =>
      clickIfPresent(
        page,
        () => page.getByRole("button", { name: "Help for this page" }),
        () => modal(page).first().waitFor({ state: "visible", timeout: 5_000 }),
      ),
    close: pressEscape,
  },
  {
    // On a phone the whole nav tree lives behind the tab bar's "More" button
    // (#1079), so this sheet is the only way to reach most of the portal.
    // Before the mobile shell it was the sidebar's own sheet, reached from the
    // sidebar toggle -- which the mobile shell no longer renders, so the
    // toggle stays in the list as the desktop passes' equivalent.
    name: "mobile-nav",
    routes: ["/portal"],
    viewports: ["mobile"],
    open: (page) =>
      clickIfPresent(
        page,
        () =>
          page
            // Scoped to the tab bar: "More" is a common enough label that an
            // unscoped lookup would open some page's own menu on a desktop
            // pass and file the result under this surface.
            .getByRole("navigation", { name: "Primary" })
            .getByRole("button", { name: "More" })
            .or(page.getByRole("button", { name: /toggle sidebar/i }))
            .first(),
        // Waits for the sheet, not for 300ms (#1294). Base UI's longest open
        // animation is 0.35s (see SURFACE_MOTION_CAP_MS in a11y-scan.ts), so
        // the old timeout was under the documented worst case and axe could
        // scan a page that had not opened anything.
        () => modal(page).first().waitFor({ state: "visible", timeout: 5_000 }),
      ),
    close: pressEscape,
  },
  {
    // The rail behind Site Content's and event detail's disclosure (#1093).
    // On a phone it is a sheet, and a transient surface is invisible to the
    // scan unless something opens it -- the same reason mobile-nav is here.
    // Above `lg` the button is `lg:hidden`, so the desktop passes report
    // "never opened" and the column they do scan is the one already on screen.
    name: "portal-rail",
    routes: ["/portal/website", "/portal/events"],
    viewports: ["mobile"],
    open: (page) =>
      clickIfPresent(
        page,
        () => page.getByRole("button", { name: /^(Sections|Pages) · / }),
        // The rail's sheet, rather than a timeout under Base UI's 0.35s (#1294).
        () => modal(page).first().waitFor({ state: "visible", timeout: 5_000 }),
      ),
    close: pressEscape,
  },
  {
    name: "notifications-menu",
    routes: ["/portal"],
    open: (page) =>
      clickIfPresent(
        page,
        () => page.getByRole("button", { name: /notification/i }),
        // A DropdownMenu, so role="menu" -- waited for rather than timed (#1294).
        () =>
          page
            .getByRole("menu")
            .first()
            .waitFor({ state: "visible", timeout: 5_000 }),
      ),
    close: pressEscape,
  },
  {
    // The first "New/Add/Record/Log" dialog on the page. Generic on purpose:
    // naming each of the 30 Dialog call sites would drift the same way the
    // route list did.
    name: "primary-dialog",
    routes: ["/portal"],
    open: (page) =>
      clickIfPresent(
        page,
        () =>
          page.getByRole("button", {
            name: /^(new|add|record|log|create|invite)\b/i,
          }),
        () => modal(page).first().waitFor({ state: "visible", timeout: 5_000 }),
      ),
    close: pressEscape,
  },
  {
    // Select content is portalled and unmounted when closed, so SelectItem
    // hover/selected states have never been measured.
    name: "select-open",
    routes: "*",
    open: async (page) => {
      const trigger = page.getByRole("combobox").first();
      if ((await trigger.count()) === 0) return false;
      if (!(await trigger.isVisible().catch(() => false))) return false;
      await trigger.click({ timeout: 5_000 }).catch(() => {});
      await page
        .getByRole("listbox")
        .first()
        .waitFor({ state: "visible", timeout: 3_000 })
        .catch(() => {});
      return true;
    },
    close: pressEscape,
  },
  {
    // Every destructive confirmation in the portal (39 files use AlertDialog),
    // none of which had ever been in the DOM when axe ran. The trigger is the
    // safe half of the pattern: it only opens the confirmation, so nothing is
    // deleted by opening one. Targeted by slot rather than by button label,
    // because a label regex would eventually click a button that deletes on
    // the spot. Confirmations driven by a controlled `open` prop instead of a
    // trigger are out of reach here, and stay unmeasured.
    name: "alert-dialog",
    routes: "*",
    open: async (page) => {
      const trigger = page
        .locator('[data-slot="alert-dialog-trigger"]')
        .first();
      if ((await trigger.count()) === 0) return false;
      if (!(await trigger.isVisible().catch(() => false))) return false;
      await trigger.click({ timeout: 5_000 }).catch(() => {});
      await page
        .getByRole("alertdialog")
        .first()
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => {});
      return (await page.getByRole("alertdialog").count()) > 0;
    },
    close: pressEscape,
  },
  {
    // A tooltip is often the only label an icon-only button has, so a naming
    // or contrast problem in one is a real barrier rather than a cosmetic
    // finding. Base UI portals the content and unmounts it when closed.
    name: "tooltip",
    routes: "*",
    open: async (page) => {
      const trigger = page.locator('[data-slot="tooltip-trigger"]').first();
      if ((await trigger.count()) === 0) return false;
      if (!(await trigger.isVisible().catch(() => false))) return false;
      await trigger.hover({ timeout: 5_000 }).catch(() => {});
      const content = page.locator('[data-slot="tooltip-content"]').first();
      await content
        .waitFor({ state: "visible", timeout: 3_000 })
        .catch(() => {});
      return (await content.count()) > 0;
    },
    // Tooltips close on pointer-out, not on Escape.
    close: async (page) => {
      await page.mouse.move(0, 0);
      await page
        .waitForFunction(
          () => !document.querySelector('[data-slot="tooltip-content"]'),
          undefined,
          { timeout: 2_000 },
        )
        .catch(() => {});
    },
  },
  {
    // The open registration form on an event's page (#1427). The route scan
    // reaches /events/e/[id] by following a card, but the form waits behind
    // the Register button, so only this opener scans it -- the card, its
    // stepped fields and the pinned bar with Cancel and Next. Scoped by href
    // rather than by card position so /events/community, which shares the
    // prefix, reports "never opened" instead of clicking through to the
    // calendar.
    name: "event-registration-form",
    routes: ["/events"],
    open: async (page) => {
      const href = await firstEventHref(page);
      if (!href) return false;
      await page
        .locator(`a[href="${href}"]`)
        .first()
        .click({ timeout: 5_000 })
        .catch(() => {});
      const trigger = page.getByRole("button", {
        name: "Register",
        exact: true,
      });
      await trigger
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => {});
      if ((await trigger.count()) === 0) return false;
      await trigger.click({ timeout: 5_000 }).catch(() => {});
      const form = page.getByRole("region", { name: /^Register for / });
      await form.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      return (await form.count()) > 0;
    },
    close: pressEscape,
    // Opening it navigates to the event's page, so the route is reloaded
    // rather than trusted to be where the next surface expects.
    mutates: true,
  },
  {
    // The error state of a form -- Alert variant="destructive" on a white Card.
    // Submitting the sign-in form with bad credentials is the cheapest way to
    // render one, and it happens to be on the highest-traffic page in the app.
    //
    // It is also the only one: the other 126 destructive-Alert call sites are
    // behind a submit that either mutates data or is blocked outright by a
    // native `required` field, so a generic "submit the first form empty"
    // opener would measure nothing on most pages and create records on the
    // rest. /portal/set-password's mismatch error looked like a second one
    // until the run showed the page is scanned as anon, where it redirects to
    // sign-in and the form never renders.
    name: "form-error",
    routes: ["/portal/login"],
    open: async (page) => {
      const email = page.getByLabel("Email");
      if ((await email.count()) === 0) return false;
      await email.fill("nobody@example.test");
      await page.getByLabel("Password").fill("wrong-password");
      await page
        .getByRole("button", { name: "Sign in", exact: true })
        .click({ timeout: 5_000 });
      await page
        .getByRole("alert")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => {});
      return true;
    },
    close: async () => {},
    mutates: true,
  },
  {
    // Where the AlertDialogs actually are. Only 5 call sites use a trigger;
    // the other ~34 are controlled by state, and 27 files implement the same
    // one -- "Discard changes?" when a dialog with edits is dismissed. Typing
    // into a field and pressing Escape reaches it without writing anything,
    // which no path to a delete confirmation can promise.
    name: "discard-confirmation",
    routes: ["/portal"],
    open: async (page) => {
      const dialogOpened = await clickIfPresent(
        page,
        () =>
          page.getByRole("button", {
            name: /^(new|add|record|log|create|invite|edit)\b/i,
          }),
        () => modal(page).first().waitFor({ state: "visible", timeout: 5_000 }),
      );
      if (!dialogOpened) return false;
      const field = modal(page).getByRole("textbox").first();
      if ((await field.count()) === 0) return false;
      await field.fill("a11y scan", { timeout: 5_000 }).catch(() => {});
      await page.keyboard.press("Escape");
      await page
        .getByRole("alertdialog")
        .first()
        .waitFor({ state: "visible", timeout: 3_000 })
        .catch(() => {});
      return (await page.getByRole("alertdialog").count()) > 0;
    },
    // Two overlays deep: the confirmation, then the dialog behind it.
    close: async (page) => {
      await pressEscape(page);
      await pressEscape(page);
    },
    mutates: true,
  },
  // An event's Social content section (#1795) and the two overlays it opens
  // (#1797). A rail section is not a tab, so the tab-panel openers never reach
  // it, and the primary-dialog opener only sees the default section.
  {
    name: "event-social-section",
    routes: ["/portal/events/"],
    open: (page) => openEventSocialSection(page),
    close: async () => {},
    mutates: true,
  },
  {
    name: "event-social-post-sheet",
    routes: ["/portal/events/"],
    open: async (page) =>
      (await openEventSocialSection(page)) &&
      clickIfPresent(
        page,
        () => page.getByRole("button", { name: "Add social post" }),
        () => modal(page).first().waitFor({ state: "visible", timeout: 5_000 }),
      ),
    close: pressEscape,
    mutates: true,
  },
  {
    name: "event-social-plan-dialog",
    routes: ["/portal/events/"],
    open: async (page) =>
      (await openEventSocialSection(page)) &&
      clickIfPresent(
        page,
        () => page.getByRole("button", { name: "Generate plan" }),
        () => modal(page).first().waitFor({ state: "visible", timeout: 5_000 }),
      ),
    close: pressEscape,
    mutates: true,
  },
  // Inactive tab panels. #436 found a violation on a TabsTrigger; the panels
  // behind them had never been rendered for the scan, and only the second one
  // was covered. Every portal route with tabs gets its panels scanned now --
  // a route with fewer tabs than the index simply reports "never opened".
  ...[2, 3, 4].map((position): Surface => ({
    name: `tab-panel-${position}`,
    routes: ["/portal"],
    open: async (page) => {
      const tabs = page.getByRole("tab");
      if ((await tabs.count()) < position) return false;
      const tab = tabs.nth(position - 1);
      await tab.click({ timeout: 5_000 }).catch(() => {});
      // Waits for this tab to actually be the selected one, rather than for
      // 400ms (#1294). A URL-backed tab reloads the route, so the panel can
      // arrive well after a fixed pause -- and a pause that ends early has
      // axe scanning the panel the reader was leaving.
      return await tab
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() =>
          page
            .getByRole("tabpanel")
            .first()
            .waitFor({ state: "visible", timeout: 5_000 }),
        )
        .then(
          () => true,
          () => false,
        );
    },
    // Selecting a tab is a view change, not state the next surface can
    // trust: some tabs are URL-backed, so the route is reloaded after.
    close: async () => {},
    mutates: true,
  })),
];

export function surfacesFor(
  route: string,
  viewport: "desktop" | "mobile" = "desktop",
): Surface[] {
  return SURFACES.filter(
    (surface) =>
      (surface.viewports ?? ["desktop"]).includes(viewport) &&
      (surface.routes === "*" ||
        surface.routes.some((prefix) => route.startsWith(prefix))),
  );
}
