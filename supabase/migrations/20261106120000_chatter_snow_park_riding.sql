-- Profile questions: Chatter Snow asks about park riding (#1748, part of #1409)
-- ---------------------------------------------------------------------------
--
-- Design record: planning coven/product/2026-10-31-person-profile-questions.md,
-- section 6 and the 2026-10-31 addendum on #1409. Configuration only: one more
-- row in Chatter Snow's person_questions, saved through question_definition()
-- exactly as the editor would save it. No platform code changes.
--
--   park_riding (single choice, optional, snapshotted at check-in so it shows
--   in an event's answers breakdown), shown when the ski level or the
--   snowboard level is beginner, intermediate or advanced. Someone whose every
--   level is first_time is not asked; a level that is hidden is unanswered, so
--   a skier-only first-timer is not asked either.
--
-- The level hints were already seeded by 20261105120000, so nothing to fill.
--
-- SCOPED BY SLUG, as 20261105120000 is: a no-op on a database with no
-- `chatter-snow` tenant (local and CI), where supabase/seed.sql seeds the same
-- row for the local tenant. Also a no-op if the tenant already has a
-- park_riding question (say, one staff added in the editor first).

do $park$
declare
  t uuid;
  q_ski uuid;
  q_snowboard uuid;
  q_park uuid := gen_random_uuid();
  v_seen jsonb;
  v_sort integer;
  v_def jsonb;
begin
  select id into t from public.tenants where slug = 'chatter-snow';
  if t is null
     or exists (select 1 from public.person_questions where tenant_id = t and key = 'park_riding') then
    return;
  end if;

  select id into q_ski from public.person_questions where tenant_id = t and key = 'ski_level';
  select id into q_snowboard from public.person_questions where tenant_id = t and key = 'snowboard_level';
  if q_ski is null or q_snowboard is null then
    raise exception '#1748: chatter-snow has no ski_level/snowboard_level question to condition on';
  end if;

  -- Every current question, as save_person_questions() passes them: the
  -- condition may only name an earlier single choice.
  select coalesce(jsonb_object_agg(q.id::text, jsonb_build_object('kind', q.kind, 'options', q.options)), '{}'::jsonb),
         coalesce(max(q.sort_order) + 1, 0)
    into v_seen, v_sort
    from public.person_questions q
   where q.tenant_id = t;

  v_def := public.question_definition(
    jsonb_build_object(
      'id', q_park,
      'kind', 'single_choice',
      'prompt', 'Do you ride in the terrain park?',
      'column_label', 'Park',
      'required', false,
      'options', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'key', 'not_interested', 'label', 'Not interested'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'curious', 'label', 'Curious',
                           'hint', 'Haven''t tried it yet'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'beginner', 'label', 'Beginner',
                           'hint', 'Small features'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'intermediate', 'label', 'Intermediate',
                           'hint', 'Medium features'),
        jsonb_build_object('id', gen_random_uuid(), 'key', 'advanced', 'label', 'Advanced',
                           'hint', 'Large features and jumps')
      ),
      'show_if', jsonb_build_object('any', (
        select jsonb_agg(jsonb_build_object(
                 'question_id', q.id,
                 'option_ids', (select jsonb_agg(o->'id') from jsonb_array_elements(q.options) o
                                 where o->>'key' in ('beginner', 'intermediate', 'advanced'))
               ) order by q.sort_order)
          from public.person_questions q
         where q.id in (q_ski, q_snowboard)
      ))
    ),
    v_seen,
    array['single_choice', 'multi_choice', 'short_text', 'number', 'place'],
    'PERSON_QUESTIONS'
  );

  insert into public.person_questions
    (id, tenant_id, key, kind, prompt, help, column_label, required, sort_order, options,
     allow_other, show_if, ask_after_registration, ask_on_my_details, snapshot_at_checkin)
  values
    (q_park, t, 'park_riding', v_def->>'kind', v_def->>'prompt', v_def->>'help',
     v_def->>'column_label', (v_def->>'required')::boolean, v_sort, v_def->'options',
     (v_def->>'allow_other')::boolean, nullif(v_def->'show_if', 'null'::jsonb),
     true, true, true);
end
$park$;
