-- #1907 (Gear Spotlight images 2/4): per-tenant category colours and the
-- story's fixed copy.
--
-- A category's colour is an index into the tenant's own accent stops
-- (`brand.accent_stops`), not a hex. The story template's category pill has to
-- match the tenant's palette, so a colour picked here follows the palette when
-- the tenant changes it, and no colour exists that the brand does not. The
-- index is taken modulo the number of stops when read (src/lib/
-- inventory-category-colors.ts), so a palette that shrinks never strands one.
--
-- Two columns rather than one map, because the reference design colours by
-- *category* (Skis red, Boards orange) while most categories are fine with
-- their group's colour (Outerwear green covers Jacket, Pants, Shell...):
--
--   category.accent_stop  ->  its group's accent_stop  ->  the group's place
--                                                           in sort_order
--
-- Null everywhere is the default, so every tenant has colours without setting
-- anything. Both tables already carry tenant_id under RLS, and the
-- `inventory:manage` update policies already cover the new columns.

alter table public.inventory_category_groups
  add column accent_stop smallint
    check (accent_stop between 0 and 7);

alter table public.inventory_categories
  add column accent_stop smallint
    check (accent_stop between 0 and 7);

comment on column public.inventory_category_groups.accent_stop is
  'Index into the tenant''s brand.accent_stops for this group''s colour (#1907). Null: the group''s position in sort_order, cycling through the stops. Upper bound is MAX_ACCENT_STOPS - 1 in src/lib/branding.ts.';
comment on column public.inventory_categories.accent_stop is
  'Index into the tenant''s brand.accent_stops for this category''s colour (#1907). Null: its group''s colour.';

-- ---------------------------------------------------------------------------
-- Chatter Snow's mapping, from the Gear Spotlight reference design: Skis red,
-- Boards orange, Boots yellow, Outerwear green, Goggles & helmets blue,
-- Accessories purple. Its stops (20260908060000) are red, orange, yellow,
-- green, blue, purple, so those are indexes 0-5.
--
-- Scoped by slug, so the demo and platform tenants and a fresh local or CI
-- database (`example-nonprofit`) are untouched and keep exercising the
-- default cycle. Only a still-null colour is written, so a choice made from
-- the portal before this runs wins. Triggers off for the write: no person
-- made this change.
-- ---------------------------------------------------------------------------

alter table public.inventory_category_groups
  disable trigger set_updated_at,
  disable trigger audit_log_row;
alter table public.inventory_categories
  disable trigger set_updated_at,
  disable trigger audit_log_row;

update public.inventory_category_groups g
set accent_stop = v.stop
from public.tenants t,
  (values
    ('hardgoods', 0),
    ('footwear', 2),
    ('outerwear', 3),
    ('protection', 4),
    ('accessories', 5)
  ) as v(key, stop)
where t.slug = 'chatter-snow'
  and g.tenant_id = t.id
  and g.key = v.key
  and g.accent_stop is null;

-- Skis and boards share Hardgoods, and goggles sit in Accessories, so these
-- are the categories whose colour is not their group's.
update public.inventory_categories c
set accent_stop = v.stop
from public.tenants t,
  (values
    ('skis', 0),
    ('snowboard', 1),
    ('splitboard', 1),
    ('goggles', 4),
    ('helmet', 4)
  ) as v(key, stop)
where t.slug = 'chatter-snow'
  and c.tenant_id = t.id
  and c.key = v.key
  and c.accent_stop is null;

alter table public.inventory_category_groups
  enable trigger set_updated_at,
  enable trigger audit_log_row;
alter table public.inventory_categories
  enable trigger set_updated_at,
  enable trigger audit_log_row;

-- ---------------------------------------------------------------------------
-- Chatter Snow's story copy (frame 3, "Get it"). The slots ship with neutral
-- platform defaults (src/lib/site-content.ts, `gears:spotlight`); these are
-- the reference design's words. Step 3 was a placeholder there ("we'll sort
-- pickup at the next event"), so it is up for sign-off in the pull request.
-- ---------------------------------------------------------------------------

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('gears.spotlight_headline', '"Gear shouldn''t be the barrier."'),
  ('gears.spotlight_item_line', '"{item_name} is free to someone who needs it. No gatekeeping, no fuss."'),
  ('gears.spotlight_steps', '[{"text":"Tap the link below and request it"},{"text":"Tell us your size and how you ride"},{"text":"We''ll sort pickup at the next event"}]')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
