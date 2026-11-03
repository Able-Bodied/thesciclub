-- ============================================================================
-- Admin's invites, a page at a time
-- ============================================================================
-- Speed report of 2026-11-03, Fix 2. Admin read the whole admin_invites view,
-- which looks up a sign-in account twice for every invite: about 550 ms for
-- 1,205 invites, and the API returns at most 1,000 rows anyway.
--
-- admin_invite_page: what admin_invites returns, newest first, 50 at a time
-- (up to 200), with the total. The page is picked first; only its rows look
-- up an account, once each. Administrators only, as admin_member_search
-- (20261029230000). admin_invites itself is left as it is.
-- ============================================================================

create or replace function public.admin_invite_page(
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
  total bigint
)
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
  with page as (
    select i.*, count(*) over () as total
      from public.invites i
     order by i.created_at desc, i.id desc
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
    i.total
  from page i
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
  order by i.created_at desc, i.id desc;
end;
$$;

comment on function public.admin_invite_page(integer, integer) is
  'A page of admin_invites, newest first, with the total; accounts looked up for that page only. Administrators only. See 20261103130000.';

revoke all on function public.admin_invite_page(integer, integer) from public, anon;
grant execute on function public.admin_invite_page(integer, integer) to authenticated;

notify pgrst, 'reload schema';
