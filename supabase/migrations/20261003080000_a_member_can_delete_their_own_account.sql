-- ============================================================================
-- A member can delete their own account
-- ============================================================================
-- The owner, 2026-10-01, for members' privacy and for Twilio's: a "Delete my
-- account" on Me that removes the person, not only the membership. Until now
-- the only way out was an administrator's Remove, which ends the membership
-- but keeps the sign-in account and the invite, so the phone number stayed in
-- the club twice over.
--
-- What goes (the owner's choices):
--   * the member row — name, birthday, injury, place, photograph path, every
--     survey answer, the decline list — and with it, by the foreign keys,
--     their RSVPs, likes, follows, mutes, reads, push subscriptions, room and
--     conversation memberships, and any strikes against them;
--   * every invite row holding their number, whoever issued it, so the
--     number is nowhere in the club. Coming back takes a fresh invite, as it
--     does for anybody;
--   * invites they issued that nobody has used, as admin_delete_member does:
--     revoked, since those rows are other people's numbers, not theirs;
--   * the sign-in account in auth.users, which holds the number too, and its
--     sessions. Deleting it is what deletes the member row:
--     on_auth_user_deleted (20260910120100) does that.
--
-- What stays: their posts, topics and messages, which become a deleted user's
-- (author_id is SET NULL, and the app says "Deleted user"); the photographs
-- attached to them, which are part of those posts; and a report's copy of
-- reported words, with nobody named (reported_author_id is SET NULL).
--
-- Not here: the profile photograph in storage, which SQL cannot delete
-- (storage.protect_delete). The app deletes it through the Storage API first,
-- and stops if it cannot, so a face is never left behind by a deleted account.
--
-- An administrator is refused, as admin_delete_member refuses to delete one:
-- no administrator is removed from the application. They ask another, or the
-- owner, who can do it in the dashboard.
-- ============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_phone text;
  me_admin boolean;
begin
  if me is null then
    raise exception 'You are not signed in.';
  end if;

  select m.phone, m.is_admin into my_phone, me_admin from public.members m where m.id = me;
  if me_admin then
    raise exception 'An administrator''s account cannot be deleted from the app. Ask another administrator.';
  end if;
  -- No member row (signup never finished) still has a number: the one Auth
  -- verified.
  my_phone := coalesce(my_phone, public.normalize_phone(auth.jwt() ->> 'phone'));

  update public.invites
     set status = 'revoked', revoked_at = now()
   where invited_by_member_id = me
     and status = 'pending';

  delete from public.members where id = me;

  if my_phone is not null and my_phone <> '' then
    delete from public.invites where phone = my_phone;
  end if;

  delete from auth.users where id = me;
end;
$$;

comment on function public.delete_my_account() is
  'The caller''s own account, number and profile, erased. Their words stay, unnamed. Never an administrator.';

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
