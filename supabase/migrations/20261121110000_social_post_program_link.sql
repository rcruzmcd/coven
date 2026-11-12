-- A social post can be linked to a program (#1838, part of #1835).
--
-- The same shape as the event link (#1792, 20261113100000): optional, the
-- composite (tenant_id, program_id) -> programs (tenant_id, id) key so a post
-- cannot point at another tenant's program, and `on delete set null
-- (program_id)` so deleting a program clears the link and keeps the post (the
-- bare `set null` would try to null tenant_id too). The three links are
-- independent: a post may have any combination of calendar item, event and
-- program, or none.
--
-- Additive only: `main` lags `development`, and nothing there reads or writes
-- the column. RLS is unchanged -- the policies check `content_calendar` and
-- never look at a linked row. `content_opportunities` is already audited.

alter table public.content_opportunities
  add column program_id uuid,
  add constraint content_opportunities_program_id_fkey
    foreign key (tenant_id, program_id)
    references public.programs (tenant_id, id)
    on delete set null (program_id);

-- A program's posts, and the set-null lookup when a program is deleted.
create index content_opportunities_tenant_program_idx
  on public.content_opportunities (tenant_id, program_id);

comment on column public.content_opportunities.program_id is
  'The program this post is for, if any (#1838). Same-tenant by the composite foreign key; cleared when the program is deleted.';
