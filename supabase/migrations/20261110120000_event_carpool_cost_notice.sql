-- #1772: the carpool cost notice, per event.
--
-- #1650 made the notice one `site_content` slot for the whole organization.
-- An event can now say something else, or nothing, without touching the
-- organization's words: `events.carpool_cost_notice`, a jsonb array of
-- paragraphs.
--
--   null   the organization's notice (`events.carpool_cost_notice` slot), as
--          before -- every existing event, and the default
--   []     no notice on this event: every surface that showed one shows none
--   [...]  this event's own paragraphs, in place of the organization's
--
-- Still a notice, not an acceptance (#1318): nothing is stored about having
-- seen it.
--
-- 1. The column.
-- 2. `public_events` exposes it, beside `carpools_enabled`, for the form.
-- 3. The registrant's two carpool reads carry it, as `notice`, so the card on
--    `/my` and on the answers link use the event's words.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.events
  add column carpool_cost_notice jsonb
    constraint events_carpool_cost_notice_paragraphs check (
      carpool_cost_notice is null
      or (
        jsonb_typeof(carpool_cost_notice) = 'array'
        and not jsonb_path_exists(carpool_cost_notice, '$[*] ? (@.type() != "string")')
      )
    );

comment on column public.events.carpool_cost_notice is
  'This event''s carpool cost notice: null for the organization''s (site_content events.carpool_cost_notice), an empty array for none, otherwise the paragraphs shown instead. Only read where carpools_enabled.';

-- ---------------------------------------------------------------------------
-- 2. The public view
-- ---------------------------------------------------------------------------

-- Appended at the end, as `create or replace view` requires; the filter is
-- 20261108120000's, unchanged.
create or replace view public.public_events with (security_barrier = true) as
select id, name, location, starts_at, ends_at, timezone, description, capacity,
       registration_enabled, registration_deadline, flier_url, adults_only,
       carpools_enabled, carpool_cost_notice
  from public.events
 where ((visibility = 'public' and status = 'published') or public.event_previewed(id))
   and tenant_id = public.public_tenant_id();

-- ---------------------------------------------------------------------------
-- 3. The registrant's reads
-- ---------------------------------------------------------------------------

-- Same signatures and return type, so grants and comments carry over; only
-- the object gains `notice`.
create or replace function public.my_registration_carpool(p_registration_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when e.carpools_enabled then
           jsonb_build_object(
             'car', public.carpool_assignment_card(r.id),
             'notice', e.carpool_cost_notice
           )
         end
    from public.event_registrations r
    join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
   where r.id = p_registration_id
     and r.cancelled_at is null
     and r.person_id = public.my_constituent_person_id('events');
$$;

create or replace function public.registration_carpool_by_token(
  p_token_hash text,
  p_ip_address inet
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_result jsonb;
begin
  if not public.check_rate_limit('registration_carpool_by_token', p_ip_address, 30, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  -- LINK_INVALID for anything unknown, expired, superseded, cancelled or
  -- another tenant's.
  select * into v_request
    from public.resolve_registration_answer_request(p_token_hash, false);

  select case when e.carpools_enabled then
           jsonb_build_object(
             'car', public.carpool_assignment_card(v_request.registration_id),
             'notice', e.carpool_cost_notice
           )
         end
    into v_result
    from public.events e
   where e.id = v_request.event_id
     and e.tenant_id = v_request.tenant_id;

  return v_result;
end;
$$;

comment on function public.my_registration_carpool(uuid) is
  'The signed-in caller''s own carpool assignment (#1651): null where the registration is not theirs, is cancelled, or its event organizes no carpools; otherwise {"car": carpool_assignment_card() or null when not placed yet, "notice": events.carpool_cost_notice}.';

comment on function public.registration_carpool_by_token(text, inet) is
  'The carpool assignment behind a live answers link (#1651), for registrants with no account: null where the event organizes no carpools, otherwise {"car": carpool_assignment_card() or null, "notice": events.carpool_cost_notice}. LINK_INVALID as get_registration_answer_request(); rate-limited per IP.';
