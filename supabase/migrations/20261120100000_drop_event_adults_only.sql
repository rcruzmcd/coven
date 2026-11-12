-- #1784. Drop `events.adults_only`, which `minimum_age` replaced (#1782).
--
-- 20261112100000 kept the column, synced both ways by a trigger, while main
-- still read and wrote it. Main now runs #1782's code; the last readers --
-- the public event page's and the API's column lists -- stop selecting it in
-- this change, and the API derives its `adults_only` field from
-- `minimum_age`. Ship this migration with the release that carries them.
--
-- `event_registrations.adults_only_confirmed_at` and the RPCs'
-- `p_adults_only_confirmed` stay: they record and carry the registrant's
-- confirmation, not the event's setting.

-- ---------------------------------------------------------------------------
-- 0. Nothing else may still name the column
-- ---------------------------------------------------------------------------
-- A PL/pgSQL body isn't tracked in pg_depend, so a function still reading
-- `adults_only` would only fail when called. Refuse here instead.

do $check$
declare
  v_fns text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_fns
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname <> 'events_sync_minimum_age'
     and replace(p.prosrc, 'adults_only_confirmed', '') ~ 'adults_only';

  if v_fns is not null then
    raise exception '#1784: still names adults_only: %', v_fns;
  end if;
end
$check$;

-- ---------------------------------------------------------------------------
-- 1. The public view
-- ---------------------------------------------------------------------------
-- `create or replace view` can't drop an output column, so it is rebuilt.
-- Nothing else selects from it. Filter as 20261112100000; grants and comment
-- as before.

drop view public.public_events;

create view public.public_events with (security_barrier = true) as
select id, name, location, starts_at, ends_at, timezone, description, capacity,
       registration_enabled, registration_deadline, flier_url,
       carpools_enabled, carpool_cost_notice, minimum_age
  from public.events
 where ((visibility = 'public' and status = 'published') or public.event_previewed(id))
   and tenant_id = public.public_tenant_id();

grant select on public.public_events to anon, authenticated;

comment on view public.public_events is
  'Published, public events of the tenant the request host resolves to. Security definer by design (#887): `events` has no `anon` select policy, so an invoker-rights view would render the public site empty. Isolation is this view body -- tenant_id = public_tenant_id(), visibility/status, and an explicit column list that omits the internal fields.';

-- ---------------------------------------------------------------------------
-- 2. The sync trigger, the constraint and the column
-- ---------------------------------------------------------------------------

drop trigger events_sync_minimum_age on public.events;
drop function public.events_sync_minimum_age();

alter table public.events
  drop constraint events_adults_only_matches_minimum_age,
  drop column adults_only;
