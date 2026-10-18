-- A member's own row cannot give them an organization's badge, or name a
-- photograph that is not in their own folder.
--
-- The security scan of 2026-10-17 (findings F2 and F13, F10).
--
-- `affiliations` draws an organization's logo on a member's card, under
-- "Member of" on their profile, and lists them on that organization's page.
-- The owner's rule is that a badge means the organization vouches for the
-- member, never something they pick (2026-10-10). Nothing in the app writes
-- it, but "members can update own row" covers every column and
-- guard_own_member_row did not check this one, so a PATCH from a member's own
-- session could award any badge. Administrators set it from the SQL editor,
-- which is not `authenticated` and passes this guard as before.
--
-- `photo_path` is written by the member (Your details, onboarding) as
-- <their id>/profile.<ext>, and nothing checked that. scripts/reprocess-photos
-- reads it with the service role, copies the object it names into the
-- member's folder and deletes the original, so a path naming another member's
-- photograph, a logo or an event cover had that file moved into the member's
-- profile and removed. A path written from a member's session now has to be
-- in their own folder, in the shape the app uploads. A claimed seeded
-- profile's seed/ path is copied by a later trigger, after this guard.
--
-- As 20261012000000, with the two checks added.

-- No photograph, or one in the member's own folder: <id>/<name>.<ext>, as
-- src/routes/profile/details-api.ts and onboarding upload it. No '..', query
-- or second folder can match.
create or replace function private.photo_path_is_own(member uuid, path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select path is null
      or path ~ ('^' || member::text || '/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,5}$');
$$;

comment on function private.photo_path_is_own(uuid, text) is
  'True for no photograph, or one at <member id>/<name>.<ext> in the photos bucket: the only shape a member writes from their own session. See 20261018000000.';

revoke all on function private.photo_path_is_own(uuid, text) from public, anon, authenticated;
grant execute on function private.photo_path_is_own(uuid, text) to authenticated;

create or replace function public.guard_own_member_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Joining makes an active peer. Everything else about a membership is
    -- decided by an administrator afterwards, or by the invite trigger.
    if new.is_admin
       or new.type <> 'peer'
       or new.status <> 'active'
       or new.is_seed
       or new.invite_id is not null then
      raise exception 'A new member joins as an active peer. The rest is decided by an administrator.';
    end if;
    if cardinality(coalesce(new.affiliations, '{}')) > 0 then
      raise exception 'An organization''s badge is given by the organization, not chosen when joining.'
        using errcode = '42501';
    end if;
    if not private.photo_path_is_own(new.id, new.photo_path) then
      raise exception 'That photograph is not in your own folder.' using errcode = '22023';
    end if;
    -- Onboarding chooses a username; the reserved list is enforced here
    -- because the insert is not made through set_my_username.
    if new.username is null then
      raise exception 'Choose a username to join.' using errcode = '23502';
    end if;
    if private.username_is_reserved(new.username::text) then
      raise exception 'That username is taken.' using errcode = '23505';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Membership status is changed by an administrator, not from your own profile';
  end if;
  if new.type is distinct from old.type then
    raise exception 'Becoming a mentor is decided by an administrator, not from your own profile';
  end if;
  if new.username is distinct from old.username then
    raise exception 'Your username is changed with set_my_username, not from your profile';
  end if;
  if new.is_seed is distinct from old.is_seed or new.invite_id is distinct from old.invite_id then
    raise exception 'That is a record of how you joined and cannot be changed from your profile';
  end if;
  if new.affiliations is distinct from old.affiliations then
    raise exception 'An organization''s badge is given by the organization, not from your own profile'
      using errcode = '42501';
  end if;
  if new.photo_path is distinct from old.photo_path
     and not private.photo_path_is_own(new.id, new.photo_path) then
    raise exception 'That photograph is not in your own folder.' using errcode = '22023';
  end if;
  -- `phone` may be edited now: it is only a contact number for events.
  return new;
end;
$$;
