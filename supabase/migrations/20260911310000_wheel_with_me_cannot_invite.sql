-- ============================================================================
-- Wheel with Me Foundation cannot issue invites
-- ============================================================================
-- The seed gave it `can_invite = true`, faithfully: CONTEXT.md named it as
-- one of three member organizations, and the design mock carries `inv:true` on
-- the same row. Neither was questioned when the club was scaffolded.
--
-- The owner has now said it is wrong. Wheel with Me makes grants and runs
-- adaptive sport programming; it is not one of the bodies that vouches for a
-- phone number. NorCal SCI and SCVMC SCI Peer Support are.
--
-- This flag is not cosmetic, which is why it is worth a migration of its own
-- rather than a quiet edit. `can_invite` decides who appears on the blocked
-- screen — the page somebody sees when their number is not on the list, which
-- tells them exactly who to contact next. Naming a body that cannot actually
-- add them sends somebody newly injured to the wrong place, at the worst
-- possible moment to be sent to the wrong place.
--
-- CONTEXT.md is edited in the same commit. It is the document that wins
-- where any two disagree, so leaving it saying three while the database says
-- two would make the source of truth the thing that is wrong.
-- ============================================================================

update public.organizations
   set can_invite = false
 where short_code = 'WWM';
