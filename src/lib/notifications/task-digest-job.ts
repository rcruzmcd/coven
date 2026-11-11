import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverEmail } from "@/lib/notifications/deliver";
import {
  tenantMailContext,
  type TenantMailContext,
} from "@/lib/email/identity";
import { activeTenantIds } from "@/lib/notifications/active-tenants";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { renderTaskDigest } from "@/lib/notifications/task-digest-email";
import {
  dedupeKeyFor,
  digestHref,
  eventGroup,
  groupForDigest,
  meetingGroup,
  type DigestPerson,
  type DigestRecipient,
  type DigestSourceRow,
} from "@/lib/notifications/task-digest";

/**
 * The daily task digest run (#488): read, gate, record, send.
 *
 * Lives here rather than in the route handler so the interesting half can be
 * driven from an integration test with a real database and a fake clock,
 * without going through HTTP or the cron secret. The route is the doorman.
 *
 * Runs on the service-role client, which bypasses RLS. Everything this file
 * does about tenants -- reading the switch per tenant, grouping per tenant,
 * writing tenant_id explicitly -- is therefore load-bearing rather than
 * defensive: there is no policy underneath it to catch a mistake. Every source
 * below reads `tenant_id` off the task row itself, and each owner column is a
 * composite foreign key onto `people (tenant_id, id)`, so a task and its owner
 * are always in the same tenant.
 */

export const TASK_DIGEST_KIND = "task_digest";

export type DigestRunSummary = {
  /** Tenants with at least one candidate recipient. */
  tenants: number;
  /** Recipients with qualifying items, before the gates. */
  considered: number;
  sent: number;
  /**
   * Tenant not active, muted by the org switch, opted out, or already
   * recorded for today.
   */
  skipped: number;
  failed: number;
};

export async function runTaskDigest(
  admin: SupabaseClient,
  options: { now?: Date; siteUrl: string },
): Promise<DigestRunSummary> {
  const now = options.now ?? new Date();
  const dedupeKey = dedupeKeyFor(now);
  const summary: DigestRunSummary = {
    tenants: 0,
    considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  const rows = await fetchOpenTasks(admin);
  if (rows.length === 0) return summary;

  const people = await fetchRecipients(
    admin,
    unique(rows.map((row) => row.owner_person_id)),
  );
  if (people.length === 0) return summary;

  const recipients = groupForDigest(rows, people, now);
  summary.considered = recipients.length;
  if (recipients.length === 0) return summary;

  const optedIn = await fetchOptedIn(
    admin,
    unique(recipients.map((r) => r.personId)),
  );

  // Grouped by tenant so the switch is read once per tenant rather than once
  // per person, and so a muted tenant costs nothing further.
  const byTenant = new Map<string, DigestRecipient[]>();
  for (const recipient of recipients) {
    const list = byTenant.get(recipient.tenantId) ?? [];
    list.push(recipient);
    byTenant.set(recipient.tenantId, list);
  }
  summary.tenants = byTenant.size;

  // Once per run, not per tenant (#1674). A suspended or archived tenant's
  // portal is unreachable, so its digest would link nowhere.
  const active = await activeTenantIds(admin, "[task-digest]");

  for (const [tenantId, tenantRecipients] of byTenant) {
    if (!active.has(tenantId) || !(await isOrgEmailEnabled(admin, tenantId))) {
      summary.skipped += tenantRecipients.length;
      continue;
    }

    // Beside the switch, and after it: one lookup per tenant, and a muted
    // tenant costs nothing further (#857). It answers the origin too, so this
    // tenant's recipients are linked to this tenant's site (#860).
    const mail = await tenantMailContext(admin, tenantId, {
      fallbackOrigin: options.siteUrl,
    });

    for (const recipient of tenantRecipients) {
      if (!optedIn.has(preferenceKey(recipient.tenantId, recipient.personId))) {
        summary.skipped += 1;
        continue;
      }
      await deliver(admin, recipient, mail, dedupeKey, summary);
    }
  }

  return summary;
}

/**
 * Records the outcome of one recipient's digest against the run summary.
 *
 * The claim-then-send mechanics moved to deliverEmail() when #742 added a
 * second sender; what stays here is the only part that is the digest's own --
 * how an outcome reads in DigestRunSummary.
 */
async function deliver(
  admin: SupabaseClient,
  recipient: DigestRecipient,
  mail: TenantMailContext,
  dedupeKey: string,
  summary: DigestRunSummary,
): Promise<void> {
  const outcome = await deliverEmail(admin, {
    tenantId: recipient.tenantId,
    identity: mail.identity,
    personId: recipient.personId,
    kind: TASK_DIGEST_KIND,
    dedupeKey,
    to: recipient.email,
    render: () =>
      renderTaskDigest(recipient, mail.origin, {
        orgName: mail.displayName,
        branding: mail.branding,
      }),
    logPrefix: "[task-digest]",
  });

  if (outcome === "sent") summary.sent += 1;
  else if (outcome === "skipped") summary.skipped += 1;
  else summary.failed += 1;
}

/**
 * Every open, owned task across the sources, in parallel. A source that fails
 * to read is logged and left out rather than sinking the others: a digest
 * missing its checklist items is better than no digest at all.
 */
async function fetchOpenTasks(
  admin: SupabaseClient,
): Promise<DigestSourceRow[]> {
  const sources = await Promise.all([
    fetchOpenActionItems(admin),
    fetchOpenChecklistItems(admin),
    fetchOpenRetroActions(admin),
    fetchOpenSponsorFollowUps(admin),
  ]);
  return sources.flat();
}

type EventRef = { id: string; name: string; starts_at: string };
const EVENT_FIELDS = "event:events!inner(id, name, starts_at)";

async function fetchOpenActionItems(
  admin: SupabaseClient,
): Promise<DigestSourceRow[]> {
  const { data, error } = await admin
    .from("governance_meeting_action_items")
    .select(
      "id, tenant_id, description, due_date, owner_person_id, meeting:governance_meetings!inner(id, meeting_date, meeting_type)",
    )
    .eq("status", "open");

  if (error) {
    console.error("[task-digest] could not read action items", error);
    return [];
  }
  type Row = {
    id: string;
    tenant_id: string;
    description: string;
    due_date: string | null;
    owner_person_id: string;
    meeting: { id: string; meeting_date: string; meeting_type: string };
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    kind: "action_item",
    id: row.id,
    tenant_id: row.tenant_id,
    owner_person_id: row.owner_person_id,
    title: row.description,
    due_date: row.due_date,
    href: digestHref("action_item", row.meeting.id),
    group: meetingGroup(row.meeting),
  }));
}

async function fetchOpenChecklistItems(
  admin: SupabaseClient,
): Promise<DigestSourceRow[]> {
  const { data, error } = await admin
    .from("event_checklist_items")
    .select(`id, tenant_id, title, due_date, owner_person_id, ${EVENT_FIELDS}`)
    .eq("is_done", false)
    .not("owner_person_id", "is", null);

  if (error) {
    console.error("[task-digest] could not read checklist items", error);
    return [];
  }
  type Row = {
    id: string;
    tenant_id: string;
    title: string;
    due_date: string | null;
    owner_person_id: string;
    event: EventRef;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    kind: "checklist",
    id: row.id,
    tenant_id: row.tenant_id,
    owner_person_id: row.owner_person_id,
    title: row.title,
    due_date: row.due_date,
    href: digestHref("checklist", row.event.id),
    group: eventGroup(row.event),
  }));
}

/** Retro actions carry no due date, so they ride along on Mondays only. */
async function fetchOpenRetroActions(
  admin: SupabaseClient,
): Promise<DigestSourceRow[]> {
  const { data, error } = await admin
    .from("event_retro_items")
    .select(`id, tenant_id, body, owner_person_id, ${EVENT_FIELDS}`)
    .eq("kind", "action")
    .eq("status", "open")
    .not("owner_person_id", "is", null);

  if (error) {
    console.error("[task-digest] could not read retro actions", error);
    return [];
  }
  type Row = {
    id: string;
    tenant_id: string;
    body: string;
    owner_person_id: string;
    event: EventRef;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    kind: "retro_action",
    id: row.id,
    tenant_id: row.tenant_id,
    owner_person_id: row.owner_person_id,
    title: row.body,
    due_date: null,
    href: digestHref("retro_action", row.event.id),
    group: eventGroup(row.event),
  }));
}

async function fetchOpenSponsorFollowUps(
  admin: SupabaseClient,
): Promise<DigestSourceRow[]> {
  const { data, error } = await admin
    .from("event_sponsors")
    .select(
      `id, tenant_id, follow_up_due_date, follow_up_owner_person_id, person:people!event_sponsors_person_id_fkey(name), ${EVENT_FIELDS}`,
    )
    .neq("follow_up_status", "done")
    .not("follow_up_owner_person_id", "is", null);

  if (error) {
    console.error("[task-digest] could not read sponsor follow-ups", error);
    return [];
  }
  type Row = {
    id: string;
    tenant_id: string;
    follow_up_due_date: string | null;
    follow_up_owner_person_id: string;
    person: { name: string | null } | null;
    event: EventRef;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    kind: "sponsor_follow_up",
    id: row.id,
    tenant_id: row.tenant_id,
    owner_person_id: row.follow_up_owner_person_id,
    // The Events list's wording, so the two name the task the same way.
    title: `Follow up with ${row.person?.name ?? "sponsor"}`,
    due_date: row.follow_up_due_date,
    href: digestHref("sponsor_follow_up", row.event.id),
    group: eventGroup(row.event),
  }));
}

/**
 * Only people who can act on the link. An email address is not enough: the
 * digest links into the portal, so it is meaningless to a donor or sponsor row
 * that has no account, and `people` is full of those.
 */
async function fetchRecipients(
  admin: SupabaseClient,
  personIds: string[],
): Promise<DigestPerson[]> {
  if (personIds.length === 0) return [];

  const { data, error } = await admin
    .from("people")
    .select("id, tenant_id, email, notification_email, name, preferred_name")
    .in("id", personIds)
    .not("email", "is", null)
    .not("auth_user_id", "is", null);

  if (error) {
    console.error("[task-digest] could not read recipients", error);
    return [];
  }
  return (data ?? []) as DigestPerson[];
}

/** The set of (tenant, person) pairs that have opted in to this kind. */
async function fetchOptedIn(
  admin: SupabaseClient,
  personIds: string[],
): Promise<Set<string>> {
  const optedIn = new Set<string>();
  if (personIds.length === 0) return optedIn;

  const { data, error } = await admin
    .from("person_notification_preferences")
    .select("tenant_id, person_id")
    .eq("kind", TASK_DIGEST_KIND)
    .eq("enabled", true)
    .in("person_id", personIds);

  // Failing closed: an unreadable preference table means nobody has provably
  // opted in, and sending on a guess is the one mistake with no way back.
  if (error) {
    console.error(
      "[task-digest] could not read notification preferences; sending nothing",
      error,
    );
    return optedIn;
  }
  for (const row of data ?? []) {
    optedIn.add(
      preferenceKey(row.tenant_id as string, row.person_id as string),
    );
  }
  return optedIn;
}

function preferenceKey(tenantId: string, personId: string): string {
  return `${tenantId}:${personId}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
