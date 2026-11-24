import { escapeLikePattern, pageRange, quoteOrValue } from "@/lib/pagination";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { deliveryAddress } from "@/lib/notifications/delivery-address";
import type { DeliveryLogParams } from "./delivery-log-params";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type DeliveryLogEntry = {
  id: string;
  kind: string;
  dedupe_key: string;
  status: string;
  skip_reason: string | null;
  provider_message_id: string | null;
  provider_event: string | null;
  provider_event_at: string | null;
  provider_event_detail: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  person_id: string | null;
  /**
   * The recipient's directory record, resolved separately rather than embedded
   * (see below). Null when the send was addressed to an inbox rather than a
   * person -- and also when the reader cannot see the directory, which is
   * possible: this page gates on `administration:manage`, and `people`'s own
   * policy asks for `people:view`. The seeded admin role holds both, but a
   * tenant is free to build one that does not, and a missing name is a better
   * outcome there than a failed page.
   */
  person: {
    id: string;
    name: string | null;
    preferred_name: string | null;
    email: string | null;
    notification_email: string | null;
  } | null;
};

/**
 * The recipient search, resolved to people ids before the ledger is queried.
 *
 * `notification_deliveries` holds no address and no name -- only `person_id`
 * -- so "find what we sent to Alex" has to become "find Alex, then find their
 * deliveries". Doing it in two steps rather than as an embedded filter keeps
 * the ledger query a plain one-table read, which is what the tenant/created_at
 * index serves; an `!inner` embed would make the join decide the plan and the
 * sort.
 *
 * Both address columns are searched, because `notification_email` is where a
 * person's mail actually goes when they have set one (#1042) and is the more
 * likely thing to be pasted into this box from a provider's dashboard.
 *
 * An empty result is meaningful and is returned as an empty array, not as
 * "no filter": nobody matched, so nothing was sent to them.
 */
async function personIdsMatching(
  supabase: ServerClient,
  term: string,
): Promise<string[] | null> {
  const pattern = quoteOrValue(`%${escapeLikePattern(term)}%`);
  const { data, error } = await supabase
    .from("people")
    .select("id")
    .or(
      [
        `name.ilike.${pattern}`,
        `preferred_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `notification_email.ilike.${pattern}`,
      ].join(","),
    )
    .limit(500);

  if (error) return null;
  return (data ?? []).map((row) => row.id as string);
}

/** The directory rows for one page of the ledger, in one round trip. */
async function peopleById(supabase: ServerClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, DeliveryLogEntry["person"]>();
  const { data } = await supabase
    .from("people")
    .select("id, name, preferred_name, email, notification_email")
    .in("id", ids);
  return new Map(
    (data ?? []).map((row) => [
      row.id as string,
      row as NonNullable<DeliveryLogEntry["person"]>,
    ]),
  );
}

export async function fetchDeliveryLogEntries(
  supabase: ServerClient,
  filters: DeliveryLogParams,
) {
  let query = supabase
    .from("notification_deliveries")
    .select(
      "id, kind, dedupe_key, status, skip_reason, provider_message_id, provider_event, provider_event_at, provider_event_detail, error, created_at, sent_at, person_id",
      { count: "exact" },
    )
    .order(filters.sort, { ascending: filters.dir === "asc" })
    // A stable tiebreaker, so a page boundary does not shuffle rows that share
    // a timestamp -- a digest run writes a great many within the same second.
    .order("id", { ascending: true });

  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.kind !== "all") query = query.eq("kind", filters.kind);
  if (filters.record)
    query = query.ilike("dedupe_key", `%${escapeLikePattern(filters.record)}%`);
  if (filters.from)
    query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to)
    query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);

  if (filters.recipient) {
    const ids = await personIdsMatching(supabase, filters.recipient);
    // A failed lookup must not quietly widen the search to everybody: an
    // unreadable directory means this filter cannot be honoured, and showing
    // the whole tenant's mail under a recipient's name would be a worse answer
    // than none.
    query = query.in("person_id", ids ?? []);
  }

  const { offset, to } = pageRange(filters.page, filters.perPage);
  const { data, error, count } = await query.range(offset, to);

  const rows = (data ?? []) as Omit<DeliveryLogEntry, "person">[];
  const directory = await peopleById(supabase, [
    ...new Set(
      rows
        .map((row) => row.person_id)
        .filter((id): id is string => id !== null),
    ),
  ]);

  const entries: DeliveryLogEntry[] | null = error
    ? null
    : rows.map((row) => ({
        ...row,
        person: (row.person_id && directory.get(row.person_id)) || null,
      }));

  return { entries, error, count };
}

/** Where this row's mail was actually addressed, when the reader can see it. */
export function entryAddress(entry: DeliveryLogEntry): string | null {
  return entry.person ? deliveryAddress(entry.person) : null;
}
