-- Social post media from the event, and the event flyer (#1827, follows #1826).
--
--   1. events.flyer_media_id: one flyer per event, which is one of the event's
--      own photos (event_media). The ticket's option 1 -- a Flyer slot on the
--      event -- stored as ordinary event media, so it is uploaded, read and
--      deleted the way every other event photo is. Deleting the photo clears
--      the slot.
--   2. A flyer is exempt from the retention purge (#1608): it advertises the
--      event rather than showing who was there.
--   3. social_post_media.event_media_id: a post's media item may reference an
--      event photo or video instead of holding its own copy. The file stays in
--      `event-media`; the row keeps only its filename and type. Deleting the
--      event media nulls the reference, and the post shows the item as missing
--      rather than dropping it.
--   4. add_social_post_event_media(): the only writer of those references.
--
-- Additive only: production runs main, which has neither table's new column.
-- Tenant: no rows are written.

-- ---------------------------------------------------------------------------
-- 1. The flyer
-- ---------------------------------------------------------------------------

-- Targets for the composite foreign keys below: (event_id, id) so a flyer must
-- be its own event's media, (tenant_id, id) so a post's reference stays in its
-- tenant. id is already unique, so both are too.
create unique index event_media_event_id_id_key on public.event_media (event_id, id);
create unique index event_media_tenant_id_id_key on public.event_media (tenant_id, id);

alter table public.events
  add column flyer_media_id uuid,
  add constraint events_flyer_media_fkey
    foreign key (id, flyer_media_id)
    references public.event_media (event_id, id)
    on delete set null (flyer_media_id);

create index events_flyer_media_idx
  on public.events (flyer_media_id) where flyer_media_id is not null;

comment on column public.events.flyer_media_id is
  'The event''s flyer (#1827): one of this event''s own photos in event_media, or null. Cleared when that photo is deleted. Offered first when a social post takes media from the event, and never purged by the retention setting.';

-- ---------------------------------------------------------------------------
-- 2. Retention leaves the flyer alone
-- ---------------------------------------------------------------------------

-- Bodies from 20261021100000 (expires_at) and 20261021130000
-- (expired_event_media), plus the flyer exemption.
create or replace function public.expires_at(public.event_media)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public.event_media_expiry($1.tenant_id, $1.event_id, $1.uploaded_at)
   where $1.tenant_id = (select public.current_tenant_id())
     and not exists (
       select 1 from public.events e
        where e.id = $1.event_id
          and e.flyer_media_id = $1.id
     );
$$;

comment on function public.expires_at(public.event_media) is
  'When this photo or video will be deleted under the tenant''s retention setting (#1608), or null when it is kept indefinitely or is its event''s flyer (#1827). Answers only for a row of the caller''s own tenant.';

create or replace function public.expired_event_media(p_now timestamptz default now())
returns table (id uuid, storage_path text, thumb_path text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.storage_path, m.thumb_path
    from public.event_media m
   where public.event_media_expiry(m.tenant_id, m.event_id, m.uploaded_at) <= p_now
     and not exists (
       select 1 from public.events e
        where e.id = m.event_id
          and e.flyer_media_id = m.id
     )
   order by m.id;
$$;

comment on function public.expired_event_media(timestamptz) is
  'Event media past its expiry at p_now, across every tenant, with the photo''s thumbnail path where it has one (#1608, #1620). An event''s flyer never expires (#1827). For the daily storage purge only: service_role.';

-- ---------------------------------------------------------------------------
-- 3. Post media that references event media
-- ---------------------------------------------------------------------------

alter table public.social_post_media
  alter column storage_path drop not null,
  add column event_media_id uuid,
  add constraint social_post_media_event_media_fkey
    foreign key (tenant_id, event_media_id)
    references public.event_media (tenant_id, id)
    on delete set null (event_media_id),
  -- An upload has a path; a reference has event media until that is deleted,
  -- and then neither (shown as missing). Never both.
  add constraint social_post_media_one_source
    check (storage_path is null or event_media_id is null);

create unique index social_post_media_event_media_key
  on public.social_post_media (content_opportunity_id, event_media_id)
  where event_media_id is not null;
create index social_post_media_event_media_idx
  on public.social_post_media (event_media_id) where event_media_id is not null;

comment on column public.social_post_media.storage_path is
  'The uploaded object in social-post-media, or null when the item references event media (event_media_id) or referenced media that has since been deleted.';
comment on column public.social_post_media.event_media_id is
  'The event photo or video this item shows (#1827), referenced rather than copied. Null for an upload, and set null when the event media is deleted, which leaves the item showing as missing.';

-- ---------------------------------------------------------------------------
-- 4. Adding references
-- ---------------------------------------------------------------------------

-- Appends `p_media_ids`, in order, to the post's media. Each must belong to the
-- event the post is related to; one the post already shows is skipped. Definer,
-- because social_post_media has no insert grant and the type and filename are
-- read off event_media. The caller must manage the content calendar and be
-- able to see the event's media.
create function public.add_social_post_event_media(
  p_post_id uuid,
  p_media_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_event_id uuid;
  v_ids uuid[];
  v_count integer;
begin
  if v_tenant_id is null
     or not public.has_permission('content_calendar', 'manage')
     or not public.has_permission('events', 'view') then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Locked, as in record_social_post_media(), so the ten-file count holds.
  select o.event_id into v_event_id
    from public.content_opportunities o
   where o.id = p_post_id
     and o.tenant_id = v_tenant_id
     for update;
  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;
  if v_event_id is null then
    raise exception 'POST_HAS_NO_EVENT';
  end if;

  -- First occurrence of each id, in the order given, that the post lacks.
  select coalesce(array_agg(ids.id order by ids.first), '{}')
    into v_ids
    from (
      select id, min(ordinality) as first
        from unnest(coalesce(p_media_ids, '{}')) with ordinality as t(id, ordinality)
       group by id
    ) ids
   where not exists (
     select 1 from public.social_post_media s
      where s.content_opportunity_id = p_post_id
        and s.event_media_id = ids.id
   );

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  if (select count(*) from public.event_media m
       where m.id = any (v_ids)
         and m.tenant_id = v_tenant_id
         and m.event_id = v_event_id) <> cardinality(v_ids) then
    raise exception 'MEDIA_NOT_IN_EVENT';
  end if;

  if (select count(*) from public.social_post_media where content_opportunity_id = p_post_id)
     + cardinality(v_ids) > 10 then
    raise exception 'TOO_MANY_MEDIA';
  end if;

  insert into public.social_post_media (
    tenant_id, content_opportunity_id, event_media_id, original_filename,
    content_type, size_bytes, position, uploaded_by
  )
  select v_tenant_id, p_post_id, m.id, m.original_filename, m.content_type, 0,
         coalesce((select max(s.position) + 1 from public.social_post_media s
                    where s.content_opportunity_id = p_post_id), 0)
           + (ids.ordinality - 1)::integer,
         auth.uid()
    from unnest(v_ids) with ordinality as ids(id, ordinality)
    join public.event_media m on m.id = ids.id
   order by ids.ordinality;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.add_social_post_event_media(uuid, uuid[]) is
  'Adds event photos and videos to a social post by reference (#1827): content_calendar manage and events view; each must be media of the event the post is related to; ones the post already shows are skipped; refuses past ten files. Returns how many were added.';

revoke all on function public.add_social_post_event_media(uuid, uuid[]) from public, anon;
grant execute on function public.add_social_post_event_media(uuid, uuid[]) to authenticated;
