import { describe, expect, test } from "bun:test";
import {
  formAnalyticsConfig,
  POSTHOG_PROXY_PATH,
} from "@/lib/analytics/form-analytics";
import vercelConfig from "../../../vercel.json";

const PRODUCTION = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
};
const ON = { form_analytics: true };

describe("formAnalyticsConfig", () => {
  test("on for a production deploy with a key and the module", () => {
    expect(formAnalyticsConfig(ON, "demo", PRODUCTION)).toEqual({
      apiKey: "phc_test",
      tenant: "demo",
    });
  });

  test("ignores the build-time-only NEXT_PUBLIC_VERCEL_ENV", () => {
    // Vercel sets the NEXT_PUBLIC_ copy only during the build, so the server
    // rendering the layout sees VERCEL_ENV alone.
    expect(
      formAnalyticsConfig(ON, "demo", {
        VERCEL_ENV: "production",
        NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      }),
    ).not.toBeNull();
    expect(
      formAnalyticsConfig(ON, "demo", {
        NEXT_PUBLIC_VERCEL_ENV: "production",
        NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      }),
    ).toBeNull();
  });

  test("off anywhere but production", () => {
    for (const env of ["preview", "development", undefined]) {
      expect(
        formAnalyticsConfig(ON, "demo", {
          ...PRODUCTION,
          VERCEL_ENV: env,
        }),
      ).toBeNull();
    }
  });

  test("off without a key or a tenant", () => {
    expect(
      formAnalyticsConfig(ON, "demo", {
        VERCEL_ENV: "production",
      }),
    ).toBeNull();
    expect(formAnalyticsConfig(ON, null, PRODUCTION)).toBeNull();
  });

  test("off when the module is off, and when it could not be read", () => {
    expect(
      formAnalyticsConfig({ form_analytics: false }, "demo", PRODUCTION),
    ).toBeNull();
    expect(formAnalyticsConfig({}, "demo", PRODUCTION)).toBeNull();
  });
});

describe("the /ph rewrites in vercel.json", () => {
  // posthog-js posts to `/e/`, `/i/v0/e/` and `/flags/`, all with a trailing
  // slash. Vercel's `:path*` does not match that slash, so every event fell
  // through to the 404 page and nothing reached PostHog. `:path(.*)` is the
  // form PostHog's Vercel proxy docs give, and it does.
  const rewrites = vercelConfig.rewrites.filter(({ source }) =>
    source.startsWith(`${POSTHOG_PROXY_PATH}/`),
  );

  test("each one captures the rest of the path, slash included", () => {
    expect(rewrites).toHaveLength(3);
    for (const { source, destination } of rewrites) {
      expect(source).toEndWith("/:path(.*)");
      expect(destination).toEndWith("/:path");
    }
  });

  test("the catch-all comes last", () => {
    expect(rewrites.at(-1)?.source).toBe(`${POSTHOG_PROXY_PATH}/:path(.*)`);
  });
});
