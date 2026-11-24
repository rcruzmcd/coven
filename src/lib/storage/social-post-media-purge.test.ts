import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// social-post-media-purge.ts imports "server-only", which throws outside a
// real Next.js server build.
mock.module("server-only", () => ({}));

const { runSocialPostMediaPurge } = await import("./social-post-media-purge");

const TENANT = "11111111-2222-4333-8444-555555555555";
const POST = "66666666-7777-4888-9999-000000000000";
const HOUR = 60 * 60 * 1000;

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

type Entry = { name: string; id: string | null; created_at: string | null };

/**
 * A stand-in for the service-role client: the recorded paths, a folder tree
 * keyed by prefix for `.list()`, and a record of deletions.
 */
function fakeClient(options: {
  tree: Record<string, Entry[]>;
  live?: string[];
  failRead?: boolean;
  failList?: boolean;
}) {
  const removed: string[] = [];
  const listed: string[] = [];
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      not: () => chain,
      order: () => chain,
      range: async () =>
        options.failRead
          ? { data: null, error: { message: "boom" } }
          : {
              data: (options.live ?? []).map((storage_path) => ({
                storage_path,
              })),
              error: null,
            },
      then: (resolve: (value: unknown) => void) =>
        resolve(
          table === "tenants"
            ? { data: [{ id: TENANT }], error: null }
            : { data: null, error: { message: "unexpected" } },
        ),
    };
    return chain;
  };
  const client = {
    from,
    storage: {
      from: () => ({
        list: async (prefix: string, { offset }: { offset: number }) => {
          listed.push(prefix);
          if (options.failList) return { data: null, error: { message: "x" } };
          return {
            data: offset === 0 ? (options.tree[prefix] ?? []) : [],
            error: null,
          };
        },
        remove: async (paths: string[]) => {
          removed.push(...paths);
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, removed, listed };
}

const folder = (name: string): Entry => ({ name, id: null, created_at: null });
const file = (name: string, hoursAgo: number): Entry => ({
  name,
  id: crypto.randomUUID(),
  created_at: ago(hoursAgo),
});

describe("runSocialPostMediaPurge", () => {
  test("deletes old unrecorded objects inside post folders only", async () => {
    const { client, removed } = fakeClient({
      tree: {
        [TENANT]: [folder(POST)],
        [`${TENANT}/${POST}`]: [
          file("live.png", 48),
          file("orphan.png", 48),
          file("fresh.png", 1),
        ],
      },
      live: [`${TENANT}/${POST}/live.png`],
    });

    const summary = await runSocialPostMediaPurge(client);

    expect(removed).toEqual([`${TENANT}/${POST}/orphan.png`]);
    expect(summary).toEqual({ tenants: 1, scanned: 3, deleted: 1, kept: 2 });
  });

  test("keeps an object with no created_at", async () => {
    const { client, removed } = fakeClient({
      tree: {
        [TENANT]: [folder(POST)],
        [`${TENANT}/${POST}`]: [{ name: "x.png", id: "1", created_at: null }],
      },
    });
    await runSocialPostMediaPurge(client);
    expect(removed).toEqual([]);
  });

  // An empty live set would read as "delete everything".
  test("throws before listing when the recorded paths can't be read", async () => {
    const { client, removed, listed } = fakeClient({
      tree: { [TENANT]: [folder(POST)] },
      failRead: true,
    });
    expect(runSocialPostMediaPurge(client)).rejects.toThrow(
      "Could not read social_post_media",
    );
    expect(listed).toEqual([]);
    expect(removed).toEqual([]);
  });

  test("throws when a prefix can't be listed", async () => {
    const { client, removed } = fakeClient({ tree: {}, failList: true });
    expect(runSocialPostMediaPurge(client)).rejects.toThrow("Could not list");
    expect(removed).toEqual([]);
  });
});
