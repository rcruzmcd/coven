-- A recurring series that features a random Gear Library item (#1841, part of
-- #1835, follows #1840).
--
--   1. social_post_series.content_source: 'template' (every post copies the
--      template, as before) or 'random_gear_item' (each post also features one
--      Gear Library item). recent_exclusion_count is how many of the series'
--      latest posts an item must not have been featured in to be picked again.
--      no_gear_occurrences records dates skipped because nothing qualified.
--   2. content_opportunities.featured_inventory_item_id: the item a post
--      features, and featured_media_id: the copy of its photo in the post's
--      own media, which a swap replaces.
--   3. social_post_gear_pick(): the one place the pick rules live, used by the
--      generator and by "Pick another".
--   4. generate_social_post_series_posts() picks for a gear series and returns
--      the posts it made, so the cron can fill in each caption and photo.
--   5. social_post_gear_items() and set_social_post_featured_gear(): what the
--      post page reads and writes to show and swap the pick.
--
-- An item qualifies when it is in the public Gear Library -- public_gear_catalog's
-- criteria, status 'available' and intended_use 'gear_library' -- and has a
-- photo. The caption and the photo copy are written by the app
-- (src/lib/social-content/series-gear.ts), which has the tenant's site origin
-- for the item link and storage access for the photo.
--
-- generate_social_post_series_posts() changes its return type, so it is
-- dropped and re-created; only development's cron (#1840) calls it, and main
-- does not have that code. Everything else is additive.
-- Tenant: no rows are written.

-- ---------------------------------------------------------------------------
-- 1. What a series' posts feature
-- ---------------------------------------------------------------------------

alter table public.social_post_series
  add column content_source text not null default 'template'
    constraint social_post_series_content_source_check
      check (content_source in ('template', 'random_gear_item')),
  add column recent_exclusion_count integer not null default 8
    constraint social_post_series_recent_exclusion_count_check
      check (recent_exclusion_count between 0 and 52),
  add column no_gear_occurrences date[] not null default '{}';

comment on column public.social_post_series.content_source is
  'What each new post features (#1841): ''template'' copies the template only; ''random_gear_item'' also picks an available Gear Library item with a photo and fills the caption and photo from it.';
comment on column public.social_post_series.recent_exclusion_count is
  'A random_gear_item series does not pick an item featured in its latest this-many posts, unless every candidate was (#1841).';
comment on column public.social_post_series.no_gear_occurrences is
  'Dates a random_gear_item series skipped because no available Gear Library item had a photo (#1841). Newest 20, ascending.';

-- ---------------------------------------------------------------------------
-- 2. What a post features
-- ---------------------------------------------------------------------------

alter table public.content_opportunities
  add column featured_inventory_item_id uuid,
  add column featured_media_id uuid,
  add constraint content_opportunities_featured_inventory_item_fkey
    foreign key (tenant_id, featured_inventory_item_id)
    references public.inventory_items (tenant_id, id)
    on delete set null (featured_inventory_item_id),
  add constraint content_opportunities_featured_media_fkey
    foreign key (featured_media_id)
    references public.social_post_media (id)
    on delete set null;

create index content_opportunities_featured_item_idx
  on public.content_opportunities (series_id, occurrence_date desc)
  where series_id is not null and featured_inventory_item_id is not null;
create index content_opportunities_featured_inventory_item_idx
  on public.content_opportunities (featured_inventory_item_id)
  where featured_inventory_item_id is not null;
create index content_opportunities_featured_media_idx
  on public.content_opportunities (featured_media_id)
  where featured_media_id is not null;

comment on column public.content_opportunities.featured_inventory_item_id is
  'The Gear Library item this post features (#1841), picked by its random_gear_item series or swapped by hand. Cleared when the item is deleted.';
comment on column public.content_opportunities.featured_media_id is
  'The post''s copy of the featured item''s photo (#1841), which a swap replaces. Cleared when that media is deleted.';

-- ---------------------------------------------------------------------------
-- 3. The pick
-- ---------------------------------------------------------------------------

create function public.inventory_item_is_featurable(p_item public.inventory_items)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_item.status = 'available'
     and p_item.intended_use = 'gear_library'
     and nullif(btrim(coalesce(p_item.photo_url, '')), '') is not null;
$$;

comment on function public.inventory_item_is_featurable(public.inventory_items) is
  'Whether a social post may feature this item (#1841): in the public Gear Library (public_gear_catalog''s criteria) and with a photo.';

-- A random qualifying item for a post of `p_series_id`. Items featured in the
-- series' latest recent_exclusion_count posts (other than `p_post_id`) are
-- passed over; when every candidate was, the one featured longest ago is
-- taken. `p_exclude_item` is never returned ("Pick another"). Null when
-- nothing qualifies. Internal: no grants, called by the definer functions
-- below, which have already decided the caller may.
create function public.social_post_gear_pick(
  p_series_id uuid,
  p_post_id uuid default null,
  p_exclude_item uuid default null
)
returns uuid
language sql
volatile
set search_path = ''
as $$
  with series as (
    select s.tenant_id, s.recent_exclusion_count
      from public.social_post_series s
     where s.id = p_series_id
  ),
  recent as (
    select o.featured_inventory_item_id as item_id,
           row_number() over (order by o.occurrence_date desc) as age
      from public.content_opportunities o
     where o.series_id = p_series_id
       and o.id is distinct from p_post_id
     order by o.occurrence_date desc
     limit (select recent_exclusion_count from series)
  ),
  last_featured as (
    select item_id, min(age) as age
      from recent
     where item_id is not null
     group by item_id
  )
  select i.id
    from public.inventory_items i
    join series on series.tenant_id = i.tenant_id
    left join last_featured f on f.item_id = i.id
   where public.inventory_item_is_featurable(i)
     and i.id is distinct from p_exclude_item
   order by f.age is not null, f.age desc, random()
   limit 1;
$$;

revoke all on function public.social_post_gear_pick(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.inventory_item_is_featurable(public.inventory_items) from public, anon;
grant execute on function public.inventory_item_is_featurable(public.inventory_items) to authenticated, service_role;

comment on function public.social_post_gear_pick(uuid, uuid, uuid) is
  'A random featurable Gear Library item for a post of the series (#1841), avoiding items featured in its latest recent_exclusion_count posts unless nothing else qualifies. Internal.';

-- ---------------------------------------------------------------------------
-- 4. The generator picks for a gear series
-- ---------------------------------------------------------------------------

drop function public.generate_social_post_series_posts(uuid, jsonb, date[], date);

-- As 20261122100000, plus: a random_gear_item series picks an item for each
-- post; a date with nothing to pick is not created and is recorded in
-- no_gear_occurrences. Returns the posts created, [{id, featured_inventory_item_id}],
-- so the cron can fill in each one's caption and photo.
create function public.generate_social_post_series_posts(
  p_series_id uuid,
  p_posts jsonb,
  p_missed date[],
  p_through date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.social_post_series;
  v_post record;
  v_post_id uuid;
  v_item_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_no_gear date[] := '{}';
  v_missed date[];
  v_kept_no_gear date[];
  v_through date;
begin
  select * into v_series
    from public.social_post_series
   where id = p_series_id
     for update;
  if not found or v_series.paused_at is not null or v_series.ended_at is not null then
    return '[]'::jsonb;
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
    v_item_id := null;
    if v_series.content_source = 'random_gear_item' then
      if exists (
        select 1 from public.content_opportunities existing
         where existing.series_id = v_series.id
           and existing.occurrence_date = v_post.occurrence_date
      ) then
        continue;
      end if;
      v_item_id := public.social_post_gear_pick(v_series.id);
      if v_item_id is null then
        v_no_gear := v_no_gear || v_post.occurrence_date;
        continue;
      end if;
    end if;

    insert into public.content_opportunities (
      tenant_id, series_id, occurrence_date,
      title, content, post_format, collaborator_handles, internal_notes,
      owner_id, reviewer_id, calendar_item_id, event_id,
      lead_time_days, publish_due_at, review_due_at, draft_due_at,
      content_status, status_changed_at, status_changed_by, created_by,
      featured_inventory_item_id
    ) values (
      v_series.tenant_id, v_series.id, v_post.occurrence_date,
      v_series.title, v_series.content, v_series.post_format,
      v_series.collaborator_handles, v_series.internal_notes,
      v_series.owner_id, v_series.reviewer_id, v_series.calendar_item_id, v_series.event_id,
      v_series.lead_time_days, v_post.publish_due_at, v_post.review_due_at, v_post.draft_due_at,
      case when v_series.auto_approve then 'approved' else 'draft' end, now(), null, null,
      v_item_id
    )
    on conflict (series_id, occurrence_date) do nothing
    returning id into v_post_id;

    if v_post_id is not null then
      v_created := v_created || jsonb_build_object(
        'id', v_post_id,
        'featured_inventory_item_id', v_item_id
      );

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

  select coalesce(array_agg(kept.day order by kept.day), '{}')
    into v_kept_no_gear
    from (
      select distinct day
        from unnest(v_series.no_gear_occurrences || v_no_gear) as day
       order by day desc
       limit 20
    ) kept;

  v_through := greatest(v_series.generated_through, p_through);

  -- Only when something moved: every write here is an audit row.
  if v_through is distinct from v_series.generated_through
     or v_missed is distinct from v_series.missed_occurrences
     or v_kept_no_gear is distinct from v_series.no_gear_occurrences then
    update public.social_post_series
       set generated_through = v_through,
           missed_occurrences = v_missed,
           no_gear_occurrences = v_kept_no_gear
     where id = v_series.id;
  end if;

  return v_created;
end;
$$;

comment on function public.generate_social_post_series_posts(uuid, jsonb, date[], date) is
  'Creates a recurring series'' due posts from its template (#1840), picking a Gear Library item for each in a random_gear_item series and skipping a date with none (#1841), skips dates that already have a post, records missed dates and advances generated_through. Returns the posts created. Service role only: called by the social-post-series cron.';

revoke all on function public.generate_social_post_series_posts(uuid, jsonb, date[], date) from public, anon, authenticated;
grant execute on function public.generate_social_post_series_posts(uuid, jsonb, date[], date) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Showing and swapping the pick
-- ---------------------------------------------------------------------------

-- The items a post can feature, plus the one it features now even if it no
-- longer qualifies. Definer, because content_calendar may be granted without
-- inventory; what it returns is what the public catalog already shows, plus
-- the status of an item the post itself names.
create function public.social_post_gear_items(p_post_id uuid)
returns table (
  id uuid,
  description text,
  size text,
  condition text,
  category_label text,
  photo_url text,
  status text,
  qualifies boolean,
  featured boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with post as (
    select o.tenant_id, o.featured_inventory_item_id
      from public.content_opportunities o
     where o.id = p_post_id
       and o.tenant_id = (select public.current_tenant_id())
       and public.has_permission('content_calendar', 'view')
  )
  select i.id, i.description, i.size, i.condition, c.label, i.photo_url, i.status,
         public.inventory_item_is_featurable(i),
         i.id = post.featured_inventory_item_id
    from post
    join public.inventory_items i on i.tenant_id = post.tenant_id
    left join public.inventory_categories c on c.id = i.category_id
   where public.inventory_item_is_featurable(i)
      or i.id = post.featured_inventory_item_id
   order by i.description, i.id;
$$;

comment on function public.social_post_gear_items(uuid) is
  'The Gear Library items a social post can feature, and the one it features now (#1841). Requires content_calendar view.';

revoke all on function public.social_post_gear_items(uuid) from public, anon;
grant execute on function public.social_post_gear_items(uuid) to authenticated;

-- Swaps the item a post features: `p_item_id`, or a random pick other than the
-- current one when null. The post keeps its status. Refused on a published post
-- and on a post whose series does not feature gear. Returns the new item id.
-- Definer so it can read inventory without an inventory grant; the update is
-- attributed to the caller in the audit log through auth.uid().
create function public.set_social_post_featured_gear(
  p_post_id uuid,
  p_item_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_post public.content_opportunities;
  v_source text;
  v_item_id uuid;
begin
  if v_tenant_id is null or not public.has_permission('content_calendar', 'manage') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_post
    from public.content_opportunities
   where id = p_post_id
     and tenant_id = v_tenant_id
     for update;
  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;
  if v_post.content_status = 'published' then
    raise exception 'POST_PUBLISHED';
  end if;

  select s.content_source into v_source
    from public.social_post_series s
   where s.id = v_post.series_id;
  if v_source is distinct from 'random_gear_item' then
    raise exception 'NOT_GEAR_POST';
  end if;

  if p_item_id is null then
    v_item_id := public.social_post_gear_pick(
      v_post.series_id, v_post.id, v_post.featured_inventory_item_id
    );
    if v_item_id is null then
      raise exception 'NO_GEAR_AVAILABLE';
    end if;
  else
    select i.id into v_item_id
      from public.inventory_items i
     where i.id = p_item_id
       and i.tenant_id = v_tenant_id
       and public.inventory_item_is_featurable(i);
    if v_item_id is null then
      raise exception 'ITEM_NOT_ELIGIBLE';
    end if;
  end if;

  update public.content_opportunities
     set featured_inventory_item_id = v_item_id,
         updated_by = auth.uid()
   where id = v_post.id;

  return v_item_id;
end;
$$;

comment on function public.set_social_post_featured_gear(uuid, uuid) is
  'Swaps the Gear Library item a post of a random_gear_item series features (#1841): the given item or a new random pick. Keeps the post''s status; refused once published. Requires content_calendar manage.';

revoke all on function public.set_social_post_featured_gear(uuid, uuid) from public, anon;
grant execute on function public.set_social_post_featured_gear(uuid, uuid) to authenticated;
