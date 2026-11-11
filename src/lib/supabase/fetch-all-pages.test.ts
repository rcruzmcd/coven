import { describe, expect, test } from "bun:test";
import { fetchAllPages } from "./fetch-all-pages";

/** A fake table of `total` rows answering `.range(from, to)`. */
function table(total: number, failAt?: number) {
  const ranges: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    ranges.push([from, to]);
    if (from === failAt) return { data: null, error: new Error("boom") };
    const data = Array.from(
      { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
      (_, i) => from + i,
    );
    return { data, error: null };
  };
  return { ranges, fetchPage };
}

describe("fetchAllPages", () => {
  test("reads past the response cap, a page at a time", async () => {
    const { ranges, fetchPage } = table(2500);
    const rows = await fetchAllPages(fetchPage, 1000);
    expect(rows).toHaveLength(2500);
    expect(rows.at(-1)).toBe(2499);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  test("asks once more after an exactly full page", async () => {
    const { ranges, fetchPage } = table(2000);
    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(2000);
    expect(ranges).toHaveLength(3);
  });

  test("stops with the rows so far on an error", async () => {
    const { fetchPage } = table(2500, 1000);
    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(1000);
  });
});
