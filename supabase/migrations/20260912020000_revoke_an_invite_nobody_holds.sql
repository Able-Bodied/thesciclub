-- ============================================================================
-- An invite nobody is on can be revoked
-- ============================================================================
-- `admin_revoke_invite` refuses any consumed invite:
--
--   'That invite has already been used — remove the member instead'
--
-- which is right whenever somebody is actually on the number. Revoking a live
-- member's invite would take their membership away through the wrong door, and
-- admin_set_member_status is that door.
--
-- But it is also raised for an invite whose member has since been deleted, and
-- there the advice cannot be followed: there is no member to remove. That left
-- the row unreachable — the list called it "unused", offered no way to act on
-- it, and the number underneath it could not be invited again because
-- `invites_live_phone_idx` still counted the dead row as live.
--
-- So the refusal now tests what it actually means. Not "has this been used",
-- which is a fact about the past, but "is somebody on this number", which is
-- the thing that makes revoking the wrong tool. Joined on phone for the same
-- reason the admin view is: the phone is the club's identity, and a member who
-- rejoined after a deletion has a null invite_id.
--
-- 20260912000000 revokes on deletion, so invites stop reaching this state.
-- This is for the ones already sitting in it.
-- ============================================================================

create or replace function public.admin_revoke_invite(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite_phone text;
  current_status text;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;

  select status, phone into current_status, invite_phone
    from public.invites where id = target;
  if not found then
    raise exception 'No such invite';
  end if;

  if current_status = 'consumed'
     and exists (select 1 from public.members where phone = invite_phone) then
    raise exception 'That invite has already been used — remove the member instead';
  end if;

  update public.invites
     set status = 'revoked', revoked_at = now()
   where id = target;
end;
$$;

revoke all on function public.admin_revoke_invite(uuid) from public, anon;
grant execute on function public.admin_revoke_invite(uuid) to authenticated;
