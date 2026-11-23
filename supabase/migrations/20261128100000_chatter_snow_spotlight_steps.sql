-- Chatter Snow's Gear Spotlight steps (frame 3, "Get it"): drop "Tell us your
-- size and how you ride". The story features one item, already sized, so the
-- step asked for something the request does not need.
--
-- Only the row 20261126100000 seeded is changed: a value someone has since
-- edited in Site Content is theirs and is left alone.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

update public.site_content sc
set value = '[{"text":"Tap the link below and request it"},{"text":"We''ll sort pickup at the next event"}]'::jsonb
from public.tenants t
where t.id = sc.tenant_id
  and t.slug = 'chatter-snow'
  and sc.key = 'gears.spotlight_steps'
  and sc.value = '[{"text":"Tap the link below and request it"},{"text":"Tell us your size and how you ride"},{"text":"We''ll sort pickup at the next event"}]'::jsonb;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
