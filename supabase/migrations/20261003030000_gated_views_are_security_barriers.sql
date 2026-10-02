-- ============================================================================
-- Gated views are security barriers
-- ============================================================================
-- The Supabase advisor lists ten views as SECURITY DEFINER. That is on
-- purpose: each one is how a reader sees rows its policies would not show
-- them directly, and each carries its own gate in its WHERE —
--   is_admin()                 admin_blocked_numbers, admin_claimable_members,
--                              admin_invites, admin_members, admin_strikes
--   an active reader           browse_members (and event_attendees, through it)
--   is_member()                chat_authors
--   chat_room_is_readable(id)  chat_room_stats
-- and event_rsvp_counts, which is ungated because events are public and it
-- holds counts alone. All ten confirmed 2026-10-01.
--
-- Without security_barrier, Postgres may run a reader's own filter before the
-- view's gate, and a filter that raises an error on some rows says something
-- about rows the gate would have hidden. Tried 2026-10-01 as a non-admin:
--   select count(*) from admin_members
--    where 1 / (case when phone = '1333…' then 0 else 1 end) = 1;
-- returned 0 rather than dividing by zero — today's plans run the gate first,
-- because these gates do not depend on the row. That is the planner's choice,
-- not a promise, and chat_room_stats's gate does depend on the row. So all of
-- the gated ones say it, as admin_invites already did (20260929000000).
--
-- `create or replace view` drops the option (its grants survive; this does
-- not): a migration that redefines one of these views writes
-- `with (security_barrier = true)` again, as 20260929000000 does.
-- ============================================================================

alter view public.admin_blocked_numbers   set (security_barrier = true);
alter view public.admin_claimable_members set (security_barrier = true);
alter view public.admin_members           set (security_barrier = true);
alter view public.admin_strikes           set (security_barrier = true);
alter view public.browse_members          set (security_barrier = true);
alter view public.chat_authors            set (security_barrier = true);
alter view public.chat_room_stats         set (security_barrier = true);
alter view public.event_attendees         set (security_barrier = true);
