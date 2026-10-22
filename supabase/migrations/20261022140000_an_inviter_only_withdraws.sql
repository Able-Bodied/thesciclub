-- ============================================================================
-- An inviter may only withdraw their own unused invite
-- ============================================================================
-- The owner, 2026-10-22. The update policy let whoever sent an invite set an
-- unused one to any status, so a mentor could mark it used with nobody having
-- joined. Now the only change is pending to revoked (withdrawn), and the
-- withdrawal time is the database's, not the caller's.
--
-- Unchanged: the column grant (status, revoked_at), so the Invites screen's
-- update still works; claiming and joining (claim_invite and
-- consume_invite_for_new_member) and every admin_* function, which are
-- security definer and skip this policy. Administrators have no other update
-- policy on invites. Probe: supabase/tests/invite-withdrawal.sql.
-- ============================================================================

drop policy if exists "mentors can revoke their own pending invites" on public.invites;
drop policy if exists "an inviter withdraws their own unused invite" on public.invites;
create policy "an inviter withdraws their own unused invite"
  on public.invites for update to authenticated
  using (invited_by_member_id = auth.uid() and status = 'pending')
  with check (
    invited_by_member_id = auth.uid()
    and status = 'revoked'
    and seed_member_id is null
  );

-- Whatever revoked_at the caller sent, a withdrawal is stamped now.
create or replace function public.invites_stamp_revoked_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revoked_at := now();
  return new;
end;
$$;

revoke all on function public.invites_stamp_revoked_at() from public, anon, authenticated;

drop trigger if exists invites_stamp_revoked_at on public.invites;
create trigger invites_stamp_revoked_at
  before update of status on public.invites
  for each row
  when (new.status = 'revoked' and old.status is distinct from 'revoked')
  execute function public.invites_stamp_revoked_at();
