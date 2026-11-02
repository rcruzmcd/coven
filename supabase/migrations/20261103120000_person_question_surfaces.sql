-- Profile questions: what the asking surfaces read (#1744, part of #1409)
-- ---------------------------------------------------------------------------
--
-- Design record: planning coven/product/2026-10-31-person-profile-questions.md,
-- section 3. #1743 built the tables and the four write paths; this adds the
-- two reads the public side needs, and the demo tenant's example questions.
--
-- person_questions is readable only under person_answers:view, which neither
-- an anonymous registrant nor a constituent on /my/details holds. So, as
-- public_event_registration_questions does for #1501, each gets a definer
-- read that returns exactly what its form asks and nothing else:
--
--   public_event_person_questions(event)  registration step 2: the questions
--                                         asked after registering for this
--                                         event, no answers -- the form is
--                                         never pre-filled for a registrant
--                                         matched from a typed email
--   my_person_questions()                 the signed-in constituent: every
--                                         question they are asked anywhere,
--                                         with their own current answer, for
--                                         /my/details and for pre-filling
--                                         step 2 when they register signed in
--
-- The staff surfaces (person form, registrant sheet, door) read the tables
-- under RLS and need nothing here.

-- ---------------------------------------------------------------------------
-- 1. Registration step 2
-- ---------------------------------------------------------------------------

-- The same rule apply_person_answers() applies with p_via = 'registration':
-- ask_after_registration, current, and either unscoped or scoped to one of
-- the event's programs. Empty for an event outside the resolved tenant, one
-- that takes no registrations, or a tenant without the module.
create function public.public_event_person_questions(p_event_id uuid)
returns table (
  id uuid,
  kind text,
  prompt text,
  help text,
  required boolean,
  options jsonb,
  allow_other boolean,
  min_value integer,
  max_value integer,
  place_granularity text,
  place_allow_other boolean,
  show_if jsonb,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.kind, q.prompt, q.help, q.required, q.options, q.allow_other,
         q.min_value, q.max_value, q.place_granularity, q.place_allow_other,
         q.show_if, q.sort_order
    from public.person_questions q
    join public.events e
      on e.id = p_event_id
     and e.tenant_id = q.tenant_id
     and e.registration_enabled
   where q.tenant_id = public.public_tenant_id()
     and public.module_enabled_for_tenant(q.tenant_id, 'person_questions')
     and q.archived_at is null
     and q.ask_after_registration
     and (
       not exists (select 1 from public.person_question_scopes s where s.question_id = q.id)
       or exists (
         select 1
           from public.person_question_scopes s
           join public.event_programs ep on ep.program_id = s.program_id
          where s.question_id = q.id
            and ep.event_id = e.id
       )
     )
   order by q.sort_order, q.created_at;
$$;

comment on function public.public_event_person_questions(uuid) is
  'The profile questions asked after registering for one event of the resolved tenant (#1744): ask_after_registration, current, unscoped or scoped to one of the event''s programs. Questions only, never answers: the post-registration form is never pre-filled for an anonymous registrant (#1409 section 3). Security definer because person_questions is closed to anon.';

revoke execute on function public.public_event_person_questions(uuid) from public;
grant execute on function public.public_event_person_questions(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The constituent's own questions and answers
-- ---------------------------------------------------------------------------

-- No person argument, as my_contact_details() has none: whose answers come
-- back is decided by auth.uid() and the request host. Only the questions the
-- person is asked somewhere -- a staff-only question is the organization's
-- record, not something /my offers to edit.
create function public.my_person_questions()
returns table (
  id uuid,
  kind text,
  prompt text,
  help text,
  required boolean,
  options jsonb,
  allow_other boolean,
  min_value integer,
  max_value integer,
  place_granularity text,
  place_allow_other boolean,
  show_if jsonb,
  sort_order integer,
  ask_after_registration boolean,
  ask_on_my_details boolean,
  value jsonb,
  answer_text text
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.kind, q.prompt, q.help, q.required, q.options, q.allow_other,
         q.min_value, q.max_value, q.place_granularity, q.place_allow_other,
         q.show_if, q.sort_order, q.ask_after_registration, q.ask_on_my_details,
         a.value, a.answer_text
    from public.people p
    join public.person_questions q
      on q.tenant_id = p.tenant_id
     and q.archived_at is null
     and (q.ask_after_registration or q.ask_on_my_details)
    left join public.person_answers a
      on a.person_id = p.id
     and a.question_id = q.id
   where p.id = public.my_contact_person_id()
     and public.module_enabled_for_tenant(p.tenant_id, 'person_questions')
   order by q.sort_order, q.created_at;
$$;

comment on function public.my_person_questions() is
  'The signed-in constituent''s profile questions (#1744): every current question asked after registration or on /my/details, with their own current answer. No person argument. For /my/details and for pre-filling registration step 2 when registering signed in.';

revoke execute on function public.my_person_questions() from public, anon;
grant execute on function public.my_person_questions() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The demo tenant's example questions
-- ---------------------------------------------------------------------------

-- Open question 6, decided on #1744: the nightly reset seeds three generic
-- questions, so a visitor sees the feature working -- one asked everywhere, a
-- choice with "Other" asked only after registering, and a number asked only on
-- /my/details -- and a few people with answers on their profile card. Patched
-- in place before the function's closing summary, as 20261021190000 did; the
-- anchor must match exactly once.
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
    raise exception '#1744: expected one match in %, found %', v_signature, v_count;
  end if;

  execute replace(v_def, v_find, $seed$
  declare
    q_level uuid := gen_random_uuid();
    q_heard uuid := gen_random_uuid();
    q_household uuid := gen_random_uuid();
    o_new text := gen_random_uuid()::text;
    o_some text := gen_random_uuid()::text;
    o_lots text := gen_random_uuid()::text;
    o_friend text := gen_random_uuid()::text;
    o_social text := gen_random_uuid()::text;
    o_event text := gen_random_uuid()::text;
  begin
    insert into public.person_questions
      (id, tenant_id, key, kind, prompt, help, column_label, required, sort_order,
       options, allow_other, min_value, max_value,
       ask_after_registration, ask_on_my_details)
    values
      (q_level, t, 'experience_level', 'single_choice',
       'How much experience do you have with activities like ours?', null, 'Experience', false, 0,
       jsonb_build_array(
         jsonb_build_object('id', o_new, 'key', 'new', 'label', 'This is my first time'),
         jsonb_build_object('id', o_some, 'key', 'some', 'label', 'I have done it a few times'),
         jsonb_build_object('id', o_lots, 'key', 'lots', 'label', 'I do it regularly')),
       false, null, null, true, true),
      (q_heard, t, 'heard_about_us', 'single_choice',
       'How did you hear about us?', null, 'Heard via', false, 1,
       jsonb_build_array(
         jsonb_build_object('id', o_friend, 'key', 'friend', 'label', 'A friend'),
         jsonb_build_object('id', o_social, 'key', 'social', 'label', 'Social media'),
         jsonb_build_object('id', o_event, 'key', 'event', 'label', 'At one of your events')),
       true, null, null, true, false),
      (q_household, t, 'household_size', 'number',
       'How many people live in your household?', 'Including you.', 'Household', false, 2,
       '[]'::jsonb, false, 1, 20, false, true);

    insert into public.person_answers
      (tenant_id, person_id, question_id, kind, value, answer_text, prompt_as_shown, answered_via)
    values
      (t, p_marisol, q_level, 'single_choice', to_jsonb(o_new), 'This is my first time',
       'How much experience do you have with activities like ours?', 'registration'),
      (t, p_marisol, q_heard, 'single_choice', to_jsonb(o_friend), 'A friend',
       'How did you hear about us?', 'registration'),
      (t, p_theo, q_level, 'single_choice', to_jsonb(o_some), 'I have done it a few times',
       'How much experience do you have with activities like ours?', 'registration'),
      (t, p_theo, q_household, 'number', '3'::jsonb, '3',
       'How many people live in your household?', 'self'),
      (t, p_kai, q_level, 'single_choice', to_jsonb(o_lots), 'I do it regularly',
       'How much experience do you have with activities like ours?', 'staff'),
      (t, p_kai, q_heard, 'single_choice', jsonb_build_object('other', 'A poster at the library'),
       'A poster at the library', 'How did you hear about us?', 'registration');
  end;

$seed$ || v_find);
end
$patch$;
