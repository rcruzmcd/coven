-- Local development seed data.
--
-- Runs after all migrations on `supabase db reset` / `supabase start`.
-- Local only: never applied to the linked project by `supabase db push`.
-- Everything below is fabricated (see docs/technical-spec.md §8 — seed data
-- must be safe for local dev and must not contain real donor or recipient
-- information).
--
-- Test accounts (password for all: "password123"). Sign in at
-- /portal/login with these instead of Google OAuth to exercise each role
-- locally:
--   admin@example.test         admin
--   coordinator@example.test   event_coordinator
--   finance@example.test       finance
--   board@example.test         board
--   volunteer@example.test     volunteer
--   multi@example.test         event_coordinator + volunteer (multi-role)
--   noaccess@example.test      signed in, no role assigned (access-denied path)
--   former@example.test        event_coordinator role, but deactivated (revoked-access path)
--
-- Tenants: exactly one, "Example Nonprofit" / `example-nonprofit`, on the
-- `internal` plan, created by 20260905190000. Every account above is a member
-- of it and every row below lands in it. Do not add a second tenant here -- a
-- second *active* tenant switches off the sole-active-tenant fallback that
-- every unscoped insert in this file, the local public site and both
-- database-backed suites depend on. See "Local development: one tenant" in
-- docs/tenants.md.

-- Fixture ids below are written out rather than generated, so a record a test
-- or a scan asserts on keeps the same id across resets (#665). gen_random_uuid()
-- draws from pgcrypto's CSPRNG, which setseed() further down does not reach, so
-- literals are the only way to pin them. The first group names the kind:
--
--   aaaaaaaa-* auth accounts    bbbbbbbb-* people      cccccccc-* events
--   dddddddd-* donations        eeeeeeee-* inventory   ffffffff-* calendar items
--   abababab-* governance       babababa-* programs, giveaways
--   cdcdcdcd-* products          acacacac-* conduct reports
--
-- These are mirrored in test/seed-fixtures.ts -- change one, change both.
with new_users(id, email, full_name) as (
  values
    ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'admin@example.test', 'Avery Morgan'),
    ('aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'coordinator@example.test', 'Jordan Lee'),
    ('aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'finance@example.test', 'Morgan Patel'),
    ('aaaaaaaa-0000-4000-8000-000000000004'::uuid, 'board@example.test', 'Taylor Brooks'),
    ('aaaaaaaa-0000-4000-8000-000000000005'::uuid, 'volunteer@example.test', 'Casey Rivera'),
    ('aaaaaaaa-0000-4000-8000-000000000006'::uuid, 'multi@example.test', 'Riley Chen'),
    ('aaaaaaaa-0000-4000-8000-000000000007'::uuid, 'noaccess@example.test', 'Sam Ellis'),
    ('aaaaaaaa-0000-4000-8000-000000000008'::uuid, 'former@example.test', 'Drew Kowalski')
),
inserted_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
    email, extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', full_name),
    now(), now(),
    '', '', '', ''
  from new_users
  returning id, email
)
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), inserted_users.id::text, inserted_users.id,
  jsonb_build_object('sub', inserted_users.id::text, 'email', inserted_users.email, 'email_verified', true),
  'email', now(), now(), now()
from inserted_users;

-- Every portal account needs a linked people row: every owner/assignee column
-- in the portal references public.people, so an account without one can't be
-- assigned anything and won't appear in the calendar owner picker.
--
-- ensure_current_person() (20260902040000) does this at login and
-- 20260902050000 backfills existing accounts, but migrations run *before*
-- this file on `db reset` -- so the seeded accounts have to be linked here or
-- list_calendar_owners() comes back empty locally.
--
-- Two accounts get a preferred_name so the override is exercisable locally
-- and in e2e without having to set one first.
--
-- volunteer@example.test and noaccess@example.test are deliberately left
-- WITHOUT a people row: ensure_current_person() only runs at login, so an
-- account that has never signed in legitimately has none, and these two are
-- the local fixtures for that state (see
-- src/lib/auth/current-person.integration.test.ts, which exercises the
-- link-by-email and no-row paths against them).
insert into public.people (name, is_anonymous, source_type, email, auth_user_id, created_by, preferred_name)
select
  coalesce(u.raw_user_meta_data ->> 'full_name', u.email),
  false,
  'other',
  u.email,
  u.id,
  u.id,
  case u.email
    when 'admin@example.test' then 'Ave'
    when 'coordinator@example.test' then 'Jordy'
  end
from auth.users u
where u.email in (
  'admin@example.test', 'coordinator@example.test', 'finance@example.test',
  'board@example.test', 'multi@example.test', 'former@example.test'
)
and not exists (select 1 from public.people p where p.auth_user_id = u.id);

insert into public.user_roles (user_id, role_id, created_by)
select u.id, r.id, u.id
from auth.users u
join public.roles r on (
  (u.email = 'admin@example.test' and r.name = 'admin') or
  (u.email = 'coordinator@example.test' and r.name = 'event_coordinator') or
  (u.email = 'finance@example.test' and r.name = 'finance') or
  (u.email = 'board@example.test' and r.name = 'board') or
  (u.email = 'volunteer@example.test' and r.name = 'volunteer') or
  (u.email = 'multi@example.test' and r.name in ('event_coordinator', 'volunteer')) or
  (u.email = 'former@example.test' and r.name = 'event_coordinator')
)
where u.email in (
  'admin@example.test', 'coordinator@example.test', 'finance@example.test',
  'board@example.test', 'volunteer@example.test', 'multi@example.test', 'former@example.test'
);
-- noaccess@example.test intentionally gets no user_roles row.

-- Tenant membership (#707 Phase 1). 20260905190000 creates the initial tenant
-- and backfills memberships for the accounts that exist at migration time --
-- but migrations run *before* this file on `db reset`, so the seeded accounts
-- are created after that backfill and have to be joined here, the same way
-- their people rows are above.
--
-- Every account gets one, including noaccess@ and former@: tenancy says which
-- organisation's data you are looking at, and is orthogonal to whether you may
-- do anything with it. Those two accounts exercise the no-role and deactivated
-- paths, which have to keep behaving that way *inside* a tenant.
--
-- Matched on "the tenant that exists" rather than on the slug: 20260905190000
-- takes the slug from app.initial_tenant_slug, so hardcoding 'chatter-snow'
-- here would seed zero memberships for anyone who has set it.
--
-- Phase 2 (20260906010000) gave every tenant table a tenant_id defaulting to
-- default_tenant_id(). This file runs as postgres with no session, and that
-- default falls back to the sole active tenant -- which is exactly the state
-- of a freshly reset database -- so none of the inserts below name a tenant.
-- Seeding a second tenant here would break that: add its rows with an
-- explicit tenant_id, or it will stop every unscoped insert cold.
insert into public.tenant_memberships (user_id, tenant_id, kind, created_by)
select u.id, t.id, 'member', u.id
from auth.users u
cross join (select id from public.tenants order by created_at limit 1) t
on conflict (user_id, tenant_id) do nothing;

-- Sample operational data, owned by the seeded admin account.
do $$
declare
  v_admin_id uuid;
  -- Calendar owner/reviewer reference public.people (20260902010000), not
  -- auth.users -- created_by still takes the auth id.
  v_admin_person_id uuid;
  -- Literal ids for the records tests and scans assert on, so a reset does not
  -- move them (#665). See the comment above the auth accounts at the top of the
  -- file for the prefix scheme, and mirror any change into test/seed-fixtures.ts.
  v_person_donor1 constant uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  v_person_donor2 constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  v_person_sponsor constant uuid := 'bbbbbbbb-0000-4000-8000-000000000003';
  v_person_volunteer constant uuid := 'bbbbbbbb-0000-4000-8000-000000000004';
  v_person_local_roasters constant uuid := 'bbbbbbbb-0000-4000-8000-000000000005';
  v_event_upcoming constant uuid := 'cccccccc-0000-4000-8000-000000000001';
  v_event_past constant uuid := 'cccccccc-0000-4000-8000-000000000002';
  v_event_draft constant uuid := 'cccccccc-0000-4000-8000-000000000003';
  v_donation1 constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  v_donation2 constant uuid := 'dddddddd-0000-4000-8000-000000000002';
  v_item1 constant uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  v_item2 constant uuid := 'eeeeeeee-0000-4000-8000-000000000002';
  v_item3 constant uuid := 'eeeeeeee-0000-4000-8000-000000000003';
  v_item4 constant uuid := 'eeeeeeee-0000-4000-8000-000000000004';
  -- The sponsor's own in-kind items (#1005): a sponsorship's goods are
  -- ordinary inventory rows under its donation, one per thing given.
  v_donation_sponsor constant uuid := 'dddddddd-0000-4000-8000-000000000003';
  v_item_sponsor1 constant uuid := 'eeeeeeee-0000-4000-8000-000000000011';
  v_item_sponsor2 constant uuid := 'eeeeeeee-0000-4000-8000-000000000012';
  v_item_sponsor3 constant uuid := 'eeeeeeee-0000-4000-8000-000000000013';
  -- The one distributed movement, which is what /portal/inventory/distribution
  -- lists and links to.
  v_movement_distributed constant uuid := 'eeeeeeee-0000-4000-8000-000000001001';
  -- The one open public gear request (#1032), which is what
  -- /portal/inventory/requests lists and links to.
  v_gear_request constant uuid := 'eeeeeeee-0000-4000-8000-000000002001';
  v_giveaway_id constant uuid := 'babababa-0000-4000-8000-000000000002';
  v_prize1 uuid;
  v_prize2 uuid;
  v_giveaway_tier uuid;
  v_giveaway_tier_silver uuid;
  v_giveaway_tier_bronze uuid;
  v_giveaway_package uuid;
  v_sponsor_cash uuid;
  v_program_id constant uuid := 'babababa-0000-4000-8000-000000000001';
  v_shift_id uuid;
  v_registration_id uuid;
  v_past_first_timer uuid;
  v_past_returning uuid;
  v_calendar_promo_id constant uuid := 'ffffffff-0000-4000-8000-000000000001';
  v_calendar_recurring_id constant uuid := 'ffffffff-0000-4000-8000-000000000002';
  -- The series the "generate next year's instance" flow keys on.
  v_calendar_recurring_series_key constant uuid := 'ffffffff-0000-4000-8000-000000002001';
  v_recurring_local_date date;
  v_meeting_id constant uuid := 'abababab-0000-4000-8000-000000000001';
  v_role_type_id uuid;
  v_screening_tier_1 uuid;
  v_screening_tier_2 uuid;
  v_agenda_template_id uuid;
  v_agenda_template_version_id uuid;
  v_former_id uuid;
  v_person_applicant uuid;
  v_item5 constant uuid := 'eeeeeeee-0000-4000-8000-000000000005';
begin
  select id into v_admin_id from auth.users where email = 'admin@example.test';
  select id into v_admin_person_id from public.people where auth_user_id = v_admin_id;
  select id into v_former_id from auth.users where email = 'former@example.test';

  -- People: donors, a sponsor org, and a volunteer. Roles are derived from the
  -- records below (#624), so each of these gets a person_role_tags row instead
  -- of a column write -- the tag is what carries a role until its first
  -- donation, sponsorship, or signup exists.
  insert into public.people (id, name, is_anonymous, source_type, email, phone, notes, created_by)
  values (v_person_donor1, 'Jamie Rivera', false, 'individual', 'jamie.rivera@example.test', '555-0101', null, v_admin_id);

  insert into public.people (id, name, is_anonymous, source_type, email, phone, notes, created_by)
  values (v_person_donor2, 'Alex Chen', false, 'individual', 'alex.chen@example.test', '555-0102', null, v_admin_id);

  insert into public.people (id, name, is_anonymous, source_type, person_type, email, phone, notes, logo_url, website, created_by)
  values (v_person_sponsor, 'Summit Outdoor Co.', false, 'brand', 'organization', 'partnerships@summitoutdoor.example.test', '555-0103', 'Local gear retailer, annual sponsor.', 'https://example.test/logos/summit-outdoor.png', 'https://summitoutdoor.example.test', v_admin_id);

  insert into public.people (id, name, is_anonymous, source_type, email, phone, notes, created_by)
  values (v_person_volunteer, 'Priya Natarajan', false, 'individual', 'priya.n@example.test', '555-0104', null, v_admin_id);

  -- Local Roasters carries a logo and a website so it can stand for the other
  -- half of the sponsor wall (#1024): an organization published by hand, with
  -- no event_sponsors row anywhere. Summit Outdoor reaches the wall through its
  -- sponsorship on the upcoming event, so a reset shows both arms at once.
  insert into public.people (id, name, is_anonymous, source_type, person_type, logo_url, website, created_by)
  values (v_person_local_roasters, 'Local Roasters Coffee', false, 'brand', 'organization', 'https://example.test/logos/local-roasters.png', 'https://localroasters.example.test', v_admin_id);

  insert into public.person_role_tags (person_id, role, is_public) values
    (v_person_donor1, 'donor', false),
    (v_person_donor2, 'donor', false),
    (v_person_sponsor, 'sponsor', false),
    (v_person_volunteer, 'volunteer', false),
    (v_person_local_roasters, 'donor', false),
    (v_person_local_roasters, 'sponsor', true);

  -- Partnerships. Two rows so the partner derivation is exercised both ways:
  -- the won one makes Summit Outdoor Co. a partner, the prospecting one adds
  -- nothing to Local Roasters' own roles. owner_person_id is the internal
  -- person driving the opportunity and derives no role at all.
  insert into public.partnership_opportunities
    (organization_person_id, stage, next_step_date, owner_person_id, notes,
     created_by)
  values
    (v_person_sponsor, 'closed_won', null, v_admin_person_id,
     'Season gear partnership, renewed annually.', v_admin_id),
    (v_person_local_roasters, 'prospecting', current_date + 14,
     v_admin_person_id, 'Intro call scheduled.', v_admin_id);

  -- Events: one upcoming/published/public, one past/published/public with
  -- attendance recorded, one draft/private.
  insert into public.events (id, name, location, starts_at, ends_at, timezone, visibility, status, created_by)
  values (
    v_event_upcoming, 'Winter Gear Swap', 'Community Center, Denver CO',
    now() + interval '21 days', now() + interval '21 days' + interval '4 hours',
    'America/Denver', 'public', 'published', v_admin_id
  );

  insert into public.events (
    id, name, location, starts_at, ends_at, timezone, visibility, status,
    attendance_count, attendance_notes, created_by
  )
  values (
    v_event_past, 'Fall Trailhead Cleanup & Giveaway', 'Bear Creek Trailhead',
    now() - interval '40 days', now() - interval '40 days' + interval '5 hours',
    'America/Denver', 'public', 'published',
    68, 'Strong turnout despite cold weather.', v_admin_id
  );

  insert into public.events (id, name, location, starts_at, ends_at, timezone, visibility, status, created_by)
  values (
    v_event_draft, 'Spring Board Planning Session', 'Chatter Snow Office',
    now() + interval '10 days', now() + interval '10 days' + interval '2 hours',
    'America/Denver', 'private', 'draft', v_admin_id
  );

  -- Event sponsor link (public, cash + in-kind support). Its in-kind half is
  -- three separate items (#1005) headed three different ways: two held back for
  -- the giveaway, one released to the gear library where the public site lists
  -- it. in_kind_description is the derived summary the sync RPC would write.
  insert into public.donations (id, donor_id, event_id, notes, created_by)
  values (v_donation_sponsor, v_person_sponsor, v_event_upcoming, 'Confirmed for the winter swap.', v_admin_id);

  insert into public.inventory_items (id, donation_id, description, type, condition, face_value, intended_use, created_at, created_by)
  values (v_item_sponsor1, v_donation_sponsor, 'Season lift tickets (4)', 'other', 'new', 720.00, 'giveaway', clock_timestamp(), v_admin_id);
  insert into public.inventory_items (id, donation_id, description, type, condition, face_value, intended_use, created_at, created_by)
  values (v_item_sponsor2, v_donation_sponsor, 'Goggles, mirrored', 'other', 'new', 120.00, 'giveaway', clock_timestamp(), v_admin_id);
  insert into public.inventory_items (id, donation_id, description, type, condition, face_value, intended_use, created_at, created_by)
  values (v_item_sponsor3, v_donation_sponsor, 'Snow boots, 20 pairs', 'boots', 'new', 660.00, 'gear_library', clock_timestamp(), v_admin_id);

  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
  values (v_item_sponsor1, 'received', 1, 'Sponsor contribution', v_event_upcoming, v_admin_id);
  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
  values (v_item_sponsor2, 'received', 1, 'Sponsor contribution', v_event_upcoming, v_admin_id);
  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
  values (v_item_sponsor3, 'received', 1, 'Sponsor contribution', v_event_upcoming, v_admin_id);

  insert into public.event_sponsors (
    event_id, person_id, support_type, in_kind_description, contribution_value, is_public, notes,
    donation_id, created_by
  )
  values (
    v_event_upcoming, v_person_sponsor, 'both',
    'Season lift tickets (4), Goggles, mirrored, Snow boots, 20 pairs', 1500.00, true,
    'Confirmed for the winter swap.', v_donation_sponsor, v_admin_id
  );

  -- Event expenses: one tied to the past event, one general/untied.
  insert into public.event_expenses (event_id, description, expense_date, amount, currency, notes, created_by, submitted_by)
  values (v_event_past, 'Trail signage and supplies', current_date - 40, 86.42, 'USD', null, v_admin_id, v_admin_id);

  insert into public.event_expenses (event_id, description, expense_date, amount, currency, notes, created_by, submitted_by)
  values (null, 'Storage unit rental — October', current_date - 10, 120.00, 'USD', 'Monthly inventory storage.', v_admin_id, v_admin_id);

  -- Event revenue: non-sponsorship income tied to the past event.
  insert into public.event_revenue (event_id, source, amount, received_date, notes, created_by)
  values (v_event_past, 'onsite_donations', 214.50, current_date - 40, 'Cash jar at the trailhead cleanup.', v_admin_id);

  -- Monetary donations: cash gifts recorded from the portal — one from a
  -- known donor, one anonymous, one tied to the past event. All within the
  -- current year so the finance report's year-to-date default sees them.
  insert into public.monetary_donations (donor_id, event_id, amount, method, received_date, notes, created_by)
  values (v_person_donor1, null, 100.00, 'check', current_date - 21, 'Annual gift.', v_admin_id);
  insert into public.monetary_donations (donor_id, event_id, amount, method, received_date, notes, created_by)
  values (null, null, 25.00, 'cash', current_date - 14, 'Dropped in the office donation box.', v_admin_id);
  insert into public.monetary_donations (donor_id, event_id, amount, method, received_date, notes, created_by)
  values (v_person_donor2, v_event_past, 50.00, 'card', current_date - 40, 'Pledged at the trailhead cleanup.', v_admin_id);

  -- Reimbursement: a volunteer's out-of-pocket spend, still awaiting approval.
  insert into public.reimbursements (person_id, event_id, description, amount, notes, submitted_by, created_by)
  values (v_person_volunteer, v_event_past, 'Gas for hauling donated gear to the trailhead.', 32.75, 'Receipt on file at the office.', v_admin_id, v_admin_id);

  -- Donations with items, plus receipt movements, tied to the upcoming event.
  insert into public.donations (id, donor_id, event_id, notes, created_by)
  values (v_donation1, v_person_donor1, v_event_upcoming, null, v_admin_id);

  insert into public.inventory_items (id, donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_item1, v_donation1, 'Insulated winter jacket', 'M', 'jacket', 'unisex', 'good', 45.00, 'available', v_admin_id);

  insert into public.inventory_items (id, donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_item2, v_donation1, 'Snow boots', '9', 'boots', 'women', 'like_new', 30.00, 'available', v_admin_id);

  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
  values (v_item1, 'received', 1, 'Donation intake', v_event_upcoming, v_admin_id);
  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
  values (v_item2, 'received', 1, 'Donation intake', v_event_upcoming, v_admin_id);

  -- Scannable tags (#1420): a printed asset-tag code on each, and the jacket's
  -- manufacturer barcode. Fixed codes so tests and a local /portal/t/<code>
  -- visit can name them; generated codes never contain 0, 1, I, L or O, so
  -- these cannot collide with one.
  insert into public.inventory_item_tags (item_id, kind, value, created_by)
  values
    (v_item1, 'asset_tag', 'SEED01', v_admin_id),
    (v_item2, 'asset_tag', 'SEED02', v_admin_id),
    (v_item1, 'barcode', '012345678905', v_admin_id);

  -- Reusable numbered codes (#1444): EXN-001 on the boots, EXN-002 and
  -- EXN-003 free. One insert each, since each takes the next number.
  update public.tenants set inventory_tag_prefix = 'EXN' where slug = 'example-nonprofit';
  insert into public.inventory_item_tags (item_id, kind, value, created_by)
  values (v_item2, 'numbered', '', v_admin_id);
  insert into public.inventory_item_tags (item_id, kind, value, created_by)
  values (null, 'numbered', '', v_admin_id);
  insert into public.inventory_item_tags (item_id, kind, value, created_by)
  values (null, 'numbered', '', v_admin_id);

  insert into public.donations (id, donor_id, notes, created_by)
  values (v_donation2, v_person_donor2, 'Dropped off at office', v_admin_id);

  insert into public.inventory_items (id, donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_item3, v_donation2, 'Fleece pullover', 'L', 'jacket', 'men', 'fair', 15.00, 'distributed', v_admin_id);

  insert into public.inventory_items (id, donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_item4, v_donation2, 'Snow pants', '10-12', 'pants', 'kids', 'good', 20.00, 'available', v_admin_id);

  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
  values (v_item3, 'received', 1, 'Donation intake', v_admin_id);
  -- With a recipient, so the past event's Impact card has someone served (#1577).
  insert into public.inventory_movements (id, inventory_item_id, movement_type, quantity, reason, event_id, recipient_person_id, created_by)
  values (v_movement_distributed, v_item3, 'distributed', 1, 'Given out at trailhead cleanup', v_event_past, v_person_volunteer, v_admin_id);
  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
  values (v_item4, 'received', 1, 'Donation intake', v_admin_id);

  -- Fifth item, held on the public gear library: requested and reserved via
  -- the request_gear_item() flow (recipient is a person, not an event).
  insert into public.inventory_items (id, donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_item5, v_donation2, 'Wool beanie', 'One size', 'accessory', 'unisex', 'good', 8.00, 'reserved', v_admin_id);

  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
  values (v_item5, 'received', 1, 'Donation intake', v_admin_id);
  -- The request header (#1032) carries the notes and the delivery choice; the
  -- movement is the hold and points at it.
  insert into public.gear_requests (id, person_id, delivery_method, notes)
  values (v_gear_request, v_person_volunteer, 'meetup',
          'Picking up Saturday morning before the shuttle -- happy to take a smaller size if this one is spoken for.');
  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, recipient_person_id, gear_request_id, created_by)
  values (v_item5, 'reserved', 1, 'Public gear library request', v_person_volunteer, v_gear_request, v_admin_id);

  -- Giveaway for the past event: two prizes, one claimed winner.
  -- Tickets sold and revenue come from the ticket sales below (#1577); the
  -- retired hand-entered columns are left at their defaults.
  insert into public.giveaways (id, event_id, name, drawing_date, created_by)
  values (v_giveaway_id, v_event_past, 'Trailhead Cleanup Giveaway', (now() - interval '40 days')::date, v_admin_id);

  insert into public.giveaway_prizes (giveaway_id, prize_name, donor_person_id, estimated_value, created_by)
  values (v_giveaway_id, 'Weekend cabin stay', v_person_sponsor, 400.00, v_admin_id)
  returning id into v_prize1;

  insert into public.giveaway_prizes (giveaway_id, prize_name, donor_person_id, estimated_value, created_by)
  values (v_giveaway_id, 'Gift basket', v_person_local_roasters, 60.00, v_admin_id)
  returning id into v_prize2;

  insert into public.giveaway_winners (giveaway_prize_id, winner_name, winner_contact, distribution_status, distributed_at, created_by)
  values (v_prize1, 'M. Alvarez', '555-0199', 'distributed', (now() - interval '38 days')::date, v_admin_id);

  insert into public.giveaway_winners (giveaway_prize_id, winner_name, distribution_status, created_by)
  values (v_prize2, 'T. Nguyen', 'pending', v_admin_id);

  -- The past event's Report card (#1576) computes every section from rows like
  -- these, so the event carries one of each: raffle tickets sold through a
  -- package, a paid expense beside the submitted one, a cash sponsorship whose
  -- mirrored gift must count once (as sponsorship, not also as a donation), and
  -- an incident.
  -- The tiers, grants and rules are seed_giveaway_tiers' defaults, written
  -- directly since the seed has no signed-in user to call it as. Tests that
  -- call it on this giveaway rely on finding them (it is a no-op once tiers
  -- exist), and the tenant-isolation suite needs a row in each table.
  insert into public.giveaway_tiers (giveaway_id, key, label, rank, created_by)
  values (v_giveaway_id, 'gold', 'Gold', 1, v_admin_id)
  returning id into v_giveaway_tier;
  insert into public.giveaway_tiers (giveaway_id, key, label, rank, created_by)
  values (v_giveaway_id, 'silver', 'Silver', 2, v_admin_id)
  returning id into v_giveaway_tier_silver;
  insert into public.giveaway_tiers (giveaway_id, key, label, rank, created_by)
  values (v_giveaway_id, 'bronze', 'Bronze', 3, v_admin_id)
  returning id into v_giveaway_tier_bronze;

  insert into public.giveaway_tier_grants (giveaway_id, source_tier_id, ticket_tier_id, quantity, created_by)
  values
    (v_giveaway_id, v_giveaway_tier, v_giveaway_tier, 3, v_admin_id),
    (v_giveaway_id, v_giveaway_tier, v_giveaway_tier_silver, 1, v_admin_id),
    (v_giveaway_id, v_giveaway_tier, v_giveaway_tier_bronze, 1, v_admin_id),
    (v_giveaway_id, v_giveaway_tier_silver, v_giveaway_tier, 1, v_admin_id),
    (v_giveaway_id, v_giveaway_tier_silver, v_giveaway_tier_silver, 3, v_admin_id),
    (v_giveaway_id, v_giveaway_tier_silver, v_giveaway_tier_bronze, 2, v_admin_id),
    (v_giveaway_id, v_giveaway_tier_bronze, v_giveaway_tier, 0, v_admin_id),
    (v_giveaway_id, v_giveaway_tier_bronze, v_giveaway_tier_silver, 1, v_admin_id),
    (v_giveaway_id, v_giveaway_tier_bronze, v_giveaway_tier_bronze, 3, v_admin_id);

  insert into public.giveaway_tier_rules (giveaway_id, tier_id, match_text, created_by)
  select v_giveaway_id, v_giveaway_tier, unnest(array['ski', 'snowboard', 'splitboard']), v_admin_id
  union all
  select v_giveaway_id, v_giveaway_tier_silver, unnest(array['jacket', 'pant', 'bib', 'outerwear', 'shell']), v_admin_id
  union all
  select v_giveaway_id, v_giveaway_tier_bronze, unnest(array['beanie', 'thermal', 'helmet cover', 'base layer']), v_admin_id;

  insert into public.giveaway_ticket_packages (giveaway_id, name, price, tier_id, bundle_quantity, created_by)
  values (v_giveaway_id, '5 gold tickets', 20.00, v_giveaway_tier, 5, v_admin_id)
  returning id into v_giveaway_package;

  insert into public.giveaway_ticket_sales (giveaway_id, package_id, quantity, unit_price, amount, sold_at, created_by)
  values
    (v_giveaway_id, v_giveaway_package, 3, 20.00, 60.00, now() - interval '40 days', v_admin_id),
    (v_giveaway_id, v_giveaway_package, 1, 20.00, 20.00, now() - interval '40 days', v_admin_id);

  -- The tickets those sales issued, expanded through the tier matrix the way
  -- record_giveaway_ticket_sale does, so the Giveaway card's "Tickets sold"
  -- has grants to count (#1577).
  insert into public.giveaway_ticket_grants (giveaway_id, ticket_tier_id, source_tier_id, quantity, sale_id, created_by)
  select v_giveaway_id, g.ticket_tier_id, g.source_tier_id, g.quantity * pkg.bundle_quantity * sale.quantity, sale.id, v_admin_id
  from public.giveaway_ticket_sales sale
  join public.giveaway_ticket_packages pkg on pkg.id = sale.package_id
  join public.giveaway_tier_grants g
    on g.giveaway_id = sale.giveaway_id and g.source_tier_id = pkg.tier_id
  where sale.giveaway_id = v_giveaway_id and g.quantity > 0;

  insert into public.event_expenses (event_id, description, expense_date, amount, currency, notes, status, created_by, submitted_by)
  values (v_event_past, 'Dumpster rental', current_date - 40, 150.00, 'USD', 'Paid on the day.', 'paid', v_admin_id, v_admin_id);

  insert into public.monetary_donations (donor_id, event_id, amount, method, received_date, notes, created_by)
  values (v_person_sponsor, v_event_past, 250.00, 'other', current_date - 40, 'Cleanup sponsorship.', v_admin_id)
  returning id into v_sponsor_cash;

  insert into public.event_sponsors (
    event_id, person_id, support_type, contribution_value, is_public, notes,
    monetary_donation_id, follow_up_status, created_by
  )
  values (
    v_event_past, v_person_sponsor, 'cash', 250.00, false,
    'Cleanup sponsorship.', v_sponsor_cash, 'not_started', v_admin_id
  );

  insert into public.event_incidents (event_id, occurred_at, description, severity, reported_by)
  values (v_event_past, now() - interval '40 days', 'Volunteer slipped on an icy step; first aid given on site.', 'minor', v_admin_id);

  -- Programs, event planning, volunteers, and attendance.
  insert into public.programs (id, name, description, status, created_by)
  values (v_program_id, 'Winter Access Program', 'Gear access and low-cost outdoor events for local participants.', 'active', v_admin_id);

  update public.events
  set description = 'A community gear exchange and winter access event.',
      capacity = 100,
      registration_enabled = true, registration_deadline = now() + interval '14 days',
      budget_amount = 2500.00, event_lead_id = v_person_volunteer
  where id = v_event_upcoming;

  insert into public.event_programs (event_id, program_id)
  values (v_event_upcoming, v_program_id);

  insert into public.event_logistics (event_id, meeting_point, gear_requirements, transportation, food, supplies, created_by)
  values (v_event_upcoming, 'Community Center front entrance', 'Bring clean winter gear to exchange.', 'RTD bus route 15', 'Coffee and snacks', 'Racks, hangers, intake forms', v_admin_id);

  insert into public.event_volunteers (event_id, person_id, role, notes, created_by)
  values (v_event_upcoming, v_person_volunteer, 'Intake lead', 'Welcomes donors and checks item condition.', v_admin_id);

  -- Staff, distinct from the volunteer above: the same person works this one
  -- in a scheduled capacity, which is exactly the both-at-once case #626
  -- exists to model.
  insert into public.event_staff (event_id, person_id, role, notes, created_by)
  values (v_event_upcoming, v_person_donor2, 'Basecamp lead', 'Runs the floor for the day.', v_admin_id);

  insert into public.event_staff (event_id, person_id, role, notes, created_by)
  values (v_event_past, v_person_volunteer, 'Guide', 'Paid guide for the day trip.', v_admin_id);

  insert into public.event_shifts (event_id, label, starts_at, ends_at, target_headcount, notes, created_by)
  values (v_event_upcoming, 'Morning setup', now() + interval '20 days' + interval '8 hours', now() + interval '20 days' + interval '10 hours', 3, 'Set up racks and intake tables.', v_admin_id)
  returning id into v_shift_id;

  update public.event_volunteers set shift_id = v_shift_id
  where event_id = v_event_upcoming and person_id = v_person_volunteer;

  -- Logged from the event editor's Volunteers tab. Since 20260904010000 that
  -- writes the shared volunteer_hours ledger too, with no role type -- the tab
  -- has no role picker. Kept distinct from the 3.00-hour entry below (same
  -- person and event, different work) so the rollup exercises multi-row summing.
  insert into public.volunteer_hours (event_id, person_id, hours, logged_date, notes, logged_by)
  values (v_event_past, v_person_volunteer, 4.50, current_date - 40, 'Cleanup and distribution support.', v_admin_id);

  insert into public.volunteer_role_types (name, description, is_public, created_by)
  values ('Ride Buddy', 'Supports participants during beginner outdoor activities.', true, v_admin_id)
  returning id into v_role_type_id;

  insert into public.volunteer_hours (person_id, event_id, volunteer_role_type_id, hours, logged_date, notes, logged_by)
  values (v_person_volunteer, v_event_past, v_role_type_id, 3.00, current_date - 40, 'Paired with first-time participants.', v_admin_id);

  -- Public volunteer applications, submitted via the /get-involved intake
  -- flow: one not yet followed up on, one an admin has picked up but not
  -- yet contacted.
  -- No role tag: the volunteer_applications row inserted right after is what
  -- derives the volunteer role (#624).
  insert into public.people (name, is_anonymous, source_type, email, phone, created_by)
  values ('Morgan Ellis', false, 'individual', 'morgan.ellis@example.test', '555-0105', v_admin_id)
  returning id into v_person_applicant;

  insert into public.volunteer_applications (person_id, name, email, phone, role_interest, availability, status, reference_code)
  values (v_person_applicant, 'Morgan Ellis', 'morgan.ellis@example.test', '555-0105', 'Ride Buddy', 'Weekend mornings', 'new', 'MRGNELLS');

  insert into public.people (name, is_anonymous, source_type, email, phone, created_by)
  values ('Taylor Kim', false, 'individual', 'taylor.kim@example.test', '555-0106', v_admin_id)
  returning id into v_person_applicant;

  insert into public.volunteer_applications (person_id, name, email, phone, role_interest, availability, status, reference_code)
  values (v_person_applicant, 'Taylor Kim', 'taylor.kim@example.test', '555-0106', 'Event Setup Crew', 'Weekday evenings', 'being reviewed', 'TYLRKIM2');

  -- Screening levels and two outcomes (#1360).
  --
  -- The migration seeds no levels on any tenant, because what the levels are
  -- is an organization decision. This is the worked case for local, CI and
  -- e2e: three levels in the vocabulary Chatter Snow's own policy draft uses,
  -- with descriptions at the length a real one runs to rather than a tidy
  -- one-liner, so the table and the sheet are laid out against the text they
  -- will actually hold.
  insert into public.volunteer_screening_tiers (name, description, sort_order, is_active, created_by)
  values (
    'Tier 0 — general volunteer',
    'Event setup, gear sorting, day-of logistics and social content. Always working alongside others, with no unsupervised contact with participants, no access to the operations portal and no handling of money. Identity confirmed, two references for anyone taking a recurring role, and agreement to the code of conduct.',
    0, true, v_admin_id
  );

  insert into public.volunteer_screening_tiers (name, description, sort_order, is_active, created_by)
  values (
    'Tier 1 — trusted volunteer',
    'Ride Buddy and any role pairing a volunteer one-to-one with a participant, gear library pickups, and anyone holding portal access to personal data. Everything Tier 0 asks for, plus an application interview, plus a background check where the board has decided one applies to the role.',
    10, true, v_admin_id
  )
  returning id into v_screening_tier_1;

  insert into public.volunteer_screening_tiers (name, description, sort_order, is_active, created_by)
  values (
    'Tier 2 — officers and anyone handling money',
    'Board members, anyone holding finance access, and anyone who can approve a reimbursement or hold a donation. Everything Tier 1 asks for, plus a conflict-of-interest disclosure, plus a check appropriate to fiduciary responsibility.',
    20, true, v_admin_id
  )
  returning id into v_screening_tier_2;

  -- One live clearance and one that has lapsed, so the expired rendering path
  -- is exercised by default rather than only by a test that remembers to set
  -- it up.
  insert into public.person_screenings (person_id, tier_id, cleared_on, expires_on, created_by)
  values (v_person_volunteer, v_screening_tier_1, current_date - 200, current_date + 895, v_admin_id);

  insert into public.person_screenings (person_id, tier_id, cleared_on, expires_on, created_by)
  values (v_person_volunteer, v_screening_tier_2, current_date - 1200, current_date - 105, v_admin_id);

  -- Conduct reports (#687).
  --
  -- The migration seeds none on any tenant and no clocks on any tenant but the
  -- first, because both are an organization's own decisions. This is the worked
  -- case for local, CI and e2e, and it is deliberately a worked case rather
  -- than a tidy one: an anonymous report and a named one, one acknowledged
  -- inside the window and one that has blown through it, an interim action
  -- still in force, a recusal with its reason, and an appeal. Every rendering
  -- path in the section therefore has something to render by default, rather
  -- than only when a test remembers to set it up.
  --
  -- The four clocks first, so the queue's indicators mean something here. They
  -- are `example-nonprofit`'s own numbers, not the platform's -- see
  -- 20260923010000, which writes Chatter Snow's and nobody else's.
  insert into public.app_settings (key, value) values
    ('conduct.acknowledgement_days', '5'::jsonb),
    ('conduct.appeal_days', '14'::jsonb),
    ('conduct.reviewer_minimum', '2'::jsonb),
    ('conduct.appeal_excludes_original_reviewers', 'true'::jsonb)
  on conflict (tenant_id, key) do nothing;

  -- And the grant that makes a board member assignable. The migration seeds
  -- `board: none` on every tenant on purpose -- whose job this is differs by
  -- organization -- so this is the local tenant deciding, which is exactly the
  -- act an administrator performs in Administration > Roles.
  update public.role_permissions rp
     set level = 'view'
    from public.roles r, public.resources res
   where rp.role_id = r.id
     and rp.resource_id = res.id
     and r.name = 'board'
     and res.key = 'conduct_reports';

  insert into public.conduct_reports (
    id, reference, received_on, channel, reporter_kind, reporter_name,
    reporter_contact, subject_person_id, subject_description, summary,
    severity, status, acknowledged_on, created_by
  ) values (
    'acacacac-0000-4000-8000-000000000001', 'CR-4QTXM', current_date - 3,
    'email', 'named', 'Robin Alvarez', 'robin.alvarez@example.test',
    null, 'A coach in a red jacket, at the top of the beginner run',
    'Robin wrote in on Sunday evening to say that during the afternoon session a coach shouted at their nephew in front of the whole group after he fell at the top of the beginner run, told him he was "wasting everyone''s time", and then refused to let him take the lift again. Robin says two other parents saw it and one of them went to find a staff member, who could not be found. Robin is not asking for anybody to be removed but wants to know that it has been taken seriously, and does not want to be named to the coach.',
    'serious', 'acknowledged', current_date - 2, v_admin_id
  );

  insert into public.conduct_reports (
    id, reference, received_on, channel, reporter_kind, subject_description,
    context, summary, severity, status, created_by
  ) values (
    'acacacac-0000-4000-8000-000000000002', 'CR-7HJ2K', current_date - 11,
    'in_person', 'anonymous', 'Somebody in the Wednesday group chat',
    'The Wednesday evening group chat',
    'Somebody stopped a volunteer at the end of the Wednesday session to say that the group chat has been getting uncomfortable — comments about who is and is not "a real rider", and one exchange late at night that they described as personal rather than about riding. They did not want to give their name and did not want the chat shut down, only for somebody to say something in it.',
    'moderate', 'received', v_admin_id
  );

  -- Two reviewers on the first case, one of whom has stepped back. The recusal
  -- keeps its row and its reason, which is the whole reason reviewers are a
  -- table: "two unconflicted reviewers" is evidence only if both halves are
  -- written down.
  insert into public.conduct_report_reviewers (report_id, stage, user_id, assigned_on, assigned_by)
  values ('acacacac-0000-4000-8000-000000000001', 'review', v_admin_id, current_date - 2, v_admin_id);

  insert into public.conduct_report_reviewers (
    report_id, stage, user_id, assigned_on, assigned_by, recused_on, recusal_reason
  )
  select 'acacacac-0000-4000-8000-000000000001', 'review', u.id, current_date - 2, v_admin_id,
         current_date - 1, 'The coach named in the report coaches my daughter''s group.'
  from auth.users u where u.email = 'board@example.test';

  -- A third case, closed, with an appeal that was filed inside the window and
  -- heard. It is what "All cases" shows that "Open cases" does not, and it is
  -- the only row in `conduct_report_appeals` -- which the tenant-isolation
  -- suite requires, since its per-table check means nothing on an empty table.
  insert into public.conduct_reports (
    id, reference, received_on, channel, reporter_kind, reporter_name,
    subject_description, context, summary, severity, status,
    acknowledged_on, decided_on, outcome, closed_on, created_by
  ) values (
    'acacacac-0000-4000-8000-000000000003', 'CR-2WNPF', current_date - 70,
    'phone', 'named', 'Sam Okafor',
    'A volunteer on the gear table', 'The Saturday gear pickup',
    'Sam called to say that a volunteer handing out gear had been short with their daughter about the size she had asked for, in front of the queue, and that she left without taking anything. Sam was not asking for a sanction and said the volunteer had been helpful on other days; they wanted somebody to notice the pattern they thought they were seeing on busy mornings.',
    'minor', 'closed', current_date - 68, current_date - 60,
    'Spoken to by the volunteer coordinator. No further action, and the gear table now runs two people on Saturday mornings.',
    current_date - 40, v_admin_id
  );

  insert into public.conduct_report_appeals (
    report_id, filed_on, grounds, decided_on, outcome, created_by
  ) values (
    'acacacac-0000-4000-8000-000000000003', current_date - 55,
    'The volunteer wrote back to say the conversation had been described to them second hand and that they were not asked what happened before the decision was made.',
    current_date - 45,
    'Heard by two board members who were not part of the original decision. The finding stands, and the note on the file now records the volunteer''s own account alongside it.',
    v_admin_id
  );

  -- An interim measure that is still in force. Nothing about closing the case
  -- or filing an appeal lifts it: `lifted_on is null` is the only definition of
  -- "in force" anywhere in this feature.
  insert into public.conduct_report_actions (report_id, kind, description, taken_on, created_by)
  values (
    'acacacac-0000-4000-8000-000000000001', 'interim',
    'The coach is not rostered on beginner sessions while we look into this. Agreed with them by phone on the day the report came in, and they know why.',
    current_date - 2, v_admin_id
  );

  -- Public contact-form submissions, exercising the ops inbox (issue #173):
  -- one unread so the notification bell/dashboard card have something to
  -- show out of the box, one already resolved to demonstrate the workflow.
  insert into public.contact_messages (name, email, topic, message, status)
  values ('Drew Sato', 'drew.sato@example.test', 'partnership', 'We run a gear shop downtown and would love to talk about a seasonal donation drive.', 'new');

  insert into public.contact_messages (name, email, topic, message, status)
  values ('Casey Nolan', 'casey.nolan@example.test', 'general', 'Do you have gear available in kids sizes right now?', 'resolved');

  -- #685: the one seeded party with a minor in it, so the registrant list has
  -- a badge to render, `event_registration_minor_contacts` has a row to gate,
  -- and the retention purge has something to clear. Every other seeded
  -- registration leaves the column null -- which is what a walk-in and a row
  -- written before the question existed look like, and never a "no".
  insert into public.event_registrations (
    event_id, name, email, phone, party_size, notes, person_id, checked_in_at,
    party_includes_minor, accompanying_adult_name, accompanying_adult_phone,
    emergency_contact_name, emergency_contact_phone
  )
  values (
    v_event_upcoming, 'Jamie Rivera', 'jamie.rivera@example.test', '555-0101', 2,
    'Needs one adult medium jacket.', v_person_donor1, null,
    true, 'Jamie Rivera', '555-0101', 'Robin Rivera', '555-0102'
  )
  returning id into v_registration_id;

  insert into public.discount_codes (event_id, code, description, source, registration_id, assigned_at, created_by)
  values (v_event_upcoming, 'SUMMIT-20', 'Twenty percent off partner gear', 'Summit Outdoor Co.', v_registration_id, now(), v_admin_id);

  -- The four typed figures were archived by #1588: nothing writes them, and
  -- the Results card shows these read-only as "Entered by hand (archived)",
  -- beside the derived ones and never added to them. Only `notes` is still
  -- written.
  insert into public.event_impact_notes (
    event_id, first_time_riders, rental_subsidies_count, assistance_total,
    beginner_pairings_count, notes, created_by
  )
  values (v_event_past, 14, 7, 480.00, 9, 'Participants especially valued loaner gear and peer support.', v_admin_id);

  -- #1588: what the past event's Outcomes derive from, so the Results card
  -- has every figure to show out of the box. Two checked-in riders whose level
  -- was snapshotted at the door -- one first time on snow, one beginner (the
  -- snapshots are seeded with the profile questions below, #1746) -- each
  -- holding a code with a kind and value, plus a paid expense marked
  -- participant assistance.
  insert into public.event_registrations (
    event_id, name, email, party_size, person_id, checked_in_at
  )
  values (
    v_event_past, 'Alex Chen', 'alex.chen@example.test', 1, v_person_donor2,
    now() - interval '40 days'
  )
  returning id into v_past_first_timer;

  insert into public.event_registrations (
    event_id, name, email, party_size, person_id, checked_in_at
  )
  values (
    v_event_past, 'Jamie Rivera', 'jamie.rivera@example.test', 1, v_person_donor1,
    now() - interval '40 days'
  )
  returning id into v_past_returning;

  insert into public.discount_codes (event_id, code, pin, description, source, kind, value, registration_id, assigned_at, created_by)
  values
    (v_event_past, 'TRAIL-RENT-1', '4821', 'Free board and boot rental', 'Bear Creek Rentals', 'rental', 45.00, v_past_first_timer, now() - interval '42 days', v_admin_id),
    (v_event_past, 'TRAIL-LIFT-1', '9930', 'Half-day lift ticket', 'Bear Creek Resort', 'lift', 60.00, v_past_returning, now() - interval '42 days', v_admin_id),
    (v_event_past, 'TRAIL-RENT-2', '1177', 'Free board and boot rental', 'Bear Creek Rentals', 'rental', 45.00, null, null, v_admin_id);

  -- #1589: the past event asks Chatter Snow's question with priced options,
  -- and the partner gave one shared code for everybody (50% off a ticket and
  -- the ticket-and-gear bundle) with a PIN. Each registrant's answer copies
  -- its price. Discount value offered: shared 50% of $130 + 50% of $80 =
  -- $105; single-use TRAIL-LIFT-1 covers 100% of Jamie's $80 ticket, and
  -- TRAIL-RENT-1 covers no option so falls back to its typed $45.
  update public.events
     set registration_options_prompt = 'What does each person need?'
   where id = v_event_past;

  insert into public.event_registration_options (event_id, label, sort_order, price)
  values
    (v_event_past, 'I''ll use my own', 0, null),
    (v_event_past, 'I need a ticket', 1, 80.00),
    (v_event_past, 'I need a ticket and gear', 2, 130.00);

  insert into public.event_registration_option_counts (registration_id, option_id, label, sort_order, quantity, price)
  select reg.id, o.id, o.label, o.sort_order, 1, o.price
    from (values (v_past_first_timer, 'I need a ticket and gear'),
                 (v_past_returning, 'I need a ticket')) as answer(registration_id, label)
    join public.event_registrations reg on reg.id = answer.registration_id
    join public.event_registration_options o
      on o.event_id = v_event_past and o.label = answer.label;

  insert into public.discount_codes (event_id, code, pin, shared, description, source, kind, created_by)
  values (v_event_past, 'TRAIL-GROUP-50', '7731', true, 'Half off a lift ticket or ticket and gear', 'Bear Creek Resort', 'lift', v_admin_id);

  insert into public.discount_code_options (code_id, option_id, percent_off)
  select dc.id, o.id, cover.percent_off
    from (values ('TRAIL-GROUP-50', 'I need a ticket', 50.00),
                 ('TRAIL-GROUP-50', 'I need a ticket and gear', 50.00),
                 ('TRAIL-LIFT-1', 'I need a ticket', 100.00)) as cover(code, label, percent_off)
    join public.discount_codes dc on dc.event_id = v_event_past and dc.code = cover.code
    join public.event_registration_options o
      on o.event_id = v_event_past and o.label = cover.label;

  insert into public.event_expenses (event_id, description, expense_date, amount, currency, notes, status, participant_assistance, created_by, submitted_by)
  values (v_event_past, 'Ski rentals for two participants', current_date - 40, 90.00, 'USD', 'Paid at the rental counter.', 'paid', true, v_admin_id, v_admin_id);

  -- The past event's retro (#1578): one of each kind, plus an action already
  -- done, owned by the guide on its staff roster.
  insert into public.event_retro_items (event_id, kind, body, area, author_id, owner_person_id, status, completed_at, created_at)
  values
    (v_event_past, 'went_well', 'Ability groups kept everyone moving; nobody waited long at the trailhead.', 'guests', v_admin_id, null, null, null, now() - interval '39 days'),
    (v_event_past, 'improve', 'The sign-in table backed up at the start. Two greeters next time.', 'operations', v_admin_id, null, null, null, now() - interval '39 days'),
    (v_event_past, 'action', 'Print the roster the night before rather than the morning of.', 'operations', v_admin_id, v_person_volunteer, 'open', null, now() - interval '39 days'),
    (v_event_past, 'action', 'Send thank-you notes to the giveaway prize donors.', 'sponsors', v_admin_id, v_person_volunteer, 'done', now() - interval '35 days', now() - interval '39 days');

  -- Content and community calendar.
  insert into public.calendar_items (
    id, title, item_type, starts_at, ends_at, time_zone, summary, priority_tier,
    priority_rationale, calendar_status, visibility, owner_id, public_url, created_by
  )
  values (
    v_calendar_promo_id, 'Winter Gear Swap Promotion', 'content_opportunity', now() + interval '12 days', now() + interval '12 days' + interval '1 hour',
    'America/Denver', 'Promote the upcoming gear swap and registration link.', 1, 'Directly supports participant access and event turnout.',
    'active', 'public', v_admin_person_id, 'https://example.test/events/winter-gear-swap', v_admin_id
  );

  insert into public.calendar_item_categories (item_id, category)
  values (v_calendar_promo_id, 'own_events'), (v_calendar_promo_id, 'campaigns_fundraising');

  insert into public.calendar_item_programs (item_id, program_id)
  values (v_calendar_promo_id, v_program_id);

  -- Three content pieces on one calendar item (#1231): the shape the portal is
  -- built for, and what the item-detail e2e spec reads. Deliberately at three
  -- different statuses so the list badge ("least-advanced piece still needing
  -- work") has something real to summarise, and the longest `content` runs to
  -- the length a real plan reaches rather than a one-line sample.
  -- `created_at` is staggered because it is what the portal orders the list
  -- by, and its default is now() -- transaction time, identical for all three
  -- rows of one insert.
  insert into public.content_opportunities (
    calendar_item_id, title, content, content_status, owner_id, reviewer_id,
    lead_time_days, publish_due_at, created_at, created_by
  )
  values
  (
    v_calendar_promo_id, 'Instagram carousel: how the gear swap works',
    E'Our connection: show how shared gear helps neighbors get outdoors, using last year''s participants rather than stock photography.\n\nFormats: five-slide Instagram carousel, cross-posted to the event page. Slide one is the date and the registration link; slides two to four walk through dropping off, browsing and taking home; slide five is the accessibility note and who to contact.\n\nCall to action: register, and bring one thing you have outgrown.\n\nStill outstanding: confirm the final registration link, get written permission for the two participant photos, and check the accessibility details against the venue''s own page before this goes out.',
    'draft', v_admin_person_id, v_admin_person_id, 14,
    now() + interval '7 days', now() - interval '3 hours', v_admin_id
  ),
  (
    v_calendar_promo_id, 'Email to past participants',
    E'Short, plain and personal: last year''s swap in two sentences, this year''s date, and the registration link. No images.\n\nCall to action: register, and forward it to one person who has been putting off trying a winter sport.',
    'idea', v_admin_person_id, null, 21,
    now() + interval '9 days', now() - interval '2 hours', v_admin_id
  ),
  (
    v_calendar_promo_id, 'Day-of story: the swap in progress',
    E'A handful of stories from the swap itself. Written the morning of, not planned in advance beyond knowing who is holding the phone.',
    'not_planned', null, null, 3,
    now() + interval '12 days', now() - interval '1 hour', v_admin_id
  );

  -- Structured-recurrence calendar item (issue #191): dated to today so the
  -- coverage reminder/"generate next year" flow has something to act on
  -- immediately after a fresh `db reset`, without waiting for a real
  -- October or hand-seeding via the production Tier 1/2 migration (which
  -- only applies when the founding admin's real email exists, which it
  -- doesn't in local dev -- see 20260826070000_seed_tier1_tier2_calendar_
  -- items.sql). Visit /portal/calendar/import to see it flagged as missing
  -- next year's instance and try "Generate".
  -- Anchored to the item's own zone (America/Denver), not UTC's day
  -- boundary -- truncating now() in UTC would read as "yesterday" in
  -- Denver for roughly a third of the day, both in starts_at/ends_at and
  -- in the recurrence_start_*/recurrence_end_* month-day anchors below.
  v_recurring_local_date := (now() at time zone 'America/Denver')::date;

  insert into public.calendar_items (
    id, title, item_type, starts_at, ends_at, time_zone, recurrence_rule,
    summary, priority_tier, calendar_status, visibility, source, region,
    series_key, recurrence_start_month, recurrence_start_day,
    recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end,
    created_by
  )
  values (
    v_calendar_recurring_id, 'Sample Recurring Observance', 'community_observance',
    (v_recurring_local_date::text || ' 00:00:00 America/Denver')::timestamptz,
    (v_recurring_local_date::text || ' 23:59:59 America/Denver')::timestamptz,
    'America/Denver', 'Annually on ' || to_char(v_recurring_local_date, 'FMMonth FMDD'),
    'Seed-only stand-in recurring observance for exercising the coverage reminder and bulk-import/generate flow locally.',
    1, 'idea', 'internal', 'Seed data', 'us',
    v_calendar_recurring_series_key, extract(month from v_recurring_local_date)::smallint, extract(day from v_recurring_local_date)::smallint,
    extract(month from v_recurring_local_date)::smallint, extract(day from v_recurring_local_date)::smallint, false,
    v_admin_id
  );

  insert into public.calendar_item_categories (item_id, category)
  values (v_calendar_recurring_id, 'lgbtq_community');

  -- Governance records and nonprofit tracking are separate from event data.
  insert into public.board_members (person_id, role_title, term_start, term_end, notes, created_by)
  values (v_person_sponsor, 'Community advisor', current_date - 120, current_date + 245, 'Seeded governance example.', v_admin_id);

  insert into public.governance_meetings (id, meeting_date, meeting_type, status, location, notes, facilitator_person_id, notetaker_person_id, created_by)
  values (v_meeting_id, now() - interval '14 days', 'board', 'completed', 'Video conference', 'Reviewed winter access program launch.', v_person_sponsor, v_person_volunteer, v_admin_id);

  insert into public.governance_meeting_attendees (meeting_id, person_id, attended, created_by)
  values (v_meeting_id, v_person_sponsor, true, v_admin_id);

  select id into v_agenda_template_id from public.agenda_templates where key = 'board_meeting';
  select current_version_id into v_agenda_template_version_id from public.agenda_templates where id = v_agenda_template_id;

  -- The `ongoing_items` and `upcoming_dates` shapes here are the ones the app
  -- reads (#1199). They were `{"finance_fundraising": "..."}` and a bare string
  -- array until then -- well-formed JSON in the wrong shape, so `agenda-tab.tsx`
  -- read `ongoing_items[key]?.updates` off a string and rendered every seeded
  -- section as an em dash: a seed that looked populated and displayed empty.
  -- All seven template sections are filled, because the minutes snapshot is
  -- built from these columns and a half-filled agenda makes a half-blank guide.
  insert into public.agendas (
    meeting_id, external_link, body_text, template_id, template_version_id, ongoing_items,
    new_business, parking_lot, upcoming_dates, next_meeting_date, next_meeting_topics, created_by
  )
  values (
    v_meeting_id, 'https://example.test/board/winter-agenda.pdf',
    'Program launch and the nonprofit formation timeline are the two items needing a decision today; everything else is a status update.',
    v_agenda_template_id, v_agenda_template_version_id,
    '{
      "finance_fundraising": {
        "updates": "Operating balance is healthy going into the swap. Sponsorship income for the Winter Gear Swap is confirmed in full, and the two outstanding pledges from last quarter have cleared. Expenses are tracking under projection, mostly because the venue waived its cleaning fee.",
        "decisions_needed": "Whether to open a second account for restricted funds before the first grant arrives, or keep everything in one account with a tracking column until the volume justifies the split."
      },
      "legal_nonprofit": {
        "updates": "The fiscal sponsorship agreement is signed and countersigned. The 501(c)(3) application is drafted but not filed; the remaining gap is the conflict-of-interest policy, which needs a board vote before it can be attached.",
        "decisions_needed": "Adopt the conflict-of-interest policy as drafted, or send it back for a second read."
      },
      "events": {
        "updates": "Winter Gear Swap logistics are confirmed: venue, insurance, volunteer shifts and the gear intake table. Two vendors dropped out and have been replaced. Post-event follow-up reuses the survey sent after the fall swap.",
        "decisions_needed": "Cap attendance at the venue limit, or run a waitlist."
      },
      "community_partnerships": {
        "updates": "Two partnership conversations are open, one with a regional ski club and one with an LGBTQ+ community centre. Neither is ready to commit to a written agreement, and both asked for a one-page description of what partnering involves.",
        "decisions_needed": ""
      },
      "marketing_social": {
        "updates": "The swap campaign is scheduled through the event date and the important community dates for next quarter are on the calendar. We are short on community stories; the two we have are both from the same event.",
        "decisions_needed": ""
      },
      "operations": {
        "updates": "Inventory intake is caught up. The storage unit is at roughly three quarters capacity, which is the real constraint on how much gear the swap can accept. Volunteer coordination has moved into the portal and is no longer tracked in a spreadsheet.",
        "decisions_needed": "Whether to rent a second storage unit before the swap, or limit intake on the day."
      },
      "technology_website": {
        "updates": "The portal is in daily use for events, inventory and governance. Domain and account access is documented. No outstanding security items.",
        "decisions_needed": ""
      }
    }'::jsonb,
    '["Discuss Q1 grant applications"]'::jsonb, '["Revisit storage unit lease renewal"]'::jsonb,
    '[
      {"date": "2026-04-01", "description": "Winter Gear Swap", "owner": "Events lead"},
      {"date": "2026-04-15", "description": "Fiscal sponsor quarterly report due", "owner": "Treasurer"}
    ]'::jsonb,
    current_date + 30, 'Post-event debrief; nonprofit formation update.',
    v_admin_id
  );
  insert into public.governance_meeting_action_items (meeting_id, description, owner_person_id, due_date, created_by)
  values (v_meeting_id, 'Confirm partner gear donation schedule.', v_person_sponsor, current_date + 14, v_admin_id);
  insert into public.governance_meeting_decisions (meeting_id, description, decision_date, topic, vote_result, created_by)
  values (v_meeting_id, 'Proceed with the winter gear swap pilot.', current_date - 14, 'Winter access program launch', 'Passed unanimously', v_admin_id);
  insert into public.resolutions (meeting_id, motion_text, mover_person_id, seconder_person_id, vote_outcome, effective_date, created_by)
  values (v_meeting_id, 'Adopt the winter access program as a core initiative.', v_person_sponsor, v_person_volunteer, 'passed', current_date - 14, v_admin_id);

  -- One finalized set of minutes on the past meeting (#1199), so the Minutes
  -- tab has something to open locally that is not an empty draft.
  --
  -- The snapshot is assembled from the agenda and its pinned template version
  -- rather than written out as a literal, which is exactly what
  -- buildMinutesSnapshot() does at runtime: a hand-written copy would drift
  -- from the template the first time anyone edited the template seed, and the
  -- item keys are what the notes below are keyed to.
  insert into public.meeting_minutes (
    meeting_id, agenda_snapshot, notes, body_text, status,
    finalized_at, finalized_by, created_by, updated_by
  )
  select
    v_meeting_id,
    jsonb_build_object(
      'version', 1,
      'meeting_date', to_char(m.meeting_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'template_id', v_agenda_template_id,
      'template_version_id', v_agenda_template_version_id,
      'external_link', a.external_link,
      'items',
        jsonb_build_array(
          jsonb_build_object(
            'key', 'opening', 'label', 'Opening', 'kind', 'opening',
            'planned', jsonb_build_object('topics', jsonb_build_array(
              'Welcome and call to order', 'Confirm quorum',
              'Approve previous meeting minutes', 'Review agenda'))),
          jsonb_build_object(
            'key', 'carried_over',
            'label', 'Action items from previous meeting',
            'kind', 'carried_over')
        )
        || (
          select jsonb_agg(
            jsonb_build_object(
              'key', 'section:' || (t.section ->> 'key'),
              'label', t.section ->> 'label',
              'kind', 'section',
              'planned', jsonb_build_object(
                'updates', coalesce(a.ongoing_items -> (t.section ->> 'key') ->> 'updates', ''),
                'decisions_needed', coalesce(a.ongoing_items -> (t.section ->> 'key') ->> 'decisions_needed', ''),
                'topics', coalesce(t.section -> 'topics', '[]'::jsonb)))
            order by t.ord)
          from jsonb_array_elements(v.sections) with ordinality as t(section, ord)
        )
        || jsonb_build_array(
          jsonb_build_object('key', 'decisions', 'label', 'Decisions & votes', 'kind', 'decisions'))
        || (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'key', 'new_business:' || (t.ord - 1),
              'label', t.entry,
              'kind', 'new_business',
              'planned', jsonb_build_object('text', t.entry))
            order by t.ord), '[]'::jsonb)
          from jsonb_array_elements_text(a.new_business) with ordinality as t(entry, ord)
        )
        || jsonb_build_array(
          jsonb_build_object(
            'key', 'upcoming_dates', 'label', 'Upcoming dates', 'kind', 'upcoming_dates',
            'planned', jsonb_build_object('topics', coalesce((
              select jsonb_agg(concat_ws(' — ', d ->> 'date', d ->> 'description', d ->> 'owner'))
              from jsonb_array_elements(a.upcoming_dates) as d), '[]'::jsonb))),
          jsonb_build_object(
            'key', 'parking_lot', 'label', 'Parking lot', 'kind', 'parking_lot',
            'planned', jsonb_build_object('topics', coalesce(a.parking_lot, '[]'::jsonb))),
          jsonb_build_object(
            'key', 'next_meeting', 'label', 'Next meeting', 'kind', 'next_meeting',
            'planned', jsonb_build_object(
              'text', concat_ws(' — ', a.next_meeting_date::text, a.next_meeting_topics))))
    ),
    '{
      "opening": "Called to order at 18:04. Quorum confirmed with four of five board members present; the fifth sent regrets in advance and had reviewed the papers.\n\nMinutes of the previous meeting were approved as circulated, with one correction: the storage unit lease renewal date was recorded as the 12th and is in fact the 21st.\n\nThe agenda was accepted without changes.",
      "carried_over": "Both items carried over from last time are done. The partner gear donation schedule is confirmed through the end of the season, and the insurance certificate has been received and filed.",
      "section:finance_fundraising": "The treasurer walked through the operating balance and the sponsorship income for the swap, both of which are where the agenda said they would be. The two pledges that had been outstanding since last quarter have now cleared, which closes the only receivable on the books.\n\nOn the restricted-funds question the board went back and forth. The argument for a second account is that a grantor asking how restricted money is segregated wants a simpler answer than a tracking column. The argument against is that a second account is another reconciliation every month for a volunteer treasurer, and nothing is restricted yet.\n\nResolved to keep one account for now and revisit the moment the first restricted grant is actually awarded, rather than in anticipation of one. The treasurer will add a note to the grant application checklist so this is not forgotten.",
      "section:legal_nonprofit": "The fiscal sponsorship agreement is fully executed and a copy is filed in the governance folder.\n\nThe conflict-of-interest policy was read in full. Two changes were requested from the floor: the annual disclosure should name the calendar year it covers rather than the date it was signed, and the recusal language should cover board members'' immediate family, not only the members themselves.\n\nWith those two changes the policy was adopted. The 501(c)(3) application can now be filed with the policy attached; the target is before the end of the month.",
      "section:events": "Swap logistics were confirmed section by section against the run sheet. The two replacement vendors have both been given the load-in time and the intake table layout.\n\nOn attendance, the board chose a waitlist over a hard cap. A cap turns people away at the door, which is the opposite of the point of the event; a waitlist at least tells us how much demand we are missing and gives us a list to invite to the next one.",
      "section:community_partnerships": "Both partnership conversations were reported as open and neither is ready for a written agreement. The board agreed that the one-page description both organizations asked for is worth writing once and reusing, rather than drafting a bespoke note each time, and that it should say plainly what we are asking for and what we are offering.",
      "section:marketing_social": "The campaign schedule was noted with no changes. The shortage of community stories was discussed briefly: the suggestion was to ask at the swap itself, while people are holding gear they are pleased with, rather than by email afterwards.",
      "section:operations": "Storage came up as the binding constraint on the swap. Renting a second unit before the event was rejected on cost — it would be a monthly commitment to solve a one-day problem.\n\nInstead intake on the day will be limited to what can leave with somebody the same day, with anything left over going to the partner organization that has offered overflow space. The operations lead will confirm that offer in writing before the event.",
      "section:technology_website": "Nothing to decide. Access documentation was noted as current.",
      "decisions": "Two decisions were recorded formally: adopting the conflict-of-interest policy as amended, and proceeding with the winter gear swap pilot. The resolution adopting the winter access program as a core initiative was moved, seconded and passed.",
      "new_business:0": "Q1 grant applications were discussed as a block. Three are plausible; one has a deadline inside four weeks and would need the 501(c)(3) filing to be in flight, which it now will be. Agreed to prioritise that one and treat the other two as next quarter''s work.",
      "upcoming_dates": "Both dates were read out and confirmed. The fiscal sponsor quarterly report is the one with no slack in it.",
      "parking_lot": "The storage unit lease renewal stays parked until the swap is over, since the intake decision above changes what we need from it.",
      "next_meeting": "Confirmed for the scheduled date. Standing items plus the post-event debrief and a nonprofit formation update."
    }'::jsonb,
    'Adjourned at 19:52. Minutes taken by the notetaker of record and circulated the following day for approval at the next meeting.',
    'final',
    m.meeting_date + interval '2 hours',
    v_admin_id, v_admin_id, v_admin_id
  from public.governance_meetings m
  join public.agendas a on a.meeting_id = m.id
  join public.agenda_template_versions v on v.id = v_agenda_template_version_id
  where m.id = v_meeting_id;

  -- Administration edge cases: a staged invite and a deliberately deactivated user.
  insert into public.pending_role_grants (email, role_id, status, expires_at, name, created_by, invited_at, invited_by)
  select 'newvolunteer@example.test', r.id, 'pending', now() + interval '30 days', 'Quinn Harper', v_admin_id, now() - interval '1 day', v_admin_id
  from public.roles r where r.name = 'volunteer';

  insert into public.deactivated_users (user_id, deactivated_at, deactivated_by)
  values (v_former_id, now() - interval '5 days', v_admin_id);

  -- Merchandise catalog (#907). Three products, six variants: one
  -- single-variant product, one sized in three, and one where the variants are
  -- pack sizes at different prices -- so the Products admin has all three
  -- shapes to render without anyone having to type them in.
  --
  -- Literal ids, mirrored in test/seed-fixtures.ts (SEEDED_PRODUCT_IDS,
  -- SEEDED_VARIANT_IDS). created_by is named rather than defaulted: the column
  -- is `not null default auth.uid()` and this file runs as postgres with no
  -- session, so the default would come back null.
  --
  -- `stock_on_hand` below is already net of the completed sale further down --
  -- see the note there.
  insert into public.products (id, name, description, sort_order, created_by) values
    ('cdcdcdcd-0000-4000-8000-000000000001', 'Chatter Snow Beanie', 'Cuffed knit beanie with the embroidered logo.', 10, v_admin_id),
    ('cdcdcdcd-0000-4000-8000-000000000002', 'Trailhead Tee', 'Soft cotton tee, printed front and back.', 20, v_admin_id),
    ('cdcdcdcd-0000-4000-8000-000000000003', 'Sticker Pack', 'Weatherproof vinyl stickers, assorted designs.', 30, v_admin_id);

  insert into public.product_variants (id, product_id, label, sku, price, stock_on_hand, sort_order, created_by) values
    ('cdcdcdcd-0000-4000-8000-000000001001', 'cdcdcdcd-0000-4000-8000-000000000001', 'One size', 'CS-BEANIE', 20.00, 38, 10, v_admin_id),
    ('cdcdcdcd-0000-4000-8000-000000001002', 'cdcdcdcd-0000-4000-8000-000000000002', 'S', 'CS-TEE-S', 25.00, 12, 10, v_admin_id),
    ('cdcdcdcd-0000-4000-8000-000000001003', 'cdcdcdcd-0000-4000-8000-000000000002', 'M', 'CS-TEE-M', 25.00, 17, 20, v_admin_id),
    ('cdcdcdcd-0000-4000-8000-000000001004', 'cdcdcdcd-0000-4000-8000-000000000002', 'L', 'CS-TEE-L', 25.00, 15, 30, v_admin_id),
    -- No SKU on either sticker pack, which is what the partial unique index on
    -- (tenant_id, sku) is there for: a plain unique would allow exactly one.
    ('cdcdcdcd-0000-4000-8000-000000001005', 'cdcdcdcd-0000-4000-8000-000000000003', 'Pack of 5', null, 5.00, 120, 10, v_admin_id),
    ('cdcdcdcd-0000-4000-8000-000000001006', 'cdcdcdcd-0000-4000-8000-000000000003', 'Pack of 12', null, 10.00, 60, 20, v_admin_id);

  -- Two sales on the past event (#908), so the ledger, the event's Sales tab
  -- and the void path all have something to render on a fresh reset.
  --
  -- Written straight into the tables rather than through record_product_sale:
  -- the RPC reads `has_permission`, which reads `auth.uid()`, and this file
  -- runs as postgres with no session. What the RPC would have done is done
  -- here by hand instead, and the stock above is the part that matters --
  -- `product_variants.stock_on_hand` is already net of the completed sale (two
  -- beanies off 40, one medium tee off 18), because a seeded ledger that
  -- disagreed with the stock it supposedly moved would make every
  -- stock-arithmetic assertion downstream meaningless. The voided sale needs no
  -- adjustment, which is the point of it: its units came back.
  --
  -- The voided row carries voided_at in the same insert, not a follow-up
  -- update: `sales_void_state` asserts that `status = 'voided'` and
  -- `voided_at is not null` are one state, so a two-step write would be
  -- rejected halfway.
  --
  -- `receipt_number` is spelled out rather than left to the
  -- assign_sale_receipt_number trigger (#1016), so the numbers on these two
  -- rows are the same on every reset -- test/seed-fixtures.ts states them and
  -- the e2e ledger assertion reads them.
  insert into public.sales (
    id, event_id, purchaser_person_id, sold_at, payment_method,
    subtotal, discount_amount, total, status,
    voided_at, voided_by, void_reason, notes, receipt_number, created_by
  ) values
    ('dcdcdcdc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002',
     'bbbbbbbb-0000-4000-8000-000000000001', now() - interval '40 days', 'cash',
     65.00, 5.00, 60.00, 'completed',
     null, null, null, 'Merch table, paid in cash.', 1, v_admin_id),
    ('dcdcdcdc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002',
     null, now() - interval '40 days', 'card',
     15.00, 0.00, 15.00, 'voided',
     now() - interval '39 days', v_admin_id,
     'Duplicate of the cash sale beside it.', 'Rung up twice by mistake.', 2, v_admin_id);

  -- description and unit_price are snapshots, so they are spelled out here the
  -- way the RPC would have spelled them rather than joined to the catalog.
  insert into public.sale_line_items (
    sale_id, product_variant_id, description, unit_price, quantity, line_total, created_by
  ) values
    ('dcdcdcdc-0000-4000-8000-000000000001', 'cdcdcdcd-0000-4000-8000-000000001001',
     'Chatter Snow Beanie — One size', 20.00, 2, 40.00, v_admin_id),
    ('dcdcdcdc-0000-4000-8000-000000000001', 'cdcdcdcd-0000-4000-8000-000000001003',
     'Trailhead Tee — M', 25.00, 1, 25.00, v_admin_id),
    ('dcdcdcdc-0000-4000-8000-000000000002', 'cdcdcdcd-0000-4000-8000-000000001005',
     'Sticker Pack — Pack of 5', 5.00, 3, 15.00, v_admin_id);

end $$;

-- Bulk volume data, appended after the hand-authored scenario above. Purely
-- for exercising list/table UI (pagination, filters, sorting, empty vs.
-- crowded states) with a realistic quantity of rows in local dev -- not
-- meant to be individually meaningful the way the named records above are.
-- All fabricated, same as the rest of this file (see the file header).
do $$
declare
  v_admin_id uuid;
  -- Calendar owner/reviewer reference public.people (20260902010000), not
  -- auth.users -- created_by still takes the auth id.
  v_admin_person_id uuid;
  v_finance_id uuid;
  v_board_id uuid;

  first_names text[] := array['Jordan','Taylor','Morgan','Casey','Riley','Avery','Quinn','Reese','Harper','Skyler',
    'Dakota','Emerson','Rowan','Sawyer','Kendall','Peyton','Blair','Elliot','Marley','Finley',
    'Alexis','Cameron','Devon','Jamie','Micah','Noor','Toni','Val','Wren','Zion'];
  last_names text[] := array['Nguyen','Garcia','Smith','Johnson','Kim','Patel','Brown','Davis','Martinez','Lopez',
    'Wilson','Anderson','Thomas','Moore','Jackson','White','Harris','Clark','Lewis','Walker',
    'Young','Allen','King','Wright','Scott','Torres','Hill','Baker','Adams','Nelson'];
  brand_names text[] := array['Peak Outfitters','Alpine Gear Co.','Trailhead Supply','Frostline Apparel','Timberline Goods',
    'Ridgeline Outdoors','Summit Threads','Basecamp Provisions','Northface Neighbors Co-op','Powder Day Gear',
    'Evergreen Mercantile','Highline Sports'];
  event_kind_names text[] := array['gear swap','trail cleanup','fundraiser','community meetup','skills clinic','holiday drive'];
  item_types text[] := array['jacket','boots','pants','gloves','hat','scarf','socks','base_layer','goggles','backpack'];
  item_descs text[] := array['Insulated jacket','Waterproof boots','Snow pants','Fleece-lined gloves','Wool hat','Neck gaiter','Wool socks','Thermal base layer','Ski goggles','Daypack'];
  genders text[] := array['unisex','men','women','kids','other'];
  conditions text[] := array['new','like_new','good','fair','poor'];
  donation_notes text[] := array[null, 'Dropped off at the office', 'Collected at a gear drive box', 'Mailed in', null];
  contact_topics text[] := array['general','partnership','volunteering','donation','press','other'];

  v_person_id uuid;
  v_event_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
  v_sponsor_person_id uuid;
  v_sponsor_support_type text;
  v_calendar_item_id uuid;
  v_meeting_id uuid;
  v_giveaway_id uuid;
  v_prize_id uuid;
  v_program_id uuid;
  v_service_id uuid;
  v_asset_id uuid;

  v_people_ids uuid[] := '{}';
  v_donor_ids uuid[] := '{}';
  v_volunteer_ids uuid[] := '{}';
  v_sponsor_ids uuid[] := '{}';
  v_event_ids uuid[] := '{}';
  v_program_ids uuid[] := '{}';
  v_agenda_template_id uuid;
  v_agenda_template_version_id uuid;

  i int;
  j int;
  k int;
  n_items int;
  v_first text;
  v_last text;
  v_starts_at timestamptz;
  v_status text;
  v_registration_enabled boolean;
  v_item_type text;
  v_visibility text;
  v_expense_status text;
  v_is_donor boolean;
  v_is_volunteer boolean;
  v_is_sponsor boolean;
begin
  -- Everything below draws from random(), so without a fixed PRNG seed every
  -- `supabase db reset` produced a differently shaped database -- different row
  -- counts on every list page, and therefore no measurement taken against a
  -- seeded stack was comparable between runs (#665). Seeding it here makes a
  -- reset reproducible.
  --
  -- This couples the whole draw stream: adding or removing a random() call
  -- anywhere in this block reshuffles every row after it. The data stays
  -- deterministic, but any baseline that counts rows or nodes has to be
  -- re-recorded when you edit this block.
  --
  -- `perform` inside the block rather than a top-level `select setseed(...)` so
  -- it holds however the CLI feeds this file to Postgres. It does not affect
  -- gen_random_uuid() or gen_salt(), which draw from pgcrypto's CSPRNG -- which
  -- is why the records tests and scans assert on carry literal uuids in the
  -- hand-authored block above.
  perform setseed(0.42);

  select id into v_admin_id from auth.users where email = 'admin@example.test';
  select id into v_admin_person_id from public.people where auth_user_id = v_admin_id;
  select id into v_finance_id from auth.users where email = 'finance@example.test';
  select id into v_board_id from auth.users where email = 'board@example.test';

  -- ~65 individual people, mixed donor/volunteer roles. The two draws are
  -- taken once and reused for both the role tag and the pool this person is
  -- eligible for: they used to be drawn twice, so the flag on the row and the
  -- records behind it disagreed -- harmless while the flags were stored, and
  -- visibly wrong now that the roles are derived from those records (#624).
  for i in 1..65 loop
    v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
    v_last := last_names[1 + floor(random() * array_length(last_names, 1))::int];
    v_is_donor := random() < 0.6;
    v_is_volunteer := random() < 0.35;
    insert into public.people (
      name, is_anonymous, source_type, email, phone, created_by
    )
    values (
      v_first || ' ' || v_last, false, 'individual',
      lower(v_first || '.' || v_last || i || '@example.test'),
      '555-' || lpad((1000 + i)::text, 4, '0'),
      v_admin_id
    )
    returning id into v_person_id;

    v_people_ids := array_append(v_people_ids, v_person_id);
    if v_is_donor then
      v_donor_ids := array_append(v_donor_ids, v_person_id);
      insert into public.person_role_tags (person_id, role) values (v_person_id, 'donor');
    end if;
    if v_is_volunteer then
      v_volunteer_ids := array_append(v_volunteer_ids, v_person_id);
      insert into public.person_role_tags (person_id, role) values (v_person_id, 'volunteer');
    end if;
  end loop;

  -- ~12 brand/org sponsors and donors. Every brand joins both pools, so some
  -- of them earn a role from an event_sponsors or donations row below even
  -- without the tag drawn here.
  for i in 1..array_length(brand_names, 1) loop
    v_is_sponsor := random() < 0.7;
    v_is_donor := random() < 0.5;
    insert into public.people (
      name, is_anonymous, source_type, person_type, email, phone,
      logo_url, website, notes, created_by
    )
    values (
      brand_names[i], false, 'brand', 'organization',
      lower(replace(brand_names[i], ' ', '')) || '@example.test',
      '555-' || lpad((2000 + i)::text, 4, '0'),
      'https://example.test/logos/' || i || '.png',
      'https://' || lower(replace(replace(brand_names[i], ' ', ''), '.', '')) || '.example.test',
      'Seed bulk-data sponsor/donor org.', v_admin_id
    )
    returning id into v_person_id;

    if v_is_sponsor then
      insert into public.person_role_tags (person_id, role) values (v_person_id, 'sponsor');
    end if;
    if v_is_donor then
      insert into public.person_role_tags (person_id, role) values (v_person_id, 'donor');
    end if;

    v_people_ids := array_append(v_people_ids, v_person_id);
    v_sponsor_ids := array_append(v_sponsor_ids, v_person_id);
    v_donor_ids := array_append(v_donor_ids, v_person_id);
  end loop;

  -- A few more programs, beyond the single one in the hand-authored section.
  for i in 1..3 loop
    insert into public.programs (name, description, status, created_by)
    values (
      (array['Summer Trail Access','Youth Outdoor Mentorship','Community Gear Library'])[i],
      'Seed bulk-data program for volume testing.',
      (array['active','pilot','retired'])[1 + floor(random() * 3)::int],
      v_admin_id
    )
    returning id into v_program_id;
    v_program_ids := array_append(v_program_ids, v_program_id);
  end loop;

  -- ~50 more volunteer role types would be excessive; a handful is plenty.
  for i in 1..4 loop
    insert into public.volunteer_role_types (name, description, is_public, created_by)
    values (
      (array['Setup Crew','Registration Desk','Gear Sorter','Trail Guide'])[i],
      'Seed bulk-data volunteer role.', true, v_admin_id
    );
  end loop;

  -- ~55 more events spanning far past to far future, every status/visibility.
  for i in 1..55 loop
    v_starts_at := now() + ((floor(random() * 500)::int - 250) || ' days')::interval + ((floor(random() * 12)::int) || ' hours')::interval;
    v_status := (array['draft','published','published','published','published','published','cancelled','archived'])[1 + floor(random() * 8)::int];
    v_registration_enabled := random() < 0.5;
    v_visibility := case when v_status in ('draft', 'archived') and random() < 0.5 then 'private' else (array['public','private'])[1 + floor(random() * 2)::int] end;

    insert into public.events (
      name, location, starts_at, ends_at, timezone, visibility, status,
      description, capacity, registration_enabled,
      registration_deadline, budget_amount, event_lead_id,
      created_by
    )
    values (
      initcap((array['Spring','Summer','Fall','Winter','Neighborhood','Downtown','Riverside','Mountain'])[1 + floor(random()*8)::int]) || ' ' ||
        initcap((event_kind_names[1 + floor(random() * array_length(event_kind_names,1))::int])) || ' #' || i,
      (array['Community Center, Denver CO','Bear Creek Trailhead','Chatter Snow Office','Riverside Park','Downtown Rec Center'])[1 + floor(random()*5)::int],
      v_starts_at, v_starts_at + ((2 + floor(random()*5)::int) || ' hours')::interval,
      'America/Denver', v_visibility, v_status,
      'Seed bulk-data event for volume testing.',
      20 + floor(random()*180)::int,
      v_registration_enabled, case when v_registration_enabled then v_starts_at - interval '7 days' end,
      round((200 + random() * 4800)::numeric, 2),
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      v_admin_id
    )
    returning id into v_event_id;

    v_event_ids := array_append(v_event_ids, v_event_id);

    -- Programs for about 40%, and a second program for half of those, so the
    -- Program Impact Report has events that count toward two programs.
    --
    -- Which programs get picked rotates with the event index rather than
    -- `order by random()`: the draws inside an insert-select happen in whatever
    -- order the planner produces rows, so setseed alone would not pin it (#665).
    if random() < 0.4 and array_length(v_program_ids, 1) is not null then
      insert into public.event_programs (event_id, program_id)
      select v_event_id, t.program_id
      from unnest(v_program_ids) with ordinality as t(program_id, ord)
      order by (t.ord + i) % array_length(v_program_ids, 1)
      limit case when random() < 0.5 then 2 else 1 end
      on conflict do nothing;
    end if;

    -- Logistics for about a third.
    if random() < 0.35 then
      insert into public.event_logistics (event_id, meeting_point, gear_requirements, transportation, food, supplies, created_by)
      values (v_event_id, 'Front entrance', 'Weather-appropriate layers.', 'Street parking available', 'Water and snacks provided', 'Signage, tables, first aid kit', v_admin_id);
    end if;

    -- Sponsor link for about a quarter. A sponsorship whose support is goods
    -- carries them as inventory rows under its own donation (#1005) -- two
    -- items, one held for the giveaway and one released to the gear library --
    -- since after that migration an in-kind sponsorship with no items is a
    -- shape that cannot occur. The face values are fixed rather than drawn:
    -- the bulk seed is deterministic, and two more random() calls here shift
    -- the stream for every draw after them, which moved seeded registration and
    -- discount-code counts that have nothing to do with sponsors.
    if random() < 0.25 and array_length(v_sponsor_ids, 1) is not null then
      v_sponsor_person_id := v_sponsor_ids[1 + floor(random()*array_length(v_sponsor_ids,1))::int];
      v_sponsor_support_type := (array['cash','in_kind','both','other'])[1 + floor(random()*4)::int];
      v_donation_id := null;

      if v_sponsor_support_type in ('in_kind', 'both') then
        insert into public.donations (donor_id, event_id, created_by)
        values (v_sponsor_person_id, v_event_id, v_admin_id)
        returning id into v_donation_id;

        insert into public.inventory_items
          (donation_id, description, type, condition, face_value, intended_use, created_at, created_by)
        values (v_donation_id, 'Donated lift tickets', 'other', 'new', 180.00, 'giveaway', clock_timestamp(), v_admin_id)
        returning id into v_item_id;
        insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
        values (v_item_id, 'received', 1, 'Sponsor contribution', v_event_id, v_admin_id);

        insert into public.inventory_items
          (donation_id, description, type, condition, face_value, intended_use, created_at, created_by)
        values (v_donation_id, 'Donated base layers', 'other', 'new', 60.00, 'gear_library', clock_timestamp(), v_admin_id)
        returning id into v_item_id;
        insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
        values (v_item_id, 'received', 1, 'Sponsor contribution', v_event_id, v_admin_id);
      end if;

      insert into public.event_sponsors (event_id, person_id, support_type, in_kind_description, contribution_value, is_public, follow_up_status, notes, donation_id, created_by)
      values (
        v_event_id, v_sponsor_person_id, v_sponsor_support_type,
        case when v_donation_id is null then null
             else 'Donated lift tickets, Donated base layers' end,
        round((100 + random()*2000)::numeric, 2), random() < 0.7,
        (array['not_started','in_progress','done'])[1 + floor(random()*3)::int],
        null, v_donation_id, v_admin_id
      );
    end if;

    -- Expense for about 40%. Uses its own status variable -- v_status holds
    -- the event's own status and is still read below (registrations).
    if random() < 0.4 then
      v_expense_status := (array['submitted','approved','approved','rejected','paid','paid'])[1 + floor(random()*6)::int];
      insert into public.event_expenses (
        event_id, description, expense_date, amount, currency, notes,
        created_by, submitted_by, status, approved_by, approved_at,
        rejected_at, rejection_reason, paid_by, paid_at
      )
      values (
        v_event_id, (array['Signage and supplies','Venue rental','Food and drinks','Printing','Equipment rental','Transportation'])[1 + floor(random()*6)::int],
        v_starts_at::date, round((15 + random()*450)::numeric, 2), 'USD', null,
        v_admin_id, v_finance_id, v_expense_status,
        case when v_expense_status in ('approved','paid') then v_board_id end,
        case when v_expense_status in ('approved','paid') then v_starts_at + interval '2 days' end,
        case when v_expense_status = 'rejected' then v_starts_at + interval '2 days' end,
        case when v_expense_status = 'rejected' then 'Missing receipt.' end,
        case when v_expense_status = 'paid' then v_finance_id end,
        case when v_expense_status = 'paid' then v_starts_at + interval '5 days' end
      );
    end if;

    -- Revenue for about 30%. No 'merchandise': that source is retired for
    -- new rows (#909) -- merchandise is sold at the register and lands in
    -- `sales`. The array is one shorter but still costs one random() call,
    -- so the rest of this deterministic seed is unchanged.
    if random() < 0.3 then
      insert into public.event_revenue (event_id, source, amount, received_date, notes, created_by)
      values (
        v_event_id, (array['ticket_sales','registration_fees','onsite_donations','grants','other'])[1 + floor(random()*5)::int],
        round((25 + random()*900)::numeric, 2), v_starts_at::date, null, v_admin_id
      );
    end if;

    -- Checklist items for about 40%.
    if random() < 0.4 then
      n_items := 2 + floor(random()*4)::int;
      for j in 1..n_items loop
        insert into public.event_checklist_items (event_id, title, is_done, completed_at, created_by)
        values (
          v_event_id,
          (array['Confirm venue','Order supplies','Send volunteer reminders','Post to social media','Print sign-in sheets','Coordinate with sponsor','Set up registration table','Debrief with team'])[1 + floor(random()*8)::int],
          random() < 0.5,
          case when random() < 0.5 then v_starts_at - interval '1 day' end,
          v_admin_id
        );
      end loop;
    end if;

    -- Registrations for registration-enabled published events.
    if v_status = 'published' and random() < 0.5 then
      n_items := 3 + floor(random()*25)::int;
      for j in 1..n_items loop
        v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
        v_last := last_names[1 + floor(random() * array_length(last_names, 1))::int];
        insert into public.event_registrations (event_id, name, email, phone, party_size, notes, checked_in_at)
        values (
          v_event_id, v_first || ' ' || v_last,
          -- Keyed on the two loop indices, not on left(v_event_id::text, 8):
          -- the event's uuid is fresh every reset, so the address was different
          -- each time even though the registrant was the same row (#665).
          lower(v_first || '.' || v_last || '.' || j || '.e' || i || '@example.test'),
          '555-' || lpad((3000 + j)::text, 4, '0'),
          1 + floor(random()*4)::int, null,
          case when v_starts_at < now() and random() < 0.7 then v_starts_at end
        );
      end loop;
    end if;

    -- Shifts + volunteer signups for about a quarter.
    if random() < 0.25 and array_length(v_volunteer_ids, 1) is not null then
      declare
        v_shift_id uuid;
      begin
        insert into public.event_shifts (event_id, label, starts_at, ends_at, target_headcount, notes, created_by)
        values (v_event_id, (array['Morning setup','Midday support','Afternoon teardown'])[1 + floor(random()*3)::int],
          v_starts_at, v_starts_at + interval '2 hours', 2 + floor(random()*4)::int, null, v_admin_id)
        returning id into v_shift_id;

        for j in 1..(1 + floor(random()*3)::int) loop
          insert into public.event_volunteers (event_id, person_id, role, shift_id, notes, created_by)
          values (
            v_event_id, v_volunteer_ids[1 + floor(random()*array_length(v_volunteer_ids,1))::int],
            (array['Intake lead','Greeter','Setup crew','Registration desk'])[1 + floor(random()*4)::int],
            v_shift_id, null, v_admin_id
          )
          on conflict (event_id, person_id) do nothing;
        end loop;
      end;
    end if;

    -- Volunteer hours logged for past events, about half.
    if v_starts_at < now() and random() < 0.5 and array_length(v_volunteer_ids, 1) is not null then
      insert into public.volunteer_hours (event_id, person_id, hours, logged_date, notes, logged_by)
      values (
        v_event_id, v_volunteer_ids[1 + floor(random()*array_length(v_volunteer_ids,1))::int],
        round((1 + random()*7)::numeric, 2), v_starts_at::date, null, v_admin_id
      );
    end if;

    -- Impact notes for completed/past published events, about a third.
    if v_starts_at < now() and random() < 0.3 then
      insert into public.event_impact_notes (
        event_id, first_time_riders, rental_subsidies_count, assistance_total,
        beginner_pairings_count, notes, created_by
      )
      values (
        v_event_id, floor(random()*20)::int, floor(random()*15)::int,
        round((random()*600)::numeric, 2), floor(random()*10)::int,
        'Seed bulk-data impact notes.', v_admin_id
      );
    end if;

    -- Giveaway for about 1 in 6 past events.
    if v_starts_at < now() and random() < 0.16 then
      insert into public.giveaways (event_id, name, tickets_sold, ticket_price, revenue_amount, drawing_date, created_by)
      values (v_event_id, 'Event Giveaway', 40 + floor(random()*200)::int, 5.00, round((200 + random()*800)::numeric, 2), v_starts_at::date, v_admin_id)
      returning id into v_giveaway_id;

      for j in 1..(1 + floor(random()*3)::int) loop
        insert into public.giveaway_prizes (giveaway_id, prize_name, donor_person_id, estimated_value, created_by)
        values (
          v_giveaway_id, (array['Gift card','Gear bundle','Weekend rental','Local restaurant voucher'])[1 + floor(random()*4)::int],
          case when array_length(v_sponsor_ids,1) is not null and random() < 0.6 then v_sponsor_ids[1 + floor(random()*array_length(v_sponsor_ids,1))::int] end,
          round((20 + random()*300)::numeric, 2), v_admin_id
        )
        returning id into v_prize_id;

        if random() < 0.7 then
          v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
          insert into public.giveaway_winners (giveaway_prize_id, winner_name, distribution_status, distributed_at, created_by)
          values (
            v_prize_id, v_first || ' ' || upper(left(last_names[1 + floor(random()*array_length(last_names,1))::int], 1)) || '.',
            (array['pending','distributed','unclaimed'])[1 + floor(random()*3)::int],
            case when random() < 0.6 then (v_starts_at + interval '2 days')::date end, v_admin_id
          );
        end if;
      end loop;
    end if;

    -- Discount codes for events with auto-assign turned on, about 1 in 5.
    if random() < 0.2 then
      update public.events set auto_assign_discount_codes = true where id = v_event_id;
      for j in 1..(5 + floor(random()*10)::int) loop
        insert into public.discount_codes (event_id, code, description, source, created_by)
        -- Event index rather than a slice of the event's uuid, for the same
        -- reason as the registrant addresses above (#665). discount_codes_unique_code
        -- is global, and i is unique per event, so these can't collide with each
        -- other or with the hand-authored SUMMIT-20.
        values (v_event_id, 'SEED-' || lpad(i::text, 3, '0') || '-' || j, 'Partner discount', 'Seed partner', v_admin_id);
      end loop;
    end if;
  end loop;

  -- ~130 more donations, 1-3 inventory items each.
  for i in 1..130 loop
    insert into public.donations (donor_id, event_id, notes, created_by)
    values (
      v_donor_ids[1 + floor(random()*array_length(v_donor_ids,1))::int],
      case when random() < 0.3 and array_length(v_event_ids,1) is not null then v_event_ids[1 + floor(random()*array_length(v_event_ids,1))::int] else null end,
      donation_notes[1 + floor(random()*array_length(donation_notes,1))::int],
      v_admin_id
    )
    returning id into v_donation_id;

    n_items := 1 + floor(random()*3)::int;
    for j in 1..n_items loop
      k := 1 + floor(random() * array_length(item_types, 1))::int;
      v_status := (array['available','available','available','distributed','reserved','damaged','lost','retired'])[1 + floor(random()*8)::int];
      insert into public.inventory_items (donation_id, description, size, type, gender, condition, face_value, status, notes, created_by)
      values (
        v_donation_id, item_descs[k], (array['XS','S','M','L','XL','One size'])[1 + floor(random()*6)::int],
        item_types[k], genders[1 + floor(random()*array_length(genders,1))::int],
        conditions[1 + floor(random()*array_length(conditions,1))::int],
        round((5 + random()*80)::numeric, 2), v_status, null, v_admin_id
      )
      returning id into v_item_id;

      insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
      values (v_item_id, 'received', 1, 'Donation intake', v_admin_id);

      if v_status = 'distributed' then
        insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, recipient_person_id, created_by)
        values (v_item_id, 'distributed', 1, 'Given out', v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int], v_admin_id);
      elsif v_status = 'reserved' then
        insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, recipient_person_id, created_by)
        values (v_item_id, 'reserved', 1, 'Public gear library request', v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int], v_admin_id);
      elsif v_status in ('damaged', 'lost', 'retired') then
        insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
        values (v_item_id, v_status, 1, 'Marked ' || v_status, v_admin_id);
      end if;
    end loop;
  end loop;

  -- ~90 more monetary donations, spread across the last 15 months so both
  -- the finance report's default (year-to-date) and prior-year views have data.
  for i in 1..90 loop
    insert into public.monetary_donations (donor_id, event_id, amount, method, received_date, notes, created_by)
    values (
      case when random() < 0.85 then v_donor_ids[1 + floor(random()*array_length(v_donor_ids,1))::int] else null end,
      case when random() < 0.25 and array_length(v_event_ids,1) is not null then v_event_ids[1 + floor(random()*array_length(v_event_ids,1))::int] else null end,
      round((10 + random()*490)::numeric, 2),
      (array['cash','check','card','bank_transfer','online','other'])[1 + floor(random()*6)::int],
      (current_date - floor(random()*450)::int),
      null, v_admin_id
    );
  end loop;

  -- ~35 more reimbursements across the workflow's statuses.
  for i in 1..35 loop
    v_status := (array['submitted','submitted','approved','rejected','paid','paid'])[1 + floor(random()*6)::int];
    insert into public.reimbursements (
      person_id, event_id, description, amount, notes, submitted_by, created_by,
      status, approved_by, approved_at, rejected_at, rejection_reason, paid_by, paid_at
    )
    values (
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      case when random() < 0.6 and array_length(v_event_ids,1) is not null then v_event_ids[1 + floor(random()*array_length(v_event_ids,1))::int] else null end,
      (array['Gas for gear pickup','Supplies for the intake table','Printing costs','Parking reimbursement'])[1 + floor(random()*4)::int],
      round((8 + random()*180)::numeric, 2), null, v_finance_id, v_admin_id,
      v_status,
      case when v_status in ('approved','paid') then v_board_id end,
      case when v_status in ('approved','paid') then now() - (floor(random()*60)::int || ' days')::interval end,
      case when v_status = 'rejected' then now() - (floor(random()*60)::int || ' days')::interval end,
      case when v_status = 'rejected' then 'Receipt missing.' end,
      case when v_status = 'paid' then v_finance_id end,
      case when v_status = 'paid' then now() - (floor(random()*30)::int || ' days')::interval end
    );
  end loop;

  -- ~45 volunteer applications across every status.
  for i in 1..45 loop
    v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
    v_last := last_names[1 + floor(random() * array_length(last_names, 1))::int];
    -- No role tag: the volunteer_applications row below derives it (#624).
    insert into public.people (name, is_anonymous, source_type, email, phone, created_by)
    values (v_first || ' ' || v_last, false, 'individual', lower(v_first || '.' || v_last || '.app' || i || '@example.test'), '555-' || lpad((4000+i)::text,4,'0'), v_admin_id)
    returning id into v_person_id;

    insert into public.volunteer_applications (person_id, name, email, phone, role_interest, availability, status, reference_code)
    values (
      v_person_id, v_first || ' ' || v_last, lower(v_first || '.' || v_last || '.app' || i || '@example.test'),
      '555-' || lpad((4000+i)::text,4,'0'),
      (array['Ride Buddy','Event Setup Crew','Registration Desk','Trail Guide','Gear Sorter'])[1 + floor(random()*5)::int],
      (array['Weekday evenings','Weekend mornings','Weekend afternoons','Flexible'])[1 + floor(random()*4)::int],
      (array['new','being reviewed','contacted','placed','declined','closed'])[1 + floor(random()*6)::int],
      'SEED' || lpad(i::text, 4, '0')
    );
  end loop;

  -- ~45 contact messages across every status.
  for i in 1..45 loop
    v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
    v_last := last_names[1 + floor(random() * array_length(last_names, 1))::int];
    insert into public.contact_messages (name, email, topic, message, status)
    values (
      v_first || ' ' || v_last, lower(v_first || '.' || v_last || '.msg' || i || '@example.test'),
      contact_topics[1 + floor(random()*array_length(contact_topics,1))::int],
      'Seed bulk-data message body for volume testing the ops inbox.',
      (array['new','read','resolved'])[1 + floor(random()*3)::int]
    );
  end loop;

  -- ~65 more calendar items across every item type, with categories, and
  -- content pieces on the content/partner-opportunity ones so the calendar
  -- views also get volume.
  for i in 1..65 loop
    v_starts_at := now() + ((floor(random() * 300)::int - 100) || ' days')::interval;
    v_item_type := (array['own_event','partner_event','community_observance','heritage_social_justice_moment','winter_outdoor_sports_moment','content_campaign','fundraiser','partner_opportunity','content_opportunity'])[1 + floor(random()*9)::int];
    insert into public.calendar_items (
      title, item_type, starts_at, ends_at, time_zone, summary, priority_tier,
      calendar_status, visibility, owner_id, created_by
    )
    values (
      'Seed calendar item #' || i, v_item_type,
      v_starts_at, v_starts_at + interval '2 hours', 'America/Denver',
      'Seed bulk-data calendar item for volume testing.',
      1 + floor(random()*3)::int,
      (array['idea','active','complete','archived'])[1 + floor(random()*4)::int],
      (array['public','internal','unlisted_draft'])[1 + floor(random()*3)::int],
      v_admin_person_id, v_admin_id
    )
    returning id into v_calendar_item_id;

    insert into public.calendar_item_categories (item_id, category)
    values (
      v_calendar_item_id,
      (array['lgbtq_community','winter_outdoor_sports','community_social_justice','own_events','campaigns_fundraising','partner_opportunities'])[1 + floor(random()*6)::int]
    );
    if random() < 0.3 then
      insert into public.calendar_item_categories (item_id, category)
      values (
        v_calendar_item_id,
        (array['lgbtq_community','winter_outdoor_sports','community_social_justice','own_events','campaigns_fundraising','partner_opportunities'])[1 + floor(random()*6)::int]
      )
      on conflict do nothing;
    end if;

    -- One or two content pieces per content/partner opportunity, so the list
    -- view's "N pieces" summary has volume behind it as well as the seeded
    -- three-piece item above.
    if v_item_type in ('content_opportunity', 'partner_opportunity') then
      insert into public.content_opportunities (
        calendar_item_id, title, content, content_status, owner_id, reviewer_id,
        lead_time_days, publish_due_at, created_by
      )
      select
        v_calendar_item_id,
        'Seed content piece #' || i || '.' || p,
        'Seed bulk-data content plan: the angle, the channels and the call to action for volume testing.',
        (array['not_planned','idea','draft','in_review','changes_requested','approved','scheduled','published'])[1 + floor(random()*8)::int],
        v_admin_person_id, v_admin_person_id,
        7 + floor(random()*21)::int, v_starts_at - interval '7 days', v_admin_id
      from generate_series(1, 1 + floor(random()*2)::int) as p;
    end if;
  end loop;

  -- ~20 more governance meetings, each with attendees / agenda / minutes /
  -- action items / decisions, some resolutions.
  select id into v_agenda_template_id from public.agenda_templates where key = 'board_meeting';
  select current_version_id into v_agenda_template_version_id from public.agenda_templates where id = v_agenda_template_id;

  for i in 1..20 loop
    v_starts_at := now() - ((floor(random() * 700)::int) || ' days')::interval;
    insert into public.governance_meetings (meeting_date, meeting_type, status, location, notes, facilitator_person_id, notetaker_person_id, created_by)
    values (
      v_starts_at, (array['board','committee','annual','other'])[1 + floor(random()*4)::int],
      'completed', (array['Video conference','Chatter Snow Office','Community Center'])[1 + floor(random()*3)::int],
      'Seed bulk-data governance meeting.',
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      v_admin_id
    )
    returning id into v_meeting_id;

    for j in 1..(2 + floor(random()*3)::int) loop
      insert into public.governance_meeting_attendees (meeting_id, person_id, attended, created_by)
      values (v_meeting_id, v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int], random() < 0.85, v_admin_id)
      on conflict (meeting_id, person_id) do nothing;
    end loop;

    insert into public.agendas (meeting_id, body_text, template_id, template_version_id, created_by)
    values (v_meeting_id, '1. Updates\n2. Old business\n3. New business', v_agenda_template_id, v_agenda_template_version_id, v_admin_id);

    for j in 1..(1 + floor(random()*3)::int) loop
      insert into public.governance_meeting_action_items (meeting_id, description, owner_person_id, due_date, status, created_by)
      values (
        v_meeting_id, 'Seed action item #' || j, v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
        (v_starts_at + interval '30 days')::date, (array['open','done'])[1 + floor(random()*2)::int], v_admin_id
      );
    end loop;

    if random() < 0.5 then
      insert into public.governance_meeting_decisions (meeting_id, description, decision_date, topic, vote_result, created_by)
      values (v_meeting_id, 'Seed bulk-data decision.', v_starts_at::date, 'General business', 'Passed unanimously', v_admin_id);
    end if;

    if random() < 0.3 then
      insert into public.resolutions (meeting_id, motion_text, mover_person_id, seconder_person_id, vote_outcome, effective_date, created_by)
      values (
        v_meeting_id, 'Seed bulk-data resolution motion.',
        v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
        v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
        'passed', v_starts_at::date, v_admin_id
      );
    end if;
  end loop;

  -- ~8 more board members (respecting one-active-term-per-person via the
  -- partial unique index rather than a separate random-vs-random exists
  -- check, which would compare two independently-random picks).
  for i in 1..8 loop
    insert into public.board_members (person_id, role_title, term_start, term_end, is_active, notes, created_by)
    select
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      (array['Board member','Treasurer','Secretary','Vice chair'])[1 + floor(random()*4)::int],
      current_date - (365 + floor(random()*365)::int),
      case when random() < 0.3 then current_date - floor(random()*30)::int end,
      (random() < 0.7),
      'Seed bulk-data board term.', v_admin_id
    on conflict (person_id) where is_active do nothing;
  end loop;

  -- ~10 annual compliance requirements.
  for i in 1..10 loop
    insert into public.annual_requirements (name, due_date, status, responsible_person_id, created_by)
    values (
      (array['Form 990 filing','State charitable registration renewal','D&O insurance renewal','Annual board self-assessment','Bylaws review'])[1 + floor(random()*5)::int] || ' ' || (2025 + i),
      current_date + (floor(random()*400)::int - 100),
      (array['not_started','in_progress','done'])[1 + floor(random()*3)::int],
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      v_admin_id
    );
  end loop;

  -- Access management: modest scale per the module's own "under 25 assets" design.
  for i in 1..8 loop
    insert into public.services (name, website, created_by)
    values ((array['Cloudflare','GitHub','Vercel','Supabase','Zoho','Mailchimp','Instagram','QuickBooks'])[i], 'https://example.test', v_admin_id)
    returning id into v_service_id;

    insert into public.assets (name, service_id, category, description, is_org_owned, owner_person_id, status, sensitivity, mfa_required, mfa_status, created_by)
    values (
      (array['Cloudflare','GitHub','Vercel','Supabase','Zoho','Mailchimp','Instagram','QuickBooks'])[i] || ' account',
      v_service_id, (array['domain','hosting','database','social','financial','communication','productivity','other'])[i],
      'Seed bulk-data asset.', true, v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int], 'active',
      (array['low','medium','high','critical'])[1 + floor(random()*4)::int],
      random() < 0.6, (array['enabled','disabled','unknown'])[1 + floor(random()*3)::int], v_admin_id
    )
    returning id into v_asset_id;

    for j in 1..(1 + floor(random()*3)::int) loop
      insert into public.access_grants (asset_id, person_id, access_level, account_identifier, granted_at, status, created_by)
      select v_asset_id, v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
        (array['owner','admin','manager','editor','viewer'])[1 + floor(random()*5)::int],
        'user' || j || '@example.test', current_date - floor(random()*400)::int,
        'active', v_admin_id
      on conflict (asset_id, person_id) where status = 'active' do nothing;
    end loop;
  end loop;
end $$;

-- Site content for the initial tenant (#795 Phase 3). Since
-- 20260905190000 stopped defaulting to Chatter Snow, a fresh database
-- bootstraps as "Example Nonprofit" -- and the migrations that write Chatter
-- Snow's own copy (20260908040000/50000/60000/70000) are scoped
-- `where slug = 'chatter-snow'`, so they correctly no-op here. Without this
-- block the local public site renders the registry's placeholder prompts
-- ("Your headline goes here") and the e2e specs have no stable copy to assert.
--
-- Only the slots whose defaults are *prompts* are filled. The ones that are
-- product chrome -- "Gear library", "Our Mission", "Get in touch", "Donations"
-- -- are already the right words for any organization and are left to the
-- registry, so local keeps exercising the defaults rather than shadowing them.
-- The list slots are left alone for the same reason: their prompts are what an
-- unconfigured tenant sees, and it is useful to see it. `programs.pillars` and
-- `programs.items` are the exception, and #898 is why: the pillars stopped
-- being copy alone the moment the Programs page could group the *module's*
-- programs under them, so a local database needs pillar labels a seeded
-- program can actually name. They come as a pair -- seeding pillars alone
-- would leave the registry's placeholder item naming a pillar that no longer
-- exists, and Site Content mode would render nothing.
--
-- tenant_id is omitted deliberately: site_content defaults it to
-- default_tenant_id(), so this stays correct whatever the initial tenant is
-- called, including under an app.initial_tenant_slug override.
--
-- Local and CI only -- seed.sql never runs against a hosted project.
insert into public.site_content (key, value, published_at) values
  ('org.short_name', '"Example Nonprofit"', now()),
  ('org.tagline', '"Example Nonprofit is the sample organization the local stack and CI run against."', now()),
  ('org.image_alt', '"Example Nonprofit community members"', now()),
  -- Not a prompt like the three above it: the security contact defaults to
  -- blank and no /.well-known/security.txt is served until a tenant sets one
  -- (#975). Seeded so local and CI have a tenant that publishes the file, which
  -- is what e2e/legal.spec.ts asserts; the unset case is covered by the unit
  -- tests, since a seeded row is exactly what it is not.
  ('org.email_security', '"security@example.org"', now()),
  ('org.security_note', '["Example Nonprofit is not a real organization and nobody reads this address. It is seeded so the file renders the way a configured tenant''s does."]', now()),
  ('home.heading', '"A sample organization for local development"', now()),
  ('home.intro', '"Everything on this site is seed data. Example Nonprofit exists so the local stack and CI have a realistic tenant to render, without borrowing a real organization''s words."', now()),
  ('about_story.intro', '["Example Nonprofit is not a real organization. It is the tenant a fresh database bootstraps as, so that every public page has something to show before anyone has written a word.","Any copy you see here comes from supabase/seed.sql. Editing it in Administration > Site Content writes a row exactly as it would for a real tenant."]', now()),
  ('about_story.body', '["This story slot is seeded so the About page renders as a real page rather than a form of prompts.","A tenant that has written nothing sees the registry placeholders instead, which is what a newly provisioned organization gets on its first day."]', now()),
  ('about_mission.statement', '"To give the local stack and CI a realistic organization to render."', now()),
  ('about_mission.lead_in', '"Example Nonprofit exists to exercise the product:"', now()),
  ('about_mission.closing', '"None of this describes a real organization, and it is not meant to."', now()),
  ('about_mission.why_body', '["A platform that ships with no content at all is hard to develop against, and one that ships with a client''s content is worse. Example Nonprofit is the third option."]', now()),
  ('programs.intro', '"Sample programs, seeded locally so the Programs page has something to lay out."', now()),
  ('programs.pillars', '[{"label":"Access","description":"Removing what stops people taking part."},{"label":"Community","description":"Bringing people who would not otherwise meet into the same room."}]', now()),
  ('programs.items', '[{"pillar":"Access","emoji":"\u2744\ufe0f","name":"Sample access program","description":"Copy-driven program card, rendered when the Programs page reads Site Content."},{"pillar":"Community","emoji":"\ud83e\udd1d","name":"Sample community program","description":"The second copy-driven card, so both pillars have something under them."}]', now()),
  -- Blank by default, like get_involved.volunteer_screening below: the
  -- platform does not write a safeguarding rule on a tenant's behalf (#685).
  -- Seeded so local and CI have a tenant that has written one; the unwritten
  -- case is what every other tenant has and what the unit tests cover.
  ('events.minor_accompaniment', '["Anyone under 18 is welcome with a parent or legal guardian, and that adult needs to be with them for the whole event. Example Nonprofit is not staffed to supervise anyone.","The accompanying adult registers too, so please count them in the number attending. None of this is real: this is a development environment for a fictional organization."]', now()),
  ('gears.donate_intro', '"Sample gear-program copy. Example Nonprofit collects gently used equipment and gives it away, free and for keeps, to people who need it."', now()),
  ('get_involved.intro', '"Sample copy for the ways someone could get involved with a fictional organization."', now()),
  ('get_involved.partner_body', '"Example Nonprofit has no real partners. This slot is seeded so the page renders."', now()),
  -- Blank by default, like org.security_note above: the platform does not
  -- describe a screening process on a tenant's behalf (#690). Seeded so local
  -- and CI have a tenant that has written one, which is what e2e/legal.spec.ts
  -- asserts; the unwritten case is covered by the unit tests, since a seeded
  -- row is exactly what it is not.
  ('get_involved.volunteer_screening', '["Example Nonprofit reads every application and emails you about next steps, usually within a week — expect a conversation about what you would like to do and when you are free.","For roles working one-to-one with a participant, Example Nonprofit asks for two references and talks it through with you before anything is agreed. Nobody is screened without being told first, and none of this is real: this is a development environment for a fictional organization."]', now()),
  ('support.intro', '"Sample support copy. No donation on this site goes anywhere -- it is a development environment."', now()),
  ('support.donations_intro', '"Explaining what donations would pay for, if Example Nonprofit were real."', now()),
  ('support.monetary_body', '"Online giving is not wired up in local development."', now()),
  ('support.sponsorship_intro', '"Sample sponsorship copy, seeded so the page has a body."', now())
on conflict (tenant_id, key) do update
  set value = excluded.value, published_at = excluded.published_at;

-- Articles (#894). /learn is a tenant-owned collection rather than eight
-- compiled data files, so local and CI need rows or the Learn specs and the
-- a11y route sweep find an empty section and no /learn/<slug> to crawl.
--
-- Deliberately Example Nonprofit's own generic material rather than a copy of
-- the snow-sports guides this ticket moved into Chatter Snow's rows: the whole
-- argument of #894 is that one client's writing is not every tenant's content,
-- and seeding it here would put it straight back into every fresh database.
-- Three categories with a few articles each is enough to exercise the index
-- cards, the in-page nav, every field of an article body, and the visibility
-- filter on an internal link.
--
-- tenant_id is omitted deliberately, like the site_content block above: both
-- tables default it to default_tenant_id().
--
-- Local and CI only -- seed.sql never runs against a hosted project.
with category_rows as (
  insert into public.article_categories (slug, position, value)
  values
    ('getting-started', 0, '{"title":"Getting Started","description":"What a first visit looks like, and what to bring."}'::jsonb),
    ('how-we-work', 1, '{"title":"How We Work","description":"How the programs run, who they are for, and how to take part."}'::jsonb),
    ('volunteering', 2, '{"title":"Volunteering","description":"What volunteering with a small nonprofit actually involves."}'::jsonb)
  on conflict (tenant_id, slug) do update set value = excluded.value, position = excluded.position
  returning id, tenant_id, slug
)
insert into public.articles (tenant_id, category_id, anchor, position, value)
select category_rows.tenant_id, category_rows.id, a.anchor, a.position, a.value
from category_rows
join (values
  ('getting-started', 'your-first-visit', 0, '{"title":"Your first visit","description":"Most of a first visit is logistics: where to go, when to arrive, and who to ask.","paragraphs":["Nothing on this page describes a real organization. Example Nonprofit exists so that the local stack and CI have a tenant with real-shaped content to render.","Articles are edited from Administration > Site Content, saved as drafts, and published when they are ready."],"list":[{"label":"Arrive early","text":"Give yourself time to find the place and sign in before anything starts."},{"label":"Bring identification","text":"A first visit usually involves a form and somebody checking it."},{"label":"Ask questions","text":"Nobody expects a first-time visitor to already know how any of it works."}],"links":[{"label":"Get involved","href":"/get-involved","internal":true},{"label":"Example external reference","href":"https://example.org/"}],"disclaimer":"Seed content for local development. None of it is advice and none of it is real."}'::jsonb),
  ('getting-started', 'what-to-bring', 1, '{"title":"What to bring","description":"A short packing list, which is mostly a list of things people forget.","paragraphs":["A list slot and a paragraph slot render differently, and both are exercised here so the layout is visible locally."],"list":[{"label":"Water","text":"More than you think, whatever the weather is doing."},{"label":"Something to write with","text":"Half of a first day is forms."}],"links":[{"label":"Contact us","href":"/contact","internal":true}],"disclaimer":"Seed content for local development."}'::jsonb),
  ('how-we-work', 'programs-overview', 0, '{"title":"Programs overview","description":"What the programs are, in the shape a real organization would describe them.","paragraphs":["Programs are the unit of work: each one has a purpose, an audience and a season.","A program page and an article about that program are different things -- the article is the explanation, the program is the record."],"list":[{"label":"Access","text":"Removing the cost barrier to taking part."},{"label":"Community","text":"Bringing people who would not otherwise meet into the same room."}],"links":[{"label":"Programs","href":"/programs","internal":true}],"disclaimer":"Seed content for local development."}'::jsonb),
  ('how-we-work', 'how-decisions-get-made', 1, '{"title":"How decisions get made","description":"Who decides what, and where those decisions are written down.","paragraphs":["A small board, meeting on a schedule, recording what it decided. That is most of governance at this size.","This article exists so a category with more than one article renders its in-page navigation."],"list":[],"links":[],"disclaimer":"Seed content for local development."}'::jsonb),
  ('volunteering', 'what-volunteering-involves', 0, '{"title":"What volunteering involves","description":"The honest version: some of it is setup and cleanup.","paragraphs":["Volunteering at a small organization is less specialized than it sounds. Most roles are learned on the day.","An article with no list and no links still has to render correctly, which is what this one checks."],"list":[],"links":[{"label":"Volunteer","href":"/get-involved/volunteer","internal":true}],"disclaimer":"Seed content for local development."}'::jsonb)
) as a(category_slug, anchor, position, value) on a.category_slug = category_rows.slug
on conflict (tenant_id, category_id, anchor) do update
  set value = excluded.value, position = excluded.position;

-- Module mode for the Programs page (#898). The page reads Site Content until
-- a tenant changes `layout.programs_source`, so these rows change nothing on
-- their own -- they are here so that flipping the setting locally, or in the
-- e2e case that flips it, lands on a populated page rather than the empty
-- state.
--
-- Three rows, covering the three shapes the page has to render: two under
-- pillars that exist in the copy above, ordered by `sort_order`, and one with
-- no pillar at all, which belongs in the trailing ungrouped section rather
-- than nowhere. Every other seeded program stays unpublished, which is also
-- the check that `is_public` defaults to false.
--
-- Local and CI only -- seed.sql never runs against a hosted project.
update public.programs
set is_public = true, pillar = 'Access', emoji = '❄️', sort_order = 1
where name = 'Winter Access Program';

update public.programs
set is_public = true, pillar = 'Community', emoji = '🤝', sort_order = 2
where name = 'Youth Outdoor Mentorship';

update public.programs
set is_public = true, pillar = null, sort_order = null
where name = 'Community Gear Library';

-- People mode for Meet the Team (#1014). The same arrangement as the Programs
-- block above: the page reads Site Content until a tenant changes
-- `layout.team_source`, so these rows change nothing on their own -- they are
-- here so that flipping the setting locally, or in the e2e case that flips
-- it, lands on a populated page rather than the empty state.
--
-- Three rows over the hand-authored people, covering the shapes the page has
-- to render: an ordered member with a role and a multi-paragraph biography,
-- an ordered member with a role and no biography (the placeholder case), and
-- an unordered member with neither, who sorts after the other two by name.
-- Every other seeded person stays off the page, which is also the check that
-- a person is not listed until somebody lists them.
--
-- Local and CI only -- seed.sql never runs against a hosted project.
insert into public.public_team_members (person_id, public_role, bio, sort_order)
select id, 'Programs lead',
  E'Jamie has run the winter access program since it began, and learned to ride as an adult.\n\nOff snow you will find them at the climbing gym or organizing the gear library.',
  1
from public.people where email = 'jamie.rivera@example.test';

insert into public.public_team_members (person_id, public_role, bio, sort_order)
select id, 'Board chair', null, 2
from public.people where email = 'alex.chen@example.test';

insert into public.public_team_members (person_id, public_role, bio, sort_order)
select id, null, null, null
from public.people where email = 'priya.n@example.test';

-- A content pack (#895), so the platform tenant's pack screen has something in
-- it locally and the a11y sweep scans a populated page rather than an empty
-- one. The seeded tenant is on the `internal` plan, which makes it the platform
-- tenant and therefore the only tenant that can author one.
--
-- Nothing adopts it here: `available_content_packs()` never offers a tenant its
-- own pack, and this database has one tenant. Adoption is exercised by
-- `packs/actions.integration.test.ts`, which provisions a second tenant to do
-- it -- which is also the reason `content_pack_adoptions` is seeded with
-- nothing: a row in it means one tenant copied another's pack, and a single
-- tenant cannot produce one.
--
-- Local and CI only -- seed.sql never runs against a hosted project.
with pack as (
  insert into public.content_packs (key, name, description, is_offered)
  values (
    'getting-started',
    'Getting started',
    'A short introduction any organization can put on its Learn section and then rewrite in its own words.'
  , true)
  on conflict (tenant_id, key) do update
    set name = excluded.name, description = excluded.description, is_offered = excluded.is_offered
  returning id, tenant_id
)
update public.article_categories c
set pack_id = pack.id
from pack
where c.tenant_id = pack.tenant_id and c.slug = 'getting-started';

-- Page visibility (issue #584). Production deliberately has no
-- `page_visibility.*` rows, so the sections still awaiting board approval fall
-- back to `defaultVisible: false` in src/lib/page-visibility.ts and stay dark.
-- Local development and CI need them visible, otherwise the existing public
-- e2e specs and the e2e/a11y-scan.ts route list would all 404.
insert into public.app_settings (key, value) values
  ('page_visibility.programs', to_jsonb(true)),
  ('page_visibility.learn', to_jsonb(true)),
  ('page_visibility.support', to_jsonb(true)),
  -- The sizing guide is off by default for the same reason the sections above
  -- are: it is one organization's snow-sports content, not platform chrome
  -- (#795 Phase 3). e2e/gears.spec.ts, e2e/skip-link.spec.ts and the a11y
  -- route sweep all visit /gears/sizing, so local and CI turn it on.
  ('page_visibility.gears-sizing', to_jsonb(true)),
  -- The link-in-bio page (#937). Off by default like every new section, and
  -- it is not in the nav either, so without this the a11y route sweep and
  -- e2e/links.spec.ts would both be scanning a 404 rather than the page.
  ('page_visibility.links', to_jsonb(true)),
  -- The two audience paths (#1328). Off by default everywhere, because they
  -- are the platform's own pitch rather than an organization's page -- so
  -- without this the a11y route sweep and e2e/audience-paths.spec.ts would
  -- both be measuring a 404.
  ('page_visibility.audiences', to_jsonb(true)),
  -- The module tour (#1329) and the price list (#1330), on here for the reason
  -- the audience paths are: both are off for every tenant by default, so
  -- without these the a11y route sweep and their two e2e specs would all be
  -- measuring a 404. The prices this tenant shows are the registry's em dashes
  -- -- the figures belong to the platform tenant's own rows (20260920030000),
  -- and this is not that tenant.
  ('page_visibility.modules', to_jsonb(true)),
  ('page_visibility.pricing', to_jsonb(true)),
  -- Publications (#1471), off by default like every new section; the seeded
  -- issues below are what the a11y sweep visits.
  ('page_visibility.publications', to_jsonb(true))
on conflict (tenant_id, key) do update set value = excluded.value;

-- Fiscal year (20260905030000). The migration already seeds July as a
-- placeholder pending the Board resolution, so this only pins it explicitly for
-- local development and CI: the finance and calendar-report specs assert
-- against a known year boundary, and inheriting whatever production happens to
-- be set to would make them drift.
insert into public.app_settings (key, value) values
  ('org.fiscal_year_start_month', to_jsonb(7))
on conflict (tenant_id, key) do update set value = excluded.value;

-- Reporting time zone (20260916000000, #1065). The migration infers a tenant's
-- zone from the mode of its events, but it runs on an empty database here --
-- the seed comes after -- so a reset would leave local development on UTC
-- while a real deployment lands on the zone its events are in. Every seeded
-- event is in Denver, so this is what that inference would have produced, and
-- pinning it is what lets the rollup and dashboard specs assert against a
-- known month boundary.
insert into public.app_settings (key, value) values
  ('org.timezone', to_jsonb('America/Denver'::text))
on conflict (tenant_id, key) do update set value = excluded.value;

-- Outbound email (#488). The admin account opts in to the daily task digest and
-- has one delivery already recorded, so both tables have a row locally: the
-- account page shows a toggle in its on state, and the tenant-isolation suite
-- (src/lib/portal/tenant-isolation.integration.test.ts) has something to assert
-- about -- its per-table checks are vacuous on an empty table.
--
-- No `notifications.email_enabled` row on purpose: an unset switch means on,
-- and leaving it unset is what production looks like on the day this ships.
insert into public.person_notification_preferences (person_id, kind, enabled)
select p.id, 'task_digest', true
from public.people p
join auth.users u on u.id = p.auth_user_id
where u.email = 'admin@example.test'
on conflict (tenant_id, person_id, kind) do update set enabled = excluded.enabled;

insert into public.notification_deliveries (person_id, kind, dedupe_key, status, sent_at)
select p.id, 'task_digest', 'task-digest:' || to_char(current_date - 1, 'YYYY-MM-DD'),
       'sent', now() - interval '1 day'
from public.people p
join auth.users u on u.id = p.auth_user_id
where u.email = 'admin@example.test'
on conflict (tenant_id, person_id, kind, dedupe_key) do nothing;

-- One message sent from the portal about the seeded gear request (#1203), so
-- the request detail has a Messages card with something in it and the
-- tenant-isolation suite has a row to assert about. id is fixed rather than
-- generated for the same reason every other seeded id is: a test may name it.
-- No delivery_id: the ledger row for it was never written locally, and the
-- column is nullable precisely because a message can outlive one.
insert into public.outbound_messages (
  id, person_id, to_email, module, record_type, record_id,
  subject, body, kind, status, sent_by, created_at
)
select 'eeeeeeee-0000-4000-8000-000000003001',
       p.id, p.email, 'inventory', 'gear_request',
       'eeeeeeee-0000-4000-8000-000000002001',
       'About your gear request',
       'Hi -- the wool beanie you asked for is set aside. Saturday morning before the shuttle works for us; we will be at the lodge entrance from 8.

Let us know if a smaller size turns up better for you.',
       'staff_message', 'sent', u.id, now() - interval '2 days'
from public.people p
join auth.users u on u.email = 'admin@example.test'
where p.id = 'bbbbbbbb-0000-4000-8000-000000000004'
on conflict (id) do nothing;

-- The first-login welcome tour (20260902060000) opens a modal over the portal
-- shell for any account whose welcome_completed_at is null. Every e2e spec
-- signs in as one of these accounts and drives portal pages, so leaving them
-- un-toured would put a dialog in front of all of them. Mark them done here;
-- the tour itself is covered by welcome-dialog.dom.test.tsx and
-- welcome/actions.integration.test.ts, and can be replayed locally from
-- /portal/account.
-- last_release_seen gets a key no CURRENT_RELEASE will ever exceed, for the
-- same reason: the "what's new" dialog (20260902070000) would otherwise sit
-- over the e2e suite every time someone bumps the release, and seed.sql has no
-- way to read that constant out of the TypeScript that owns it. To see the
-- release notes locally, clear it for your account:
--   update public.user_onboarding set last_release_seen = null;
insert into public.user_onboarding (user_id, first_seen_at, welcome_completed_at, last_release_seen)
select u.id, u.created_at, now(), '9999-12-31'
from auth.users u
on conflict (user_id) do update
  set welcome_completed_at = now(),
      last_release_seen = '9999-12-31';

-- Constituent accounts on, for the one seeded tenant (#1175).
--
-- `constituent_accounts` is the only module in the catalog that defaults to
-- off (20260916050000), which is right for a real tenant -- a signed-in area on
-- an organization's own website is its decision -- but locally it meant the
-- whole of `/my`, its sign-in and the staff claims queue 404'd, so the a11y
-- scan skipped three routes and no e2e spec could reach any of them. The area
-- shipped across #1161-#1165 with no browser coverage at all as a result.
--
-- Named explicitly rather than left to default_tenant_id(): tenant_modules has
-- no tenant default, and a row naming its tenant is what the multi-tenant rule
-- asks for anyway (docs/tenants.md).
insert into public.tenant_modules (tenant_id, module_key, enabled)
select t.id, 'constituent_accounts', true
from (select id from public.tenants order by created_at limit 1) t
on conflict (tenant_id, module_key) do update set enabled = excluded.enabled;

-- The rider profile as profile questions (#1746), for the same reason: the
-- local tenant stands in for Chatter Snow, and without these the
-- post-registration questions, the door-side answers and the two snow
-- figures would have no local or e2e coverage. The same five questions and
-- two metric rows 20261105120000 and 20261106120000 give Chatter Snow, and
-- the two door snapshots the past event's Results card counts (seeded above).
create function pg_temp.seed_person_question(
  p_tenant_id uuid, p_id uuid, p_key text, p_sort integer,
  p_question jsonb, p_seen jsonb, p_snapshot boolean
) returns jsonb
language plpgsql
as $$
declare
  v_def jsonb := public.question_definition(
    p_question || jsonb_build_object('id', p_id), p_seen,
    array['single_choice', 'multi_choice', 'short_text', 'number', 'place'], 'PERSON_QUESTIONS'
  );
begin
  insert into public.person_questions
    (id, tenant_id, key, kind, prompt, column_label, required, sort_order, options,
     allow_other, show_if, ask_after_registration, ask_on_my_details, snapshot_at_checkin)
  values
    (p_id, p_tenant_id, p_key, v_def->>'kind', v_def->>'prompt', v_def->>'column_label',
     (v_def->>'required')::boolean, p_sort, v_def->'options', (v_def->>'allow_other')::boolean,
     nullif(v_def->'show_if', 'null'::jsonb), true, true, p_snapshot);
  return p_seen || jsonb_build_object(p_id::text, jsonb_build_object(
    'kind', v_def->>'kind', 'options', v_def->'options'));
end;
$$;

do $seed$
declare
  t uuid := (select id from public.tenants order by created_at limit 1);
  q_discipline uuid := gen_random_uuid();
  q_ski uuid := gen_random_uuid();
  q_snowboard uuid := gen_random_uuid();
  v_seen jsonb := '{}'::jsonb;
  v_disciplines jsonb := jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'key', 'ski', 'label', 'Skis'),
    jsonb_build_object('id', gen_random_uuid(), 'key', 'snowboard', 'label', 'Snowboard'),
    jsonb_build_object('id', gen_random_uuid(), 'key', 'both', 'label', 'Both')
  );
  v_levels jsonb := jsonb_build_array(
    jsonb_build_object('key', 'beginner', 'label', 'Beginner', 'hint', 'Learning to turn and stop on greens'),
    jsonb_build_object('key', 'intermediate', 'label', 'Intermediate', 'hint', 'Linking turns on greens and blues'),
    jsonb_build_object('key', 'advanced', 'label', 'Advanced', 'hint', 'Comfortable on blacks')
  );
begin
  v_seen := pg_temp.seed_person_question(t, q_discipline, 'riding_discipline', 0, jsonb_build_object(
    'kind', 'single_choice', 'prompt', 'Do you ski or ride?', 'column_label', 'Rides',
    'options', v_disciplines), v_seen, true);

  v_seen := pg_temp.seed_person_question(t, q_ski, 'ski_level', 1, jsonb_build_object(
    'kind', 'single_choice', 'prompt', 'How would you describe your skiing?',
    'column_label', 'Ski level', 'required', true,
    'options', (select jsonb_agg(o || jsonb_build_object('id', gen_random_uuid()))
                  from jsonb_array_elements(
                    jsonb_build_array(jsonb_build_object('key', 'first_time', 'label', 'First time on skis', 'hint', 'Never skied before'))
                    || v_levels) o),
    'show_if', jsonb_build_object('question_id', q_discipline, 'option_ids',
      (select jsonb_agg(o->'id') from jsonb_array_elements(v_disciplines) o where o->>'key' in ('ski', 'both')))
  ), v_seen, true);

  v_seen := pg_temp.seed_person_question(t, q_snowboard, 'snowboard_level', 2, jsonb_build_object(
    'kind', 'single_choice', 'prompt', 'How would you describe your snowboarding?',
    'column_label', 'Board level', 'required', true,
    'options', (select jsonb_agg(o || jsonb_build_object('id', gen_random_uuid()))
                  from jsonb_array_elements(
                    jsonb_build_array(jsonb_build_object('key', 'first_time', 'label', 'First time on a snowboard', 'hint', 'Never ridden before'))
                    || v_levels) o),
    'show_if', jsonb_build_object('question_id', q_discipline, 'option_ids',
      (select jsonb_agg(o->'id') from jsonb_array_elements(v_disciplines) o where o->>'key' in ('snowboard', 'both')))
  ), v_seen, true);

  -- The list 20260923120000 seeded for Chatter Snow, which the e2e
  -- registration spec picks from.
  v_seen := pg_temp.seed_person_question(t, gen_random_uuid(), 'preferred_mountain', 3, jsonb_build_object(
    'kind', 'single_choice', 'prompt', 'Which mountain do you usually ride?',
    'column_label', 'Mountain', 'allow_other', true,
    'options', (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'label', m.name) order by m.ord)
                  from unnest(array[
                    'Big Snow (American Dream)', 'Mountain Creek', 'Camelback', 'Blue Mountain',
                    'Shawnee', 'Jack Frost / Big Boulder', 'Hunter', 'Windham', 'Belleayre',
                    'Mount Snow', 'Stratton'
                  ]) with ordinality as m(name, ord))
  ), v_seen, false);

  -- Park riding (#1748, 20261106120000): asked once either level is past
  -- first_time, optional, snapshotted.
  v_seen := pg_temp.seed_person_question(t, gen_random_uuid(), 'park_riding', 4, jsonb_build_object(
    'kind', 'single_choice', 'prompt', 'Do you ride in the terrain park?', 'column_label', 'Park',
    'options', (select jsonb_agg(o || jsonb_build_object('id', gen_random_uuid()) order by ord)
                  from jsonb_array_elements(jsonb_build_array(
                    jsonb_build_object('key', 'not_interested', 'label', 'Not interested'),
                    jsonb_build_object('key', 'curious', 'label', 'Curious', 'hint', 'Haven''t tried it yet'),
                    jsonb_build_object('key', 'beginner', 'label', 'Beginner', 'hint', 'Small features'),
                    jsonb_build_object('key', 'intermediate', 'label', 'Intermediate', 'hint', 'Medium features'),
                    jsonb_build_object('key', 'advanced', 'label', 'Advanced', 'hint', 'Large features and jumps')
                  )) with ordinality as x(o, ord)),
    'show_if', jsonb_build_object('any', (
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'option_ids',
               (select jsonb_agg(o->'id') from jsonb_array_elements(q.options) o
                 where o->>'key' in ('beginner', 'intermediate', 'advanced'))) order by q.sort_order)
        from public.person_questions q where q.id in (q_ski, q_snowboard)))
  ), v_seen, true);

  insert into public.person_answer_metrics
    (tenant_id, key, label, rule, question_ids, option_keys, sort_order)
  values
    (t, 'beginner_participants', 'Beginner participants', 'any', array[q_ski, q_snowboard], array['beginner'], 0),
    (t, 'first_time_on_snow', 'First time on snow', 'any', array[q_ski, q_snowboard], array['first_time'], 1);

  -- Alex rode a snowboard for the first time; Jamie skied as a beginner.
  insert into public.person_answer_snapshots
    (tenant_id, registration_id, question_id, value, answer_text, option_keys, taken_at)
  select t, r.id, q.id, o->'id', o->>'label', array[o->>'key'], r.checked_in_at
    from public.event_registrations r
    join (values
      ('alex.chen@example.test', 'riding_discipline', 'snowboard'),
      ('alex.chen@example.test', 'snowboard_level', 'first_time'),
      ('jamie.rivera@example.test', 'riding_discipline', 'ski'),
      ('jamie.rivera@example.test', 'ski_level', 'beginner')
    ) as s(email, question_key, option_key) on s.email = r.email
    join public.person_questions q on q.tenant_id = t and q.key = s.question_key
   cross join lateral jsonb_array_elements(q.options) o
   where r.tenant_id = t
     and r.checked_in_at is not null
     and o->>'key' = s.option_key;
end
$seed$;

drop function pg_temp.seed_person_question(uuid, uuid, text, integer, jsonb, jsonb, boolean);

-- Giveaway official rules (#1322). Two things are seeded, and they are the two
-- layers the feature is made of:
--
--  1. The organization's standing answers, `giveaway_rules.*` -- example
--     wording, of the kind Website > Giveaway rules asks for. Not copied by
--     provision_tenant(), which takes only `finance.%`, `content.%` and
--     `org.%`, so a real tenant still starts with every question unanswered
--     and publishes nothing until somebody answers them.
--  2. One published version for the seeded giveaway, so the public rules page
--     and the version list have something to render locally, and so the
--     tenant-isolation suite's per-table checks are not asserting against
--     empty tables.
--
-- The prose is deliberately the length real official rules run to rather than
-- one line per section: a page of this shape is where a layout bug hides.
insert into public.app_settings (key, value) values
  ('giveaway_rules.sponsor_name', to_jsonb(array['Example Nonprofit, Inc.'])),
  ('giveaway_rules.sponsor_address', to_jsonb(array[
    'Example Nonprofit, Inc.',
    '1200 Mountain Road, Suite 4',
    'Denver, CO 80202'
  ])),
  ('giveaway_rules.rules_contact', to_jsonb(array['promotions@example.org'])),
  ('giveaway_rules.eligibility', to_jsonb(array[
    'Entry is open to legal residents of the states named below who are 18 years of age or older at the time they enter. One person may earn any number of tickets, but a person may hold only one account with us and may not enter under more than one name.',
    'Everybody who enters has to be able to collect a prize in person, or to arrange collection with us, within the state they entered from.'
  ])),
  ('giveaway_rules.exclusions', to_jsonb(array[
    'Employees, board members and volunteers of the sponsor, and the members of their immediate households, may not enter. Anybody who helps draw the winning tickets, or who handles the tickets before the drawing, is excluded on the same terms whether or not they are otherwise connected to us.'
  ])),
  ('giveaway_rules.operating_states', to_jsonb(array['Colorado and Utah'])),
  ('giveaway_rules.free_entry', to_jsonb(array[
    'You do not have to donate anything or buy anything to enter. To enter for free, mail a postcard with your full name, postal address, email address and a daytime telephone number to the sponsor''s address above, marked "Giveaway entry".',
    'Each postcard earns one ticket of the lowest tier, the same ticket a donated item in that tier earns. There is no limit on how many postcards you may send, but each has to be mailed separately and hand-written by the person entering. Postcards have to be postmarked within the entry period and reach us within seven days of it closing.',
    'We will confirm by email that a free entry arrived, and the ticket it earned is entered in whichever bucket you name on the card.'
  ])),
  ('giveaway_rules.winner_publication', to_jsonb(array[
    'We publish the first name and last initial of each winner, and the prize they won, on our website for 30 days after the drawing. We do not publish addresses, email addresses or telephone numbers.',
    'For a written list of winners, write to the sponsor''s address above within 60 days of the drawing and enclose a stamped, self-addressed envelope.'
  ])),
  ('giveaway_rules.publicity', to_jsonb(array[
    'Accepting a prize permits us to use the winner''s name, the town they live in and a photograph taken at the handover in material about this promotion and about our work, without further payment, except where the law forbids it.',
    'A winner who would rather we did not may say so when the prize is claimed, and it makes no difference to the prize.'
  ]))
on conflict (tenant_id, key) do update set value = excluded.value;

insert into public.giveaway_rules (giveaway_id, odds_basis, created_by)
select g.id, 'colour', u.id
from public.giveaways g
join auth.users u on u.email = 'admin@example.test'
where g.id = 'babababa-0000-4000-8000-000000000002'
on conflict (tenant_id, giveaway_id) do nothing;

insert into public.giveaway_rules_versions
  (giveaway_rules_id, version, content, effective_at, created_by)
select
  r.id,
  1,
  jsonb_build_object(
    'title', 'Official Rules',
    'effective_at', to_jsonb(now() - interval '60 days'),
    'time_zone', 'America/Denver',
    'summary', jsonb_build_array(
      'These are the official rules for Trailhead Cleanup Giveaway, run by Example Nonprofit, Inc. They say who can enter, how an entry is earned, what is being given away, what the chances are, and how a winner is picked.',
      'Read them before you enter. Entering means you accept them.'
    ),
    'sections', jsonb_build_array(
      jsonb_build_object('id', 'sponsor', 'title', 'Who is running this promotion', 'paragraphs', jsonb_build_array(
        'This promotion is run by **Example Nonprofit, Inc.** (“the sponsor”). These rules are an agreement between you and the sponsor.',
        'The sponsor can be written to at:',
        '- Example Nonprofit, Inc.' || chr(10) || '- 1200 Mountain Road, Suite 4' || chr(10) || '- Denver, CO 80202',
        'Questions about these rules go to [promotions@example.org](mailto:promotions@example.org).'
      )),
      jsonb_build_object('id', 'eligibility', 'title', 'Who can enter', 'paragraphs', jsonb_build_array(
        'Entry is open to legal residents of the states named below who are 18 years of age or older at the time they enter. One person may earn any number of tickets, but a person may hold only one account with us and may not enter under more than one name.',
        'Employees, board members and volunteers of the sponsor, and the members of their immediate households, may not enter.'
      )),
      jsonb_build_object('id', 'entry-period', 'title', 'When entries open and close', 'paragraphs', jsonb_build_array(
        'Entries are accepted from Jul 12, 2026, 9:00 AM MDT until Jul 12, 2026, 4:00 PM MDT. An entry earned after that is not entered in the drawing.',
        'Every time in these rules is given in the timezone shown beside it, which is the timezone the promotion runs in.'
      )),
      jsonb_build_object('id', 'how-to-enter', 'title', 'How to enter', 'paragraphs', jsonb_build_array(
        'Tickets are earned, and each ticket is one entry. There is more than one way to earn them:',
        '- **Donating gold-tier gear** — each item donated is classified when it is handed over, and every item earns its own tickets: 3 gold, 1 silver and 1 bronze tickets.' || chr(10) || '- **Donating silver-tier gear** — 1 gold, 3 silver and 2 bronze tickets.' || chr(10) || '- **Donating bronze-tier gear** — 1 silver and 3 bronze tickets.',
        'How much you donate or buy changes how many tickets you earn, and therefore your chances — that is how this promotion is designed. You can also enter without donating or buying anything: see “Entering without donating or buying” below.',
        'Tickets are handed over at the event and dropped into the bucket you choose. A ticket you do not drop into a bucket is not entered in the drawing.'
      )),
      jsonb_build_object('id', 'free-entry', 'title', 'Entering without donating or buying', 'paragraphs', jsonb_build_array(
        'You do not have to donate anything or buy anything to enter. To enter for free, mail a postcard with your full name, postal address, email address and a daytime telephone number to the sponsor''s address above, marked "Giveaway entry".',
        'Each postcard earns one ticket of the lowest tier, the same ticket a donated item in that tier earns. Postcards have to be postmarked within the entry period and reach us within seven days of it closing.'
      )),
      jsonb_build_object('id', 'odds', 'title', 'Odds of winning', 'paragraphs', jsonb_build_array(
        'Tickets come in colours, and the chance a ticket has depends on its colour. As of the date at the top of these rules:',
        '- **Gold tickets** — 48 tickets entered, 1 prize to be drawn: 1 in 48 per ticket.' || chr(10) || '- **Silver tickets** — 61 tickets entered, 1 prize to be drawn: 1 in 61 per ticket.',
        'These figures were worked out from the tickets that had been issued when this version of the rules was published, and they do not change afterwards. The chance a ticket actually has depends on how many entries there are in total by the time of the drawing.'
      )),
      jsonb_build_object('id', 'prizes', 'title', 'Prizes', 'paragraphs', jsonb_build_array(
        '2 prizes are being given away:',
        '- **Weekend cabin stay** — approximate retail value $400.00.' || chr(10) || '- **Gift basket** — approximate retail value $60.00.',
        'The approximate retail value of everything being given away is $460.00. A value given here is the sponsor''s good-faith estimate of what the item would sell for; what it is actually worth may differ, and no cash alternative is offered.'
      )),
      jsonb_build_object('id', 'drawing-and-notification', 'title', 'The drawing, and how a winner is notified', 'paragraphs', jsonb_build_array(
        'The drawing is held on Jul 12, 2026. Winning tickets are drawn at random, by hand, from the tickets entered — from each bucket separately where the promotion uses buckets.',
        'A winner is contacted using the details recorded when they entered. The sponsor will say, when it notifies a winner, how long that winner has to claim the prize and what it needs from them; a prize that goes unclaimed by then may be drawn again or kept.',
        'If you think you have won and have not heard anything, write to [promotions@example.org](mailto:promotions@example.org).'
      )),
      jsonb_build_object('id', 'winner-publication', 'title', 'What is published about a winner', 'paragraphs', jsonb_build_array(
        'We publish the first name and last initial of each winner, and the prize they won, on our website for 30 days after the drawing. We do not publish addresses, email addresses or telephone numbers.',
        'For a written list of winners, write to the sponsor''s address above within 60 days of the drawing and enclose a stamped, self-addressed envelope.'
      )),
      jsonb_build_object('id', 'publicity-and-privacy', 'title', 'Publicity and privacy', 'paragraphs', jsonb_build_array(
        'Accepting a prize permits us to use the winner''s name, the town they live in and a photograph taken at the handover in material about this promotion and about our work, without further payment, except where the law forbids it.',
        'A winner who would rather we did not may say so when the prize is claimed, and it makes no difference to the prize.',
        'What the sponsor collects from you when you enter, how long it keeps it, and how to ask for a copy or a deletion, is covered by its [privacy policy](/privacy).'
      )),
      jsonb_build_object('id', 'void-where-prohibited', 'title', 'Where this promotion is open', 'paragraphs', jsonb_build_array(
        'This promotion is open in Colorado and Utah only. It is void everywhere else, and wherever it is prohibited or restricted by law.',
        'Nothing in these rules overrides a law that applies to the promotion where you live.'
      )),
      jsonb_build_object('id', 'general-conditions', 'title', 'General conditions', 'paragraphs', jsonb_build_array(
        'Entering means you accept these rules and the sponsor''s decisions, which are final in everything to do with this promotion.',
        'The sponsor may change these rules, or suspend or call off the promotion, if something outside its control makes it impossible to run as described. A change is published as a new version of this page with its own effective date, and earlier versions stay readable here — the version in force when you entered is the one that governs your entry.',
        'A prize cannot be exchanged for cash and cannot be transferred to somebody else. If a prize becomes unavailable before it is handed over, the sponsor may substitute one of equal or greater value.',
        'Any tax owed on a prize is the winner''s responsibility.',
        'An entry that is incomplete, or that is made by anyone the rules exclude, may be disqualified.'
      ))
    )
  ),
  now() - interval '60 days',
  u.id
from public.giveaway_rules r
join auth.users u on u.email = 'admin@example.test'
where r.giveaway_id = 'babababa-0000-4000-8000-000000000002'
on conflict (tenant_id, giveaway_rules_id, version) do nothing;


-- Publications (#1471). Three issues, sized to the content extremes rather than
-- to a tidy sample: a 26-page issue with a long title and long transcripts, a
-- two-page one beside it so the previous/next links have somewhere to go, and a
-- draft that must never reach the public site. The object paths name files no
-- seed uploads -- the page renders its alt text in their place -- so the
-- layout, the anchors and the transcripts are what this exercises.
insert into public.publications (id, slug, title, season_label, publish_date, blurb, cover_path, cover_width, cover_height, reading_pdf_path, reading_pdf_bytes, print_pdf_path, print_pdf_bytes)
values
  ('b1b1b1b1-0000-4000-8000-000000000001', 'fall-2026',
   'The First Snow Issue: Stories, Comics and Hand-Drawn Maps From Everyone Who Showed Up to the Mountain This Year',
   'Fall 2026', '2026-09-22',
   'Our first zine: twenty-six pages of comics, interviews, a hand-drawn trail map and a recipe for the hot chocolate we serve at the lift, made by the people who ride with us. Every page has a full transcript underneath it, and the whole issue is a download if you would rather print it.',
   public.default_tenant_id()::text || '/b1b1b1b1-0000-4000-8000-000000000001/cover.webp', 1600, 2263,
   public.default_tenant_id()::text || '/b1b1b1b1-0000-4000-8000-000000000001/reading.pdf', 18874368,
   public.default_tenant_id()::text || '/b1b1b1b1-0000-4000-8000-000000000001/print.pdf', 20971520),
  ('b1b1b1b1-0000-4000-8000-000000000002', 'summer-2026',
   'Summer Preview', 'Summer 2026', '2026-06-21',
   'A two-page preview of what the zine would become.',
   null, null, null, null, null, null, null),
  ('b1b1b1b1-0000-4000-8000-000000000003', 'winter-2027',
   'Unfinished Winter Draft', 'Winter 2027', '2027-01-15',
   'A draft: never on the public site.',
   null, null, null, null, null, null, null);

insert into public.publication_pages (publication_id, position, image_path, width, height, alt_text, transcript)
select
  'b1b1b1b1-0000-4000-8000-000000000001', n,
  public.default_tenant_id()::text || '/b1b1b1b1-0000-4000-8000-000000000001/page-' || lpad(n::text, 2, '0') || '.webp',
  1600, 2263,
  'Page ' || n || ': ' || (array[
    'cover with a snowboarder drawn in rainbow ink',
    'comic about the first snow day and a very cold dog',
    'interview with a volunteer who has fitted four hundred pairs of boots',
    'hand-drawn trail map with the beginner runs circled'
  ])[1 + (n % 4)],
  repeat('The lift line was quiet that morning, and everybody who had come up on the bus stood in a loose half circle while somebody explained how bindings work, twice, because the wind took the first explanation away. ', 1 + (n % 5))
    || E'\n\n'
    || 'Lettering in the margin reads: "Nobody is bad at this on their first day. Everybody is new at it." '
    || repeat('A second column continues the story of the afternoon, when the clouds broke and the whole group rode the same green run nine times in a row. ', 1 + (n % 3))
from generate_series(1, 26) as n;

insert into public.publication_pages (publication_id, position, image_path, width, height, alt_text, transcript)
select
  'b1b1b1b1-0000-4000-8000-000000000002', n,
  public.default_tenant_id()::text || '/b1b1b1b1-0000-4000-8000-000000000002/page-' || n || '.webp',
  1600, 2263,
  'Page ' || n || ': preview spread',
  'Coming this fall: the first full issue.'
from generate_series(1, 2) as n;

-- The draft has a page with no transcript, which is exactly what keeps it a
-- draft: guard_publication_update() refuses to publish it.
insert into public.publication_pages (publication_id, position, image_path, width, height, alt_text, transcript)
values ('b1b1b1b1-0000-4000-8000-000000000003', 1,
  public.default_tenant_id()::text || '/b1b1b1b1-0000-4000-8000-000000000003/page-1.webp',
  1600, 2263, null, null);

update public.publications
set status = 'published'
where id in ('b1b1b1b1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000002');

-- Owners and due dates on event tasks (#1660). The bulk seed above writes
-- checklist items and sponsor follow-ups with neither, and stays that way so
-- its random() sequence -- and every row after it -- is unchanged. This pass
-- then gives about two in three of them an owner from the portal accounts and
-- a due date near the event, deterministically by row order, so the Events
-- open-work list has owned, unowned, dated and overdue rows to show.
with owners as (
  select p.id, row_number() over (order by p.email) - 1 as i, count(*) over () as n
  from public.people p
  where p.auth_user_id is not null
),
items as (
  select ci.id, e.starts_at,
         row_number() over (order by e.starts_at, ci.title, ci.is_done, ci.id) - 1 as i
  from public.event_checklist_items ci
  join public.events e on e.id = ci.event_id
)
update public.event_checklist_items ci
set owner_person_id = case when items.i % 3 <> 2 then owners.id end,
    due_date = (items.starts_at - (items.i % 5) * interval '1 day')::date
from items
join owners on owners.i = items.i % owners.n
where ci.id = items.id;

with owners as (
  select p.id, row_number() over (order by p.email) - 1 as i, count(*) over () as n
  from public.people p
  where p.auth_user_id is not null
),
sponsors as (
  select es.id, e.starts_at,
         row_number() over (order by e.starts_at, es.person_id) - 1 as i
  from public.event_sponsors es
  join public.events e on e.id = es.event_id
  where es.follow_up_status <> 'done'
)
update public.event_sponsors es
set follow_up_owner_person_id = case when sponsors.i % 3 <> 2 then owners.id end,
    follow_up_due_date = (sponsors.starts_at + ((sponsors.i % 4) + 1) * interval '7 days')::date
from sponsors
join owners on owners.i = sponsors.i % owners.n
where es.id = sponsors.id;
