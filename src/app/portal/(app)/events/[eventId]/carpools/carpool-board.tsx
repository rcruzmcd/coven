"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Pencil, Search } from "lucide-react";
import type {
  EventRegistrant,
  EventRegistrantsData,
} from "../../registrants-actions";
import { EmailCarpoolAssignmentsDialog } from "./email-carpool-assignments-dialog";
import type { CarpoolAssignmentRecipient } from "@/lib/carpool-assignment";
import {
  deleteCarpoolCarAction,
  moveCarpoolPassengerAction,
  setCarpoolPassengerPaidAction,
} from "../../carpools-actions";
import {
  registrantInstagramColumns,
  registrationAnswerColumns,
} from "../../registrants-tab";
import {
  filterRegistrants,
  isFiltered,
  parseRegistrantsView,
  registrantsViewParams,
  type RegistrantsView,
} from "../../registrants-view-state";
import { REGISTRANT_PARAM } from "../../registrant-detail-sheet";
import {
  answerColumnLabel,
  answerColumns,
  answerFilterChoices,
  shownAnswerColumns,
} from "@/lib/registration-answer-columns";
import {
  answersChangedSince,
  carpoolAssignments,
  isOverCapacity,
  paidCount,
  seatsFromAnswer,
  seatsUsed,
  unpaidOnly,
  type CarpoolCar,
  type CarpoolPerson,
} from "@/lib/event-carpools";
import { formatInstantDate } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";
import { ViewerTime } from "@/components/viewer-time";
import { StatusBadge } from "@/components/portal/status-badge";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CarpoolCarDialog, type DriverChoice } from "./carpool-car-dialog";

/** `?paid=unpaid` shows only the passengers still to pay their driver. */
export const PAID_PARAM = "paid";

const UNASSIGNED = "__unassigned__";

function carpoolsCsvHref(eventId: string): string {
  return `/portal/events/${encodeURIComponent(eventId)}/carpools/export`;
}

function registrantHref(eventId: string, registrationId: string): string {
  return `/portal/events/${encodeURIComponent(eventId)}/registrants?${REGISTRANT_PARAM}=${encodeURIComponent(registrationId)}`;
}

/**
 * The carpool board (#1649): a card per car with its driver, seats and
 * passengers, and the Unassigned table below with the event's answer columns
 * and their filters, so "Need a ride" registrants are easy to find.
 *
 * The data is read on the server and handed in; every change refreshes the
 * route. Writes are offered at `events: manage` and gated again in each
 * action and function behind it.
 */
export function CarpoolBoard({
  eventId,
  eventName,
  startsAt,
  timezone,
  canManage,
  data,
  assignmentRecipients = null,
  emailDisabledReason,
}: {
  eventId: string;
  eventName: string;
  startsAt: string;
  timezone: string;
  canManage: boolean;
  data: EventRegistrantsData;
  /**
   * Everyone in a car, for "Email carpool assignments" (#1651). Null without
   * `events: manage`, which offers no button.
   */
  assignmentRecipients?: readonly CarpoolAssignmentRecipient[] | null;
  /** Set when org email is switched off. */
  emailDisabledReason?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useMemo(
    () => parseRegistrantsView(searchParams),
    [searchParams],
  );
  const unpaidView = searchParams.get(PAID_PARAM) === "unpaid";

  const carpools = data.carpools;
  const cars = useMemo(() => carpools?.cars ?? [], [carpools]);
  const seatsQuestionId = carpools?.seatsQuestionId ?? null;
  const questions = data.registrationQuestions;
  const registrants = data.registrants;
  const assignments = useMemo(() => carpoolAssignments(cars), [cars]);
  const unassigned = useMemo(
    () => registrants.filter((row) => !assignments.has(row.id)),
    [registrants, assignments],
  );
  const rows = useMemo(
    () => filterRegistrants(unassigned, view, questions),
    [unassigned, view, questions],
  );
  const shownCars = unpaidView ? unpaidOnly(cars) : cars;

  const refresh = useCallback(() => router.refresh(), [router]);
  const [pending, startTransition] = useTransition();
  const run = useCallback(
    (action: () => Promise<object>, success: string) =>
      startTransition(async () => {
        await runAction(action, { success, onSuccess: refresh });
      }),
    [refresh],
  );

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
  const setUnpaidView = (on: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (on) params.set(PAID_PARAM, "unpaid");
    else params.delete(PAID_PARAM);
    writeParams(params);
  };

  const [query, setQuery] = useState(view.q);
  const [prevQ, setPrevQ] = useState(view.q);
  if (view.q !== prevQ) {
    setPrevQ(view.q);
    setQuery(view.q);
  }

  // Null closes the dialog, "new" adds a car, an id edits that one.
  const [editing, setEditing] = useState<string | null>(null);
  const editingCar = cars.find((car) => car.id === editing) ?? null;
  const driverChoices = useMemo<DriverChoice[]>(() => {
    const current = editingCar?.driver?.registrationId;
    return registrants
      .filter((row) => !assignments.has(row.id) || row.id === current)
      .map((row) => ({
        registrationId: row.id,
        name: row.name,
        seats: seatsFromAnswer(row.answers, seatsQuestionId),
      }));
  }, [registrants, assignments, editingCar, seatsQuestionId]);

  const allAnswerColumns = useMemo(() => answerColumns(questions), [questions]);
  const shownColumnIds = new Set(
    shownAnswerColumns(allAnswerColumns, view.columns).map(
      (column) => column.question.id,
    ),
  );
  const answerFilters = allAnswerColumns.flatMap(({ question }) => {
    const choices = answerFilterChoices(
      question,
      registrants.map((registrant) => registrant.answers),
    );
    return choices &&
      (shownColumnIds.has(question.id) || question.id in view.answers)
      ? [{ question, choices }]
      : [];
  });

  const totalSeats = cars.reduce((sum, car) => sum + car.seats, 0);
  const usedSeats = cars.reduce((sum, car) => sum + seatsUsed(car), 0);
  const unpaid = cars.reduce(
    (sum, car) => sum + car.passengers.filter((row) => !row.paidAt).length,
    0,
  );

  const columns = useMemo<PortalDataTableColumn<EventRegistrant>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (registrant) => registrant.name,
        cellClassName: "min-w-36 max-w-56 whitespace-normal",
        render: (registrant) => (
          <Link
            href={registrantHref(eventId, registrant.id)}
            className="font-medium break-words hover:underline"
          >
            {registrant.name}
          </Link>
        ),
      },
      {
        key: "party_size",
        label: "Party",
        sortValue: (registrant) => registrant.party_size,
        cellClassName: "tabular-nums",
        render: (registrant) => registrant.party_size,
      },
      ...registrantInstagramColumns(registrants, canManage),
      ...registrationAnswerColumns(questions, view.columns),
      ...(canManage && cars.length > 0
        ? [
            {
              key: "add_to_car",
              label: "Add to car",
              cellClassName: "min-w-40",
              render: (registrant: EventRegistrant) => (
                <CarSelect
                  label={`Add ${registrant.name} to a car`}
                  cars={cars}
                  value={null}
                  disabled={pending}
                  onChange={(carId) =>
                    carId &&
                    run(
                      () =>
                        moveCarpoolPassengerAction({
                          eventId,
                          registrationId: registrant.id,
                          toCarId: carId,
                        }),
                      `${registrant.name} added to ${cars.find((car) => car.id === carId)?.label ?? "the car"}.`,
                    )
                  }
                />
              ),
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
    ],
    [
      eventId,
      registrants,
      canManage,
      questions,
      view.columns,
      cars,
      pending,
      run,
    ],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="w-fit">
            <h1 className="brand-display text-3xl font-semibold tracking-brand sm:text-4xl">
              Carpools
            </h1>
            <div className="rainbow-accent mt-3 w-full" />
          </div>
          <p className="app-muted mt-1 text-sm break-words">
            {eventName} · <ViewerTime iso={startsAt} fallbackZone={timezone} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Button type="button" onClick={() => setEditing("new")}>
              + Add car
            </Button>
          )}
          {canManage && (
            <Button
              variant="secondary"
              nativeButton={false}
              render={<a href={carpoolsCsvHref(eventId)} download />}
            >
              Download carpools (CSV)
            </Button>
          )}
          {canManage && assignmentRecipients && cars.length > 0 && (
            <EmailCarpoolAssignmentsDialog
              eventId={eventId}
              recipients={assignmentRecipients}
              disabledReason={emailDisabledReason}
            />
          )}
        </div>
      </div>

      <p role="status" className="app-muted text-sm">
        {cars.length} {cars.length === 1 ? "car" : "cars"} · {usedSeats} of{" "}
        {totalSeats} seats taken · {unassigned.length} unassigned · {unpaid}{" "}
        unpaid
      </p>

      <section aria-labelledby="carpool-cars-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="carpool-cars-heading" className="text-lg font-semibold">
            Cars
          </h2>
          {cars.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant={unpaidView ? "secondary" : "outline"}
              aria-pressed={unpaidView}
              onClick={() => setUnpaidView(!unpaidView)}
            >
              Unpaid ({unpaid})
            </Button>
          )}
        </div>
        {cars.length === 0 ? (
          <EmptyState
            title="No cars yet"
            description={
              canManage
                ? "Add a car for each driver, then put registrants in it from the Unassigned list below."
                : "Staff who organize this event add the cars here."
            }
          />
        ) : shownCars.length === 0 ? (
          <p className="app-muted text-sm">Every passenger has paid.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shownCars.map((car) => (
              <CarCard
                key={car.id}
                eventId={eventId}
                // The whole car, so the counts are right while filtered.
                car={cars.find((row) => row.id === car.id) ?? car}
                shownPassengers={car.passengers}
                cars={cars}
                canManage={canManage}
                pending={pending}
                run={run}
                onEdit={() => setEditing(car.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section
        aria-labelledby="carpool-unassigned-heading"
        className="space-y-3"
      >
        <h2 id="carpool-unassigned-heading" className="text-lg font-semibold">
          Unassigned
        </h2>
        {unassigned.length === 0 ? (
          <p className="app-muted text-sm">
            {registrants.length === 0
              ? "No one has registered yet."
              : "Every registrant is in a car."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-[1_1_16rem]">
                <Search className="app-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  type="search"
                  aria-label="Search unassigned registrants"
                  placeholder="Search name, email, or phone"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setView({ q: event.target.value });
                  }}
                  className="pl-8"
                />
              </div>
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
                        <DropdownMenuLabel>{question.prompt}</DropdownMenuLabel>
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
              <p
                role="status"
                className="app-muted ml-auto text-xs whitespace-nowrap"
              >
                {isFiltered(view)
                  ? `Showing ${rows.length} of ${unassigned.length}`
                  : `${unassigned.length} unassigned`}
              </p>
            </div>
            <PortalDataTable
              columns={columns}
              rows={rows}
              getRowKey={(registrant) => registrant.id}
              emptyMessage="No unassigned registrants match. Clear or loosen the filters to see more."
              sort={view.sort ?? { key: "name", dir: "asc" }}
              onSortChange={(sort) => setView({ sort })}
              page={view.page}
              onPageChange={(page) => setView({ page })}
              pageSize={view.perPage}
              onPageSizeChange={(perPage) => setView({ perPage })}
            />
          </>
        )}
      </section>

      {editing !== null && (
        <CarpoolCarDialog
          // A fresh form per car.
          key={editing}
          eventId={eventId}
          car={editingCar}
          nextLabel={`Car ${cars.length + 1}`}
          driverChoices={driverChoices}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function AnswersChanged({ at }: { at: string | null }) {
  return at ? (
    <StatusBadge tone="warning" className="font-normal">
      Answers changed {formatInstantDate(at)}
    </StatusBadge>
  ) : null;
}

function PersonLine({ person }: { person: CarpoolPerson }) {
  return (
    <>
      <span className="font-medium break-words">{person.name}</span>
      {person.partySize > 1 && (
        <span className="app-muted text-xs">
          {" "}
          · party of {person.partySize}
        </span>
      )}
    </>
  );
}

function CarCard({
  eventId,
  car,
  shownPassengers,
  cars,
  canManage,
  pending,
  run,
  onEdit,
}: {
  eventId: string;
  car: CarpoolCar;
  shownPassengers: CarpoolCar["passengers"];
  cars: readonly CarpoolCar[];
  canManage: boolean;
  pending: boolean;
  run: (action: () => Promise<object>, success: string) => void;
  onEdit: () => void;
}) {
  const used = seatsUsed(car);
  const over = isOverCapacity(car);
  const { paid, total } = paidCount(car);
  const driverChanged =
    car.driver &&
    answersChangedSince(car.driver.answersChangedAt, car.driver.assignedAt);

  return (
    <Card role="group" aria-label={car.label}>
      <CardHeader>
        <CardTitle className="break-words">{car.label}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          {car.driver ? (
            <span>
              Driver: <PersonLine person={car.driver} />
            </span>
          ) : (
            <StatusBadge tone="danger">No driver</StatusBadge>
          )}
          {driverChanged && (
            <AnswersChanged at={car.driver?.answersChangedAt ?? null} />
          )}
        </CardDescription>
        {canManage && (
          <CardAction className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${car.label}`}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <ConfirmDeleteButton
              label={`Delete ${car.label}`}
              title={`Delete ${car.label}?`}
              description="Its passengers go back to Unassigned."
              pending={pending}
              onConfirm={() =>
                run(
                  () => deleteCarpoolCarAction({ eventId, carId: car.id }),
                  `${car.label} deleted.`,
                )
              }
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge tone={over ? "warning" : "neutral"}>
            {used} of {car.seats} seats
            {over ? " · over capacity" : ""}
          </StatusBadge>
          {total > 0 && (
            <StatusBadge tone={paid === total ? "success" : "neutral"}>
              {paid} of {total} paid
            </StatusBadge>
          )}
        </div>
        {(car.leavingFrom || car.notes) && (
          <dl className="grid gap-1 text-xs">
            {car.leavingFrom && (
              <div>
                <dt className="app-muted inline">Leaving from: </dt>
                <dd className="inline break-words">{car.leavingFrom}</dd>
              </div>
            )}
            {car.notes && (
              <div>
                <dt className="app-muted inline">Notes: </dt>
                <dd className="inline break-words whitespace-pre-line">
                  {car.notes}
                </dd>
              </div>
            )}
          </dl>
        )}
        {shownPassengers.length === 0 ? (
          <p className="app-muted">No passengers yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {shownPassengers.map((passenger) => (
              <li
                key={passenger.registrationId}
                className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0">
                    <PersonLine person={passenger} />
                  </span>
                  {answersChangedSince(
                    passenger.answersChangedAt,
                    passenger.addedAt,
                  ) && <AnswersChanged at={passenger.answersChangedAt} />}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className="flex items-center gap-1.5"
                    title={
                      passenger.paidAt
                        ? `Marked ${formatInstantDate(passenger.paidAt)}${passenger.paidByName ? ` by ${passenger.paidByName}` : ""}`
                        : undefined
                    }
                  >
                    <Checkbox
                      checked={passenger.paidAt !== null}
                      disabled={!canManage || pending}
                      onCheckedChange={(checked) =>
                        run(
                          () =>
                            setCarpoolPassengerPaidAction({
                              eventId,
                              carId: car.id,
                              registrationId: passenger.registrationId,
                              paid: Boolean(checked),
                            }),
                          checked
                            ? `${passenger.name} marked paid.`
                            : `${passenger.name} marked unpaid.`,
                        )
                      }
                    />
                    Paid driver
                    {passenger.paidAt && (
                      <span className="app-muted text-xs">
                        {formatInstantDate(passenger.paidAt)}
                        {passenger.paidByName
                          ? ` · ${passenger.paidByName}`
                          : ""}
                      </span>
                    )}
                  </label>
                  {canManage && (
                    <CarSelect
                      label={`Move ${passenger.name}`}
                      cars={cars.filter((row) => row.id !== car.id)}
                      value={null}
                      placeholder="Move to…"
                      withUnassigned
                      disabled={pending}
                      onChange={(toCarId) =>
                        run(
                          () =>
                            moveCarpoolPassengerAction({
                              eventId,
                              registrationId: passenger.registrationId,
                              toCarId,
                            }),
                          toCarId
                            ? `${passenger.name} moved to ${cars.find((row) => row.id === toCarId)?.label ?? "another car"}.`
                            : `${passenger.name} is unassigned.`,
                        )
                      }
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Pick a car; with `withUnassigned`, "Unassigned" too (as null). */
function CarSelect({
  label,
  cars,
  value,
  placeholder = "Choose a car",
  withUnassigned = false,
  disabled,
  onChange,
}: {
  label: string;
  cars: readonly CarpoolCar[];
  value: string | null;
  placeholder?: string;
  withUnassigned?: boolean;
  disabled?: boolean;
  onChange: (carId: string | null) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) =>
        next !== null && onChange(next === UNASSIGNED ? null : String(next))
      }
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="min-w-36" aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {cars.map((car) => (
          <SelectItem key={car.id} value={car.id}>
            {car.label} ({seatsUsed(car)}/{car.seats})
          </SelectItem>
        ))}
        {withUnassigned && (
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
