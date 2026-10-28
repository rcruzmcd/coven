import { ApiError } from "@/lib/api/errors";
import { publicRead, unwrap } from "@/lib/api/handler";
import { toRegistrationQuestion } from "@/lib/registration-questions";

/** One published event. A draft, a private one, or another tenant's is a 404. */
const route = publicRead<{ tenant: string; event: string }>(
  async ({ supabase, params }) => {
    const event = unwrap(
      await supabase
        .from("public_events")
        .select(
          "id, name, location, starts_at, ends_at, timezone, description, capacity, registration_enabled, registration_deadline, flier_url, adults_only",
        )
        .eq("id", params.event)
        .maybeSingle(),
    );

    if (!event) throw new ApiError("not_found", "No such published event.");

    const [sponsors, programs, options, questions] = await Promise.all([
      supabase
        .from("public_event_sponsors")
        .select("sponsor_id, name, logo_url, website")
        .eq("event_id", params.event),
      supabase
        .from("public_event_programs")
        .select("program_id, name")
        .eq("event_id", params.event),
      // #1407
      supabase
        .from("public_event_registration_options")
        .select("id, label, prompt, is_full")
        .eq("event_id", params.event)
        .order("sort_order", { ascending: true }),
      // #1501
      supabase
        .from("public_event_registration_questions")
        .select(
          "id, kind, prompt, help, required, options, min_value, max_value, show_if, place_granularity, place_allow_other",
        )
        .eq("event_id", params.event)
        .order("sort_order", { ascending: true }),
    ]);

    const optionRows = unwrap(options) ?? [];

    return {
      event: {
        ...event,
        sponsors: unwrap(sponsors) ?? [],
        programs: unwrap(programs) ?? [],
        registration_options:
          optionRows.length > 0 && optionRows[0].prompt
            ? {
                prompt: optionRows[0].prompt,
                options: optionRows.map(({ id, label, is_full }) => ({
                  id: id as string,
                  label: label as string,
                  is_full: is_full === true,
                })),
              }
            : null,
        registration_questions: (unwrap(questions) ?? []).flatMap((row) => {
          const question = toRegistrationQuestion(row);
          return question ? [question] : [];
        }),
      },
    };
  },
);

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
