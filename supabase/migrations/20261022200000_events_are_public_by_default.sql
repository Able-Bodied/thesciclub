-- ============================================================================
-- Every event is public unless its organizer says otherwise
-- ============================================================================
-- The owner, 2026-10-22, the day audiences went live (20261022180000): "All
-- events should default to public." The column's default becomes 'public',
-- so an event imported from an organization's calendar (written by the
-- ingest, which sets no audience) has a public page, as an event added in
-- the club already did through its form.
--
-- And the events already in the club become public too. Every one of them
-- was 'club' only because that was the column's default when audiences went
-- live hours ago, not because anybody chose it; an organizer who wants an
-- event for the club, its followers or chosen groups now says so on the form.
-- A public page shows what an organization would put on its own calendar
-- and nothing about who is going; inside the club a public event reads as
-- before.
-- ============================================================================

alter table public.events alter column audience set default 'public';

update public.events set audience = 'public' where audience = 'club';
