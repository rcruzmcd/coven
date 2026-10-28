-- Where registrants come from (#1701, part of #1698)
-- ---------------------------------------------------------------------------
--
-- Breakdowns of `place` answers (#1699): the event detail page's "Where
-- registrants come from" card, the place reach on the Results card and the
-- Program Impact Report, and the carpool board's place filter. Every count is
-- derived from answers, never typed.
--
-- THE REGION of a place is what a breakdown groups it under first: the
-- county or NYC borough it lies in, or its state where the Census gives it no
-- county (a Connecticut place, a place spanning counties with none recorded).
-- A county, borough or state is its own region. One definition,
-- place_regions(), read by both RPCs here and by the registrants list.
--
-- WHAT COUNTS. An answer counts under its stored place_id when that place
-- still exists. Anything else -- "Not listed" text, or an id the dataset no
-- longer has -- counts as Other. Answers to a question since deleted
-- (question_id null) still count toward the reach figures, which cover every
-- place answer the event holds; the event card groups by current question.
-- Cancelled registrations count nowhere, as in every impact figure (#1418).

-- ---------------------------------------------------------------------------
-- 1. place_regions(): a place's region
-- ---------------------------------------------------------------------------

create function public.place_regions(p_place_ids uuid[])
returns table (
  place_id uuid,
  place_kind text,
  place_label text,
  region_id uuid,
  region_kind text,
  region_label text
)
language sql
stable
set search_path = public
as $$
  select p.id, p.kind, p.label, r.id, r.kind, r.label
    from public.places p
    cross join lateral (
      select a.id, a.kind, a.label
        from public.places a
       where a.id = any (p.area_ids || p.id)
         and a.kind in ('county', 'borough', 'state')
       order by
         -- The place itself when it is one, then its own parent, then any
         -- other county it spans, then the state.
         (a.id = p.id) desc,
         (a.kind <> 'state') desc,
         (a.id = p.parent_id) desc,
         a.label
       limit 1
    ) r
   where p.id = any (p_place_ids);
$$;

comment on function public.place_regions(uuid[]) is
  'Each place''s region (#1701): the county or NYC borough it lies in, else its state; a county, borough or state is its own. What place breakdowns group by first. Reads only the public places table, so it runs as the caller.';

revoke execute on function public.place_regions(uuid[]) from public;
grant execute on function public.place_regions(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. place_answer_counts(): the internal aggregate
-- ---------------------------------------------------------------------------

-- Registrations per (question, place) over a set of events, with the place's
-- region. place_id null is Other. Not granted to any client role: the two
-- RPCs below check permission and pass the tenant's own event ids.
create function public.place_answer_counts(p_tenant_id uuid, p_event_ids uuid[])
returns table (
  question_id uuid,
  place_id uuid,
  place_kind text,
  place_label text,
  region_id uuid,
  region_kind text,
  region_label text,
  registrations bigint
)
language sql
stable
set search_path = public
as $$
  with answers as (
    select a.question_id,
           a.registration_id,
           case
             when jsonb_typeof(a.value -> 'place_id') = 'string'
              and (a.value ->> 'place_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then (a.value ->> 'place_id')::uuid
           end as answered_place_id
      from public.event_registration_answers a
      join public.event_registrations r
        on r.id = a.registration_id and r.tenant_id = a.tenant_id
     where a.tenant_id = p_tenant_id
       and a.kind = 'place'
       and r.event_id = any (p_event_ids)
       and r.cancelled_at is null
  ),
  resolved as (
    select ans.question_id, ans.registration_id, pr.*
      from answers ans
      left join public.place_regions(
        (select array_agg(distinct answered_place_id) from answers)
      ) pr on pr.place_id = ans.answered_place_id
  )
  select question_id, place_id, place_kind, place_label,
         region_id, region_kind, region_label,
         count(distinct registration_id)
    from resolved
   group by question_id, place_id, place_kind, place_label,
            region_id, region_kind, region_label;
$$;

comment on function public.place_answer_counts(uuid, uuid[]) is
  'Internal (#1701): registrations per question and place over a tenant''s events, each place with its place_regions() region; place_id null counts "Not listed" text and places the dataset no longer has. Cancelled registrations are left out. Called only by get_event_place_breakdown() and get_program_place_reach(), which check permission.';

revoke execute on function public.place_answer_counts(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The RPCs
-- ---------------------------------------------------------------------------

-- Security definer for the reason get_event_impact_derived_data() is: the
-- board role reads the Results card on event_impact: view without events:
-- view, and answers are readable only at events: view.
create function public.get_event_place_breakdown(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
begin
  if not (public.has_permission('events', 'view')
          or public.has_permission('event_impact', 'view')) then
    raise exception 'Not authorized to view event impact figures';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'question_id', c.question_id,
             'place_id', c.place_id,
             'place_kind', c.place_kind,
             'place_label', c.place_label,
             'region_id', c.region_id,
             'region_kind', c.region_kind,
             'region_label', c.region_label,
             'registrations', c.registrations
           ))
      from public.place_answer_counts(
             v_tenant_id,
             array(select e.id from public.events e
                    where e.id = p_event_id and e.tenant_id = v_tenant_id)
           ) c
  ), '[]'::jsonb);
end;
$$;

comment on function public.get_event_place_breakdown(uuid) is
  'Where an event''s registrants come from (#1701): registrations per place question, place and region, from place answers on registrations that were not cancelled. Requires events: view or event_impact: view. Rows of place_answer_counts() as a jsonb array.';

revoke execute on function public.get_event_place_breakdown(uuid) from public, anon;
grant execute on function public.get_event_place_breakdown(uuid) to authenticated;

create function public.get_program_place_reach(p_program_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
begin
  if not public.has_permission('programs_reports', 'view') then
    raise exception 'Not authorized to view program impact reports';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'question_id', c.question_id,
             'place_id', c.place_id,
             'place_kind', c.place_kind,
             'place_label', c.place_label,
             'region_id', c.region_id,
             'region_kind', c.region_kind,
             'region_label', c.region_label,
             'registrations', c.registrations
           ))
      from public.place_answer_counts(
             v_tenant_id,
             array(select ep.event_id from public.event_programs ep
                    where ep.program_id = p_program_id and ep.tenant_id = v_tenant_id)
           ) c
  ), '[]'::jsonb);
end;
$$;

comment on function public.get_program_place_reach(uuid) is
  'Where a program''s registrants come from (#1701): get_event_place_breakdown()''s rows over every event tagged to the program. Requires programs_reports: view, as get_program_impact_rollup_data() does.';

revoke execute on function public.get_program_place_reach(uuid) from public, anon;
grant execute on function public.get_program_place_reach(uuid) to authenticated;
