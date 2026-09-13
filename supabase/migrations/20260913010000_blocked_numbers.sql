-- ============================================================================
-- blocked_numbers — the door that stays shut
-- ============================================================================
-- Revoking an invite takes a number off the list. It does not keep it off:
-- `invites_live_phone_idx` is partial over pending and consumed precisely so
-- that a revoked number can be invited again, which is what makes "let them
-- back in" possible. That is the right default and it stays.
--
-- What was missing is the opposite intent — this number must not come back,
-- and nobody should be able to put it back by accident. An administrator who
-- removes somebody for harassing members has no way to say so today, and the
-- next mentor to meet that person can hand them an invite in good faith.
--
-- ---------------------------------------------------------------------------
-- Why a table and not a fourth invite status
-- ---------------------------------------------------------------------------
-- A ban is a fact about a number, not about an invitation. It has to apply to
-- somebody who was never invited at all, it has to outlive any particular
-- invite row, and it should not make `invites` — which is the record of who
-- vouched for whom — carry a second, contradictory meaning. Keyed on `phone`
-- for the same reason the holder join is: the phone is the club's identity and
-- it is what the auth gate verifies.
--
-- ---------------------------------------------------------------------------
-- Where it is enforced, and why one place is not enough
-- ---------------------------------------------------------------------------
-- 1. `has_active_invite` answers false for a blocked number. That is the real
--    gate: the members insert policy calls it, so a blocked number cannot
--    become a member row. The Before User Created hook calls it too, for
--    whenever it is enabled — it is deliberately off, see config.toml.
--
-- 2. A trigger refuses the insert into `invites`. This is not redundant.
--    `admin_create_invite` guards with `if has_active_invite(...) then` and
--    would read a blocked number as free and re-add it, and a mentor writes to
--    `invites` directly through their own policy. Both paths pass through the
--    trigger.
--
-- 3. `admin_block_number` revokes any live invite as it blocks, so a number
--    that is already on the list stops working immediately rather than at the
--    next attempt.
--
-- A ban cannot stop somebody creating an auth account, because the hook that
-- would is off on purpose: enabling it turns /auth/v1/otp into a per-number
-- test for whether somebody has a spinal cord injury. What it guarantees is
-- that they can never hold a member row, which is what membership is.
--
-- ---------------------------------------------------------------------------
-- Reversible, on purpose
-- ---------------------------------------------------------------------------
-- `admin_unblock_number` exists because a ban applied to the wrong number is a
-- real person locked out of a club they belong to, and the club is two dozen
-- people typing numbers by hand. Unblocking does not restore the membership —
-- that row is gone — it puts the number back where it was before: off the
-- list, and able to be invited again.
-- ============================================================================

create table if not exists public.blocked_numbers (
  id uuid primary key default gen_random_uuid(),
  phone_raw text not null,
  phone text generated always as (public.normalize_phone(phone_raw)) stored,
  reason text,
  blocked_by uuid references public.members (id) on delete set null,
  blocked_at timestamptz not null default now()
);

create unique index if not exists blocked_numbers_phone_idx on public.blocked_numbers (phone);

comment on table public.blocked_numbers is
  'Numbers that must not be invited or admitted again. A ban is about a number, not an invitation.';

alter table public.blocked_numbers enable row level security;
-- No policy for anybody. Administrators read it through the view below and
-- change it through the two functions; nothing else touches it. A member being
-- able to ask "is this number banned" is an oracle nobody needs.

-- ------------------------------------------------------------------ the test
-- Not granted to anyone. It is called from inside SECURITY DEFINER functions
-- that are themselves gated, so exposing it would only add a way to probe the
-- blocklist one number at a time.
create or replace function public.is_blocked(raw_phone text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.blocked_numbers
    where phone = public.normalize_phone(raw_phone)
  );
$$;

revoke all on function public.is_blocked(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ the gate
-- Same signature and same grants — `create or replace` keeps the privileges
-- the earlier migrations set, including the one to supabase_auth_admin.
create or replace function public.has_active_invite(raw_phone text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.invites
    where phone = public.normalize_phone(raw_phone)
      and status in ('pending', 'consumed')
  ) and not public.is_blocked(raw_phone);
$$;

-- --------------------------------------------------------------- the trigger
create or replace function public.invites_refuse_blocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_blocked(new.phone_raw) then
    raise exception 'That number is blocked from the club and cannot be invited';
  end if;
  return new;
end;
$$;

drop trigger if exists invites_refuse_blocked on public.invites;
create trigger invites_refuse_blocked
  before insert on public.invites
  for each row execute function public.invites_refuse_blocked();

-- --------------------------------------------------------------- the actions
create or replace function public.admin_block_number(raw_phone text, block_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_phone text := public.normalize_phone(raw_phone);
  target_member uuid;
  target_is_admin boolean;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if target_phone = '' then
    raise exception 'No number given';
  end if;

  select id, is_admin into target_member, target_is_admin
    from public.members where phone = target_phone;

  -- The same two guards admin_delete_member has, for the same reasons: an
  -- administrator cannot lock themselves out, and two administrators cannot
  -- lock each other out of the club they run.
  if target_member = auth.uid() then
    raise exception 'You cannot block your own number';
  end if;
  if target_is_admin then
    raise exception 'An administrator cannot be blocked from the application';
  end if;

  -- Their invite goes, so the number is off the list as well as barred from
  -- it. Revoked rather than deleted, keeping who vouched, exactly as
  -- admin_delete_member does.
  update public.invites
     set status = 'revoked', revoked_at = now()
   where phone = target_phone
     and status in ('pending', 'consumed');

  if target_member is not null then
    -- Standing invites they issued go with them: a door held open by somebody
    -- who is no longer here, and who was removed for cause.
    update public.invites
       set status = 'revoked', revoked_at = now()
     where invited_by_member_id = target_member
       and status = 'pending';

    delete from public.members where id = target_member;
  end if;

  insert into public.blocked_numbers (phone_raw, reason, blocked_by)
  values (target_phone, nullif(btrim(coalesce(block_reason, '')), ''), auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.admin_unblock_number(raw_phone text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  delete from public.blocked_numbers where phone = public.normalize_phone(raw_phone);
  if not found then
    raise exception 'That number is not blocked';
  end if;
end;
$$;

revoke all on function public.admin_block_number(text, text) from public, anon;
revoke all on function public.admin_unblock_number(text) from public, anon;
grant execute on function public.admin_block_number(text, text) to authenticated;
grant execute on function public.admin_unblock_number(text) to authenticated;

-- ------------------------------------------------------------------ the list
create view public.admin_blocked_numbers as
select
  b.id,
  b.phone,
  b.reason,
  b.blocked_at,
  blocker.display_name as blocked_by
from public.blocked_numbers b
left join public.members blocker on blocker.id = b.blocked_by
where public.is_admin();

revoke all on public.admin_blocked_numbers from anon, public;
grant select on public.admin_blocked_numbers to authenticated;
