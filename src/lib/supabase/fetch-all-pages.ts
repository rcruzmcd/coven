/** PostgREST's response cap (`max_rows` in `supabase/config.toml`). */
export const PAGE_SIZE = 1000;

/**
 * Every row a query returns, a page at a time. A single request stops at the
 * response cap and silently drops whatever is past it, so a list that must be
 * complete -- a picker, an export -- reads it in pages instead.
 *
 * `fetchPage` must order stably (end on a unique key such as `id`) so pages
 * neither overlap nor skip. An error ends the read with the rows so far.
 */
export async function fetchAllPages<Row>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: unknown }>,
  pageSize: number = PAGE_SIZE,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error || !data) return rows;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
