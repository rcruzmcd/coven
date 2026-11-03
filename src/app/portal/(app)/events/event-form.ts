import type { ParseResult } from "@/lib/forms";
import { type MinimumAge, parseMinimumAge } from "@/lib/adults-only";
import { GROUP_CHAT_LABEL_MAX_LENGTH } from "@/lib/registration-group-chat";
import { eventCarpoolNoticeFromForm } from "@/lib/event-carpools";
import {
  REMINDER_DAYS_MAX,
  REMINDER_DAYS_MIN,
  REMINDER_INTRO_MAX_LENGTH,
  storedReminderIntro,
} from "@/lib/event-reminders";

const VISIBILITIES = ["public", "private"] as const;
// No `completed` (#1609): whether an event is over is read off its dates.
const STATUSES = ["draft", "published", "cancelled", "archived"] as const;

export type EventFormData = {
  name: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  visibility: (typeof VISIBILITIES)[number];
  status: (typeof STATUSES)[number];
  programIds: string[];
  flierUrl: string | null;
};

/** A UTC instant as the client sent it, or null if it is not one. */
function toInstant(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseEventForm(formData: FormData): ParseResult<EventFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "");
  const status = String(formData.get("status") ?? "");
  // An event may count toward any number of programs, including none, so the
  // empty list is valid and there is nothing to validate here.
  const programIds = formData.getAll("programIds").map(String);
  const flierUrl = String(formData.get("flierUrl") ?? "").trim();

  if (!name) return { error: "Event name is required." };
  if (!startsAt) return { error: "Start date and time are required." };
  if (!timezone) return { error: "Timezone is required." };
  if (!VISIBILITIES.includes(visibility as (typeof VISIBILITIES)[number])) {
    return { error: "Select a valid visibility." };
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid status." };
  }

  // Already instants: since #1063 the browser converts before submitting, so
  // what arrives here is a UTC ISO string rather than a naive wall-clock one.
  // Doing it in the client is the whole point -- this parser runs on the
  // server, where the only zone available is the server's own (UTC on
  // Vercel), which is never the zone the typist meant. `events.timezone` is
  // still collected and still governs how the *public* site renders the
  // event; it no longer says how a typed time is read.
  const startsAtIso = toInstant(startsAt);
  if (!startsAtIso) return { error: "Enter a valid start date and time." };
  const endsAtIso = endsAt ? toInstant(endsAt) : null;
  if (endsAt && !endsAtIso)
    return { error: "Enter a valid end date and time." };
  if (endsAtIso && endsAtIso < startsAtIso) {
    return { error: "End time must be after the start time." };
  }

  return {
    data: {
      name,
      description: description || null,
      location: location || null,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      timezone,
      visibility: visibility as (typeof VISIBILITIES)[number],
      status: status as (typeof STATUSES)[number],
      programIds,
      flierUrl: flierUrl || null,
    },
  };
}

/** #1778. The Planning card: who leads the event and what it may spend. */
export type EventPlanningFormData = {
  eventLeadId: string | null;
  budgetAmount: number | null;
};

export function parseEventPlanningForm(
  formData: FormData,
): ParseResult<EventPlanningFormData> {
  const eventLeadId = String(formData.get("eventLeadId") ?? "").trim();
  const budgetAmountRaw = String(formData.get("budgetAmount") ?? "").trim();

  let budgetAmount: number | null = null;
  if (budgetAmountRaw) {
    const parsed = Number(budgetAmountRaw);
    if (Number.isNaN(parsed) || parsed < 0) {
      return { error: "Budget must be a positive number." };
    }
    budgetAmount = parsed;
  }

  return { data: { eventLeadId: eventLeadId || null, budgetAmount } };
}

/**
 * #1778. The Registration card, and until the rest of #1777 lands the
 * settings it still carries for other cards.
 */
export type EventRegistrationFormData = {
  capacity: number | null;
  registrationEnabled: boolean;
  registrationDeadline: string | null;
  autoAssignDiscountCodes: boolean;
  /**
   * #1417, #1782. The age requirement, null for none. Undefined when the form
   * did not send the field, so a save from a form that does not show the
   * choice leaves the column as it was.
   */
  minimumAge: MinimumAge | null | undefined;
  /**
   * #1648. The switch and its label, under `minimumAge`'s absent-leaves-it
   * rule; a blank label is stored as null, which reads "Group chat".
   */
  groupChatEnabled: boolean | null;
  groupChatLabel: string | null | undefined;
  /**
   * #1649. The carpools switch, null when the form did not send it, and the
   * number question seats come from: undefined when not sent, null for none.
   */
  carpoolsEnabled: boolean | null;
  carpoolSeatsQuestionId: string | null | undefined;
  /**
   * `events.carpool_cost_notice`: undefined when not sent, null for the
   * organization's notice, [] for none, otherwise the event's paragraphs.
   */
  carpoolCostNotice: string[] | null | undefined;
};

/** A switch as a form posts it: "on" or "true" is on. */
function isChecked(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

export function parseEventRegistrationForm(
  formData: FormData,
  event: { startsAt: string; endsAt: string | null },
): ParseResult<EventRegistrationFormData> {
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const registrationEnabled = isChecked(formData.get("registrationEnabled"));
  const registrationDeadline = String(
    formData.get("registrationDeadline") ?? "",
  );
  const autoAssignDiscountCodes = isChecked(
    formData.get("autoAssignDiscountCodes"),
  );
  const minimumAgeRaw = formData.get("minimumAge");
  const minimumAge =
    minimumAgeRaw === null ? undefined : parseMinimumAge(minimumAgeRaw);
  const groupChatEnabledRaw = formData.get("groupChatEnabled");
  const groupChatEnabled =
    groupChatEnabledRaw === null ? null : isChecked(groupChatEnabledRaw);
  const groupChatLabelRaw = formData.get("groupChatLabel");
  const groupChatLabel =
    groupChatLabelRaw === null
      ? undefined
      : String(groupChatLabelRaw).trim() || null;
  if (groupChatLabel && groupChatLabel.length > GROUP_CHAT_LABEL_MAX_LENGTH) {
    return {
      error: `Group chat name must be ${GROUP_CHAT_LABEL_MAX_LENGTH} characters or fewer.`,
    };
  }
  const carpoolsEnabledRaw = formData.get("carpoolsEnabled");
  const carpoolsEnabled =
    carpoolsEnabledRaw === null ? null : isChecked(carpoolsEnabledRaw);
  const carpoolSeatsRaw = formData.get("carpoolSeatsQuestionId");
  const carpoolSeatsQuestionId =
    carpoolSeatsRaw === null
      ? undefined
      : String(carpoolSeatsRaw).trim() || null;
  const carpoolNoticeModeRaw = formData.get("carpoolNoticeMode");
  let carpoolCostNotice: string[] | null | undefined;
  if (carpoolNoticeModeRaw !== null) {
    const mode = String(carpoolNoticeModeRaw);
    if (mode !== "organization" && mode !== "custom" && mode !== "hidden") {
      return { error: "Choose which carpool cost notice to show." };
    }
    const notice = eventCarpoolNoticeFromForm(
      mode,
      String(formData.get("carpoolNoticeText") ?? ""),
    );
    if ("error" in notice) return { error: notice.error };
    carpoolCostNotice = notice.data;
  }

  let capacity: number | null = null;
  if (capacityRaw) {
    const parsed = Number(capacityRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: "Capacity must be a whole number of 0 or more." };
    }
    capacity = parsed;
  }

  // A deadline only means something while registration is open, so drop any
  // value submitted with registration turned off rather than storing a stale
  // cutoff that `register_for_event` would still read.
  let registrationDeadlineIso: string | null = null;
  if (registrationEnabled && registrationDeadline) {
    const parsedDeadline = Date.parse(registrationDeadline);
    if (Number.isNaN(parsedDeadline)) {
      return { error: "Enter a valid registration deadline." };
    }
    registrationDeadlineIso = new Date(parsedDeadline).toISOString();

    // Registration can't stay open past the event itself; events without an
    // end time are bounded by their start instead. Compared as timestamps
    // because the event's dates come straight from Postgres
    // ("...+00:00") and won't string-compare against `toISOString()`.
    const cutoff = Date.parse(event.endsAt ?? event.startsAt);
    if (!Number.isNaN(cutoff) && parsedDeadline > cutoff) {
      return {
        error: event.endsAt
          ? "Registration deadline must be on or before the event's end date."
          : "Registration deadline must be on or before the event's start date.",
      };
    }
  }

  return {
    data: {
      capacity,
      registrationEnabled,
      registrationDeadline: registrationDeadlineIso,
      autoAssignDiscountCodes,
      minimumAge,
      groupChatEnabled,
      groupChatLabel,
      carpoolsEnabled,
      carpoolSeatsQuestionId,
      carpoolCostNotice,
    },
  };
}

/** #1779. The Registrant emails card: what is emailed to registrants. */
export type EventRegistrantEmailsFormData = {
  /**
   * A paragraph added to this event's registration confirmation email; sent
   * blank, it clears the note (stored as null).
   */
  confirmationNote: string | null;
  /** #1652. The reminder; its intro is null for blank or the platform default. */
  reminderEnabled: boolean;
  reminderDaysBefore: number;
  reminderIntro: string | null;
};

/** AUTO_REPLY_PARAGRAPH_MAX_LENGTH, the paragraphs either side of it. */
export const CONFIRMATION_NOTE_MAX_LENGTH = 1000;

export function parseEventRegistrantEmailsForm(
  formData: FormData,
): ParseResult<EventRegistrantEmailsFormData> {
  const reminderEnabled = isChecked(formData.get("reminderEnabled"));
  const reminderDaysBefore = Number(
    String(formData.get("reminderDaysBefore") ?? "").trim(),
  );
  if (
    !Number.isInteger(reminderDaysBefore) ||
    reminderDaysBefore < REMINDER_DAYS_MIN ||
    reminderDaysBefore > REMINDER_DAYS_MAX
  ) {
    return {
      error: `Reminder days must be a whole number from ${REMINDER_DAYS_MIN} to ${REMINDER_DAYS_MAX}.`,
    };
  }
  const reminderIntro = storedReminderIntro(
    String(formData.get("reminderIntro") ?? ""),
  );
  if (reminderIntro && reminderIntro.length > REMINDER_INTRO_MAX_LENGTH) {
    return {
      error: `Reminder intro must be ${REMINDER_INTRO_MAX_LENGTH} characters or fewer.`,
    };
  }
  const confirmationNote =
    String(formData.get("confirmationNote") ?? "").trim() || null;
  if (
    confirmationNote &&
    confirmationNote.length > CONFIRMATION_NOTE_MAX_LENGTH
  ) {
    return {
      error: `Confirmation email note must be ${CONFIRMATION_NOTE_MAX_LENGTH} characters or fewer.`,
    };
  }

  return {
    data: {
      confirmationNote,
      reminderEnabled,
      reminderDaysBefore,
      reminderIntro,
    },
  };
}

export type EventReportFormData = {
  feedbackNotes: string | null;
  contentNotes: string | null;
};

export function parseEventReportForm(
  formData: FormData,
): ParseResult<EventReportFormData> {
  const feedbackNotes = String(formData.get("feedbackNotes") ?? "").trim();
  const contentNotes = String(formData.get("contentNotes") ?? "").trim();

  return {
    data: {
      feedbackNotes: feedbackNotes || null,
      contentNotes: contentNotes || null,
    },
  };
}

export function parseReopenReason(reason: string): ParseResult<string> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { error: "A reason is required to reopen this report." };
  }
  return { data: trimmed };
}

export type EventAttendanceFormData = {
  attendanceCount: number | null;
  attendanceNotes: string | null;
};

export function parseEventAttendanceForm(
  formData: FormData,
): ParseResult<EventAttendanceFormData> {
  const countRaw = String(formData.get("attendanceCount") ?? "").trim();
  const notes = String(formData.get("attendanceNotes") ?? "").trim();

  let attendanceCount: number | null = null;
  if (countRaw) {
    const parsed = Number(countRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: "Attendance must be a whole number of 0 or more." };
    }
    attendanceCount = parsed;
  }

  return { data: { attendanceCount, attendanceNotes: notes || null } };
}

/**
 * An event's registration question as the Planning tab submits it (#1407):
 * the whole list, in display order. `save_event_registration_options()`
 * checks all of this again; this is so the tab can say which rule it broke.
 */
export type EventRegistrationOptionsFormData = {
  prompt: string | null;
  options: {
    id: string | null;
    label: string;
    cap: number | null;
    /** Dollars, to the cent; null is no price (#1589). */
    price: number | null;
  }[];
};

export const REGISTRATION_OPTIONS_SAVE_ERRORS: Record<string, string> = {
  EVENT_OPTIONS_INVALID:
    "Each option needs a name, a cap must be a whole number of 0 or more, and a price an amount of 0 or more.",
  EVENT_OPTIONS_TOO_MANY: "An event can offer at most 10 options.",
  EVENT_OPTIONS_PROMPT_REQUIRED: "Write the question the options answer.",
  EVENT_OPTIONS_DUPLICATE: "Two options have the same name.",
};

/**
 * Null when the field was not sent -- the tab sends it only when the
 * question changed.
 */
export function parseEventRegistrationOptionsField(
  raw: FormDataEntryValue | null,
): ParseResult<EventRegistrationOptionsFormData> | null {
  if (raw === null) return null;
  const invalid = {
    error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_INVALID,
  };

  let value: unknown;
  try {
    value = JSON.parse(String(raw));
  } catch {
    return invalid;
  }
  const draft = value as {
    prompt?: unknown;
    options?: {
      id?: unknown;
      label?: unknown;
      cap?: unknown;
      price?: unknown;
    }[];
  };
  if (!draft || !Array.isArray(draft.options)) return invalid;

  const options: EventRegistrationOptionsFormData["options"] = [];
  for (const option of draft.options) {
    const label = String(option?.label ?? "").trim();
    if (!label || label.length > 120) return invalid;
    const capRaw = String(option?.cap ?? "").trim();
    const cap = capRaw === "" ? null : Number(capRaw);
    if (cap !== null && (!Number.isInteger(cap) || cap < 0)) return invalid;
    const priceRaw = String(option?.price ?? "").trim();
    const price = priceRaw === "" ? null : Number(priceRaw);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return invalid;
    }
    const id = typeof option?.id === "string" && option.id ? option.id : null;
    options.push({
      id,
      label,
      cap,
      price: price === null ? null : Math.round(price * 100) / 100,
    });
  }

  if (options.length > 10) {
    return { error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_TOO_MANY };
  }
  const prompt = String(draft.prompt ?? "").trim();
  if (options.length > 0 && !prompt) {
    return {
      error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_PROMPT_REQUIRED,
    };
  }
  if (prompt.length > 300) return invalid;
  const labels = new Set(options.map((option) => option.label.toLowerCase()));
  if (labels.size !== options.length) {
    return { error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_DUPLICATE };
  }

  return { data: { prompt: options.length > 0 ? prompt : null, options } };
}
