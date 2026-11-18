-- ============================================================================
-- Who is typing in a conversation
-- ============================================================================
-- The three dots under a conversation while somebody writes, as in Messages
-- and WhatsApp (the owner, 2026-11-18). Nothing is stored: each member's app
-- says "typing" and "stopped" over a Realtime broadcast channel named
-- `typing:<thread id>` (src/lib/chat/typing.ts), and the others draw the dots.
--
-- The channel is private, so Realtime asks these policies before a socket may
-- join it: only the conversation's own members, by is_thread_member, which is
-- also what reads its messages. Anybody else, a guessed id or a member who has
-- left, is refused at the door. Realtime checks on joining, so a member taken
-- out of a group while the screen is open hears the dots until they leave it.
--
-- The CASE keeps a topic that is not ours (or not a uuid) from reaching the
-- cast: Postgres does not promise to test `and` left to right.
--
-- Expand only: a policy on realtime.messages, which nothing in the club used.
-- An installed app that does not know the channel never joins it.
-- Probe: supabase/tests/who-is-typing.sql.
-- ============================================================================

drop policy if exists "a conversation's members hear who is typing in it" on realtime.messages;
create policy "a conversation's members hear who is typing in it"
  on realtime.messages for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and case
      when realtime.topic() ~ '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_thread_member(substr(realtime.topic(), 8)::uuid)
      else false
    end
  );

drop policy if exists "a conversation's members say they are typing in it" on realtime.messages;
create policy "a conversation's members say they are typing in it"
  on realtime.messages for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and case
      when realtime.topic() ~ '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_thread_member(substr(realtime.topic(), 8)::uuid)
      else false
    end
  );
