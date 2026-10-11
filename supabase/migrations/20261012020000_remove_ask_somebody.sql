-- ============================================================================
-- "Ask somebody you know for an invite" is removed
-- ============================================================================
-- The owner, 2026-10-10. The closed door's "ask somebody" (20261011000000),
-- Me's "let people who have my number ask me" switch and the client code went
-- in the same change. This drops what was behind them:
--
--   public.find_inviters(text[])        looked contacts' numbers up
--   public.my_number_is_invited()       its only remaining caller was
--                                       find_inviters; the members insert
--                                       policy moved to i_am_invited() in
--                                       20261012000000
--   public.invite_lookups               the daily-limit record (counts only)
--   public.members.findable_for_invites the switch
--
-- Searched first, in every migration and in the live catalog (functions,
-- views, policies, triggers, constraints): nothing else refers to any of the
-- four. `has_active_invite(text)` stays; the phone-invite trigger still uses
-- it. Order matters: the function that calls the other goes first, then the
-- table the function wrote to, then the column.
-- ============================================================================

drop function if exists public.find_inviters(text[]);
drop function if exists public.my_number_is_invited();
drop table if exists public.invite_lookups;
alter table public.members drop column if exists findable_for_invites;
