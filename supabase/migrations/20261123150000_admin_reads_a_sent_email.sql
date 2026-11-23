-- ============================================================================
-- Admin › Sent: tap an email to read what it said
-- ============================================================================
-- The owner, 2026-11-23: "when you click on a email it shows what the message
-- was". The club keeps no email's words: Resend has them. Each row of Sent
-- now carries its id and whether it is an email Resend can be asked about;
-- the admin-email function asks this database for the row's Resend id (only
-- an administrator gets it) and fetches the message from Resend, with the
-- sign-in codes and one-time links hidden.

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
        from (select * from public.delivery_log l
               where l.at > since
                 and (wanted is null or l.address_hash = wanted)
                 and (wanted is not null or l.outcome not in ('sent', 'delivered'))
               order by l.at desc limit 60) l), '[]')
  );
end;
$$;

-- The admin-email function, as the signed-in administrator: which Resend
-- email a row of Sent was.
create function public.admin_email_message_id(p_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators read what was sent.' using errcode = '42501';
  end if;
  return (select l.message_id from public.delivery_log l
           where l.id = p_id and l.channel = 'email');
end;
$$;

revoke all on function public.admin_email_message_id(bigint) from public, anon;
grant execute on function public.admin_email_message_id(bigint) to authenticated;

notify pgrst, 'reload schema';
