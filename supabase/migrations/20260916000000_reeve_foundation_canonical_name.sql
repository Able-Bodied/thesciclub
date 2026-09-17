-- Name the Reeve Foundation the way the club's own organization row names it.
--
-- An affiliation is free text, and it stays free text: a member may name a body
-- the club has no row for, and `organization_badge.tsx` draws a letter tile for
-- those on purpose. This is not that case. The club *does* have the row —
-- 'Christopher & Dana Reeve Foundation', short code CDRF, added by
-- 20260911290000 with a logo — but Bob's and Matt's affiliations were written
-- by 20260910120400, which landed first and used the shorter name people
-- actually say.
--
-- So two members carried a string that named a real club organization and
-- matched nothing. `organizationByName` compares the whole name, case- and
-- space-insensitively, and correctly refused it. The visible cost was on the
-- peers deck, where those two cards drew a gold CRF tile while the same
-- foundation showed its logo one tab away under Events.
--
-- Fixed here rather than in the matcher. Loosening the comparison to bridge
-- "Christopher Reeve Foundation" and "Christopher & Dana Reeve Foundation"
-- means matching organizations on a resemblance, and the series matcher in
-- jobs/event-ingest/series.js is the standing warning about what that does:
-- "Bombers Weekly Power Soccer Practice" and "Shockers Weekly Power Soccer
-- Practice" score 0.892 and are two different teams. Organization identity
-- decides whose logo sits on a member's card and who is recorded as vouching
-- for them; it should be an exact match against a name somebody chose, not a
-- distance under a threshold.
--
-- Both tables are updated. `directory_seed` is the snapshot
-- `admin_restore_directory()` reads, so fixing `members` alone would leave the
-- old string waiting to come back the next time somebody rehearsed a claim and
-- pressed Restore directory.

update members
set affiliations = array_replace(
  affiliations,
  'Christopher Reeve Foundation',
  'Christopher & Dana Reeve Foundation'
)
where affiliations @> array['Christopher Reeve Foundation']::text[];

update directory_seed
set affiliations = array_replace(
  affiliations,
  'Christopher Reeve Foundation',
  'Christopher & Dana Reeve Foundation'
)
where affiliations @> array['Christopher Reeve Foundation']::text[];

-- Bob's bio says "the Christopher Reeve Foundation" in prose, and is left
-- alone: that is a sentence he is described by, not an identifier anything
-- joins on.
