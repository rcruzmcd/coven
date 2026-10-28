import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether registration asks about under-18s on the tenant the request host
 * resolves to (#1416).
 *
 * True on a failed read. Asking is today's behaviour and every tenant's
 * default, and the RPC reads the setting itself, so a form that asks when the
 * tenant has turned it off only collects answers the RPC then discards.
 */
export async function getPublicAsksAboutMinors(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("public_registration_settings")
    .select("asks_about_minors")
    .maybeSingle();
  if (error || !data) return true;
  return data.asks_about_minors !== false;
}

/**
 * Whether the tenant the request host resolves to requires an Instagram handle
 * or a preferred contact at registration (#1647).
 *
 * False on a failed read: off is every tenant's default, and the RPC reads the
 * setting itself, so a form that does not ask on a tenant that requires it is
 * refused with a message rather than registering without it.
 */
export async function getPublicRequiresInstagram(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("public_registration_settings")
    .select("requires_instagram")
    .maybeSingle();
  if (error || !data) return false;
  return data.requires_instagram === true;
}

/**
 * The current tenant's Instagram requirement (#1647), for the portal switch.
 * Null when the caller may not change it (events:manage).
 */
export async function getRegistrationRequiresInstagram(
  supabase: SupabaseClient,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("registration_requires_instagram");
  if (error || typeof data !== "boolean") return null;
  return data;
}

/**
 * The current tenant's service area (#1699): the states, counties and
 * boroughs whose places its place questions suggest first. Null when the
 * caller may not change it (events:manage).
 */
export async function getRegistrationServiceArea(
  supabase: SupabaseClient,
): Promise<{ id: string; kind: string; label: string }[] | null> {
  const { data, error } = await supabase.rpc("registration_service_area");
  if (error || !Array.isArray(data)) return null;
  return data.flatMap((item) =>
    item &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.label === "string"
      ? [{ id: item.id, kind: String(item.kind ?? ""), label: item.label }]
      : [],
  );
}

/**
 * The current tenant's setting, for the portal switch (#1416). Null when the
 * caller may not change it (events:manage).
 */
export async function getRegistrationAsksAboutMinors(
  supabase: SupabaseClient,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("registration_asks_about_minors");
  if (error || typeof data !== "boolean") return null;
  return data;
}

/**
 * The current tenant's Event media uploads setting (#1606), for the Events
 * page switch. Null when the caller may not read it (events:view).
 */
export async function getEventMediaUploadsEnabled(
  supabase: SupabaseClient,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("event_media_uploads_enabled");
  if (error || typeof data !== "boolean") return null;
  return data;
}

/**
 * The current tenant's Public event gallery setting (#1654), for the Events
 * page's Media sheet. Null when the caller may not read it (events:view).
 */
export async function getEventPublicGalleryEnabled(
  supabase: SupabaseClient,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("event_public_gallery_enabled");
  if (error || typeof data !== "boolean") return null;
  return data;
}

/**
 * The current tenant's event media retention period (#1608), for the Events
 * page's Media sheet: `{ days: null }` is "keep indefinitely". Null when the
 * caller may not read it.
 */
export async function getEventMediaRetentionDays(
  supabase: SupabaseClient,
): Promise<{ days: number | null } | null> {
  const { data, error } = await supabase.rpc("event_media_retention_days");
  if (error) return null;
  return { days: typeof data === "number" ? data : null };
}
