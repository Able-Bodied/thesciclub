-- ============================================================================
-- Admin › Sent lists every email, not only the ones that did not arrive
-- ============================================================================
-- The owner, 2026-11-23: each email should have its "Show the message" in the
-- list without looking an address up first. The list now has each email of
-- the period once, as it last stood, with the pushes that did not arrive.

create or replace function public.admin_deliveries(p_days integer default 7, p_email text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
  wanted text := case when nullif(trim(p_email), '') is null then null
                      else encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex') end;
begin
  if not public.is_admin() then
    raise exception 'Only administrators read what was sent.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'by_outcome', coalesce((
      select jsonb_agg(jsonb_build_object('channel', d.channel, 'kind', d.kind,
                                          'outcome', d.outcome, 'count', d.n)
                       order by d.channel, d.n desc)
        from (select l.channel, l.kind, l.outcome, count(*) as n
                from public.delivery_log l where l.at > since
               group by 1, 2, 3) d), '[]'),
    'by_device', coalesce((
      select jsonb_agg(jsonb_build_object('device', d.device, 'outcome', d.outcome, 'count', d.n)
                       order by d.n desc)
        from (select l.device, l.outcome, count(*) as n
                from public.delivery_log l where l.at > since and l.channel = 'push'
               group by 1, 2) d), '[]'),
    'latest', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'channel', l.channel,
                                          'kind', l.kind, 'outcome', l.outcome,
                                          'reason', l.reason, 'service', l.service,
                                          'device', l.device, 'release', l.release,
                                          'app_version', l.app_version,
                                          'readable', l.message_id is not null)
                       order by l.at desc)
        from (select * from (
                -- An email once, as it last stood (sent, then delivered or bounced).
                select distinct on (coalesce(l.message_id, l.id::text)) l.*
                  from public.delivery_log l
                 where l.at > since and l.channel = 'email'
                   and (wanted is null or l.address_hash = wanted)
                 order by coalesce(l.message_id, l.id::text), l.at desc, l.id desc) e
              union all
              -- A push only when it did not arrive, and never when one address is asked about.
              select * from public.delivery_log l
               where l.at > since and l.channel = 'push' and wanted is null
                 and l.outcome not in ('sent', 'delivered')
              order by at desc limit 60) l), '[]')
  );
end;
$$;

notify pgrst, 'reload schema';
