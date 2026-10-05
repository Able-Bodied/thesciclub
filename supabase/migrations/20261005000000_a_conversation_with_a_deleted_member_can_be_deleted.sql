-- ============================================================================
-- A member can delete a conversation whose other half has deleted their account
-- ============================================================================
-- The owner, 2026-10-05: "add an option to delete a whole chat in DMs if you
-- were talking to a member and they delete their account and you no longer
-- want to see it." Until now such a conversation stayed in the list for ever,
-- headed "Deleted member", with no composer and no way out.
--
-- ---------------------------------------------------------------------------
-- Which conversations
-- ---------------------------------------------------------------------------
-- A direct one with nobody else in it: the other member's row is gone (they
-- deleted their account, or an administrator deleted them), which took their
-- chat_thread_members row with it. That is the same test chat_my_threads uses
-- to hand back a null other_member_id, which is what the app draws as
-- "Deleted member" and what shows the delete button, so the button and this
-- function cannot disagree about which conversations qualify.
--
-- Not a conversation with somebody still in the club, which is half theirs;
-- not a group. Leaving a conversation, or deleting one for both people, is a
-- different decision nobody has made.
--
-- ---------------------------------------------------------------------------
-- What goes, and what stays
-- ---------------------------------------------------------------------------
-- The thread row, and by cascade: every message from both of them, the
-- removed messages' recorded words (chat_removed_bodies), every earlier
-- version of an edited message (chat_edits), who read it and who muted it.
-- Nobody is left who could read any of it: CONTEXT.md keeps a deleted
-- member's words "so other people's conversations still make sense", and the
-- only other person is the one asking for them to go.
--
-- Reports stay, as they do when an administrator deletes a topic:
-- chat_reports.message_id is ON DELETE SET NULL and a report keeps its own
-- copy of the words and its photograph paths.
--
-- ---------------------------------------------------------------------------
-- Photographs
-- ---------------------------------------------------------------------------
-- Files cannot be deleted from SQL (storage.protect_delete), so the client
-- removes them through the storage API, and it has to do that first, while
-- the conversation still exists. The storage API deletes only what the caller
-- can also read (scripts/check-chat-photo-policy.mjs says why), and a file in
-- a deleted conversation's folder can be read by nobody.
--
-- The existing delete policy lets a member delete only what they uploaded,
-- and half of these files were uploaded by the member who is gone. So a
-- second policy: a member may delete any file in a direct conversation of
-- theirs that has nobody else in it, which is exactly the conversation this
-- function will delete. A file named on a report is still refused, by the
-- same test the first policy makes, and the report keeps it.
--
-- The client lists the conversation's folder rather than asking this function
-- for paths: the folder holds everything, including the pictures of messages
-- taken back (whose paths only chat_removed_bodies remembers) and any upload
-- whose message was never written.
-- ============================================================================

create or replace function public.chat_delete_conversation(thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  thread_kind text;
begin
  if me is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;

  -- One answer for "no such conversation" and "not yours", so this says
  -- nothing about conversations the caller is not in.
  select t.kind into thread_kind
    from public.chat_threads t
    join public.chat_thread_members m on m.thread_id = t.id and m.member_id = me
   where t.id = thread
     for update of t;
  if thread_kind is null then
    raise exception 'That conversation is not there any more.' using errcode = 'P0002';
  end if;

  if thread_kind <> 'direct'
     or exists (
       select 1 from public.chat_thread_members o
        where o.thread_id = thread and o.member_id <> me
     ) then
    raise exception 'Only a conversation with a deleted member can be deleted.'
      using errcode = '42501';
  end if;

  delete from public.chat_threads t where t.id = thread;
end;
$$;

comment on function public.chat_delete_conversation(uuid) is
  'The caller deletes a direct conversation whose other member is gone. The client removes its photographs from storage first.';

revoke all on function public.chat_delete_conversation(uuid) from public, anon;
grant execute on function public.chat_delete_conversation(uuid) to authenticated;

-- Whether this file is in a direct conversation the caller is in, with nobody
-- else left in it: one chat_delete_conversation would delete. Definer, as
-- chat_file_is_readable is, so the policy reads the roster the same way the
-- function does.
create or replace function public.chat_file_is_in_a_deletable_conversation(object_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  scope text := public.chat_file_scope(object_name);
  conversation uuid;
begin
  if me is null
     or public.chat_file_kind(object_name) is distinct from 'threads'
     or scope is null
     or (storage.foldername(object_name))[3] is not null then
    return false;
  end if;
  begin
    conversation := scope::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return exists (
           select 1
             from public.chat_threads t
             join public.chat_thread_members m on m.thread_id = t.id and m.member_id = me
            where t.id = conversation and t.kind = 'direct'
         )
     and not exists (
           select 1 from public.chat_thread_members o
            where o.thread_id = conversation and o.member_id <> me
         );
end;
$$;

comment on function public.chat_file_is_in_a_deletable_conversation(text) is
  'Whether a chat file is in a direct conversation of the caller''s whose other member is gone: one they may delete, photographs first.';

revoke all on function public.chat_file_is_in_a_deletable_conversation(text) from public, anon;
grant execute on function public.chat_file_is_in_a_deletable_conversation(text) to authenticated;

drop policy if exists "the last one in a conversation deletes its photographs" on storage.objects;
create policy "the last one in a conversation deletes its photographs"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat'
    and public.chat_file_is_in_a_deletable_conversation(name)
    and not public.chat_file_is_on_a_report(name)
  );
