import { publicWrite, unwrap } from "@/lib/api/handler";
import { personAnswersSchema } from "@/lib/api/schemas";

/**
 * Answer the organization's profile questions after registering (#1746):
 * the site's registration step 2, for a headless consumer.
 *
 * Keyed by question key, because the questions' ids are not readable from
 * outside. The registration id is the credential, for a day, and the form is
 * never pre-filled, so a question left out keeps the stored answer --
 * `save_registrant_person_answers()` decides all of it.
 */
const route = publicWrite(
  personAnswersSchema,
  async ({ supabase, body, clientIp }) => {
    unwrap(
      await supabase.rpc("save_registrant_person_answers_by_key", {
        p_registration_id: body.registration_id,
        p_answers: body.answers,
        p_ip_address: clientIp,
      }),
    );

    return { saved: true };
  },
);

export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
