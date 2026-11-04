-- ============================================================================
-- One badge request instead of four
-- ============================================================================
-- Speed report of 2026-11-03, Fix 3. The Chat dot, the bell, Me's dot and the
-- app icon each asked on their own, about nine times a minute per member.
-- my_badge_counts answers all four in one request:
--
--   chat_unread         chat_unread_count()
--   unseen              my_unseen_notification_count()
--   unseen_outside_chat my_unseen_notification_count_outside_chat()
--   icon_kinds          my_unseen_notification_kinds(), so notification_badge
--
-- It calls those four rather than copying their rules, so it cannot drift
-- from them: two-way blocks (20261103190000), muted conversations (200000)
-- and paused members (210000) come with them, and so will later changes.
-- The first draft (speed branch, 20261103170000) copied the bell's rules to
-- count both in one pass; that copy went stale within hours.
--
-- Security invoker; each function keeps its own rights. The four stay for
-- older store apps. Probe: supabase/tests/badge-counts-in-one.sql.
-- Undo: supabase/undo/20261103230000.sql.
-- ============================================================================

create or replace function public.my_badge_counts()
returns table (chat_unread integer, unseen integer, unseen_outside_chat integer, icon_kinds integer)
language sql
stable
set search_path = ''
as $$
  select public.chat_unread_count(),
         public.my_unseen_notification_count(),
         public.my_unseen_notification_count_outside_chat(),
         public.my_unseen_notification_kinds();
$$;

comment on function public.my_badge_counts() is
  'The Chat dot, the bell, Me''s dot and the app icon in one call. See 20261103230000.';

revoke all on function public.my_badge_counts() from public, anon;
grant execute on function public.my_badge_counts() to authenticated;

notify pgrst, 'reload schema';
