-- Post templates 3/4 (#1926, part of #1923): event announcement and reminder,
-- flyer first.
--
--   1. event_media.dominant_color: a photo's dominant colour as `#rrggbb`,
--      read with sharp when the photo is made an event's flyer and stored
--      with it. The event templates paint the bands around the flyer with it.
--      On the media row rather than the event, so a flyer swapped by a writer
--      that doesn't set it (main) can never inherit another photo's colour.
--   2. replace_social_post_story_images() now takes one to three generated
--      images, for a story or a 4:5 post, featuring an item or related to an
--      event, and names the files after the post's template. Same name and
--      signature: main's call (three Gear Spotlight frames on a featured-gear
--      story) passes exactly as before.
--
-- Additive. No tenant rows.

-- ---------------------------------------------------------------------------
-- 1. A photo's dominant colour
-- ---------------------------------------------------------------------------

alter table public.event_media
  add column dominant_color text
    constraint event_media_dominant_color_check
      check (dominant_color ~ '^#[0-9a-f]{6}$');

comment on column public.event_media.dominant_color is
  'The photo''s dominant colour as #rrggbb (#1926), read when it is made its event''s flyer; null until then. The event post templates paint the bands around the flyer with it.';

-- ---------------------------------------------------------------------------
-- 2. Generated images for any template
-- ---------------------------------------------------------------------------

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
  if v_count not between 1 and 3
     or nullif(btrim(coalesce(p_fingerprint, '')), '') is null then
    raise exception 'INVALID_FRAMES';
  end if;

  select count(*) into v_kept
    from public.social_post_media
   where content_opportunity_id = p_post_id
     and generated_frame is null;
  if v_kept + v_count > 10 then
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
  'Replaces a post''s generated template images (#1909, #1926) with one to three uploaded frames, first in the post''s media, leaving hand-added media in place after them. For an Instagram story or post that features an item or is related to an event; refused once published. Returns the replaced objects'' paths. Requires content_calendar manage.';

revoke all on function public.replace_social_post_story_images(uuid, text[], text) from public, anon;
grant execute on function public.replace_social_post_story_images(uuid, text[], text) to authenticated;
