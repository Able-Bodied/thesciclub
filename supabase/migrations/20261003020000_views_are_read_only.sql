-- ============================================================================
-- Views are read-only
-- ============================================================================
-- Found 2026-10-01 while answering the Supabase advisor. Every view in public
-- was created under Supabase's default privileges, which grant anon and
-- authenticated everything on a new relation — insert, update and delete as
-- well as select. On a table that is harmless, because RLS decides. On these
-- views it was not: they run as their owner (that is the point of them; see
-- browse_members), the owner owns members, and a table's owner is not held to
-- its policies. Four of them are a single table with a WHERE, which Postgres
-- makes updatable on its own.
--
-- So, on a local stack, an ordinary active member could:
--   update public.browse_members set bio = '…' where id = <anybody>   -- UPDATE 1
--   delete from public.chat_authors where id = <anybody>             -- DELETE 1
-- rewrite another member's profile, make them a mentor (ten invites), or
-- delete their row — every policy on members bypassed. Two things held:
-- protect_admin_flag still refused is_admin, and an insert failed only because
-- none of these views carries birth_date for assert_adult.
--
-- Several views were meant to be select-only and said so with
--   revoke all on <view> from anon, public;
--   grant select on <view> to authenticated;
-- which leaves authenticated's default grant standing: revoking from public
-- does not touch a grant made to authenticated by name. Only chat_room_stats
-- (20260918050000) and admin_invites (20260929000000) revoked from
-- authenticated as well; they are in the list so the list is every view.
--
-- Nothing in the app writes through a view; every write is to a table under
-- its policies or through a function. So this takes back everything and
-- grants select again, to exactly the roles that read each view.
--
-- A new view gets the same default grants. Revoke them from authenticated by
-- name in the migration that creates it, as here.
-- ============================================================================

revoke all
  on public.admin_blocked_numbers,
     public.admin_claimable_members,
     public.admin_invites,
     public.admin_members,
     public.admin_strikes,
     public.browse_members,
     public.chat_authors,
     public.chat_room_stats,
     public.event_attendees,
     public.event_rsvp_counts
  from public, anon, authenticated;

grant select
  on public.admin_blocked_numbers,
     public.admin_claimable_members,
     public.admin_invites,
     public.admin_members,
     public.admin_strikes,
     public.browse_members,
     public.chat_authors,
     public.chat_room_stats,
     public.event_attendees,
     public.event_rsvp_counts
  to authenticated;

-- Events are public, and so is how many are going; it was anon's only view.
grant select on public.event_rsvp_counts to anon;
