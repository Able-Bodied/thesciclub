-- ============================================================================
-- Apple tells the club when a member's Apple account changes
-- ============================================================================
-- Sign in with Apple's server-to-server notifications reach the
-- `apple-notifications` edge function, which checks Apple's signature and
-- calls apple_notification_record() with the event. Four kinds:
--
--   consent-revoked  the member stopped using Sign in with Apple for the club
--   account-delete   the member deleted their Apple Account
--   email-disabled   Hide My Email stopped forwarding to them
--   email-enabled    ...and started again
--
-- The least that is safe: nothing is deleted from the club. For the first two
-- the stored Apple tokens go (Apple has already ended them) and the member
-- may have no way in left, so administrators are shown it, on Admin →
-- Sign-in. The email kinds are shown only when the account's own address is
-- that relay address: then the club's emails stop reaching the member.
--
-- A notice names the member and nothing else, and goes with the member.
-- Admin → Sign-in also says when revoking a deleted account's Apple sign-in
-- was given up (20261022160000), which nothing else would show.
-- ============================================================================

create table if not exists public.apple_account_notices (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('consent-revoked', 'account-delete', 'email-disabled', 'email-enabled')),
  received_at timestamptz not null default now()
);

comment on table public.apple_account_notices is
  'Apple''s notices about a member''s Apple account, for administrators. See 20261022170000.';

create index if not exists apple_account_notices_member on public.apple_account_notices (member_id);

alter table public.apple_account_notices enable row level security;
revoke all on public.apple_account_notices from public, anon, authenticated, service_role;
grant select on public.apple_account_notices to authenticated;

drop policy if exists "administrators read Apple notices" on public.apple_account_notices;
create policy "administrators read Apple notices"
  on public.apple_account_notices for select
  using (public.is_admin());

-- ----------------------------------------------------------- recording one
-- The function only. Returns whether a notice was kept.
create or replace function public.apple_notification_record(p_sub text, p_kind text, p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid;
  address text;
begin
  if p_kind not in ('consent-revoked', 'account-delete', 'email-disabled', 'email-enabled') then
    return false;
  end if;

  select i.user_id into account
    from auth.identities i where i.provider = 'apple' and i.provider_id = p_sub;

  if p_kind in ('consent-revoked', 'account-delete') then
    delete from private.apple_tokens t where t.apple_sub = p_sub;
  end if;

  if account is null or not exists (select 1 from public.members m where m.id = account) then
    return false;
  end if;

  if p_kind in ('email-disabled', 'email-enabled') then
    select lower(u.email::text) into address from auth.users u where u.id = account;
    if address is null or address is distinct from lower(btrim(coalesce(p_email, ''))) then
      return false;
    end if;
  end if;

  insert into public.apple_account_notices (member_id, kind) values (account, p_kind);
  return true;
end;
$$;

revoke all on function public.apple_notification_record(text, text, text) from public, anon, authenticated;
grant execute on function public.apple_notification_record(text, text, text) to service_role;

-- --------------------------------------------------------- reading them
-- First, one line for Apple revocations given up after seven tries
-- (20261022160000): nobody else would hear of them. Then the notices.
drop function if exists public.admin_apple_notices();
create or replace function public.admin_apple_notices()
returns table (
  kind text,
  received_at timestamptz,
  member_id uuid,
  display_name text,
  how_many integer,
  detail text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can do that.' using errcode = '42501';
  end if;
  return query
  select 'revoke-abandoned'::text, max(r.last_tried_at), null::uuid, null::text,
         count(*)::integer, (array_agg(r.last_error order by r.last_tried_at desc nulls last))[1]
    from private.apple_revocations r
   where r.attempts >= 7
  having count(*) > 0;
  return query
  select n.kind, n.received_at, n.member_id, m.display_name, null::integer, null::text
    from public.apple_account_notices n
    join public.members m on m.id = n.member_id
   order by n.received_at desc
   limit 50;
end;
$$;

revoke all on function public.admin_apple_notices() from public, anon;
grant execute on function public.admin_apple_notices() to authenticated;
