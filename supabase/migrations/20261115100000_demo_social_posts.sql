-- Demo tenant: social posts (#1797, last of the social content calendar epic
-- #1791).
--
-- The nightly demo reset gets a handful of posts to show on /portal/social,
-- an event's Social content section and a calendar item's card: standalone,
-- event-linked, calendar-item-linked and one linked to both, across the
-- status ladder, with one left unscheduled for the calendar's tray.
--
-- Tenant: only the demo tenant. These rows are written inside
-- seed_demo_tenant(), which names its tenant (`t`) on every insert and
-- refuses any tenant whose plan is not `demo` in its first statement
-- (docs/tenants.md, "Writing migrations on a multi-tenant database"). No
-- existing tenant's rows are touched; Chatter Snow plans its own posts.
--
-- Patched in place, as 20261021190000 did, since seed_demo_tenant() is
-- several hundred lines and this is an insert before its governance section.
-- It runs after the calendar items, so it finds them by title. The anchor
-- must match exactly once.
do $patch$
declare
  v_signature constant text := 'public.seed_demo_tenant(uuid, uuid, uuid)';
  v_find constant text := '  -- Governance ----------------------------------------------------------------';
  v_def text;
  v_count int;
begin
  v_def := pg_get_functiondef(v_signature::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, v_find, ''))) / length(v_find);
  if v_count <> 1 then
    raise exception '#1797: expected one match in %, found %', v_signature, v_count;
  end if;

  execute replace(v_def, v_find, $seed$  -- Social posts (#1797) ------------------------------------------------------
  -- Standalone, event-linked, item-linked and both, one of them unscheduled.
  insert into public.content_opportunities (
    tenant_id, title, content, content_status, skip_reason, owner_id, reviewer_id,
    event_id, calendar_item_id, publish_due_at, review_due_at, draft_due_at,
    status_changed_by, status_changed_at, created_by
  )
  values
    (t, 'Opener recap: 47 riders, 22 new faces', 'Photo carousel from the base area and a thank-you to the resort.',
      'published', null, p_ines, p_rowan, ev_opener, null,
      now() - interval '38 days', now() - interval '40 days', now() - interval '41 days',
      actor, now() - interval '38 days', actor),
    (t, 'Fitting night: what to bring', 'Socks you ride in, your height and weight, and an hour.',
      'scheduled', null, p_kai, p_ines, ev_fitting, null,
      now() + interval '12 days', now() + interval '8 days', now() + interval '5 days',
      actor, now() - interval '1 day', actor),
    (t, 'Fitting night: last call to register', null,
      'draft', null, p_kai, p_ines, ev_fitting, null,
      now() + interval '16 days', now() + interval '13 days', now() + interval '10 days',
      actor, now() - interval '2 days', actor),
    (t, 'Midwinter social: save the date', 'Food, the year in photos and the giveaway. Link to tickets.',
      'in_review', null, p_rowan, p_ines, ev_social,
      (select ci.id from public.calendar_items ci where ci.tenant_id = t and ci.title = 'Midwinter Social and Giveaway'),
      now() + interval '27 days', now() + interval '24 days', now() + interval '20 days',
      actor, now() - interval '1 day', actor),
    (t, 'Gear drive drop-off bins are out', null,
      'idea', null, p_ines, null, null,
      (select ci.id from public.calendar_items ci where ci.tenant_id = t and ci.title = 'Gear drive with Northfork Outfitters'),
      now() + interval '24 days', now() + interval '21 days', now() + interval '18 days',
      null, null, actor),
    (t, 'What to wear for your first day', 'Layers, not cotton. The gear library lends the rest.',
      'approved', null, p_ines, p_sasha, null,
      (select ci.id from public.calendar_items ci where ci.tenant_id = t and ci.title = 'Beginner-season content push'),
      now() + interval '13 days', now() + interval '9 days', now() + interval '6 days',
      actor, now() - interval '3 days', actor),
    (t, 'Volunteer spotlight: Dee', 'Dee has led the intermediate group for three seasons.',
      'published', null, p_ines, p_rowan, null, null,
      now() - interval '10 days', now() - interval '12 days', now() - interval '14 days',
      actor, now() - interval '10 days', actor),
    (t, 'Season pass fund explainer', null,
      'skipped', 'Waiting until the pilot is reviewed in spring.', p_sasha, null, null, null,
      now() + interval '5 days', null, null,
      actor, now() - interval '4 days', actor),
    (t, 'Gear library FAQ', 'Who can borrow, for how long, and what it costs (nothing).',
      'idea', null, null, null, null, null,
      null, null, null,
      null, null, actor);

$seed$ || v_find);
end
$patch$;
