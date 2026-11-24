-- Post templates 2/4 (#1925, part of #1923): a post's template can be chosen
-- on the post, including none.
--
-- #1924's sync trigger gives a post that features an item Gear Spotlight
-- whenever its template_key is null, on every insert and update -- so a post
-- set to "No template" was set back on its next save. It now does so only
-- when main is the writer that could need it: on insert, and when the
-- featured item itself changes (main's swap). The gear-column copy is
-- unchanged.
--
-- Additive: same function name and signature, same trigger. main never
-- writes template_key, and every featured-gear post already has one (the
-- #1924 backfill), so main sees no difference. No tenant rows.

create or replace function public.content_opportunities_sync_gear_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.template_key is null
     and new.featured_inventory_item_id is not null
     and (
       tg_op = 'INSERT'
       or new.featured_inventory_item_id is distinct from old.featured_inventory_item_id
     ) then
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
  'Until main reads template_text (#1924): gives a featured-gear post Gear Spotlight on insert or when its item changes (not on other updates, so "No template" stays, #1925), and copies writes to gear_brand / gear_best_for / gear_why into template_text. Drop it with those columns.';
