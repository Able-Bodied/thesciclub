-- Undo for 20261103130000_admin_invites_a_page_at_a_time.sql: a new function,
-- so undoing it drops it. Only once no app build calls it.

drop function if exists public.admin_invite_page(integer, integer);
