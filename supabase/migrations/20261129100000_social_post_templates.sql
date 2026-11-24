-- Post templates 1/4 (#1924, part of #1923): which template a post is drawn
-- with, and the template text someone typed over on it.
--
--   1. content_opportunities.template_key: a key of the platform's template
--      registry (src/lib/social-content/post-templates.ts). The registry is
--      code, not rows, so the key is checked for shape only.
--   2. content_opportunities.template_text: only the fields someone typed
--      over, as {field_key: text}. A field left out shows its starting value
--      from the record. Caps are per field and live with the registry.
--   3. Gear Spotlight's Brand / Best for / Why (#1906) move onto it. main
--      still reads and writes gear_brand, gear_best_for and gear_why, so they
--      stay, and a trigger copies main's writes to them into template_text
--      until main catches up. The app writes both.
--
-- Additive: main's code neither reads nor writes the new columns, inserts
-- take their defaults, and no function changes signature. RLS is unchanged:
-- they follow the post's existing policies. Tenant: no rows are seeded; the
-- backfill only copies each post's own columns.

-- ---------------------------------------------------------------------------
-- 1-2. The columns
-- ---------------------------------------------------------------------------

alter table public.content_opportunities
  add column template_key text
    constraint content_opportunities_template_key_check
      check (template_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  add column template_text jsonb not null default '{}'::jsonb
    constraint content_opportunities_template_text_check
      check (jsonb_typeof(template_text) = 'object');

comment on column public.content_opportunities.template_key is
  'The post template this post is drawn with (#1924), a key of the registry in src/lib/social-content/post-templates.ts. Null: no template.';
comment on column public.content_opportunities.template_text is
  'The template fields someone typed over on this post, as {field_key: text} (#1924). A field left out shows its starting value from the record.';

-- ---------------------------------------------------------------------------
-- 3. Gear Spotlight
-- ---------------------------------------------------------------------------

-- main's writes to the gear columns land in template_text. A statement that
-- sets template_text itself (the app, which writes both) is left alone. A
-- post that features an item is a Gear Spotlight post.
create or replace function public.content_opportunities_sync_gear_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.template_key is null and new.featured_inventory_item_id is not null then
    new.template_key := 'gear_spotlight';
  end if;

  if (
    tg_op = 'INSERT'
    and num_nonnulls(new.gear_brand, new.gear_best_for, new.gear_why) > 0
    and new.template_text = '{}'::jsonb
  ) or (
    tg_op = 'UPDATE'
    and new.template_text is not distinct from old.template_text
    and (
      new.gear_brand is distinct from old.gear_brand
      or new.gear_best_for is distinct from old.gear_best_for
      or new.gear_why is distinct from old.gear_why
    )
  ) then
    new.template_text := (new.template_text - array['brand', 'best_for', 'why'])
      || jsonb_strip_nulls(jsonb_build_object(
           'brand', new.gear_brand,
           'best_for', new.gear_best_for,
           'why', new.gear_why
         ));
  end if;
  return new;
end;
$$;

comment on function public.content_opportunities_sync_gear_template() is
  'Until main reads template_text (#1924): sets a featured-gear post''s template_key and copies writes to gear_brand / gear_best_for / gear_why into template_text. Drop it with those columns.';

create trigger sync_gear_template
  before insert or update on public.content_opportunities
  for each row execute function public.content_opportunities_sync_gear_template();

-- The backfill is a data move, not an edit: no audit rows, no updated_at.
alter table public.content_opportunities
  disable trigger set_updated_at,
  disable trigger audit_log_row;

update public.content_opportunities
   set template_key = 'gear_spotlight',
       template_text = jsonb_strip_nulls(jsonb_build_object(
         'brand', gear_brand,
         'best_for', gear_best_for,
         'why', gear_why
       ))
 where featured_inventory_item_id is not null
    or num_nonnulls(gear_brand, gear_best_for, gear_why) > 0;

alter table public.content_opportunities
  enable trigger set_updated_at,
  enable trigger audit_log_row;
