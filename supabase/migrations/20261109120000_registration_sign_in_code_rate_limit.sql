-- #1765. Email-first registration: a visitor asks for a one-time code to fill
-- in their details, and the code is what proves they hold the address. The
-- code itself is minted by Supabase Auth (admin generateLink) and mailed by
-- the application in the tenant's own name (#857); the one thing the database
-- adds is the throttle, per IP and per address, like every other public write
-- (spec §7.9).
--
-- Per IP uses check_rate_limit() as is. Per address cannot, since that
-- function keys on (route, ip) and fails open on a null IP, so the address
-- check is done here: its hits go in the same table under a route that
-- carries the address's SHA-256 and a null IP, never the address itself, and
-- the same purge ages them out.
--
-- Returns a boolean and nothing else: whether a code may be sent. It says
-- nothing about whether the address has an account or a record, and the
-- caller answers the visitor identically either way (§5.23's silence rule).

create function public.check_sign_in_code_rate_limit(
  p_email text,
  p_ip_address inet
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route text := 'sign_in_code_address:'
    || encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex');
  v_recent integer;
begin
  -- Five codes per IP per 15 minutes, the contact form's limit.
  if not public.check_rate_limit('sign_in_code', p_ip_address, 5, interval '15 minutes') then
    return false;
  end if;

  -- Three per address per 15 minutes, whatever IP asks, so one mailbox
  -- cannot be flooded from many.
  select count(*) into v_recent
  from public.rate_limit_hits
  where route = v_route
    and created_at > now() - interval '15 minutes';

  if v_recent >= 3 then
    return false;
  end if;

  insert into public.rate_limit_hits (route, ip_address) values (v_route, null);
  return true;
end;
$$;

-- The Server Action calls it on the service-role client; nobody else may,
-- since a caller who could spend another address's allowance could lock its
-- owner out of codes.
revoke all on function public.check_sign_in_code_rate_limit(text, inet) from public, anon, authenticated;
grant execute on function public.check_sign_in_code_rate_limit(text, inet) to service_role;
