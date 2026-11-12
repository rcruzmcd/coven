import {
  afterEach,
  beforeAll,
  expect,
  mock,
  setDefaultTimeout,
} from "bun:test";
import { readFileSync } from "node:fs";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);
afterEach(cleanup);

// A CI unit shard runs ~130 files in one process. Even under `--isolate` the
// previous files' React trees and happy-dom windows are only garbage until the
// collector gets to them, and on the runner it did not keep up: the shard sat
// at 2.4 GB resident by the time profile-questions-editor.dom.test.tsx started,
// and its reorder test is where the process ran out and aborted with SIGABRT
// on every run (#1786). A full, synchronous collection before each file hands
// that memory back before the next file starts building its own.
beforeAll(() => {
  Bun.gc(true);
  // TEMP (#1786): resident size per file, read from /proc so measuring it
  // does not itself touch the JS heap. Removed once CI confirms the fix.
  if (process.env.CI) {
    try {
      const rss = /VmRSS:\s+(\d+)/.exec(
        readFileSync("/proc/self/status", "utf8"),
      )?.[1];
      console.error(`[1786] rss=${Math.round(Number(rss) / 1024)}MB`);
    } catch {}
  }
});

// Bun's 5s default is sized for pure-logic tests. A DOM test that renders a
// React tree, drives it through userEvent and then polls with waitFor runs
// several times slower on a CI runner than it does locally (measured while CI
// still passed `--coverage`, dropped in #1170; the runner is the slow part)
// -- content-editor.dom.test.tsx's "saving stores a draft" case takes ~0.2s
// here and has hit the 5s wall twice on CI, on `development` as well as on a
// PR branch. The work is bounded either way, so the deadline only needs to be
// far enough out that a slow machine is not mistaken for a hung test.
setDefaultTimeout(20_000);

// `server-only` exists to throw when a Server Component module is pulled into
// the client bundle, and Next's bundler is what decides that: a `"use server"`
// module is replaced with action references, so the sender behind it never
// reaches the browser. Bun has no such bundler -- it imports the chain for
// real -- so a client component whose island imports its own Server Actions
// blows up here for a reason that does not exist in the application. Several
// files already stubbed this one at a time (#1309); #1317 put a `server-only`
// sender behind the registrants tab, which every event-page test reaches
// through, so it moves here.
//
// This is not the check that a client component stays on the client. `bun run
// build`, which CI runs, is -- and it enforces the boundary against the real
// module graph rather than against whichever chain a test happened to import.
mock.module("server-only", () => ({}));

// Client components can call these hooks outside of a real Next.js router
// (e.g. useRouter() at the top of a dialog that's currently closed), so give
// every DOM test a harmless default. Override with a per-file mock.module
// call (before importing the component under test) when a test needs to
// assert on navigation.
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: () => {},
  permanentRedirect: () => {},
  notFound: () => {},
}));
