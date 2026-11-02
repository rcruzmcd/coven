-- Per-tenant person profile questions: schema, apply_person_answers, the
-- four write RPCs, module, resource and the editor's save (#1743, part of
-- #1409)
-- ---------------------------------------------------------------------------
--
-- Design record: planning coven/product/2026-10-31-person-profile-questions.md,
-- sections 1, 3 and 5. A tenant may ask its own typed questions about a
-- person -- a yoga studio's injuries, a pantry's household size, Chatter
-- Snow's riding level -- answered once per person and kept current, unlike
-- #1501's event questions, answered once per registration.
--
-- NO TENANT VISIBLY CHANGES. Nothing is asked until a tenant adds a question,
-- and the asking surfaces (registration step 2, /my/details, the person form,
-- the registrant sheet) are a later ticket. The rider profile keeps its
-- columns and its module until #1409's migration ticket moves it.
--
-- ONE VOCABULARY, TWO OWNERS. Person questions use #1501's kinds (less
-- `consent`, which is a standing permission with its own legal basis, #1318),
-- its option shape, its conditions (#1742) and its answer row shape. So that
-- the two can never disagree about what an answer or a question may be, the
-- rules #1501 wrote inline are lifted into three shared functions here, and
-- apply_registration_answers() and save_event_registration_questions() are
-- redefined over them with their behaviour unchanged:
--
--   question_shown(show_if, shown)       a condition, over earlier answers
--   question_answer_value(...)           one answer, validated and in words
--   question_definition(...)             one question as an editor saved it
--
-- ANSWERS KEEP THEIR WORDS and questions are retired, never rewritten: a
-- question cannot change kind once answered, an option somebody chose cannot
-- be removed (archive it), and a question removed while answered is archived.
--
-- apply_person_answers() IS THE AUTHORITY, as apply_registration_answers() is
-- for events. Every write path calls it. It also deletes the stored answer of
-- any question the new answers hide, so a snowboard level never outlives a
-- switch to skis.
--
-- Left for the tickets that follow (#1409): check-in snapshots and metrics,
-- the asking surfaces, retention's policy key and backfill, merge's re-check
-- of conditions, delete_person_answers(), and the privacy copy. Until then a
-- person's answers go with the person (cascade) and survive an anonymization;
-- nothing can write one but the RPCs below.

-- ---------------------------------------------------------------------------
-- 1. The shared rules
-- ---------------------------------------------------------------------------

-- Whether a question is shown, given the answers of the earlier questions that
-- were shown (#1742): any clause naming one of them answered with one of the
-- clause's options. A hidden question is absent from p_shown, so it counts as
-- unanswered however deep the chain.
create function public.question_shown(p_show_if jsonb, p_shown jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select p_show_if is null
      or jsonb_typeof(p_show_if) = 'null'
      or exists (
           select 1
             from public.question_condition_clauses(p_show_if) c
            where jsonb_typeof(p_shown -> c.question_id) = 'string'
              and c.option_ids ? (p_shown ->> c.question_id)
         );
$$;

comment on function public.question_shown(jsonb, jsonb) is
  'Whether a question with this show_if is shown, given question id -> answer for the earlier questions that were shown (#1742, #1743). Shared by event and person questions.';

-- One answer, validated against its question: the value to store and the
-- words every reader displays, or null when the answer is empty. p_previous is
-- what the same owner stored before, so an archived option it already had
-- stays valid. Raises p_invalid on anything malformed, so each caller keeps
-- its own error code. As apply_registration_answers() had it inline (#1501,
-- #1699, #1742), unchanged.
create function public.question_answer_value(
  p_kind text,
  p_options jsonb,
  p_allow_other boolean,
  p_min_value integer,
  p_max_value integer,
  p_place_granularity text,
  p_place_allow_other boolean,
  p_value jsonb,
  p_previous jsonb,
  p_invalid text,
  out value jsonb,
  out answer_text text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value jsonb := p_value;
  v_text text;
  v_number numeric;
  v_ids text[];
  v_place record;
begin
  if v_value is not null and jsonb_typeof(v_value) = 'null' then
    v_value := null;
  end if;

  if v_value is not null then
    case p_kind
      -- An option id, offered or chosen before, or {"other": text} where the
      -- question allows "Other".
      when 'single_choice' then
        if jsonb_typeof(v_value) = 'object' then
          if not p_allow_other
             or jsonb_typeof(v_value->'other') is distinct from 'string' then
            raise exception '%', p_invalid;
          end if;
          v_text := btrim(v_value->>'other');
          if v_text = '' then
            v_value := null;
          elsif char_length(v_text) > 200 then
            raise exception '%', p_invalid;
          else
            v_value := jsonb_build_object('other', v_text);
          end if;
        elsif jsonb_typeof(v_value) <> 'string' then
          raise exception '%', p_invalid;
        elsif btrim(v_value #>> '{}') = '' then
          v_value := null;
        else
          select o->>'label' into v_text
            from jsonb_array_elements(p_options) o
           where o->>'id' = lower(v_value #>> '{}')
             and (coalesce(o->'archived' = 'true'::jsonb, false) is false
                  or p_previous = to_jsonb(o->>'id'));
          if v_text is null then
            raise exception '%', p_invalid;
          end if;
          v_value := to_jsonb(lower(v_value #>> '{}'));
        end if;

      when 'multi_choice' then
        if jsonb_typeof(v_value) <> 'array'
           or exists (select 1 from jsonb_array_elements(v_value) e where jsonb_typeof(e) <> 'string') then
          raise exception '%', p_invalid;
        end if;
        select array_agg(distinct lower(e #>> '{}')) into v_ids
          from jsonb_array_elements(v_value) e;
        if v_ids is null then
          v_value := null;
        else
          if exists (
            select 1 from unnest(v_ids) as i(id)
             where not exists (
               select 1 from jsonb_array_elements(p_options) o
                where o->>'id' = i.id
                  and (coalesce(o->'archived' = 'true'::jsonb, false) is false
                       or (jsonb_typeof(p_previous) = 'array' and p_previous ? i.id))
             )
          ) then
            raise exception '%', p_invalid;
          end if;
          -- In the question's own order, whatever order they arrived in.
          select string_agg(o.value->>'label', ', ' order by o.ordinality),
                 jsonb_agg(o.value->>'id' order by o.ordinality)
            into v_text, v_value
            from jsonb_array_elements(p_options) with ordinality as o(value, ordinality)
           where o.value->>'id' = any (v_ids);
        end if;

      when 'short_text' then
        if jsonb_typeof(v_value) <> 'string' then
          raise exception '%', p_invalid;
        end if;
        v_text := btrim(v_value #>> '{}');
        if v_text = '' then
          v_value := null;
        elsif char_length(v_text) > 500 then
          raise exception '%', p_invalid;
        else
          v_value := to_jsonb(v_text);
        end if;

      when 'number' then
        if jsonb_typeof(v_value) <> 'number' then
          raise exception '%', p_invalid;
        end if;
        v_number := (v_value #>> '{}')::numeric;
        if v_number <> trunc(v_number)
           or v_number not between -1000000 and 1000000
           or (p_min_value is not null and v_number < p_min_value)
           or (p_max_value is not null and v_number > p_max_value) then
          raise exception '%', p_invalid;
        end if;
        v_value := to_jsonb(v_number::integer);
        v_text := v_number::integer::text;

      when 'consent' then
        if jsonb_typeof(v_value) <> 'boolean' then
          raise exception '%', p_invalid;
        end if;
        v_text := case when v_value = 'true'::jsonb then 'Yes' else 'No' end;

      -- {"place_id": uuid} names a place of a kind the question's granularity
      -- allows, stored with that place's label; {"other": text} is "Not
      -- listed", where offered. Whatever label the client sent is ignored.
      when 'place' then
        if jsonb_typeof(v_value) <> 'object' then
          raise exception '%', p_invalid;
        end if;
        if v_value ? 'place_id' then
          if jsonb_typeof(v_value->'place_id') <> 'string'
             or lower(v_value->>'place_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            raise exception '%', p_invalid;
          end if;
          select p.id, p.label into v_place
            from public.places p
           where p.id = (v_value->>'place_id')::uuid
             and p.kind = any (public.place_answer_kinds(p_place_granularity));
          if not found then
            raise exception '%', p_invalid;
          end if;
          v_value := jsonb_build_object('place_id', v_place.id, 'label', v_place.label);
          v_text := v_place.label;
        elsif v_value ? 'other' then
          if not p_place_allow_other
             or jsonb_typeof(v_value->'other') <> 'string' then
            raise exception '%', p_invalid;
          end if;
          v_text := btrim(v_value->>'other');
          if v_text = '' then
            v_value := null;
          elsif char_length(v_text) > 200 then
            raise exception '%', p_invalid;
          else
            v_value := jsonb_build_object('other', v_text);
          end if;
        else
          raise exception '%', p_invalid;
        end if;

      else
        raise exception '%', p_invalid;
    end case;
  end if;

  value := v_value;
  answer_text := case when v_value is null then null else v_text end;
end;
$$;

comment on function public.question_answer_value(text, jsonb, boolean, integer, integer, text, boolean, jsonb, jsonb, text) is
  'One answer validated against its question (#1501, #1699, #1742): the value to store and its words, or nulls for an empty answer. p_previous keeps an archived option valid for an owner that already had it. Raises p_invalid on anything malformed. Shared by apply_registration_answers() and apply_person_answers() (#1743).';

-- One question as an editor sent it, normalized: the fields to store, or
-- p_prefix || '_INVALID' (and its siblings below) on anything wrong. p_seen
-- holds the earlier questions of the same save, {id: {kind, options}}, which
-- are the only ones a condition may name. As
-- save_event_registration_questions() had it inline (#1501, #1512, #1699,
-- #1742), unchanged; the id, the order and what the owner adds stay with the
-- caller.
create function public.question_definition(
  p_question jsonb,
  p_seen jsonb,
  p_kinds text[],
  p_prefix text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_kind text;
  v_prompt text;
  v_help text;
  v_column_label text;
  v_required boolean;
  v_options jsonb := '[]'::jsonb;
  v_option jsonb;
  v_label text;
  v_key text;
  v_hint text;
  v_choice_other boolean;
  v_min integer;
  v_max integer;
  v_granularity text;
  v_allow_other boolean := true;
  v_show_if jsonb;
  v_clauses jsonb;
  v_clause jsonb;
  v_parent jsonb;
  v_option_ids jsonb;
begin
  v_kind := p_question->>'kind';
  if v_kind is null or not (v_kind = any (p_kinds)) then
    raise exception '%', p_prefix || '_INVALID';
  end if;

  v_prompt := btrim(coalesce(p_question->>'prompt', ''));
  if v_prompt = '' then
    raise exception '%', p_prefix || '_PROMPT_REQUIRED';
  end if;
  if char_length(v_prompt) > 300 then
    raise exception '%', p_prefix || '_INVALID';
  end if;

  v_help := nullif(btrim(coalesce(p_question->>'help', '')), '');
  if char_length(v_help) > 500 then
    raise exception '%', p_prefix || '_INVALID';
  end if;

  -- #1512. Optional; a key the caller leaves out clears it, like help.
  v_column_label := nullif(btrim(coalesce(p_question->>'column_label', '')), '');
  if char_length(v_column_label) > 24 then
    raise exception '%', p_prefix || '_COLUMN_LABEL_TOO_LONG';
  end if;

  -- A consent box is declinable by definition, so it is never required.
  v_required := v_kind <> 'consent' and coalesce(p_question->'required' = 'true'::jsonb, false);

  -- Options: the two choice kinds need at least two still offered, distinct
  -- by label. Each may carry a key (a code unique within the question), a
  -- hint shown under the label, and archived (#1742).
  if v_kind in ('single_choice', 'multi_choice') then
    if jsonb_typeof(p_question->'options') is distinct from 'array'
       or jsonb_array_length(p_question->'options') < 2
       or jsonb_array_length(p_question->'options') > 20 then
      raise exception '%', p_prefix || '_OPTIONS_INVALID';
    end if;
    for v_option in select value from jsonb_array_elements(p_question->'options') loop
      v_label := btrim(coalesce(v_option->>'label', ''));
      if jsonb_typeof(v_option) <> 'object'
         or coalesce(lower(v_option->>'id'), '') !~ v_uuid
         or v_label = '' or char_length(v_label) > 120 then
        raise exception '%', p_prefix || '_OPTIONS_INVALID';
      end if;
      if jsonb_typeof(v_option->'key') not in ('string', 'null')
         or jsonb_typeof(v_option->'hint') not in ('string', 'null')
         or jsonb_typeof(v_option->'archived') not in ('boolean', 'null') then
        raise exception '%', p_prefix || '_OPTIONS_INVALID';
      end if;
      v_key := nullif(btrim(coalesce(v_option->>'key', '')), '');
      v_hint := nullif(btrim(coalesce(v_option->>'hint', '')), '');
      if v_key !~ '^[a-z][a-z0-9_]{0,39}$' or char_length(v_hint) > 120 then
        raise exception '%', p_prefix || '_OPTIONS_INVALID';
      end if;
      v_options := v_options || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'id', lower(v_option->>'id'),
          'label', v_label,
          'key', v_key,
          'hint', v_hint,
          'archived', case when v_option->'archived' = 'true'::jsonb then true end
        ))
      );
    end loop;
    if (select count(distinct o->>'id') from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options)
       or (select count(distinct lower(o->>'label')) from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options)
       or (select count(o->>'key') - count(distinct o->>'key') from jsonb_array_elements(v_options) o) <> 0
       or (select count(*) from jsonb_array_elements(v_options) o where not (o ? 'archived')) < 2 then
      raise exception '%', p_prefix || '_OPTIONS_INVALID';
    end if;
  end if;

  -- "Other" with a short text, for a single choice only (#1742).
  v_choice_other := v_kind = 'single_choice' and coalesce(p_question->'allow_other' = 'true'::jsonb, false);

  -- Bounds, for a number only.
  if v_kind = 'number' then
    if jsonb_typeof(p_question->'min_value') = 'number' then
      if (p_question->>'min_value')::numeric <> trunc((p_question->>'min_value')::numeric)
         or (p_question->>'min_value')::numeric not between -1000000 and 1000000 then
        raise exception '%', p_prefix || '_INVALID';
      end if;
      v_min := (p_question->>'min_value')::numeric::integer;
    elsif jsonb_typeof(p_question->'min_value') not in ('null') then
      raise exception '%', p_prefix || '_INVALID';
    end if;
    if jsonb_typeof(p_question->'max_value') = 'number' then
      if (p_question->>'max_value')::numeric <> trunc((p_question->>'max_value')::numeric)
         or (p_question->>'max_value')::numeric not between -1000000 and 1000000 then
        raise exception '%', p_prefix || '_INVALID';
      end if;
      v_max := (p_question->>'max_value')::numeric::integer;
    elsif jsonb_typeof(p_question->'max_value') not in ('null') then
      raise exception '%', p_prefix || '_INVALID';
    end if;
    if v_min is not null and v_max is not null and v_min > v_max then
      raise exception '%', p_prefix || '_INVALID';
    end if;
  end if;

  -- #1699. A place question's granularity, and whether "Not listed" is
  -- offered (on unless turned off).
  if v_kind = 'place' then
    v_granularity := coalesce(p_question->>'place_granularity', 'locality');
    if v_granularity not in ('locality', 'neighborhood') then
      raise exception '%', p_prefix || '_INVALID';
    end if;
    v_allow_other := coalesce(p_question->'place_allow_other' <> 'false'::jsonb, true);
  end if;

  -- The condition (#1742): {"any": [clause, ...]}, or one bare clause. Each
  -- clause names an EARLIER single-choice question of this save, once, and
  -- some of its options. Stored as {"any": [...]}.
  if p_question->'show_if' is not null and jsonb_typeof(p_question->'show_if') <> 'null' then
    if jsonb_typeof(p_question->'show_if') <> 'object' then
      raise exception '%', p_prefix || '_CONDITION_INVALID';
    end if;
    v_clauses := case
      when p_question->'show_if' ? 'any' then p_question->'show_if'->'any'
      else jsonb_build_array(p_question->'show_if')
    end;
    if jsonb_typeof(v_clauses) is distinct from 'array'
       or jsonb_array_length(v_clauses) = 0 then
      raise exception '%', p_prefix || '_CONDITION_INVALID';
    end if;
    v_show_if := '[]'::jsonb;
    for v_clause in select value from jsonb_array_elements(v_clauses) loop
      if jsonb_typeof(v_clause) <> 'object' then
        raise exception '%', p_prefix || '_CONDITION_INVALID';
      end if;
      v_parent := p_seen -> lower(coalesce(v_clause->>'question_id', ''));
      v_option_ids := v_clause->'option_ids';
      if v_parent is null
         or v_parent->>'kind' <> 'single_choice'
         or exists (
           select 1 from jsonb_array_elements(v_show_if) c
            where c->>'question_id' = lower(v_clause->>'question_id')
         )
         or jsonb_typeof(v_option_ids) is distinct from 'array'
         or jsonb_array_length(v_option_ids) = 0
         or exists (
           select 1 from jsonb_array_elements(v_option_ids) i
            where jsonb_typeof(i) <> 'string'
               or not exists (
                 select 1 from jsonb_array_elements(v_parent->'options') o
                  where o->>'id' = lower(i #>> '{}')
               )
         ) then
        raise exception '%', p_prefix || '_CONDITION_INVALID';
      end if;
      v_show_if := v_show_if || jsonb_build_array(jsonb_build_object(
        'question_id', lower(v_clause->>'question_id'),
        'option_ids', (select jsonb_agg(distinct lower(i #>> '{}')) from jsonb_array_elements(v_option_ids) i)
      ));
    end loop;
    v_show_if := jsonb_build_object('any', v_show_if);
  end if;

  return jsonb_build_object(
    'kind', v_kind,
    'prompt', v_prompt,
    'help', v_help,
    'column_label', v_column_label,
    'required', v_required,
    'options', v_options,
    'min_value', v_min,
    'max_value', v_max,
    'show_if', v_show_if,
    'place_granularity', v_granularity,
    'place_allow_other', v_allow_other,
    'allow_other', v_choice_other
  );
end;
$$;

comment on function public.question_definition(jsonb, jsonb, text[], text) is
  'One question as an editor sent it, normalized for storage (#1501, #1512, #1699, #1742): kind among p_kinds, prompt, help, column_label, required, options, bounds, place settings, allow_other and show_if over the earlier questions in p_seen. Raises p_prefix || _INVALID, _PROMPT_REQUIRED, _OPTIONS_INVALID, _CONDITION_INVALID or _COLUMN_LABEL_TOO_LONG. Shared by save_event_registration_questions() and save_person_questions() (#1743).';

revoke execute on function public.question_shown(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.question_answer_value(text, jsonb, boolean, integer, integer, text, boolean, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.question_definition(jsonb, jsonb, text[], text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. #1501 over the shared rules, behaviour unchanged
-- ---------------------------------------------------------------------------

create or replace function public.apply_registration_answers(
  p_tenant_id uuid,
  p_event_id uuid,
  p_registration_id uuid,
  p_answers jsonb,
  p_required boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answers jsonb := '{}'::jsonb;
  v_previous jsonb;
  v_shown jsonb := '{}'::jsonb;
  v_question record;
  v_answer record;
begin
  if p_answers is not null and jsonb_typeof(p_answers) <> 'null' then
    if jsonb_typeof(p_answers) <> 'object' then
      raise exception 'EVENT_ANSWERS_INVALID';
    end if;
    -- Keys compared as lower-case text, so a malformed key is a refusal
    -- rather than a cast error.
    select coalesce(jsonb_object_agg(lower(key), value), '{}'::jsonb)
      into v_answers
      from jsonb_each(p_answers);
  end if;

  if exists (
    select 1
      from jsonb_object_keys(v_answers) as k(key)
      left join public.event_registration_questions q
        on q.id::text = k.key
       and q.event_id = p_event_id
       and q.tenant_id = p_tenant_id
       and q.archived_at is null
     where q.id is null
  ) then
    raise exception 'EVENT_ANSWERS_INVALID';
  end if;

  -- What this registration chose before: an archived option stays valid for
  -- an answer that already had it, so re-saving the answers keeps it.
  select coalesce(jsonb_object_agg(a.question_id::text, a.value), '{}'::jsonb)
    into v_previous
    from public.event_registration_answers a
   where a.registration_id = p_registration_id
     and a.tenant_id = p_tenant_id
     and a.question_id is not null;

  delete from public.event_registration_answers a
   using public.event_registration_questions q
   where a.registration_id = p_registration_id
     and a.tenant_id = p_tenant_id
     and q.id = a.question_id
     and q.archived_at is null;

  for v_question in
    select q.*
      from public.event_registration_questions q
     where q.event_id = p_event_id
       and q.tenant_id = p_tenant_id
       and q.archived_at is null
     order by q.sort_order, q.created_at
  loop
    -- #1742: shown when any clause holds over the shown earlier answers.
    if not public.question_shown(v_question.show_if, v_shown) then
      continue;
    end if;

    select * into v_answer
      from public.question_answer_value(
        v_question.kind, v_question.options, v_question.allow_other,
        v_question.min_value, v_question.max_value,
        v_question.place_granularity, v_question.place_allow_other,
        v_answers -> (v_question.id::text),
        v_previous -> (v_question.id::text),
        'EVENT_ANSWERS_INVALID'
      );

    if v_answer.value is null then
      if v_question.required and p_required then
        raise exception 'EVENT_ANSWERS_REQUIRED';
      end if;
      continue;
    end if;

    insert into public.event_registration_answers
      (tenant_id, registration_id, question_id, kind, prompt_as_shown, sort_order, value, answer_text)
    values
      (p_tenant_id, p_registration_id, v_question.id, v_question.kind, v_question.prompt,
       v_question.sort_order, v_answer.value, v_answer.answer_text);
    v_shown := v_shown || jsonb_build_object(v_question.id::text, v_answer.value);
  end loop;
end;
$$;

comment on function public.apply_registration_answers(uuid, uuid, uuid, jsonb, boolean) is
  'Validates and stores a registration''s answers (#1501). Conditions are any-of over earlier questions that are themselves shown (#1742); an archived option is accepted only where this registration had already chosen it; a single choice takes {"other": text} where it allows "Other". The rules are question_shown() and question_answer_value(), shared with person questions (#1743). Internal: called by the registration and answer RPCs.';

CREATE OR REPLACE FUNCTION public.save_event_registration_questions(p_event_id uuid, p_questions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_question jsonb;
  v_def jsonb;
  v_index integer := 0;
  v_id uuid;
  v_shares boolean;
  v_seen jsonb := '{}'::jsonb;
  v_kept uuid[] := '{}';
begin
  if not public.has_event_access(p_event_id, 'event_registration_questions', 'manage') then
    raise exception 'Not authorized to edit events';
  end if;

  perform 1 from public.events
   where id = p_event_id and tenant_id = v_tenant_id
   for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'EVENT_QUESTIONS_INVALID';
  end if;

  if jsonb_array_length(p_questions) > 20 then
    raise exception 'EVENT_QUESTIONS_TOO_MANY';
  end if;

  for v_question in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_question) <> 'object'
       or coalesce(lower(v_question->>'id'), '') !~ v_uuid then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;
    v_id := (v_question->>'id')::uuid;
    if v_id = any (v_kept) then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_def := public.question_definition(
      v_question, v_seen,
      array['single_choice', 'multi_choice', 'short_text', 'number', 'consent', 'place'],
      'EVENT_QUESTIONS'
    );
    v_shares := v_def->>'kind' = 'consent' and coalesce(v_question->'shares_contact' = 'true'::jsonb, false);

    update public.event_registration_questions
       set kind = v_def->>'kind',
           prompt = v_def->>'prompt',
           help = v_def->>'help',
           column_label = v_def->>'column_label',
           required = (v_def->>'required')::boolean,
           sort_order = v_index,
           options = v_def->'options',
           min_value = (v_def->>'min_value')::integer,
           max_value = (v_def->>'max_value')::integer,
           show_if = nullif(v_def->'show_if', 'null'::jsonb),
           shares_contact = v_shares,
           place_granularity = v_def->>'place_granularity',
           place_allow_other = (v_def->>'place_allow_other')::boolean,
           allow_other = (v_def->>'allow_other')::boolean,
           archived_at = null,
           updated_at = now()
     where id = v_id
       and event_id = p_event_id
       and tenant_id = v_tenant_id;

    if not found then
      begin
        insert into public.event_registration_questions
          (id, tenant_id, event_id, kind, prompt, help, column_label, required, sort_order,
           options, min_value, max_value, show_if, shares_contact, place_granularity, place_allow_other,
           allow_other)
        values
          (v_id, v_tenant_id, p_event_id, v_def->>'kind', v_def->>'prompt', v_def->>'help',
           v_def->>'column_label', (v_def->>'required')::boolean, v_index,
           v_def->'options', (v_def->>'min_value')::integer, (v_def->>'max_value')::integer,
           nullif(v_def->'show_if', 'null'::jsonb), v_shares, v_def->>'place_granularity',
           (v_def->>'place_allow_other')::boolean, (v_def->>'allow_other')::boolean);
      exception when unique_violation then
        -- The id belongs to another event's question.
        raise exception 'EVENT_QUESTIONS_INVALID';
      end;
    end if;

    v_seen := v_seen || jsonb_build_object(v_id::text, jsonb_build_object(
      'kind', v_def->>'kind', 'options', v_def->'options'
    ));
    v_kept := v_kept || v_id;
    v_index := v_index + 1;
  end loop;

  -- Left out: archived where somebody answered it, so the answers stay
  -- readable, and gone where nobody did.
  update public.event_registration_questions q
     set archived_at = now(), updated_at = now()
   where q.event_id = p_event_id
     and q.tenant_id = v_tenant_id
     and q.archived_at is null
     and not (q.id = any (v_kept))
     and exists (select 1 from public.event_registration_answers a where a.question_id = q.id);

  delete from public.event_registration_questions q
   where q.event_id = p_event_id
     and q.tenant_id = v_tenant_id
     and not (q.id = any (v_kept))
     and not exists (select 1 from public.event_registration_answers a where a.question_id = q.id);
end;
$function$;

comment on function public.save_event_registration_questions(uuid, jsonb) is
  'Replaces an event''s registration questions (#1501). Options may carry key, hint and archived, a single choice allow_other, and show_if {"any": [...]} over earlier single-choice questions, conditional or not (#1742). Each question is checked by question_definition(), shared with person questions (#1743). Questions left out are archived where answered, deleted otherwise.';

-- ---------------------------------------------------------------------------
-- 3. The module and the resource
-- ---------------------------------------------------------------------------

-- On by default and on every plan (open question 7, decided on #1743): a
-- tenant with no questions asks nothing, so having the module changes
-- nothing -- #1501's "an event with no questions is unchanged", applied to
-- the tenant.
insert into public.modules (key, label, description, sort_order, default_enabled, is_core) values
  ('person_questions', 'Profile questions',
   'Questions the organization asks about a person -- after event registration, on their own details page, or only in the portal -- with one current answer per person.',
   17, true, false);

insert into public.plan_modules (plan, module_key, enabled)
select p.plan, 'person_questions', true
from (values ('internal'), ('demo'), ('white_label')) as p(plan);

-- One permission for every question (open question 4, decided on #1743): a
-- per-question `sensitive` flag is a follow-up when a tenant needs one. As
-- with rider_profiles, each screen asks for its own permission (people:view,
-- events:manage, event_impact:view) AND this one.
insert into public.resources (key, section, label, description, sort_order, module_key) values
  ('person_answers', 'People', 'Profile answers',
   'People''s answers to the organization''s profile questions, and the questions themselves',
   91, 'person_questions');

-- Seeded from each role's rider_profiles grant, which is what this replaces
-- (#1409 section 5), so nobody's access changes on the way in. A role with no
-- rider_profiles row gets none here either, which reads as None.
insert into public.role_permissions (role_id, resource_id, level)
select rp.role_id, pa.id, rp.level
  from public.role_permissions rp
  join public.resources rr on rr.id = rp.resource_id and rr.key = 'rider_profiles'
 cross join public.resources pa
 where pa.key = 'person_answers';

-- ---------------------------------------------------------------------------
-- 4. Schema
-- ---------------------------------------------------------------------------

-- A scope names a program by a composite key, so programs needs the
-- (tenant_id, id) unique every tenant parent has. Created only where the
-- composite-key pass (20260906080000) did not already give it one.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.programs'::regclass
       and conname = 'programs_tenant_id_id_key'
  ) then
    alter table public.programs
      add constraint programs_tenant_id_id_key unique (tenant_id, id);
  end if;
end;
$$;

create table public.person_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- An optional stable slug (`ski_level`) so a migration, a metric or the
  -- public API can name a question without its id.
  key text
    check (key is null or key ~ '^[a-z][a-z0-9_]{0,39}$'),
  -- #1501's kinds less consent (see the header). Fixed once answered.
  kind text not null
    constraint person_questions_kind_check
      check (kind in ('single_choice', 'multi_choice', 'short_text', 'number', 'place')),
  prompt text not null
    check (btrim(prompt) <> '' and char_length(prompt) <= 300),
  help text
    check (help is null or (btrim(help) <> '' and char_length(help) <= 500)),
  column_label text
    check (column_label is null or (btrim(column_label) <> '' and char_length(column_label) <= 24)),
  required boolean not null default false,
  sort_order integer not null default 0,
  -- [{id, label, key?, hint?, archived?}] for the two choice kinds, []
  -- otherwise, as #1742 has them.
  options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array'),
  allow_other boolean not null default false,
  min_value integer,
  max_value integer,
  place_granularity text
    check (place_granularity in ('locality', 'neighborhood')),
  place_allow_other boolean not null default true,
  show_if jsonb
    check (show_if is null or jsonb_typeof(show_if) = 'object'),
  -- Where the person is asked. Staff see every current question on the
  -- person form whatever these say.
  ask_after_registration boolean not null default true,
  ask_on_my_details boolean not null default true,
  -- Copy the answer onto the registration at check-in. Read by the snapshot
  -- trigger #1409's metrics ticket adds; nothing reads it yet.
  snapshot_at_checkin boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_questions_tenant_id_id_key unique (tenant_id, id),
  constraint person_questions_allow_other_kind
    check (not allow_other or kind = 'single_choice'),
  constraint person_questions_bounds_kind
    check (kind = 'number' or (min_value is null and max_value is null)),
  constraint person_questions_bounds_order
    check (min_value is null or max_value is null or min_value <= max_value),
  constraint person_questions_place_granularity_kind
    check ((kind = 'place') = (place_granularity is not null))
);

create unique index person_questions_tenant_key_key
  on public.person_questions (tenant_id, key) where key is not null;

create index person_questions_tenant_order_idx
  on public.person_questions (tenant_id, sort_order) where archived_at is null;

comment on table public.person_questions is
  'The typed questions a tenant asks about a person (#1409, #1743), answered once per person in person_answers. #1501''s kinds less consent, its options and its any-of conditions. A question cannot change kind once answered; one removed while answered is archived (archived_at). Written only by save_person_questions().';

-- Optional. A question with no rows is asked after every event registration;
-- one with rows only after registering for an event in one of those programs
-- (through event_programs). Programs only: a question for one event is
-- #1501's (open question 2, decided on #1743).
create table public.person_question_scopes (
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  question_id uuid not null,
  program_id uuid not null,
  primary key (question_id, program_id),
  constraint person_question_scopes_question_fkey
    foreign key (tenant_id, question_id)
    references public.person_questions (tenant_id, id) on delete cascade,
  constraint person_question_scopes_program_fkey
    foreign key (tenant_id, program_id)
    references public.programs (tenant_id, id) on delete cascade
);

create index person_question_scopes_program_idx
  on public.person_question_scopes (program_id);

comment on table public.person_question_scopes is
  'The programs a person question is asked after registering in (#1743). No rows: asked after every registration. Written only by save_person_questions().';

create table public.person_answers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  person_id uuid not null,
  -- Null only if the question row is ever deleted outright; a question with
  -- answers is archived instead.
  question_id uuid,
  kind text not null,
  -- The raw answer by kind, as #1501 stores it.
  value jsonb not null,
  -- The answer in words as shown; what every reader displays.
  answer_text text not null,
  prompt_as_shown text not null,
  answered_at timestamptz not null default now(),
  answered_via text not null
    check (answered_via in ('registration', 'self', 'staff', 'migration')),
  -- The registration it came in on, for the registration and door paths.
  registration_id uuid,
  constraint person_answers_person_question_key unique (person_id, question_id),
  constraint person_answers_person_fkey
    foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete cascade,
  constraint person_answers_question_fkey
    foreign key (tenant_id, question_id)
    references public.person_questions (tenant_id, id)
    on delete set null (question_id),
  constraint person_answers_registration_fkey
    foreign key (tenant_id, registration_id)
    references public.event_registrations (tenant_id, id)
    on delete set null (registration_id)
);

create index person_answers_question_idx on public.person_answers (question_id);
create index person_answers_registration_idx on public.person_answers (registration_id)
  where registration_id is not null;

comment on table public.person_answers is
  'One person''s current answer to one of the tenant''s profile questions (#1409, #1743). prompt_as_shown and answer_text keep the words as shown, so editing or archiving the question never rewrites the answer. Personal data: free text can hold anything. Written only by apply_person_answers(), through save_registrant_person_answers(), set_my_person_answers(), set_person_answers() and set_registrant_person_answers().';

-- Read under the one permission (section 3); written only by the definer
-- functions below. The revoke comes first because a hosted project's default
-- privileges hand every new table to both roles (20260911010000, section 4).
alter table public.person_questions enable row level security;
alter table public.person_question_scopes enable row level security;
alter table public.person_answers enable row level security;

revoke all on public.person_questions, public.person_question_scopes, public.person_answers
  from public, anon, authenticated;
grant select on public.person_questions, public.person_question_scopes, public.person_answers
  to authenticated;

create policy "person_questions select" on public.person_questions
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('person_answers', 'view')
  );

create policy "person_question_scopes select" on public.person_question_scopes
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('person_answers', 'view')
  );

create policy "person_answers select" on public.person_answers
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('person_answers', 'view')
  );

-- Both audited: the questions like any configuration, the answers because
-- they are one table with none of the noise that keeps `people` untriggered
-- (#1409 section 7). The actor is auth.uid(), so a constituent's own edit
-- names the constituent. The answers' values are registered as personal, so
-- the retention job clears them from the snapshots on its clock (#720).
insert into public.audited_tables (table_name, pk_column) values
  ('person_questions', 'id'),
  ('person_answers', 'id');

create trigger audit_log_row after insert or update or delete
  on public.person_questions
  for each row execute function public.audit_log_row();

create trigger audit_log_row after insert or update or delete
  on public.person_answers
  for each row execute function public.audit_log_row();

insert into public.retention_snapshot_personal_columns (table_name, column_name) values
  ('person_answers', 'value'),
  ('person_answers', 'answer_text');

-- An answer is about the person, not a record the organization must keep, so
-- it never holds a person back from the purge; it goes with them (cascade).
insert into public.retention_purgeable_person_refs (table_name, column_name) values
  ('person_answers', 'person_id');

-- merge_people() repoints every key to `people` it finds in the catalog and
-- refuses the merge on a unique violation. Where both records answered the
-- same question, the survivor's answer wins (#1409 section 7): the
-- duplicate's row is left where it is, and goes with the duplicate when the
-- merge deletes it. Only a repoint moves person_id, so nothing else meets
-- this.
create function public.person_answers_keep_survivors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.person_answers a
     where a.person_id = new.person_id
       and a.question_id = new.question_id
       and a.id <> new.id
  ) then
    return null;
  end if;
  return new;
end;
$$;

comment on function public.person_answers_keep_survivors() is
  'Skips moving an answer onto a person who already answered the same question, so merge_people() keeps the survivor''s answer and the duplicate''s goes with the duplicate (#1743).';

create trigger person_answers_keep_survivors
  before update of person_id on public.person_answers
  for each row
  when (old.person_id is distinct from new.person_id)
  execute function public.person_answers_keep_survivors();

-- ---------------------------------------------------------------------------
-- 5. apply_person_answers(): the one authority on a person's answers
-- ---------------------------------------------------------------------------

-- Which questions a form shows depends on where it is:
--
--   registration  after event registration: ask_after_registration, and in
--                 scope for the registration's event (no scopes, or one of
--                 its programs)
--   self          /my/details: ask_on_my_details
--   staff         the person form and the door: every current question
--
-- What an absent answer means depends on it too. The post-registration form
-- is never pre-filled (the person was matched from an email address someone
-- typed, #1409 section 3), so there an absent or empty answer leaves the
-- stored one alone, and submitting nothing writes nothing. The other two
-- forms show the stored answers, so there an absent answer is a cleared one.
--
-- Conditions are evaluated over every current question in order, using the
-- new answer where the form had the question and the stored one where it did
-- not. A question that ends up hidden loses its stored answer, whichever form
-- hid it. `required` binds a shown question on the form unless p_staff.
create function public.apply_person_answers(
  p_tenant_id uuid,
  p_person_id uuid,
  p_answers jsonb,
  p_via text,
  p_staff boolean,
  p_registration_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answers jsonb := '{}'::jsonb;
  v_stored jsonb;
  v_shown jsonb := '{}'::jsonb;
  v_partial boolean := p_via = 'registration';
  v_event_id uuid;
  v_form uuid[];
  v_question record;
  v_answer record;
  v_given boolean;
begin
  if p_via not in ('registration', 'self', 'staff') then
    raise exception 'PERSON_ANSWERS_INVALID';
  end if;

  if p_answers is not null and jsonb_typeof(p_answers) <> 'null' then
    if jsonb_typeof(p_answers) <> 'object' then
      raise exception 'PERSON_ANSWERS_INVALID';
    end if;
    select coalesce(jsonb_object_agg(lower(key), value), '{}'::jsonb)
      into v_answers
      from jsonb_each(p_answers);
  end if;

  -- The step stays skippable: submitting nothing writes nothing.
  if v_partial and not exists (
    select 1 from jsonb_each(v_answers) e where jsonb_typeof(e.value) <> 'null'
  ) then
    return;
  end if;

  if p_via = 'registration' then
    select r.event_id into v_event_id
      from public.event_registrations r
     where r.id = p_registration_id
       and r.tenant_id = p_tenant_id
       and r.person_id = p_person_id;
    if v_event_id is null then
      raise exception 'PERSON_ANSWERS_INVALID';
    end if;
  end if;

  -- The questions this form has.
  select coalesce(array_agg(q.id), '{}') into v_form
    from public.person_questions q
   where q.tenant_id = p_tenant_id
     and q.archived_at is null
     and case p_via
           when 'staff' then true
           when 'self' then q.ask_on_my_details
           else q.ask_after_registration
                and (
                  not exists (select 1 from public.person_question_scopes s where s.question_id = q.id)
                  or exists (
                    select 1
                      from public.person_question_scopes s
                      join public.event_programs ep on ep.program_id = s.program_id
                     where s.question_id = q.id
                       and ep.event_id = v_event_id
                  )
                )
         end;

  if exists (
    select 1
      from jsonb_object_keys(v_answers) as k(key)
     where not (k.key = any (v_form::text[]))
  ) then
    raise exception 'PERSON_ANSWERS_INVALID';
  end if;

  select coalesce(jsonb_object_agg(a.question_id::text, a.value), '{}'::jsonb)
    into v_stored
    from public.person_answers a
   where a.person_id = p_person_id
     and a.tenant_id = p_tenant_id
     and a.question_id is not null;

  for v_question in
    select q.*, q.id = any (v_form) as on_form
      from public.person_questions q
     where q.tenant_id = p_tenant_id
       and q.archived_at is null
     order by q.sort_order, q.created_at
  loop
    -- Hidden: nothing stored outlives the answer that hid it.
    if not public.question_shown(v_question.show_if, v_shown) then
      if v_stored ? (v_question.id::text) then
        delete from public.person_answers
         where person_id = p_person_id and question_id = v_question.id;
      end if;
      continue;
    end if;

    v_given := v_question.on_form
               and (not v_partial
                    or coalesce(jsonb_typeof(v_answers -> (v_question.id::text)), 'null') <> 'null');

    if v_given then
      select * into v_answer
        from public.question_answer_value(
          v_question.kind, v_question.options, v_question.allow_other,
          v_question.min_value, v_question.max_value,
          v_question.place_granularity, v_question.place_allow_other,
          v_answers -> (v_question.id::text),
          v_stored -> (v_question.id::text),
          'PERSON_ANSWERS_INVALID'
        );
      -- A blank on the form that is never pre-filled is no answer at all.
      v_given := not (v_partial and v_answer.value is null);
    end if;

    if not v_given then
      -- Off this form, or left blank on the form that is never pre-filled:
      -- the stored answer stands, and counts for the conditions after it.
      if v_stored ? (v_question.id::text) then
        v_shown := v_shown || jsonb_build_object(v_question.id::text, v_stored -> (v_question.id::text));
      elsif v_question.on_form and v_question.required and not p_staff then
        raise exception 'PERSON_ANSWERS_REQUIRED';
      end if;
      continue;
    end if;

    if v_answer.value is null then
      if v_question.required and not p_staff then
        raise exception 'PERSON_ANSWERS_REQUIRED';
      end if;
      if v_stored ? (v_question.id::text) then
        delete from public.person_answers
         where person_id = p_person_id and question_id = v_question.id;
      end if;
      continue;
    end if;

    -- An unchanged answer keeps its row, its date and its audit trail quiet.
    insert into public.person_answers as a
      (tenant_id, person_id, question_id, kind, value, answer_text, prompt_as_shown,
       answered_at, answered_via, registration_id)
    values
      (p_tenant_id, p_person_id, v_question.id, v_question.kind, v_answer.value,
       v_answer.answer_text, v_question.prompt, now(), p_via, p_registration_id)
    on conflict (person_id, question_id) do update
      set kind = excluded.kind,
          value = excluded.value,
          answer_text = excluded.answer_text,
          prompt_as_shown = excluded.prompt_as_shown,
          answered_at = excluded.answered_at,
          answered_via = excluded.answered_via,
          registration_id = excluded.registration_id
      where a.value is distinct from excluded.value
         or a.answer_text is distinct from excluded.answer_text;

    v_shown := v_shown || jsonb_build_object(v_question.id::text, v_answer.value);
  end loop;
end;
$$;

comment on function public.apply_person_answers(uuid, uuid, jsonb, text, boolean, uuid) is
  'Validates and stores a person''s answers to the tenant''s profile questions (#1743), with #1501''s shared rules. p_via (registration, self, staff) decides which questions the form has; on the never-pre-filled registration form an absent answer leaves the stored one, elsewhere it clears it. A question the answers hide loses its stored answer. required binds unless p_staff. Internal: called by the four write RPCs.';

revoke execute on function public.apply_person_answers(uuid, uuid, jsonb, text, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.person_answers_keep_survivors() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The four write paths
-- ---------------------------------------------------------------------------

-- After event registration, for an anonymous registrant. The registration id
-- is the credential, for a day, as save_registrant_rider_profile() has it.
create function public.save_registrant_person_answers(
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
  v_person_id uuid;
begin
  if not public.check_rate_limit('save_registrant_person_answers', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return;
  end if;

  if not public.module_enabled_for_tenant(v_tenant_id, 'events')
     or not public.module_enabled_for_tenant(v_tenant_id, 'person_questions') then
    raise exception 'SECTION_UNAVAILABLE';
  end if;

  select person_id into v_person_id
    from public.event_registrations
   where id = p_registration_id
     and tenant_id = v_tenant_id
     and person_id is not null
     and created_at > now() - interval '1 day';

  if v_person_id is null then
    raise exception 'PERSON_ANSWERS_UNAVAILABLE';
  end if;

  perform public.apply_person_answers(
    v_tenant_id, v_person_id, p_answers, 'registration', false, p_registration_id
  );
end;
$$;

comment on function public.save_registrant_person_answers(uuid, jsonb, text, inet) is
  'The post-registration profile questions (#1743), for a registration under a day old on the resolved tenant: the registration id is the credential. Never pre-filled, so an absent answer leaves the stored one and submitting nothing writes nothing.';

revoke execute on function public.save_registrant_person_answers(uuid, jsonb, text, inet) from public;
grant execute on function public.save_registrant_person_answers(uuid, jsonb, text, inet) to anon, authenticated;

-- /my/details. No person argument: the caller's own record, as
-- set_my_contact_details() has it. The audit row's actor is the constituent.
create function public.set_my_person_answers(p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid := public.my_contact_person_id();
  v_tenant_id uuid;
begin
  if v_person_id is null then
    raise exception 'No record to edit';
  end if;

  select tenant_id into v_tenant_id from public.people where id = v_person_id;

  if not public.module_enabled_for_tenant(v_tenant_id, 'person_questions') then
    raise exception 'SECTION_UNAVAILABLE';
  end if;

  perform public.apply_person_answers(v_tenant_id, v_person_id, p_answers, 'self', false);
end;
$$;

comment on function public.set_my_person_answers(jsonb) is
  'The signed-in constituent''s own answers to the questions asked on /my/details (#1743). No person argument; an absent answer clears the stored one.';

revoke execute on function public.set_my_person_answers(jsonb) from public, anon;
grant execute on function public.set_my_person_answers(jsonb) to authenticated;

-- The person form. Staff are not held to `required`.
create function public.set_person_answers(p_person_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
begin
  if not public.has_permission('people', 'manage')
     or not public.has_permission('person_answers', 'manage') then
    raise exception 'Not authorized to edit profile answers';
  end if;

  if not exists (
    select 1 from public.people where id = p_person_id and tenant_id = v_tenant_id
  ) then
    raise exception 'PERSON_NOT_FOUND';
  end if;

  perform public.apply_person_answers(v_tenant_id, p_person_id, p_answers, 'staff', true);
end;
$$;

comment on function public.set_person_answers(uuid, jsonb) is
  'Staff edit of a person''s answers to every current profile question (#1743): People and Profile answers at Manage. Not held to required.';

revoke execute on function public.set_person_answers(uuid, jsonb) from public, anon;
grant execute on function public.set_person_answers(uuid, jsonb) to authenticated;

-- The door: held by events:manage without people:view, as
-- set_registrant_rider_profile() is.
create function public.set_registrant_person_answers(p_registration_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_person_id uuid;
begin
  if not public.has_permission('events', 'manage')
     or not public.has_permission('person_answers', 'manage') then
    raise exception 'Not authorized to edit registrant profile answers';
  end if;

  select person_id into v_person_id
    from public.event_registrations
   where id = p_registration_id
     and tenant_id = v_tenant_id;

  if v_person_id is null then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  perform public.apply_person_answers(
    v_tenant_id, v_person_id, p_answers, 'staff', true, p_registration_id
  );
end;
$$;

comment on function public.set_registrant_person_answers(uuid, jsonb) is
  'A registrant''s answers to every current profile question, edited at the door (#1743): Events and Profile answers at Manage. Not held to required.';

revoke execute on function public.set_registrant_person_answers(uuid, jsonb) from public, anon;
grant execute on function public.set_registrant_person_answers(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Setting the questions up
-- ---------------------------------------------------------------------------

-- Replaces the tenant's current questions, in order, as the editor holds
-- them. On top of question_definition(): a question's key (unique in the
-- tenant), its programs, where it is asked, and the two retirement rules --
-- an answered question keeps its kind, and an option somebody chose is
-- archived rather than removed. A question left out is archived where
-- answered and deleted otherwise; an archived question sent back is restored.
create function public.save_person_questions(p_questions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_question jsonb;
  v_def jsonb;
  v_id uuid;
  v_key text;
  v_programs uuid[];
  v_existing record;
  v_exists boolean;
  v_index integer := 0;
  v_seen jsonb := '{}'::jsonb;
  v_kept uuid[] := '{}';
  v_listed uuid[];
  v_keys text[] := '{}';
begin
  if not public.has_permission('person_answers', 'manage') then
    raise exception 'Not authorized to edit profile questions';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'PERSON_QUESTIONS_INVALID';
  end if;

  if jsonb_array_length(p_questions) > 20 then
    raise exception 'PERSON_QUESTIONS_TOO_MANY';
  end if;

  -- One save at a time per tenant, so two editors cannot interleave orders.
  perform pg_advisory_xact_lock(hashtextextended('save_person_questions:' || v_tenant_id::text, 0));

  -- Left out: archived where answered, gone where not. First, so a question
  -- replaced in this save frees its key for its replacement; an archived one
  -- keeps it.
  if exists (
    select 1 from jsonb_array_elements(p_questions) o
     where jsonb_typeof(o) <> 'object' or coalesce(lower(o->>'id'), '') !~ v_uuid
  ) then
    raise exception 'PERSON_QUESTIONS_INVALID';
  end if;
  select coalesce(array_agg((o->>'id')::uuid), '{}') into v_listed
    from jsonb_array_elements(p_questions) o;

  update public.person_questions q
     set archived_at = now(), updated_at = now()
   where q.tenant_id = v_tenant_id
     and q.archived_at is null
     and not (q.id = any (v_listed))
     and exists (select 1 from public.person_answers a where a.question_id = q.id);

  delete from public.person_questions q
   where q.tenant_id = v_tenant_id
     and not (q.id = any (v_listed))
     and not exists (select 1 from public.person_answers a where a.question_id = q.id);

  for v_question in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_question) <> 'object'
       or coalesce(lower(v_question->>'id'), '') !~ v_uuid then
      raise exception 'PERSON_QUESTIONS_INVALID';
    end if;
    v_id := (v_question->>'id')::uuid;
    if v_id = any (v_kept) then
      raise exception 'PERSON_QUESTIONS_INVALID';
    end if;

    v_def := public.question_definition(
      v_question, v_seen,
      array['single_choice', 'multi_choice', 'short_text', 'number', 'place'],
      'PERSON_QUESTIONS'
    );

    if jsonb_typeof(v_question->'key') not in ('string', 'null') then
      raise exception 'PERSON_QUESTIONS_KEY_INVALID';
    end if;
    v_key := nullif(btrim(coalesce(v_question->>'key', '')), '');
    if v_key !~ '^[a-z][a-z0-9_]{0,39}$' then
      raise exception 'PERSON_QUESTIONS_KEY_INVALID';
    end if;
    if v_key = any (v_keys)
       or exists (
         -- An archived question keeps its key.
         select 1 from public.person_questions q
          where q.tenant_id = v_tenant_id and q.key = v_key
            and not (q.id = any (v_listed))
       ) then
      raise exception 'PERSON_QUESTIONS_KEY_TAKEN';
    end if;

    if jsonb_typeof(v_question->'program_ids') not in ('array', 'null') then
      raise exception 'PERSON_QUESTIONS_SCOPE_INVALID';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_question->'program_ids', '[]'::jsonb)) p
       where jsonb_typeof(p) <> 'string' or lower(p #>> '{}') !~ v_uuid
    ) then
      raise exception 'PERSON_QUESTIONS_SCOPE_INVALID';
    end if;
    select coalesce(array_agg(distinct (p #>> '{}')::uuid), '{}') into v_programs
      from jsonb_array_elements(coalesce(v_question->'program_ids', '[]'::jsonb)) p;
    if exists (
      select 1 from unnest(v_programs) as p(id)
       where not exists (
         select 1 from public.programs g where g.id = p.id and g.tenant_id = v_tenant_id
       )
    ) then
      raise exception 'PERSON_QUESTIONS_SCOPE_INVALID';
    end if;

    -- Retired, never rewritten.
    select q.kind, q.options into v_existing
      from public.person_questions q
     where q.id = v_id and q.tenant_id = v_tenant_id
     for update;
    v_exists := found;
    if v_exists and exists (select 1 from public.person_answers a where a.question_id = v_id) then
      if v_existing.kind <> v_def->>'kind' then
        raise exception 'PERSON_QUESTIONS_KIND_LOCKED';
      end if;
      if exists (
        select 1
          from jsonb_array_elements(v_existing.options) o
         where not exists (
                 select 1 from jsonb_array_elements(v_def->'options') n
                  where n->>'id' = o->>'id'
               )
           and exists (
                 select 1 from public.person_answers a
                  where a.question_id = v_id
                    and (a.value = to_jsonb(o->>'id')
                         or (jsonb_typeof(a.value) = 'array' and a.value ? (o->>'id')))
               )
      ) then
        raise exception 'PERSON_QUESTIONS_OPTION_IN_USE';
      end if;
    end if;

    if v_exists then
      begin
      update public.person_questions
         set key = v_key,
             kind = v_def->>'kind',
             prompt = v_def->>'prompt',
             help = v_def->>'help',
             column_label = v_def->>'column_label',
             required = (v_def->>'required')::boolean,
             sort_order = v_index,
             options = v_def->'options',
             allow_other = (v_def->>'allow_other')::boolean,
             min_value = (v_def->>'min_value')::integer,
             max_value = (v_def->>'max_value')::integer,
             place_granularity = v_def->>'place_granularity',
             place_allow_other = (v_def->>'place_allow_other')::boolean,
             show_if = nullif(v_def->'show_if', 'null'::jsonb),
             ask_after_registration = coalesce(v_question->'ask_after_registration' = 'true'::jsonb, false),
             ask_on_my_details = coalesce(v_question->'ask_on_my_details' = 'true'::jsonb, false),
             snapshot_at_checkin = coalesce(v_question->'snapshot_at_checkin' = 'true'::jsonb, false),
             archived_at = null,
             updated_at = now()
       where id = v_id and tenant_id = v_tenant_id;
      exception when unique_violation then
        -- Two questions swapping keys in one save; take it in two.
        raise exception 'PERSON_QUESTIONS_KEY_TAKEN';
      end;
    else
      begin
        insert into public.person_questions
          (id, tenant_id, key, kind, prompt, help, column_label, required, sort_order, options,
           allow_other, min_value, max_value, place_granularity, place_allow_other, show_if,
           ask_after_registration, ask_on_my_details, snapshot_at_checkin)
        values
          (v_id, v_tenant_id, v_key, v_def->>'kind', v_def->>'prompt', v_def->>'help',
           v_def->>'column_label', (v_def->>'required')::boolean, v_index, v_def->'options',
           (v_def->>'allow_other')::boolean, (v_def->>'min_value')::integer,
           (v_def->>'max_value')::integer, v_def->>'place_granularity',
           (v_def->>'place_allow_other')::boolean, nullif(v_def->'show_if', 'null'::jsonb),
           coalesce(v_question->'ask_after_registration' = 'true'::jsonb, false),
           coalesce(v_question->'ask_on_my_details' = 'true'::jsonb, false),
           coalesce(v_question->'snapshot_at_checkin' = 'true'::jsonb, false));
      exception when unique_violation then
        -- The id belongs to another tenant's question, or two questions are
        -- swapping keys in one save.
        raise exception 'PERSON_QUESTIONS_INVALID';
      end;
    end if;

    delete from public.person_question_scopes
     where question_id = v_id
       and not (program_id = any (v_programs));
    insert into public.person_question_scopes (tenant_id, question_id, program_id)
    select v_tenant_id, v_id, p.id from unnest(v_programs) as p(id)
    on conflict do nothing;

    v_seen := v_seen || jsonb_build_object(v_id::text, jsonb_build_object(
      'kind', v_def->>'kind', 'options', v_def->'options'
    ));
    v_kept := v_kept || v_id;
    if v_key is not null then
      v_keys := v_keys || v_key;
    end if;
    v_index := v_index + 1;
  end loop;
end;
$$;

comment on function public.save_person_questions(jsonb) is
  'Replaces the tenant''s current profile questions, in order (#1743): question_definition() plus key, program_ids, ask_after_registration, ask_on_my_details and snapshot_at_checkin. An answered question keeps its kind (PERSON_QUESTIONS_KIND_LOCKED) and its chosen options (PERSON_QUESTIONS_OPTION_IN_USE: archive them). Left out: archived where answered, deleted otherwise. Profile answers at Manage.';

revoke execute on function public.save_person_questions(jsonb) from public, anon;
grant execute on function public.save_person_questions(jsonb) to authenticated;

-- What the editor needs to know before it offers to change a question: how
-- many people answered it, and which options they chose. Counts only, under
-- the same permission that reads the answers themselves.
create function public.person_question_usage()
returns table (question_id uuid, answers bigint, option_ids text[])
language sql
security definer
set search_path = public
stable
as $$
  select a.question_id,
         count(distinct a.id),
         coalesce(
           array_agg(distinct o.id) filter (where o.id is not null),
           '{}'
         )
    from public.person_answers a
    left join lateral (
      select a.value #>> '{}' as id where jsonb_typeof(a.value) = 'string'
      union all
      select e #>> '{}' from jsonb_array_elements(
        case when jsonb_typeof(a.value) = 'array' then a.value else '[]'::jsonb end
      ) e
    ) o on true
   where a.tenant_id = (select public.current_tenant_id())
     and a.question_id is not null
     and public.has_permission('person_answers', 'view')
   group by a.question_id;
$$;

comment on function public.person_question_usage() is
  'Per profile question of the current tenant: how many people answered it and the option ids they chose (#1743), for the editor''s retirement rules. Profile answers at View.';

revoke execute on function public.person_question_usage() from public, anon;
grant execute on function public.person_question_usage() to authenticated;
