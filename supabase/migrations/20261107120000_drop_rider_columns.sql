-- Profile questions: drop the retired rider columns (#1747, part of #1409)
-- ---------------------------------------------------------------------------
--
-- Design record: planning coven/product/2026-10-31-person-profile-questions.md,
-- section 6. 20261105120000 (#1746) moved every reader and writer onto
-- profile questions and left these unread and unwritten for one release as
-- the rollback path. That release has shipped, so they go:
--
--   people:              riding_discipline, ski_experience_level,
--                        snowboard_experience_level, preferred_mountain
--   event_registrations: riding_discipline_at_event,
--                        ski_experience_level_at_event,
--                        snowboard_experience_level_at_event
--
-- with the p_riding_* arguments register_for_event() and
-- register_myself_for_event() kept, ignored, until now. The app stopped
-- passing them in #1746. snapshot_rider_profile_on_checkin() and its trigger
-- went in #1746; the drop below is only a guard.
--
-- KEPT: people's four rows in retention_snapshot_personal_columns. Audit
-- snapshots taken before #1746 still hold those keys, and the purge redacts
-- snapshots by that list, not by the live columns. Also kept: the public API's
-- POST /rider-profile v1 field names and save_registrant_rider_profile()'s
-- p_riding_* arguments, which are that contract mapped onto the questions,
-- not these columns.

drop trigger if exists snapshot_rider_profile_on_checkin on public.event_registrations;
drop function if exists public.snapshot_rider_profile_on_checkin();

-- 1. The two registration RPCs, without their four ignored arguments. The
-- body, comment and grants are carried over exactly; only the signature
-- changes, so a caller still naming one of the four gets PGRST202.
do $rpc$
declare
  v_signature text;
  v_args constant text := ', p_riding_discipline text DEFAULT NULL::text'
    || ', p_ski_experience_level text DEFAULT NULL::text'
    || ', p_snowboard_experience_level text DEFAULT NULL::text'
    || ', p_preferred_mountain text DEFAULT NULL::text';
  v_oid oid;
  v_def text;
  v_comment text;
  v_acl aclitem[];
  v_grantee text;
begin
  foreach v_signature in array array[
    'public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb, boolean, text, text)',
    'public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb, boolean, text, text)'
  ] loop
    v_oid := v_signature::regprocedure;
    v_def := pg_get_functiondef(v_oid);
    v_comment := obj_description(v_oid, 'pg_proc');
    select proacl into v_acl from pg_proc where oid = v_oid;

    if (length(v_def) - length(replace(v_def, v_args, ''))) / length(v_args) <> 1 then
      raise exception '#1747: expected the four rider arguments once in %', v_signature;
    end if;
    v_def := replace(v_def, v_args, '');
    if v_def ~ 'p_riding_discipline|p_ski_experience_level|p_snowboard_experience_level|p_preferred_mountain' then
      raise exception '#1747: % still reads a rider argument', v_signature;
    end if;

    execute format('drop function %s', v_signature);
    execute v_def;
    v_oid := (regexp_match(v_def, 'FUNCTION (public\.\w+)\('))[1]::regproc;

    execute format('comment on function %s is %L', v_oid::regprocedure,
      v_comment || ' The four p_riding_* arguments, ignored since #1746, were removed in #1747.');
    execute format('revoke all on function %s from public', v_oid::regprocedure);
    for v_grantee in
      select case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end
        from aclexplode(v_acl) a
        left join pg_roles r on r.oid = a.grantee
       where a.privilege_type = 'EXECUTE'
    loop
      execute format('grant execute on function %s to %s', v_oid::regprocedure, v_grantee);
    end loop;
  end loop;
end
$rpc$;

-- 2. The columns. Their check constraints and indexes go with them.
alter table public.people
  drop column riding_discipline,
  drop column ski_experience_level,
  drop column snowboard_experience_level,
  drop column preferred_mountain;

alter table public.event_registrations
  drop column riding_discipline_at_event,
  drop column ski_experience_level_at_event,
  drop column snowboard_experience_level_at_event;
