-- #1782. An event's age requirement: none, 18+ or 21+.
--
-- #1417 made it one switch, `events.adults_only` (18+). Some events need 21+
-- (a venue serving alcohol), so the setting becomes an age:
--
--   1. `events.minimum_age` (null, 18 or 21), backfilled 18 where adults_only.
--   2. `events.adults_only` stays while main lags development: main still
--      reads and writes it. A trigger keeps the two in step whichever one a
--      write names -- `adults_only = minimum_age is not null`, and main
--      writing `adults_only` alone sets 18 or clears the age. Dropped in a
--      follow-up once main ships this.
--   3. `event_registrations.confirmed_minimum_age`: which age the registrant
--      confirmed, beside `adults_only_confirmed_at`, so an event moved from
--      18+ to 21+ after someone registered shows what they actually said.
--   4. Both registration RPCs, patched in place (same signatures, grants and
--      comments): the confirmation is required for any minimum age, the
--      under-18 question is skipped for any, ADULTS_ONLY_CONFIRMATION_REQUIRED
--      carries the age as its DETAIL so the error can name it, and the
--      registration records the age. `p_adults_only_confirmed` keeps its name.
--   5. `public_events` exposes `minimum_age` beside `adults_only`.
--
-- Self-confirmation, as before, not ID verification.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.events
  add column minimum_age smallint
    constraint events_minimum_age_allowed check (minimum_age in (18, 21));

update public.events set minimum_age = 18 where adults_only;

alter table public.events
  add constraint events_adults_only_matches_minimum_age
    check (adults_only = (minimum_age is not null));

comment on column public.events.minimum_age is
  'Age requirement (#1782): null for none, 18 or 21. Set, the public site shows the age as a badge and registration requires every registrant to confirm everyone in their party is that age or over, and never asks the under-18 question.';

comment on column public.events.adults_only is
  'Deprecated by minimum_age (#1782); kept in step with it by events_sync_minimum_age until main stops reading it. True exactly when minimum_age is set.';

-- ---------------------------------------------------------------------------
-- 2. Keeping adults_only in step
-- ---------------------------------------------------------------------------

create function public.events_sync_minimum_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A write that names the age wins; one that names only the old switch
  -- (main) sets 18 or clears it.
  if tg_op = 'INSERT' then
    if new.minimum_age is null and new.adults_only then
      new.minimum_age := 18;
    end if;
  elsif new.minimum_age is distinct from old.minimum_age then
    null;
  elsif new.adults_only is distinct from old.adults_only then
    new.minimum_age := case when new.adults_only then 18 end;
  end if;

  new.adults_only := new.minimum_age is not null;
  return new;
end;
$$;

create trigger events_sync_minimum_age
  before insert or update of adults_only, minimum_age on public.events
  for each row execute function public.events_sync_minimum_age();

-- ---------------------------------------------------------------------------
-- 3. What the registrant confirmed
-- ---------------------------------------------------------------------------

alter table public.event_registrations
  add column confirmed_minimum_age smallint
    constraint event_registrations_confirmed_minimum_age_allowed
      check (confirmed_minimum_age in (18, 21));

update public.event_registrations
   set confirmed_minimum_age = 18
 where adults_only_confirmed_at is not null;

-- Read where adults_only_confirmed_at is (20260923150000): staff, through RLS.
grant select (confirmed_minimum_age) on public.event_registrations to authenticated;

comment on column public.event_registrations.confirmed_minimum_age is
  'The age the registrant confirmed everyone in their party was (#1782), set with adults_only_confirmed_at. Null where nothing was confirmed.';

-- ---------------------------------------------------------------------------
-- 4. The registration RPCs
-- ---------------------------------------------------------------------------
-- Each function's current definition, with every edit's match count asserted
-- so a definition that has drifted fails here rather than silently keeping
-- the 18+ check. `create or replace` with the signature unchanged, so grants
-- and comments carry over.

do $patch$
declare
  v_fn text;
  v_def text;
  v_edits constant text[][] := array[
    array[
      'auto_assign_discount_codes, adults_only' || E'\n',
      'auto_assign_discount_codes, minimum_age' || E'\n',
      '1'
    ],
    array['v_event.adults_only', 'v_event.minimum_age is not null', '3'],
    array[
      'raise exception ''ADULTS_ONLY_CONFIRMATION_REQUIRED'';',
      'raise exception ''ADULTS_ONLY_CONFIRMATION_REQUIRED'' using detail = v_event.minimum_age::text;',
      '1'
    ],
    array[
      E'     adults_only_confirmed_at,\n',
      E'     adults_only_confirmed_at, confirmed_minimum_age,\n',
      '1'
    ],
    array[
      'case when v_event.minimum_age is not null then now() end,',
      'case when v_event.minimum_age is not null then now() end, v_event.minimum_age,',
      '1'
    ]
  ];
  i integer;
  v_n integer;
begin
  foreach v_fn in array array['register_for_event', 'register_myself_for_event'] loop
    select pg_get_functiondef(p.oid) into strict v_def
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_fn;

    for i in 1 .. array_length(v_edits, 1) loop
      v_n := (length(v_def) - length(replace(v_def, v_edits[i][1], '')))
               / length(v_edits[i][1]);
      if v_n <> v_edits[i][3]::integer then
        raise exception '#1782: % matches of % in %, expected %',
          v_n, v_edits[i][1], v_fn, v_edits[i][3];
      end if;
      v_def := replace(v_def, v_edits[i][1], v_edits[i][2]);
    end loop;

    execute v_def;
  end loop;
end
$patch$;

-- ---------------------------------------------------------------------------
-- 5. The public view
-- ---------------------------------------------------------------------------

-- Appended at the end, as `create or replace view` requires; the filter is
-- 20261110120000's, unchanged.
create or replace view public.public_events with (security_barrier = true) as
select id, name, location, starts_at, ends_at, timezone, description, capacity,
       registration_enabled, registration_deadline, flier_url, adults_only,
       carpools_enabled, carpool_cost_notice, minimum_age
  from public.events
 where ((visibility = 'public' and status = 'published') or public.event_previewed(id))
   and tenant_id = public.public_tenant_id();
