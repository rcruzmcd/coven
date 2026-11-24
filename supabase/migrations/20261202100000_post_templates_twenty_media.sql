-- Post templates 4/4 (#1927, part of #1923): event recap and sponsor
-- thank-you. The templates are code; what the database changes is how many
-- files a post holds.
--
-- Instagram's carousel limit is 20 (it was 10 when #1826 set ours), and a
-- recap post is a carousel of up to 20 of the event's photos, so:
--
--   1. record_social_post_media() and add_social_post_event_media() refuse
--      past twenty files, not ten.
--   2. social_post_media.generated_frame runs 1 to 20, not 1 to 3, and
--      replace_social_post_story_images() takes one to twenty generated
--      images, within the same twenty.
--
-- Same names and signatures, bodies otherwise unchanged (from 20261119100000,
-- 20261120110000 and 20261201100000): main's calls pass exactly as before,
-- and main's own ten-file check in the app still stops it first.
--
-- Additive. No tenant rows.

-- ---------------------------------------------------------------------------
-- 1. Twenty files a post
-- ---------------------------------------------------------------------------

create or replace function public.record_social_post_media(
  p_path text,
  p_original_filename text
)
returns public.social_post_media
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_post_id uuid := public.social_post_media_path_post_id(p_path);
  v_type text;
  v_size bigint;
  v_row public.social_post_media;
begin
  if v_tenant_id is null
     or split_part(coalesce(p_path, ''), '/', 1) <> v_tenant_id::text
     or not public.has_permission('content_calendar', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Serialises records for one post, so two finishing at once cannot both
  -- take the last position or the twentieth slot.
  perform 1
     from public.content_opportunities o
    where o.id = v_post_id
      and o.tenant_id = v_tenant_id
      for update;
  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;

  select * into v_row from public.social_post_media where storage_path = p_path;
  if v_row.id is not null then
    return v_row;
  end if;

  if (select count(*) from public.social_post_media where content_opportunity_id = v_post_id) >= 20 then
    raise exception 'TOO_MANY_MEDIA';
  end if;

  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint
    into v_type, v_size
    from storage.objects o
   where o.bucket_id = 'social-post-media'
     and o.name = p_path;

  if not found then
    raise exception 'MEDIA_NOT_FOUND';
  end if;

  insert into public.social_post_media (
    tenant_id, content_opportunity_id, storage_path, original_filename,
    content_type, size_bytes, position, uploaded_by
  )
  values (
    v_tenant_id, v_post_id, p_path,
    left(coalesce(nullif(btrim(p_original_filename), ''), 'upload'), 255),
    v_type, coalesce(v_size, 0),
    coalesce((select max(m.position) + 1 from public.social_post_media m
               where m.content_opportunity_id = v_post_id), 0),
    auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.record_social_post_media(text, text) is
  'Records a finished social-post-media upload (#1826) at the end of its post''s list: checks content_calendar manage and the post the path names, reads content type and size off storage.objects, refuses a twenty-first file (#1927; Instagram''s carousel limit). Idempotent per path.';

create or replace function public.add_social_post_event_media(
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

  -- Locked, as in record_social_post_media(), so the twenty-file count holds.
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
     + cardinality(v_ids) > 20 then
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
  'Adds event photos and videos to a social post by reference (#1827): content_calendar manage and events view; each must be media of the event the post is related to; ones the post already shows are skipped; refuses past twenty files (#1927). Returns how many were added.';

-- ---------------------------------------------------------------------------
-- 2. Up to twenty generated images
-- ---------------------------------------------------------------------------

alter table public.social_post_media
  drop constraint social_post_media_generated_frame_check,
  add constraint social_post_media_generated_frame_check
    check (generated_frame between 1 and 20);

create or replace function public.replace_social_post_story_images(
  p_post_id uuid,
  p_paths text[],
  p_fingerprint text
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_post public.content_opportunities;
  v_count integer := coalesce(cardinality(p_paths), 0);
  v_old text[];
  v_kept integer;
  v_path text;
  v_frame integer;
  v_type text;
  v_size bigint;
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
  -- Still the original error name, which main maps to its message.
  if v_post.post_format is null
     or v_post.post_format not in ('instagram_story', 'instagram_post')
     or (v_post.featured_inventory_item_id is null and v_post.event_id is null) then
    raise exception 'NOT_GEAR_STORY';
  end if;
  if v_count not between 1 and 20
     or nullif(btrim(coalesce(p_fingerprint, '')), '') is null then
    raise exception 'INVALID_FRAMES';
  end if;

  select count(*) into v_kept
    from public.social_post_media
   where content_opportunity_id = p_post_id
     and generated_frame is null;
  if v_kept + v_count > 20 then
    raise exception 'TOO_MANY_MEDIA';
  end if;

  with removed as (
    delete from public.social_post_media
     where content_opportunity_id = p_post_id
       and generated_frame is not null
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_old from removed;

  -- position's unique key is deferred, so the shift can pass through ties.
  update public.social_post_media m
     set position = v_count + ranked.rank - 1
    from (
      select id, row_number() over (order by position, id) as rank
        from public.social_post_media
       where content_opportunity_id = p_post_id
    ) ranked
   where m.id = ranked.id;

  for v_frame in 1..v_count loop
    v_path := p_paths[v_frame];
    if split_part(coalesce(v_path, ''), '/', 1) <> v_tenant_id::text
       or public.social_post_media_path_post_id(v_path) is distinct from p_post_id then
      raise exception 'PERMISSION_DENIED' using errcode = '42501';
    end if;

    select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint
      into v_type, v_size
      from storage.objects o
     where o.bucket_id = 'social-post-media'
       and o.name = v_path;
    if not found then
      raise exception 'MEDIA_NOT_FOUND';
    end if;

    insert into public.social_post_media (
      tenant_id, content_opportunity_id, storage_path, original_filename,
      content_type, size_bytes, position, uploaded_by,
      generated_frame, generated_fingerprint
    ) values (
      v_tenant_id, p_post_id, v_path,
      format(
        '%s-%s.png',
        replace(coalesce(v_post.template_key, 'gear_spotlight'), '_', '-'),
        v_frame
      ),
      coalesce(v_type, 'image/png'), coalesce(v_size, 0), v_frame - 1, auth.uid(),
      v_frame, p_fingerprint
    );
  end loop;

  return v_old;
end;
$$;

comment on function public.replace_social_post_story_images(uuid, text[], text) is
  'Replaces a post''s generated template images (#1909, #1926) with one to twenty uploaded frames (#1927: a recap carousel''s), first in the post''s media, leaving hand-added media in place after them; twenty files in all. For an Instagram story or post that features an item or is related to an event; refused once published. Returns the replaced objects'' paths. Requires content_calendar manage.';
