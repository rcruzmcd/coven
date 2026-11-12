"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListFilter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { CONTENT_STATUSES } from "@/lib/social-content/pieces";
import {
  SOCIAL_LINKED_TO,
  SOCIAL_REPEATS,
  activeSocialFilterCount,
  socialHref,
  type SocialFilters,
  type SocialLinkedTo,
  type SocialRepeats,
} from "@/lib/social-content/social-filters";
import type { SocialContentLinkOption } from "@/lib/social-content/piece-actions";
import { formatInstantDate } from "@/lib/format";
import { ownerName, type CalendarOwner } from "../calendar/calendar-shared";

const labelClassName =
  "app-muted text-xs font-semibold uppercase tracking-[0.1em]";

type Option = { value: string; label: string };

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <Select value={value} onValueChange={(next) => onChange(next ?? "all")}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {(selected: string) =>
              options.find((option) => option.value === selected)?.label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Status, owner, reviewer, what a post is related to (#1794), down to one
 * event (#1795), and whether it repeats (#1839). Applying writes them to the URL, which is where the page
 * reads them from, so they survive a reload.
 */
export function SocialFiltersSheet({
  filters,
  owners,
  events,
}: {
  filters: SocialFilters;
  owners: CalendarOwner[];
  events: SocialContentLinkOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  function handleOpenChange(next: boolean) {
    if (next) setDraft(filters);
    setOpen(next);
  }

  function apply(next: SocialFilters) {
    setOpen(false);
    router.push(socialHref(next));
  }

  function update<K extends keyof SocialFilters>(
    key: K,
    value: SocialFilters[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const people: Option[] = owners.map((owner) => ({
    value: owner.person_id,
    label: ownerName(owners, owner.person_id),
  }));
  const activeCount = activeSocialFilterCount(filters);

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
          <FilterSelect
            id="social-filter-status"
            label="Status"
            value={draft.status}
            options={[
              { value: "all", label: "All statuses" },
              ...CONTENT_STATUSES,
            ]}
            onChange={(value) => update("status", value)}
          />
          <FilterSelect
            id="social-filter-owner"
            label="Owner"
            value={draft.owner}
            options={[
              { value: "all", label: "Anyone" },
              { value: "none", label: "No owner" },
              ...people,
            ]}
            onChange={(value) => update("owner", value)}
          />
          <FilterSelect
            id="social-filter-reviewer"
            label="Reviewer"
            value={draft.reviewer}
            options={[
              { value: "all", label: "Anyone" },
              { value: "none", label: "No reviewer" },
              ...people,
            ]}
            onChange={(value) => update("reviewer", value)}
          />
          <FilterSelect
            id="social-filter-linked"
            label="Related to"
            value={draft.linkedTo}
            options={[...SOCIAL_LINKED_TO]}
            onChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                linkedTo: value as SocialLinkedTo,
                // One event only narrows "an event".
                event: value === "event" ? prev.event : "all",
              }))
            }
          />
          {draft.linkedTo === "event" && events.length > 0 && (
            <FilterSelect
              id="social-filter-event"
              label="Event"
              value={draft.event}
              options={[
                { value: "all", label: "Any event" },
                ...events.map((event) => ({
                  value: event.id,
                  label: `${event.label} · ${formatInstantDate(event.starts_at)}`,
                })),
              ]}
              onChange={(value) => update("event", value)}
            />
          )}
          <FilterSelect
            id="social-filter-repeats"
            label="Repeats"
            value={draft.repeats}
            options={[...SOCIAL_REPEATS]}
            onChange={(value) => update("repeats", value as SocialRepeats)}
          />
        </div>

        <SheetFooter className="flex-row justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              apply({
                ...filters,
                status: "all",
                owner: "all",
                reviewer: "all",
                linkedTo: "all",
                event: "all",
                repeats: "all",
              })
            }
          >
            Clear
          </Button>
          <Button type="button" onClick={() => apply(draft)}>
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
