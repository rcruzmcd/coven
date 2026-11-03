import { toEventCarpoolNotice } from "@/lib/event-carpools";

/**
 * A registrant's own carpool assignment (#1651): the car, its driver and the
 * other riders, as `carpool_assignment_card()` builds it. Shared by the card
 * on `/my` and the answers link, the assignment email and the staff dialog
 * that sends it, so all of them say the same thing.
 *
 * What a car-mate is shown is deliberately thin: a first name, an Instagram
 * handle (or that they have none) and a party size. Never a phone number, an
 * email, the preferred contact detail, staff notes or paid status -- the SQL
 * function returns nothing else, and this module has nothing else to render.
 *
 * No runtime imports: the dialog is a client component and the sender is
 * `server-only`.
 */

export type CarpoolMate = {
  firstName: string | null;
  instagramHandle: string | null;
  hasNoInstagram: boolean;
  partySize: number;
};

export type CarpoolAssignment = {
  carLabel: string;
  leavingFrom: string | null;
  role: "driver" | "passenger";
  partySize: number;
  /** Null for the driver themselves, or a car with no driver yet. */
  driver: CarpoolMate | null;
  /** Everyone else riding as a passenger, in the order they were added. */
  riders: CarpoolMate[];
};

/**
 * What the RPCs return for a registration on a carpool event: its car, or
 * null while it is in none. A registration on any other event has no view at
 * all, which renders no card.
 */
export type RegistrantCarpool = {
  car: CarpoolAssignment | null;
  /** `events.carpool_cost_notice`: null for the organization's notice. */
  notice: string[] | null;
};

export const CARPOOL_CARD_HEADING = "Your carpool";
export const NOT_IN_A_CAR_YET = "You haven't been placed in a car yet.";
/** The answers link's words in the assignment email. */
export const CARPOOL_LINK_LABEL = "See your carpool and answers";

type RawMate = {
  first_name?: unknown;
  instagram_handle?: unknown;
  has_no_instagram?: unknown;
  party_size?: unknown;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function size(value: unknown): number {
  return typeof value === "number" && value >= 1 ? value : 1;
}

function toMate(raw: unknown): CarpoolMate | null {
  if (!raw || typeof raw !== "object") return null;
  const mate = raw as RawMate;
  return {
    firstName: text(mate.first_name),
    instagramHandle: text(mate.instagram_handle),
    hasNoInstagram: mate.has_no_instagram === true,
    partySize: size(mate.party_size),
  };
}

/** One card off the wire, or null for anything that is not one. */
export function toCarpoolAssignment(raw: unknown): CarpoolAssignment | null {
  if (!raw || typeof raw !== "object") return null;
  const card = raw as Record<string, unknown>;
  const carLabel = text(card.car_label);
  if (!carLabel) return null;
  return {
    carLabel,
    leavingFrom: text(card.leaving_from),
    role: card.role === "driver" ? "driver" : "passenger",
    partySize: size(card.party_size),
    driver: toMate(card.driver),
    riders: Array.isArray(card.riders)
      ? card.riders.flatMap((row) => {
          const mate = toMate(row);
          return mate ? [mate] : [];
        })
      : [],
  };
}

/** `my_registration_carpool()` or `registration_carpool_by_token()`. */
export function toRegistrantCarpool(raw: unknown): RegistrantCarpool | null {
  if (!raw || typeof raw !== "object" || !("car" in raw)) return null;
  const row = raw as { car: unknown; notice?: unknown };
  return {
    car: toCarpoolAssignment(row.car),
    notice: toEventCarpoolNotice(row.notice),
  };
}

/** "Sam", "Sam (party of 3)", or "Someone" for a registration with no name. */
export function carpoolMateName(mate: CarpoolMate): string {
  const name = mate.firstName ?? "Someone";
  return mate.partySize > 1 ? `${name} (party of ${mate.partySize})` : name;
}

/**
 * How to reach a car-mate: their handle, or -- with none -- staff. The
 * preferred contact a no-Instagram registrant gave is the organization's
 * to use, never their car-mates'.
 */
export function carpoolMateContact(mate: CarpoolMate, orgName: string): string {
  if (mate.instagramHandle && !mate.hasNoInstagram) {
    return `@${mate.instagramHandle.replace(/^@+/, "")}`;
  }
  return `No Instagram — ask ${orgName} to connect you`;
}

export function carpoolRoleLabel(role: CarpoolAssignment["role"]): string {
  return role === "driver" ? "You're driving" : "You're a passenger";
}

/**
 * The card as labelled lines, in the order every surface shows them -- the
 * email's text part and the message log use these directly.
 */
export function carpoolAssignmentLines(
  car: CarpoolAssignment,
  orgName: string,
): { label: string; value: string }[] {
  const lines = [
    { label: "Car", value: car.carLabel },
    ...(car.leavingFrom
      ? [{ label: "Leaving from", value: car.leavingFrom }]
      : []),
    { label: "Your role", value: carpoolRoleLabel(car.role) },
  ];
  if (car.role === "passenger") {
    lines.push({
      label: "Driver",
      value: car.driver
        ? `${carpoolMateName(car.driver)} · ${carpoolMateContact(car.driver, orgName)}`
        : "Not chosen yet",
    });
  }
  lines.push({
    label: car.role === "driver" ? "Riding with you" : "Also riding",
    value:
      car.riders.length > 0
        ? car.riders
            .map(
              (mate) =>
                `${carpoolMateName(mate)} · ${carpoolMateContact(mate, orgName)}`,
            )
            .join("; ")
        : "Nobody else yet",
  });
  return lines;
}

/** One row of `event_carpool_assignment_recipients()`, as the dialog counts it. */
export type CarpoolAssignmentRecipient = {
  registrationId: string;
  hasEmail: boolean;
  changed: boolean;
};

export type CarpoolAssignmentAudience = "everyone" | "changed";

/**
 * Who a send reaches, and who it cannot: the same rule on both sides of the
 * dialog, so the number on the button is the number the action sends.
 */
export function resolveCarpoolAssignmentRecipients<
  T extends CarpoolAssignmentRecipient,
>(
  rows: readonly T[],
  audience: CarpoolAssignmentAudience,
): { recipients: T[]; withoutAddress: number } {
  const wanted = rows.filter((row) => audience === "everyone" || row.changed);
  return {
    recipients: wanted.filter((row) => row.hasEmail),
    withoutAddress: wanted.filter((row) => !row.hasEmail).length,
  };
}

/** The assignment send's refusals, as staff read them. */
export const CARPOOL_ASSIGNMENT_ERRORS = {
  NO_RECIPIENTS:
    "Nobody to email: nobody in a car has an email address, or nobody's car has changed since they were last emailed.",
  FAILED: "The assignments could not be sent. Please try again.",
} as const;
