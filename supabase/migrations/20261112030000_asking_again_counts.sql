-- Asking for an invite again counts against the daily limit.
--
-- 20261029030000 capped requests at 3 a day per address and 300 a day in all
-- by counting invite_requests rows, but asking again while a request is open
-- only refreshes that row, so the same address could ask without limit and
-- notify (and push to) the same org admin every time. Found making nightly
-- check rate_limits/invite_requests exercise the real path (2026-11-12).
-- Each accepted ask is now kept for two days in private.invite_request_asks
-- and counted there. A refusal is HTTP 429 with code P0001 (it was 54000, a
-- 500, which the app showed as "Something went wrong").

create table private.invite_request_asks (
  email extensions.citext not null,
  created_at timestamptz not null default now()
);
create index invite_request_asks_email_idx on private.invite_request_asks (email, created_at);
create index invite_request_asks_time_idx on private.invite_request_asks (created_at);

-- Today's open requests count as asked, so the limit holds from the start.
insert into private.invite_request_asks (email, created_at)
select q.email, q.created_at from public.invite_requests q
 where q.created_at > now() - interval '1 day';

create or replace function public.request_invite(
  p_organization uuid,
  p_admin uuid,
  p_name text,
  p_email text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := nullif(btrim(coalesce(p_name, '')), '');
  address text := public.normalize_email(p_email);
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  made uuid;
begin
  if not exists (
    select 1
      from public.organizations o
      join public.organization_representatives r on r.organization_id = o.id and r.member_id = p_admin
      join public.members m on m.id = r.member_id and m.status = 'active' and not m.is_seed
     where o.id = p_organization and o.removed_at is null and (o.can_invite or o.is_the_club)
  ) then
    raise exception 'Choose somebody from the list to ask.' using errcode = '22023';
  end if;
  if clean_name is null or char_length(clean_name) > 100 then
    raise exception 'Say your name.' using errcode = '22023';
  end if;
  if address is null or not private.valid_email(address) then
    raise exception 'Enter an email address the invite can be sent to.' using errcode = '22023';
  end if;
  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception 'Keep the note to 500 characters.' using errcode = '22023';
  end if;
  -- Counted by asking, not by row: asking again only refreshes the open row.
  delete from private.invite_request_asks a where a.created_at < now() - interval '2 days';
  if (select count(*) from private.invite_request_asks a
       where a.email = address::extensions.citext and a.created_at > now() - interval '1 day') >= 3
     or (select count(*) from private.invite_request_asks a
          where a.created_at > now() - interval '1 day') >= 300 then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'P0001', 'message', 'Too many requests today. Try again tomorrow.',
        'details', null, 'hint', null)::text,
      detail = json_build_object('status', 429, 'headers', json_build_object())::text;
  end if;
  insert into private.invite_request_asks (email) values (address);
  -- Said the same either way: a blocked address is accepted and goes nowhere.
  if public.is_blocked_email(address) then
    return;
  end if;

  insert into public.invite_requests (organization_id, admin_id, name, email, note)
  values (p_organization, p_admin, clean_name, address, clean_note)
  on conflict (organization_id, email) where status = 'open'
  do update set admin_id = excluded.admin_id, name = excluded.name, note = excluded.note,
                created_at = now()
  returning id into made;

  insert into public.notifications as n (member_id, kind, tag, organization_id, detail)
  values (p_admin, 'invite_request', 'invite_request:' || p_organization::text, p_organization, clean_name)
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), count = n.count + 1, detail = excluded.detail,
                seen_at = null;

  perform public.push_notify_send('invite_request', jsonb_build_object('id', made));
end;
$$;

revoke all on function public.request_invite(uuid, uuid, text, text, text) from public;
grant execute on function public.request_invite(uuid, uuid, text, text, text) to anon, authenticated;
