-- #1798: the starter post plan an event's Social content section offers
-- ("Generate plan"). One app_settings row per tenant, a JSON list of
-- {title, offset_days}; offset_days counts whole days from the event start in
-- the tenant's org.timezone. Seeded per tenant (docs/tenants.md, "Writing
-- migrations on a multi-tenant database"); provision_tenant() copies content.*
-- settings from the template tenant, so a new tenant gets it too. The app
-- falls back to the same list when the row is missing or malformed
-- (src/lib/social-content/event-plan.ts). Editing it is a follow-up.
insert into public.app_settings (tenant_id, key, value)
select t.id, 'content.event_plan_template', '[
  {"title": "Announce", "offset_days": -30},
  {"title": "Reminder", "offset_days": -7},
  {"title": "Last call", "offset_days": -1},
  {"title": "Day-of", "offset_days": 0},
  {"title": "Recap / thank-you", "offset_days": 2}
]'::jsonb
from public.tenants t
on conflict (tenant_id, key) do nothing;
