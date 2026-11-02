import { publicWrite, unwrap } from "@/lib/api/handler";
import { riderProfileSchema } from "@/lib/api/schemas";

/**
 * Attach a rider profile to a registration made in the last day.
 *
 * The registration id is the credential, and `save_registrant_rider_profile()`
 * refuses one older than a day -- so this is an extra question asked right
 * after registering, not a profile anybody can edit later.
 *
 * Kept as v1 (#1746): the function maps the four fields onto the profile
 * questions keyed `riding_discipline`, `ski_level`, `snowboard_level` and
 * `preferred_mountain`, and answers `RIDER_PROFILE_GONE` (410) where the
 * organization does not ask all four. `/person-answers` is the general route.
 */
const route = publicWrite(
  riderProfileSchema,
  async ({ supabase, body, clientIp }) => {
    unwrap(
      await supabase.rpc("save_registrant_rider_profile", {
        p_registration_id: body.registration_id,
        p_riding_discipline: body.riding_discipline,
        p_ski_experience_level: body.ski_experience_level ?? null,
        p_snowboard_experience_level: body.snowboard_experience_level ?? null,
        p_preferred_mountain: body.preferred_mountain ?? null,
        p_ip_address: clientIp,
      }),
    );

    return { saved: true };
  },
);

export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
