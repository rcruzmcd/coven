-- #1764. Staff preview of a private or unpublished event, and test
-- registrations made from it.
--
-- An event is still `public` or `private`, and the anonymous path is exactly
-- as strict as before. What changes:
--
--   1. `event_registrations.is_test` (and `tested_by`, who made it). A test
--      registration holds no seats, fills no option cap, gets no reminder,
--      counts in no impact metric, answer breakdown or carpool, and has no
--      person: `person_id` stays null, so it mints no directory record and
--      nothing keyed on the person sees it. It never becomes real -- the flag
--      cannot be changed once written, and publishing the event leaves it be.
--   2. A preview header. The server sends `x-event-preview: <event id>` on the
--      preview page only, and the public_* views a detail page reads then also
--      show *that one* event -- whatever its visibility or status -- to a
--      signed-in member with `events: manage` in the event's tenant, on that
--      tenant's own host. Listings never send it, so a private event never
--      appears in one; an anonymous request that sends it gets nothing more.
--   3. `register_for_event(..., p_preview)`. True takes the same checks as
--      the public path except visibility and status, refuses anyone the
--      header would refuse with the same EVENT_NOT_FOUND, and writes a test
--      registration: no person, no auto-assigned discount code.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.event_registrations
  add column is_test boolean not null default false,
  add column tested_by uuid references auth.users (id) on delete set null,
  add constraint event_registrations_tested_by_is_test
    check (tested_by is null or is_test),
  add constraint event_registrations_test_has_no_person
    check (not is_test or person_id is null);

comment on column public.event_registrations.is_test is
  'A test registration made from the staff preview of the event (#1764). Holds no seats, counts in nothing, has no person, and cannot be changed after insert.';
comment on column public.event_registrations.tested_by is
  'The signed-in user who made the test registration (#1764); their account address is the only one its confirmation is sent to.';

-- The table's SELECT is a column allow-list (20260922070000), so the portal
-- sees a column only once it is on it -- and only the four minor contacts are
-- meant to be missing from it (minor-contacts.integration.test.ts).
grant select (is_test, tested_by) on public.event_registrations to authenticated;

-- A tester may type any address, a real registrant's included, and may run
-- the form more than once: neither should collide with anything real.
drop index public.event_registrations_event_email_key;
create unique index event_registrations_event_email_key
  on public.event_registrations (event_id, lower(email))
  where email <> '' and cancelled_at is null and not is_test;

create function public.event_registrations_is_test_fixed()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.is_test is distinct from old.is_test then
    raise exception 'IS_TEST_IMMUTABLE';
  end if;
  return new;
end;
$$;

revoke execute on function public.event_registrations_is_test_fixed() from public, anon, authenticated;

create trigger event_registrations_is_test_fixed
  before update of is_test on public.event_registrations
  for each row execute function public.event_registrations_is_test_fixed();

-- ---------------------------------------------------------------------------
-- 2. Who may preview
-- ---------------------------------------------------------------------------

-- The event the request asks to preview, or null. Anything that is not a
-- uuid is null rather than an error, so a mangled header is a plain 404.
create function public.request_preview_event_id()
returns uuid
language sql
stable
set search_path to 'public'
as $$
  select case
    when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then v::uuid
  end
  from (
    select btrim(coalesce(
      current_setting('request.headers', true)::json ->> 'x-event-preview', ''
    )) as v
  ) h;
$$;

-- Whether the caller may preview this event: a member with `events: manage`
-- whose current tenant is the event's, on that tenant's own public host.
-- Security definer to read a private event's tenant; it says nothing else.
create function public.can_preview_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
     and exists (
       select 1 from public.events e
        where e.id = p_event_id
          and e.tenant_id = public.public_tenant_id()
          and e.tenant_id = public.current_tenant_id()
     )
     and public.has_permission('events', 'manage');
$$;

-- The predicate the public views add: this row's event is the one the
-- request names, and the caller may preview it.
create function public.event_previewed(p_event_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  -- coalesce, so a request with no header stops at false here rather than
  -- asking can_preview_event() about every private row.
  select coalesce(p_event_id = public.request_preview_event_id(), false)
     and public.can_preview_event(p_event_id);
$$;

grant execute on function public.request_preview_event_id() to anon, authenticated;
grant execute on function public.can_preview_event(uuid) to anon, authenticated;
grant execute on function public.event_previewed(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The views a detail page reads
-- ---------------------------------------------------------------------------
-- Same columns, so `create or replace` keeps their grants and options.

create or replace view public.public_events with (security_barrier = true) as
select id, name, location, starts_at, ends_at, timezone, description, capacity,
       registration_enabled, registration_deadline, flier_url, adults_only,
       carpools_enabled
  from public.events
 where ((visibility = 'public' and status = 'published') or public.event_previewed(id))
   and tenant_id = public.public_tenant_id();

create or replace view public.public_event_sponsors with (security_barrier = true) as
select es.id as sponsor_id, es.event_id, p.name, p.logo_url, p.website
  from public.event_sponsors es
  join public.people p on p.id = es.person_id
  join public.events e on e.id = es.event_id
 where es.is_public = true
   and ((e.visibility = 'public' and e.status = 'published') or public.event_previewed(e.id))
   and e.tenant_id = public.public_tenant_id();

create or replace view public.public_event_programs with (security_barrier = true) as
select ep.event_id, p.id as program_id, p.name
  from public.event_programs ep
  join public.programs p on p.id = ep.program_id
  join public.events e on e.id = ep.event_id
 where ((e.visibility = 'public' and e.status = 'published') or public.event_previewed(e.id))
   and e.tenant_id = public.public_tenant_id();

create or replace view public.public_event_registration_questions with (security_barrier = true) as
select q.id, q.event_id, q.kind, q.prompt, q.help, q.required, q.sort_order,
       q.options, q.min_value, q.max_value, q.show_if, q.place_granularity,
       q.place_allow_other, q.allow_other
  from public.event_registration_questions q
  join public.events e on e.id = q.event_id and e.tenant_id = q.tenant_id
 where ((e.visibility = 'public' and e.status = 'published') or public.event_previewed(e.id))
   and q.archived_at is null
   and q.tenant_id = public.public_tenant_id();

-- A test registration fills no option.
create or replace view public.public_event_registration_options with (security_barrier = true) as
select o.id, o.event_id, o.label, o.sort_order,
       e.registration_options_prompt as prompt,
       (o.cap is not null and coalesce((
          select sum(c.quantity)
            from public.event_registration_option_counts c
            join public.event_registrations r on r.id = c.registration_id
           where c.option_id = o.id and r.cancelled_at is null and not r.is_test
        ), 0) >= o.cap) as is_full
  from public.event_registration_options o
  join public.events e on e.id = o.event_id and e.tenant_id = o.tenant_id
 where ((e.visibility = 'public' and e.status = 'published') or public.event_previewed(e.id))
   and o.tenant_id = public.public_tenant_id();

-- ---------------------------------------------------------------------------
-- 4. Everything that counts registrations leaves test ones out
-- ---------------------------------------------------------------------------
-- Patched in place, like #1746: each function's current definition, with the
-- match count asserted so a definition that has drifted fails here rather
-- than silently keeping test registrations in.

create function pg_temp.patch(p_fn text, p_pattern text, p_repl text, p_expected integer)
returns void
language plpgsql
as $$
declare
  v_oid regprocedure;
  v_def text;
  v_n integer;
begin
  select p.oid::regprocedure into strict v_oid
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = p_fn;
  v_def := pg_get_functiondef(v_oid);
  select count(*) into v_n from regexp_matches(v_def, p_pattern, 'g');
  if v_n <> p_expected then
    raise exception '#1764: % matches of % in %, expected %', v_n, p_pattern, p_fn, p_expected;
  end if;
  execute regexp_replace(v_def, p_pattern, p_repl, 'g');
end;
$$;

-- Every "active registration" filter in these is a registration's, so each
-- gains "and not a test" beside it.
do $patch$
declare
  v_fn record;
begin
  for v_fn in
    select * from (values
      -- capacity and option caps
      ('register_myself_for_event', 1),
      ('apply_registration_option_counts', 1),
      -- impact metrics and answer breakdowns
      ('get_event_impact_derived_data', 4),
      ('get_program_impact_rollup_data', 4),
      ('get_event_answer_breakdown', 1),
      ('person_answer_metric_counts', 1),
      ('place_answer_counts', 1),
      ('event_media_summary', 1),
      -- reminders
      ('claim_event_reminders', 1),
      ('event_reminder_due_tenants', 1),
      ('event_reminder_status', 1),
      ('stamp_event_reminder', 1),
      ('event_reminder_message', 1),
      -- carpools
      ('event_carpool_assignment_recipients', 1)
    ) as t(name, n)
  loop
    perform pg_temp.patch(
      v_fn.name,
      '(\m[a-z_]+\.)?cancelled_at is null',
      '\1cancelled_at is null and not \1is_test',
      v_fn.n
    );
  end loop;
end
$patch$;

-- Restoring a cancelled registration re-checks seats and caps; its third
-- match is its own record's state and is left alone.
select pg_temp.patch(
  'restore_event_registration',
  'and cancelled_at is null;',
  'and cancelled_at is null and not is_test;',
  1
);
select pg_temp.patch(
  'restore_event_registration',
  'and r\.cancelled_at is null(\s+\), 0\) > o\.cap)',
  'and r.cancelled_at is null and not r.is_test\1',
  1
);

-- What others have taken of each option, as a registrant's own page says it.
select pg_temp.patch(
  'my_registration_option_counts',
  'other\.cancelled_at is null',
  'other.cancelled_at is null and not other.is_test',
  1
);

-- A test registration does not ride in a carpool.
select pg_temp.patch(
  'carpool_registration_guard',
  'and r\.tenant_id = p_tenant_id;',
  'and r.tenant_id = p_tenant_id and not r.is_test;',
  1
);

-- ---------------------------------------------------------------------------
-- 5. register_for_event(..., p_preview)
-- ---------------------------------------------------------------------------
-- A trailing parameter, so the function is recreated from its own current
-- definition and the old signature dropped. Found by name rather than by
-- signature so this does not depend on which of its parameters are still
-- there.

do $patch$
declare
  v_old regprocedure;
  v_def text;
  v_new_sig regprocedure;
  v_comment text;

  v_edits constant text[][] := array[
    -- the parameter
    array[
      'p_preferred_contact_detail text DEFAULT NULL::text)',
      'p_preferred_contact_detail text DEFAULT NULL::text, p_preview boolean DEFAULT false)'
    ],
    -- the gate: the same refusal an unknown event gets
    array[
      E'  -- #902\n',
      E'  -- #1764. A preview is the event''s own manager, on its own host.\n' ||
      E'  if p_preview and not public.can_preview_event(p_event_id) then\n' ||
      E'    raise exception ''EVENT_NOT_FOUND'';\n' ||
      E'  end if;\n\n' ||
      E'  -- #902\n'
    ],
    array[
      E'    and visibility = ''public''\n    and status = ''published'';',
      E'    and ((visibility = ''public'' and status = ''published'') or p_preview);'
    ],
    -- seats
    array[
      E'    where event_id = p_event_id\n      and cancelled_at is null;',
      E'    where event_id = p_event_id\n      and cancelled_at is null\n      and not is_test;'
    ],
    -- no person
    array[
      E'  v_person_id := public.resolve_or_create_person_by_email(\n    p_name, p_email, p_phone, null, ''other'', null, v_contact.instagram_handle, v_pronouns, v_tenant_id\n  );',
      E'  -- #1764. A test registration mints and matches no directory record.\n' ||
      E'  if not p_preview then\n' ||
      E'    v_person_id := public.resolve_or_create_person_by_email(\n' ||
      E'      p_name, p_email, p_phone, null, ''other'', null, v_contact.instagram_handle, v_pronouns, v_tenant_id\n' ||
      E'    );\n' ||
      E'  end if;'
    ],
    -- the flag
    array[
      E'has_no_instagram, preferred_contact_method, preferred_contact_detail)\n  values',
      E'has_no_instagram, preferred_contact_method, preferred_contact_detail,\n     is_test, tested_by)\n  values'
    ],
    array[
      E'v_contact.has_no_instagram, v_contact.preferred_contact_method, v_contact.preferred_contact_detail)\n  returning',
      E'v_contact.has_no_instagram, v_contact.preferred_contact_method, v_contact.preferred_contact_detail,\n     p_preview, case when p_preview then auth.uid() end)\n  returning'
    ],
    -- a real code is not spent on a test
    array[
      '  if v_event.auto_assign_discount_codes then',
      '  if v_event.auto_assign_discount_codes and not p_preview then'
    ]
  ];
  i integer;
begin
  select p.oid::regprocedure into strict v_old
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'register_for_event';

  v_def := pg_get_functiondef(v_old);
  v_comment := obj_description(v_old::oid, 'pg_proc');

  for i in 1 .. array_length(v_edits, 1) loop
    if (length(v_def) - length(replace(v_def, v_edits[i][1], '')))
         / length(v_edits[i][1]) <> 1 then
      raise exception '#1764: expected one % in register_for_event', v_edits[i][1];
    end if;
    v_def := replace(v_def, v_edits[i][1], v_edits[i][2]);
  end loop;

  execute format('drop function %s', v_old);
  execute v_def;

  select p.oid::regprocedure into strict v_new_sig
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'register_for_event';

  execute format(
    'comment on function %s is %L', v_new_sig,
    v_comment || ' With p_preview (#1764) a signed-in member with events: manage in the event''s tenant, on that tenant''s host, may register for the event whatever its visibility or status; the row is a test registration (is_test, tested_by) with no person and no auto-assigned discount code, and holds no seats. Anyone else sending p_preview gets EVENT_NOT_FOUND.'
  );
  execute format('grant execute on function %s to anon, authenticated', v_new_sig);
end
$patch$;
