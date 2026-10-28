"use client";

import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  MoreHorizontal,
  Search,
  Snowflake,
  Ban,
  MessageCircle,
  MessageCircleOff,
  Undo2,
  X,
} from "lucide-react";
import {
  listEventRegistrantsAction,
  setRegistrationsGroupChatAction,
  type EventRegistrant,
} from "../../registrants-actions";
import { getEventImpactDerivedAction } from "../../impact-derived-actions";
import { REGISTRANT_PARAM } from "../../registrant-detail-sheet";
import { AddRegistrantDialog } from "../../add-registrant-dialog";
import { CheckInWalkInDialog } from "../../check-in-walkin-dialog";
import { AnnounceToRegistrantsDialog } from "../../announce-to-registrants-dialog";
import { AskForMissingAnswersDialog } from "../../ask-for-missing-answers-dialog";
import { RegistrantBadges } from "../../registrant-badges";
import {
  CancelledRegistrations,
  RegistrantAnnouncementsSection,
  RegistrantOverlays,
} from "../../registrants-shared";
import {
  registrantAnswersCsvHref,
  registrationAnswerColumns,
  registrantCarpoolColumns,
  registrantGroupChatColumns,
  registrantInstagramColumns,
} from "../../registrants-tab";
import { useRegistrantRowActions } from "../../use-registrant-row-actions";
import { levelTotal, riderStats, type LevelCounts } from "../../rider-stats";
import {
  filterRegistrants,
  isFiltered,
  isMissingRequired,
  parseRegistrantsView,
  registrantsViewParams,
  type RegistrantFlag,
  type RegistrantsView,
} from "../../registrants-view-state";
import {
  countSelfReportedFirstTimers,
  hasAnyAttendedBeforeAnswer,
} from "@/lib/attended-before";
import type { RegistrationQuestion } from "@/lib/registration-questions";
import { EXPERIENCE_LEVELS } from "@/lib/rider-profile";
import {
  answerColumnLabel,
  answerColumns,
  answerFilterChoices,
  shownAnswerColumns,
} from "@/lib/registration-answer-columns";
import { useTabData } from "@/hooks/use-tab-data";
import { runAction } from "@/components/portal/action-toast";
import { Checkbox } from "@/components/ui/checkbox";
import type { EventGroupChat } from "@/lib/registration-group-chat";
import { formatInstantDate } from "@/lib/format";
import { ViewerTime } from "@/components/viewer-time";
import { StatusBadge } from "@/components/portal/status-badge";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { EmptyState } from "@/components/portal/empty-state";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";

const NO_QUESTIONS: RegistrationQuestion[] = [];

const FLAG_LABELS: Record<RegistrantFlag, string> = {
  minor: "Includes a minor",
  "no-photos": "No photos",
};

/** Where Registration settings live: the event's Planning section. */
function registrationSettingsHref(eventId: string): string {
  return `/portal/events/${encodeURIComponent(eventId)}?tab=planning`;
}

/** The options a registration took, one tag each. */
function chosenOptions(registrant: EventRegistrant) {
  return [...registrant.option_counts]
    .filter((row) => row.quantity > 0)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * A count against what it is counted against, with a bar. The bar is
 * decoration -- the numbers beside it say the same thing in words -- so it is
 * hidden from assistive technology rather than given a second name.
 */
function Meter({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * One discipline's card in the Riders breakdown: everybody who rides that way,
 * "both" included, split by level.
 */
function RiderLevels({
  label,
  levels,
}: {
  label: string;
  levels: LevelCounts;
}) {
  const total = levelTotal(levels);
  return (
    <div className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium">{label}</h3>
        <span className="text-lg font-semibold tabular-nums">{total}</span>
      </div>
      <dl className="flex flex-col gap-1.5">
        {EXPERIENCE_LEVELS.map((level) => (
          <div key={level.value} className="flex flex-col gap-1">
            <div className="flex justify-between gap-2">
              <dt className="app-muted">{level.label}</dt>
              <dd className="tabular-nums">{levels[level.value]}</dd>
            </div>
            <Meter value={levels[level.value]} max={total} />
          </div>
        ))}
        {levels.unknown > 0 && (
          <div className="app-muted flex justify-between gap-2 text-xs">
            <dt>Level not given</dt>
            <dd className="tabular-nums">{levels.unknown}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function StatTile({
  label,
  value,
  of,
  hint,
  meter,
  className,
}: {
  label: string;
  value: number;
  of?: string;
  hint?: string;
  meter?: { value: number; max: number };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border px-3.5 py-3",
        className,
      )}
    >
      <dt className="app-muted text-xs">{label}</dt>
      {/* The meter sits inside the value's own <dd>: a <dl> group may hold
          only <dt> and <dd>. */}
      <dd className="flex flex-col gap-1">
        <span className="text-2xl font-semibold tabular-nums">
          {value}
          {of && (
            <span className="app-muted ml-1 text-sm font-medium">{of}</span>
          )}
        </span>
        {meter && <Meter value={meter.value} max={meter.max} />}
      </dd>
      {hint && <dd className="app-muted text-xs">{hint}</dd>}
    </div>
  );
}

export function RegistrantsPage({
  eventId,
  eventName,
  startsAt,
  timezone,
  capacity,
  registrationOpen,
  canManage,
}: {
  eventId: string;
  eventName: string;
  startsAt: string;
  /** Renders the date until the browser has said which zone it is in. */
  timezone: string;
  capacity: number | null;
  registrationOpen: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useMemo(
    () => parseRegistrantsView(searchParams),
    [searchParams],
  );
  const detailId = searchParams.get(REGISTRANT_PARAM);

  const registrantsData = useTabData(
    () => listEventRegistrantsAction(eventId),
    [eventId],
  );
  const derived = useTabData(
    () => getEventImpactDerivedAction(eventId),
    [eventId],
  );
  const { data, loadError } = registrantsData;
  const messaging = data?.messaging ?? null;
  const registrationOptions = data?.registrationOptions ?? null;
  const questions = data?.registrationQuestions ?? NO_QUESTIONS;
  // #1648. Null when the event's switch is off: no column, filter or toggle.
  const groupChat = data?.groupChat ?? null;
  // #1649. Undefined or null when the event's switch is off: no column.
  const carpools = data?.carpools;
  const asksRequired = questions.some((question) => question.required);

  const refreshRegistrants = registrantsData.refresh;
  const refreshDerived = derived.refresh;
  const refreshAll = useCallback(() => {
    refreshRegistrants();
    refreshDerived();
    router.refresh();
  }, [refreshRegistrants, refreshDerived, router]);
  const { toggleCheckIn, restore, isRowPending } =
    useRegistrantRowActions(refreshAll);

  const [riderTarget, setRiderTarget] = useState<EventRegistrant | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EventRegistrant | null>(
    null,
  );
  // The More menu's two composers, opened from a menu item rather than a
  // button of their own, and mounted only while open so each opens fresh.
  const [composer, setComposer] = useState<"announce" | "ask" | null>(null);

  // The search box answers each keystroke from local state, and the URL
  // follows; a URL change from elsewhere (Back, a link) re-seeds the box.
  const [query, setQuery] = useState(view.q);
  const [prevQ, setPrevQ] = useState(view.q);
  if (view.q !== prevQ) {
    setPrevQ(view.q);
    setQuery(view.q);
  }

  /**
   * Writes the view into the URL with `history.replaceState`: Next keeps
   * `useSearchParams` in step with it, and the list is client state, so a
   * server round trip per keystroke or filter would buy nothing. Replace, not
   * push, so Back leaves the page rather than stepping through filters.
   */
  const writeParams = useCallback(
    (params: URLSearchParams) => {
      const search = params.toString();
      window.history.replaceState(
        null,
        "",
        `${pathname}${search ? `?${search}` : ""}`,
      );
    },
    [pathname],
  );
  const setView = useCallback(
    (patch: Partial<RegistrantsView>) =>
      writeParams(
        registrantsViewParams(new URLSearchParams(searchParams), patch),
      ),
    [writeParams, searchParams],
  );
  const openDetail = useCallback(
    (registrant: EventRegistrant) => {
      const params = new URLSearchParams(searchParams);
      params.set(REGISTRANT_PARAM, registrant.id);
      writeParams(params);
    },
    [writeParams, searchParams],
  );

  const list = useMemo(() => data?.registrants ?? [], [data]);
  const cancelled = data?.cancelled ?? [];
  const rows = useMemo(
    () =>
      filterRegistrants(
        list,
        // A `chat=` left in a link filters nothing once the switch is off.
        groupChat ? view : { ...view, groupChat: null },
        questions,
      ),
    [list, view, questions, groupChat],
  );

  // #1648. The rows ticked for a bulk group chat change. Only the ones still
  // on screen count, so a filter that hides a ticked row also leaves it out.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const shownSelectedIds = rows
    .map((row) => row.id)
    .filter((id) => selectedIds.has(id));
  const toggleSelected = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const [groupChatPending, startGroupChat] = useTransition();
  const setGroupChat = useCallback(
    (ids: string[], added: boolean, onDone?: () => void) => {
      if (!groupChat || ids.length === 0) return;
      startGroupChat(async () => {
        await runAction(
          () =>
            setRegistrationsGroupChatAction({
              eventId,
              registrationIds: ids,
              added,
            }),
          {
            success: ({ changed }) =>
              `${changed} ${changed === 1 ? "registrant" : "registrants"} marked ${added ? "added to" : "not in"} ${groupChat.label}.`,
            onSuccess: () => {
              onDone?.();
              refreshRegistrants();
            },
          },
        );
      });
    },
    [groupChat, eventId, refreshRegistrants],
  );
  const notInChatCount = groupChat
    ? list.filter((row) => row.group_chat_added_at === null).length
    : 0;

  const totalAttending = list.reduce((sum, row) => sum + row.party_size, 0);
  const checkedIn = list.filter((row) => row.checked_in_at !== null);
  const checkedInPeople = checkedIn.reduce(
    (sum, row) => sum + row.party_size,
    0,
  );
  const showAttendedBefore = hasAnyAttendedBeforeAnswer(list);
  // Null on every row means this viewer isn't cleared for rider answers, or
  // the tenant doesn't have the rider_profile module (#1408).
  const riders = list.flatMap((row) => (row.rider ? [row.rider] : []));
  const riderBreakdown = riders.length > 0 ? riderStats(riders) : null;
  const missingCount = asksRequired
    ? list.filter((row) => isMissingRequired(row, questions)).length
    : 0;
  const choseAnyOption = list.filter(
    (row) => chosenOptions(row).length > 0,
  ).length;
  const activeOption = registrationOptions?.options.find(
    (option) => option.id === view.option,
  );
  // #1512. Every column the Columns menu offers, and the ones it shows.
  const allAnswerColumns = useMemo(() => answerColumns(questions), [questions]);
  const shownColumnIds = new Set(
    shownAnswerColumns(allAnswerColumns, view.columns).map(
      (column) => column.question.id,
    ),
  );
  // A chip per shown column with a short list of answers, plus any column
  // still filtered after it was hidden, so a filter is never invisible.
  const answerFilters = allAnswerColumns.flatMap(({ question }) => {
    const choices = answerFilterChoices(
      question,
      list.map((registrant) => registrant.answers),
    );
    return choices &&
      (shownColumnIds.has(question.id) || question.id in view.answers)
      ? [{ question, choices }]
      : [];
  });

  const columns = useMemo<PortalDataTableColumn<EventRegistrant>[]>(
    () => [
      ...(canManage && groupChat
        ? [
            {
              key: "select",
              label: "Select",
              srOnlyLabel: true,
              headClassName: "w-0",
              render: (registrant: EventRegistrant) => (
                // A label, so the row's click-to-open leaves it alone.
                <label className="flex items-center">
                  <Checkbox
                    aria-label={`Select ${registrant.name}`}
                    checked={selectedIds.has(registrant.id)}
                    onCheckedChange={(checked) =>
                      toggleSelected(registrant.id, Boolean(checked))
                    }
                  />
                </label>
              ),
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
      {
        key: "name",
        label: "Name",
        sortValue: (registrant) => registrant.name,
        // Wraps rather than truncating: a forty-character name is real
        // (#1511's seed), and this column is the one a reader came for.
        cellClassName: "min-w-36 max-w-56 whitespace-normal",
        render: (registrant) => (
          <>
            <button
              type="button"
              className="text-left font-medium break-words hover:underline focus-visible:underline focus-visible:outline-none"
              onClick={() => openDetail(registrant)}
            >
              {registrant.name}
            </button>
            {registrant.pronouns && (
              <span className="app-muted block text-xs">
                {registrant.pronouns}
              </span>
            )}
            {/* The phone's card: what the columns dropped below md say,
                in one line under the name. */}
            <span className="app-muted block text-xs md:hidden">
              Party of {registrant.party_size}
              {chosenOptions(registrant).map((row) => ` · ${row.label}`)}
            </span>
            <span className="flex flex-wrap gap-1">
              <RegistrantBadges registrant={registrant} />
            </span>
          </>
        ),
      },
      {
        key: "contact",
        label: "Contact",
        sortValue: (registrant) => registrant.email,
        hideBelow: "md",
        cellClassName: "app-muted max-w-56 text-xs whitespace-normal break-all",
        render: (registrant) => (
          <>
            {registrant.email}
            {registrant.phone && (
              <span className="block">{registrant.phone}</span>
            )}
          </>
        ),
      },
      ...registrantInstagramColumns(list, canManage),
      ...registrantGroupChatColumns(groupChat),
      ...registrantCarpoolColumns(carpools),
      {
        key: "party_size",
        label: "Party",
        sortValue: (registrant) => registrant.party_size,
        hideBelow: "md",
        cellClassName: "tabular-nums",
        render: (registrant) => registrant.party_size,
      },
      ...(registrationOptions
        ? [
            {
              key: "options",
              label: "Option",
              sortValue: (registrant: EventRegistrant) =>
                chosenOptions(registrant)[0]?.label ?? null,
              hideBelow: "md",
              cellClassName: "max-w-48 whitespace-normal",
              render: (registrant: EventRegistrant) => {
                const chosen = chosenOptions(registrant);
                return chosen.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {chosen.map((row) => (
                      <span
                        key={row.label}
                        className="rounded-md border px-1.5 py-0.5 text-xs"
                      >
                        {row.quantity > 1 ? `${row.quantity} × ` : ""}
                        {row.label}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="app-muted">—</span>
                );
              },
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
      ...registrationAnswerColumns(questions, view.columns),
      {
        key: "created_at",
        label: "Registered",
        sortValue: (registrant) => registrant.created_at,
        hideBelow: "lg",
        cellClassName: "app-muted text-xs whitespace-nowrap",
        render: (registrant) => formatInstantDate(registrant.created_at),
      },
      {
        key: "checked_in_at",
        label: "Check-in",
        sortValue: (registrant) => registrant.checked_in_at,
        cellClassName: "whitespace-nowrap",
        render: (registrant) =>
          registrant.checked_in_at ? (
            <StatusBadge tone="success" className="font-normal">
              ✓{" "}
              {new Date(registrant.checked_in_at).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </StatusBadge>
          ) : canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Check in ${registrant.name}`}
              disabled={isRowPending(registrant)}
              onClick={() => toggleCheckIn(registrant)}
            >
              Check in
            </Button>
          ) : (
            <span className="app-muted text-sm">Not yet</span>
          ),
      },
      ...(canManage
        ? [
            {
              key: "actions",
              label: "Actions",
              srOnlyLabel: true,
              headClassName: "w-0",
              cellClassName: "text-right",
              render: (registrant: EventRegistrant) => (
                <RowMenu
                  registrant={registrant}
                  pending={isRowPending(registrant)}
                  onUndoCheckIn={() => toggleCheckIn(registrant)}
                  onRider={() => setRiderTarget(registrant)}
                  onCancel={() => setCancelTarget(registrant)}
                  groupChat={groupChat}
                  groupChatPending={groupChatPending}
                  onToggleGroupChat={() =>
                    setGroupChat(
                      [registrant.id],
                      registrant.group_chat_added_at === null,
                    )
                  }
                />
              ),
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
    ],
    [
      list,
      registrationOptions,
      questions,
      view.columns,
      canManage,
      isRowPending,
      toggleCheckIn,
      openDetail,
      groupChat,
      carpools,
      groupChatPending,
      selectedIds,
      toggleSelected,
      setGroupChat,
    ],
  );

  const orgEmailOff =
    messaging && !messaging.orgEmailEnabled
      ? "Outbound email is switched off for this organization."
      : null;

  let actions: ReactNode = null;
  if (canManage) {
    actions = (
      <div className="flex flex-wrap items-center gap-2">
        <CheckInWalkInDialog
          eventId={eventId}
          triggerVariant="default"
          onSaved={refreshAll}
        />
        <AddRegistrantDialog eventId={eventId} onSaved={refreshAll} />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="secondary" />}
          >
            More <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {messaging && (
              <DropdownMenuItem
                disabled={Boolean(orgEmailOff)}
                onClick={() => setComposer("announce")}
              >
                <span className="flex flex-col">
                  Message registrants
                  {orgEmailOff && (
                    <span className="app-muted text-xs">{orgEmailOff}</span>
                  )}
                </span>
              </DropdownMenuItem>
            )}
            {/* #1502. Only where there is something to ask. */}
            {messaging && missingCount > 0 && (
              <DropdownMenuItem
                disabled={Boolean(orgEmailOff)}
                onClick={() => setComposer("ask")}
              >
                Ask for missing answers ({missingCount})
              </DropdownMenuItem>
            )}
            {messaging && <DropdownMenuSeparator />}
            {/* A real link: it is a file download, and should behave as one.
                Gated on `events: manage` in the route handler too. */}
            {(questions.length > 0 || riderBreakdown) && (
              <DropdownMenuItem
                render={<a href={registrantAnswersCsvHref(eventId)} download />}
              >
                Download answers (CSV)
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              render={<Link href={registrationSettingsHref(eventId)} />}
            >
              Registration settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="w-fit">
            <h1 className="brand-display text-3xl font-semibold tracking-brand sm:text-4xl">
              Registrants
            </h1>
            <div className="rainbow-accent mt-3 w-full" />
          </div>
          <p className="app-muted mt-1 text-sm break-words">
            {eventName} · <ViewerTime iso={startsAt} fallbackZone={timezone} />{" "}
            · registration {registrationOpen ? "open" : "closed"}
          </p>
        </div>
        {actions}
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {data === undefined ? (
        <TabLoadingSkeleton />
      ) : (
        <>
          <section aria-labelledby="registrants-summary-heading">
            <h2 id="registrants-summary-heading" className="sr-only">
              Summary
            </h2>
            <dl className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <StatTile
                label="Registrations"
                value={list.length}
                hint={`${cancelled.length} cancelled`}
                className="hidden sm:flex"
              />
              <StatTile
                label="Attending"
                value={totalAttending}
                of={capacity !== null ? `of ${capacity}` : undefined}
                meter={
                  capacity !== null
                    ? { value: totalAttending, max: capacity }
                    : undefined
                }
              />
              <StatTile
                label="Checked in"
                value={checkedInPeople}
                of={`of ${totalAttending}`}
                meter={{ value: checkedInPeople, max: totalAttending }}
              />
              {/* "Said" stays in the label (#1259): this is what people said
                about themselves, never the check-in ledger's first-timer
                figure, and only that one may reach an impact report. */}
              {showAttendedBefore && (
                <StatTile
                  label="Said it's their first"
                  value={countSelfReportedFirstTimers(list)}
                  hint="Self-reported. Not the check-in count."
                  className="hidden sm:flex"
                />
              )}
              {derived.data && checkedIn.length > 0 && (
                <StatTile
                  label="First time, by check-in"
                  value={derived.data.firstTimeParticipants}
                  hint={`${derived.data.recurringParticipants} recurring`}
                  className="hidden sm:flex"
                />
              )}
            </dl>
          </section>

          {/* Who is coming on skis and who on a snowboard, and at what
              level -- per registration, since the rider answers are the
              registrant's own and nobody asked about the rest of a party. */}
          {riderBreakdown && (
            <section
              aria-labelledby="registrants-riders-heading"
              className="flex flex-col gap-2"
            >
              <div className="app-muted flex flex-wrap justify-between gap-2 text-xs">
                <h2 id="registrants-riders-heading" className="font-normal">
                  Riders · {riderBreakdown.disciplines.ski} skis,{" "}
                  {riderBreakdown.disciplines.snowboard} snowboard,{" "}
                  {riderBreakdown.disciplines.both} both
                </h2>
                <span>
                  {riderBreakdown.answered} of {list.length} registrations
                  answered
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <RiderLevels label="Skis" levels={riderBreakdown.ski} />
                <RiderLevels
                  label="Snowboard"
                  levels={riderBreakdown.snowboard}
                />
              </div>
            </section>
          )}

          {/* #1407. The figures tickets and gear are ordered from, and the
              quickest way to the parties behind one. */}
          {registrationOptions && registrationOptions.options.length > 0 && (
            <section
              aria-labelledby="registration-options-heading"
              className="flex flex-col gap-2"
            >
              <div className="app-muted flex flex-wrap justify-between gap-2 text-xs">
                <h2 id="registration-options-heading" className="font-normal">
                  {registrationOptions.prompt} · select one to filter
                </h2>
                <span>
                  {choseAnyOption} of {list.length} chose an option
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-2">
                {registrationOptions.options.map((option) => {
                  const pressed = view.option === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() =>
                        setView({ option: pressed ? null : option.id })
                      }
                      className={cn(
                        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        pressed && "border-primary ring-1 ring-primary",
                      )}
                    >
                      <span className="break-words">{option.label}</span>
                      <span className="font-semibold tabular-nums">
                        {option.taken}
                        <span className="app-muted ml-1 text-xs font-medium">
                          {option.cap === null ? "no cap" : `of ${option.cap}`}
                        </span>
                      </span>
                      {option.cap !== null && (
                        <span className="col-span-2">
                          <Meter value={option.taken} max={option.cap} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {list.length === 0 ? (
            <EmptyState
              title="No one has registered yet"
              description="Registrations arrive from the public event page. Walk-ins can be added with + Check in walk-in above."
            />
          ) : (
            <section aria-label="Registrants" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-[1_1_16rem]">
                  <Search className="app-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                  <Input
                    type="search"
                    aria-label="Search registrants"
                    placeholder="Search name, email, or phone"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setView({ q: event.target.value });
                    }}
                    className="pl-8"
                  />
                </div>
                {activeOption && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label={`Clear option filter: ${activeOption.label}`}
                    onClick={() => setView({ option: null })}
                    className="max-w-full"
                  >
                    <span className="truncate">{activeOption.label}</span>
                    <X />
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant={view.checkedIn ? "secondary" : "outline"}
                        size="sm"
                      />
                    }
                  >
                    {view.checkedIn === "in"
                      ? "Checked in"
                      : view.checkedIn === "out"
                        ? "Not checked in"
                        : "Check-in: any"}
                    <ChevronDown />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup
                      value={view.checkedIn ?? "any"}
                      onValueChange={(value) =>
                        setView({
                          checkedIn:
                            value === "in" || value === "out" ? value : null,
                        })
                      }
                    >
                      <DropdownMenuRadioItem value="any">
                        Any
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="in">
                        Checked in
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="out">
                        Not checked in
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* #1501/#1502. Only offered where some question is
                    required. */}
                {asksRequired && (
                  <Button
                    type="button"
                    variant={view.missing ? "secondary" : "outline"}
                    size="sm"
                    aria-pressed={view.missing}
                    onClick={() => setView({ missing: !view.missing })}
                  >
                    Missing required answers ({missingCount})
                  </Button>
                )}
                {groupChat && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant={view.groupChat ? "secondary" : "outline"}
                          size="sm"
                          className="max-w-full"
                        />
                      }
                    >
                      <span className="truncate">
                        {view.groupChat === "added"
                          ? `${groupChat.label}: added`
                          : view.groupChat === "not-added"
                            ? `${groupChat.label}: not added`
                            : groupChat.label}
                      </span>
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuRadioGroup
                        value={view.groupChat ?? "any"}
                        onValueChange={(value) =>
                          setView({
                            groupChat:
                              value === "added" || value === "not-added"
                                ? value
                                : null,
                          })
                        }
                      >
                        <DropdownMenuRadioItem value="any">
                          Any
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="added">
                          Added
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="not-added">
                          Not added ({notInChatCount})
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant={
                          view.flags.length > 0 ? "secondary" : "outline"
                        }
                        size="sm"
                      />
                    }
                  >
                    Flags
                    {view.flags.length > 0 ? ` (${view.flags.length})` : ""}
                    <ChevronDown />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Show parties that</DropdownMenuLabel>
                      {(Object.keys(FLAG_LABELS) as RegistrantFlag[]).map(
                        (flag) => (
                          <DropdownMenuCheckboxItem
                            key={flag}
                            checked={view.flags.includes(flag)}
                            onCheckedChange={(checked) =>
                              setView({
                                flags: checked
                                  ? [...view.flags, flag]
                                  : view.flags.filter((f) => f !== flag),
                              })
                            }
                          >
                            {FLAG_LABELS[flag]}
                          </DropdownMenuCheckboxItem>
                        ),
                      )}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                {answerFilters.map(({ question, choices }) => {
                  const label = answerColumnLabel(question);
                  const active = choices.find(
                    (choice) => choice.value === view.answers[question.id],
                  );
                  return (
                    <DropdownMenu key={question.id}>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant={active ? "secondary" : "outline"}
                            size="sm"
                            title={question.prompt}
                            className="max-w-full"
                          />
                        }
                      >
                        <span className="truncate">
                          {active ? `${label}: ${active.label}` : label}
                        </span>
                        <ChevronDown />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="max-w-80">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>
                            {question.prompt}
                          </DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={active?.value ?? "any"}
                            onValueChange={(value) => {
                              const rest = Object.fromEntries(
                                Object.entries(view.answers).filter(
                                  ([id]) => id !== question.id,
                                ),
                              );
                              setView({
                                answers:
                                  value === "any"
                                    ? rest
                                    : { ...rest, [question.id]: value },
                              });
                            }}
                          >
                            <DropdownMenuRadioItem value="any">
                              Any
                            </DropdownMenuRadioItem>
                            {choices.map((choice) => (
                              <DropdownMenuRadioItem
                                key={choice.value}
                                value={choice.value}
                              >
                                {choice.label}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })}
                {allAnswerColumns.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button type="button" variant="ghost" size="sm" />
                      }
                    >
                      Columns
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-w-80">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Answer columns</DropdownMenuLabel>
                        {allAnswerColumns.map(({ question }) => (
                          <DropdownMenuCheckboxItem
                            key={question.id}
                            checked={shownColumnIds.has(question.id)}
                            onCheckedChange={(checked) =>
                              setView({
                                // In the event's order, whatever order they
                                // were ticked in.
                                columns: allAnswerColumns
                                  .map((column) => column.question.id)
                                  .filter((id) =>
                                    id === question.id
                                      ? checked
                                      : shownColumnIds.has(id),
                                  ),
                              })
                            }
                          >
                            <span className="truncate" title={question.prompt}>
                              {answerColumnLabel(question)}
                            </span>
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <p
                  role="status"
                  className="app-muted ml-auto text-xs whitespace-nowrap"
                >
                  {isFiltered(view)
                    ? `Showing ${rows.length} of ${list.length}`
                    : `${list.length} registrations`}
                </p>
              </div>

              {canManage && groupChat && rows.length > 0 && (
                <GroupChatBulkBar
                  groupChat={groupChat}
                  shownCount={rows.length}
                  selectedCount={shownSelectedIds.length}
                  pending={groupChatPending}
                  onSelectAll={() =>
                    setSelectedIds(new Set(rows.map((row) => row.id)))
                  }
                  onClear={() => setSelectedIds(new Set())}
                  onMark={(added) =>
                    setGroupChat(shownSelectedIds, added, () =>
                      setSelectedIds(new Set()),
                    )
                  }
                />
              )}

              <PortalDataTable
                columns={columns}
                rows={rows}
                getRowKey={(registrant) => registrant.id}
                emptyMessage="No registrants match. Clear or loosen the filters to see more."
                sort={view.sort ?? { key: "created_at", dir: "asc" }}
                onSortChange={(sort) => setView({ sort })}
                page={view.page}
                onPageChange={(page) => setView({ page })}
                pageSize={view.perPage}
                onPageSizeChange={(perPage) => setView({ perPage })}
                onRowClick={openDetail}
                // The row opens the whole registration, so the columns a
                // phone drops are one tap away there.
                rowDetail="none"
              />
            </section>
          )}

          <CancelledRegistrations
            cancelled={cancelled}
            canRestore={canManage}
            onRestore={restore}
            isRowPending={isRowPending}
            groupChat={groupChat}
            onGroupChatChanged={refreshRegistrants}
          />

          <RegistrantAnnouncementsSection data={data} />
        </>
      )}

      <RegistrantOverlays
        data={data}
        eventName={eventName}
        detailId={detailId}
        // The sheet takes its own parameter back out of the URL on close.
        onDetailClosed={() => {}}
        cancelTarget={cancelTarget}
        onCancelClosed={() => setCancelTarget(null)}
        riderTarget={riderTarget}
        onRiderClosed={() => setRiderTarget(null)}
        onChanged={refreshAll}
        onRegistrantsChanged={refreshRegistrants}
      />

      {composer === "announce" && messaging && (
        <AnnounceToRegistrantsDialog
          eventId={eventId}
          eventName={eventName}
          registrations={list}
          replyTo={messaging.replyTo}
          onSent={refreshAll}
          open
          withTrigger={false}
          onOpenChange={(open) => {
            if (!open) setComposer(null);
          }}
        />
      )}
      {composer === "ask" && (
        <AskForMissingAnswersDialog
          eventId={eventId}
          eventName={eventName}
          registrations={list}
          questions={questions}
          onSent={refreshAll}
          open
          withTrigger={false}
          onOpenChange={(open) => {
            if (!open) setComposer(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * #1648. Ticking rows, and marking the ticked ones in or out of the event's
 * group chat. Above the table rather than in its header, which takes text.
 */
function GroupChatBulkBar({
  groupChat,
  shownCount,
  selectedCount,
  pending,
  onSelectAll,
  onClear,
  onMark,
}: {
  groupChat: NonNullable<EventGroupChat>;
  shownCount: number;
  selectedCount: number;
  pending: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onMark: (added: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      {selectedCount === 0 ? (
        <>
          <span className="app-muted">
            {groupChat.label}: tick registrants to mark them added, or not.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onSelectAll}>
            Select all {shownCount} shown
          </Button>
        </>
      ) : (
        <>
          <span className="font-medium" role="status">
            {selectedCount} selected
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => onMark(true)}
          >
            <MessageCircle /> Mark added to {groupChat.label}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onMark(false)}
          >
            <MessageCircleOff /> Mark not added
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear selection
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * The row's less frequent actions (#1511): undo a check-in, the rider
 * profile, the group chat (#1648), cancel. Check-in itself is the labelled
 * button beside it.
 */
function RowMenu({
  registrant,
  pending,
  onUndoCheckIn,
  onRider,
  onCancel,
  groupChat,
  groupChatPending,
  onToggleGroupChat,
}: {
  registrant: EventRegistrant;
  pending: boolean;
  onUndoCheckIn: () => void;
  onRider: () => void;
  onCancel: () => void;
  groupChat: EventGroupChat;
  groupChatPending: boolean;
  onToggleGroupChat: () => void;
}) {
  const checkedIn = registrant.checked_in_at !== null;
  // The profile hangs off the person record, so a registration never linked
  // to one has nowhere to put it.
  const canRider = registrant.rider !== null && registrant.person_id !== null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`More actions for ${registrant.name}`}
            disabled={pending}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {checkedIn && (
          <DropdownMenuItem onClick={onUndoCheckIn}>
            <Undo2 /> Undo check-in
          </DropdownMenuItem>
        )}
        {canRider && (
          <DropdownMenuItem onClick={onRider}>
            <Snowflake /> Rider profile
          </DropdownMenuItem>
        )}
        {groupChat && (
          <DropdownMenuItem
            disabled={groupChatPending}
            onClick={onToggleGroupChat}
          >
            {registrant.group_chat_added_at ? (
              <>
                <MessageCircleOff /> Mark not in {groupChat.label}
              </>
            ) : (
              <>
                <MessageCircle /> Mark added to {groupChat.label}
              </>
            )}
          </DropdownMenuItem>
        )}
        {/* #1418. Not once they are through the door: undo the check-in
            first, which the database insists on too. */}
        {!checkedIn && (
          <DropdownMenuItem variant="destructive" onClick={onCancel}>
            <Ban /> Cancel registration
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
