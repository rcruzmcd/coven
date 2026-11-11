-- #1799: when an event's start moves, its open social posts can move with
-- it. One statement, so the publish, review and draft dates of every post
-- move together or not at all; each row's change reaches audit_log through
-- the existing audit_log_row trigger on content_opportunities.
--
-- Security invoker: content_opportunities' RLS (content_calendar: manage to
-- update, and the tenant isolation policies) decides what the caller can
-- move, exactly as for a hand edit. The explicit check only turns "nothing
-- matched" into a clear refusal for a caller who may not manage posts.
-- Published and skipped posts, and posts with no publish date, never move.
create function public.shift_event_social_posts(
  p_event_id uuid,
  p_shift_seconds bigint
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shift interval := make_interval(secs => p_shift_seconds);
  v_count integer;
begin
  if not public.has_permission('content_calendar', 'manage') then
    raise exception 'permission denied' using errcode = '42501';
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

comment on function public.shift_event_social_posts(uuid, bigint) is
  'Moves an event''s unpublished, unskipped, dated social posts by p_shift_seconds (#1799): publish, review and draft dates together, in one statement. Security invoker, so content_opportunities RLS applies.';

revoke execute on function public.shift_event_social_posts(uuid, bigint) from public, anon;
grant execute on function public.shift_event_social_posts(uuid, bigint) to authenticated;
