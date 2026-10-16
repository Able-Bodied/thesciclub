-- ============================================================================
-- Disability details: high and low para, and relatives
-- ============================================================================
-- The owner, 2026-10-15. "Your spinal cord" becomes "Disability details",
-- and "Which describes you best?" offers:
--
--   quad        Quadriplegic (tetraplegic)    a level C1 to C8
--   high_para   High para (T1–T8)             a level T1 to T8
--   low_para    Low para (T9+)                a level T9 down
--   condition   Other disability              named from a list (central
--                                             cord syndrome among them) or
--                                             typed
--   family      Relative/Spouse               a member with no level
--
-- 'para' and 'central_cord' stay allowed: members who gave them keep them
-- (20261015000000), and the app still reads them, but no longer offers them.
-- A relative's level_range is 'Not sure yet', as for anybody without a level,
-- and the app shows "Family member".
-- ============================================================================

alter table public.members drop constraint if exists members_injury_type_check;

alter table public.members
  add constraint members_injury_type_check
    check (injury_type is null or injury_type in (
      'quad', 'high_para', 'low_para', 'condition', 'family', 'para', 'central_cord'));

comment on column public.members.injury_type is
  'quad, high_para, low_para, condition or family (para and central_cord before 20261015040000); null when not said.';
