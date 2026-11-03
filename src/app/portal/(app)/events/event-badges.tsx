import {
  humanizeStatus,
  StatusBadge as StatusPill,
  type StatusTone,
} from "@/components/portal/status-badge";
import type { EventRegistrationQuestion } from "./registration-questions-draft";

export type EventLeadPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type EventRow = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  visibility: string;
  status: string;
  attendance_count: number | null;
  attendance_notes: string | null;
  description: string | null;
  capacity: number | null;
  registration_enabled: boolean;
  registration_deadline: string | null;
  auto_assign_discount_codes: boolean;
  budget_amount: number | string | null;
  event_lead_id: string | null;
  event_lead: EventLeadPerson | null;
  report_status: string;
  report_summary: string | null;
  feedback_notes: string | null;
  content_notes: string | null;
  report_submitted_at: string | null;
  report_submitted_by: string | null;
  // Normalised from the `event_programs(program_id)` embed by the pages that
  // load events; an event may count toward any number of programs.
  program_ids: string[];
  flier_url: string | null;
  /**
   * The event's registration question (#1407). Loaded by the event detail
   * page only, which is where the Planning tab edits it; absent elsewhere.
   */
  registration_options_prompt?: string | null;
  /**
   * The age requirement (#1417, #1782): 18, 21, or null for none. Loaded by
   * the event detail page, where the Planning tab edits it; absent elsewhere.
   */
  minimum_age?: number | null;
  /**
   * The paragraph added to this event's registration confirmation email.
   * Loaded by the event detail page, where the Planning tab edits it.
   */
  confirmation_note?: string | null;
  /**
   * The group chat switch and its label (#1648). Loaded by the event detail
   * page, where the Planning tab edits them.
   */
  group_chat_enabled?: boolean;
  group_chat_label?: string | null;
  /**
   * The reminder email (#1652). Loaded by the event detail page, where the
   * Planning tab edits them.
   */
  reminder_enabled?: boolean;
  reminder_days_before?: number;
  reminder_intro?: string | null;
  /**
   * The carpools switch and the question seats come from (#1649). Loaded by
   * the event detail page, where the Planning tab edits them.
   */
  carpools_enabled?: boolean;
  carpool_seats_question_id?: string | null;
  /** This event's carpool cost notice: null for the organization's. */
  carpool_cost_notice?: unknown;
  registration_options?: {
    id: string;
    label: string;
    cap: number | null;
    /** What the option costs (#1589); null where it has no price. */
    price?: number | null;
    sort_order: number;
  }[];
  /**
   * The event's current registration questions (#1501), in order. Loaded by
   * the event detail page, where the Planning tab edits them; absent elsewhere.
   */
  registration_questions?: EventRegistrationQuestion[];
};

const STATUS_STYLES: Record<string, StatusTone> = {
  draft: "neutral",
  published: "progress",
  cancelled: "danger",
  archived: "neutral",
};

const VISIBILITY_STYLES: Record<string, StatusTone> = {
  private: "neutral",
  public: "info",
};

const REPORT_STATUS_STYLES: Record<string, StatusTone> = {
  not_started: "neutral",
  in_progress: "progress",
  submitted: "success",
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <StatusPill tone={STATUS_STYLES[status] ?? "neutral"}>{status}</StatusPill>
  );
}

export function VisibilityBadge({ visibility }: { visibility: string }) {
  return (
    <StatusPill tone={VISIBILITY_STYLES[visibility] ?? "neutral"}>
      {humanizeStatus(visibility)}
    </StatusPill>
  );
}

export function ReportStatusBadge({ status }: { status: string }) {
  return (
    <StatusPill tone={REPORT_STATUS_STYLES[status] ?? "neutral"}>
      {REPORT_STATUS_LABELS[status] ?? status}
    </StatusPill>
  );
}

export type PhaseStatus = "not_started" | "in_progress" | "done";

/**
 * How much work is still open in a phase.
 *
 * Replaces the old Not started / In progress / Done pill, which read as a
 * completion meter but only ever checked three columns on the event row --
 * "Planning: Done" meant a lead, capacity and budget were set, and said nothing
 * about logistics, volunteers, staff or sponsors. A count of named outstanding
 * items is both honest about what it measures and actionable; the names ride
 * along in the tooltip so the badge says what's missing, not just how much.
 */
/**
 * How much is still outstanding on one section, for its rail row (#1008). It
 * sat on the phase tab until the rail replaced the phase strip, where a "3"
 * told you a phase had work in it but not which of its six cards.
 */
export function OutstandingBadge({ tasks }: { tasks: string[] }) {
  if (tasks.length === 0) return null;

  return (
    <StatusPill tone="progress">
      <span title={tasks.join(", ")} aria-label={`${tasks.length} outstanding`}>
        {tasks.length}
      </span>
    </StatusPill>
  );
}

const SEVERITY_STYLES: Record<string, StatusTone> = {
  minor: "neutral",
  moderate: "progress",
  serious: "danger",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <StatusPill tone={SEVERITY_STYLES[severity] ?? "neutral"}>
      {humanizeStatus(severity)}
    </StatusPill>
  );
}
