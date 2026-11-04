-- Undo for 20261103230000_one_badge_request.sql: one new function, so undoing
-- drops it. Only once no app build calls my_badge_counts.

drop function if exists public.my_badge_counts();
