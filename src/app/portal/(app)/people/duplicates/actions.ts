"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  MERGEABLE_FIELDS,
  type DuplicatePerson,
  type MergeActionResult,
  type MergeBlocker,
  type MergeableField,
  type MergePreviewRow,
} from "./merge-shared";

export async function listDuplicatePeopleAction(): Promise<
  { data: DuplicatePerson[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("find_duplicate_people");
  if (error) return { error: "Could not load duplicates. Please try again." };
  return { data: (data ?? []) as DuplicatePerson[] };
}

/**
 * The two records under review, fetched by id rather than filtered out of
 * find_duplicate_people(): once the unique index is on (20260904190000) that
 * list is empty by definition, and merging stays useful for the case the index
 * cannot catch -- one person who used two different addresses.
 */
export async function getMergeCandidatesAction(
  ids: string[],
): Promise<{ data: DuplicatePerson[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("people")
    .select(
      "id, name, preferred_name, person_type, email, auth_user_id, has_portal_access, created_at, phone, pronouns, instagram_handle, notes, logo_url, website, source_type, address_line1, address_line2, address_city, address_region, address_postal_code, address_country",
    )
    .in("id", ids);
  if (error) return { error: "Could not load these records." };
  return {
    data: (data ?? []).map((row) => ({
      ...row,
      email_key: (row.email ?? "").toLowerCase(),
    })) as DuplicatePerson[],
  };
}

export async function getMergeBlockersAction(
  survivorId: string,
  duplicateId: string,
): Promise<{ data: MergeBlocker[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("person_merge_blockers", {
    p_survivor_id: survivorId,
    p_duplicate_id: duplicateId,
  });
  // The RPC raises readable text for the not-found / same-person cases.
  if (error) return { error: error.message || "Could not check this merge." };
  return { data: (data ?? []) as MergeBlocker[] };
}

export async function getMergePreviewAction(
  survivorId: string,
  duplicateId: string,
): Promise<{ data: MergePreviewRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("person_merge_preview", {
    p_survivor_id: survivorId,
    p_duplicate_id: duplicateId,
  });
  if (error) return { error: error.message || "Could not preview this merge." };
  return { data: (data ?? []) as MergePreviewRow[] };
}

export async function mergePeopleAction(
  survivorId: string,
  duplicateId: string,
  overrides: Partial<Record<MergeableField, string | null>> = {},
): Promise<MergeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to merge people.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return permissionError;

  // Drop anything not on the allowlist, and anything empty -- merge_people
  // coalesces a missing key to the survivor's own value, which is what an
  // unanswered field should mean.
  const safeOverrides: Record<string, string> = {};
  for (const field of MERGEABLE_FIELDS) {
    const value = overrides[field];
    if (typeof value === "string" && value.trim() !== "") {
      safeOverrides[field] = value;
    }
  }

  const { error } = await supabase.rpc("merge_people", {
    p_survivor_id: survivorId,
    p_duplicate_id: duplicateId,
    p_field_overrides: safeOverrides,
  });
  if (error) {
    // merge_people raises actionable text for every refusal (two portal
    // accounts, a shared event, an unreconcilable collision); pass it through
    // rather than flattening it, as linkPersonToAuthUserAction does.
    return { error: error.message || "Could not merge these records." };
  }

  revalidatePath("/portal/people");
  revalidatePath("/portal/people/duplicates");
  revalidatePath(`/portal/people/${survivorId}`);
  return { success: true };
}
