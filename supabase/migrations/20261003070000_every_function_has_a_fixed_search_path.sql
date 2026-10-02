-- ============================================================================
-- Every function has a fixed search_path
-- ============================================================================
-- From the Supabase advisor, 2026-10-01: nine early functions resolve names by
-- the caller's search_path. None is a definer function, so a caller who moves
-- their search_path can only confuse their own query; this is hygiene, and
-- the rest of the schema already does it. Each one names nothing outside
-- pg_catalog (regexp_replace, length, coalesce, now, current_date and
-- intervals), so the empty path changes nothing they do.
--
-- A SQL function with a SET clause is no longer inlined. strike_window,
-- strike_limit and mentor_invite_limit are constants read once per query, and
-- normalize_phone works on one number at a time; none sits in a hot loop.
-- ============================================================================

alter function public.touch_updated_at()          set search_path = '';
alter function public.normalize_phone(text)       set search_path = '';
alter function public.protect_admin_flag()        set search_path = '';
alter function public.assert_adult()              set search_path = '';
alter function public.invites_require_inviter()   set search_path = '';
alter function public.members_admin_is_mentor()   set search_path = '';
alter function public.strike_window()             set search_path = '';
alter function public.strike_limit()              set search_path = '';
alter function public.mentor_invite_limit()       set search_path = '';
