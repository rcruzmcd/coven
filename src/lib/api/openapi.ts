import { z } from "zod";
import {
  contactMessageSchema,
  eventRegistrationSchema,
  gearRequestSchema,
  personAnswersSchema,
  riderProfileSchema,
  volunteerApplicationSchema,
  volunteerStatusLookupSchema,
} from "@/lib/api/schemas";
import {
  articleCategoriesResponse,
  articleCategoryResponse,
  articlesResponse,
  calendarResponse,
  contentResponse,
  errorResponseSchema,
  eventResponse,
  eventsResponse,
  gearRequestSettingsResponse,
  gearResponse,
  idResponse,
  legalResponse,
  lexiconResponse,
  programsResponse,
  referenceCodeResponse,
  savedResponse,
  siteResponse,
  sponsorsResponse,
  teamResponse,
  volunteerRolesResponse,
  volunteerStatusResponse,
} from "@/lib/api/response-schemas";
import { READ_CACHE_CONTROL } from "@/lib/api/respond";
import { RATE_LIMIT_WINDOW_SECONDS } from "@/lib/api/errors";

/**
 * The published contract (#813 Phase 3), generated rather than written.
 *
 * Every schema here is the object the handlers actually use --
 * `z.toJSONSchema()` over the same `src/lib/api/schemas.ts` a POST validates
 * against, and over the response schemas an integration test parses real
 * answers with. A document maintained separately from the code is a document
 * that is wrong within a month; this one cannot say a field exists that the
 * code does not have.
 *
 * The registry-driven parts carry that further: `/content`'s properties come
 * from `SITE_CONTENT_SLOTS`, and `/site`'s from the brand, page-visibility and
 * layout registries, so adding a slot (#888) changes the API and its
 * description in the same commit.
 */

type Endpoint = {
  path: string;
  method: "get" | "post";
  operationId: string;
  summary: string;
  description?: string;
  /** Extra path parameters beyond `tenant`. */
  pathParams?: { name: string; description: string }[];
  queryParams?: { name: string; description: string }[];
  body?: z.ZodType;
  response: z.ZodType;
  /** Status of the success response. */
  status: number;
};

const ENDPOINTS: Endpoint[] = [
  {
    path: "/site",
    method: "get",
    operationId: "getSite",
    summary: "The organization, its brand, and how its site is arranged",
    response: siteResponse,
    status: 200,
  },
  {
    path: "/content",
    method: "get",
    operationId: "getContent",
    summary: "Every copy slot, resolved over the registry defaults",
    description:
      "Only slots the platform registry knows about are served, whatever rows exist.",
    response: contentResponse,
    status: 200,
  },
  {
    path: "/events",
    method: "get",
    operationId: "listEvents",
    summary: "Published events, soonest first, with sponsors and programs",
    response: eventsResponse,
    status: 200,
  },
  {
    path: "/events/{event}",
    method: "get",
    operationId: "getEvent",
    summary: "One published event",
    pathParams: [{ name: "event", description: "The event's id." }],
    response: eventResponse,
    status: 200,
  },
  {
    path: "/calendar",
    method: "get",
    operationId: "getCalendar",
    summary: "The community calendar, and this organization's category names",
    response: calendarResponse,
    status: 200,
  },
  {
    path: "/gear",
    method: "get",
    operationId: "listGear",
    summary: "Items available in the public catalog",
    queryParams: [
      { name: "category", description: "Exact `category_key`." },
      { name: "condition", description: "Exact condition." },
      { name: "gender", description: "Exact gender." },
      {
        name: "q",
        description: "Case-insensitive substring of the description.",
      },
    ],
    response: gearResponse,
    status: 200,
  },
  {
    path: "/gear-request-settings",
    method: "get",
    operationId: "getGearRequestSettings",
    summary:
      "What a gear request may ask for: shipping, how to pay postage, and whether a passphrase is required",
    response: gearRequestSettingsResponse,
    status: 200,
  },
  {
    path: "/volunteer-roles",
    method: "get",
    operationId: "listVolunteerRoles",
    summary: "Roles this organization is publicly recruiting for",
    response: volunteerRolesResponse,
    status: 200,
  },
  {
    path: "/articles",
    method: "get",
    operationId: "listArticles",
    summary: "Published articles, grouped by category",
    response: articlesResponse,
    status: 200,
  },
  {
    path: "/articles/{article}",
    method: "get",
    operationId: "getArticleCategory",
    summary: "One article category and its articles",
    pathParams: [{ name: "article", description: "The category's slug." }],
    response: articleCategoryResponse,
    status: 200,
  },
  {
    path: "/article-categories",
    method: "get",
    operationId: "listArticleCategories",
    summary: "Article categories, without their articles",
    response: articleCategoriesResponse,
    status: 200,
  },
  {
    path: "/programs",
    method: "get",
    operationId: "listPrograms",
    summary: "The organization's programs",
    response: programsResponse,
    status: 200,
  },
  {
    path: "/team",
    method: "get",
    operationId: "listTeam",
    summary: "Who the organization publishes on its team page",
    response: teamResponse,
    status: 200,
  },
  {
    path: "/sponsors",
    method: "get",
    operationId: "listSponsors",
    summary: "The sponsor wall",
    response: sponsorsResponse,
    status: 200,
  },
  {
    path: "/lexicon",
    method: "get",
    operationId: "getLexicon",
    summary:
      "This organization's own words for what it lends and who it serves",
    response: lexiconResponse,
    status: 200,
  },
  {
    path: "/legal",
    method: "get",
    operationId: "listLegalDocuments",
    summary: "Which legal documents are in force, and where they are",
    description:
      "The bodies are not served: they are still code defaults rather than data, so `url` points at the organization's own site.",
    response: legalResponse,
    status: 200,
  },
  {
    path: "/contact",
    method: "post",
    operationId: "sendContactMessage",
    summary: "Send the organization a message",
    body: contactMessageSchema,
    response: idResponse,
    status: 201,
  },
  {
    path: "/volunteer-applications",
    method: "post",
    operationId: "submitVolunteerApplication",
    summary: "Apply to volunteer",
    description:
      "Keep the reference code: it is the applicant's only key to the status lookup.",
    body: volunteerApplicationSchema,
    response: referenceCodeResponse,
    status: 201,
  },
  {
    path: "/volunteer-applications/status",
    method: "post",
    operationId: "lookupVolunteerApplicationStatus",
    summary: "Where an application got to",
    description:
      'A POST because the email and the reference code together are the credential, and a credential does not belong in a query string. A miss answers `{ \\"status\\": null }` and a 200.',
    body: volunteerStatusLookupSchema,
    response: volunteerStatusResponse,
    status: 201,
  },
  {
    path: "/events/{event}/registrations",
    method: "post",
    operationId: "registerForEvent",
    summary: "Register for an event",
    pathParams: [{ name: "event", description: "The event's id." }],
    body: eventRegistrationSchema,
    response: idResponse,
    status: 201,
  },
  {
    path: "/gear-requests",
    method: "post",
    operationId: "requestGear",
    summary: "Request items from the public catalog",
    body: gearRequestSchema,
    response: idResponse,
    status: 201,
  },
  {
    path: "/rider-profile",
    method: "post",
    operationId: "saveRiderProfile",
    summary: "Attach a rider profile to a registration made in the last day",
    description:
      "Kept for v1: the four fields are mapped onto the organization's profile questions keyed riding_discipline, ski_level, snowboard_level and preferred_mountain (#1746). An organization without all four answers 410; use /person-answers.",
    body: riderProfileSchema,
    response: savedResponse,
    status: 201,
  },
  {
    path: "/person-answers",
    method: "post",
    operationId: "savePersonAnswers",
    summary:
      "Answer the organization's profile questions after a registration made in the last day",
    description:
      "The questions the organization asks after registering for that event, keyed by question key. Never pre-filled: a question left out keeps the stored answer.",
    body: personAnswersSchema,
    response: savedResponse,
    status: 201,
  },
];

const TENANT_PARAM = {
  name: "tenant",
  in: "path",
  required: true,
  description:
    "The organization's slug. An unknown, suspended or archived one is a 404.",
  schema: { type: "string" },
};

function jsonSchema(schema: z.ZodType): unknown {
  // `io: "input"` for bodies would drop `additionalProperties`; the default
  // "output" view is the one a consumer should see for a response, and for a
  // body it is what the handler receives after trimming. `unrepresentable:
  // "any"` keeps a `z.json()` field as an open value rather than throwing.
  return z.toJSONSchema(schema, { unrepresentable: "any", io: "output" });
}

const ERROR_RESPONSES = {
  "404": errorRef("No such organization, or no such thing inside it."),
  "422": errorRef("The body did not validate; see `error.fields`."),
  "429": errorRef(
    `Rate limited. \`Retry-After\` is ${RATE_LIMIT_WINDOW_SECONDS} seconds, the window the limiter counts over.`,
  ),
  "500": errorRef("Something went wrong on our side."),
};

const WRITE_ERROR_RESPONSES = {
  ...ERROR_RESPONSES,
  "403": errorRef("This origin is not on the organization's allow-list."),
  "409": errorRef("The thing is full, closed, or already has this submission."),
};

function errorRef(description: string) {
  return {
    description,
    content: {
      "application/json": { schema: jsonSchema(errorResponseSchema) },
    },
  };
}

/** The whole document. Pure: same input, same bytes, every time. */
export function openApiDocument(serverUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const endpoint of ENDPOINTS) {
    const path = `/api/v1/t/{tenant}${endpoint.path}`;
    paths[path] ??= {};

    paths[path][endpoint.method] = {
      operationId: endpoint.operationId,
      summary: endpoint.summary,
      ...(endpoint.description ? { description: endpoint.description } : {}),
      parameters: [
        TENANT_PARAM,
        ...(endpoint.pathParams ?? []).map((param) => ({
          name: param.name,
          in: "path",
          required: true,
          description: param.description,
          schema: { type: "string" },
        })),
        ...(endpoint.queryParams ?? []).map((param) => ({
          name: param.name,
          in: "query",
          required: false,
          description: param.description,
          schema: { type: "string" },
        })),
      ],
      ...(endpoint.body
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": { schema: jsonSchema(endpoint.body) },
              },
            },
          }
        : {}),
      responses: {
        [String(endpoint.status)]: {
          description: endpoint.summary,
          ...(endpoint.method === "get"
            ? {
                headers: {
                  "Cache-Control": {
                    description: `Always \`${READ_CACHE_CONTROL}\`.`,
                    schema: { type: "string" },
                  },
                  ETag: {
                    description:
                      "Send it back as `If-None-Match` to get a 304 and no body.",
                    schema: { type: "string" },
                  },
                },
              }
            : {}),
          content: {
            "application/json": { schema: jsonSchema(endpoint.response) },
          },
        },
        ...(endpoint.method === "get"
          ? { "304": { description: "Your `If-None-Match` still matches." } }
          : {}),
        ...(endpoint.method === "get"
          ? ERROR_RESPONSES
          : WRITE_ERROR_RESPONSES),
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Public content API",
      version: "1.0.0",
      description: [
        "A read-and-intake contract over one organization's public content.",
        "",
        "Every path names the organization by its slug. Reads are open to any",
        "origin and cached; writes are the same intake forms the organization's",
        "own website posts, rate-limited per caller IP in the database, and",
        "restricted to origins the organization has allow-listed when they come",
        "from a browser.",
        "",
        "There is no authentication and no key. Everything here is already",
        "public: it is what a visitor to the organization's own site can see.",
        "Nothing about donors, finance, inventory valuations or anybody's",
        "membership is reachable from this API at any path.",
        "",
        "**Not in v1:** artwork-call submissions. They upload images through",
        "signed storage URLs in a two-step flow, and publishing that flow would",
        "make a storage provider's upload protocol part of this contract.",
        "See #813 for the decision.",
      ].join("\n"),
    },
    servers: [{ url: serverUrl }],
    paths,
  };
}
