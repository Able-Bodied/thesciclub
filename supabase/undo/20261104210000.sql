-- Undo for 20261104210000_only_active_members_edit_their_profile.sql: a paused
-- or removed member edits their own row and photograph again, as before.

alter policy "members can update own row" on public.members
  using (((select auth.uid()) = id))
  with check (((select auth.uid()) = id));

alter policy "members can upload their own photo" on storage.objects
  with check (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy "members can replace their own photo" on storage.objects
  using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT public.photo_is_on_a_report(name))));
alter policy "members can delete their own photo" on storage.objects
  using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT public.photo_is_on_a_report(name))));

-- As 20261012000000.
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
