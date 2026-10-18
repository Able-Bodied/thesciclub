-- A mentor's allowance holds when invites are made at the same moment.
--
-- The security scan of 2026-10-17 (finding F14). create_my_invite counted the
-- caller's live invites and then inserted, with nothing between the two to
-- stop a second call doing the same. Twenty calls sent together by a mentor
-- with nine of ten invites each counted nine, and several inserted: the cap
-- on how many people one mentor can vouch into the club did not hold.
--
-- Now each call takes a lock for its inviter before counting, held until it
-- commits, so the calls for one inviter run one after another and each counts
-- the ones before it. Different inviters do not wait for each other.
--
-- As 20261012000000, with the lock added.

create or replace function public.create_my_invite(raw_email text, note text default null)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  address text := public.normalize_email(raw_email);
  created public.invites;
begin
  if me is null then
    raise exception 'You cannot add another invite.' using errcode = '42501';
  end if;
  -- One at a time for each inviter, so the count below sees the invite a
  -- parallel call has just made. Held to the end of the transaction.
  perform pg_advisory_xact_lock(hashtext('create_my_invite'), hashtext(me::text));

  -- The rules the direct-insert policy used to hold: an active member who may
  -- invite, within their allowance. 42501 is how the client already reads "the
  -- allowance is spent".
  if me is null
     or not exists (select 1 from public.my_invite_permissions() p where p.can_invite)
     or not (
       (select p.unlimited from public.my_invite_permissions() p)
       or public.live_invite_count(me) < public.mentor_invite_limit()
     ) then
    raise exception 'You cannot add another invite.' using errcode = '42501';
  end if;
  if not private.valid_email(address) then
    raise exception 'That does not look like an email address' using errcode = '22023';
  end if;
  if public.is_blocked_email(address) then
    raise exception 'That email address is blocked from the club and cannot be invited';
  end if;
  if exists (
    select 1 from public.invites i
     where lower(i.email::text) = address and i.status in ('pending', 'consumed')
  ) then
    raise exception 'That email address is already on the list' using errcode = '23505';
  end if;

  insert into public.invites (email, invited_by_member_id, note)
  values (address::extensions.citext, me, nullif(btrim(coalesce(note, '')), ''))
  returning * into created;

  return created;
end;
$$;
