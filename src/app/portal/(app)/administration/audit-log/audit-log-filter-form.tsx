import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FiltersSheet } from "@/components/filters-sheet";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import { TABLE_LABELS } from "./audit-log-badges";

const RELATED_LABELS: Record<(typeof RELATED_VALUES)[number], string> = {
  event: "Social posts for an event",
  calendar_item: "Social posts for a calendar item",
  program: "Social posts for a program",
  none: "Standalone social posts",
};
import {
  ACTION_VALUES,
  RELATED_VALUES,
  TABLE_VALUES,
  type AuditLogParams,
} from "./audit-log-params";

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function AuditLogFilterForm({
  filters,
  users,
  hasActiveFilters,
}: {
  filters: AuditLogParams;
  users: { user_id: string; email: string | null }[];
  hasActiveFilters: boolean;
}) {
  const activeFilterCount = [
    filters.table !== "all",
    filters.action !== "all",
    filters.related !== "all",
    filters.actor !== "all",
    !!filters.from,
    !!filters.to,
  ].filter(Boolean).length;

  return (
    <div className="rainbow-surface mt-6 flex justify-end rounded-xl border border-[var(--line)] p-4 shadow-md">
      <FiltersSheet activeCount={activeFilterCount}>
        <form method="get" className="flex flex-col gap-4">
          <input type="hidden" name="sort" value={filters.sort} />
          <input type="hidden" name="dir" value={filters.dir} />

          <div className="flex flex-col gap-1">
            <label
              htmlFor="table"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Table
            </label>
            <select
              id="table"
              name="table"
              defaultValue={filters.table}
              className={selectClassName}
            >
              <option value="all">All tables</option>
              {TABLE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {TABLE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="action"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Action
            </label>
            <select
              id="action"
              name="action"
              defaultValue={filters.action}
              className={selectClassName}
            >
              <option value="all">All actions</option>
              {ACTION_VALUES.map((value) => (
                <option key={value} value={value} className="capitalize">
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="related"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Related to
            </label>
            <select
              id="related"
              name="related"
              defaultValue={filters.related}
              className={selectClassName}
            >
              <option value="all">Anything</option>
              {RELATED_VALUES.map((value) => (
                <option key={value} value={value}>
                  {RELATED_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="actor"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Actor
            </label>
            <select
              id="actor"
              name="actor"
              defaultValue={filters.actor}
              className={selectClassName}
            >
              <option value="all">All actors</option>
              {users.map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {user.email ?? user.user_id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="from"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={filters.from}
              className={selectClassName}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="to"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={filters.to}
              className={selectClassName}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterSubmitButton />
            {hasActiveFilters && (
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/portal/administration/audit-log" />}
              >
                <LinkPendingPulse>Clear</LinkPendingPulse>
              </Button>
            )}
          </div>
        </form>
      </FiltersSheet>
    </div>
  );
}
