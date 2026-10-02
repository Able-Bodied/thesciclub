-- ============================================================================
-- Strike and invite counts are not for strangers
-- ============================================================================
-- From the Supabase advisor, 2026-10-01. Two definer functions counted for any
-- member id they were handed, and anybody could call them, signed in or not:
--
--   active_strike_count(target)  how many strikes stand against a member.
--                                "Private from other members" (CONTEXT.md,
--                                20260916040000), and a strike's rows are; this
--                                function answered the same question about
--                                anybody, over the public API.
--   live_invite_count(member_id) how many invites a mentor has spent.
--
-- They cannot simply be revoked from authenticated. admin_members calls both
-- for every row, and Postgres checks a view's function calls against the
-- reader, not the view's owner; the mentors' insert policy on invites calls
-- live_invite_count(auth.uid()). So each now answers only:
--   * about the caller themself — the mentors' policy, and Me if it ever asks;
--   * for an administrator — admin_members, admin_add_strike;
--   * for a caller with no account at all — the service role, and the
--     superuser in a probe. anon, the other account-less caller, loses
--     execute below, so a null auth.uid() here is the server.
-- Anybody else gets null: not a count of nothing, which would be a lie, but no
-- answer.
--
-- The bodies are 20260916040000's and 20260910120200's, inside the gate, with
-- an empty search_path and every name qualified.
-- ============================================================================

create or replace function public.active_strike_count(target uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target = auth.uid() or auth.uid() is null or public.is_admin() then (
      select count(*)::integer
        from public.member_strikes
       where member_id = target
         and withdrawn_at is null
         and issued_at > now() - public.strike_window()
    )
  end;
$$;

create or replace function public.live_invite_count(member_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when live_invite_count.member_id = auth.uid() or auth.uid() is null or public.is_admin() then (
      select count(*)::integer
        from public.invites i
       where i.invited_by_member_id = live_invite_count.member_id
         and i.status in ('pending', 'consumed')
    )
  end;
$$;

revoke all on function public.active_strike_count(uuid) from public, anon;
revoke all on function public.live_invite_count(uuid) from public, anon;
grant execute on function public.active_strike_count(uuid) to authenticated;
grant execute on function public.live_invite_count(uuid) to authenticated;
