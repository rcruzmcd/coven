-- #1798 review: Generate plan's "skip any title the event already has" check
-- and its insert, made atomic. Two managers generating at once could both
-- read the same existing titles and insert the same posts, and a check read
-- through PostgREST stops at its row cap. Here the check is one NOT EXISTS
-- over every row, under a per-event transaction advisory lock, so concurrent
-- runs for one event take turns and the second sees the first's rows.
--
-- No unique index on (event_id, title): a manager may still add two posts
-- with one title by hand. Titles compare trimmed and case-insensitively, as
-- planTitleKey() does in src/lib/social-content/event-plan.ts.
--
-- Security invoker: content_opportunities' insert RLS (content_calendar:
-- manage, tenant isolation) applies as for any other insert, and the tenant
-- comes from the column default as it does for a hand-added post.
create function public.insert_event_plan_posts(
  p_event_id uuid,
  p_posts jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.has_permission('content_calendar', 'manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('event_plan_posts:' || p_event_id::text, 0)
  );

  insert into public.content_opportunities (
    event_id, title, content_status, lead_time_days,
    publish_due_at, review_due_at, draft_due_at,
    status_changed_by, status_changed_at
  )
  select p_event_id, btrim(post.title), 'idea', post.lead_time_days,
         post.publish_due_at, post.review_due_at, post.draft_due_at,
         auth.uid(), now()
    from jsonb_to_recordset(p_posts) as post(
      title text,
      lead_time_days integer,
      publish_due_at timestamptz,
      review_due_at timestamptz,
      draft_due_at timestamptz
    )
   where not exists (
     select 1 from public.content_opportunities existing
      where existing.event_id = p_event_id
        and lower(btrim(existing.title)) = lower(btrim(post.title))
   );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.insert_event_plan_posts(uuid, jsonb) is
  'Inserts an event''s Generate plan posts (#1798), skipping any title the event already has, atomically under a per-event advisory lock. Security invoker, so content_opportunities RLS applies.';

revoke execute on function public.insert_event_plan_posts(uuid, jsonb) from public, anon;
grant execute on function public.insert_event_plan_posts(uuid, jsonb) to authenticated;
