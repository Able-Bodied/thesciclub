-- An administrator cannot be paused or removed from the application either.
--
-- Two of the three ways to end a membership already refused an administrator,
-- for a reason spelled out in 20260911130000 and repeated in 20260913010000:
-- two administrators must not be able to lock each other out of the club they
-- run, and the service role is the way an administrator is actually removed.
--
--   admin_delete_member  — refuses an admin target. Already.
--   admin_block_number   — refuses an admin target. Already.
--   admin_set_member_status — did not look at the target at all.
--
-- So the door everyone had closed twice was standing open on the third hinge:
-- `admin_set_member_status(other_admin, 'suspended')` worked, and a suspended
-- administrator fails `is_admin()`, which is `status = 'active'`. One
-- administrator could demote another to a member staring at suspended-screen
-- and keep the club to themselves. 'removed' was available the same way.
--
-- The self-guard was already here and stays: it is a different rule, about not
-- locking yourself out by accident, and it fires with a sentence about your own
-- account rather than about administrators in general.
create or replace function public.admin_set_member_status(target uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_is_admin boolean;
begin
  if not public.is_admin() then
    raise exception 'Not an administrator';
  end if;
  if new_status not in ('active', 'suspended', 'removed') then
    raise exception 'Unknown status: %', new_status;
  end if;
  if target = auth.uid() then
    raise exception 'You cannot change your own membership status';
  end if;

  select is_admin into target_is_admin from public.members where id = target;
  if not found then
    raise exception 'No such member';
  end if;
  if target_is_admin then
    raise exception 'An administrator''s membership cannot be changed from the application';
  end if;

  update public.members set status = new_status where id = target;
end;
$$;
