import { z } from "zod";
import { BRAND_TOKENS } from "@/lib/branding";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { PUBLIC_PAGE_SLOTS } from "@/lib/page-visibility";
import { LAYOUT_SLOTS } from "@/lib/site-layout";
import { SITE_CONTENT_SLOTS, type ContentSlot } from "@/lib/site-content";

/**
 * What each read of the public API answers (#813 Phase 3).
 *
 * These are not used to validate outbound responses -- serializing a list and
 * then parsing it back on every request would be a real cost for a document
 * that is already cached. They do two things instead:
 *
 * 1. `/api/v1/openapi.json` is generated from them, so the published contract
 *    is the same object the code holds rather than a second description
 *    somebody has to remember to update;
 * 2. `src/app/api/v1/public-api.integration.test.ts` calls every endpoint
 *    against a real stack and parses the answer with the schema beside it, so
 *    a handler that stops matching its own documentation fails a test rather
 *    than a consumer.
 *
 * Where a payload is genuinely free-form -- an article body, a content slot
 * whose shape depends on its type -- the schema says so rather than
 * pretending. `z.json()` is an honest "any JSON here"; a fake shape would be
 * worse than none.
 */

/** A `jsonb` column, served as it is stored. */
const json = z.json();

/**
 * The slot registries are the API's shape, not just its documentation (#888).
 *
 * `/content` and `/site` iterate these same arrays, so a slot added to a
 * registry appears in the response *and* in the published document in the same
 * commit. Generating the document from anywhere else -- a hand-kept list, the
 * rows that happen to exist in one tenant -- is how the two drift apart.
 */
function slotValueSchema(slot: ContentSlot): z.ZodType {
  switch (slot.type) {
    case "text":
      return z.string();
    case "paragraphs":
      return z.array(z.string());
    case "list":
      return z.array(z.record(z.string(), json));
    case "document":
      return z.union([z.record(z.string(), json), z.null()]);
    case "image":
      return z.union([z.string(), z.null()]);
  }
}

const contentSlots = z.object(
  Object.fromEntries(
    SITE_CONTENT_SLOTS.map((slot) => [
      slot.key,
      slotValueSchema(slot).meta({ description: slot.label }),
    ]),
  ),
);

/**
 * `brandingFromRows()`'s shape, not a map of every token: a tenant that has set
 * no colours has an empty `colors`, and that is the honest answer rather than a
 * dozen nulls. The registry still decides what *may* appear -- `BRAND_TOKENS`
 * is the reserved namespace's key list (#888), and `colors` can only hold keys
 * from it.
 */
const brandingSchema = z
  .object({
    // Partial, not exhaustive: a tenant that has set three colours has
    // three keys. `propertyNames` in the published schema still carries the
    // registry's whole list, so a consumer knows what may appear.
    colors: z.partialRecord(
      z.enum(BRAND_TOKENS as [string, ...string[]]),
      z.string(),
    ),
    accentStops: z.union([z.array(z.string()), z.null()]),
    logoUrl: z.union([z.string(), z.null()]),
  })
  .meta({ id: "Branding" });

const pagesSchema = z
  .object(
    Object.fromEntries(
      PUBLIC_PAGE_SLOTS.map((slot) => [slot.key, z.boolean()]),
    ),
  )
  .meta({
    id: "PageVisibility",
    description:
      "Which sections this organization publishes. A slot whose module is off is false here too.",
  });

const layoutSchema = z
  .object(
    Object.fromEntries(
      LAYOUT_SLOTS.map((slot) => [
        slot.key,
        z.union([z.string(), z.number(), z.boolean()]),
      ]),
    ),
  )
  .meta({ id: "SiteLayout" });

export const siteResponse = z
  .object({
    tenant: z.object({
      slug: z.union([z.string(), z.null()]),
      name: z.union([z.string(), z.null()]),
      custom_domain: z.union([z.string(), z.null()]),
    }),
    branding: brandingSchema,
    pages: pagesSchema,
    layout: layoutSchema,
    modules: z.record(z.string(), z.boolean()).meta({
      description: "Module key to whether this organization has it.",
    }),
  })
  .meta({ id: "SiteResponse" });

export const contentResponse = z
  .object({
    content: contentSlots,
    images: z.record(z.string(), z.union([z.string(), z.null()])).meta({
      description:
        "Resolved image URLs by slot -- a Google Drive share link is rewritten to something a browser can load.",
    }),
    lexicon: z.record(z.string(), z.string()).meta({
      description:
        "This organization's own words, already applied to `content`.",
    }),
  })
  .meta({ id: "ContentResponse" });

const sponsorSchema = z
  .object({
    sponsor_id: z.string(),
    name: z.union([z.string(), z.null()]),
    logo_url: z.union([z.string(), z.null()]),
    website: z.union([z.string(), z.null()]),
  })
  .meta({ id: "Sponsor" });

const programSchema = z
  .object({ program_id: z.string(), name: z.string() })
  .meta({ id: "EventProgram" });

const eventSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    location: z.union([z.string(), z.null()]),
    starts_at: z.string(),
    ends_at: z.union([z.string(), z.null()]),
    timezone: z.string().meta({
      description:
        "The event's own zone. Instants are UTC; render them in this zone, as the organization's site does.",
    }),
    description: z.union([z.string(), z.null()]),
    capacity: z.union([z.number(), z.null()]),
    registration_enabled: z.boolean(),
    registration_deadline: z.union([z.string(), z.null()]),
    flier_url: z.union([z.string(), z.null()]),
    adults_only: z.boolean().meta({
      description:
        "Adults only (18+). Registering for one requires adults_only_confirmed.",
    }),
    sponsors: z.array(sponsorSchema),
    programs: z.array(programSchema),
  })
  .meta({ id: "Event" });

export const eventsResponse = z
  .object({ events: z.array(eventSchema) })
  .meta({ id: "EventsResponse" });

const registrationOptionsSchema = z
  .object({
    prompt: z.string(),
    options: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        is_full: z.boolean().meta({
          description: "A registration choosing it is refused.",
        }),
      }),
    ),
  })
  .meta({
    id: "EventRegistrationOptions",
    description:
      "The event's registration question (#1407). Registering then requires option_counts: how many people in the party chose each option, adding up to party_size.",
  });

const registrationQuestionSchema = z
  .object({
    id: z.string(),
    kind: z.enum([
      "single_choice",
      "multi_choice",
      "short_text",
      "number",
      "consent",
      "place",
    ]),
    prompt: z.string(),
    help: z.union([z.string(), z.null()]),
    required: z.boolean(),
    options: z.array(z.object({ id: z.string(), label: z.string() })),
    min_value: z.union([z.int(), z.null()]),
    max_value: z.union([z.int(), z.null()]),
    show_if: z
      .union([
        z.object({
          question_id: z.string(),
          option_ids: z.array(z.string()),
        }),
        z.null(),
      ])
      .meta({
        description:
          "Asked only when the named earlier single_choice question is answered with one of these option ids.",
      }),
    place: z
      .union([
        z.object({
          granularity: z.enum(["locality", "neighborhood"]),
          allow_other: z.boolean(),
        }),
        z.null(),
      ])
      .optional()
      .meta({
        description:
          'For a place question (#1699): whether it asks for a city/town (locality) or an NYC neighborhood where there is one, and whether a free-text "Not listed" answer is accepted.',
      }),
  })
  .meta({
    id: "EventRegistrationQuestion",
    description:
      "One of the event's registration questions (#1501), answered once per registration in `answers`.",
  });

export const eventResponse = z
  .object({
    event: eventSchema.extend({
      registration_options: z.union([registrationOptionsSchema, z.null()]),
      registration_questions: z.array(registrationQuestionSchema),
    }),
  })
  .meta({ id: "EventResponse" });

export const calendarResponse = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        item_type: z.string(),
        starts_at: z.string(),
        ends_at: z.union([z.string(), z.null()]),
        time_zone: z.string(),
        summary: z.union([z.string(), z.null()]),
        categories: z.union([z.array(z.string()), z.null()]),
        public_url: z.union([z.string(), z.null()]),
      }),
    ),
    categories: z.array(z.object({ key: z.string(), label: z.string() })),
  })
  .meta({ id: "CalendarResponse" });

export const gearResponse = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        description: z.string(),
        size: z.union([z.string(), z.null()]),
        type: z.union([z.string(), z.null()]),
        gender: z.union([z.string(), z.null()]),
        condition: z.string(),
        photo_url: z.union([z.string(), z.null()]),
        created_at: z.string(),
        category_key: z.union([z.string(), z.null()]),
        category_label: z.union([z.string(), z.null()]),
        category_group_key: z.union([z.string(), z.null()]),
        category_group_label: z.union([z.string(), z.null()]),
        category_sort_order: z.union([z.number(), z.null()]),
        category_group_sort_order: z.union([z.number(), z.null()]),
      }),
    ),
  })
  .meta({ id: "GearResponse" });

export const gearRequestSettingsResponse = z
  .object({
    settings: z.record(z.string(), json).meta({
      description:
        "Keyed by slot: `shipping_enabled` (boolean), `payment_methods` (array of `{key, label}`), `passphrase_required` (boolean) and `passphrase_help_text` (string, the organization's own words on how to get the passphrase). The passphrase itself is never included.",
    }),
  })
  .meta({ id: "GearRequestSettingsResponse" });

export const volunteerRolesResponse = z
  .object({
    roles: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.union([z.string(), z.null()]),
      }),
    ),
  })
  .meta({ id: "VolunteerRolesResponse" });

const articleSchema = z
  .object({
    id: z.string(),
    anchor: z.string(),
    position: z.union([z.number(), z.null()]),
    value: json.meta({
      description:
        "The article body, in the block format src/lib/articles.ts describes. Not HTML.",
    }),
  })
  .meta({ id: "Article" });

const articleCategorySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    position: z.union([z.number(), z.null()]),
    value: json,
    articles: z.array(articleSchema),
  })
  .meta({ id: "ArticleCategory" });

export const articlesResponse = z
  .object({ categories: z.array(articleCategorySchema) })
  .meta({ id: "ArticlesResponse" });

export const articleCategoryResponse = z
  .object({ category: articleCategorySchema })
  .meta({ id: "ArticleCategoryResponse" });

export const articleCategoriesResponse = z
  .object({
    categories: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        position: z.union([z.number(), z.null()]),
        value: json,
      }),
    ),
  })
  .meta({ id: "ArticleCategoriesResponse" });

export const programsResponse = z
  .object({
    programs: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.union([z.string(), z.null()]),
        emoji: z.union([z.string(), z.null()]),
        pillar: z.union([z.string(), z.null()]),
        sort_order: z.union([z.number(), z.null()]),
      }),
    ),
  })
  .meta({ id: "ProgramsResponse" });

export const teamResponse = z
  .object({
    team: z.array(
      z.object({
        id: z.string(),
        name: z.union([z.string(), z.null()]),
        role: z.union([z.string(), z.null()]),
        bio: z.union([z.string(), z.null()]),
        photo_url: z.union([z.string(), z.null()]),
        sort_order: z.union([z.number(), z.null()]),
      }),
    ),
  })
  .meta({ id: "TeamResponse" });

export const sponsorsResponse = z
  .object({ sponsors: z.array(sponsorSchema) })
  .meta({ id: "SponsorsResponse" });

export const lexiconResponse = z
  .object({ lexicon: z.record(z.string(), z.string()) })
  .meta({ id: "LexiconResponse" });

export const legalResponse = z
  .object({
    documents: z.array(
      z.object({
        key: z.enum(
          LEGAL_DOCUMENTS.map((document) => document.key) as [
            string,
            ...string[],
          ],
        ),
        label: z.string(),
        url: z.string().meta({
          description: "Path on the organization's own site, not on this API.",
        }),
        in_force: z.boolean(),
      }),
    ),
  })
  .meta({ id: "LegalResponse" });

export const idResponse = z
  .object({ id: z.string() })
  .meta({ id: "IdResponse" });

export const referenceCodeResponse = z
  .object({ reference_code: z.string() })
  .meta({ id: "ReferenceCodeResponse" });

export const volunteerStatusResponse = z
  .object({ status: z.union([z.string(), z.null()]) })
  .meta({ id: "VolunteerStatusResponse" });

export const savedResponse = z
  .object({ saved: z.literal(true) })
  .meta({ id: "SavedResponse" });

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.enum([
        "not_found",
        "invalid_request",
        "rate_limited",
        "origin_not_allowed",
        "conflict",
        "server_error",
      ]),
      message: z.string().meta({
        description:
          "A sentence for a developer reading a log. Render your own words from `code`.",
      }),
      fields: z.record(z.string(), z.string()).optional().meta({
        description: "One message per field, on a 422 from a form post.",
      }),
    }),
  })
  .meta({ id: "ErrorResponse" });
