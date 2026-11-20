-- Generated Gear Spotlight story images on a post (#1909, part of #1905).
--
--   1. social_post_media.generated_frame / generated_fingerprint: a file the
--      portal rendered (frame 1-3 of the story, #1908) rather than one someone
--      added, and a hash of everything it was drawn from, so the post page can
--      say the images are out of date after the post, its item or the
--      tenant's branding changes. Both null on every existing row.
--   2. replace_social_post_story_images(): swaps a post's generated set for a
--      newly uploaded one in one statement -- never touching hand-added media
--      -- and returns the old objects' paths for the app to remove.
--
-- Additive only: main does not read the new columns, and record_social_post_media()
-- keeps inserting hand-added rows with both null.
-- Tenant: no rows are written.

-- ---------------------------------------------------------------------------
-- 1. What was generated
-- ---------------------------------------------------------------------------

alter table public.social_post_media
  add column generated_frame smallint
    constraint social_post_media_generated_frame_check
      check (generated_frame between 1 and 3),
  add column generated_fingerprint text,
  add constraint social_post_media_generated_complete
    check (
      (generated_frame is null) = (generated_fingerprint is null)
      and (generated_frame is null or storage_path is not null)
    );

create unique index social_post_media_generated_frame_key
  on public.social_post_media (content_opportunity_id, generated_frame)
  where generated_frame is not null;

comment on column public.social_post_media.generated_frame is
  'Which Gear Spotlight story frame (1-3) the portal rendered into this file (#1909); null for a file someone added. Regenerating replaces only these.';
comment on column public.social_post_media.generated_fingerprint is
  'A hash of the post fields, item and branding the frame was drawn from (#1909), compared with the current inputs to show the images are out of date. Null for a file someone added.';

-- ---------------------------------------------------------------------------
-- 2. Swapping the generated set
-- ---------------------------------------------------------------------------

-- Replaces the post's generated story images with `p_paths` (frames 1..3, in
-- order, already uploaded under the post's folder). They take positions 0-2;
-- hand-added media keeps its order after them. Refused on a published post,
-- a post that is not a story or features no item. Returns the replaced
-- objects' paths. Definer: social_post_media has no insert grant, and size and
-- type are read off storage.objects, as in record_social_post_media().
create function public.replace_social_post_story_images(
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
  if v_post.post_format is distinct from 'instagram_story'
     or v_post.featured_inventory_item_id is null then
    raise exception 'NOT_GEAR_STORY';
  end if;
  if coalesce(cardinality(p_paths), 0) <> 3
     or nullif(btrim(coalesce(p_fingerprint, '')), '') is null then
    raise exception 'INVALID_FRAMES';
  end if;

  select count(*) into v_kept
    from public.social_post_media
   where content_opportunity_id = p_post_id
     and generated_frame is null;
  if v_kept + 3 > 10 then
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
     set position = 3 + ranked.rank - 1
    from (
      select id, row_number() over (order by position, id) as rank
        from public.social_post_media
       where content_opportunity_id = p_post_id
    ) ranked
   where m.id = ranked.id;

  for v_frame in 1..3 loop
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
      format('gear-spotlight-%s.png', v_frame),
      coalesce(v_type, 'image/png'), coalesce(v_size, 0), v_frame - 1, auth.uid(),
      v_frame, p_fingerprint
    );
  end loop;

  return v_old;
end;
$$;

comment on function public.replace_social_post_story_images(uuid, text[], text) is
  'Replaces a featured-gear story post''s generated Gear Spotlight images (#1909) with three uploaded frames, first in the post''s media, leaving hand-added media in place after them. Refused once published. Returns the replaced objects'' paths. Requires content_calendar manage.';

revoke all on function public.replace_social_post_story_images(uuid, text[], text) from public, anon;
grant execute on function public.replace_social_post_story_images(uuid, text[], text) to authenticated;
