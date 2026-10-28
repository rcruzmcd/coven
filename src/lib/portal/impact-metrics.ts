// Single home for every impact figure's definition.
//
// Both the Results card's Outcomes section (get_event_impact_derived_data) and
// the Program Impact Report (get_program_impact_rollup_data) call these same functions over
// the same row shapes, so the two surfaces cannot drift apart. Two RPCs, one set
// of definitions — if you change a rule here, both move together.

import {
  placeReach,
  type PlaceCountRow,
  type PlaceReach,
} from "@/lib/places/place-breakdown";

export type DistributedMovementRow = {
  quantity: number | string;
  event_id: string | null;
  /** Who received it, when the movement recorded one. */
  recipient_person_id?: string | null;
  inventory_item_id?: string | null;
  face_value?: number | string | null;
};
export type VolunteerHoursRow = {
  event_id: string | null;
  hours: number | string;
};
export type RegistrationRow = {
  person_id: string | null;
  event_id: string;
  checked_in_at: string | null;
};

export type EventRow = {
  event_id: string;
  attendance_count: number | string | null;
  /** Codes on such an event are not evidence of subsidy (#1588). */
  auto_assign_discount_codes?: boolean;
};

export type CheckinCountRow = {
  person_id: string;
  checked_in_event_count: number | string;
};

export const DISCOUNT_CODE_KINDS = [
  { value: "rental", label: "Rental" },
  { value: "lift", label: "Lift ticket" },
  { value: "lesson", label: "Lesson" },
  { value: "other", label: "Other" },
] as const;

export type DiscountCodeKind = (typeof DISCOUNT_CODE_KINDS)[number]["value"];

/** A code held by a registrant who did not cancel (see the RPCs). */
export type DiscountCodeRow = {
  event_id: string;
  registration_id: string | null;
  kind?: string | null;
  value?: number | string | null;
};

/**
 * A code that offers a discount (#1589): the event's shared code, or a
 * single-use code held by a registrant who did not cancel. `options` are the
 * registration options it covers, each with the option's current price, which
 * only decides whether the code's value can be derived at all.
 */
export type OfferedCodeRow = {
  event_id: string;
  code_id: string;
  shared: boolean;
  registration_id: string | null;
  /** The typed value (#1588), the fallback when nothing can be derived. */
  value?: number | string | null;
  options: {
    option_id: string;
    percent_off: number | string;
    price: number | string | null;
  }[];
};

/** One registration's answer to one option, at the price it copied (#1589). */
export type PricedOptionCountRow = {
  event_id: string;
  registration_id: string;
  option_id: string | null;
  quantity: number | string;
  price: number | string | null;
};

/** A paid expense flagged as participant assistance (#1588). */
export type AssistanceExpenseRow = {
  event_id: string | null;
  amount: number | string;
};

/** A person attached to an event: volunteer signups, hours loggers, beginners. */
export type PersonEventRow = {
  event_id: string | null;
  person_id: string | null;
};

export function toNumber(value: number | string | null): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : 0;
}

export function sumDistributedQuantity(
  movements: DistributedMovementRow[],
): number {
  return movements.reduce(
    (total, movement) => total + toNumber(movement.quantity),
    0,
  );
}

export type PeopleServed = {
  /** Units handed out: the sum of the movements' quantities. */
  distributed: number;
  /**
   * Distinct recipients per event, summed across events -- a participation
   * count like `participants`, not a unique-people count. Movements with no
   * recorded recipient are in `distributed` but not here.
   */
  recipients: number;
  /** Face value of the distinct items handed out, each item counted once. */
  value: number;
};

/**
 * People served by an event's distributions (#1577). One definition for the
 * Results card's Outcomes section and the program rollup.
 */
export function computePeopleServed(
  movements: DistributedMovementRow[],
): PeopleServed {
  const recipientsByEvent = new Map<string, Set<string>>();
  const valueByItem = new Map<string, number>();
  for (const movement of movements) {
    if (movement.recipient_person_id) {
      const key = movement.event_id ?? "";
      const people = recipientsByEvent.get(key) ?? new Set<string>();
      people.add(movement.recipient_person_id);
      recipientsByEvent.set(key, people);
    }
    if (movement.inventory_item_id) {
      valueByItem.set(
        movement.inventory_item_id,
        toNumber(movement.face_value ?? null),
      );
    }
  }
  let recipients = 0;
  for (const people of recipientsByEvent.values()) recipients += people.size;
  let value = 0;
  for (const itemValue of valueByItem.values()) value += itemValue;
  return {
    distributed: sumDistributedQuantity(movements),
    recipients,
    value,
  };
}

export function sumVolunteerHours(rows: VolunteerHoursRow[]): number {
  return rows.reduce((total, row) => total + toNumber(row.hours), 0);
}

export function countRepeatParticipants(
  registrations: RegistrationRow[],
): number {
  const eventsByPerson = new Map<string, Set<string>>();
  for (const registration of registrations) {
    if (!registration.person_id) continue;
    const events =
      eventsByPerson.get(registration.person_id) ?? new Set<string>();
    events.add(registration.event_id);
    eventsByPerson.set(registration.person_id, events);
  }
  let repeatCount = 0;
  for (const events of eventsByPerson.values()) {
    if (events.size >= 2) repeatCount += 1;
  }
  return repeatCount;
}

export function computeParticipants(
  events: EventRow[],
  registrations: RegistrationRow[],
): number {
  const checkedInCountByEvent = new Map<string, number>();
  for (const registration of registrations) {
    if (!registration.checked_in_at) continue;
    checkedInCountByEvent.set(
      registration.event_id,
      (checkedInCountByEvent.get(registration.event_id) ?? 0) + 1,
    );
  }

  return events.reduce((total, event) => {
    const hasManualCount =
      event.attendance_count !== null && event.attendance_count !== undefined;
    const count = hasManualCount
      ? toNumber(event.attendance_count)
      : (checkedInCountByEvent.get(event.event_id) ?? 0);
    return total + count;
  }, 0);
}

/** Checked-in registrations only — the headcount ignores who was there. */
export function countCheckedIn(registrations: RegistrationRow[]): number {
  return registrations.filter((row) => row.checked_in_at !== null).length;
}

export function computeFirstTimeParticipants(
  registrations: RegistrationRow[],
  checkinCounts: CheckinCountRow[],
): number {
  const eventCountByPerson = new Map<string, number>();
  for (const row of checkinCounts) {
    eventCountByPerson.set(row.person_id, toNumber(row.checked_in_event_count));
  }

  const seen = new Set<string>();
  let firstTime = 0;
  for (const registration of registrations) {
    if (!registration.person_id || !registration.checked_in_at) continue;
    if (seen.has(registration.person_id)) continue;
    seen.add(registration.person_id);
    if ((eventCountByPerson.get(registration.person_id) ?? 0) === 1) {
      firstTime += 1;
    }
  }
  return firstTime;
}

export function countSubsidizedTickets(
  discountCodes: DiscountCodeRow[],
): number {
  return discountCodes.filter((row) => row.registration_id !== null).length;
}

/**
 * Codes that count as help given (#1588): assigned, on an event that does not
 * auto-assign a code to every registrant. On such an event an assigned code
 * says nothing about need, so it counts toward neither rental subsidies nor
 * assistance.
 */
function subsidyCodes(
  discountCodes: DiscountCodeRow[],
  autoAssignEventIds: ReadonlySet<string>,
): DiscountCodeRow[] {
  return discountCodes.filter(
    (row) =>
      row.registration_id !== null && !autoAssignEventIds.has(row.event_id),
  );
}

function autoAssignIds(events: EventRow[]): Set<string> {
  return new Set(
    events
      .filter((event) => event.auto_assign_discount_codes)
      .map((event) => event.event_id),
  );
}

/** Rental-kind codes held by a registrant (#1588). */
export function countRentalSubsidies(
  discountCodes: DiscountCodeRow[],
  events: EventRow[],
): number {
  return subsidyCodes(discountCodes, autoAssignIds(events)).filter(
    (row) => row.kind === "rental",
  ).length;
}

export type ParticipantAssistance = {
  /** Value of the codes assigned to registrants. */
  discountCodes: number;
  /** Face value of the items given out (people served's value). */
  distributions: number;
  /** Paid expenses flagged as participant assistance. */
  expenses: number;
  total: number;
};

/**
 * Participant assistance (#1588), in parts so the total can be traced: the
 * value of assigned codes, the value given out in distributions, and paid
 * expenses flagged as participant assistance.
 */
export function computeParticipantAssistance(
  discountCodes: DiscountCodeRow[],
  events: EventRow[],
  distributedValue: number,
  expenses: AssistanceExpenseRow[],
): ParticipantAssistance {
  const codes = subsidyCodes(discountCodes, autoAssignIds(events)).reduce(
    (total, row) => total + toNumber(row.value ?? null),
    0,
  );
  const spent = expenses.reduce(
    (total, row) => total + toNumber(row.amount),
    0,
  );
  return {
    discountCodes: codes,
    distributions: distributedValue,
    expenses: spent,
    total: codes + distributedValue + spent,
  };
}

export type CodeValueOffered = {
  codeId: string;
  shared: boolean;
  /** Null when nothing can be derived and no value was typed: shown as "—". */
  value: number | null;
  /** True when computed from covered options and copied prices. */
  derived: boolean;
};

export type DiscountValueOffered = {
  /** The shared codes, summed over the registrations that did not cancel. */
  shared: number;
  /** Single-use codes, each for the one registration holding it. */
  singleUse: number;
  total: number;
  codes: CodeValueOffered[];
};

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Discount value offered (#1589): per covered option, count × copied price ×
 * percent off. A shared code is summed over the event's registrations that did
 * not cancel; a single-use code over the one registration holding it. A
 * bundled option is discounted on its whole price.
 *
 * A code covering no option, or only options with no price, has no derived
 * value. It falls back to the typed value (#1588): once for a single-use code,
 * once per registration for a shared one. With neither it is null.
 *
 * Offered, not received: redemption happens on the partner's site, so nothing
 * here says anyone used a code. It never feeds participant assistance.
 */
export function computeDiscountValueOffered(
  codes: OfferedCodeRow[],
  optionCounts: PricedOptionCountRow[],
  registrations: RegistrationRow[],
): DiscountValueOffered {
  const countsByRegistration = new Map<string, PricedOptionCountRow[]>();
  const registrationsByEvent = new Map<string, Set<string>>();
  for (const row of optionCounts) {
    const rows = countsByRegistration.get(row.registration_id) ?? [];
    rows.push(row);
    countsByRegistration.set(row.registration_id, rows);
    const ids = registrationsByEvent.get(row.event_id) ?? new Set<string>();
    ids.add(row.registration_id);
    registrationsByEvent.set(row.event_id, ids);
  }
  const registrationCountByEvent = new Map<string, number>();
  for (const registration of registrations) {
    registrationCountByEvent.set(
      registration.event_id,
      (registrationCountByEvent.get(registration.event_id) ?? 0) + 1,
    );
  }

  const result: CodeValueOffered[] = codes.map((code) => {
    const percentByOption = new Map(
      code.options.map((option) => [
        option.option_id,
        toNumber(option.percent_off),
      ]),
    );
    const derivable = code.options.some((option) => option.price !== null);

    if (derivable) {
      const registrationIds = code.shared
        ? [...(registrationsByEvent.get(code.event_id) ?? [])]
        : code.registration_id
          ? [code.registration_id]
          : [];
      let value = 0;
      for (const registrationId of registrationIds) {
        for (const row of countsByRegistration.get(registrationId) ?? []) {
          const percent = row.option_id
            ? percentByOption.get(row.option_id)
            : undefined;
          if (percent === undefined) continue;
          value +=
            (toNumber(row.quantity) * toNumber(row.price) * percent) / 100;
        }
      }
      return {
        codeId: code.code_id,
        shared: code.shared,
        value: roundCents(value),
        derived: true,
      };
    }

    if (code.value === null || code.value === undefined) {
      return {
        codeId: code.code_id,
        shared: code.shared,
        value: null,
        derived: false,
      };
    }
    const times = code.shared
      ? (registrationCountByEvent.get(code.event_id) ?? 0)
      : 1;
    return {
      codeId: code.code_id,
      shared: code.shared,
      value: roundCents(toNumber(code.value) * times),
      derived: false,
    };
  });

  const sum = (shared: boolean) =>
    roundCents(
      result
        .filter((code) => code.shared === shared)
        .reduce((total, code) => total + (code.value ?? 0), 0),
    );
  const shared = sum(true);
  const singleUse = sum(false);
  return {
    shared,
    singleUse,
    total: roundCents(shared + singleUse),
    codes: result,
  };
}

/**
 * Distinct people per event, summed across events.
 *
 * Deliberately a participation count, not a unique-people count: someone who
 * volunteered at three events counts three times, the same way `participants`
 * does. Don't add it to a "unique volunteers" figure.
 */
function countDistinctPeoplePerEvent(...sources: PersonEventRow[][]): number {
  const peopleByEvent = new Map<string, Set<string>>();
  for (const rows of sources) {
    for (const row of rows) {
      if (!row.event_id || !row.person_id) continue;
      const people = peopleByEvent.get(row.event_id) ?? new Set<string>();
      people.add(row.person_id);
      peopleByEvent.set(row.event_id, people);
    }
  }
  let total = 0;
  for (const people of peopleByEvent.values()) total += people.size;
  return total;
}

/**
 * Volunteers on site = signed up OR logged hours.
 *
 * Either source alone misses a real case: `event_volunteers` misses the walk-up
 * volunteer nobody pre-registered, and `volunteer_hours` misses everyone who
 * showed up on a day nobody got round to logging hours.
 */
export function countVolunteerParticipants(
  signups: PersonEventRow[],
  hoursLoggers: PersonEventRow[],
): number {
  return countDistinctPeoplePerEvent(signups, hoursLoggers);
}

/**
 * Checked-in attendees recorded as beginner on ski or snowboard.
 *
 * Scoped to checked-in registrants so it is comparable with first-time
 * participants. The level comes from the snapshot taken at check-in, falling
 * back to the person's live profile where there is none (issue #653) — the RPCs
 * resolve that, so both surfaces see one already-decided answer.
 *
 * The rider profile is still opt-in, so show this against
 * `countProfiledAttendees` as a denominator whenever coverage is short of the
 * checked-in headcount; on an event with no profiles it reads 0.
 */
export function countBeginnerParticipants(
  beginnerAttendees: PersonEventRow[],
): number {
  return countDistinctPeoplePerEvent(beginnerAttendees);
}

/**
 * Checked-in attendees whose rider level was first time on snow (#1588),
 * counted like beginners. A first-timer is not also a beginner: the levels are
 * exclusive, so the two figures never overlap.
 */
export function countFirstTimeOnSnow(firstTimers: PersonEventRow[]): number {
  return countDistinctPeoplePerEvent(firstTimers);
}

/** Checked-in attendees with any rider profile on file — the honest denominator. */
export function countProfiledAttendees(
  profiledAttendees: PersonEventRow[],
): number {
  return countDistinctPeoplePerEvent(profiledAttendees);
}

// ---------------------------------------------------------------------------
// Per-event figures (Results card's Outcomes + Attendance card)
// ---------------------------------------------------------------------------

export type EventImpactDerivedInput = {
  events: EventRow[];
  registrations: RegistrationRow[];
  checkinCounts: CheckinCountRow[];
  eventVolunteers: PersonEventRow[];
  volunteerHourPeople: PersonEventRow[];
  /** null when the caller lacks event_impact:view — see 20260904030000. */
  discountCodes: DiscountCodeRow[] | null;
  beginnerAttendees: PersonEventRow[] | null;
  firstTimeAttendees: PersonEventRow[] | null;
  profiledAttendees: PersonEventRow[] | null;
  autoAssignDiscountCodes: boolean;
  distributions: DistributedMovementRow[];
  /** null when the caller lacks event_impact:view. */
  assistanceExpenses: AssistanceExpenseRow[] | null;
  /** null when the caller lacks event_impact:view (#1589). */
  offeredCodes: OfferedCodeRow[] | null;
  optionCounts: PricedOptionCountRow[] | null;
  /**
   * Place answers by place (#1701), from get_event_place_breakdown(). null
   * when they could not be read.
   */
  placeAnswers?: PlaceCountRow[] | null;
};

export type EventImpactDerived = {
  /** events.attendance_count when set, else checked-in registrations. */
  participants: number;
  /** Shown beside participants as reference, never as a replacement. */
  checkedIn: number;
  firstTimeParticipants: number;
  recurringParticipants: number;
  volunteerParticipants: number;
  /** null when the viewer may not see rider-profile data. */
  beginnerParticipants: number | null;
  /** First time on snow; null when the viewer may not see rider-profile data. */
  firstTimeOnSnow: number | null;
  profiledAttendees: number | null;
  /** null when the viewer may not see discount data. */
  discountCodesAssigned: number | null;
  /** Rental-kind codes held by a registrant; null like discountCodesAssigned. */
  rentalSubsidies: number | null;
  /** null when the viewer may not see discount or expense data. */
  assistance: ParticipantAssistance | null;
  /** True when every registrant is auto-assigned a code, so it isn't a subsidy signal. */
  autoAssignDiscountCodes: boolean;
  peopleServed: PeopleServed;
  /** Never part of assistance; null when the viewer may not see discount data. */
  discountValueOffered: DiscountValueOffered | null;
  /** Distinct places reached (#1701); null where no place answer was read. */
  placeReach: PlaceReach | null;
};

export function computeEventImpactDerived(
  input: EventImpactDerivedInput,
): EventImpactDerived {
  const checkedIn = countCheckedIn(input.registrations);
  const firstTimeParticipants = computeFirstTimeParticipants(
    input.registrations,
    input.checkinCounts,
  );
  const peopleServed = computePeopleServed(input.distributions);
  // The events rows carry no flag of their own here; the RPC returns it once.
  const events = input.events.map((event) => ({
    ...event,
    auto_assign_discount_codes: input.autoAssignDiscountCodes,
  }));

  return {
    participants: computeParticipants(input.events, input.registrations),
    checkedIn,
    firstTimeParticipants,
    recurringParticipants: Math.max(checkedIn - firstTimeParticipants, 0),
    volunteerParticipants: countVolunteerParticipants(
      input.eventVolunteers,
      input.volunteerHourPeople,
    ),
    beginnerParticipants: input.beginnerAttendees
      ? countBeginnerParticipants(input.beginnerAttendees)
      : null,
    firstTimeOnSnow: input.firstTimeAttendees
      ? countFirstTimeOnSnow(input.firstTimeAttendees)
      : null,
    profiledAttendees: input.profiledAttendees
      ? countProfiledAttendees(input.profiledAttendees)
      : null,
    discountCodesAssigned: input.discountCodes
      ? countSubsidizedTickets(input.discountCodes)
      : null,
    rentalSubsidies: input.discountCodes
      ? countRentalSubsidies(input.discountCodes, events)
      : null,
    assistance:
      input.discountCodes && input.assistanceExpenses
        ? computeParticipantAssistance(
            input.discountCodes,
            events,
            peopleServed.value,
            input.assistanceExpenses,
          )
        : null,
    autoAssignDiscountCodes: input.autoAssignDiscountCodes,
    peopleServed,
    discountValueOffered:
      input.offeredCodes && input.optionCounts
        ? computeDiscountValueOffered(
            input.offeredCodes,
            input.optionCounts,
            input.registrations,
          )
        : null,
    placeReach: input.placeAnswers ? placeReach(input.placeAnswers) : null,
  };
}

// ---------------------------------------------------------------------------
// Program rollup
// ---------------------------------------------------------------------------

export type ProgramImpactRollup = {
  eventCount: number;
  participants: number;
  /** Checked-in registrations — the denominator rider-profile coverage is measured against. */
  checkedIn: number;
  firstTimeParticipants: number;
  beginnerParticipants: number;
  firstTimeOnSnow: number;
  profiledAttendees: number;
  volunteerParticipants: number;
  /** Registrants holding a code on an event that does not auto-assign them. */
  assistedParticipants: number;
  rentalSubsidies: number;
  equipmentDistributed: number;
  /** Distinct distribution recipients per event, summed. */
  distributionRecipients: number;
  /** Face value of the items distributed. */
  distributedValue: number;
  volunteerHours: number;
  participantAssistance: ParticipantAssistance;
  /** Shown beside assistance, never added to it (#1589). */
  discountValueOffered: DiscountValueOffered;
  repeatParticipants: number;
  /** Distinct places reached (#1701); null where no place answer was read. */
  placeReach: PlaceReach | null;
};

export type ProgramImpactRollupInput = {
  eventCount: number;
  events: EventRow[];
  distributedMovements: DistributedMovementRow[];
  volunteerHours: VolunteerHoursRow[];
  registrations: RegistrationRow[];
  checkinCounts: CheckinCountRow[];
  discountCodes: DiscountCodeRow[];
  eventVolunteers: PersonEventRow[];
  volunteerHourPeople: PersonEventRow[];
  beginnerAttendees: PersonEventRow[];
  firstTimeAttendees: PersonEventRow[];
  profiledAttendees: PersonEventRow[];
  assistanceExpenses: AssistanceExpenseRow[];
  offeredCodes: OfferedCodeRow[];
  optionCounts: PricedOptionCountRow[];
  /** From get_program_place_reach() (#1701); null when it could not be read. */
  placeAnswers?: PlaceCountRow[] | null;
};

export function computeProgramImpactRollup(
  input: ProgramImpactRollupInput,
): ProgramImpactRollup {
  const peopleServed = computePeopleServed(input.distributedMovements);
  return {
    eventCount: input.eventCount,
    participants: computeParticipants(input.events, input.registrations),
    checkedIn: countCheckedIn(input.registrations),
    firstTimeParticipants: computeFirstTimeParticipants(
      input.registrations,
      input.checkinCounts,
    ),
    beginnerParticipants: countBeginnerParticipants(input.beginnerAttendees),
    firstTimeOnSnow: countFirstTimeOnSnow(input.firstTimeAttendees),
    profiledAttendees: countProfiledAttendees(input.profiledAttendees),
    volunteerParticipants: countVolunteerParticipants(
      input.eventVolunteers,
      input.volunteerHourPeople,
    ),
    // Undercounts internally-granted scholarships and fee waivers, which
    // aren't modelled anywhere in the schema. Archived typed figures are never
    // added in (#1588).
    assistedParticipants: subsidyCodes(
      input.discountCodes,
      autoAssignIds(input.events),
    ).length,
    rentalSubsidies: countRentalSubsidies(input.discountCodes, input.events),
    equipmentDistributed: peopleServed.distributed,
    distributionRecipients: peopleServed.recipients,
    distributedValue: peopleServed.value,
    volunteerHours: sumVolunteerHours(input.volunteerHours),
    participantAssistance: computeParticipantAssistance(
      input.discountCodes,
      input.events,
      peopleServed.value,
      input.assistanceExpenses,
    ),
    discountValueOffered: computeDiscountValueOffered(
      input.offeredCodes,
      input.optionCounts,
      input.registrations,
    ),
    repeatParticipants: countRepeatParticipants(input.registrations),
    placeReach: input.placeAnswers ? placeReach(input.placeAnswers) : null,
  };
}
