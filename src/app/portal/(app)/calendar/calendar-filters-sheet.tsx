"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListFilter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  CALENDAR_STATUSES,
  DECISIONS,
  ITEM_TYPES,
  PRIORITY_TIERS,
  RANGES,
  VISIBILITIES,
  type CalendarOwner,
  type CalendarProgram,
  ownerName,
} from "./calendar-shared";
import type { CalendarCategory } from "./calendar-shared";
import { CONTENT_STATUSES } from "@/lib/social-content/pieces";
import { personDisplayName } from "@/lib/format";
import type { CalendarView } from "./view-toggle";
import type { ListSortColumn } from "./list-view";

const fieldLabelClassName =
  "app-muted text-xs font-semibold uppercase tracking-[0.1em]";

type CalendarFiltersSheetProps = {
  /** The tenant's category vocabulary (#834). */
  categoryVocabulary: CalendarCategory[];
  view: CalendarView;
  month: string;
  sort: ListSortColumn;
  dir: "asc" | "desc";
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  typeFilter: string;
  categoryFilter: string;
  priorityFilter: string;
  programFilter: string;
  ownerFilter: string;
  visibilityFilter: string;
  statusFilter: string;
  decisionFilter: string;
  contentStatusFilter: string;
  search: string;
  onSearchChange: (value: string) => void;
  range: string;
  onRangeChange: (value: string) => void;
  /** Events exist for this viewer but the active filters can't express them -- see filtersExcludeEvents. */
  eventsHidden: boolean;
};

export function CalendarFiltersSheet({
  view,
  month,
  sort,
  dir,
  owners,
  programs,
  typeFilter,
  categoryFilter,
  priorityFilter,
  programFilter,
  ownerFilter,
  visibilityFilter,
  statusFilter,
  decisionFilter,
  contentStatusFilter,
  search,
  onSearchChange,
  range,
  onRangeChange,
  eventsHidden,
  categoryVocabulary,
}: CalendarFiltersSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [type, setType] = useState(typeFilter);
  const [category, setCategory] = useState(categoryFilter);
  const [priority, setPriority] = useState(priorityFilter);
  const [program, setProgram] = useState(programFilter);
  const [owner, setOwner] = useState(ownerFilter);
  const [visibility, setVisibility] = useState(visibilityFilter);
  const [status, setStatus] = useState(statusFilter);
  const [decision, setDecision] = useState(decisionFilter);
  const [contentStatus, setContentStatus] = useState(contentStatusFilter);

  const activeCount =
    [
      typeFilter,
      categoryFilter,
      priorityFilter,
      programFilter,
      ownerFilter,
      visibilityFilter,
      statusFilter,
      decisionFilter,
      contentStatusFilter,
    ].filter((value) => value !== "all").length +
    (search.trim() !== "" ? 1 : 0) +
    (range !== "all" ? 1 : 0);

  function handleOpenChange(next: boolean) {
    if (next) {
      setType(typeFilter);
      setCategory(categoryFilter);
      setPriority(priorityFilter);
      setProgram(programFilter);
      setOwner(ownerFilter);
      setVisibility(visibilityFilter);
      setStatus(statusFilter);
      setDecision(decisionFilter);
      setContentStatus(contentStatusFilter);
    }
    setOpen(next);
  }

  function handleApply() {
    const sp = new URLSearchParams();
    if (type !== "all") sp.set("type", type);
    if (category !== "all") sp.set("category", category);
    if (priority !== "all") sp.set("priority", priority);
    if (program !== "all") sp.set("program", program);
    if (owner !== "all") sp.set("owner", owner);
    if (visibility !== "all") sp.set("visibility", visibility);
    if (status !== "all") sp.set("status", status);
    if (decision !== "all") sp.set("decision", decision);
    if (contentStatus !== "all") sp.set("contentStatus", contentStatus);
    sp.set("view", view);
    sp.set("sort", sort);
    sp.set("dir", dir);
    if (view === "month") sp.set("month", month);
    setOpen(false);
    router.push(`/portal/calendar?${sp.toString()}`);
  }

  function handleClear() {
    setType("all");
    setCategory("all");
    setPriority("all");
    setProgram("all");
    setOwner("all");
    setVisibility("all");
    setStatus("all");
    setDecision("all");
    setContentStatus("all");
    onSearchChange("");
    onRangeChange("all");
    setOpen(false);
    router.push(`/portal/calendar?view=${view}`);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger render={<Button type="button" variant="secondary" />}>
        <ListFilter className="size-4" />
        Filters
        {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
      </SheetTrigger>
      <SheetContent side="right" size="sm">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {eventsHidden && (
            <p className="app-muted text-xs">
              Your own events are hidden while these filters are active.
              Priority, owner, decision, status and content status are
              content-calendar fields an event has no value for.
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="calendar-search" className={fieldLabelClassName}>
              Search
            </label>
            <Input
              id="calendar-search"
              placeholder="Title or summary..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="calendar-range" className={fieldLabelClassName}>
              Range
            </label>
            <Select
              value={range}
              onValueChange={(value) => onRangeChange(value ?? "all")}
            >
              <SelectTrigger id="calendar-range">
                <SelectValue placeholder="All upcoming">
                  {(value: string) =>
                    RANGES.find((option) => option.value === value)?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-type" className={fieldLabelClassName}>
              Type
            </label>
            <Select value={type} onValueChange={(v) => setType(v ?? "all")}>
              <SelectTrigger id="filter-type">
                <SelectValue placeholder="All types">
                  {(value: string) =>
                    value === "all"
                      ? "All types"
                      : ITEM_TYPES.find((option) => option.value === value)
                          ?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ITEM_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-category" className={fieldLabelClassName}>
              Category
            </label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v ?? "all")}
            >
              <SelectTrigger id="filter-category">
                <SelectValue placeholder="All categories">
                  {(value: string) =>
                    value === "all"
                      ? "All categories"
                      : categoryVocabulary.find(
                          (option) => option.value === value,
                        )?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryVocabulary.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-priority" className={fieldLabelClassName}>
              Priority
            </label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v ?? "all")}
            >
              <SelectTrigger id="filter-priority">
                <SelectValue placeholder="All tiers">
                  {(value: string) =>
                    value === "all"
                      ? "All tiers"
                      : PRIORITY_TIERS.find((option) => option.value === value)
                          ?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                {PRIORITY_TIERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-program" className={fieldLabelClassName}>
              Program
            </label>
            <Select
              value={program}
              onValueChange={(v) => setProgram(v ?? "all")}
            >
              <SelectTrigger id="filter-program">
                <SelectValue placeholder="All programs">
                  {(value: string) =>
                    value === "all"
                      ? "All programs"
                      : programs.find((option) => option.id === value)?.name
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programs</SelectItem>
                {programs.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-owner" className={fieldLabelClassName}>
              Owner
            </label>
            <Select value={owner} onValueChange={(v) => setOwner(v ?? "all")}>
              <SelectTrigger id="filter-owner">
                <SelectValue placeholder="All owners">
                  {(value: string) =>
                    value === "all" ? "All owners" : ownerName(owners, value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {owners.map((option) => (
                  <SelectItem key={option.person_id} value={option.person_id}>
                    {personDisplayName(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-visibility" className={fieldLabelClassName}>
              Visibility
            </label>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v ?? "all")}
            >
              <SelectTrigger id="filter-visibility">
                <SelectValue placeholder="All">
                  {(value: string) =>
                    value === "all"
                      ? "All"
                      : VISIBILITIES.find((option) => option.value === value)
                          ?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {VISIBILITIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-status" className={fieldLabelClassName}>
              Status
            </label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
              <SelectTrigger id="filter-status">
                <SelectValue placeholder="All statuses">
                  {(value: string) =>
                    value === "all"
                      ? "All statuses"
                      : CALENDAR_STATUSES.find(
                          (option) => option.value === value,
                        )?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {CALENDAR_STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-decision" className={fieldLabelClassName}>
              Decision
            </label>
            <Select
              value={decision}
              onValueChange={(v) => setDecision(v ?? "all")}
            >
              <SelectTrigger id="filter-decision">
                <SelectValue placeholder="All">
                  {(value: string) => {
                    if (value === "all") return "All";
                    if (value === "none") return "No decision";
                    return DECISIONS.find((option) => option.value === value)
                      ?.label;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="none">No decision</SelectItem>
                {DECISIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="filter-content-status"
              className={fieldLabelClassName}
            >
              Content status
            </label>
            <Select
              value={contentStatus}
              onValueChange={(v) => setContentStatus(v ?? "all")}
            >
              <SelectTrigger id="filter-content-status">
                <SelectValue placeholder="Any">
                  {(value: string) =>
                    value === "all"
                      ? "Any"
                      : CONTENT_STATUSES.find(
                          (option) => option.value === value,
                        )?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                {CONTENT_STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="app-muted text-xs">
              Items with at least one social post at this status.
            </p>
          </div>
        </div>

        <SheetFooter className="flex-wrap">
          <Button type="button" variant="ghost" onClick={handleClear}>
            Clear
          </Button>
          <Button type="button" onClick={handleApply}>
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
