-- ============================================================================
-- Ajay's photograph, and letting somebody into the club before they have
-- answered everything
-- ============================================================================
--
-- ---------------------------------------------------------------------------
-- 1. The restored row pointed at the wrong place for its photograph
-- ---------------------------------------------------------------------------
-- 20260913020000 put Ajay back using the values from the original seed
-- migration — including its `photo_url`, which was an images.squarespace-cdn
-- URL. That column was renamed to `photo_path` by 20260910140000 and every
-- seeded photo moved into our own `photos` bucket, so the restore wrote a full
-- URL into a column that holds a bucket-relative path. `photoUrlFor` then
-- composed `.../photos/https://images.squarespace-cdn.com/...` and the badge
-- fell back to initials.
--
-- The file itself was never lost; only the row's pointer to it was wrong.
--
-- ---------------------------------------------------------------------------
-- 2. `state` becomes optional
-- ---------------------------------------------------------------------------
-- Onboarding is five questions and somebody claiming a seeded profile has
-- already had four of them answered on their behalf. They should be able to
-- get into the club and finish later from Me, which means the wizard needs a
-- Skip — and Skip has to produce a row the database will accept.
--
-- Everything else already allows for not knowing: `level_range` has a
-- 'Not sure yet' value, `exact_level` is nullable, `injury_date` is nullable
-- and paired with its precision, `city` is nullable, and there is no photo
-- requirement. `state` was the only NOT NULL among the answers, and there is
-- nothing special about it — it is less important than the injury level, which
-- has been optional from the start.
--
-- Null rather than an empty string, because '' is not a state and would sort,
-- filter and compare as though it were one. Two members who have both skipped
-- it are not from the same place, and `ranking.ts` was scoring them as though
-- they were.
-- ============================================================================

update public.members
   set photo_path = 'seed/c85c10bf-0226-394f-8c91-2a2ffc40a147.webp'
 where id = 'c85c10bf-0226-394f-8c91-2a2ffc40a147'
   and photo_path is distinct from 'seed/c85c10bf-0226-394f-8c91-2a2ffc40a147.webp';

alter table public.members alter column state drop not null;

comment on column public.members.state is
  'Two-letter state. Null means not answered yet — onboarding can be skipped after the birthday, and Me is where it gets filled in.';
