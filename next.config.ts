import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false,
  // The trailing-slash 308 is `src/proxy.ts`'s job (#1708). Next's own runs
  // before the `vercel.json` rewrites, so it bounced every PostHog event at
  // `/ph/i/v0/e/` before the `/ph` rewrite could match it.
  skipTrailingSlashRedirect: true,
  // Playwright's default baseURL is 127.0.0.1, which Next.js dev treats as a
  // different origin than localhost and blocks HMR/static chunk requests
  // from by default, silently breaking all client-side interactivity.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "drive.google.com",
        pathname: "/thumbnail",
      },
      // Gear photos in Supabase Storage (#781). Written out statically rather
      // than derived from NEXT_PUBLIC_SUPABASE_URL: CI's `quality` job runs
      // `bun run build` with no Supabase env set, so parsing that variable here
      // would throw and take the deploy gate down. The `pathname` is what makes
      // the wildcard host safe -- it admits one bucket's public prefix, not
      // arbitrary content on any Supabase project. Both local hostnames are
      // listed because `supabase status` reports 127.0.0.1 while .env.local is
      // often written by hand as localhost.
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/gear-photos/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/gear-photos/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "54321",
        pathname: "/storage/v1/object/public/gear-photos/**",
      },
      // Uploaded site photos (#921), on the same terms as gear photos above:
      // one bucket's public prefix rather than arbitrary content on any
      // Supabase project. Without these three, every slot an editor uploads to
      // throws at render -- `SiteImage` draws them through `next/image`.
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/site-photos/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/site-photos/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "54321",
        pathname: "/storage/v1/object/public/site-photos/**",
      },
      // Publication covers and pages (#1471), on the same terms. The public
      // pages draw them with a plain `<img srcSet>` from sizes made at upload,
      // so these are for anything that later puts one through `next/image`.
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/publication-files/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/publication-files/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "54321",
        pathname: "/storage/v1/object/public/publication-files/**",
      },
    ],
  },
  async headers() {
    return [
      // #1502. The answers page's URL carries a registrant's token, so nothing
      // it loads or links to may learn the URL from a Referer, and no index
      // may keep it. The page's metadata says both too; the headers are what
      // a client that ignores the <meta> tags still obeys.
      {
        source: "/events/e/:id/answers",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // #1519. Likewise the page behind a handout's one-time QR code.
      {
        source: "/acknowledge",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // #1620. An event media upload link carries its token in the path, at
      // both the spelling every host serves and the prefix-free one a portal
      // host shows.
      {
        source: "/portal/media-upload/:token",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/media-upload/:token",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // `/about/volunteer` stays permanent: /get-involved is not behind a
      // visibility toggle in practice and the destination resolves today.
      {
        source: "/about/volunteer",
        destination: "/get-involved#volunteer",
        permanent: true,
      },
      // These two are deliberately NOT permanent. Their destinations sit behind
      // the page-visibility gate, so while the board has Programs or Support
      // hidden they resolve to a 404 -- and a 308 into a 404 is cached by the
      // browser indefinitely, so the visitor would keep landing there even
      // after the board turns the section back on. 307 keeps the redirect
      // working without burning it in. Restore `permanent: true` once both
      // sections are approved and permanently live.
      { source: "/about/programs", destination: "/programs", permanent: false },
      { source: "/about/donations", destination: "/support", permanent: false },
      // `/gears/*` -> `/inventory/*` (#897). One tenant's word for what it
      // lends is out of the URL; the label it renders under is the lexicon's
      // job (#896). `:path*` matches zero segments too, so this covers bare
      // `/gears`, which was itself a redirect to `/gears/library`.
      //
      // Permanent, unlike the two above, and for a reason that survives the
      // visibility gate: the destination is the same content at its new
      // address, not a different section. A 308 a browser caches forever
      // still resolves correctly whether or not the board has the section
      // shown -- a visitor lands on `/inventory/...`, which 404s exactly as
      // `/gears/...` did while the section is hidden, and works the moment it
      // is not.
      {
        source: "/gears/:path*",
        destination: "/inventory/:path*",
        permanent: true,
      },
      // `/events/<uuid>` -> `/events/e/<uuid>` is NOT here. It was, and it
      // 404'd the whole portal (#1145): redirects in this file are matched
      // before `src/proxy.ts` runs and carry no idea what host they are on,
      // while on a `portal.` host the proxy strips the `/portal` prefix, so
      // the portal's own event URL is `/events/<uuid>` too. The public rule
      // caught the portal's URL and sent it somewhere no portal route exists.
      //
      // It lives in `src/proxy.ts` now, next to `isPortalHost`, which is the
      // only place that can tell the two apart. Weigh the same risk before
      // adding any rule here: every source below has to be a path the portal
      // does not also serve unprefixed.
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "rickiecruz",
  project: "coven-web",

  // Build-time secret, set in Vercel and in CI -- never committed. Without it
  // the build still succeeds, it just skips source map upload and production
  // stack traces stay minified.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Uploads the wider set of client chunks, so a frame in a shared bundle
  // resolves to real source instead of a vendor chunk offset.
  widenClientFileUpload: true,

  // Keep `bun run build` quiet locally; let CI print the upload log.
  silent: !process.env.CI,
});
