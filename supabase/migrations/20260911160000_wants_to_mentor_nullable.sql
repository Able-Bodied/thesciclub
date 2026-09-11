-- ============================================================================
-- wants_to_mentor: "not asked yet" is not the same as "no"
-- ============================================================================
-- The column was `not null default false`, so every member counted as having
-- answered the mentoring question the moment their row existed. Two things
-- followed from that:
--
--   * The survey's last screen advanced itself on arrival, because it was
--     already complete, so nobody could actually answer it.
--   * Profile completeness read higher than it was, crediting an answer nobody
--     had given.
--
-- Nullable, so the three states are distinguishable: yes, no, and not asked.
-- Existing rows keep false — they were all created under the old default and
-- there is no way to tell which of them meant it, so leaving them alone is the
-- honest option rather than guessing.
-- ============================================================================

alter table public.members alter column wants_to_mentor drop not null;
alter table public.members alter column wants_to_mentor drop default;
