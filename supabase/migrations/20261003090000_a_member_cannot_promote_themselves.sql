-- ============================================================================
-- A member cannot promote, reinstate or delete themselves
-- ============================================================================
-- "members can update own row" and "members insert own row" are what Your
-- details, the survey and joining write through, and both let the caller set
-- any column of their own row. protect_admin_flag (20260911130000) closed one
-- of them, `is_admin`, on update only. Found on 2026-10-01, probing the
-- administrators' protections, with nothing but a member's own session:
--
--   * joining with `is_admin = true` made an administrator. The flag trigger
--     is before update, and joining is an insert.
--   * a suspended member set their own `status` back to 'active'.
--   * a peer set their own `type` to 'mentor', and a mentor can put numbers on
--     the invite list: the way round "invite only".
--   * a member changed their own `phone`, the club's identity, which blocks
--     and invites are keyed on.
--   * an administrator suspended or deleted their own row, which the app and
--     delete_my_account() both refuse ("no administrator is removed from the
--     application").
--
-- None of those columns is written by a screen. Each has its own door, and
-- every door is a security definer function, which runs as its owner rather
-- than as `authenticated`: admin_set_member_status, admin_set_member_type,
-- admin_delete_member, admin_block_number, delete_my_account, and the
-- invite-consuming trigger that sets `invite_id`. So the guard is the one
-- protect_admin_flag already uses: refuse when the writer is `authenticated`.
-- The doors are untouched.
--
-- Named to fire first ("members_a_…" sorts before every other trigger on the
-- table), so it judges what the caller sent, before the invite trigger sets
-- `invite_id` and members_admin_is_mentor coerces `type` for an administrator.
-- ============================================================================

create or replace function public.guard_own_member_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Joining makes an active peer. Everything else about a membership is
    -- decided by an administrator afterwards, or by the invite trigger.
    if new.is_admin
       or new.type <> 'peer'
       or new.status <> 'active'
       or new.is_seed
       or new.invite_id is not null then
      raise exception 'A new member joins as an active peer. The rest is decided by an administrator.';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Membership status is changed by an administrator, not from your own profile';
  end if;
  if new.type is distinct from old.type then
    raise exception 'Becoming a mentor is decided by an administrator, not from your own profile';
  end if;
  if new.phone is distinct from old.phone then
    raise exception 'Your phone number is your account and cannot be changed from your profile';
  end if;
  if new.is_seed is distinct from old.is_seed or new.invite_id is distinct from old.invite_id then
    raise exception 'That is a record of how you joined and cannot be changed from your profile';
  end if;
  return new;
end;
$$;

comment on function public.guard_own_member_row() is
  'Refuses a member writing their own status, type, phone, is_seed or invite_id, or joining as anything but an active peer. Definer functions are not affected.';

drop trigger if exists members_a_guard_own_row on public.members;
create trigger members_a_guard_own_row
  before insert or update on public.members
  for each row execute function public.guard_own_member_row();

-- And no deleting your own row straight through the table. Leaving is
-- delete_my_account(), which also takes the photograph, the device, the
-- invites and the sign-in account, and refuses an administrator. A bare delete
-- did none of that, and let an administrator remove themselves. Nothing in
-- the app deletes through this policy; the auth trigger that removes a member
-- with their account is a definer function and does not need it.
drop policy if exists "members can delete own row" on public.members;
