/**
 * Every table that carries a `tenant_id` (#707 Phase 2, 20260906010000) --
 * the tables given the column with a default, plus the three that take it
 * from their role by trigger, plus the three retention tables Phase 5b scoped
 * (20260906160000), plus `tenant_modules` (#900), which is the one with no
 * default on the column at all: nothing a session writes goes there.
 *
 * `audit_log` is deliberately absent: its `tenant_id` is nullable, and its
 * select policy admits rows with no tenant on purpose. It is covered by its
 * own case in the isolation suite.
 *
 * `content_pack_adoptions` (#895) is absent for a different reason: a row in it
 * exists only once one tenant has copied another tenant's pack, so a database
 * with a single seeded tenant has none by construction and the per-table check
 * below -- which requires rows in tenant A -- would be asserting against an
 * empty table. Seeding one would mean seeding a row the application cannot
 * produce. Its isolation is covered directly in
 * `src/app/portal/(app)/administration/site-content/articles/packs/actions.integration.test.ts`,
 * which provisions the second tenant that makes adoption possible at all.
 *
 * `person_waiver_acceptances` (#1401) is absent for the same reason: a row
 * exists only once a linked person accepts a waiver the tenant has adopted,
 * and the seed adopts none. Nothing but two SECURITY DEFINER functions can
 * read it at all -- it has no policies and no grants -- which
 * `src/lib/constituent/actions.integration.test.ts` asserts directly.
 *
 * `event_registration_options` and `event_registration_option_counts` (#1407)
 * are absent for the same reason: the seed gives no event a registration
 * question, and one given to a seeded event would make every suite that
 * registers for it answer. Their isolation is asserted by the host probe on
 * `public_event_registration_options` in the isolation suite and directly in
 * `src/lib/registration-options.integration.test.ts`.
 *
 * `event_registration_questions` and `event_registration_answers` (#1501) are
 * absent for the same reason as #1407's: the seed gives no event a
 * registration question. Their isolation is asserted by the host probe on
 * `public_event_registration_questions` in the isolation suite and directly in
 * `src/lib/registration-questions.integration.test.ts`.
 *
 * `event_carpool_cars` and `event_carpool_passengers` (#1649) are absent for
 * the same reason: a car exists only once staff turn on an event's carpools
 * and add one, which the seed never does. Their isolation -- a car, a
 * registration and an event from another tenant -- is asserted directly in
 * `src/app/portal/(app)/events/carpools.integration.test.ts`.
 *
 * `event_carpool_assignment_emails` (#1651) is absent for the same reason: a
 * row exists only once staff email a car its assignments. It has no policies
 * and no grants -- only SECURITY DEFINER functions and the service role reach
 * it -- which
 * `src/app/(public)/events/carpool-assignment.integration.test.ts` asserts.
 *
 * `event_registration_answer_requests` (#1502) is absent for the same reason:
 * a row exists only once staff email a registrant a link, which the seed never
 * does. Its isolation -- including a link from another tenant -- is asserted
 * directly in `src/lib/registration-answer-requests.integration.test.ts`.
 *
 * `inventory_distribution_drafts` and `inventory_distribution_draft_items`
 * (#1420) are absent for the same reason: a draft exists only while one
 * person is scanning a handout, and is deleted when it is recorded, so the
 * seed has none. Their RLS is owner-only on top of the tenant predicate, which
 * `src/lib/inventory-distribution-draft.integration.test.ts` asserts directly.
 *
 * `social_post_tags` and `social_post_media` (#1826) are absent for the same
 * reason: the seed gives no post a tag or a file. Their access is asserted
 * directly in `src/lib/social-content/post-content-actions.integration.test.ts`.
 *
 * `social_post_series` (#1839) is absent for the same reason: the seed makes
 * no post repeat. Its access is asserted directly in
 * `src/lib/social-content/series-actions.integration.test.ts`.
 *
 * `event_access_grants` (#1686) is absent for the same reason: a grant exists
 * only once an administrator gives a guest access to an event, which the seed
 * never does. Its isolation -- a grant in another tenant reaching nothing --
 * is asserted directly in `src/lib/auth/event-access.integration.test.ts`.
 *
 * `pending_event_access_grants` (#1689) is absent for the same reason: an
 * invite exists only once an administrator invites an address to an event,
 * and is deleted when it is claimed. Its writes are administrator-only and
 * its address rule (#759) is asserted directly in
 * `src/app/portal/(app)/events/access-management.integration.test.ts`.
 *
 * A table added later with a `tenant_id` column belongs here too. The catalog
 * side of that -- its policies carrying the tenant predicate, its foreign
 * keys being composite -- is asserted by `tenant_isolation_gaps()` regardless
 * of this list; this list is what drives the behavioural per-table checks.
 */
export const TENANT_TABLES = [
  "access_grants",
  "agenda_template_versions",
  "agenda_templates",
  "agendas",
  "annual_requirements",
  "app_settings",
  "article_categories",
  "articles",
  "assets",
  "auto_reply_templates",
  "board_members",
  "bylaws",
  "calendar_item_categories",
  "calendar_item_programs",
  "calendar_items",
  "conduct_report_actions",
  "conduct_report_appeals",
  "conduct_report_reviewers",
  "conduct_reports",
  "conflict_of_interest_disclosures",
  "contact_messages",
  "content_opportunities",
  "content_packs",
  "discount_codes",
  "donations",
  "event_checklist_items",
  "event_expenses",
  "event_impact_notes",
  "event_incidents",
  "event_logistics",
  "event_programs",
  "event_registrations",
  "event_revenue",
  "event_shifts",
  "event_sponsors",
  "event_staff",
  "event_volunteers",
  "events",
  "giveaway_buckets",
  "giveaway_prizes",
  "giveaway_rules",
  "giveaway_rules_versions",
  "giveaway_ticket_grants",
  "giveaway_ticket_packages",
  "giveaway_ticket_sales",
  "giveaway_tier_grants",
  "giveaway_tier_rules",
  "giveaway_tiers",
  "giveaway_winners",
  "giveaways",
  "governance_meeting_action_items",
  "governance_meeting_attendees",
  "governance_meeting_decisions",
  "governance_meetings",
  "grants",
  "inventory_categories",
  "inventory_category_groups",
  "inventory_item_tag_assignments",
  "inventory_item_tags",
  "inventory_items",
  "inventory_movements",
  "legal_document_versions",
  "meeting_minutes",
  "monetary_donations",
  "nonprofit_status_milestones",
  "notification_deliveries",
  "outbound_messages",
  "partnership_opportunities",
  "people",
  "person_merges",
  "person_notification_preferences",
  "person_organizations",
  "person_role_tags",
  "person_screenings",
  "policies",
  "product_variants",
  "products",
  "programs",
  "reimbursements",
  "resolutions",
  "retention_policies",
  "retention_run_tables",
  "retention_runs",
  "roles",
  "sale_line_items",
  "sales",
  "services",
  "site_content",
  "tenant_modules",
  "volunteer_applications",
  "volunteer_hours",
  "volunteer_role_types",
  "volunteer_screening_tiers",
  "user_roles",
  "role_permissions",
  "pending_role_grants",
] as const;
