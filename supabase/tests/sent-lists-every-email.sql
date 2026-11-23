-- Run after 20261123160000. All rows are rolled back.
begin;

insert into public.delivery_log (channel, kind, outcome, message_id, address_hash) values
  ('email', 'Probe one', 'sent', 'probe-email-1', 'probe-hash'),
  ('email', 'Probe one', 'delivered', 'probe-email-1', 'probe-hash'),
  ('email', 'Probe two', 'sent', 'probe-email-2', 'other-hash');
insert into public.delivery_log (channel, kind, outcome) values
  ('push', 'probe', 'sent'), ('push', 'probe', 'gone');

do $$
declare
  administrator uuid := (select id from public.members where is_admin and status = 'active' limit 1);
  latest jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', administrator)::text, true);
  latest := public.admin_deliveries(1, null) -> 'latest';
  if (select count(*) from jsonb_array_elements(latest) x where x->>'kind' = 'Probe one') <> 1
     or not exists (select 1 from jsonb_array_elements(latest) x
                     where x->>'kind' = 'Probe one' and x->>'outcome' = 'delivered') then
    raise exception 'An email should be listed once, as it last stood: %', latest;
  end if;
  if not exists (select 1 from jsonb_array_elements(latest) x where x->>'kind' = 'Probe two') then
    raise exception 'An email that was only sent should be listed';
  end if;
  if exists (select 1 from jsonb_array_elements(latest) x
              where x->>'channel' = 'push' and x->>'outcome' = 'sent') then
    raise exception 'A push that arrived should not be listed';
  end if;
  if not exists (select 1 from jsonb_array_elements(latest) x where x->>'outcome' = 'gone') then
    raise exception 'A push that did not arrive should be listed';
  end if;
end $$;

rollback;
