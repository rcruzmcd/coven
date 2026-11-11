import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildHref, PAGE_SIZE, totalPagesFor } from "@/lib/pagination";
import { listUsersAction } from "../users/actions";
import { AuditLogFilterForm } from "./audit-log-filter-form";
import { parseAuditLogParams, type SortColumn } from "./audit-log-params";
import { AuditLogTable } from "./audit-log-table";
import { fetchAuditLogEntries } from "./audit-log-query";
import { fetchRelatedRecords } from "./audit-log-related";

type AuditLogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Audit Log",
};

export default async function AuditLogPage({
  searchParams,
}: AuditLogPageProps) {
  const supabase = await createSupabaseServerClient();
  const filters = parseAuditLogParams(await searchParams);

  const usersResult = await listUsersAction();
  const users = "data" in usersResult ? usersResult.data : [];
  const actorEmailById = new Map(
    users.map((user) => [user.user_id, user.email ?? user.user_id]),
  );

  const { entries, error, count } = await fetchAuditLogEntries(
    supabase,
    filters,
  );

  const relatedByEntryId = await fetchRelatedRecords(supabase, entries ?? []);

  const filterParams = new URLSearchParams();
  if (filters.table !== "all") filterParams.set("table", filters.table);
  if (filters.action !== "all") filterParams.set("action", filters.action);
  if (filters.related !== "all") filterParams.set("related", filters.related);
  if (filters.actor !== "all") filterParams.set("actor", filters.actor);
  if (filters.from) filterParams.set("from", filters.from);
  if (filters.to) filterParams.set("to", filters.to);
  // On filterParams rather than in each href, so sorting and paging both
  // carry the reader's choice without either having to remember to.
  if (filters.perPage !== PAGE_SIZE)
    filterParams.set("perPage", String(filters.perPage));

  function sortHref(column: SortColumn) {
    const nextDir =
      filters.sort === column && filters.dir === "desc" ? "asc" : "desc";
    return buildHref("/portal/administration/audit-log", filterParams, {
      sort: column,
      dir: nextDir,
    });
  }

  function pageHref(nextPage: number) {
    return buildHref("/portal/administration/audit-log", filterParams, {
      sort: filters.sort,
      dir: filters.dir,
      page: nextPage,
    });
  }

  function perPageHref(nextPerPage: number) {
    // Back to page one: a bigger page renumbers them all, and page 4 of 9 is
    // nothing in particular once each page holds 25.
    return buildHref("/portal/administration/audit-log", filterParams, {
      sort: filters.sort,
      dir: filters.dir,
      perPage: nextPerPage,
      page: 1,
    });
  }

  const hasActiveFilters =
    filters.table !== "all" ||
    filters.action !== "all" ||
    filters.related !== "all" ||
    filters.actor !== "all" ||
    !!filters.from ||
    !!filters.to;

  const totalPages = totalPagesFor(count, filters.perPage);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Audit Log
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <AuditLogFilterForm
        filters={filters}
        users={users}
        hasActiveFilters={hasActiveFilters}
      />

      <AuditLogTable
        entries={entries}
        error={error}
        sort={filters.sort}
        dir={filters.dir}
        sortHref={sortHref}
        actorEmailById={actorEmailById}
        relatedByEntryId={relatedByEntryId}
        page={filters.page}
        totalPages={totalPages}
        count={count}
        perPage={filters.perPage}
        pageHref={pageHref}
        perPageHref={perPageHref}
      />
    </>
  );
}
