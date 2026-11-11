-- The public Gallery page (#1655, follows #1654).
--
--   1. public_event_gallery(): one page of the tenant's events that have
--      public media, newest event first, each with its counts and the paths
--      of its newest photo thumbnails. service_role only, like
--      public_event_media(): the server signs the paths and hands out nothing
--      else.
--   2. public_event_gallery_has_media(): whether there is anything to list,
--      so the site menu never links to an empty page.
--   3. Chatter Snow's `page_visibility.gallery`, seeded on.
--
-- Both read with public_event_media()'s rule: public rows of public,
-- published events of the given tenant, while events.public_gallery_enabled
-- is on. A hidden or deleted row leaves the next request.

-- ---------------------------------------------------------------------------
-- 1. The page
-- ---------------------------------------------------------------------------

create function public.public_event_gallery(
  p_tenant_id uuid,
  p_limit integer,
  p_offset integer,
  p_thumbs integer
)
returns table (
  event_id uuid,
  name text,
  starts_at timestamptz,
  timezone text,
  photo_count integer,
  video_count integer,
  thumb_paths text[],
  total_events integer
)
language sql
stable
security definer
set search_path = public
as $$
  with media as (
    select m.event_id,
           m.kind,
           case when m.kind = 'photo' then coalesce(m.thumb_path, m.storage_path)
                else m.storage_path end as path,
           m.uploaded_at,
           m.id
      from public.event_media m
      join public.events e
        on e.tenant_id = m.tenant_id
       and e.id = m.event_id
     where m.tenant_id = p_tenant_id
       and m.is_public
       and e.visibility = 'public'
       and e.status = 'published'
       and public.tenant_event_public_gallery_enabled(p_tenant_id)
  ),
  per_event as (
    select media.event_id,
           count(*) filter (where kind = 'photo')::integer as photo_count,
           count(*) filter (where kind = 'video')::integer as video_count
      from media
     group by media.event_id
  )
  select e.id,
         e.name,
         e.starts_at,
         e.timezone,
         p.photo_count,
         p.video_count,
         coalesce(
           (select array_agg(t.path order by t.uploaded_at desc, t.id)
              from (select path, uploaded_at, id
                      from media
                     where media.event_id = e.id
                       and media.kind = 'photo'
                     order by uploaded_at desc, id
                     limit greatest(coalesce(p_thumbs, 0), 0)) t),
           '{}'
         ),
         (count(*) over ())::integer
    from per_event p
    join public.events e
      on e.tenant_id = p_tenant_id
     and e.id = p.event_id
   order by e.starts_at desc, e.id
   limit least(greatest(coalesce(p_limit, 0), 0), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.public_event_gallery(uuid, integer, integer, integer) is
  'One page of the tenant''s public, published events that have public photos or videos (#1655), newest event first, while events.public_gallery_enabled is on: counts, the paths of up to p_thumbs newest photo thumbnails, and the total number of such events. Nothing about who uploaded anything. service_role only: the Gallery page signs the paths on the server.';

revoke all on function public.public_event_gallery(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.public_event_gallery(uuid, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Whether there is anything to list
-- ---------------------------------------------------------------------------

create function public.public_event_gallery_has_media(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tenant_event_public_gallery_enabled(p_tenant_id)
     and exists (
       select 1
         from public.event_media m
         join public.events e
           on e.tenant_id = m.tenant_id
          and e.id = m.event_id
        where m.tenant_id = p_tenant_id
          and m.is_public
          and e.visibility = 'public'
          and e.status = 'published'
     );
$$;

comment on function public.public_event_gallery_has_media(uuid) is
  'Whether the tenant''s public Gallery page (#1655) has anything to show: the public event gallery is on and some public, published event has public media. Drives the site menu''s Gallery link. service_role only.';

revoke all on function public.public_event_gallery_has_media(uuid) from public, anon, authenticated;
grant execute on function public.public_event_gallery_has_media(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Chatter Snow
-- ---------------------------------------------------------------------------

-- `page_visibility.gallery` is off for every tenant without a row (the
-- registry default in src/lib/page-visibility.ts). Chatter Snow already runs
-- the public event gallery (20261021170000), so it gets the page. Scoped by
-- slug, so a fresh local or CI database is a no-op; `on conflict do nothing`,
-- so a choice made before this runs wins.
alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.app_settings (tenant_id, key, value)
select tenant.id, 'page_visibility.gallery', 'true'::jsonb
from tenant
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;
