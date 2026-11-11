-- #1799 follow-up: move an event's social posts once per saved reschedule.
--
-- shift_event_social_posts(uuid, bigint) applied whatever delta the client
-- sent. Two managers who both had the event open at start A, both saved B and
-- both accepted "move the posts too?" each sent B - A, and the posts moved
-- twice although the event moved once.
--
-- Now every saved change of an event's start is recorded here by trigger, and
-- shifting posts claims one recorded change (from -> to), marking it used in
-- the same transaction that moves the posts. The second manager's request
-- finds the change already used and moves nothing. The amount moved is the
-- recorded change itself, never a number the client computed.

create table public.event_start_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  from_starts_at timestamptz not null,
  to_starts_at timestamptz not null,
  changed_at timestamptz not null default now(),
  -- Set when the event's posts were moved for this change; a change is used
  -- at most once.
  posts_shifted_at timestamptz,
  constraint event_start_changes_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade
);

create index event_start_changes_event_idx
  on public.event_start_changes (tenant_id, event_id, changed_at desc);

comment on table public.event_start_changes is
  'Each saved change of an event''s starts_at (#1799), written by trigger. shift_event_social_posts() claims one (posts_shifted_at) so a reschedule moves the event''s social posts at most once, however many people accept the prompt. No policies and no grants: only the SECURITY DEFINER trigger and claim function reach it.';

alter table public.event_start_changes enable row level security;
revoke all on public.event_start_changes from public, anon, authenticated;

create function public.record_event_start_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_start_changes
    (tenant_id, event_id, from_starts_at, to_starts_at)
  values (new.tenant_id, new.id, old.starts_at, new.starts_at);
  return null;
end;
$$;

revoke execute on function public.record_event_start_change() from public, anon, authenticated;

create trigger record_event_start_change
  after update of starts_at on public.events
  for each row
  when (old.starts_at is distinct from new.starts_at)
  execute function public.record_event_start_change();

-- Claims the latest unused recorded change of this event from p_from to p_to
-- in the caller's tenant. The row lock makes a concurrent second claim wait,
-- then see posts_shifted_at set and find nothing. Returns the change's size,
-- or null when there is no unused change to claim.
create function public.claim_event_start_change(
  p_event_id uuid,
  p_from_starts_at timestamptz,
  p_to_starts_at timestamptz
)
returns interval
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('content_calendar', 'manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select c.id into v_id
    from public.event_start_changes c
   where c.tenant_id = public.current_tenant_id()
     and c.event_id = p_event_id
     and c.from_starts_at = p_from_starts_at
     and c.to_starts_at = p_to_starts_at
     and c.posts_shifted_at is null
   order by c.changed_at desc
   limit 1
   for update;

  if v_id is null then
    return null;
  end if;

  update public.event_start_changes
     set posts_shifted_at = now()
   where id = v_id;
  return p_to_starts_at - p_from_starts_at;
end;
$$;

revoke execute on function public.claim_event_start_change(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.claim_event_start_change(uuid, timestamptz, timestamptz) to authenticated;

drop function public.shift_event_social_posts(uuid, bigint);

-- Security invoker, as before: content_opportunities' RLS decides what the
-- caller can move. Raises EVENT_START_CHANGE_USED (P0001) when the change has
-- no unused record -- someone already moved the posts for it, or the start
-- never changed from p_from to p_to. Published and skipped posts, and posts
-- with no publish date, never move.
create function public.shift_event_social_posts(
  p_event_id uuid,
  p_from_starts_at timestamptz,
  p_to_starts_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shift interval;
  v_count integer;
begin
  if not public.has_permission('content_calendar', 'manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  v_shift := public.claim_event_start_change(
    p_event_id, p_from_starts_at, p_to_starts_at
  );
  if v_shift is null then
    raise exception 'EVENT_START_CHANGE_USED';
  end if;

  update public.content_opportunities
     set publish_due_at = publish_due_at + v_shift,
         review_due_at = review_due_at + v_shift,
         draft_due_at = draft_due_at + v_shift
   where event_id = p_event_id
     and publish_due_at is not null
     and content_status not in ('published', 'skipped');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.shift_event_social_posts(uuid, timestamptz, timestamptz) is
  'Moves an event''s unpublished, unskipped, dated social posts by one recorded change of its start (#1799), claiming that change so it is applied once. Security invoker, so content_opportunities RLS applies.';

revoke execute on function public.shift_event_social_posts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.shift_event_social_posts(uuid, timestamptz, timestamptz) to authenticated;
