-- ============================================================================
-- A deleted member's profile reports keep the words and forget who they were
-- ============================================================================
-- The owner, 2026-10-22: when a reported member's account is deleted, by them
-- or by an administrator, each profile report about them (20261022130000)
-- drops the name, @username and photograph (its path and description), and
-- reads "Deleted member" where the name was, so an administrator sees at a
-- glance that those are gone. What they wrote, the note, the dates and the
-- status stay, as a message report's copy stays with nobody named.
--
-- A trigger before a members row is deleted, so every way an account goes is
-- covered: delete_my_account, admin_delete_member, admin_block_number, and a
-- user deleted in the dashboard (on_auth_user_deleted deletes the row). Before,
-- not after: profile_id and reported_author_id are set null on the delete.
--
-- The photograph file goes too. Clearing profile_photo_path is what lets it:
-- photo_is_on_a_report no longer names it, so the Storage API deletes it
-- through the usual policies, which SQL cannot (storage.protect_delete). An
-- administrator's Remove already clears the folder after the delete; the
-- member's own deletion now clears it again after delete_my_account, with the
-- session it still holds. While the account exists the file stays protected.
-- ============================================================================

create or replace function private.forget_a_deleted_member_in_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_reports r
     set profile_snapshot = (r.profile_snapshot - 'username' - 'photo_alt')
                            || jsonb_build_object('display_name', 'Deleted member'),
         profile_photo_path = null
   where r.kind = 'profile'
     and (r.profile_id = old.id or r.reported_author_id = old.id);
  return old;
end;
$$;

revoke all on function private.forget_a_deleted_member_in_reports() from public, anon, authenticated;

drop trigger if exists members_forget_in_reports on public.members;
create trigger members_forget_in_reports
  before delete on public.members
  for each row execute function private.forget_a_deleted_member_in_reports();

comment on column public.chat_reports.profile_snapshot is
  'The profile as the reporter saw it: name, @username and what the member wrote. Once their account is deleted, "Deleted member" and the words only.';
comment on column public.chat_reports.profile_photo_path is
  'The reported profile photograph, by path in the photos bucket. Kept while named; cleared when the member''s account is deleted, so the file can go.';
