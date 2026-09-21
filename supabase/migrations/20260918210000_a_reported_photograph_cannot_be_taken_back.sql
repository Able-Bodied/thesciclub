-- A reported photograph cannot be deleted by anybody.
--
-- The owner spotted the gap on 2026-09-21, the day photographs shipped: a
-- report copies the words of a message because the sender can take the
-- message back, and the copy is what an administrator acts on. A photograph
-- cannot be copied — no SQL can reach a file — so 20260918200000 recorded its
-- path on the report instead and let the sender's own removal delete the file.
-- Which meant: send the picture, wait to be reported, take the message back,
-- and the administrator opens a report with the words and an empty space
-- where the evidence was.
--
-- The fix is the delete policy. A file that is named on any report cannot be
-- deleted, by the person who sent it or by an administrator — the second half
-- so that the Settled list stays a record of what was decided about, the way
-- the words in it do. The file stays behind the read policy: readable by the
-- conversation's members, who already saw it, and by an administrator, because
-- the report names it. The message's own row still blanks its list when it is
-- taken back, so the picture leaves the conversation as the words do; it is
-- only the file that stays, for the report.
--
-- Deleting *before* anybody has reported it still works, as taking a message
-- back before anybody has reported it has always worked for the words: there
-- is nothing to report once it is gone. That is the same for both and is not
-- what this closes.
--
-- The check is a definer function rather than a subquery in the policy:
-- chat_reports grants a member three columns and `attachments` is not one of
-- them, so a policy that read it as the member would fail on column privilege
-- — quietly, as a refusal to delete anything, which would have looked like
-- the fix working.

create or replace function public.chat_file_is_on_a_report(object_name text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_reports r
    where object_name = any (r.attachments)
  );
$$;

comment on function public.chat_file_is_on_a_report(text) is
  'Whether any report names this chat photograph. A named file cannot be deleted by anybody.';

revoke all on function public.chat_file_is_on_a_report(text) from public, anon;
grant execute on function public.chat_file_is_on_a_report(text) to authenticated;

drop policy if exists "the uploader or an administrator deletes a chat photograph" on storage.objects;
create policy "the uploader or an administrator deletes a chat photograph"
  on storage.objects for delete
  using (
    bucket_id = 'chat'
    and (owner_id = auth.uid()::text or public.is_admin())
    and not public.chat_file_is_on_a_report(name)
  );
