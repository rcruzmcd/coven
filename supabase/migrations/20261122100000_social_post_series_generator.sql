-- The scheduled generator for recurring social posts (#1840, part of #1835).
--
-- A daily cron (/api/cron/social-post-series) creates each active series'
-- next posts once they are inside its lead time. The dates are computed in
-- TypeScript (src/lib/social-content/series.ts), the same code the post page
-- previews them with; this function only writes them.
--
--   1. content_opportunities.created_by may be null: a post the generator
--      creates has no person behind it, the same as status_changed_by. The
--      audit log shows such a row as "System", and its series_id says which
--      series made it.
--   2. social_post_series.generated_through: the last date the generator has
--      dealt with, so each run starts after it rather than at the anchor.
--      social_post_series.missed_occurrences: dates the generator reached only
--      after their publish time had passed (a missed run, or a pause), which
--      it does not create. The newest 20 are kept.
--   3. generate_social_post_series_posts(): one series' posts and their tags
--      in one transaction, for the service role only.
--
-- Duplicates are prevented by content_opportunities_series_occurrence_key
-- (series_id, occurrence_date): the insert skips a date that already has a
-- post, so re-runs and overlapping runs create nothing twice.
--
-- Additive only, because production runs main. Tenant: no rows are written.

-- ---------------------------------------------------------------------------
-- 1. A generated post has no creator
-- ---------------------------------------------------------------------------

alter table public.content_opportunities
  alter column created_by drop not null;

-- ---------------------------------------------------------------------------
-- 2. Where the generator got to, and what it missed
-- ---------------------------------------------------------------------------

alter table public.social_post_series
  add column generated_through date,
  add column missed_occurrences date[] not null default '{}';

comment on column public.social_post_series.generated_through is
  'The last occurrence date the generator (#1840) has dealt with, created or missed. Null until its first run; the next run starts the day after.';
comment on column public.social_post_series.missed_occurrences is
  'Dates the generator (#1840) did not create because their publish time had passed before it reached them (a missed run or a pause). Newest 20, ascending.';

-- ---------------------------------------------------------------------------
-- 3. Writing one series' posts
-- ---------------------------------------------------------------------------

-- `p_posts`: [{occurrence_date, publish_due_at, review_due_at, draft_due_at}].
-- `p_missed`: dates whose publish time has passed; any that already has a
-- post (the anchor, or one made by an earlier run) is not recorded.
-- `p_through`: the last date this run dealt with.
--
-- The series is re-read under a row lock, so a series paused or ended after
-- the cron read it creates nothing, and two runs on one series take turns.
-- Each post copies the template as it is now; it starts `approved` when the
-- series auto-approves and `draft` otherwise. Tags naming a person who has
-- since been deleted are dropped rather than failing the post.
--
-- Security definer for the service role: there is no session, so
-- has_permission() and the tenant RLS would refuse every write. The tenant
-- is the series' own, never the caller's.
create function public.generate_social_post_series_posts(
  p_series_id uuid,
  p_posts jsonb,
  p_missed date[],
  p_through date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.social_post_series;
  v_post record;
  v_post_id uuid;
  v_created integer := 0;
  v_missed date[];
  v_through date;
begin
  select * into v_series
    from public.social_post_series
   where id = p_series_id
     for update;
  if not found or v_series.paused_at is not null or v_series.ended_at is not null then
    return 0;
  end if;

  for v_post in
    select *
      from jsonb_to_recordset(coalesce(p_posts, '[]'::jsonb)) as p(
        occurrence_date date,
        publish_due_at timestamptz,
        review_due_at timestamptz,
        draft_due_at timestamptz
      )
     order by p.occurrence_date
  loop
    insert into public.content_opportunities (
      tenant_id, series_id, occurrence_date,
      title, content, post_format, collaborator_handles, internal_notes,
      owner_id, reviewer_id, calendar_item_id, event_id,
      lead_time_days, publish_due_at, review_due_at, draft_due_at,
      content_status, status_changed_at, status_changed_by, created_by
    ) values (
      v_series.tenant_id, v_series.id, v_post.occurrence_date,
      v_series.title, v_series.content, v_series.post_format,
      v_series.collaborator_handles, v_series.internal_notes,
      v_series.owner_id, v_series.reviewer_id, v_series.calendar_item_id, v_series.event_id,
      v_series.lead_time_days, v_post.publish_due_at, v_post.review_due_at, v_post.draft_due_at,
      case when v_series.auto_approve then 'approved' else 'draft' end, now(), null, null
    )
    on conflict (series_id, occurrence_date) do nothing
    returning id into v_post_id;

    if v_post_id is not null then
      v_created := v_created + 1;

      insert into public.social_post_tags (tenant_id, content_opportunity_id, person_id, handle, position, created_by)
      select v_series.tenant_id,
             v_post_id,
             tag.person_id,
             tag.handle,
             (row_number() over (order by tag.ordinality) - 1)::integer,
             null
        from (
          select nullif(t.value ->> 'person_id', '')::uuid as person_id,
                 nullif(t.value ->> 'handle', '') as handle,
                 t.ordinality
            from jsonb_array_elements(v_series.tags) with ordinality as t(value, ordinality)
        ) tag
       where tag.handle is not null
          or exists (
            select 1 from public.people person
             where person.tenant_id = v_series.tenant_id
               and person.id = tag.person_id
          );

      v_post_id := null;
    end if;
  end loop;

  select coalesce(array_agg(kept.day order by kept.day), '{}')
    into v_missed
    from (
      select candidates.day
        from (
          select distinct day
            from unnest(v_series.missed_occurrences || coalesce(p_missed, '{}')) as day
           where not exists (
             select 1 from public.content_opportunities existing
              where existing.series_id = v_series.id
                and existing.occurrence_date = day
           )
        ) candidates
       order by candidates.day desc
       limit 20
    ) kept;
  v_through := greatest(v_series.generated_through, p_through);

  -- Only when something moved: every write here is an audit row.
  if v_through is distinct from v_series.generated_through
     or v_missed is distinct from v_series.missed_occurrences then
    update public.social_post_series
       set generated_through = v_through,
           missed_occurrences = v_missed
     where id = v_series.id;
  end if;

  return v_created;
end;
$$;

comment on function public.generate_social_post_series_posts(uuid, jsonb, date[], date) is
  'Creates a recurring series'' due posts from its template (#1840), skipping dates that already have one, records missed dates and advances generated_through. Service role only: called by the social-post-series cron.';

revoke all on function public.generate_social_post_series_posts(uuid, jsonb, date[], date) from public, anon, authenticated;
grant execute on function public.generate_social_post_series_posts(uuid, jsonb, date[], date) to service_role;
