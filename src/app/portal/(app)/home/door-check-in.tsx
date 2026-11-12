"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, MoreHorizontal, RotateCcw, Search, X } from "lucide-react";
import {
  checkInRegistrantAction,
  undoCheckInAction,
  type EventRegistrant,
  type EventRegistrantsData,
} from "../events/registrants-actions";
import { AddRegistrantDialog } from "../events/add-registrant-dialog";
import { CheckInWalkInDialog } from "../events/check-in-walkin-dialog";
import { AnnounceToRegistrantsDialog } from "../events/announce-to-registrants-dialog";
import { AskForMissingAnswersDialog } from "../events/ask-for-missing-answers-dialog";
import { RegistrantBadges } from "../events/registrant-badges";
import { RegistrantOverlays } from "../events/registrants-shared";
import { useRegistrantRowActions } from "../events/use-registrant-row-actions";
import { isMissingRequired } from "../events/registrants-view-state";
import {
  registrantAnswersCsvHref,
  registrantsPageHref,
} from "../events/registrants-tab";
import {
  cancelledMatches,
  doorCounts,
  doorRows,
  type DoorTab,
} from "./door-list";
import type { RegistrationQuestion } from "@/lib/registration-questions";
import type { TabData } from "@/hooks/use-tab-data";
import { runAction } from "@/components/portal/action-toast";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { EmptyState } from "@/components/portal/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SheetClose,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NO_QUESTIONS: RegistrationQuestion[] = [];

const TABS: { value: DoorTab; label: string }[] = [
  { value: "out", label: "Not here" },
  { value: "in", label: "In" },
  { value: "all", label: "All" },
];

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A short buzz on a check-in, where the phone has one. */
function buzz() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(30);
  }
}

/**
 * The Happening Now check-in sheet on a phone (#1558): find the person,
 * confirm it is them, check them in -- and everything else out of the way.
 *
 * The desktop sheet renders the whole Registrants card, which at 390px left
 * room for a row and a half under its summary and toolbar. This keeps the
 * header, the search and the tabs fixed above a list of rows that each carry
 * one large button, and moves the rest -- the row's profile answers and cancel,
 * the card's composers and export -- into the details view and a menu.
 *
 * A check-in paints at once rather than when the server answers, so nobody
 * taps twice, and the receipt carries an Undo.
 */
export function DoorCheckIn({
  eventId,
  eventName,
  capacity,
  registrants: registrantsData,
  onChanged,
}: {
  eventId: string;
  eventName: string;
  capacity: number | null;
  registrants: TabData<EventRegistrantsData>;
  /** After a write: refetch the list and anything else that counts it. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const { data, loadError } = registrantsData;
  const refreshRegistrants = registrantsData.refresh;
  const messaging = data?.messaging ?? null;
  // Populated only for `events: manage`; see RegistrantsTab.
  const canManage = messaging !== null;
  const questions = data?.registrationQuestions ?? NO_QUESTIONS;
  const asksRequired = questions.some((question) => question.required);

  const refreshAll = useCallback(() => {
    onChanged();
    router.refresh();
  }, [onChanged, router]);
  const { restore, isRowPending: isRestorePending } =
    useRegistrantRowActions(refreshAll);

  const [tab, setTab] = useState<DoorTab>("out");
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EventRegistrant | null>(
    null,
  );
  const [dialog, setDialog] = useState<
    | { kind: "walk-in"; name?: string }
    | { kind: "add" | "announce" | "ask" }
    | null
  >(null);

  // Check-ins the server has not confirmed yet, by registration: the new
  // `checked_in_at`, or null for an undo. Each is dropped once the list that
  // comes back agrees with it, so a later change made elsewhere is not
  // papered over by a stale one.
  const [optimistic, setOptimistic] = useState<Record<string, string | null>>(
    {},
  );
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [, startTransition] = useTransition();
  const [prevData, setPrevData] = useState(data);
  if (data !== prevData) {
    setPrevData(data);
    const server = new Map(
      (data?.registrants ?? []).map((row) => [row.id, row.checked_in_at]),
    );
    const kept = Object.entries(optimistic).filter(
      ([id, at]) =>
        server.has(id) && (server.get(id) === null) !== (at === null),
    );
    if (kept.length !== Object.keys(optimistic).length) {
      setOptimistic(Object.fromEntries(kept));
    }
  }

  const list = useMemo(
    () =>
      (data?.registrants ?? []).map((row) =>
        row.id in optimistic
          ? { ...row, checked_in_at: optimistic[row.id] }
          : row,
      ),
    [data, optimistic],
  );
  // The details view reads the same rows, so its button agrees with the list.
  const shownData = useMemo(
    () => (data ? { ...data, registrants: list } : undefined),
    [data, list],
  );

  const setRowPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (registrant: EventRegistrant, undo: boolean) => {
      const id = registrant.id;
      // A function of its own so the receipt's Undo can run it again.
      function run(undoing: boolean) {
        setOptimistic((current) => ({
          ...current,
          [id]: undoing ? null : new Date().toISOString(),
        }));
        setRowPending(id, true);
        if (!undoing) buzz();
        startTransition(async () => {
          const outcome = await runAction(
            () =>
              undoing ? undoCheckInAction(id) : checkInRegistrantAction(id),
            {
              success: undoing
                ? `Undid ${registrant.name}'s check-in.`
                : `${registrant.name} checked in.`,
              action: undoing
                ? undefined
                : { label: "Undo", onClick: () => run(true) },
              onSuccess: refreshAll,
            },
          );
          // A refusal puts the row back as it was (#1124): a check-in that
          // did not happen must not look as if it had.
          if (!outcome.ok) {
            setOptimistic((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
          }
          setRowPending(id, false);
        });
      }
      run(undo);
    },
    [refreshAll, setRowPending],
  );

  const counts = doorCounts(list);
  const missingCount = asksRequired
    ? list.filter((row) => isMissingRequired(row, questions)).length
    : 0;
  const filtered =
    asksRequired && missingOnly
      ? list.filter((row) => isMissingRequired(row, questions))
      : list;
  const rows = doorRows(filtered, tab, query);
  const searching = query.trim() !== "";
  const cancelled = cancelledMatches(data?.cancelled ?? [], query);
  // #1746. The answers export carries the profile answers too.
  const hasProfileQuestions = (data?.profileQuestions?.length ?? 0) > 0;
  const orgEmailOff =
    messaging && !messaging.orgEmailEnabled
      ? "Outbound email is switched off for this organization."
      : undefined;

  const progress =
    counts.all > 0 ? Math.round((counts.in / counts.all) * 100) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b px-4 pt-3 pb-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p aria-hidden className="app-eyebrow">
              Check in
            </p>
            <SheetTitle className="line-clamp-2 text-lg font-semibold break-words">
              <span className="sr-only">Check in · </span>
              {eventName}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Find each party as they arrive and check them in.
            </SheetDescription>
          </div>
          <SheetClose
            render={
              <Button
                type="button"
                variant="ghost"
                className="size-11 shrink-0"
                aria-label="Close"
              />
            }
          >
            <X />
          </SheetClose>
        </div>

        {data && (
          <div className="flex flex-col gap-1.5">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-semibold tabular-nums">
                {counts.in} / {counts.all} parties in
              </span>
              <span className="app-muted text-xs tabular-nums">
                {counts.peopleIn} of {counts.people} people
                {capacity !== null && ` · cap ${capacity}`}
              </span>
            </p>
            <div
              aria-hidden
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="app-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            aria-label="Search registrants"
            placeholder="Search name, email, or phone"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 pl-9 text-base"
          />
        </div>

        {/* A filter on one list rather than tabs in the navigation sense:
            nothing here is a view anybody would link to, so it is a group of
            pressed buttons and its state lives only as long as the sheet. */}
        <div
          role="group"
          aria-label="Show"
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        >
          {TABS.map((option) => {
            const pressed = !searching && tab === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={pressed}
                onClick={() => {
                  setTab(option.value);
                  setQuery("");
                }}
                className={cn(
                  "min-h-11 rounded-md px-2 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  pressed
                    ? "bg-background shadow-sm"
                    : "app-muted hover:text-foreground",
                )}
              >
                {option.label}{" "}
                <span className="tabular-nums">{counts[option.value]}</span>
              </button>
            );
          })}
        </div>
        {searching && (
          <p role="status" className="app-muted -mt-1 text-xs">
            Searching every registration
          </p>
        )}
        {asksRequired && missingOnly && (
          <Button
            type="button"
            variant="secondary"
            className="h-11 self-start"
            onClick={() => setMissingOnly(false)}
          >
            Missing required answers only <X />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError && (
          <Alert variant="destructive" className="m-4 w-auto">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {data === undefined ? (
          <div className="p-4">
            <TabLoadingSkeleton />
          </div>
        ) : list.length === 0 && !searching ? (
          <div className="p-4">
            <EmptyState
              title="No one has registered yet"
              description="Registrations arrive from the public event page. Check in a walk-in below."
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col gap-3 p-4">
            {searching ? (
              <>
                <p className="text-sm break-words">
                  No one registered matches &ldquo;{query.trim()}&rdquo;
                </p>
                <Button
                  type="button"
                  className="h-auto min-h-12 w-full text-base whitespace-normal"
                  onClick={() =>
                    setDialog({ kind: "walk-in", name: query.trim() })
                  }
                >
                  Check in &ldquo;{query.trim()}&rdquo; as a walk-in
                </Button>
              </>
            ) : (
              <p className="app-muted text-sm">
                {tab === "in"
                  ? "No one is checked in yet."
                  : "Everyone is checked in."}
              </p>
            )}
          </div>
        ) : (
          <ul aria-label="Registrants" className="divide-y">
            {rows.map((registrant) => {
              const checkedIn = registrant.checked_in_at !== null;
              return (
                <li key={registrant.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailId(registrant.id)}
                    aria-label={`Details for ${registrant.name}`}
                    className="flex min-h-16 min-w-0 flex-1 flex-col items-start gap-0.5 py-3 pl-4 text-left focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="text-base font-semibold break-words">
                      {registrant.name}
                    </span>
                    <span className="app-muted text-sm break-words">
                      Party of {registrant.party_size}
                      {registrant.pronouns && ` · ${registrant.pronouns}`}
                      {registrant.checked_in_at &&
                        ` · In at ${timeOfDay(registrant.checked_in_at)}`}
                    </span>
                    <span className="flex flex-wrap gap-1 empty:hidden">
                      <RegistrantBadges registrant={registrant} />
                    </span>
                  </button>
                  <div className="py-3 pr-4">
                    <Button
                      type="button"
                      variant={checkedIn ? "default" : "outline"}
                      aria-pressed={checkedIn}
                      aria-label={`Check in ${registrant.name}`}
                      disabled={pendingIds.has(registrant.id)}
                      focusableWhenDisabled
                      onClick={() => toggle(registrant, checkedIn)}
                      className="h-12 min-w-20 text-base"
                    >
                      <Check /> In
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {cancelled.length > 0 && (
          <section
            aria-labelledby="door-cancelled-heading"
            className="flex flex-col gap-2 border-t p-4"
          >
            <h3
              id="door-cancelled-heading"
              className="app-muted text-sm font-semibold"
            >
              Cancelled
            </h3>
            <ul className="flex flex-col gap-2">
              {cancelled.map((registrant) => (
                <li
                  key={registrant.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 text-sm break-words">
                    {registrant.name}
                    <span className="app-muted block text-xs">
                      Party of {registrant.party_size}
                    </span>
                  </span>
                  {canManage && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      aria-label={`Restore registration for ${registrant.name}`}
                      disabled={isRestorePending(registrant)}
                      focusableWhenDisabled
                      onClick={() => restore(registrant)}
                    >
                      <RotateCcw /> Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="flex gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          className="h-12 flex-1 text-base"
          onClick={() => setDialog({ kind: "walk-in" })}
        >
          + Check in walk-in
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="secondary"
                className="size-12"
                aria-label="More actions"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-64">
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => setDialog({ kind: "add" })}
            >
              + Add registrant
            </DropdownMenuItem>
            {asksRequired && (
              <DropdownMenuCheckboxItem
                className="min-h-11"
                checked={missingOnly}
                onCheckedChange={setMissingOnly}
              >
                Missing required answers ({missingCount})
              </DropdownMenuCheckboxItem>
            )}
            {messaging && missingCount > 0 && (
              <DropdownMenuItem
                className="min-h-11"
                disabled={Boolean(orgEmailOff)}
                onClick={() => setDialog({ kind: "ask" })}
              >
                Ask for missing answers
              </DropdownMenuItem>
            )}
            {messaging && (
              <DropdownMenuItem
                className="min-h-11"
                disabled={Boolean(orgEmailOff)}
                onClick={() => setDialog({ kind: "announce" })}
              >
                Announce
              </DropdownMenuItem>
            )}
            {canManage && (questions.length > 0 || hasProfileQuestions) && (
              <DropdownMenuItem
                className="min-h-11"
                render={<a href={registrantAnswersCsvHref(eventId)} download />}
              >
                Download answers (CSV)
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11"
              render={<Link href={registrantsPageHref(eventId)} />}
            >
              All registrants
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <RegistrantOverlays
        data={shownData}
        eventName={eventName}
        detailId={detailId}
        onDetailClosed={() => setDetailId(null)}
        cancelTarget={cancelTarget}
        onCancelClosed={() => setCancelTarget(null)}
        onChanged={refreshAll}
        onRegistrantsChanged={refreshRegistrants}
        detailDoor={(registrant) => ({
          pending: pendingIds.has(registrant.id),
          onToggleCheckIn: () =>
            toggle(registrant, registrant.checked_in_at !== null),
          // #1418. Not once they are through the door.
          onCancel:
            canManage && registrant.checked_in_at === null
              ? () => setCancelTarget(registrant)
              : undefined,
        })}
      />

      {dialog?.kind === "walk-in" && (
        <CheckInWalkInDialog
          eventId={eventId}
          initialName={dialog.name}
          open
          withTrigger={false}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onSaved={refreshAll}
        />
      )}
      {dialog?.kind === "add" && (
        <AddRegistrantDialog
          eventId={eventId}
          open
          withTrigger={false}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onSaved={refreshAll}
        />
      )}
      {dialog?.kind === "announce" && messaging && (
        <AnnounceToRegistrantsDialog
          eventId={eventId}
          eventName={eventName}
          registrations={list}
          replyTo={messaging.replyTo}
          onSent={refreshAll}
          open
          withTrigger={false}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "ask" && (
        <AskForMissingAnswersDialog
          eventId={eventId}
          eventName={eventName}
          registrations={list}
          questions={questions}
          onSent={refreshAll}
          open
          withTrigger={false}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      )}
    </div>
  );
}
