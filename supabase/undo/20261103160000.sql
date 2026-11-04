-- Undo for 20261103160000_admin_invites_a_page_at_a_time.sql: new functions,
-- so undoing drops them. Only once no app build calls them.

drop function if exists public.admin_invite_page(text, integer, integer);
drop function if exists public.admin_invite_counts();
drop function if exists public.admin_join_tally();
