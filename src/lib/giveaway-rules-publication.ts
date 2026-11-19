import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ORG_TIME_ZONE } from "@/lib/org-timezone";
import type { GiveawayRulesDocument } from "@/lib/giveaway-rules-template";
import { reportQueryError } from "@/lib/observability/query-error";

/**
 * What the public site serves for a promotion's official rules (#1322).
 *
 * The read, kept out of `@/lib/giveaway-rules.ts` for the reason
 * `@/lib/legal-publication.ts` is kept out of `@/lib/legal-documents.ts`: the
 * registry and the template reach the client bundle and this must not.
 *
 * Every version is readable, not only the newest. The rules in force when
 * somebody entered are what governs their entry, so an entrant has to be able
 * to find them after a correction -- and the rules themselves say so, in
 * "General conditions". A promotion with no published version has no page at
 * all and 404s, the same stance #859 takes on a legal document nobody adopted.
 */

export type PublishedGiveawayRules = {
  version: number;
  effective_at: string;
  content: GiveawayRulesDocument;
};

/** A stored document, checked before it is rendered as one. */
function isGiveawayRulesDocument(
  value: unknown,
): value is GiveawayRulesDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<GiveawayRulesDocument>;
  return (
    typeof doc.title === "string" &&
    Array.isArray(doc.summary) &&
    Array.isArray(doc.sections) &&
    doc.sections.every(
      (section) =>
        typeof section?.id === "string" &&
        typeof section?.title === "string" &&
        Array.isArray(section?.paragraphs),
    )
  );
}

/**
 * Every published version of one promotion's rules, newest first.
 *
 * Read through `public_giveaway_rules`, which answers for the **request
 * host's** tenant. A giveaway id from another tenant therefore returns
 * nothing, which is what makes a guessed uuid a 404 rather than a leak.
 */
export const getPublishedGiveawayRules = cache(
  async (
    supabase: SupabaseClient,
    giveawayId: string,
  ): Promise<PublishedGiveawayRules[]> => {
    const { data, error } = await supabase
      .from("public_giveaway_rules")
      .select("version, effective_at, content")
      .eq("giveaway_id", giveawayId)
      .order("version", { ascending: false });

    // Loud, and empty: a promotion whose rules cannot be read serves no rules
    // rather than stale or partial ones, and an unreadable view looks exactly
    // like a promotion nobody has published.
    if (error) {
      reportQueryError(error, {
        source: "giveaway-rules.public_giveaway_rules",
        message:
          "could not read public_giveaway_rules; serving no rules for this promotion",
      });
      return [];
    }

    return (data ?? [])
      .filter((row) => isGiveawayRulesDocument(row.content))
      .map((row) => {
        const content = row.content as GiveawayRulesDocument;
        return {
          version: Number(row.version),
          effective_at: String(row.effective_at),
          // A version published before the document carried its zone (or one
          // whose zone did not survive a round trip) renders in UTC rather
          // than in whatever zone the rendering process happens to be in --
          // labelled either way, so the reader is never guessing.
          content: {
            ...content,
            time_zone: content.time_zone || DEFAULT_ORG_TIME_ZONE,
          },
        };
      });
  },
);

/** The version asked for, or the one in force. Undefined when there is none. */
export function selectGiveawayRulesVersion(
  versions: readonly PublishedGiveawayRules[],
  requested?: string | number | null,
): PublishedGiveawayRules | undefined {
  if (requested === undefined || requested === null || requested === "") {
    return versions[0];
  }
  const wanted = Number(requested);
  if (!Number.isInteger(wanted)) return undefined;
  return versions.find((version) => version.version === wanted);
}

/**
 * Whether the promotion at an event has published rules, and which promotion
 * that is -- so the event's public page can link to them (#666 requires the
 * rules to sit in the flow they govern rather than only in a footer).
 *
 * Returns null when the event has no giveaway, or has one whose rules nobody
 * has published. The view exposes the event id and nothing else about the
 * giveaway, so this cannot become a way to learn that an unpublished promotion
 * exists.
 */
export const getEventGiveawayRulesLink = cache(
  async (
    supabase: SupabaseClient,
    eventId: string,
  ): Promise<{ giveawayId: string } | null> => {
    const { data, error } = await supabase
      .from("public_giveaway_rules")
      .select("giveaway_id")
      .eq("event_id", eventId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return { giveawayId: String(data.giveaway_id) };
  },
);
