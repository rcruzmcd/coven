-- Profile questions: check-in snapshots, metric rows, impact RPCs and the
-- answers breakdown (#1745, part of #1409)
-- ---------------------------------------------------------------------------
--
-- Design record: planning coven/product/2026-10-31-person-profile-questions.md,
-- section 4.
--
--   person_answer_snapshots   a registrant's answers as they stood when they
--                             were checked in, for every question marked
--                             snapshot_at_checkin
--   person_answer_metrics     tenant-defined derived figures ("Beginner
--                             participants") over option keys, never code
--
-- WHICH ANSWER A REGISTRATION COUNTS WITH. The snapshot taken at check-in;
-- where the registration has none at all, the person's current answers. All
-- or nothing per registration, exactly as the rider columns' coalesce reads
-- them (20260904140000), so moving Chatter Snow onto this (#1746) leaves past
-- figures unchanged.
--
-- ADDITIVE UNTIL #1746. The rider columns, their trigger and the impact RPCs'
-- rider keys are left as they are; #1746 moves Chatter Snow's data here and
-- retires them in one release. A tenant with no metric rows gets an empty
-- list, so nothing it sees changes today.
--
-- get_event_impact_derived_data and get_program_impact_rollup_data are
-- otherwise 20261012000000's, with one key added. save_person_questions is
-- 20261102120000's with its archive-or-delete test widened (section 3).

-- ---------------------------------------------------------------------------
-- 1. Option keys
-- ---------------------------------------------------------------------------

-- The keys of the options a stored choice answer names: each option's `key`,
-- or its id where it has none, so a tenant that never set codes can still
-- write a metric. An "Other" answer, a removed option and every other kind
-- name none.
create function public.question_option_keys(p_options jsonb, p_value jsonb)
returns text[]
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(array_agg(coalesce(nullif(o->>'key', ''), o->>'id') order by o.ordinality), '{}')
    from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) with ordinality as o(o, ordinality)
   where case jsonb_typeof(p_value)
           when 'string' then o->>'id' = p_value #>> '{}'
           when 'array' then p_value ? (o->>'id')
           else false
         end;
$$;

comment on function public.question_option_keys(jsonb, jsonb) is
  'The option keys (key, else id) a stored single or multi choice answer names (#1745); empty for Other, a removed option or any other kind. What snapshots denormalize and metrics read.';

-- ---------------------------------------------------------------------------
-- 2. Check-in snapshots
-- ---------------------------------------------------------------------------

create table public.person_answer_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  registration_id uuid not null,
  question_id uuid not null,
  value jsonb not null,
  answer_text text not null,
  -- Denormalized at check-in so a metric needs no join into the options, and
  -- relabelling or archiving an option never changes a past figure.
  option_keys text[] not null default '{}',
  taken_at timestamptz not null default now(),
  constraint person_answer_snapshots_registration_question_key
    unique (registration_id, question_id),
  constraint person_answer_snapshots_registration_fkey
    foreign key (tenant_id, registration_id)
    references public.event_registrations (tenant_id, id) on delete cascade,
  -- A question with snapshots is archived, never deleted (section 3), so this
  -- cascade is reached only by delete_tenant().
  constraint person_answer_snapshots_question_fkey
    foreign key (tenant_id, question_id)
    references public.person_questions (tenant_id, id) on delete cascade
);

create index person_answer_snapshots_question_idx
  on public.person_answer_snapshots (question_id);

comment on table public.person_answer_snapshots is
  'A registrant''s profile answers as they stood at check-in (#1409, #1745), for questions with snapshot_at_checkin. What the impact metrics and the answers breakdown read, falling back to person_answers only for a registration with no snapshot at all. Written only by the check-in trigger. Personal data: free text can hold anything.';

alter table public.person_answer_snapshots enable row level security;
revoke all on public.person_answer_snapshots from public, anon, authenticated;
grant select on public.person_answer_snapshots to authenticated;

create policy "person_answer_snapshots select" on public.person_answer_snapshots
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('person_answers', 'view')
  );

insert into public.retention_snapshot_personal_columns (table_name, column_name) values
  ('person_answer_snapshots', 'value'),
  ('person_answer_snapshots', 'answer_text');

-- The same transition snapshot_rider_profile_on_checkin() fires on, so it
-- covers every check-in path for the reason 20260904120000 gives. After, not
-- before, because the rows name the registration. A person with nothing to
-- snapshot leaves any earlier snapshot alone, as the rider trigger does; one
-- with something replaces the set, so a re-check-in reads as of now.
create function public.snapshot_person_answers_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.person_id is null or new.checked_in_at is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.checked_in_at is not null then
    return null;
  end if;

  if not exists (
    select 1
      from public.person_answers a
      join public.person_questions q on q.id = a.question_id
     where a.person_id = new.person_id
       and a.tenant_id = new.tenant_id
       and q.snapshot_at_checkin
       and q.archived_at is null
  ) then
    return null;
  end if;

  delete from public.person_answer_snapshots s where s.registration_id = new.id;

  insert into public.person_answer_snapshots
    (tenant_id, registration_id, question_id, value, answer_text, option_keys)
  select new.tenant_id, new.id, a.question_id, a.value, a.answer_text,
         public.question_option_keys(q.options, a.value)
    from public.person_answers a
    join public.person_questions q on q.id = a.question_id
   where a.person_id = new.person_id
     and a.tenant_id = new.tenant_id
     and q.snapshot_at_checkin
     and q.archived_at is null;

  return null;
end;
$$;

comment on function public.snapshot_person_answers_on_checkin() is
  'Copies a registrant''s current answers to snapshot_at_checkin questions onto the registration when it is checked in (#1745). A person with none leaves earlier snapshots alone.';

revoke execute on function public.snapshot_person_answers_on_checkin() from public, anon, authenticated;

create trigger snapshot_person_answers_on_checkin
  after insert or update of checked_in_at on public.event_registrations
  for each row
  execute function public.snapshot_person_answers_on_checkin();

-- ---------------------------------------------------------------------------
-- 3. Metric rows
-- ---------------------------------------------------------------------------

create table public.person_answer_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- Optional stable slug, as person_questions.key, for a migration to name it.
  key text
    check (key is null or key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null
    check (btrim(label) <> '' and char_length(label) <= 80),
  -- any:            one listed answer has one of the keys
  -- every_answered: at least one listed question answered, and every listed
  --                 answer has one of the keys
  rule text not null
    check (rule in ('any', 'every_answered')),
  question_ids uuid[] not null
    check (cardinality(question_ids) between 1 and 20),
  option_keys text[] not null
    check (cardinality(option_keys) between 1 and 50),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_answer_metrics_tenant_id_id_key unique (tenant_id, id)
);

create unique index person_answer_metrics_tenant_key_key
  on public.person_answer_metrics (tenant_id, key) where key is not null;

comment on table public.person_answer_metrics is
  'Derived figures a tenant defines over its profile questions (#1409, #1745): a label, a rule (any | every_answered), the questions it reads and the option keys it counts. Counted over check-in snapshots, falling back to current answers, by person_answer_metric_counts(). Written only by save_person_answer_metrics().';

alter table public.person_answer_metrics enable row level security;
revoke all on public.person_answer_metrics from public, anon, authenticated;
grant select on public.person_answer_metrics to authenticated;

create policy "person_answer_metrics select" on public.person_answer_metrics
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('person_answers', 'view')
  );

insert into public.audited_tables (table_name, pk_column) values
  ('person_answer_metrics', 'id');

create trigger audit_log_row after insert or update or delete
  on public.person_answer_metrics
  for each row execute function public.audit_log_row();

-- Whether a question must be archived rather than deleted when an editor
-- leaves it out: somebody answered it, a past check-in snapshotted it, or a
-- metric reads it. Deleting it would rewrite a past event's figures.
create function public.person_question_in_use(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.person_answers a where a.question_id = p_question_id)
      or exists (select 1 from public.person_answer_snapshots s where s.question_id = p_question_id)
      or exists (select 1 from public.person_answer_metrics m where p_question_id = any (m.question_ids));
$$;

comment on function public.person_question_in_use(uuid) is
  'Whether a profile question has answers, check-in snapshots or a metric reading it (#1745), so save_person_questions() archives it rather than deleting it.';

revoke execute on function public.person_question_in_use(uuid) from public, anon, authenticated;

-- save_person_questions() archived a question left out only when a current
-- answer existed. Patched in place, both tests at once.
do $patch$
declare
  v_signature constant text := 'public.save_person_questions(jsonb)';
  v_find constant text := 'exists (select 1 from public.person_answers a where a.question_id = q.id)';
  v_def text;
  v_count int;
begin
  v_def := pg_get_functiondef(v_signature::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, v_find, ''))) / length(v_find);
  if v_count <> 2 then
    raise exception '#1745: expected two matches in %, found %', v_signature, v_count;
  end if;
  execute replace(v_def, v_find, 'public.person_question_in_use(q.id)');
end
$patch$;

create function public.save_person_answer_metrics(p_metrics jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_metric jsonb;
  v_id uuid;
  v_key text;
  v_label text;
  v_rule text;
  v_questions uuid[];
  v_keys text[];
  v_offered text[];
  v_index integer := 0;
  v_ids uuid[] := '{}';
  v_slugs text[] := '{}';
begin
  if not public.has_permission('person_answers', 'manage') then
    raise exception 'Not authorized to edit profile metrics';
  end if;

  if p_metrics is null or jsonb_typeof(p_metrics) <> 'array' then
    raise exception 'PERSON_ANSWER_METRICS_INVALID';
  end if;
  if jsonb_array_length(p_metrics) > 10 then
    raise exception 'PERSON_ANSWER_METRICS_TOO_MANY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('save_person_answer_metrics:' || v_tenant_id::text, 0));

  for v_metric in select value from jsonb_array_elements(p_metrics) loop
    if jsonb_typeof(v_metric) <> 'object'
       or coalesce(lower(v_metric->>'id'), '') !~ v_uuid
       or jsonb_typeof(v_metric->'question_ids') is distinct from 'array'
       or jsonb_typeof(v_metric->'option_keys') is distinct from 'array'
       or jsonb_typeof(v_metric->'label') is distinct from 'string'
       or jsonb_typeof(v_metric->'key') not in ('string', 'null') then
      raise exception 'PERSON_ANSWER_METRICS_INVALID';
    end if;

    v_id := (v_metric->>'id')::uuid;
    if v_id = any (v_ids) or exists (
      select 1 from public.person_answer_metrics m
       where m.id = v_id and m.tenant_id <> v_tenant_id
    ) then
      raise exception 'PERSON_ANSWER_METRICS_INVALID';
    end if;

    v_label := btrim(v_metric->>'label');
    if v_label = '' then
      raise exception 'PERSON_ANSWER_METRICS_LABEL_REQUIRED';
    end if;
    if char_length(v_label) > 80 then
      raise exception 'PERSON_ANSWER_METRICS_INVALID';
    end if;

    v_rule := v_metric->>'rule';
    if v_rule is null or v_rule not in ('any', 'every_answered') then
      raise exception 'PERSON_ANSWER_METRICS_INVALID';
    end if;

    v_key := nullif(btrim(coalesce(v_metric->>'key', '')), '');
    if v_key !~ '^[a-z][a-z0-9_]{0,39}$' then
      raise exception 'PERSON_ANSWER_METRICS_KEY_INVALID';
    end if;
    if v_key = any (v_slugs) then
      raise exception 'PERSON_ANSWER_METRICS_KEY_TAKEN';
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_metric->'question_ids') e
       where jsonb_typeof(e) <> 'string' or lower(e #>> '{}') !~ v_uuid
    ) then
      raise exception 'PERSON_ANSWER_METRICS_QUESTIONS_INVALID';
    end if;
    select coalesce(array_agg(distinct lower(e #>> '{}')::uuid), '{}') into v_questions
      from jsonb_array_elements(v_metric->'question_ids') e;

    -- Choice questions of this tenant. An archived one stays valid: its
    -- snapshots still count on past events.
    if cardinality(v_questions) = 0
       or cardinality(v_questions) > 20
       or (select count(*) from public.person_questions q
            where q.id = any (v_questions)
              and q.tenant_id = v_tenant_id
              and q.kind in ('single_choice', 'multi_choice')) <> cardinality(v_questions) then
      raise exception 'PERSON_ANSWER_METRICS_QUESTIONS_INVALID';
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_metric->'option_keys') e
       where jsonb_typeof(e) <> 'string'
    ) then
      raise exception 'PERSON_ANSWER_METRICS_OPTIONS_INVALID';
    end if;
    select coalesce(array_agg(distinct e #>> '{}'), '{}') into v_keys
      from jsonb_array_elements(v_metric->'option_keys') e;

    -- Every key one of the named questions' options has, archived ones
    -- included, so a metric over a retired level keeps working.
    select coalesce(array_agg(coalesce(nullif(o->>'key', ''), o->>'id')), '{}') into v_offered
      from public.person_questions q
     cross join lateral jsonb_array_elements(q.options) o
     where q.id = any (v_questions);
    if cardinality(v_keys) = 0
       or cardinality(v_keys) > 50
       or not (v_keys <@ v_offered) then
      raise exception 'PERSON_ANSWER_METRICS_OPTIONS_INVALID';
    end if;

    insert into public.person_answer_metrics
      (id, tenant_id, key, label, rule, question_ids, option_keys, sort_order)
    values
      (v_id, v_tenant_id, null, v_label, v_rule, v_questions, v_keys, v_index)
    on conflict (id) do update
       set label = excluded.label,
           rule = excluded.rule,
           question_ids = excluded.question_ids,
           option_keys = excluded.option_keys,
           sort_order = excluded.sort_order,
           updated_at = now()
     where person_answer_metrics.tenant_id = v_tenant_id;

    v_ids := v_ids || v_id;
    if v_key is not null then
      v_slugs := v_slugs || v_key;
    end if;
    v_index := v_index + 1;
  end loop;

  delete from public.person_answer_metrics m
   where m.tenant_id = v_tenant_id
     and not (m.id = any (v_ids));

  -- Keys last, so two rows can swap theirs in one save.
  update public.person_answer_metrics m set key = null
   where m.tenant_id = v_tenant_id and m.key is not null;
  update public.person_answer_metrics m
     set key = nullif(btrim(coalesce(e->>'key', '')), '')
    from jsonb_array_elements(p_metrics) e
   where m.tenant_id = v_tenant_id
     and m.id = (e->>'id')::uuid;
end;
$$;

comment on function public.save_person_answer_metrics(jsonb) is
  'Replaces the tenant''s profile metrics, in order (#1745): [{id, key?, label, rule: any | every_answered, question_ids, option_keys}]. Questions must be the tenant''s choice questions; option keys (an option''s key, else its id) must be theirs. Rows left out are deleted. Profile answers at Manage. Raises PERSON_ANSWER_METRICS_INVALID, _TOO_MANY (more than 10), _LABEL_REQUIRED, _KEY_INVALID, _KEY_TAKEN, _QUESTIONS_INVALID or _OPTIONS_INVALID.';

revoke execute on function public.save_person_answer_metrics(jsonb) from public, anon;
grant execute on function public.save_person_answer_metrics(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Counting
-- ---------------------------------------------------------------------------

-- Each answer a registration counts with: its snapshots where it has any, the
-- person's current answers where it has none (the header's rule). Internal;
-- the callers below check permission and pick the registrations.
create function public.registration_profile_answers(p_tenant_id uuid, p_registration_ids uuid[])
returns table (registration_id uuid, question_id uuid, value jsonb, option_keys text[])
language sql
stable
security definer
set search_path = public
as $$
  with regs as (
    select r.id, r.person_id,
           exists (select 1 from public.person_answer_snapshots s where s.registration_id = r.id) as has_snapshot
      from public.event_registrations r
     where r.id = any (p_registration_ids)
       and r.tenant_id = p_tenant_id
  )
  select g.id, s.question_id, s.value, s.option_keys
    from regs g
    join public.person_answer_snapshots s on s.registration_id = g.id
   where g.has_snapshot
  union all
  select g.id, a.question_id, a.value, public.question_option_keys(q.options, a.value)
    from regs g
    join public.person_answers a on a.person_id = g.person_id and a.tenant_id = p_tenant_id
    join public.person_questions q on q.id = a.question_id
   where not g.has_snapshot
     and g.person_id is not null;
$$;

comment on function public.registration_profile_answers(uuid, uuid[]) is
  'Internal (#1745): the profile answers each registration counts with -- its check-in snapshots, or the person''s current answers where it has none. Called only by person_answer_metric_counts() and get_event_answer_breakdown(), which check permission.';

revoke execute on function public.registration_profile_answers(uuid, uuid[]) from public, anon, authenticated;

-- One row per metric of the tenant, in order: how many checked-in attendees
-- it counts, and how many answered any question it reads (the denominator the
-- Results card shows while coverage is short). Distinct people per event,
-- summed across events, as every participation figure is.
create function public.person_answer_metric_counts(p_tenant_id uuid, p_event_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with regs as (
    select r.id, r.event_id, r.person_id
      from public.event_registrations r
     where r.event_id = any (p_event_ids)
       and r.tenant_id = p_tenant_id
       and r.checked_in_at is not null
       and r.cancelled_at is null
       and r.person_id is not null
  ),
  answers as (
    select g.event_id, g.person_id, g.id as registration_id, a.question_id, a.option_keys
      from regs g
      join public.registration_profile_answers(p_tenant_id, array(select id from regs)) a
        on a.registration_id = g.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'key', m.key,
           'label', m.label,
           'count', c.counted,
           'answered', c.answered
         ) order by m.sort_order, m.created_at), '[]'::jsonb)
    from public.person_answer_metrics m
   cross join lateral (
     select count(distinct (x.event_id, x.person_id)) filter (where x.hit) as counted,
            count(distinct (x.event_id, x.person_id)) as answered
       from (
         select a.event_id, a.person_id,
                case when m.rule = 'any'
                     then bool_or(a.option_keys && m.option_keys)
                     else bool_and(a.option_keys && m.option_keys)
                end as hit
           from answers a
          where a.question_id = any (m.question_ids)
          group by a.registration_id, a.event_id, a.person_id
       ) x
   ) c
   where m.tenant_id = p_tenant_id;
$$;

comment on function public.person_answer_metric_counts(uuid, uuid[]) is
  'Internal (#1745): [{id, key, label, count, answered}] for each of the tenant''s profile metrics over the checked-in, uncancelled registrations of these events. Called only by the impact RPCs, which check permission.';

revoke execute on function public.person_answer_metric_counts(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The answers breakdown
-- ---------------------------------------------------------------------------

-- The event's "Profile answers" card: registrations per option for each
-- current single or multi choice question with snapshot_at_checkin (open
-- question 8: only those), over registrations that were not cancelled, read
-- by the rule in the header. A question whose condition names exactly one
-- question on the card is nested under that question's answer
-- (discipline -> level), as #1701's places nest under their region.
-- Counts, but per option on one event, so it needs the answers' own
-- permission as well as the card's: unlike a metric, a small count here can
-- name somebody's answer.
create function public.get_event_answer_breakdown(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_registrations uuid[];
begin
  if not ((public.has_permission('events', 'view')
           or public.has_permission('event_impact', 'view'))
          and public.has_permission('person_answers', 'view')) then
    raise exception 'Not authorized to view profile answers';
  end if;

  select coalesce(array_agg(r.id), '{}') into v_registrations
    from public.event_registrations r
   where r.event_id = p_event_id
     and r.tenant_id = v_tenant_id
     and r.cancelled_at is null
     and r.person_id is not null;

  return (
    with qs as (
      select q.id, q.kind, q.prompt, q.column_label, q.options, q.sort_order, q.created_at,
             (select case when count(*) = 1 then min(c.question_id) end
                from public.question_condition_clauses(q.show_if) c) as parent_id
        from public.person_questions q
       where q.tenant_id = v_tenant_id
         and q.archived_at is null
         and q.snapshot_at_checkin
         and q.kind in ('single_choice', 'multi_choice')
    ),
    answers as (
      select a.registration_id, a.question_id, o.option_id
        from public.registration_profile_answers(v_tenant_id, v_registrations) a
        join qs on qs.id = a.question_id
       cross join lateral (
         select a.value #>> '{}' as option_id where jsonb_typeof(a.value) = 'string'
         union all
         select e #>> '{}' from jsonb_array_elements(
           case when jsonb_typeof(a.value) = 'array' then a.value else '[]'::jsonb end
         ) e
         -- "Other" with its text.
         union all
         select null where jsonb_typeof(a.value) = 'object'
       ) o
    ),
    parents as (
      select qs.id,
             case when exists (select 1 from qs p where p.id::text = qs.parent_id)
                  then qs.parent_id::uuid end as parent_id
        from qs
    )
    select jsonb_build_object(
      'registrations', cardinality(v_registrations),
      'questions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', qs.id,
                 'kind', qs.kind,
                 'prompt', qs.prompt,
                 'column_label', qs.column_label,
                 'options', qs.options,
                 'parent_question_id', p.parent_id
               ) order by qs.sort_order, qs.created_at)
          from qs join parents p on p.id = qs.id
      ), '[]'::jsonb),
      'counts', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'question_id', c.question_id,
                 'option_id', c.option_id,
                 'parent_option_id', c.parent_option_id,
                 'registrations', c.registrations
               ))
          from (
            select a.question_id, a.option_id, pa.option_id as parent_option_id,
                   count(distinct a.registration_id) as registrations
              from answers a
              join parents p on p.id = a.question_id
              left join answers pa
                on pa.registration_id = a.registration_id
               and pa.question_id = p.parent_id
             group by a.question_id, a.option_id, pa.option_id
          ) c
      ), '[]'::jsonb),
      'answered', coalesce((
        select jsonb_object_agg(x.question_id, x.registrations)
          from (
            select a.question_id, count(distinct a.registration_id) as registrations
              from answers a group by a.question_id
          ) x
      ), '{}'::jsonb)
    )
  );
end;
$$;

comment on function public.get_event_answer_breakdown(uuid) is
  'The event''s Profile answers card (#1745): {registrations, questions, counts, answered} -- registrations per option of each current snapshotted choice question, nested under the single question its condition names where that question is on the card. Snapshots, else current answers; cancelled registrations left out. Requires (events: view or event_impact: view) and person_answers: view.';

revoke execute on function public.get_event_answer_breakdown(uuid) from public, anon;
grant execute on function public.get_event_answer_breakdown(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The demo tenant's example metric
-- ---------------------------------------------------------------------------

-- #1744 seeded an "experience level" question. Snapshot it and count its
-- first-timers, so a visitor sees a figure on the Results card and the
-- answers card. Patched in place, as 20261103120000 did.
do $patch$
declare
  v_signature constant text := 'public.seed_demo_tenant(uuid, uuid, uuid)';
  v_find constant text := '  return jsonb_build_object(
    ''tenant_id'', t,';
  v_def text;
  v_count int;
begin
  v_def := pg_get_functiondef(v_signature::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, v_find, ''))) / length(v_find);
  if v_count <> 1 then
    raise exception '#1745: expected one match in %, found %', v_signature, v_count;
  end if;

  execute replace(v_def, v_find, $seed$
  update public.person_questions
     set snapshot_at_checkin = true
   where tenant_id = t and key = 'experience_level';

  insert into public.person_answer_metrics
    (tenant_id, key, label, rule, question_ids, option_keys, sort_order)
  select t, 'first_timers', 'First-timers', 'any', array[q.id], array['new'], 0
    from public.person_questions q
   where q.tenant_id = t and q.key = 'experience_level';

$seed$ || v_find);
end
$patch$;

-- ---------------------------------------------------------------------------
-- 7. The impact RPCs: one count per metric row
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_event_impact_derived_data(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_can_view_impact boolean;
  v_result jsonb;
  v_event_id uuid;
begin
  v_can_view_impact := public.has_permission('event_impact', 'view');

  if not (v_can_view_impact or public.has_permission('events', 'view')) then
    raise exception 'Not authorized to view event impact figures';
  end if;

  select id into v_event_id
    from public.events
   where id = p_event_id
     and tenant_id = (select public.current_tenant_id());

  select jsonb_build_object(
    'event_id', p_event_id,
    'auto_assign_discount_codes', coalesce((
      select auto_assign_discount_codes from public.events where id = v_event_id
    ), false),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count
      ))
      from public.events
      where id = v_event_id
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = v_event_id
        -- #1418
        and cancelled_at is null
    ), '[]'::jsonb),
    'checkin_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'checked_in_event_count', checked_in_event_count
      ))
      from (
        select person_id, count(*) as checked_in_event_count
        from public.event_registrations
        where checked_in_at is not null
          and person_id = any(
            select distinct person_id
            from public.event_registrations
            where event_id = v_event_id
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = v_event_id and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = v_event_id
      ) vh
    ), '[]'::jsonb),
    -- #1577: people served. Every caller of this function may see it; the
    -- recipient ids only ever leave as a count.
    'distributions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', mov.event_id,
        'quantity', mov.quantity,
        'recipient_person_id', mov.recipient_person_id,
        'inventory_item_id', mov.inventory_item_id,
        'face_value', items.face_value
      ))
      from public.inventory_movements mov
      join public.inventory_items items on items.id = mov.inventory_item_id
      where mov.event_id = v_event_id
        and mov.movement_type = 'distributed'
    ), '[]'::jsonb),
    -- #1588: kind and value, and only codes held by a registrant who did not
    -- cancel -- a cancelled registrant's code helped nobody.
    'discount_codes', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'registration_id', dc.registration_id,
        'kind', dc.kind,
        'value', dc.value
      ))
      from public.discount_codes dc
      join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = v_event_id and reg.cancelled_at is null
    ), '[]'::jsonb) else null::jsonb end,
    -- #1588: paid expenses tagged as participant assistance. Amounts only.
    'assistance_expenses', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', exps.event_id,
        'amount', exps.amount
      ))
      from public.event_expenses exps
      where exps.event_id = v_event_id
        and exps.participant_assistance
        and exps.status = 'paid'
    ), '[]'::jsonb) else null::jsonb end,
    -- #1588: checked-in attendees whose level was first time on snow, read
    -- the way beginner_attendees is.
    'first_time_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level = 'first_time' or lvl.snowboard_level = 'first_time')
      ) first_timers
    ), '[]'::jsonb) else null::jsonb end,
    'beginner_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb) else null::jsonb end,
    'profiled_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb) else null::jsonb end,
    -- #1589: what the discount value offered is derived from. Every shared
    -- code, and every code held by a registrant who did not cancel, with the
    -- options it covers; and the priced answers of registrations that were
    -- not cancelled.
    -- #1745: one count per profile metric row. Under event_impact: view
    -- alone -- a count is not an answer.
    'person_answer_metrics', case when v_can_view_impact then
      public.person_answer_metric_counts(
        (select public.current_tenant_id()),
        array_remove(array[v_event_id], null)
      ) else null::jsonb end,
    'offered_codes', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'code_id', dc.id,
        'shared', dc.shared,
        'registration_id', dc.registration_id,
        'value', dc.value,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'option_id', dco.option_id,
            'percent_off', dco.percent_off,
            'price', o.price
          ))
          from public.discount_code_options dco
          join public.event_registration_options o on o.id = dco.option_id
          where dco.code_id = dc.id
        ), '[]'::jsonb)
      ))
      from public.discount_codes dc
      left join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = v_event_id
        and (dc.shared or (dc.registration_id is not null and reg.cancelled_at is null))
    ), '[]'::jsonb) else null::jsonb end,
    'option_counts', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', reg.event_id,
        'registration_id', c.registration_id,
        'option_id', c.option_id,
        'quantity', c.quantity,
        'price', c.price
      ))
      from public.event_registration_option_counts c
      join public.event_registrations reg on reg.id = c.registration_id
      where reg.event_id = v_event_id
        and reg.cancelled_at is null
    ), '[]'::jsonb) else null::jsonb end
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_program_impact_rollup_data(p_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_ids uuid[];
  v_result jsonb;
begin
  if not public.has_permission('programs_reports', 'view') then
    raise exception 'Not authorized to view program impact reports';
  end if;

  select coalesce(array_agg(event_id), '{}') into v_event_ids
  from public.event_programs
  where program_id = p_program_id
    and tenant_id = (select public.current_tenant_id());

  select jsonb_build_object(
    'event_ids', to_jsonb(v_event_ids),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count,
        'auto_assign_discount_codes', auto_assign_discount_codes
      ))
      from public.events
      where id = any(v_event_ids)
    ), '[]'::jsonb),
    -- #1588: impact_notes is gone. Its typed figures are archived, and adding
    -- them to the derived ones would count the same help twice.
    'assistance_expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', exps.event_id,
        'amount', exps.amount
      ))
      from public.event_expenses exps
      where exps.event_id = any(v_event_ids)
        and exps.participant_assistance
        and exps.status = 'paid'
    ), '[]'::jsonb),
    'first_time_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level = 'first_time' or lvl.snowboard_level = 'first_time')
      ) first_timers
    ), '[]'::jsonb),
    'distributed_movements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity', mov.quantity,
        'event_id', mov.event_id,
        'recipient_person_id', mov.recipient_person_id,
        'inventory_item_id', mov.inventory_item_id,
        'face_value', items.face_value
      ))
      from public.inventory_movements mov
      join public.inventory_items items on items.id = mov.inventory_item_id
      where mov.event_id = any(v_event_ids) and mov.movement_type = 'distributed'
    ), '[]'::jsonb),
    'volunteer_hours', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'hours', hours))
      from public.volunteer_hours
      where event_id = any(v_event_ids)
    ), '[]'::jsonb),
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = any(v_event_ids) and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = any(v_event_ids)
      ) vh
    ), '[]'::jsonb),
    'beginner_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb),
    'profiled_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = any(v_event_ids)
        -- #1418
        and cancelled_at is null
    ), '[]'::jsonb),
    'checkin_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'checked_in_event_count', checked_in_event_count
      ))
      from (
        select person_id, count(*) as checked_in_event_count
        from public.event_registrations
        where checked_in_at is not null
          and person_id = any(
            select distinct person_id
            from public.event_registrations
            where event_id = any(v_event_ids)
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'discount_codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'registration_id', dc.registration_id,
        'kind', dc.kind,
        'value', dc.value
      ))
      from public.discount_codes dc
      join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = any(v_event_ids) and reg.cancelled_at is null
    ), '[]'::jsonb),
    -- #1589: what the discount value offered is derived from. Every shared
    -- code, and every code held by a registrant who did not cancel, with the
    -- options it covers; and the priced answers of registrations that were
    -- not cancelled.
    -- #1745: one count per profile metric row.
    'person_answer_metrics', public.person_answer_metric_counts(
      (select public.current_tenant_id()), v_event_ids
    ),
    'offered_codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'code_id', dc.id,
        'shared', dc.shared,
        'registration_id', dc.registration_id,
        'value', dc.value,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'option_id', dco.option_id,
            'percent_off', dco.percent_off,
            'price', o.price
          ))
          from public.discount_code_options dco
          join public.event_registration_options o on o.id = dco.option_id
          where dco.code_id = dc.id
        ), '[]'::jsonb)
      ))
      from public.discount_codes dc
      left join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = any(v_event_ids)
        and (dc.shared or (dc.registration_id is not null and reg.cancelled_at is null))
    ), '[]'::jsonb),
    'option_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', reg.event_id,
        'registration_id', c.registration_id,
        'option_id', c.option_id,
        'quantity', c.quantity,
        'price', c.price
      ))
      from public.event_registration_option_counts c
      join public.event_registrations reg on reg.id = c.registration_id
      where reg.event_id = any(v_event_ids)
        and reg.cancelled_at is null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;
