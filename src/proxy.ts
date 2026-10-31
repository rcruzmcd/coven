import { createServerClient } from "@supabase/ssr";
import { NextResponse, userAgent, type NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/auth/session-cookie";
import { isMyPathname } from "@/lib/constituent/paths";
import {
  PORTAL_PATH_PREFIX,
  isPortalHost,
  isPortalPathname,
  portalRedirectTarget,
  stripPortalPrefix,
} from "@/lib/portal/paths";
import { publicCdnCacheControl } from "@/lib/public-cdn-cache";

// Paths that live at the app root and must keep working unprefixed on the
// portal host. `/portal` is a route-group prefix, not a mount point, so
// blanket-rewriting every path into it makes these unreachable:
//   - /auth/* is the Supabase OAuth/email callback. The session cookie has to
//     be set on the portal host, so the provider redirect must land here --
//     but /portal/auth/callback doesn't exist, so it 404s and Google sign-in
//     never completes.
//   - files in public/ (the logo on the login page). next/image is exempt from
//     the matcher, but the optimizer re-fetches the source through this same
//     host, so a rewritten /portal/<file>.png 404 turns into a 400
//     INVALID_IMAGE_OPTIMIZE_REQUEST and the image never renders.
//   - /api/* are route handlers, which live at the app root. The task-reminder
//     cron (#488) is called by Vercel with a bearer token and no browser
//     involved, so a rewrite to /portal/api/... would 404 a job nobody is
//     watching -- it would simply stop sending, silently.
const ROOT_PATH_PREFIXES = ["/auth/", "/api/"];

/**
 * The public site's event URLs, for the legacy `/events/<uuid>` 308 (#1003).
 *
 * This redirect lived in `next.config.ts` until it took the portal down
 * (#1145). Events moved a segment down to `/events/e/<uuid>` because the
 * intercepting sheet matched every single segment under /events, and the old
 * URL had to keep working -- but `next.config.ts` redirects are host-blind and
 * are applied ahead of this proxy, and on a `portal.` host the portal's own
 * visible event URL *is* `/events/<uuid>`, because the `/portal` prefix is
 * stripped here. So the two collided: a click on the portal's event list went
 * `/portal/events/<uuid>` -> 307 `/events/<uuid>` -> 308 `/events/e/<uuid>`,
 * which this proxy then rewrote to `/portal/events/e/<uuid>` -- no such route,
 * 404. It reproduced on the portal hosts alone, which is why previews, the
 * demo tenant (`/portal` is a real path segment there) and every local run
 * looked fine.
 *
 * Living here rather than in `next.config.ts` is the fix: this is the one
 * module that already knows what a portal host is, so the public site's
 * redirects cannot be written in ignorance of the portal's paths again. It is
 * still a real 308 issued before any rendering, which is what a crawler needs
 * to move the link equity over.
 */
const PUBLIC_EVENT_PATH = /^\/events\/([0-9a-fA-F-]{36})\/?$/;

/**
 * The same URL one segment down -- what a browser that cached the 308 above
 * asks the portal for, possibly forever.
 *
 * The redirect went out as `permanent`, so fixing the collision is not enough
 * on its own: every browser that has already followed it has
 * `/events/<uuid>` -> `/events/e/<uuid>` burned into its cache, and would keep
 * 404ing on a portal host long after this deploy. Absorbing that path here
 * serves those browsers the event they asked for. It has to be a rewrite and
 * not a redirect back: redirecting to `/events/<uuid>` would meet the cached
 * 308 coming the other way and spin.
 */
const PORTAL_CACHED_EVENT_PATH = /^\/events\/e\/([0-9a-fA-F-]{36})\/?$/;

/**
 * Where the two index paths go (#1467): the public site's `/` is `/home`, and
 * the portal's own index is `/portal/entry`, which picks the signed-in
 * landing page.
 *
 * Both used to be `page.tsx` files that did nothing but `redirect()`. That
 * throws during render, but only after every layout above the page has run --
 * the public one reads the tenant, its page visibility, its legal documents and
 * the session -- so a 307 cost ~685ms of CPU, more than `/home` itself, and the
 * two were 23% of the deployment's Active CPU over thirty days. Here they are
 * answered before anything renders.
 *
 * Not `next.config.ts` `redirects()`: those are host-blind and run ahead of
 * this proxy, which is how #1145 took the portal down. `/` is the portal on a
 * `portal.` host and the public site everywhere else, so only a module that
 * knows what a portal host is can say where it goes. The pages stay as the
 * fallback for what this deliberately passes through -- an RSC fetch or a
 * Server Action, which a redirect here would double or break.
 */
const PUBLIC_INDEX_TARGET = "/home";
const PORTAL_INDEX_TARGET = "/portal/entry";

/**
 * Header carrying the portal path the browser actually asked for.
 *
 * The portal layout redirects signed-out users to the login page, but a
 * layout can't see the request path, so every shared portal link -- "look at
 * this event", "here's the reimbursement" -- used to land the recipient on
 * the dashboard with the original URL gone. The proxy does see it.
 */
export const PORTAL_PATH_HEADER = "x-portal-path";

/**
 * Header carrying which shell the portal should render (#1079).
 *
 * `useIsMobile()` deliberately answers `false` on the server so hydration is
 * safe, which means it can never choose a *shell*: the first paint would
 * always be the desktop one and swap afterwards, flashing on every navigation
 * and shipping both trees. The proxy is the one place that sees the request
 * before anything renders, so the decision is made here and read once, by
 * `deviceClass()` in `src/lib/portal/device.ts`.
 *
 * The portal is authenticated and fully dynamic, so there is no CDN cache to
 * `Vary` on. If anything under `/portal` ever becomes cacheable, it has to
 * vary on this header.
 */
export const DEVICE_HEADER = "x-device";

/**
 * Cookie that overrides the user-agent's answer.
 *
 * UA sniffing gets desktop-mode phones and tablets wrong, and there is no
 * server-side way to see a viewport. One client effect can write the real
 * width into this cookie after first load, so the *next* request is right even
 * where the UA is not -- and a Playwright run can force either shell by
 * setting it, with no UA spoofing.
 */
export const DEVICE_OVERRIDE_COOKIE = "device_override";

export type DeviceClass = "mobile" | "desktop";

/**
 * The shell decision, from the UA's device type and the override cookie.
 *
 * Tablets resolve to `desktop`: they have room for the sidebar, and the
 * mobile shell's bottom tab bar is a thumb-reach affordance that a 10" screen
 * does not want. `userAgent().device.type` is `undefined` on desktop, so
 * anything that isn't explicitly a phone falls through to the desktop shell --
 * the safe direction, since that is the layout every existing test expects.
 */
export function resolveDeviceClass(
  deviceType: string | undefined,
  override: string | undefined,
): DeviceClass {
  if (override === "mobile" || override === "desktop") return override;
  return deviceType === "mobile" ? "mobile" : "desktop";
}

export type PortalRoute =
  | { kind: "pass" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; host: string; pathname: string; status: 307 | 308 };

// Pure host/path routing decision, split out so it can be unit tested without
// a real request (fetch's Headers refuses to carry a `host` header).
//
// `isNonDocumentRequest` marks anything that isn't a page load the user can
// see: RSC payload fetches and Server Action POSTs. Those skip the cosmetic
// prefix-strip below -- there's no address bar to clean up, redirecting a
// prefetch would double every navigation request, and bouncing an action POST
// asks fetch to replay a body it may not be able to rewind.
export function resolvePortalRoute(
  hostname: string,
  pathname: string,
  isNonDocumentRequest = false,
): PortalRoute {
  const isPortalPath = isPortalPathname(pathname);

  if (isPortalHost(hostname)) {
    const isRootPath =
      ROOT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
      // Anything with a file extension is a public/ asset, never a page route.
      /\.[^/]+$/.test(pathname);

    if (isRootPath) {
      return { kind: "pass" };
    }

    // The prefix is internal here, so send the browser to the bare path and
    // let the rewrite below put it back. App code keeps linking to the
    // canonical `/portal/...` paths, which still resolve on every host; this
    // is what stops them showing up as portal.chattersnow.org/portal/home.
    // 307 rather than 308: nothing about the split is settled enough to want
    // it burned into browser caches.
    //
    // The redirect stays on the host it arrived at: a tenant reaching its own
    // portal.<domain> has to stay there. Sending it to another tenant's portal
    // host would drop the tenant `public_tenant_id()` resolves from the
    // hostname, and strand the session cookie on a domain the visitor never
    // asked for.
    if (isPortalPath) {
      return isNonDocumentRequest
        ? { kind: "pass" }
        : {
            kind: "redirect",
            host: hostname,
            pathname: stripPortalPrefix(pathname),
            status: 307,
          };
    }

    // The portal's index, visible here as the bare root. Straight to the
    // unprefixed entry path, rather than through the rewrite below to a page
    // whose only job is to redirect.
    if (pathname === "/" && !isNonDocumentRequest) {
      return {
        kind: "redirect",
        host: hostname,
        pathname: stripPortalPrefix(PORTAL_INDEX_TARGET),
        status: 307,
      };
    }

    // Ahead of the blanket rewrite below, which would send this to
    // `/portal/events/e/<uuid>` -- the 404 that #1145 was.
    const cached = PORTAL_CACHED_EVENT_PATH.exec(pathname);
    if (cached) {
      return { kind: "rewrite", pathname: `/portal/events/${cached[1]}` };
    }

    return { kind: "rewrite", pathname: `/portal${pathname}` };
  }

  // The apex -> portal 308, for the hosts that have said they have a portal
  // subdomain (PORTAL_REDIRECT_HOSTS). A host that has not is left alone and
  // serves /portal/... as a path, which is what a preview and a local run do.
  const portalHost = isPortalPath ? portalRedirectTarget(hostname) : null;
  if (portalHost) {
    return {
      kind: "redirect",
      host: portalHost,
      pathname: stripPortalPrefix(pathname),
      status: 308,
    };
  }

  // The two index redirects, on a host that serves both surfaces by path: a
  // preview, a local run, the demo tenant, and a tenant apex with no promised
  // `portal.` subdomain. After the branch above, so a host that has one sends
  // `/portal` there instead, and its portal host answers the root itself.
  if (!isNonDocumentRequest) {
    if (pathname === "/") {
      return {
        kind: "redirect",
        host: hostname,
        pathname: PUBLIC_INDEX_TARGET,
        status: 307,
      };
    }
    if (pathname === PORTAL_PATH_PREFIX) {
      return {
        kind: "redirect",
        host: hostname,
        pathname: PORTAL_INDEX_TARGET,
        status: 307,
      };
    }
  }

  // The public site's legacy event URL. Deliberately after the portal branch
  // above, so it can never fire on a host where `/events/<uuid>` is a portal
  // page rather than a public one.
  const legacyEvent = PUBLIC_EVENT_PATH.exec(pathname);
  if (legacyEvent) {
    return {
      kind: "redirect",
      host: hostname,
      pathname: `/events/e/${legacyEvent[1]}`,
      status: 308,
    };
  }

  return { kind: "pass" };
}

// Refreshes the Supabase session for requests that carry one, and forwards any
// rotated cookies to both the downstream request and the browser response.
// Without this, a session refresh triggered from a Server Component (e.g.
// getUser() in the portal layout) can't persist its own Set-Cookie writes
// (Next.js forbids cookie writes during RSC render), which strands the
// browser with a refresh token GoTrue has already rotated/consumed
// server-side, so the very next request appears signed out.
//
// That used to mean portal requests alone, because they were the only ones
// that could have a session. Since #1161 one account serves both surfaces, so
// `/my` on the public host has one too and needs exactly the same treatment --
// the bug it prevents is identical there, and would be harder to spot, since
// a constituent signing out unexpectedly looks like an ordinary expiry.
//
// Uses getSession() rather than getUser(): getSession() only touches the
// network when the access token is actually expired (which is exactly when
// a refresh -- the thing we need to persist -- happens), whereas getUser()
// always makes a round trip to revalidate the JWT. Proxy runs on every
// request, so that difference matters; the portal layout still calls
// getUser() itself for the real authorization check, once the cookies here
// are already current.
/**
 * Clones the incoming headers and stamps the requested portal path on them.
 * Cloned at call time, never snapshotted up front: `request.cookies.set` in
 * the refresh path below writes through `request.headers`, so an early copy
 * would forward a stale cookie header and undo the session refresh.
 */
function forwardHeaders(
  request: NextRequest,
  portalPath: string | null,
  device: DeviceClass | null,
) {
  const headers = new Headers(request.headers);
  if (portalPath) {
    headers.set(PORTAL_PATH_HEADER, portalPath);
  } else {
    // Never let a client-supplied value through: it decides a redirect target.
    headers.delete(PORTAL_PATH_HEADER);
  }
  if (device) {
    headers.set(DEVICE_HEADER, device);
  } else {
    // Same reason: it decides which shell renders, so the only value the app
    // ever sees is the one stamped here.
    headers.delete(DEVICE_HEADER);
  }
  return headers;
}

/**
 * Whether this request carries a Supabase auth cookie at all (#1175).
 *
 * A name test rather than a parse: the point is only to tell "somebody might be
 * signed in" from "certainly nobody is", cheaply enough to run on every public
 * request. @supabase/ssr writes `sb-<project-ref>-auth-token`, chunked as
 * `.0`, `.1` and so on when it outgrows a cookie, so the prefix and the suffix
 * together match every shape it takes without matching an unrelated `sb-`
 * cookie. Whether the token is valid is the refresh's business, not this
 * function's -- a false positive costs one client that finds nothing.
 */
export function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"),
    );
}

async function refreshSession(
  request: NextRequest,
  portalPath: string | null,
  device: DeviceClass | null,
) {
  const forward = () =>
    NextResponse.next({
      request: { headers: forwardHeaders(request, portalPath, device) },
    });
  let refreshedResponse = forward();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Must match the server and browser clients exactly: this is the writer
      // that rotates the cookie, so a different scope here would leave the
      // refreshed session under a name the app's own client does not read.
      cookieOptions: sessionCookieOptions(request.headers.get("host")),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          refreshedResponse = forward();
          cookiesToSet.forEach(({ name, value, options }) =>
            refreshedResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getSession();

  return refreshedResponse;
}

/**
 * The path without its trailing slash, or null when it has none (#1708).
 *
 * Next's own trailing-slash 308 is off (`skipTrailingSlashRedirect` in
 * `next.config.ts`) because it runs ahead of the `vercel.json` rewrites:
 * posthog-js posts every event to `/ph/i/v0/e/`, so each one took a 308 to
 * the slashless path before the rewrite to PostHog could match -- an extra
 * round trip per event, and a redirect a beacon or keepalive request may not
 * follow. The redirect lives here instead, where `ph/` is outside the matcher,
 * so the ingest is the one path that keeps its slash. It stays a 308 like
 * Next's, so a POST is replayed with its body.
 */
export function trailingSlashRedirect(pathname: string): string | null {
  if (pathname === "/" || !pathname.endsWith("/")) return null;
  return pathname.replace(/\/+$/, "") || "/";
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  const slashless = trailingSlashRedirect(pathname);
  if (slashless) {
    const url = request.nextUrl.clone();
    url.pathname = slashless;
    return NextResponse.redirect(url, 308);
  }

  // HEAD is a page load with the body left off -- crawlers probe with it -- so
  // it takes the same redirects a GET does.
  const isRead = request.method === "GET" || request.method === "HEAD";
  const route = resolvePortalRoute(
    hostname,
    pathname,
    !isRead || request.headers.has("rsc") || request.headers.has("next-action"),
  );
  // isPortalHost covers main's `hostname === PORTAL_HOST` and generalizes it to
  // any `portal.` subdomain (#707 Phase 4); isPortalPathname is the helper form
  // of the inline prefix check this used to carry.
  const isPortalRequest = isPortalHost(hostname) || isPortalPathname(pathname);

  // The path as the browser asked for it. On the portal host the route group
  // is a rewrite target, so use the rewritten path -- that's what a login
  // redirect has to send the user back to.
  const portalPath = isPortalRequest
    ? `${route.kind === "rewrite" ? route.pathname : pathname}${request.nextUrl.search}`
    : null;

  // Portal requests only: the public site is one responsive tree and has no
  // shell to choose, so stamping it there would only invite a second reader.
  const device = isPortalRequest
    ? resolveDeviceClass(
        userAgent(request).device.type,
        request.cookies.get(DEVICE_OVERRIDE_COOKIE)?.value,
      )
    : null;

  // `/my` is a public-host route, so it is not a portal request -- it gets no
  // portal path header and no shell -- but it is signed in, so it needs the
  // refresh (#1161).
  //
  // Since #1175 the whole public site can be signed in: the header names the
  // account on every page. Refreshing only on `/my` meant a constituent reading
  // `/events` on an expired access token got a header that had quietly flipped
  // back to "Sign in", with the token rotated only if they happened to return
  // to `/my`. So any request carrying an auth cookie gets the refresh, wherever
  // it is going. Anonymous traffic -- nearly all public traffic -- still builds
  // no client and pays nothing, which is what the cookie test buys over simply
  // refreshing every request.
  const hasSession =
    isPortalRequest || isMyPathname(pathname) || hasAuthCookie(request);

  const refreshedResponse = hasSession
    ? await refreshSession(request, portalPath, device)
    : NextResponse.next({
        request: { headers: forwardHeaders(request, portalPath, device) },
      });

  const withRefreshedCookies = (response: NextResponse) => {
    refreshedResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  if (route.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return withRefreshedCookies(
      NextResponse.rewrite(url, {
        request: { headers: forwardHeaders(request, portalPath, device) },
      }),
    );
  }

  if (route.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.host = route.host;
    url.pathname = route.pathname;
    return withRefreshedCookies(NextResponse.redirect(url, route.status));
  }

  // Lets Vercel's CDN hold the low-churn public pages (#1467). Only for a
  // request that carries no session at all: the page is still rendered with
  // this request's Supabase client, and a signed-in render is one RLS might
  // show more to, so it must never become the copy every visitor is served.
  // The reverse is safe -- a signed-in visitor served the anonymous copy sees
  // exactly the public page, since nothing on it reads the session (the
  // header's account control does so in the browser).
  const cdnCacheControl =
    isRead && !hasSession && !request.headers.has("next-action")
      ? publicCdnCacheControl(pathname)
      : null;
  if (cdnCacheControl) {
    refreshedResponse.headers.set(CDN_CACHE_CONTROL_HEADER, cdnCacheControl);
  }

  return refreshedResponse;
}

/**
 * Vercel's own cache directive, read by its CDN ahead of `Cache-Control` and
 * stripped before the response reaches the browser. So the browser keeps the
 * `private, no-store` Next sends for a dynamic page -- nothing stale sits in a
 * visitor's own cache -- while the CDN keys the page on host and path. Per
 * Vercel's caching docs the CDN honours `s-maxage` here, not a bare `max-age`.
 */
export const CDN_CACHE_CONTROL_HEADER = "Vercel-CDN-Cache-Control";

// `ph/` is PostHog's ingest (#1480), rewritten to PostHog in `vercel.json`.
// Excluded so an analytics request never costs a proxy invocation (#1467), and
// so it never meets the trailing-slash redirect above (#1708).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|ph/).*)"],
};
