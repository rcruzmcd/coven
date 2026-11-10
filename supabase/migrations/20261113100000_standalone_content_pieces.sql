-- Content pieces stand on their own and can be linked to an event (#1792,
-- part of the social content calendar epic).
--
-- Since #1231 a calendar item has many content pieces (`content_opportunities`;
-- the table kept its name, see 20260918010000), but every piece still had to
-- belong to an item, and deleting the item deleted its pieces with it -- along
-- with the history of what was planned and published. A piece can now be
-- linked to a calendar item, an event, both or neither. Nothing relates the
-- two links: an item-linked piece about an event may name the event too, and
-- neither side has to agree with the other.
--
-- Both keys are the composite (tenant_id, <column>) -> parent (tenant_id, id)
-- form every tenant-to-tenant key takes since 20260906080000, so a piece
-- cannot point at another tenant's item or event whatever writes it. Both
-- are `on delete set null (<column>)`: deleting the parent clears the link
-- and keeps the piece. The bare `set null` would try to null tenant_id too
-- and fail on its not-null constraint.
--
-- Events: pieces are not added to event_linked_record_labels() (the list of
-- records that block deleting an event). Like governance meetings
-- (20261021110000), a piece survives the delete with its link cleared, and
-- refusing the delete over a social post would be the wrong way round.
--
-- RLS: unchanged. The four policies check the `content_calendar` resource
-- (and, since Phase 2, the row's tenant) and never look at the parent row,
-- so a piece with no item and no event is read and written under exactly
-- the same rules as one with both.

-- 1. The calendar item link becomes optional and stops cascading. The
-- constraint keeps its name, which PostgREST embed hints in src/ use.
alter table public.content_opportunities
  alter column calendar_item_id drop not null,
  drop constraint content_opportunities_calendar_item_id_fkey,
  add constraint content_opportunities_calendar_item_id_fkey
    foreign key (tenant_id, calendar_item_id)
    references public.calendar_items (tenant_id, id)
    on delete set null (calendar_item_id);

-- 2. The optional event link.
alter table public.content_opportunities
  add column event_id uuid,
  add constraint content_opportunities_event_id_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id)
    on delete set null (event_id);

-- 3. Indexes. (tenant_id, publish_due_at) for the calendar views, which
-- will read pieces by their own due date now that not every piece has an
-- item to hang off; (tenant_id, event_id) for an event's pieces, and for the
-- set-null lookup when an event is deleted.
create index content_opportunities_tenant_publish_due_idx
  on public.content_opportunities (tenant_id, publish_due_at);

create index content_opportunities_tenant_event_idx
  on public.content_opportunities (tenant_id, event_id);

comment on column public.content_opportunities.calendar_item_id is
  'The calendar item this piece is for, if any (#1792). Same-tenant by the composite foreign key; cleared when the item is deleted.';
comment on column public.content_opportunities.event_id is
  'The event this piece is for, if any (#1792). Same-tenant by the composite foreign key; cleared when the event is deleted.';
