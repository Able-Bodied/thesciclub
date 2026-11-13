-- ============================================================================
-- Classifieds: the rooms stop asking where you are
-- ============================================================================
-- The owner, 2026-11-12: "We know where everybody is". A post in Classifieds
-- now shows its author's city from the directory (src/lib/chat/author-places.ts),
-- so the room descriptions from 20261112100000 no longer ask for it.
--
-- Only a description still as that migration wrote it is changed, so one an
-- administrator has since edited is left alone. Giving away never asked.
-- ============================================================================

update public.chat_rooms
   set description = 'Equipment and other things members are selling. Say what it is, its condition and the price.'
 where id = 'for-sale'
   and description = 'Equipment and other things members are selling. Say what it is, its condition, the price and roughly where you are.';

update public.chat_rooms
   set description = 'Something you need, whether to buy, borrow or be given. Say what it is.'
 where id = 'looking-for'
   and description = 'Something you need, to buy, borrow or be given. Say what it is and roughly where you are.';
