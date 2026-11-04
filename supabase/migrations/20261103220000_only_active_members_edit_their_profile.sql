-- ============================================================================
-- Only an active member edits their own profile
-- ============================================================================
-- Owner, 2026-11-03. "members can update own row" only asked that the row be
-- the caller's, so a paused or removed member could sign in and PATCH their
-- name, photograph or bio, and their old posts showed the change. The same
-- held for their photograph in storage and for set_my_username().
--
-- Now each needs an active member (is_active_member(), the meaning is_member()
-- has had since 20261103210000):
--   * the members update rule: a paused member's update matches no row;
--   * set_my_username(): refused;
--   * their own photograph folder: upload, replace and delete. Onboarding
--     uploads before the members row exists, so having no row yet still
--     passes; only a paused or removed row is refused.
--
-- Untouched: the guard on status and the other columns
-- (guard_own_member_row), joining's insert rule, delete_my_account(),
-- note_device(), record_sign_in(), agree_to_terms() and the admin_* functions,
-- all security definer.
-- Probe: only-active-members-edit-their-profile.sql. Undo: supabase/undo/20261103220000.sql.
-- ============================================================================

alter policy "members can update own row" on public.members
  using ((((select auth.uid()) = id) and (select public.is_active_member())))
  with check ((((select auth.uid()) = id) and (select public.is_active_member())));

-- The photo folder: no members row yet (onboarding), or an active one. Read
-- inline from the member's own row, which "members can select own row" shows
-- them, rather than through a function: these rules are {public}, so a
-- signed-out write to any bucket evaluates them, and a function anon cannot
-- run would be refused with its name (photo-cleanup.sql, step 7).
alter policy "members can upload their own photo" on storage.objects
  with check (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = (select auth.uid()) AND m.status <> 'active'))));
alter policy "members can replace their own photo" on storage.objects
  using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT public.photo_is_on_a_report(name)) AND (NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = (select auth.uid()) AND m.status <> 'active'))));
alter policy "members can delete their own photo" on storage.objects
  using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT public.photo_is_on_a_report(name)) AND (NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = (select auth.uid()) AND m.status <> 'active'))));

-- As 20261012000000, for active members only.
create or replace function public.set_my_username(name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  wanted text := public.normalize_email(name);
begin
  if me is null or not exists (select 1 from public.members where id = me) then
    raise exception 'Only a member has a username.' using errcode = '42501';
  end if;
  if not public.is_active_member() then
    raise exception 'Your membership is paused, so your profile cannot be changed.' using errcode = '42501';
  end if;
  if not private.username_is_valid(wanted) then
    raise exception 'Use 3 to 20 lowercase letters, digits, dots or underscores, not starting or ending with a dot or underscore.'
      using errcode = '22023';
  end if;
  -- A reserved name reads exactly like a taken one.
  if private.username_is_reserved(wanted) then
    raise exception 'That username is taken.' using errcode = '23505';
  end if;

  update public.members set username = wanted where id = me;
exception
  when unique_violation then
    raise exception 'That username is taken.' using errcode = '23505';
end;
$$;
