-- Recurring social posts (#1839, part of #1835).
--
-- A series repeats one post weekly, every two weeks or monthly. It is made
-- from a post that has a publish date: that post is the series' first
-- occurrence, its publish date the anchor every later date is counted from,
-- and its content the template the next posts are copied from.
--
--   1. social_post_series: the cadence, the template, and the workflow
--      settings (lead time, auto-approve, paused, ended).
--   2. content_opportunities.series_id and .occurrence_date: which series a
--      post was made by, and which of its dates it fills. One post per date
--      per series, so whatever creates the posts (#1840) can run twice and
--      create nothing the second time.
--
-- Nothing here creates posts; the scheduled generator is #1840.
--
-- Dates: the series repeats a wall-clock time in its own `time_zone` (the
-- tenant's zone when made), so a 9:00 post stays at 9:00 across DST. The
-- weekday (weekly, biweekly) and day of month (monthly) are the anchor's, so
-- there is no second copy of them to disagree; a monthly series anchored on
-- the 29th-31st lands on the month's last day in a shorter month.
--
-- An occurrence keeps its occurrence_date when someone moves its publish
-- date by hand: the date says which slot it fills, not when it goes out.
--
-- Access is the `content_calendar` resource, as for the post itself: view to
-- read, manage to change. Additive only, because production runs main.
-- Tenant: no rows are written.

-- ---------------------------------------------------------------------------
-- 1. Series
-- ---------------------------------------------------------------------------

create table public.social_post_series (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),

  cadence text not null
    constraint social_post_series_cadence_check
      check (cadence in ('weekly', 'biweekly', 'monthly')),
  anchor_date date not null,
  publish_time time not null,
  time_zone text not null,
  ends_on date
    constraint social_post_series_ends_on_check check (ends_on is null or ends_on >= anchor_date),

  lead_time_days integer not null
    constraint social_post_series_lead_time_days_check check (lead_time_days > 0),
  auto_approve boolean not null default false,
  paused_at timestamptz,
  ended_at timestamptz,

  -- The template: what each new post starts from.
  title text not null constraint social_post_series_title_check check (btrim(title) <> ''),
  content text,
  post_format text
    constraint social_post_series_post_format_check
      check (post_format in ('instagram_post', 'instagram_reel', 'instagram_story')),
  collaborator_handles text[] not null default '{}',
  tags jsonb not null default '[]'
    constraint social_post_series_tags_check check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 20),
  internal_notes text,
  owner_id uuid,
  reviewer_id uuid,
  calendar_item_id uuid,
  event_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,

  unique (tenant_id, id),
  constraint social_post_series_collaborator_handles_check
    check (
      cardinality(collaborator_handles) <= 3
      and (post_format is distinct from 'instagram_story' or cardinality(collaborator_handles) = 0)
    ),
  constraint social_post_series_owner_id_fkey
    foreign key (tenant_id, owner_id)
    references public.people (tenant_id, id) on delete set null (owner_id),
  constraint social_post_series_reviewer_id_fkey
    foreign key (tenant_id, reviewer_id)
    references public.people (tenant_id, id) on delete set null (reviewer_id),
  constraint social_post_series_calendar_item_id_fkey
    foreign key (tenant_id, calendar_item_id)
    references public.calendar_items (tenant_id, id) on delete set null (calendar_item_id),
  constraint social_post_series_event_id_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete set null (event_id)
);

create index social_post_series_tenant_active_idx
  on public.social_post_series (tenant_id)
  where paused_at is null and ended_at is null;
create index social_post_series_owner_idx
  on public.social_post_series (tenant_id, owner_id) where owner_id is not null;
create index social_post_series_reviewer_idx
  on public.social_post_series (tenant_id, reviewer_id) where reviewer_id is not null;
create index social_post_series_calendar_item_idx
  on public.social_post_series (tenant_id, calendar_item_id) where calendar_item_id is not null;
create index social_post_series_event_idx
  on public.social_post_series (tenant_id, event_id) where event_id is not null;

create trigger set_updated_at before update on public.social_post_series
  for each row execute function public.set_updated_at();

comment on table public.social_post_series is
  'A social post that repeats (#1839): the cadence counted from anchor_date at publish_time in time_zone, the template each new post is copied from, and whether new posts skip review (auto_approve). Posts are created by the scheduled generator (#1840).';
comment on column public.social_post_series.anchor_date is
  'The first occurrence''s date in time_zone. Weekly and biweekly series repeat its weekday; monthly ones its day of month, or the last day of a shorter month.';
comment on column public.social_post_series.auto_approve is
  'New posts in the series start approved instead of draft. Off by default: every post is reviewed unless someone turns this on.';
comment on column public.social_post_series.tags is
  'Who each new post tags, as set_social_post_tags() takes them: [{"person_id": ...} | {"handle": ...}].';

alter table public.social_post_series enable row level security;

revoke all on public.social_post_series from public, anon, authenticated;
grant select, insert, update, delete on public.social_post_series to authenticated;

create policy "social_post_series select" on public.social_post_series
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'view')
  );

create policy "social_post_series insert" on public.social_post_series
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'manage')
  );

create policy "social_post_series update" on public.social_post_series
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'manage')
  );

create policy "social_post_series delete" on public.social_post_series
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'manage')
  );

insert into public.audited_tables (table_name) values ('social_post_series');

create trigger audit_log_row after insert or update or delete
  on public.social_post_series
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 2. Which series a post belongs to
-- ---------------------------------------------------------------------------

alter table public.content_opportunities
  add column series_id uuid,
  add column occurrence_date date,
  add constraint content_opportunities_series_id_fkey
    foreign key (tenant_id, series_id)
    references public.social_post_series (tenant_id, id)
    on delete set null (series_id),
  add constraint content_opportunities_series_occurrence_check
    check (series_id is null or occurrence_date is not null),
  add constraint content_opportunities_series_occurrence_key
    unique (series_id, occurrence_date);

comment on column public.content_opportunities.series_id is
  'The recurring series this post belongs to, if any (#1839). Cleared when the series is deleted; the post stays.';
comment on column public.content_opportunities.occurrence_date is
  'Which of its series'' dates this post fills (#1839), in the series'' time zone. Unique per series; unchanged when the publish date is moved by hand.';

-- ---------------------------------------------------------------------------
-- 3. Making a series from a post, and copying a post into its template
-- ---------------------------------------------------------------------------

-- Both copy a post's content and its tags into the series in one statement,
-- so a series never holds half a template. Invoker: RLS decides, as for a
-- direct write; the explicit check turns "nothing matched" into a refusal.

-- The post's tags as the series stores them.
create function public.social_post_tags_json(p_post_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      case when t.person_id is not null
        then jsonb_build_object('person_id', t.person_id)
        else jsonb_build_object('handle', t.handle)
      end
      order by t.position
    ),
    '[]'::jsonb
  )
  from public.social_post_tags t
  where t.content_opportunity_id = p_post_id;
$$;

-- Makes `p_post_id` the first post of a new series and returns the series id.
-- The anchor is the post's publish date read in `p_time_zone`.
create function public.create_social_post_series(
  p_post_id uuid,
  p_cadence text,
  p_time_zone text,
  p_ends_on date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post public.content_opportunities;
  v_local timestamp;
  v_series_id uuid;
begin
  if not public.has_permission('content_calendar', 'manage') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_post from public.content_opportunities where id = p_post_id for update;
  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;
  if v_post.series_id is not null then
    raise exception 'ALREADY_IN_SERIES';
  end if;
  if v_post.publish_due_at is null then
    raise exception 'NO_PUBLISH_DATE';
  end if;

  v_local := v_post.publish_due_at at time zone p_time_zone;

  insert into public.social_post_series (
    tenant_id, cadence, anchor_date, publish_time, time_zone, ends_on,
    lead_time_days, title, content, post_format, collaborator_handles, tags,
    internal_notes, owner_id, reviewer_id, calendar_item_id, event_id
  ) values (
    v_post.tenant_id, p_cadence, v_local::date, v_local::time, p_time_zone, p_ends_on,
    v_post.lead_time_days, v_post.title, v_post.content, v_post.post_format,
    v_post.collaborator_handles, public.social_post_tags_json(p_post_id),
    v_post.internal_notes, v_post.owner_id, v_post.reviewer_id,
    v_post.calendar_item_id, v_post.event_id
  )
  returning id into v_series_id;

  update public.content_opportunities
     set series_id = v_series_id,
         occurrence_date = v_local::date
   where id = p_post_id;

  return v_series_id;
end;
$$;

comment on function public.create_social_post_series(uuid, text, text, date) is
  'Makes a post the first of a new recurring series (#1839), anchored on its publish date in p_time_zone, with its content and tags as the template.';

-- Copies a post's current content into its series' template, so the posts
-- the series creates from now on start from it. Posts already created are
-- left alone.
create function public.update_social_post_series_template(p_post_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post public.content_opportunities;
begin
  if not public.has_permission('content_calendar', 'manage') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_post from public.content_opportunities where id = p_post_id;
  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;
  if v_post.series_id is null then
    raise exception 'NOT_IN_SERIES';
  end if;

  update public.social_post_series
     set title = v_post.title,
         content = v_post.content,
         post_format = v_post.post_format,
         collaborator_handles = v_post.collaborator_handles,
         tags = public.social_post_tags_json(p_post_id),
         internal_notes = v_post.internal_notes,
         owner_id = v_post.owner_id,
         reviewer_id = v_post.reviewer_id,
         calendar_item_id = v_post.calendar_item_id,
         event_id = v_post.event_id,
         lead_time_days = v_post.lead_time_days,
         updated_by = auth.uid()
   where id = v_post.series_id;
end;
$$;

comment on function public.update_social_post_series_template(uuid) is
  'Copies a post''s content and tags into its series'' template (#1839); only posts created afterwards start from it.';

revoke all on function public.social_post_tags_json(uuid) from public, anon;
revoke all on function public.create_social_post_series(uuid, text, text, date) from public, anon;
revoke all on function public.update_social_post_series_template(uuid) from public, anon;
grant execute on function public.social_post_tags_json(uuid) to authenticated;
grant execute on function public.create_social_post_series(uuid, text, text, date) to authenticated;
grant execute on function public.update_social_post_series_template(uuid) to authenticated;
