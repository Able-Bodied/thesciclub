-- ============================================================================
-- Admin's invites, a page at a time
-- ============================================================================
-- Speed report of 2026-11-03, Fix 2. Admin read the whole admin_invites view,
-- which looks up a sign-in account twice for every invite: about 550 ms for
-- 1,205 invites. And the API returns at most 1,000 rows, so the oldest were
-- missing from the list, the Withdrawn list, the header's count and the tally.
-- Admin now asks for what it draws, administrators only, as
-- admin_member_search (20261029230000):
--
-- admin_invite_page(part): admin_invites' columns, newest first, 50 at a time
--   (up to 200), with the total. The page is picked first; only its rows look
--   up an account, once each.
--   'listed'    every invite not withdrawn: "The list".
--   'withdrawn' withdrawn invites by address (the email, else the phone, any
--               case): the newest one, with how many times; none for an
--               address on the list again or blocked. As the app grouped them
--               (withdrawnInvites, src/routes/admin/members-admin.ts, before).
-- admin_invite_counts: invites waiting, for the header.
-- admin_join_tally: who joined while anybody could, by event and then by the
--   administrator whose code it was, most first, walk-ins last (joinTally,
--   before).
--
-- admin_invites itself is left as it is.
-- ============================================================================

create or replace function public.admin_invite_page(
  p_part text default 'listed',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  phone text,
  phone_raw text,
  status text,
  note text,
  created_at timestamptz,
  consumed_at timestamptz,
  invited_by_organization text,
  invited_by_member text,
  invited_by_member_is_admin boolean,
  claimable_name text,
  seed_member_id uuid,
  held_by text,
  held_by_status text,
  has_account boolean,
  account_created_at timestamptz,
  email extensions.citext,
  claimed_by uuid,
  claimed_at timestamptz,
  sent_at timestamptz,
  joined_while_open boolean,
  from_qr_code boolean,
  qr_event_name text,
  times integer,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  part text := coalesce(p_part, 'listed');
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  if part not in ('listed', 'withdrawn') then
    raise exception 'Unknown part: %', p_part using errcode = '22023';
  end if;

  return query
  with listed_keys as (
    select lower(coalesce(l.email::text, l.phone, l.id::text)) as key
      from public.invites l
     where l.status <> 'revoked'
  ),
  revoked as (
    select r.id, r.created_at, lower(coalesce(r.email::text, r.phone, r.id::text)) as key
      from public.invites r
     where r.status = 'revoked'
  ),
  withdrawn as (
    select distinct on (r.key) r.id, r.created_at, count(*) over (partition by r.key)::integer as times
      from revoked r
     where not exists (select 1 from listed_keys k where k.key = r.key)
       and not exists (select 1 from public.blocked_emails b where lower(b.email::text) = r.key)
     order by r.key, r.created_at desc, r.id desc
  ),
  chosen as (
    select i.id, i.created_at, 1 as times
      from public.invites i
     where part = 'listed' and i.status <> 'revoked'
    union all
    select w.id, w.created_at, w.times
      from withdrawn w
     where part = 'withdrawn'
  ),
  page as (
    select c.id, c.created_at, c.times, count(*) over () as total
      from chosen c
     order by c.created_at desc, c.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    i.id,
    i.phone,
    i.phone_raw,
    i.status,
    i.note,
    i.created_at,
    i.consumed_at,
    o.name,
    inviter.display_name,
    inviter.is_admin,
    claim.display_name,
    i.seed_member_id,
    holder.display_name,
    holder.status,
    account.created_at is not null,
    account.created_at,
    i.email,
    i.claimed_by,
    i.claimed_at,
    i.sent_at,
    i.joined_while_open,
    (i.qr_code_id is not null),
    qr.event_name,
    pg.times,
    pg.total
  from page pg
  join public.invites i on i.id = pg.id
  left join public.organizations o on o.id = i.invited_by_organization_id
  left join public.members inviter on inviter.id = i.invited_by_member_id
  left join public.members claim on claim.id = i.seed_member_id
  left join public.qr_codes qr on qr.id = i.qr_code_id
  left join lateral (
    select h.display_name, h.status
      from public.members h
     where h.invite_id = i.id
        or (i.phone is not null and h.phone = i.phone)
     order by coalesce(h.invite_id = i.id, false) desc
     limit 1
  ) holder on true
  left join lateral (
    select coalesce(
             private.account_created_at_for_invite(i.claimed_by, i.email::text),
             private.account_created_at(i.phone)
           ) as created_at
  ) account on true
  order by pg.created_at desc, pg.id desc;
end;
$$;

comment on function public.admin_invite_page(text, integer, integer) is
  'A page of admin_invites, listed or withdrawn by address, newest first, with the total; accounts looked up for that page only. Administrators only. See 20261103130000.';

create or replace function public.admin_invite_counts()
returns table (pending bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  return query select count(*) from public.invites i where i.status = 'pending';
end;
$$;

comment on function public.admin_invite_counts() is
  'How many invites are waiting. Administrators only. See 20261103130000.';

-- by_admin is [{name, joined}], most first; a name is null for an
-- administrator no longer here. Walk-ins are one row, with no event, last.
create or replace function public.admin_join_tally()
returns table (walk_ins boolean, event_name text, joined bigint, by_admin jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  return query
  with joins as (
    select i.qr_code_id is not null as coded, qr.event_name, inviter.display_name as admin_name
      from public.invites i
      left join public.qr_codes qr on qr.id = i.qr_code_id
      left join public.members inviter on inviter.id = i.invited_by_member_id
     where i.status = 'consumed' and i.joined_while_open
  ),
  per_admin as (
    select j.event_name, j.admin_name, count(*) as n
      from joins j
     where j.coded
     group by j.event_name, j.admin_name
  ),
  tally as (
    select false as walk_ins, p.event_name, sum(p.n)::bigint as joined,
           jsonb_agg(jsonb_build_object('name', p.admin_name, 'joined', p.n)
                     order by p.n desc, p.admin_name) as by_admin
      from per_admin p
     group by p.event_name
    union all
    select true, null, count(*), '[]'::jsonb
      from joins j
     where not j.coded
    having count(*) > 0
  )
  select t.walk_ins, t.event_name, t.joined, t.by_admin
    from tally t
   order by t.walk_ins, t.joined desc, t.event_name;
end;
$$;

comment on function public.admin_join_tally() is
  'Who joined while anybody could, by event and administrator, walk-ins last. Administrators only. See 20261103130000.';

revoke all on function public.admin_invite_page(text, integer, integer) from public, anon;
revoke all on function public.admin_invite_counts() from public, anon;
revoke all on function public.admin_join_tally() from public, anon;
grant execute on function public.admin_invite_page(text, integer, integer) to authenticated;
grant execute on function public.admin_invite_counts() to authenticated;
grant execute on function public.admin_join_tally() to authenticated;

notify pgrst, 'reload schema';
