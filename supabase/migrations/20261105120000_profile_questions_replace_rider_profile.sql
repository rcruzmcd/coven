-- Profile questions: Chatter Snow's rider profile moves onto configured
-- questions, and every reader of the rider columns moves with it (#1746,
-- part of #1409)
-- ---------------------------------------------------------------------------
--
-- Design record: planning coven/product/2026-10-31-person-profile-questions.md,
-- sections 6 and 7. #1743-#1745 built the tables, the asking surfaces, the
-- check-in snapshots and the metric rows beside the rider columns. This is
-- the one release that moves Chatter Snow onto them:
--
--   1. Chatter Snow's four questions and two metric rows, its answers and its
--      check-in snapshots copied in, and the counts asserted.
--   2. Two internal helpers: snapshotting a registration's answers, and
--      dropping the answers a person's other answers now hide.
--   3. The dependents: check-in trigger, impact RPCs, retention, deletion
--      request, merge, /my/details, the write RPCs, the public API's v1
--      rider-profile contract, people_with_roles.
--   4. The rider_profile module, the rider_profiles resource and the
--      mountain setting retire.
--
-- SCOPED BY SLUG, as 20260923120000 is: on a database with no `chatter-snow`
-- tenant (local and CI) section 1 is a no-op, and supabase/seed.sql seeds the
-- same rows for the local tenant.
--
-- THE COLUMNS STAY, unread and unwritten, for one release: people's four
-- rider columns and event_registrations' three *_at_event snapshots, and the
-- p_riding_* arguments of the two registration RPCs, which are now ignored.
-- That is the rollback path without dual writes; a follow-up drops them. Their
-- rows in retention_snapshot_personal_columns stay too, since audit snapshots
-- taken before today still hold the values.
--
-- PAST FIGURES ARE UNCHANGED. A registration counts with its snapshots where
-- it has any and the person's current answers where it has none
-- (20261104120000), which is the rider columns' coalesce: a snapshot row
-- exists exactly where riding_discipline_at_event was set. "First time on
-- snow" is seeded with the `any` rule, which is what the impact RPCs counted
-- (either level first_time); the design record's `every_answered` is a
-- deliberate later config change, not a side effect of this move.

-- ---------------------------------------------------------------------------
-- 1. Chatter Snow's questions, metrics, answers and snapshots
-- ---------------------------------------------------------------------------

-- One question through question_definition(), so the row is exactly what the
-- editor would have saved. p_seen is the earlier questions, as
-- save_person_questions() keeps it. Temporary: gone with the session.
create function pg_temp.seed_person_question(
  p_tenant_id uuid,
  p_id uuid,
  p_key text,
  p_sort integer,
  p_question jsonb,
  p_seen jsonb,
  p_snapshot boolean
) returns jsonb
language plpgsql
as $$
declare
  v_def jsonb := public.question_definition(
    p_question || jsonb_build_object('id', p_id),
    p_seen,
    array['single_choice', 'multi_choice', 'short_text', 'number', 'place'],
    'PERSON_QUESTIONS'
  );
begin
  insert into public.person_questions
    (id, tenant_id, key, kind, prompt, help, column_label, required, sort_order, options,
     allow_other, show_if, ask_after_registration, ask_on_my_details, snapshot_at_checkin)
  values
    (p_id, p_tenant_id, p_key, v_def->>'kind', v_def->>'prompt', v_def->>'help',
     v_def->>'column_label', (v_def->>'required')::boolean, p_sort, v_def->'options',
     (v_def->>'allow_other')::boolean, nullif(v_def->'show_if', 'null'::jsonb),
     true, true, p_snapshot);
  return p_seen || jsonb_build_object(p_id::text, jsonb_build_object(
    'kind', v_def->>'kind', 'options', v_def->'options'
  ));
end;
$$;

-- The option of a seeded question with this key: its id and label.
create function pg_temp.seeded_option(p_question_id uuid, p_key text)
returns jsonb
language sql
stable
as $$
  select o
    from public.person_questions q
   cross join lateral jsonb_array_elements(q.options) o
   where q.id = p_question_id
     and o->>'key' = p_key;
$$;

do $migrate$
declare
  t uuid;
  q_discipline uuid := gen_random_uuid();
  q_ski uuid := gen_random_uuid();
  q_snowboard uuid := gen_random_uuid();
  q_mountain uuid := gen_random_uuid();
  v_seen jsonb := '{}'::jsonb;
  v_disciplines jsonb;
  v_mountains jsonb;
  v_expected bigint;
  v_actual bigint;
begin
  select id into t from public.tenants where slug = 'chatter-snow';
  if t is null then
    return;
  end if;

  if exists (select 1 from public.person_questions where tenant_id = t) then
    raise exception '#1746: chatter-snow already has profile questions; move them aside first';
  end if;

  -- Option keys are today's column values, so a metric, the v1 API and this
  -- copy all name an option the way the columns did.
  v_disciplines := jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'key', 'ski', 'label', 'Skis'),
    jsonb_build_object('id', gen_random_uuid(), 'key', 'snowboard', 'label', 'Snowboard'),
    jsonb_build_object('id', gen_random_uuid(), 'key', 'both', 'label', 'Both')
  );

  -- Not required: /my/details and the post-registration step both let it be
  -- left blank. The levels are required once it is answered, which is the
  -- rider columns' "levels resolve as a group with their discipline".
  v_seen := pg_temp.seed_person_question(t, q_discipline, 'riding_discipline', 0,
    jsonb_build_object(
      'kind', 'single_choice',
      'prompt', 'Do you ski or ride?',
      'column_label', 'Rides',
      'required', false,
      'options', v_disciplines
    ), v_seen, true);

  v_seen := pg_temp.seed_person_question(t, q_ski, 'ski_level', 1,
    jsonb_build_object(
      'kind', 'single_choice',
      'prompt', 'How would you describe your skiing?',
      'column_label', 'Ski level',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'key', 'first_time', 'label', 'First time on skis',
                           'hint', 'Never skied before'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'beginner', 'label', 'Beginner',
                           'hint', 'Learning to turn and stop on greens'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'intermediate', 'label', 'Intermediate',
                           'hint', 'Linking turns on greens and blues'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'advanced', 'label', 'Advanced',
                           'hint', 'Comfortable on blacks')
      ),
      'show_if', jsonb_build_object('any', jsonb_build_array(jsonb_build_object(
        'question_id', q_discipline,
        'option_ids', (select jsonb_agg(o->'id') from jsonb_array_elements(v_disciplines) o
                        where o->>'key' in ('ski', 'both'))
      )))
    ), v_seen, true);

  v_seen := pg_temp.seed_person_question(t, q_snowboard, 'snowboard_level', 2,
    jsonb_build_object(
      'kind', 'single_choice',
      'prompt', 'How would you describe your snowboarding?',
      'column_label', 'Board level',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'key', 'first_time', 'label', 'First time on a snowboard',
                           'hint', 'Never ridden before'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'beginner', 'label', 'Beginner',
                           'hint', 'Learning to turn and stop on greens'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'intermediate', 'label', 'Intermediate',
                           'hint', 'Linking turns on greens and blues'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'advanced', 'label', 'Advanced',
                           'hint', 'Comfortable on blacks')
      ),
      'show_if', jsonb_build_object('any', jsonb_build_array(jsonb_build_object(
        'question_id', q_discipline,
        'option_ids', (select jsonb_agg(o->'id') from jsonb_array_elements(v_disciplines) o
                        where o->>'key' in ('snowboard', 'both'))
      )))
    ), v_seen, true);

  -- The list staff kept in rider_profile.preferred_mountains, in its order,
  -- with "Other" and a box for anything else -- as the pickers offered it.
  select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'label', btrim(m.name)) order by m.ord)
    into v_mountains
    from public.app_settings s
   cross join lateral jsonb_array_elements_text(s.value) with ordinality as m(name, ord)
   where s.tenant_id = t
     and s.key = 'rider_profile.preferred_mountains'
     and jsonb_typeof(s.value) = 'array'
     and btrim(m.name) <> '';
  if coalesce(jsonb_array_length(v_mountains), 0) < 2 then
    raise exception '#1746: chatter-snow lists fewer than two mountains; a choice needs two';
  end if;

  v_seen := pg_temp.seed_person_question(t, q_mountain, 'preferred_mountain', 3,
    jsonb_build_object(
      'kind', 'single_choice',
      'prompt', 'Which mountain do you usually ride?',
      'column_label', 'Mountain',
      'required', false,
      'allow_other', true,
      'options', v_mountains
    ), v_seen, false);

  insert into public.person_answer_metrics
    (tenant_id, key, label, rule, question_ids, option_keys, sort_order)
  values
    (t, 'beginner_participants', 'Beginner participants', 'any',
     array[q_ski, q_snowboard], array['beginner'], 0),
    (t, 'first_time_on_snow', 'First time on snow', 'any',
     array[q_ski, q_snowboard], array['first_time'], 1);

  -- Answers: one per non-null column.
  insert into public.person_answers
    (tenant_id, person_id, question_id, kind, value, answer_text, prompt_as_shown, answered_via)
  select t, p.id, c.question_id, 'single_choice', opt->'id', opt->>'label', q.prompt, 'migration'
    from public.people p
   cross join lateral (values
     (q_discipline, p.riding_discipline),
     (q_ski, p.ski_experience_level),
     (q_snowboard, p.snowboard_experience_level)
   ) as c(question_id, column_value)
    join public.person_questions q on q.id = c.question_id
   cross join lateral pg_temp.seeded_option(c.question_id, c.column_value) as o(opt)
   where p.tenant_id = t
     and c.column_value is not null;

  -- A mountain on the list is that option, matched as the pickers matched
  -- it; anything else is an "Other" answer with the stored text.
  insert into public.person_answers
    (tenant_id, person_id, question_id, kind, value, answer_text, prompt_as_shown, answered_via)
  select t, p.id, q_mountain, 'single_choice',
         coalesce(m.o->'id', jsonb_build_object('other', btrim(p.preferred_mountain))),
         coalesce(m.o->>'label', btrim(p.preferred_mountain)),
         q.prompt, 'migration'
    from public.people p
    join public.person_questions q on q.id = q_mountain
    left join lateral (
      select e as o from jsonb_array_elements(q.options) e
       where lower(e->>'label') = lower(btrim(p.preferred_mountain))
       limit 1
    ) m on true
   where p.tenant_id = t
     and nullif(btrim(p.preferred_mountain), '') is not null;

  -- Snapshots: one per non-null *_at_event, taken when the check-in was.
  insert into public.person_answer_snapshots
    (tenant_id, registration_id, question_id, value, answer_text, option_keys, taken_at)
  select t, r.id, c.question_id, opt->'id', opt->>'label', array[opt->>'key'],
         coalesce(r.checked_in_at, now())
    from public.event_registrations r
   cross join lateral (values
     (q_discipline, r.riding_discipline_at_event),
     (q_ski, r.ski_experience_level_at_event),
     (q_snowboard, r.snowboard_experience_level_at_event)
   ) as c(question_id, column_value)
   cross join lateral pg_temp.seeded_option(c.question_id, c.column_value) as o(opt)
   where r.tenant_id = t
     and c.column_value is not null;

  -- Every value copied, or nothing is.
  select count(*) filter (where riding_discipline is not null)
       + count(*) filter (where ski_experience_level is not null)
       + count(*) filter (where snowboard_experience_level is not null)
       + count(*) filter (where nullif(btrim(preferred_mountain), '') is not null)
    into v_expected
    from public.people where tenant_id = t;
  select count(*) into v_actual
    from public.person_answers where tenant_id = t and answered_via = 'migration';
  if v_actual <> v_expected then
    raise exception '#1746: copied % answers, expected %', v_actual, v_expected;
  end if;

  select count(*) filter (where riding_discipline_at_event is not null)
       + count(*) filter (where ski_experience_level_at_event is not null)
       + count(*) filter (where snowboard_experience_level_at_event is not null)
    into v_expected
    from public.event_registrations where tenant_id = t;
  select count(*) into v_actual
    from public.person_answer_snapshots where tenant_id = t;
  if v_actual <> v_expected then
    raise exception '#1746: copied % snapshots, expected %', v_actual, v_expected;
  end if;
end
$migrate$;

drop function pg_temp.seeded_option(uuid, text);
drop function pg_temp.seed_person_question(uuid, uuid, text, integer, jsonb, jsonb, boolean);

-- ---------------------------------------------------------------------------
-- 2. Two helpers
-- ---------------------------------------------------------------------------

-- Snapshots the person's current answers onto those of these registrations
-- that were checked in and have none, for every question marked
-- snapshot_at_checkin -- archived ones too, since the impact figures read a
-- registration with no snapshot through every current answer. What has to
-- happen before an answer is deleted, so a closed event's figures stay put;
-- the check-in trigger's job, done late.
create function public.backfill_person_answer_snapshots(p_registration_ids uuid[])
returns uuid[]
language sql
security definer
set search_path = public
as $$
  with targets as (
    select r.id, r.tenant_id, r.person_id
      from public.event_registrations r
     where r.id = any (p_registration_ids)
       and r.checked_in_at is not null
       and r.person_id is not null
       and not exists (select 1 from public.person_answer_snapshots s where s.registration_id = r.id)
  ),
  written as (
    insert into public.person_answer_snapshots
      (tenant_id, registration_id, question_id, value, answer_text, option_keys)
    select g.tenant_id, g.id, a.question_id, a.value, a.answer_text,
           public.question_option_keys(q.options, a.value)
      from targets g
      join public.person_answers a on a.person_id = g.person_id and a.tenant_id = g.tenant_id
      join public.person_questions q on q.id = a.question_id
     where q.snapshot_at_checkin
    on conflict (registration_id, question_id) do nothing
    returning registration_id
  )
  select coalesce(array_agg(distinct registration_id), '{}') from written;
$$;

comment on function public.backfill_person_answer_snapshots(uuid[]) is
  'Internal (#1746): snapshots the person''s current snapshot_at_checkin answers onto those of these registrations that were checked in and have no snapshot, so deleting the answers leaves past figures unchanged. Returns the registrations it wrote to. Called by retention, the deletion request and anonymization.';

revoke execute on function public.backfill_person_answer_snapshots(uuid[]) from public, anon, authenticated;

-- The checked-in registrations of these people that would still read through
-- their current answers: none of their own snapshots, and an answer that a
-- snapshot would hold.
create function public.registrations_needing_answer_backfill(p_person_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(r.id), '{}')
    from public.event_registrations r
   where r.person_id = any (p_person_ids)
     and r.checked_in_at is not null
     and not exists (select 1 from public.person_answer_snapshots s where s.registration_id = r.id)
     and exists (
       select 1
         from public.person_answers a
         join public.person_questions q on q.id = a.question_id
        where a.person_id = r.person_id
          and q.snapshot_at_checkin
     );
$$;

comment on function public.registrations_needing_answer_backfill(uuid[]) is
  'Internal (#1746): the checked-in registrations of these people with no snapshot and an answer a snapshot would hold -- what backfill_person_answer_snapshots() would write to.';

revoke execute on function public.registrations_needing_answer_backfill(uuid[]) from public, anon, authenticated;

-- apply_person_answers()' hidden-answer rule on its own: walks the current
-- questions in order over the stored answers and deletes each one a
-- condition hides. For when answers changed without a form -- a merge, a
-- deletion request naming some questions.
create function public.prune_hidden_person_answers(p_tenant_id uuid, p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shown jsonb := '{}'::jsonb;
  v_question record;
  v_value jsonb;
begin
  for v_question in
    select q.id, q.show_if
      from public.person_questions q
     where q.tenant_id = p_tenant_id
       and q.archived_at is null
     order by q.sort_order, q.created_at
  loop
    select a.value into v_value
      from public.person_answers a
     where a.person_id = p_person_id
       and a.question_id = v_question.id;

    if not public.question_shown(v_question.show_if, v_shown) then
      if v_value is not null then
        delete from public.person_answers
         where person_id = p_person_id and question_id = v_question.id;
      end if;
    elsif v_value is not null then
      v_shown := v_shown || jsonb_build_object(v_question.id::text, v_value);
    end if;
  end loop;
end;
$$;

comment on function public.prune_hidden_person_answers(uuid, uuid) is
  'Internal (#1746): deletes each of the person''s stored answers that their other answers now hide, by apply_person_answers()'' rule. Called by merge_people() and delete_person_answers().';

revoke execute on function public.prune_hidden_person_answers(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The dependents
-- ---------------------------------------------------------------------------

-- 3a. Check-in. snapshot_person_answers_on_checkin() (20261104120000) covers
-- the same transition; the rider trigger is the last writer of *_at_event.
drop trigger if exists snapshot_rider_profile_on_checkin on public.event_registrations;
drop function public.snapshot_rider_profile_on_checkin();

-- 3b. The impact RPCs: 20261104120000's, less first_time_attendees,
-- beginner_attendees and profiled_attendees. Chatter Snow's two metric rows
-- (section 1) carry those figures now, under event_impact:view alone.
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
$function$;

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
$function$;

-- 3c. Retention. Same rule, same period and mode, same order -- backfill the
-- snapshots, then delete -- under the policy key the answers have now.
update public.retention_policies
   set policy_key = 'person_answers',
       label = 'Profile answers',
       description = 'Measured from the person''s last activity. Deletes their answers to the organization''s profile questions, once every checked-in registration holds a snapshot of them, and anonymizes the person record when nothing else needs it.'
 where policy_key = 'rider_profiles';

do $patch$
declare
  v_signature constant text := 'public.run_retention_purge(boolean, timestamp with time zone, text, uuid)';
  v_def text;
  v_start int;
  v_end int;
  v_d1 constant text := $d1$    -- D1. Profile answers, and the backfill that has to come first (#1746).
    --
    -- The impact RPCs count a registration with its check-in snapshots, or the
    -- person's current answers where it has none (20261104120000). A
    -- registration checked in before its questions were snapshotted, or whose
    -- person answered later, still reads through the answers. Deleting them
    -- without snapshotting first would silently change figures on events that
    -- closed years ago. Backfill, then delete, in that order, in one
    -- transaction.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'person_answers' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_answers', 'person_answers', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and exists (select 1 from public.person_answers a where a.person_id = p.id)
             and public.person_last_activity_at(p.id) < p_as_of - v_period
        );

        v_ids := public.registrations_needing_answer_backfill(v_person_ids);
        perform public.retention_log(v_run_id, 'person_answers', 'person_answer_snapshots', 'backfilled', v_ids);

        if v_enforce and array_length(v_ids, 1) is not null then
          perform public.backfill_person_answer_snapshots(v_ids);
        end if;

        perform public.retention_log(v_run_id, 'person_answers', 'person_answers', 'deleted', v_person_ids);

        if v_enforce and array_length(v_person_ids, 1) is not null then
          delete from public.person_answers where person_id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_answers', 'person_answers', 'skipped', sqlerrm);
    end;

$d1$;
begin
  v_def := pg_get_functiondef(v_signature::regprocedure);

  v_start := position('    -- D1. Rider profiles' in v_def);
  v_end := position('    -- D2. Anonymize the person' in v_def);
  if v_start = 0 or v_end <= v_start then
    raise exception '#1746: D1 not found in %', v_signature;
  end if;
  v_def := left(v_def, v_start - 1) || v_d1 || substr(v_def, v_end);

  -- D2 anonymizes under the same policy; only its key changes. Anonymizing
  -- deletes the answers through people_anonymized_drops_answers (3d).
  if (length(v_def) - length(replace(v_def, '''rider_profiles''', ''))) / length('''rider_profiles''') <> 4 then
    raise exception '#1746: expected four rider_profiles keys left in D2 of %', v_signature;
  end if;
  v_def := replace(v_def, '''rider_profiles''', '''person_answers''');

  v_def := replace(v_def,
    'party_size, checked_in_at, the three *_at_event snapshot
    -- columns,',
    'party_size, checked_in_at, the three *_at_event snapshot
    -- columns (unwritten since #1746),');

  if v_def ~ '(riding_discipline|ski_experience_level|snowboard_experience_level|preferred_mountain)' then
    raise exception '#1746: % still names a rider column', v_signature;
  end if;

  execute v_def;
end
$patch$;

-- 3d. Anonymizing deletes the answers, by whichever route it comes: the
-- retention rule above, a support request, anything that sets is_anonymous.
-- Snapshots first, as everywhere else.
create function public.people_anonymized_drops_answers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.backfill_person_answer_snapshots(
    public.registrations_needing_answer_backfill(array[new.id])
  );
  delete from public.person_answers where person_id = new.id;
  return null;
end;
$$;

comment on function public.people_anonymized_drops_answers() is
  'Deletes a person''s profile answers when they are anonymized, after snapshotting them onto checked-in registrations that have none (#1746, #1409 section 7).';

revoke execute on function public.people_anonymized_drops_answers() from public, anon, authenticated;

create trigger people_anonymized_drops_answers
  after update of is_anonymous on public.people
  for each row
  when (new.is_anonymous and not old.is_anonymous)
  execute function public.people_anonymized_drops_answers();

-- 3e. The deletion request. delete_rider_profile() named four columns; this
-- names every answer, or the questions given. Same gate, same redaction of
-- merge and audit snapshots, same retention_runs record.
drop function public.delete_rider_profile(uuid, text);

create function public.delete_person_answers(
  p_person_id uuid,
  p_reason text default null,
  p_question_ids uuid[] default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_tenant uuid;
  v_merge_ids uuid[];
  v_audit_ids uuid[];
begin
  if not (public.has_permission('events', 'manage')
          or public.has_permission('people', 'manage')) then
    raise exception 'Not authorized';
  end if;

  v_tenant := public.current_tenant_id();

  if not exists (
    select 1 from public.people where id = p_person_id and tenant_id = v_tenant
  ) then
    raise exception 'No such person';
  end if;

  -- All of a registration's snapshots or none, so the backfill takes every
  -- snapshotted answer even when only some are being deleted.
  perform public.backfill_person_answer_snapshots(
    public.registrations_needing_answer_backfill(array[p_person_id])
  );

  delete from public.person_answers
   where person_id = p_person_id
     and (p_question_ids is null or question_id = any (p_question_ids));

  -- A discipline deleted takes its levels with it.
  perform public.prune_hidden_person_answers(v_tenant, p_person_id);

  -- Either role: a merge means the two rows were the same person, so a snapshot
  -- of the record that was merged away is a copy of the person asking.
  v_merge_ids := array(
    select m.id
      from public.person_merges m
     where m.tenant_id = v_tenant
       and (m.survivor_person_id = p_person_id or m.merged_person_id = p_person_id)
       and m.redacted_at is null
       and public.retention_snapshot_has_personal_data('people', m.merged_snapshot, m.survivor_before)
  );

  if array_length(v_merge_ids, 1) is not null then
    update public.person_merges m
       set merged_snapshot = public.retention_redact_snapshot('people', m.merged_snapshot),
           survivor_before = public.retention_redact_snapshot('people', m.survivor_before),
           redacted_at = now()
     where m.id = any(v_merge_ids);
  end if;

  v_audit_ids := array(
    select a.id
      from public.audit_log a
     where a.tenant_id = v_tenant
       and a.redacted_at is null
       and public.retention_snapshot_has_personal_data(a.table_name, a.old_data, a.new_data)
       and exists (
         select 1
           from (values (a.old_data), (a.new_data)) as s(data)
           cross join lateral jsonb_each_text(coalesce(s.data, '{}'::jsonb)) e
          where e.value = p_person_id::text
       )
  );

  if array_length(v_audit_ids, 1) is not null then
    update public.audit_log a
       set old_data = public.retention_redact_snapshot(a.table_name, a.old_data),
           new_data = public.retention_redact_snapshot(a.table_name, a.new_data),
           redacted_at = now()
     where a.id = any(v_audit_ids);
  end if;

  insert into public.retention_runs
    (tenant_id, as_of, dry_run, trigger, triggered_by, reason, status, finished_at)
  values (v_tenant, now(), false, 'request', auth.uid(), p_reason, 'succeeded', now())
  returning id into v_run_id;

  perform public.retention_log(
    v_run_id, 'person_answers', 'person_answers', 'deleted',
    array[p_person_id], p_person_id
  );
  perform public.retention_log(
    v_run_id, 'person_merge_snapshots', 'person_merges', 'redacted',
    v_merge_ids, p_person_id
  );
  perform public.retention_log(
    v_run_id, 'audit_log_snapshots', 'audit_log', 'redacted',
    v_audit_ids, p_person_id
  );
end;
$$;

comment on function public.delete_person_answers(uuid, text, uuid[]) is
  'A deletion request for a person''s profile answers (#1746): every answer, or those to p_question_ids, after snapshotting them onto checked-in registrations that have none; then the answers that hides, and the person''s merge and audit snapshots redacted. Recorded as a request run. Events or People at Manage, as delete_rider_profile() was.';

revoke execute on function public.delete_person_answers(uuid, text, uuid[]) from public, anon;
grant execute on function public.delete_person_answers(uuid, text, uuid[]) to authenticated;

-- 3f. Merge: per question, then the conditions re-checked.
CREATE OR REPLACE FUNCTION public.merge_people(p_survivor_id uuid, p_duplicate_id uuid, p_field_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_survivor public.people;
  v_duplicate public.people;
  v_blocker text;
  v_repointed jsonb := '{}'::jsonb;
  v_n bigint;
  v_o jsonb := coalesce(p_field_overrides, '{}'::jsonb);
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  if p_survivor_id = p_duplicate_id then
    raise exception 'A person cannot be merged into themselves';
  end if;

  -- Lock both rows for the duration; a concurrent merge of the same pair would
  -- otherwise repoint half the records each. Scoped to the current tenant so a
  -- foreign id is simply not found.
  select * into v_survivor from public.people
   where id = p_survivor_id and tenant_id = v_tenant_id for update;
  if not found then
    raise exception 'No such person';
  end if;

  select * into v_duplicate from public.people
   where id = p_duplicate_id and tenant_id = v_tenant_id for update;
  if not found then
    raise exception 'No such person';
  end if;

  -- The review screen already showed these, but it is advice, not enforcement.
  select detail into v_blocker
    from public.person_merge_blockers(p_survivor_id, p_duplicate_id)
   where kind = 'blocker'
   limit 1;
  if v_blocker is not null then
    raise exception '%', v_blocker;
  end if;

  -- Move a portal login only when the survivor has none. Clear the duplicate's
  -- first: people_auth_user_id_key (20260823130000) is partial-unique, so
  -- setting the survivor's while the duplicate still holds it would violate it.
  if v_duplicate.auth_user_id is not null and v_survivor.auth_user_id is null then
    update public.people set auth_user_id = null where id = p_duplicate_id;
    update public.people set auth_user_id = v_duplicate.auth_user_id where id = p_survivor_id;
  end if;

  -- Pre-delete only where a duplicate row carries no payload the merge would
  -- lose, so the generic repoint below cannot collide on it.
  -- person_organizations is a bare membership. person_role_tags was one too
  -- until #1024 gave the sponsor tag an `is_public` flag that publishes an
  -- organization to the public sponsor wall, so that one value is carried
  -- across first and the assertion itself is still dropped.
  --
  -- True wins rather than the survivor's value, matching the coalesce(...)
  -- rule the field merge below uses: a merge should never take something off
  -- the public site, and unpublishing stays a deliberate tick in the person
  -- form. The survivor is the row that lives, so the flag is moved onto it
  -- before its duplicate goes.
  update public.person_role_tags s
     set is_public = true
    from public.person_role_tags d
   where s.person_id = p_survivor_id
     and d.person_id = p_duplicate_id
     and d.role = s.role
     and d.is_public
     and not s.is_public;

  delete from public.person_role_tags t
   where t.person_id = p_duplicate_id
     and exists (
       select 1 from public.person_role_tags s
        where s.person_id = p_survivor_id and s.role = t.role
     );

  -- Four cases: the membership that would become self-referential either way
  -- (person_organizations_not_self, a check violation the repoint loop's
  -- unique_violation handler would not catch), and the two duplicate-membership
  -- directions.
  delete from public.person_organizations o
   where (o.person_id = p_duplicate_id and o.organization_id = p_survivor_id)
      or (o.organization_id = p_duplicate_id and o.person_id = p_survivor_id)
      or (o.person_id = p_duplicate_id and exists (
            select 1 from public.person_organizations s
             where s.person_id = p_survivor_id and s.organization_id = o.organization_id))
      or (o.organization_id = p_duplicate_id and exists (
            select 1 from public.person_organizations s
             where s.organization_id = p_survivor_id and s.person_id = o.person_id));

  -- If the survivor's primary contact IS the duplicate, the loop below would
  -- set the survivor as its own primary contact and trip
  -- people_primary_contact_not_self mid-update. Clear it first; the field
  -- resolution further down cannot restore it, which is correct -- the person
  -- it pointed at is the one being absorbed.
  update public.people
     set primary_contact_person_id = null
   where id = p_survivor_id
     and primary_contact_person_id = p_duplicate_id;

  -- Discover the referencing columns rather than listing them: there are 41
  -- across 32 tables today and the schema gains more most weeks, so a hardcoded
  -- list would rot into a silently-skipped table. The keys are
  -- (tenant_id, <column>) since 20260906080000, so this picks out whichever
  -- column pairs with people.id rather than assuming a one-column key. This
  -- also picks up people.primary_contact_person_id, which it must -- the final
  -- delete would fail on it otherwise.
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c
      join lateral unnest(c.conkey, c.confkey) as k(child_attnum, parent_attnum) on true
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = k.parent_attnum and pa.attname = 'id'
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.child_attnum
     where c.contype = 'f'
       and c.confrelid = 'public.people'::regclass
     order by 1, 2
  loop
    begin
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col)
        using p_survivor_id, p_duplicate_id;
      get diagnostics v_n = row_count;
    exception when unique_violation or check_violation then
      -- Raise rather than drop the offending row: on these tables a collision
      -- means two real records (a sponsorship's contribution and its synced
      -- donation, a registration's check-in and discount code), and deleting
      -- either side loses data no snapshot brings back.
      raise exception 'Cannot merge: % on %. Reconcile it on both records first.',
        sqlerrm, r.tbl;
    end;

    if v_n > 0 then
      v_repointed := v_repointed || jsonb_build_object(r.tbl || '.' || r.col, v_n);
    end if;
  end loop;

  -- Belt-and-braces after the pre-clear above; harmless when it matches
  -- nothing, and people_primary_contact_not_self (20260830100000) is not a
  -- constraint worth risking on one reading of the loop.
  update public.people
     set primary_contact_person_id = null
   where id = p_survivor_id
     and primary_contact_person_id = p_survivor_id;

  -- Adding a people column means adding it here too, or a merge silently drops
  -- the duplicate's value for it -- the same standing maintenance cost
  -- 20260903030000 records for people_with_roles.
  update public.people set
    name = coalesce(v_o->>'name', v_survivor.name, v_duplicate.name),
    preferred_name = coalesce(v_o->>'preferred_name', v_survivor.preferred_name, v_duplicate.preferred_name),
    email = coalesce(v_o->>'email', v_survivor.email, v_duplicate.email),
    notification_email = coalesce(v_o->>'notification_email', v_survivor.notification_email, v_duplicate.notification_email),
    phone = coalesce(v_o->>'phone', v_survivor.phone, v_duplicate.phone),
    instagram_handle = coalesce(v_o->>'instagram_handle', v_survivor.instagram_handle, v_duplicate.instagram_handle),
    pronouns = coalesce(v_o->>'pronouns', v_survivor.pronouns, v_duplicate.pronouns),
    notes = coalesce(v_o->>'notes', v_survivor.notes, v_duplicate.notes),
    logo_url = coalesce(v_o->>'logo_url', v_survivor.logo_url, v_duplicate.logo_url),
    website = coalesce(v_o->>'website', v_survivor.website, v_duplicate.website),
    person_type = coalesce(v_o->>'person_type', v_survivor.person_type),
    source_type = coalesce(v_o->>'source_type', v_survivor.source_type),
    address_line1 = coalesce(v_o->>'address_line1', v_survivor.address_line1, v_duplicate.address_line1),
    address_line2 = coalesce(v_o->>'address_line2', v_survivor.address_line2, v_duplicate.address_line2),
    address_city = coalesce(v_o->>'address_city', v_survivor.address_city, v_duplicate.address_city),
    address_region = coalesce(v_o->>'address_region', v_survivor.address_region, v_duplicate.address_region),
    address_postal_code = coalesce(v_o->>'address_postal_code', v_survivor.address_postal_code, v_duplicate.address_postal_code),
    address_country = coalesce(v_o->>'address_country', v_survivor.address_country, v_duplicate.address_country)
  where id = p_survivor_id;

  -- #1746. Profile answers moved per question in the loop above, the
  -- survivor's winning where both answered (person_answers_keep_survivors).
  -- Re-check the conditions over the result, so a level taken from the
  -- duplicate never outlives the survivor's own discipline -- the group
  -- guarantee the rider columns had, with no special case.
  perform public.prune_hidden_person_answers(v_tenant_id, p_survivor_id);

  insert into public.person_merges (
    survivor_person_id, merged_person_id, merged_snapshot, survivor_before, repointed
  ) values (
    p_survivor_id, p_duplicate_id, to_jsonb(v_duplicate), to_jsonb(v_survivor), v_repointed
  );

  delete from public.people where id = p_duplicate_id;
end;
$function$;

-- 3g. /my/details: the rider columns leave the allowlist (14 to 10). Their
-- answers are set_my_person_answers()' (#1743).
drop function public.set_my_contact_details(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
);

create or replace function public.person_self_edit_snapshot(p public.people)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'name', p.name,
    'preferred_name', p.preferred_name,
    'email', p.email,
    'phone', p.phone,
    'pronouns', p.pronouns,
    'instagram_handle', p.instagram_handle,
    'address_line1', p.address_line1,
    'address_line2', p.address_line2,
    'address_city', p.address_city,
    'address_region', p.address_region,
    'address_postal_code', p.address_postal_code,
    'address_country', p.address_country
  );
$$;

create function public.set_my_contact_details(
  p_preferred_name text,
  p_phone text,
  p_pronouns text,
  p_instagram_handle text,
  p_address_line1 text,
  p_address_line2 text,
  p_address_city text,
  p_address_region text,
  p_address_postal_code text,
  p_address_country text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_handle text := nullif(btrim(ltrim(btrim(p_instagram_handle), '@')), '');
begin
  v_person_id := public.my_contact_person_id();
  if v_person_id is null then
    raise exception 'No record to edit';
  end if;

  if v_handle is not null and v_handle !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'An Instagram handle is letters, numbers, periods and underscores';
  end if;

  select public.person_self_edit_snapshot(p) into v_before
    from public.people p where p.id = v_person_id;

  update public.people set
    preferred_name = nullif(btrim(p_preferred_name), ''),
    phone = nullif(btrim(p_phone), ''),
    pronouns = nullif(btrim(p_pronouns), ''),
    instagram_handle = v_handle,
    address_line1 = nullif(btrim(p_address_line1), ''),
    address_line2 = nullif(btrim(p_address_line2), ''),
    address_city = nullif(btrim(p_address_city), ''),
    address_region = nullif(btrim(p_address_region), ''),
    address_postal_code = nullif(btrim(p_address_postal_code), ''),
    address_country = nullif(btrim(p_address_country), ''),
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = v_person_id;

  select public.person_self_edit_snapshot(p) into v_after
    from public.people p where p.id = v_person_id;

  perform public.log_person_self_edit(v_person_id, v_before, v_after);
end;
$$;

comment on function public.set_my_contact_details(text, text, text, text, text, text, text, text, text, text) is
  'The signed-in constituent''s own contact details (#1164): the ten-column allowlist, no person argument. Profile answers are set_my_person_answers() (#1746).';

revoke execute on function public.set_my_contact_details(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.set_my_contact_details(text, text, text, text, text, text, text, text, text, text) to authenticated;

drop function public.my_contact_details();

create function public.my_contact_details()
returns table (
  person_id uuid,
  name text,
  preferred_name text,
  email text,
  email_pending text,
  email_pending_expires_at timestamptz,
  phone text,
  pronouns text,
  instagram_handle text,
  address_line1 text,
  address_line2 text,
  address_city text,
  address_region text,
  address_postal_code text,
  address_country text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.name,
         p.preferred_name,
         p.email,
         -- A pending address whose link has run out is no longer pending to a
         -- reader: the form should offer to ask again, not to wait.
         case when p.email_token_expires_at > now() then p.email_pending end,
         case when p.email_token_expires_at > now() then p.email_token_expires_at end,
         p.phone,
         p.pronouns,
         p.instagram_handle,
         p.address_line1,
         p.address_line2,
         p.address_city,
         p.address_region,
         p.address_postal_code,
         p.address_country
    from public.people p
   where p.id = public.my_contact_person_id();
$$;

comment on function public.my_contact_details() is
  'The caller''s own editable contact details (#1164). Takes no arguments -- the person is auth.uid() on the request host. Returns the allowlist plus the pending-address state, never the confirmation token. Profile answers are my_person_questions() (#1746).';

revoke execute on function public.my_contact_details() from public, anon;
grant execute on function public.my_contact_details() to authenticated;

-- 3h. Registration. Step 2's profile questions are saved through
-- save_registrant_person_answers() (#1744); the p_riding_* arguments are left
-- in the signature, ignored, until the columns are dropped.
do $patch$
declare
  v_signature text;
  v_find constant text := '  -- #1415. The riding answers, on the person and in this transaction: a
  -- refusal here rolls the registration back with it, and one that passes
  -- cannot leave a registration without the answers it was made with.
  perform public.apply_registration_rider_profile(
    v_tenant_id, v_person_id,
    p_riding_discipline, p_ski_experience_level, p_snowboard_experience_level, p_preferred_mountain
  );
';
  v_new constant text := '  -- #1746. p_riding_* are ignored: step 2 asks the profile questions and
  -- saves them through save_registrant_person_answers() (#1744).
';
  v_def text;
begin
  foreach v_signature in array array[
    'public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb, boolean, text, text)',
    'public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb, boolean, text, text)'
  ] loop
    v_def := pg_get_functiondef(v_signature::regprocedure);
    if (length(v_def) - length(replace(v_def, v_find, ''))) / length(v_find) <> 1 then
      raise exception '#1746: expected one rider call in %', v_signature;
    end if;
    execute replace(v_def, v_find, v_new);
  end loop;
end
$patch$;

drop function public.apply_registration_rider_profile(uuid, uuid, text, text, text, text);

-- 3i. The door: set_registrant_person_answers() (#1743).
drop function public.set_registrant_rider_profile(uuid, text, text, text, text);

-- 3j. The public API's POST /rider-profile keeps its v1 contract
-- (docs/public-api.md) by mapping its four fields onto the questions keyed
-- riding_discipline, ski_level, snowboard_level and preferred_mountain, and
-- answering RIDER_PROFILE_GONE (410) on a tenant without all four. Same
-- signature, rate limit, honeypot and one-day credential; written through
-- apply_person_answers() as the post-registration step is, so an omitted
-- mountain now leaves the stored one rather than clearing it.
create or replace function public.save_registrant_rider_profile(
  p_registration_id uuid,
  p_riding_discipline text,
  p_ski_experience_level text default null,
  p_snowboard_experience_level text default null,
  p_preferred_mountain text default null,
  p_honeypot text default null,
  p_ip_address inet default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_person_id uuid;
  v_questions jsonb;
  v_answers jsonb := '{}'::jsonb;
  v_mountain text := nullif(btrim(coalesce(p_preferred_mountain, '')), '');
  v_option jsonb;
begin
  if not public.check_rate_limit('save_registrant_rider_profile', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return;
  end if;

  if not public.module_enabled_for_tenant(v_tenant_id, 'events') then
    raise exception 'RIDER_PROFILE_UNAVAILABLE';
  end if;
  if not public.module_enabled_for_tenant(v_tenant_id, 'person_questions') then
    raise exception 'SECTION_UNAVAILABLE';
  end if;

  select jsonb_object_agg(q.key, jsonb_build_object(
           'id', q.id, 'options', q.options, 'allow_other', q.allow_other))
    into v_questions
    from public.person_questions q
   where q.tenant_id = v_tenant_id
     and q.archived_at is null
     and q.kind = 'single_choice'
     and q.key in ('riding_discipline', 'ski_level', 'snowboard_level', 'preferred_mountain');
  if v_questions is null
     or not (v_questions ?& array['riding_discipline', 'ski_level', 'snowboard_level', 'preferred_mountain']) then
    raise exception 'RIDER_PROFILE_GONE';
  end if;

  -- The v1 rule: the levels the discipline implies are required, and a
  -- level it does not imply is ignored.
  if p_riding_discipline is null or p_riding_discipline not in ('ski', 'snowboard', 'both')
     or (p_riding_discipline in ('ski', 'both') and p_ski_experience_level is null)
     or (p_riding_discipline in ('snowboard', 'both') and p_snowboard_experience_level is null) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  select person_id into v_person_id
    from public.event_registrations
   where id = p_registration_id
     and tenant_id = v_tenant_id
     and person_id is not null
     and created_at > now() - interval '1 day';
  if v_person_id is null then
    raise exception 'RIDER_PROFILE_UNAVAILABLE';
  end if;

  -- Each value is an option key; a key the tenant's question no longer
  -- offers is a request this contract cannot express.
  for v_option in
    select jsonb_build_object('key', k.key, 'value', k.value)
      from (values
        ('riding_discipline', p_riding_discipline),
        ('ski_level', case when p_riding_discipline in ('ski', 'both') then p_ski_experience_level end),
        ('snowboard_level', case when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level end)
      ) as k(key, value)
     where k.value is not null
  loop
    v_answers := v_answers || jsonb_build_object(
      v_questions -> (v_option->>'key') ->> 'id',
      (select o->'id'
         from jsonb_array_elements(v_questions -> (v_option->>'key') -> 'options') o
        where o->>'key' = v_option->>'value'
          and coalesce(o->'archived' = 'true'::jsonb, false) is false)
    );
    if v_answers -> (v_questions -> (v_option->>'key') ->> 'id') = 'null'::jsonb then
      raise exception 'INVALID_RIDER_PROFILE';
    end if;
  end loop;

  -- A mountain is matched to the list by name, as the pickers did; anything
  -- else is "Other" where the question allows it.
  if v_mountain is not null then
    v_answers := v_answers || jsonb_build_object(
      v_questions -> 'preferred_mountain' ->> 'id',
      coalesce(
        (select o->'id'
           from jsonb_array_elements(v_questions -> 'preferred_mountain' -> 'options') o
          where lower(o->>'label') = lower(v_mountain)
            and coalesce(o->'archived' = 'true'::jsonb, false) is false
          limit 1),
        case when (v_questions -> 'preferred_mountain' ->> 'allow_other')::boolean
             then jsonb_build_object('other', v_mountain) end,
        'null'::jsonb
      )
    );
    if v_answers -> (v_questions -> 'preferred_mountain' ->> 'id') = 'null'::jsonb then
      raise exception 'INVALID_RIDER_PROFILE';
    end if;
  end if;

  begin
    perform public.apply_person_answers(
      v_tenant_id, v_person_id, v_answers, 'registration', false, p_registration_id
    );
  exception when raise_exception then
    -- A question the tenant stopped asking after registration, or one now
    -- scoped away from this event.
    if sqlerrm in ('PERSON_ANSWERS_INVALID', 'PERSON_ANSWERS_REQUIRED') then
      raise exception 'INVALID_RIDER_PROFILE';
    end if;
    raise;
  end;
end;
$$;

comment on function public.save_registrant_rider_profile(uuid, text, text, text, text, text, inet) is
  'POST /api/v1/t/[tenant]/rider-profile, v1 (#564, #1746): the four rider fields mapped onto the profile questions keyed riding_discipline, ski_level, snowboard_level and preferred_mountain, saved as the post-registration step saves them. RIDER_PROFILE_GONE on a tenant without those questions. The registration id is the credential, for a day.';

-- POST /person-answers: the post-registration step for an API consumer,
-- keyed by question key rather than id (the consumer cannot read the
-- questions' ids). A choice is named by its option key, else its id; every
-- other kind is as save_registrant_person_answers() takes it. A question with
-- no key cannot be answered here.
create function public.save_registrant_person_answers_by_key(
  p_registration_id uuid,
  p_answers jsonb,
  p_honeypot text default null,
  p_ip_address inet default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_answers jsonb := '{}'::jsonb;
  v_entry record;
  v_question record;
  v_value jsonb;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'PERSON_ANSWERS_INVALID';
  end if;

  for v_entry in select key, value from jsonb_each(p_answers) loop
    select q.id, q.kind, q.options into v_question
      from public.person_questions q
     where q.tenant_id = v_tenant_id
       and q.key = v_entry.key
       and q.archived_at is null;
    if not found then
      raise exception 'PERSON_ANSWERS_INVALID';
    end if;

    v_value := v_entry.value;
    if v_question.kind = 'single_choice' and jsonb_typeof(v_value) = 'string' then
      v_value := coalesce(
        (select o->'id' from jsonb_array_elements(v_question.options) o
          where o->>'key' = v_value #>> '{}'),
        v_value
      );
    elsif v_question.kind = 'multi_choice' and jsonb_typeof(v_value) = 'array' then
      v_value := (
        select coalesce(jsonb_agg(coalesce(
                 (select o->'id' from jsonb_array_elements(v_question.options) o
                   where jsonb_typeof(e) = 'string' and o->>'key' = e #>> '{}'),
                 e)), '[]'::jsonb)
          from jsonb_array_elements(v_value) e
      );
    end if;
    v_answers := v_answers || jsonb_build_object(v_question.id::text, v_value);
  end loop;

  perform public.save_registrant_person_answers(
    p_registration_id, v_answers, p_honeypot, p_ip_address
  );
end;
$$;

comment on function public.save_registrant_person_answers_by_key(uuid, jsonb, text, inet) is
  'POST /api/v1/t/[tenant]/person-answers (#1746): save_registrant_person_answers() keyed by question key, a choice named by its option key (else id). An unknown key is PERSON_ANSWERS_INVALID.';

revoke execute on function public.save_registrant_person_answers_by_key(uuid, jsonb, text, inet) from public;
grant execute on function public.save_registrant_person_answers_by_key(uuid, jsonb, text, inet) to anon, authenticated;

-- 3k. people_with_roles stops reading the rider columns. As 20260916150000
-- left it, less those four.
drop view public.people_with_roles cascade;

create view public.people_with_roles
with (security_invoker = true) as
select p.id,
       p.name,
       p.is_anonymous,
       p.source_type,
       p.email,
       p.phone,
       p.notes,
       p.created_at,
       p.updated_at,
       p.created_by,
       p.updated_by,
       p.auth_user_id,
       p.logo_url,
       p.website,
       p.instagram_handle,
       p.primary_contact_person_id,
       p.preferred_name,
       p.person_type,
       p.pronouns,
       p.tenant_id,
       p.notification_email,
       p.notification_email_pending,
       p.notification_email_token,
       p.notification_email_token_expires_at,
       p.address_line1,
       p.address_line2,
       p.address_city,
       p.address_region,
       p.address_postal_code,
       p.address_country,
       p.email_pending,
       p.email_token,
       p.email_token_expires_at,
       f.is_donor,
       f.is_sponsor,
       f.is_volunteer,
       f.is_attendee,
       f.is_staff,
       f.is_partner,
       f.is_recipient,
       p.auth_user_id is not null as has_account,
       public.person_portal_access(p.id) as has_portal_access
  from public.people p
 cross join lateral public.person_role_flags(p.id)
   f(is_donor, is_sponsor, is_volunteer, is_attendee, is_staff, is_partner, is_recipient);

-- Default privileges hand a new view to every role; it had select for
-- authenticated only.
revoke all on public.people_with_roles from public, anon, authenticated;
grant select on public.people_with_roles to authenticated;

-- The two computed fields over the view's row (#1193, PostgREST embedding),
-- dropped with it and recreated unchanged.
create function public.account_email(public.people_with_roles)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email::text
    from auth.users u
   where u.id = $1.auth_user_id
     and $1.tenant_id = (select public.current_tenant_id())
     and public.has_permission('constituent_claims', 'view');
$$;

comment on function public.account_email(public.people_with_roles) is
  'The sign-in address of the account linked to this person (#1193), or null for a reader without constituent_claims:view, for a tenant with the constituent area off, and for a row outside the current tenant.';

revoke execute on function public.account_email(public.people_with_roles) from anon;
grant execute on function public.account_email(public.people_with_roles) to authenticated;

create function public.primary_contact(public.people_with_roles)
returns setof public.people
language sql
stable
rows 1
as $$
  select * from public.people where id = $1.primary_contact_person_id;
$$;

revoke execute on function public.primary_contact(public.people_with_roles) from anon;
grant execute on function public.primary_contact(public.people_with_roles) to authenticated;

-- 3l. The demo tenant's invented people stop carrying rider columns; its
-- profile questions are #1744's.
do $patch$
declare
  v_signature constant text := 'public.seed_demo_tenant(uuid, uuid, uuid)';
  v_def text;
  v_count int;
begin
  v_def := pg_get_functiondef(v_signature::regprocedure);
  v_def := regexp_replace(v_def,
    ', riding_discipline, (ski_experience_level, snowboard_experience_level|ski_experience_level|snowboard_experience_level), created_by\)',
    ', created_by)', 'g');
  v_def := regexp_replace(v_def,
    '(''(?:she/her|he/him|they/them)''), ''(?:ski|snowboard|both)''(?:, ''[a-z_]+''){1,2}, actor\)',
    '\1, actor)', 'g');
  if v_def ~ '(riding_discipline|ski_experience_level|snowboard_experience_level|preferred_mountain)' then
    raise exception '#1746: % still names a rider column', v_signature;
  end if;
  execute v_def;
end
$patch$;

-- ---------------------------------------------------------------------------
-- 4. Retire the module, the resource and the mountain setting
-- ---------------------------------------------------------------------------

drop view public.public_rider_profile_settings;
drop function public.rider_profile_mountains();
drop function public.set_rider_profile_mountains(text[]);

delete from public.app_settings where key = 'rider_profile.preferred_mountains';

-- person_answers was seeded from these grants (20261102120000), so nobody's
-- access changes on the way out. role_permissions cascade.
delete from public.resources where key = 'rider_profiles';

delete from public.tenant_modules where module_key = 'rider_profile';
delete from public.plan_modules where module_key = 'rider_profile';
delete from public.modules where key = 'rider_profile';

-- ---------------------------------------------------------------------------
-- 5. Privacy copy: whether the tenant asks a person anything
-- ---------------------------------------------------------------------------

-- The privacy policy's rider bullet becomes "answers to the profile questions
-- this organization asks you" (#1409 section 7), shown where the tenant has a
-- current question asked after registration or on /my/details. Not the module
-- alone: it is on for everyone, and a tenant asking nothing collects nothing.
-- One read per side, as public_tenant_modules and tenant_modules are.
create function public.public_asks_profile_questions()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.module_enabled_for_tenant(public.public_tenant_id(), 'person_questions')
     and exists (
       select 1 from public.person_questions q
        where q.tenant_id = public.public_tenant_id()
          and q.archived_at is null
          and (q.ask_after_registration or q.ask_on_my_details)
     );
$$;

comment on function public.public_asks_profile_questions() is
  'Whether the tenant on the request host asks a person any current profile question after registration or on /my/details (#1746): the privacy policy''s profileQuestions surface.';

revoke execute on function public.public_asks_profile_questions() from public;
grant execute on function public.public_asks_profile_questions() to anon, authenticated;

create function public.tenant_asks_profile_questions()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.module_enabled_for_tenant((select public.current_tenant_id()), 'person_questions')
     and exists (
       select 1 from public.person_questions q
        where q.tenant_id = (select public.current_tenant_id())
          and q.archived_at is null
          and (q.ask_after_registration or q.ask_on_my_details)
     );
$$;

comment on function public.tenant_asks_profile_questions() is
  'public_asks_profile_questions() for the portal''s current tenant (#1746), for the starter legal documents and their drift fingerprint.';

revoke execute on function public.tenant_asks_profile_questions() from public, anon;
grant execute on function public.tenant_asks_profile_questions() to authenticated;
