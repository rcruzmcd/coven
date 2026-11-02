/**
 * Constants and types for the merge screens.
 *
 * Kept out of actions.ts because a "use server" module may only export async
 * functions -- exporting the field list from there is a build error, not just a
 * lint one.
 */

/**
 * The people columns a merge may take from either record. Mirrors the
 * allowlist in merge_people (20260904180000) -- the RPC is the enforcement,
 * this is the same list applied early so a bad key never reaches it.
 *
 * id, auth_user_id, created_by and the timestamps are deliberately absent:
 * merge_people is security definer, so accepting them would let any
 * people:manage holder rewrite identity and authorship.
 */
export const MERGEABLE_FIELDS = [
  "name",
  "preferred_name",
  "email",
  "phone",
  "pronouns",
  "instagram_handle",
  "notes",
  "logo_url",
  "website",
  "person_type",
  "source_type",
  "address_line1",
  "address_line2",
  "address_city",
  "address_region",
  "address_postal_code",
  "address_country",
] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

export type MergeActionResult = { error: string } | { success: true };

export type DuplicatePerson = {
  email_key: string;
  id: string;
  name: string | null;
  preferred_name: string | null;
  person_type: string;
  email: string | null;
  auth_user_id: string | null;
  /** Whether that account holds a role in this tenant (#1192). */
  has_portal_access?: boolean | null;
  created_at: string;
};

export type MergeBlocker = {
  kind: "blocker" | "advisory";
  table_name: string;
  detail: string;
};

export type MergePreviewRow = {
  table_name: string;
  column_name: string;
  survivor_count: number;
  duplicate_count: number;
};
