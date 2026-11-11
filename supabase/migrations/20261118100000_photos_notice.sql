-- #1555: sending an event's photos to the people who registered for it.
--
-- The registration form says, under its email field, that the address will
-- also carry the event's photos afterward. It is a `site_content` slot,
-- `events.photos_notice`, blank by default in `src/lib/site-content.ts`
-- because whether an organization mails its photos out is its own practice.
-- Notice, not acceptance (#1318): no box, and nothing stored against it.
--
-- The photos themselves are the event's public gallery (#1654), which Send
-- photos on the Registrants page links to, so this adds no column to an
-- event. The message it starts from, `events.photos_email_body`, keeps the
-- platform default.
--
-- Chatter Snow's sentence, seeded with the slot as the standing rule asks,
-- in 20261022160000's idiom: scoped by slug, `on conflict do nothing` so an
-- edit made first wins, and the triggers off so nobody is stamped on a change
-- nobody made. A clean no-op on a database without the tenant.
alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('events.photos_notice', '"We''ll also use this email to send you the photos from the event."')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
