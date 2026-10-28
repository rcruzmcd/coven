"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";

export type RegistrationSettingsResult = { error: string } | { success: true };

/**
 * Turns this organization's under-18 registration questions on or off
 * (#1416).
 *
 * Gated on events:manage and written through
 * set_registration_asks_about_minors(), which checks the same permission
 * again -- app_settings' own write policy is system_settings:manage, and this
 * setting lives with the feature it shapes.
 */
export async function updateAsksAboutMinorsAction(
  enabled: boolean,
): Promise<RegistrationSettingsResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change registration settings.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("set_registration_asks_about_minors", {
    p_enabled: enabled,
  });
  if (error) {
    return {
      error:
        error.message === "PERMISSION_DENIED"
          ? "You don't have permission to change registration settings."
          : "Could not save the setting. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  // The public form reads the setting per request; nothing public is cached on it.
  return { success: true };
}

const SERVICE_AREA_ERRORS: Record<string, string> = {
  PERMISSION_DENIED:
    "You don't have permission to change registration settings.",
  SERVICE_AREA_TOO_LARGE: "A service area can list at most 50 places.",
  SERVICE_AREA_INVALID:
    "A service area can only list states, counties and boroughs.",
};

/**
 * Replaces this organization's service area (#1699): the states, counties
 * and boroughs whose places a place question suggests first. Gated like the
 * settings above, and for their reason.
 */
export async function updateServiceAreaAction(
  placeIds: string[],
): Promise<RegistrationSettingsResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change registration settings.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  if (
    !Array.isArray(placeIds) ||
    placeIds.some((id) => typeof id !== "string")
  ) {
    return { error: SERVICE_AREA_ERRORS.SERVICE_AREA_INVALID };
  }

  const { error } = await supabase.rpc("set_registration_service_area", {
    p_place_ids: placeIds,
  });
  if (error) {
    return {
      error:
        SERVICE_AREA_ERRORS[error.message] ??
        "Could not save the setting. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * Turns this organization's Instagram-or-preferred-contact requirement on or
 * off (#1647). Gated like the setting above, and for its reason.
 */
export async function updateRequiresInstagramAction(
  enabled: boolean,
): Promise<RegistrationSettingsResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change registration settings.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("set_registration_requires_instagram", {
    p_enabled: enabled,
  });
  if (error) {
    return {
      error:
        error.message === "PERMISSION_DENIED"
          ? "You don't have permission to change registration settings."
          : "Could not save the setting. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
