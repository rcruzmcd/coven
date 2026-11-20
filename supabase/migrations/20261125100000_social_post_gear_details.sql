-- Brand, Best for and "Why we love it" on a featured-gear post (#1906, part of
-- #1905): what the post says about its item beyond the item's own record, for
-- the caption placeholders {brand}, {best_for} and {why} and the Gear
-- Spotlight story frames. Typed on the post, not on the inventory item.
--
--   1. Three optional columns on content_opportunities. RLS is unchanged: they
--      follow the post's existing policies, and the row-level audit trigger
--      records their edits like any other post field.
--   2. set_social_post_featured_gear() clears them when the item changes, so a
--      new item never inherits the old one's brand or sentence. The app asks
--      before a swap that would discard them.
--
-- Additive: main's code neither reads nor writes these columns, and the
-- function keeps its signature. Tenant: no rows are written.

-- ---------------------------------------------------------------------------
-- 1. The fields
-- ---------------------------------------------------------------------------

alter table public.content_opportunities
  add column gear_brand text
    constraint content_opportunities_gear_brand_check
      check (char_length(gear_brand) <= 60),
  add column gear_best_for text
    constraint content_opportunities_gear_best_for_check
      check (char_length(gear_best_for) <= 40),
  add column gear_why text
    constraint content_opportunities_gear_why_check
      check (char_length(gear_why) <= 160);

comment on column public.content_opportunities.gear_brand is
  'The featured item''s brand, as this post states it (#1906). Cleared when the featured item changes.';
comment on column public.content_opportunities.gear_best_for is
  'Who or what the featured item is best for, e.g. "First season" (#1906). Cleared when the featured item changes.';
comment on column public.content_opportunities.gear_why is
  'One sentence on why the featured item is worth having, at most 160 characters (#1906). Cleared when the featured item changes.';

-- ---------------------------------------------------------------------------
-- 2. A swap clears them
-- ---------------------------------------------------------------------------

-- As 20261123100000, plus: the post's gear details are cleared with the item.
create or replace function public.set_social_post_featured_gear(
  p_post_id uuid,
  p_item_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_post public.content_opportunities;
  v_source text;
  v_item_id uuid;
begin
  if v_tenant_id is null or not public.has_permission('content_calendar', 'manage') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_post
    from public.content_opportunities
   where id = p_post_id
     and tenant_id = v_tenant_id
     for update;
  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;
  if v_post.content_status = 'published' then
    raise exception 'POST_PUBLISHED';
  end if;

  select s.content_source into v_source
    from public.social_post_series s
   where s.id = v_post.series_id;
  if v_source is distinct from 'random_gear_item' then
    raise exception 'NOT_GEAR_POST';
  end if;

  if p_item_id is null then
    v_item_id := public.social_post_gear_pick(
      v_post.series_id, v_post.id, v_post.featured_inventory_item_id
    );
    if v_item_id is null then
      raise exception 'NO_GEAR_AVAILABLE';
    end if;
  else
    select i.id into v_item_id
      from public.inventory_items i
     where i.id = p_item_id
       and i.tenant_id = v_tenant_id
       and public.inventory_item_is_featurable(i);
    if v_item_id is null then
      raise exception 'ITEM_NOT_ELIGIBLE';
    end if;
  end if;

  update public.content_opportunities
     set featured_inventory_item_id = v_item_id,
         gear_brand = null,
         gear_best_for = null,
         gear_why = null,
         updated_by = auth.uid()
   where id = v_post.id;

  return v_item_id;
end;
$$;

comment on function public.set_social_post_featured_gear(uuid, uuid) is
  'Swaps the Gear Library item a post of a random_gear_item series features (#1841): the given item or a new random pick, clearing the post''s brand, best-for and why-we-love-it (#1906). Keeps the post''s status; refused once published. Requires content_calendar manage.';
