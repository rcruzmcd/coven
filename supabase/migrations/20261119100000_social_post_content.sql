-- Social post content, broken into parts (#1826).
--
--   1. content_opportunities.post_format and .collaborator_handles. The
--      existing `content` column is the caption from now on: it is renamed in
--      the UI only, because production runs main, which still reads `content`
--      (additive migrations only while main lags development).
--   2. social_post_tags: the people to tag, each a person record (whose handle
--      is read at display time, so a retention purge of the person's handle
--      leaves nothing behind here) or a bare handle.
--   3. The private `social-post-media` bucket and its storage policies, under
--      `{tenant_id}/{post_id}/{uuid}.{ext}`, following `event-media`
--      (20261020130000).
--   4. social_post_media, one row per stored object, written only through
--      record_social_post_media() so size and type are read off the object.
--   5. social_post_tag_people(): who can be tagged, with their handle and
--      whether they declined photo consent.
--
-- Access is the `content_calendar` resource throughout, the same as the post
-- itself: view to read, manage to change. No new permission is introduced.
--
-- Tenant: no rows are written. Every new table carries tenant_id with the
-- usual default and composite (tenant_id, ...) keys.

-- ---------------------------------------------------------------------------
-- 1. Format and collaborators
-- ---------------------------------------------------------------------------

alter table public.content_opportunities
  add column post_format text
    constraint content_opportunities_post_format_check
      check (post_format in ('instagram_post', 'instagram_reel', 'instagram_story')),
  add column collaborator_handles text[] not null default '{}',
  -- Instagram invites at most three collaborators, on posts and reels only.
  add constraint content_opportunities_collaborator_handles_check
    check (
      cardinality(collaborator_handles) <= 3
      and (post_format is distinct from 'instagram_story' or cardinality(collaborator_handles) = 0)
    );

comment on column public.content_opportunities.post_format is
  'What the post is on its platform (#1826): instagram_post (single image or carousel), instagram_reel or instagram_story. Null until chosen. Named with the platform so others can be added without a rename.';
comment on column public.content_opportunities.collaborator_handles is
  'Instagram handles invited as collaborators (#1826), normalised (no @, lowercase). At most three, and none on a story.';
comment on column public.content_opportunities.content is
  'The caption (#1826; "Story text" on a story). Called content since #1231; renamed in the UI only.';

-- ---------------------------------------------------------------------------
-- 2. People to tag
-- ---------------------------------------------------------------------------

create table public.social_post_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  content_opportunity_id uuid not null,
  person_id uuid,
  handle text
    constraint social_post_tags_handle_check
      check (handle is null or handle ~ '^[a-z0-9._]{1,30}$'),
  position integer not null constraint social_post_tags_position_check check (position >= 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  constraint social_post_tags_person_or_handle check ((person_id is null) <> (handle is null)),
  constraint social_post_tags_post_fkey
    foreign key (tenant_id, content_opportunity_id)
    references public.content_opportunities (tenant_id, id) on delete cascade,
  constraint social_post_tags_person_fkey
    foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete cascade
);

create index social_post_tags_post_idx
  on public.social_post_tags (tenant_id, content_opportunity_id, position);
create index social_post_tags_person_idx
  on public.social_post_tags (tenant_id, person_id) where person_id is not null;

comment on table public.social_post_tags is
  'Who a social post tags (#1826): a person record or a bare Instagram handle. A person''s handle is never copied here; it is read from their record when shown.';

alter table public.social_post_tags enable row level security;

revoke all on public.social_post_tags from public, anon, authenticated;
grant select, insert, delete on public.social_post_tags to authenticated;

create policy "social_post_tags select" on public.social_post_tags
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'view')
  );

create policy "social_post_tags insert" on public.social_post_tags
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'manage')
  );

create policy "social_post_tags delete" on public.social_post_tags
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'manage')
  );

insert into public.audited_tables (table_name) values ('social_post_tags');

create trigger audit_log_row after insert or update or delete
  on public.social_post_tags
  for each row execute function public.audit_log_row();

-- Replaces a post's tags in one statement, so a save never leaves half of the
-- old list and half of the new. Invoker: RLS decides, as for a direct write.
create function public.set_social_post_tags(
  p_post_id uuid,
  p_tags jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Said outright: under RLS alone a viewer's delete would match nothing and
  -- an empty list would "succeed" without writing.
  if not public.has_permission('content_calendar', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if jsonb_typeof(coalesce(p_tags, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_TAGS';
  end if;
  if jsonb_array_length(coalesce(p_tags, '[]'::jsonb)) > 20 then
    raise exception 'TOO_MANY_TAGS';
  end if;
  if not exists (select 1 from public.content_opportunities where id = p_post_id) then
    raise exception 'POST_NOT_FOUND';
  end if;

  delete from public.social_post_tags where content_opportunity_id = p_post_id;

  insert into public.social_post_tags (tenant_id, content_opportunity_id, person_id, handle, position)
  select o.tenant_id,
         p_post_id,
         nullif(t.value ->> 'person_id', '')::uuid,
         nullif(t.value ->> 'handle', ''),
         (t.ordinality - 1)::integer
    from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) with ordinality as t(value, ordinality)
    join public.content_opportunities o on o.id = p_post_id;
end;
$$;

comment on function public.set_social_post_tags(uuid, jsonb) is
  'Replaces a social post''s tags (#1826) with `p_tags`, an ordered array of {person_id} or {handle}. Security invoker: social_post_tags'' policies decide.';

revoke all on function public.set_social_post_tags(uuid, jsonb) from public, anon;
grant execute on function public.set_social_post_tags(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Storage bucket and policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-post-media',
  'social-post-media',
  false,
  -- The same 10 GiB as event-media: the uploader and its file planner are
  -- shared, and a reel shot in 4K is large.
  10737418240,
  array[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The post a stored object belongs to, from `{tenant_id}/{post_id}/...`, or
-- null when the second segment is not a uuid.
create function public.social_post_media_path_post_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return split_part(coalesce(p_name, ''), '/', 2)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.social_post_media_path_post_id(text) from public, anon;
grant execute on function public.social_post_media_path_post_id(text) to authenticated;

-- Reads sign URLs with the reader's own session, so view is enough.
drop policy if exists "social-post-media select" on storage.objects;
create policy "social-post-media select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'social-post-media'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('content_calendar', 'view')
  );

drop policy if exists "social-post-media insert" on storage.objects;
create policy "social-post-media insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'social-post-media'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('content_calendar', 'manage')
    and exists (
      select 1
        from public.content_opportunities o
       where o.id = public.social_post_media_path_post_id(name)
         and o.tenant_id = (select public.current_tenant_id())
    )
  );

-- No update policy: an object is never overwritten.
drop policy if exists "social-post-media delete" on storage.objects;
create policy "social-post-media delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'social-post-media'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('content_calendar', 'manage')
  );

-- ---------------------------------------------------------------------------
-- 4. social_post_media
-- ---------------------------------------------------------------------------

create table public.social_post_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  content_opportunity_id uuid not null,
  storage_path text not null,
  original_filename text not null
    constraint social_post_media_original_filename_check
      check (char_length(btrim(original_filename)) between 1 and 255),
  content_type text not null
    constraint social_post_media_content_type_check
      check (content_type in (
        'video/mp4', 'video/quicktime', 'video/webm',
        'image/jpeg', 'image/png', 'image/webp'
      )),
  kind text not null generated always as (
    case when content_type like 'video/%' then 'video' else 'photo' end
  ) stored,
  size_bytes bigint not null
    constraint social_post_media_size_bytes_check check (size_bytes >= 0),
  position integer not null
    constraint social_post_media_position_check check (position >= 0),
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  constraint social_post_media_storage_path_key unique (storage_path),
  constraint social_post_media_position_key
    unique (content_opportunity_id, position) deferrable initially deferred,
  constraint social_post_media_path_in_post check (
    storage_path like tenant_id::text || '/' || content_opportunity_id::text || '/%'
  ),
  constraint social_post_media_post_fkey
    foreign key (tenant_id, content_opportunity_id)
    references public.content_opportunities (tenant_id, id) on delete cascade
);

create index social_post_media_post_idx
  on public.social_post_media (tenant_id, content_opportunity_id, position);

comment on table public.social_post_media is
  'A photo or video stored in the private social-post-media bucket for one social post (#1826), in carousel order. Inserted only by record_social_post_media(); the post''s delete action removes the objects before the rows cascade.';

alter table public.social_post_media enable row level security;

revoke all on public.social_post_media from public, anon, authenticated;
grant select, delete on public.social_post_media to authenticated;
grant update (position) on public.social_post_media to authenticated;

create policy "social_post_media select" on public.social_post_media
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'view')
  );

create policy "social_post_media update" on public.social_post_media
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'manage')
  )
  with check (tenant_id = (select public.current_tenant_id()));

create policy "social_post_media delete" on public.social_post_media
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'manage')
  );

insert into public.audited_tables (table_name) values ('social_post_media');

create trigger audit_log_row after insert or update or delete
  on public.social_post_media
  for each row execute function public.audit_log_row();

-- Records an uploaded object at the end of its post's list. Definer, because
-- storage.objects is not readable through PostgREST and the size and type have
-- to come from it. A post holds at most ten files, Instagram's carousel limit.
create function public.record_social_post_media(
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
  -- take the last position or the tenth slot.
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

  if (select count(*) from public.social_post_media where content_opportunity_id = v_post_id) >= 10 then
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
  'Records a finished social-post-media upload (#1826) at the end of its post''s list: checks content_calendar manage and the post the path names, reads content type and size off storage.objects, refuses an eleventh file. Idempotent per path.';

revoke all on function public.record_social_post_media(text, text) from public, anon;
grant execute on function public.record_social_post_media(text, text) to authenticated;

-- Sets a post's media order. Invoker: the update policy decides. Every id the
-- post holds must be named exactly once.
create function public.reorder_social_post_media(
  p_post_id uuid,
  p_media_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select array_agg(id order by id) from public.social_post_media where content_opportunity_id = p_post_id)
     is distinct from (select array_agg(id order by id) from unnest(p_media_ids) as id) then
    raise exception 'MEDIA_LIST_CHANGED';
  end if;

  update public.social_post_media m
     set position = ids.ordinality - 1
    from unnest(p_media_ids) with ordinality as ids(id, ordinality)
   where m.id = ids.id
     and m.content_opportunity_id = p_post_id;
end;
$$;

comment on function public.reorder_social_post_media(uuid, uuid[]) is
  'Sets the order of a social post''s media (#1826) to `p_media_ids`, which must name every file the post holds. Security invoker.';

revoke all on function public.reorder_social_post_media(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_social_post_media(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Who can be tagged
-- ---------------------------------------------------------------------------

-- People with an Instagram handle -- their own, or else the one on their most
-- recent registration -- plus any named in `p_person_ids` (a post's existing
-- tags, which must still show if the handle has gone). `declined_photo_consent`
-- is their answer for `p_event_id` when they gave one there, else their most
-- recent answer anywhere. Invoker: a reader without people or events access
-- simply gets fewer rows and no consent answers.
create function public.social_post_tag_people(
  p_event_id uuid default null,
  p_person_ids uuid[] default '{}'
)
returns table (
  person_id uuid,
  name text,
  preferred_name text,
  instagram_handle text,
  declined_photo_consent boolean
)
language sql
security invoker
stable
set search_path = public
as $$
  select p.id,
         p.name,
         p.preferred_name,
         coalesce(nullif(p.instagram_handle, ''), latest_handle.instagram_handle),
         consent.photo_consent = false
    from public.people p
    left join lateral (
      select r.instagram_handle
        from public.event_registrations r
       where r.person_id = p.id
         and nullif(r.instagram_handle, '') is not null
       order by r.created_at desc
       limit 1
    ) latest_handle on true
    left join lateral (
      select r.photo_consent
        from public.event_registrations r
       where r.person_id = p.id
         and r.photo_consent is not null
       order by (r.event_id is not distinct from p_event_id) desc, r.created_at desc
       limit 1
    ) consent on true
   where coalesce(nullif(p.instagram_handle, ''), latest_handle.instagram_handle) is not null
      or p.id = any(coalesce(p_person_ids, '{}'))
   order by coalesce(p.preferred_name, p.name), p.id;
$$;

comment on function public.social_post_tag_people(uuid, uuid[]) is
  'People a social post can tag (#1826): those with an Instagram handle on their record or a registration, plus `p_person_ids`, with whether they declined photo consent (for `p_event_id` first). Security invoker.';

revoke all on function public.social_post_tag_people(uuid, uuid[]) from public, anon;
grant execute on function public.social_post_tag_people(uuid, uuid[]) to authenticated;
