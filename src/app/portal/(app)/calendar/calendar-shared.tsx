import { personDisplayName } from "@/lib/format";
import type { PersonSelectOption } from "../people/person-select";
import type { ContentPieceRow } from "@/lib/social-content/pieces";

export const ITEM_TYPES = [
  { value: "own_event", label: "Our own event" },
  { value: "partner_event", label: "Partner / co-hosted event" },
  { value: "community_observance", label: "Community observance" },
  {
    value: "heritage_social_justice_moment",
    label: "Heritage / social justice moment",
  },
  {
    value: "winter_outdoor_sports_moment",
    label: "Winter / outdoor sports moment",
  },
  { value: "content_campaign", label: "Content campaign" },
  { value: "fundraiser", label: "Fundraiser / donation drive" },
  { value: "partner_opportunity", label: "Partner opportunity" },
  { value: "content_opportunity", label: "Content opportunity" },
] as const;

/**
 * A category as this tenant words it, read from `calendar_categories` (#834).
 *
 * This was a six-entry constant, which meant every tenant's portal offered one
 * organization's vocabulary. It carries `value`/`label` rather than
 * `key`/`label` so it drops straight into `labelFor()` and the option lists
 * beside ITEM_TYPES, PRIORITY_TIERS and the rest, which are still the
 * platform's to define and stay constants.
 */
export type CalendarCategory = { value: string; label: string };

export const PRIORITY_TIERS = [
  { value: "1", label: "Tier 1" },
  { value: "2", label: "Tier 2" },
  { value: "3", label: "Tier 3" },
] as const;

export const CALENDAR_STATUSES = [
  { value: "idea", label: "Idea" },
  { value: "active", label: "Active" },
  { value: "complete", label: "Complete" },
  { value: "archived", label: "Archived" },
] as const;

export const VISIBILITIES = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "unlisted_draft", label: "Unlisted draft" },
] as const;

export const DECISIONS = [
  { value: "plan", label: "Plan" },
  { value: "skip", label: "Skip" },
  { value: "defer", label: "Defer" },
] as const;

export const RANGES = [
  { value: "all", label: "All upcoming" },
  { value: "30", label: "Next 30 days" },
  { value: "60", label: "Next 60 days" },
  { value: "90", label: "Next 90 days" },
] as const;

type Option = { value: string; label: string };

export function labelFor(
  options: readonly Option[],
  value: string | null | undefined,
): string {
  return (
    options.find((option) => option.value === value)?.label ?? value ?? "—"
  );
}

export type CalendarItemRow = {
  id: string;
  title: string;
  item_type: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
  recurrence_rule: string | null;
  summary: string | null;
  priority_tier: number;
  priority_rationale: string | null;
  calendar_status: string;
  visibility: string;
  owner_id: string | null;
  decision: string | null;
  decision_note: string | null;
  source: string | null;
  region: string | null;
  exceptions: unknown[];
  is_sensitive_topic: boolean;
  tone_guidance: string | null;
  series_key: string | null;
  recurrence_start_month: number | null;
  recurrence_start_day: number | null;
  recurrence_end_month: number | null;
  recurrence_end_day: number | null;
  recurrence_end_is_month_end: boolean;
  categories: string[];
  program_ids: string[];
  /** The posts and stories planned for this item -- several per item since #1231. */
  content_pieces: ContentPieceRow[];
};

/**
 * A person eligible to own a calendar item: a People row linked to a portal
 * account holding admin or event_coordinator (see list_calendar_owners()).
 *
 * Carries auth_user_id as well as person_id because the calendar's owner
 * columns reference public.people while a content piece's audit stamp
 * (content_opportunities.status_changed_by) deliberately still references
 * auth.users -- one array resolves both, see ownerName vs. calendarActorName
 * below.
 */
export type CalendarOwner = {
  person_id: string;
  auth_user_id: string | null;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
};
export type CalendarProgram = { id: string; name: string; status: string };

export function needsDecision(
  item: Pick<CalendarItemRow, "priority_tier" | "decision" | "calendar_status">,
): boolean {
  return (
    item.priority_tier === 1 &&
    !item.decision &&
    item.calendar_status !== "archived"
  );
}

export function isPastUndecided(
  item: Pick<CalendarItemRow, "starts_at" | "decision" | "calendar_status">,
  now: Date = new Date(),
): boolean {
  return (
    new Date(item.starts_at) < now &&
    !item.decision &&
    item.calendar_status !== "complete" &&
    item.calendar_status !== "archived"
  );
}

/**
 * Adapts the owner list to PersonSelect's structural option type, whose id
 * field is `id` rather than `person_id`.
 */
export function ownerOptions(owners: CalendarOwner[]): PersonSelectOption[] {
  return owners.map((owner) => ({
    id: owner.person_id,
    name: owner.name,
    preferred_name: owner.preferred_name,
    email: owner.email,
  }));
}

/** Resolves a people id -- an owner or reviewer -- to a display name. */
export function ownerName(
  owners: CalendarOwner[],
  personId: string | null,
  fallback = "—",
): string {
  if (!personId) return fallback;
  return personDisplayName(
    owners.find((owner) => owner.person_id === personId),
    fallback,
  );
}

/**
 * Resolves an auth.users id -- an audit stamp such as status_changed_by --
 * to a display name, using the same array.
 */
export function calendarActorName(
  owners: CalendarOwner[],
  authUserId: string | null,
  fallback = "—",
): string {
  if (!authUserId) return fallback;
  return personDisplayName(
    owners.find((owner) => owner.auth_user_id === authUserId),
    fallback,
  );
}
