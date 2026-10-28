-- A sixth registration question kind, `place` (#1699, part of #1698)
-- ---------------------------------------------------------------------------
--
-- Answered from the places reference table (20261023160000) through an
-- autocomplete, so "bk", "Brooklyn" and "wburg" stop being three answers.
-- Each question says how fine it asks:
--
--   locality       a city, town or CDP -- in NYC, a borough
--   neighborhood   an NYC neighborhood (2020 NTA) where there is one; a
--                  city/town or borough everywhere else, which is the fallback
--
-- and whether "Not listed" is offered (on by default), which takes up to 200
-- characters of free text so nobody is blocked.
--
--   place   {"place_id": "<uuid>", "label": "<as shown>"}  or  {"other": "<text>"}
--
-- ANSWERS KEEP THEIR WORDS, as #1501's do: the label is copied from the place
-- when the answer is written, and answer_text is that label (or the typed
-- text), so updating the places dataset never rewrites an answer.
--
-- A place question cannot be a condition: show_if only names single-choice
-- questions, unchanged.
--
-- THE SERVICE AREA is a tenant setting, `registration.service_area`: the
-- states, counties and boroughs it serves, as place ids. The public form reads
-- it from public_registration_settings and passes it to search_places(), so
-- in-area places rank first while everything else can still be found. Unset,
-- the whole US ranks equally. Chatter Snow's is set below: the five boroughs
-- and New Jersey.
--
-- Coarse location only, never an address; covered by the existing
-- registration-answer retention (rule C deletes a registration's answers).

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.event_registration_questions
  drop constraint event_registration_questions_kind_check,
  add constraint event_registration_questions_kind_check
    check (kind in ('single_choice', 'multi_choice', 'short_text', 'number', 'consent', 'place')),
  add column place_granularity text
    check (place_granularity in ('locality', 'neighborhood')),
  add column place_allow_other boolean not null default true,
  add constraint event_registration_questions_place_granularity_kind
    check ((kind = 'place') = (place_granularity is not null));

comment on column public.event_registration_questions.place_granularity is
  'For a place question (#1699): locality (city/town; NYC borough) or neighborhood (NYC NTA, else city/town). Null for every other kind.';
comment on column public.event_registration_questions.place_allow_other is
  'For a place question (#1699): whether "Not listed" with up to 200 characters of text is offered. Ignored for other kinds.';

-- The place kinds an answer may name, by granularity. States and counties are
-- what a service area is made of, never an answer.
create function public.place_answer_kinds(p_granularity text)
returns text[]
language sql
immutable
parallel safe
as $$
  select case p_granularity
    when 'locality' then array['locality', 'borough']
    when 'neighborhood' then array['locality', 'borough', 'neighborhood']
    else array[]::text[]
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. What the forms read: the two new columns, appended
-- ---------------------------------------------------------------------------

create or replace view public.public_event_registration_questions
with (security_barrier = true) as
select
  q.id,
  q.event_id,
  q.kind,
  q.prompt,
  q.help,
  q.required,
  q.sort_order,
  q.options,
  q.min_value,
  q.max_value,
  q.show_if,
  q.place_granularity,
  q.place_allow_other
from public.event_registration_questions q
join public.events e on e.id = q.event_id and e.tenant_id = q.tenant_id
where e.visibility = 'public'
  and e.status = 'published'
  and q.archived_at is null
  and q.tenant_id = public.public_tenant_id();

-- A changed result type needs a drop; the grants are re-issued below.
drop function public.my_registration_questions(uuid);

create function public.my_registration_questions(p_registration_id uuid)
returns table (
  question_id uuid,
  kind text,
  prompt text,
  help text,
  required boolean,
  options jsonb,
  min_value integer,
  max_value integer,
  show_if jsonb,
  place_granularity text,
  place_allow_other boolean,
  value jsonb,
  answer_text text,
  editable boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    q.id,
    q.kind,
    q.prompt,
    q.help,
    q.required,
    q.options,
    q.min_value,
    q.max_value,
    q.show_if,
    q.place_granularity,
    q.place_allow_other,
    mine.value,
    mine.answer_text,
    r.cancelled_at is null
      and coalesce(e.ends_at, e.starts_at + interval '1 day') > now()
  from public.event_registrations r
  join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
  join public.event_registration_questions q
    on q.event_id = e.id and q.tenant_id = e.tenant_id and q.archived_at is null
  left join public.event_registration_answers mine
    on mine.registration_id = r.id and mine.question_id = q.id
  where r.id = p_registration_id
    and r.person_id = public.my_constituent_person_id('events')
  order by q.sort_order, q.created_at;
$$;

comment on function public.my_registration_questions(uuid) is
  'The signed-in caller''s own answers to an event''s registration questions (#1501): each current question with their answer, and whether they can still change it -- until the event ends (#1591). Place questions carry their granularity and "Not listed" setting (#1699). No rows for a registration that is not theirs or an event with no questions.';

revoke execute on function public.my_registration_questions(uuid) from public, anon;
grant execute on function public.my_registration_questions(uuid) to authenticated;

create or replace function public.get_registration_answer_request(p_token_hash text, p_ip_address inet)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_result jsonb;
begin
  if not public.check_rate_limit('get_registration_answer_request', p_ip_address, 30, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  select * into v_request
    from public.resolve_registration_answer_request(p_token_hash, false);

  select jsonb_build_object(
           'event_id', e.id,
           'event_name', e.name,
           'first_name', nullif(split_part(btrim(reg.name), ' ', 1), ''),
           'expires_at', a.expires_at,
           'questions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'question_id', q.id,
                      'kind', q.kind,
                      'prompt', q.prompt,
                      'help', q.help,
                      'required', q.required,
                      'options', q.options,
                      'min_value', q.min_value,
                      'max_value', q.max_value,
                      'show_if', q.show_if,
                      'place_granularity', q.place_granularity,
                      'place_allow_other', q.place_allow_other,
                      'value', ans.value,
                      'answer_text', ans.answer_text
                    ) order by q.sort_order, q.created_at)
               from public.event_registration_questions q
               left join public.event_registration_answers ans
                 on ans.registration_id = reg.id and ans.question_id = q.id
              where q.event_id = e.id
                and q.tenant_id = e.tenant_id
                and q.archived_at is null
           ), '[]'::jsonb),
           -- #1647
           'contact', case
             when public.tenant_requires_instagram(reg.tenant_id) then
               jsonb_build_object(
                 'instagram_handle', reg.instagram_handle,
                 'has_no_instagram', reg.has_no_instagram,
                 'preferred_contact_method', reg.preferred_contact_method
               )
           end
         )
    into v_result
    from public.event_registration_answer_requests a
    join public.event_registrations reg
      on reg.id = a.registration_id and reg.tenant_id = a.tenant_id
    join public.events e
      on e.id = reg.event_id and e.tenant_id = reg.tenant_id
   where a.id = v_request.request_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Validating answers
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
  v_question record;
  v_value jsonb;
  v_parent jsonb;
  v_text text;
  v_number numeric;
  v_ids text[];
  v_place record;
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
    -- One level: the parent is never conditional itself, so its own answer
    -- is all there is to read.
    if v_question.show_if is not null then
      v_parent := v_answers -> (v_question.show_if->>'question_id');
      if v_parent is null
         or jsonb_typeof(v_parent) <> 'string'
         or not ((v_question.show_if->'option_ids') ? lower(v_parent #>> '{}')) then
        continue;
      end if;
    end if;

    v_value := v_answers -> (v_question.id::text);
    if v_value is not null and jsonb_typeof(v_value) = 'null' then
      v_value := null;
    end if;
    v_text := null;

    if v_value is not null then
      case v_question.kind
        when 'single_choice' then
          if jsonb_typeof(v_value) <> 'string' then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          if btrim(v_value #>> '{}') = '' then
            v_value := null;
          else
            select o->>'label' into v_text
              from jsonb_array_elements(v_question.options) o
             where o->>'id' = lower(v_value #>> '{}');
            if v_text is null then
              raise exception 'EVENT_ANSWERS_INVALID';
            end if;
            v_value := to_jsonb(lower(v_value #>> '{}'));
          end if;

        when 'multi_choice' then
          if jsonb_typeof(v_value) <> 'array'
             or exists (select 1 from jsonb_array_elements(v_value) e where jsonb_typeof(e) <> 'string') then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          select array_agg(distinct lower(e #>> '{}')) into v_ids
            from jsonb_array_elements(v_value) e;
          if v_ids is null then
            v_value := null;
          else
            if exists (
              select 1 from unnest(v_ids) as i(id)
               where not exists (
                 select 1 from jsonb_array_elements(v_question.options) o where o->>'id' = i.id
               )
            ) then
              raise exception 'EVENT_ANSWERS_INVALID';
            end if;
            -- In the question's own order, whatever order they arrived in.
            select string_agg(o.value->>'label', ', ' order by o.ordinality),
                   jsonb_agg(o.value->>'id' order by o.ordinality)
              into v_text, v_value
              from jsonb_array_elements(v_question.options) with ordinality as o(value, ordinality)
             where o.value->>'id' = any (v_ids);
          end if;

        when 'short_text' then
          if jsonb_typeof(v_value) <> 'string' then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          v_text := btrim(v_value #>> '{}');
          if v_text = '' then
            v_value := null;
          elsif char_length(v_text) > 500 then
            raise exception 'EVENT_ANSWERS_INVALID';
          else
            v_value := to_jsonb(v_text);
          end if;

        when 'number' then
          if jsonb_typeof(v_value) <> 'number' then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          v_number := (v_value #>> '{}')::numeric;
          if v_number <> trunc(v_number)
             or v_number not between -1000000 and 1000000
             or (v_question.min_value is not null and v_number < v_question.min_value)
             or (v_question.max_value is not null and v_number > v_question.max_value) then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          v_value := to_jsonb(v_number::integer);
          v_text := v_number::integer::text;

        when 'consent' then
          if jsonb_typeof(v_value) <> 'boolean' then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          v_text := case when v_value = 'true'::jsonb then 'Yes' else 'No' end;

        -- #1699. {"place_id": uuid} names a place of a kind the question's
        -- granularity allows, and is stored with that place's label as
        -- shown; {"other": text} is "Not listed", where the question offers
        -- it. Whatever label the client sent is ignored.
        when 'place' then
          if jsonb_typeof(v_value) <> 'object' then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          if v_value ? 'place_id' then
            if jsonb_typeof(v_value->'place_id') <> 'string'
               or lower(v_value->>'place_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
              raise exception 'EVENT_ANSWERS_INVALID';
            end if;
            select p.id, p.label into v_place
              from public.places p
             where p.id = (v_value->>'place_id')::uuid
               and p.kind = any (public.place_answer_kinds(v_question.place_granularity));
            if not found then
              raise exception 'EVENT_ANSWERS_INVALID';
            end if;
            v_value := jsonb_build_object('place_id', v_place.id, 'label', v_place.label);
            v_text := v_place.label;
          elsif v_value ? 'other' then
            if not v_question.place_allow_other
               or jsonb_typeof(v_value->'other') <> 'string' then
              raise exception 'EVENT_ANSWERS_INVALID';
            end if;
            v_text := btrim(v_value->>'other');
            if v_text = '' then
              v_value := null;
            elsif char_length(v_text) > 200 then
              raise exception 'EVENT_ANSWERS_INVALID';
            else
              v_value := jsonb_build_object('other', v_text);
            end if;
          else
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
      end case;
    end if;

    if v_value is null then
      if v_question.required and p_required then
        raise exception 'EVENT_ANSWERS_REQUIRED';
      end if;
      continue;
    end if;

    insert into public.event_registration_answers
      (tenant_id, registration_id, question_id, kind, prompt_as_shown, sort_order, value, answer_text)
    values
      (p_tenant_id, p_registration_id, v_question.id, v_question.kind, v_question.prompt,
       v_question.sort_order, v_value, v_text);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Setting the questions up
-- ---------------------------------------------------------------------------

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
  v_index integer := 0;
  v_id uuid;
  v_kind text;
  v_prompt text;
  v_help text;
  v_column_label text;
  v_required boolean;
  v_options jsonb;
  v_option jsonb;
  v_label text;
  v_min integer;
  v_max integer;
  v_shares boolean;
  v_granularity text;
  v_allow_other boolean;
  v_show_if jsonb;
  v_parent jsonb;
  v_option_ids jsonb;
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

    v_kind := v_question->>'kind';
    if v_kind is null or v_kind not in ('single_choice', 'multi_choice', 'short_text', 'number', 'consent', 'place') then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_prompt := btrim(coalesce(v_question->>'prompt', ''));
    if v_prompt = '' then
      raise exception 'EVENT_QUESTIONS_PROMPT_REQUIRED';
    end if;
    if char_length(v_prompt) > 300 then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_help := nullif(btrim(coalesce(v_question->>'help', '')), '');
    if char_length(v_help) > 500 then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    -- #1512. Optional; a key the caller leaves out clears it, like help.
    v_column_label := nullif(btrim(coalesce(v_question->>'column_label', '')), '');
    if char_length(v_column_label) > 24 then
      raise exception 'EVENT_QUESTIONS_COLUMN_LABEL_TOO_LONG';
    end if;

    -- A consent box is declinable by definition, so it is never required:
    -- an unticked box is the answer "no".
    v_required := v_kind <> 'consent' and coalesce(v_question->'required' = 'true'::jsonb, false);
    v_shares := v_kind = 'consent' and coalesce(v_question->'shares_contact' = 'true'::jsonb, false);

    -- Options: the two choice kinds need at least two, distinct by label.
    v_options := '[]'::jsonb;
    if v_kind in ('single_choice', 'multi_choice') then
      if jsonb_typeof(v_question->'options') is distinct from 'array'
         or jsonb_array_length(v_question->'options') < 2
         or jsonb_array_length(v_question->'options') > 20 then
        raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
      end if;
      for v_option in select value from jsonb_array_elements(v_question->'options') loop
        v_label := btrim(coalesce(v_option->>'label', ''));
        if jsonb_typeof(v_option) <> 'object'
           or coalesce(lower(v_option->>'id'), '') !~ v_uuid
           or v_label = '' or char_length(v_label) > 120 then
          raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
        end if;
        v_options := v_options || jsonb_build_array(
          jsonb_build_object('id', lower(v_option->>'id'), 'label', v_label)
        );
      end loop;
      if (select count(distinct o->>'id') from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options)
         or (select count(distinct lower(o->>'label')) from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options) then
        raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
      end if;
    end if;

    -- Bounds, for a number only.
    v_min := null;
    v_max := null;
    if v_kind = 'number' then
      if jsonb_typeof(v_question->'min_value') = 'number' then
        if (v_question->>'min_value')::numeric <> trunc((v_question->>'min_value')::numeric)
           or (v_question->>'min_value')::numeric not between -1000000 and 1000000 then
          raise exception 'EVENT_QUESTIONS_INVALID';
        end if;
        v_min := (v_question->>'min_value')::numeric::integer;
      elsif jsonb_typeof(v_question->'min_value') not in ('null') then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
      if jsonb_typeof(v_question->'max_value') = 'number' then
        if (v_question->>'max_value')::numeric <> trunc((v_question->>'max_value')::numeric)
           or (v_question->>'max_value')::numeric not between -1000000 and 1000000 then
          raise exception 'EVENT_QUESTIONS_INVALID';
        end if;
        v_max := (v_question->>'max_value')::numeric::integer;
      elsif jsonb_typeof(v_question->'max_value') not in ('null') then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
      if v_min is not null and v_max is not null and v_min > v_max then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
    end if;

    -- #1699. A place question's granularity, and whether "Not listed" is
    -- offered (on unless turned off).
    v_granularity := null;
    v_allow_other := true;
    if v_kind = 'place' then
      v_granularity := coalesce(v_question->>'place_granularity', 'locality');
      if v_granularity not in ('locality', 'neighborhood') then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
      v_allow_other := coalesce(v_question->'place_allow_other' <> 'false'::jsonb, true);
    end if;

    -- The condition: an EARLIER single-choice question of this save that is
    -- not conditional itself, and some of its options.
    v_show_if := null;
    if v_question->'show_if' is not null and jsonb_typeof(v_question->'show_if') <> 'null' then
      v_parent := v_seen -> lower(coalesce(v_question->'show_if'->>'question_id', ''));
      v_option_ids := v_question->'show_if'->'option_ids';
      if v_parent is null
         or v_parent->>'kind' <> 'single_choice'
         or (v_parent->>'conditional')::boolean
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
        raise exception 'EVENT_QUESTIONS_CONDITION_INVALID';
      end if;
      v_show_if := jsonb_build_object(
        'question_id', lower(v_question->'show_if'->>'question_id'),
        'option_ids', (select jsonb_agg(distinct lower(i #>> '{}')) from jsonb_array_elements(v_option_ids) i)
      );
    end if;

    update public.event_registration_questions
       set kind = v_kind,
           prompt = v_prompt,
           help = v_help,
           column_label = v_column_label,
           required = v_required,
           sort_order = v_index,
           options = v_options,
           min_value = v_min,
           max_value = v_max,
           show_if = v_show_if,
           shares_contact = v_shares,
           place_granularity = v_granularity,
           place_allow_other = v_allow_other,
           archived_at = null,
           updated_at = now()
     where id = v_id
       and event_id = p_event_id
       and tenant_id = v_tenant_id;

    if not found then
      begin
        insert into public.event_registration_questions
          (id, tenant_id, event_id, kind, prompt, help, column_label, required, sort_order,
           options, min_value, max_value, show_if, shares_contact, place_granularity, place_allow_other)
        values
          (v_id, v_tenant_id, p_event_id, v_kind, v_prompt, v_help, v_column_label, v_required, v_index,
           v_options, v_min, v_max, v_show_if, v_shares, v_granularity, v_allow_other);
      exception when unique_violation then
        -- The id belongs to another event's question.
        raise exception 'EVENT_QUESTIONS_INVALID';
      end;
    end if;

    v_seen := v_seen || jsonb_build_object(v_id::text, jsonb_build_object(
      'kind', v_kind, 'options', v_options, 'conditional', v_show_if is not null
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

-- ---------------------------------------------------------------------------
-- 5. The service area
-- ---------------------------------------------------------------------------

-- The ids stored under registration.service_area, as an array; empty when
-- unset or not an array.
create function public.tenant_service_area(p_tenant_id uuid)
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select array_agg((e #>> '{}')::uuid)
      from public.app_settings s, jsonb_array_elements(s.value) e
     where s.tenant_id = p_tenant_id
       and s.key = 'registration.service_area'
       and jsonb_typeof(s.value) = 'array'
  ), '{}');
$$;

comment on function public.tenant_service_area(uuid) is
  'The places a tenant serves (#1699): the registration.service_area app setting as place ids, empty when unset. Internal; the public form reads public_registration_settings and the portal registration_service_area().';

revoke execute on function public.tenant_service_area(uuid) from public, anon, authenticated;

-- 20261021180000's view with one more column, appended so `create or replace`
-- keeps the grants. Inlined rather than calling the function above, for the
-- reason 20260923140000 gives: a view checks EXECUTE against its caller.
create or replace view public.public_registration_settings as
select coalesce(
         (select (s.value)::boolean
            from public.app_settings s
           where s.tenant_id = t.id
             and s.key = 'registration.asks_about_minors'
             and jsonb_typeof(s.value) = 'boolean'),
         true
       ) as asks_about_minors,
       coalesce(
         (select (s.value)::boolean
            from public.app_settings s
           where s.tenant_id = t.id
             and s.key = 'registration.requires_instagram'
             and jsonb_typeof(s.value) = 'boolean'),
         false
       ) as requires_instagram,
       coalesce(
         (select array_agg((e #>> '{}')::uuid)
            from public.app_settings s, jsonb_array_elements(s.value) e
           where s.tenant_id = t.id
             and s.key = 'registration.service_area'
             and jsonb_typeof(s.value) = 'array'),
         '{}'
       ) as service_area
  from public.tenants t
 where t.id = public.public_tenant_id();

comment on view public.public_registration_settings is
  'The resolved tenant''s registration settings for the public form: whether it asks about under-18s (#1416, true unless turned off), whether it requires an Instagram handle or a preferred contact (#1647, false unless turned on), and the place ids of its service area (#1699, empty unless set). Security definer by design (#887): app_settings has no anon policy. Isolation is t.id = public_tenant_id().';

alter view public.public_registration_settings set (security_barrier = true);

-- For the portal's Registration sheet: the service area's places with their
-- labels, or null when the caller may not change it.
create function public.registration_service_area()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('events', 'manage') then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'label', p.label) order by p.label)
        from public.places p
       where p.id = any (public.tenant_service_area((select public.current_tenant_id())))
    ), '[]'::jsonb)
  end;
$$;

comment on function public.registration_service_area() is
  'The current tenant''s service area (#1699) as [{id, kind, label}], or null when the caller may not change it (events:manage). Security definer by design (#887): app_settings'' select policy requires one of six manage permissions. Isolation is current_tenant_id().';

revoke execute on function public.registration_service_area() from public, anon;
grant execute on function public.registration_service_area() to authenticated;

-- Replaces the service area. Every id must be a state, county or borough;
-- at most 50; an empty list clears the setting.
create function public.set_registration_service_area(p_place_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_ids uuid[];
begin
  if not public.has_permission('events', 'manage') or v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  select coalesce(array_agg(distinct i), '{}') into v_ids
    from unnest(coalesce(p_place_ids, '{}')) i
   where i is not null;

  if cardinality(v_ids) > 50 then
    raise exception 'SERVICE_AREA_TOO_LARGE';
  end if;
  if (select count(*) from public.places p
       where p.id = any (v_ids) and p.kind in ('state', 'county', 'borough')) <> cardinality(v_ids) then
    raise exception 'SERVICE_AREA_INVALID';
  end if;

  if cardinality(v_ids) = 0 then
    delete from public.app_settings
     where tenant_id = v_tenant_id and key = 'registration.service_area';
    return;
  end if;

  insert into public.app_settings (tenant_id, key, value, updated_by)
  values (v_tenant_id, 'registration.service_area', to_jsonb(v_ids), auth.uid())
  on conflict (tenant_id, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

comment on function public.set_registration_service_area(uuid[]) is
  'Replaces the current tenant''s registration service area (#1699): up to 50 states, counties or boroughs; empty clears it. Raises PERMISSION_DENIED, SERVICE_AREA_TOO_LARGE, SERVICE_AREA_INVALID. Gated on events:manage. Audit-logged by the app_settings trigger.';

revoke execute on function public.set_registration_service_area(uuid[]) from public, anon;
grant execute on function public.set_registration_service_area(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Chatter Snow's service area: the five boroughs and New Jersey
-- ---------------------------------------------------------------------------

-- Scoped by slug (docs/tenants.md): on a fresh local or CI database this
-- finds no tenant and writes nothing. Its "Borough" question is switched to
-- `place` by staff in the editor, not here, since staff created it there
-- (#1512).
insert into public.app_settings (tenant_id, key, value)
select t.id, 'registration.service_area', to_jsonb(array[
         public.place_key_id('county:36005'),
         public.place_key_id('county:36047'),
         public.place_key_id('county:36061'),
         public.place_key_id('county:36081'),
         public.place_key_id('county:36085'),
         public.place_key_id('state:34')
       ])
  from public.tenants t
 where t.slug = 'chatter-snow'
on conflict (tenant_id, key) do nothing;
