-- Demo tenant: social post formats, collaborators and tags (#1826).
--
-- The nightly demo reset's posts (20261115100000) gain a format each -- a
-- post, a reel and a story among them -- a collaborator on the gear drive
-- post and a tag on the volunteer spotlight, so the sheet's Content section
-- shows every part filled in. No media: the reset has no files to upload.
--
-- Tenant: only the demo tenant, inside seed_demo_tenant(), which names its
-- tenant (`t`) and refuses any tenant whose plan is not `demo`
-- (docs/tenants.md, "Writing migrations on a multi-tenant database").
--
-- Patched in place like 20261115100000, inserting before the same anchor, so
-- it runs right after the posts are inserted.
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
    raise exception '#1826: expected one match in %, found %', v_signature, v_count;
  end if;

  execute replace(v_def, v_find, $seed$  -- Social post content (#1826) ---------------------------------------------
  update public.content_opportunities o
     set post_format = f.post_format,
         collaborator_handles = f.collaborators
    from (values
      ('Opener recap: 47 riders, 22 new faces', 'instagram_post', array[]::text[]),
      ('Fitting night: what to bring', 'instagram_reel', array[]::text[]),
      ('Fitting night: last call to register', 'instagram_story', array[]::text[]),
      ('Midwinter social: save the date', 'instagram_post', array[]::text[]),
      ('Gear drive drop-off bins are out', 'instagram_post', array['northfork.outfitters']),
      ('What to wear for your first day', 'instagram_reel', array[]::text[]),
      ('Volunteer spotlight: Dee', 'instagram_post', array[]::text[]),
      ('Gear library FAQ', 'instagram_story', array[]::text[])
    ) as f(title, post_format, collaborators)
   where o.tenant_id = t
     and o.title = f.title;

  insert into public.social_post_tags (tenant_id, content_opportunity_id, handle, position)
  select t, o.id, 'dee.rides', 0
    from public.content_opportunities o
   where o.tenant_id = t
     and o.title = 'Volunteer spotlight: Dee';

$seed$ || v_find);
end
$patch$;
