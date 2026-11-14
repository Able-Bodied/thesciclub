-- ============================================================================
-- An administrator invites a list of people at once, from a spreadsheet
-- ============================================================================
-- The owner, 2026-11-14: "something that allows for sending invites based on a
-- spreadsheet of email addresses", with "a nice invite email from the admin".
--
-- Each invite comes from the administrator by name (invited_by_member_id), for
-- the organization they choose (for_organization_id), so the person joins it
-- when they sign up (members_join_their_organization, 20261030000000) and the
-- email can say who and with whom. Two new columns, both optional, carry what
-- the email needs: the person's name for "Hi Ana," and the administrator's
-- own words. Nothing is renamed or dropped, so the store app keeps working.
--
-- admin_invite_list adds the rows and reports each one; the app then sends the
-- emails one at a time through send-invite, as it does for a single invite.
-- ============================================================================

alter table public.invites
  add column if not exists invitee_name text
    check (invitee_name is null or char_length(invitee_name) between 1 and 80),
  add column if not exists message text
    check (message is null or char_length(message) between 1 and 1000);

comment on column public.invites.invitee_name is
  'What the invite email calls them ("Hi Ana,"). From a spreadsheet; optional.';
comment on column public.invites.message is
  'The inviter''s own words, quoted in the invite email. Optional.';

-- p_people: [{"email": "...", "name": "..."}], at most 200. Returns one
-- {email, name, outcome, invite_id} per entry, in order, where outcome is
-- added, repeat (twice in this list), not_an_email, blocked, on_list (an
-- invite is already waiting or was used) or member (already has an account).
create or replace function public.admin_invite_list(
  p_people jsonb,
  p_organization uuid default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  words text := nullif(btrim(coalesce(p_message, '')), '');
  person jsonb;
  address text;
  who text;
  seen text[] := '{}';
  outcome text;
  made uuid;
  results jsonb := '[]'::jsonb;
begin
  if me is null or not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  if jsonb_typeof(p_people) is distinct from 'array' then
    raise exception 'The list did not come through.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_people) > 200 then
    raise exception 'Up to 200 people at a time.' using errcode = '22023';
  end if;
  if words is not null and char_length(words) > 1000 then
    raise exception 'The message can be up to 1,000 characters.' using errcode = '22023';
  end if;
  if p_organization is not null and not exists (
    select 1 from public.organizations o
     where o.id = p_organization and o.removed_at is null and not o.is_the_club
  ) then
    raise exception 'There is no such organization.' using errcode = 'P0002';
  end if;

  for person in select value from jsonb_array_elements(p_people) loop
    address := public.normalize_email(coalesce(person ->> 'email', ''));
    who := nullif(left(btrim(coalesce(person ->> 'name', '')), 80), '');
    made := null;

    if not private.valid_email(address) then
      outcome := 'not_an_email';
    elsif address = any (seen) then
      outcome := 'repeat';
    elsif public.is_blocked_email(address) then
      outcome := 'blocked';
    elsif exists (select 1 from auth.users u where lower(u.email) = address) then
      outcome := 'member';
    elsif exists (
      select 1 from public.invites i
       where lower(i.email::text) = address and i.status in ('pending', 'consumed')
    ) then
      outcome := 'on_list';
    else
      begin
        insert into public.invites
          (email, invited_by_member_id, for_organization_id, note, invitee_name, message)
        values
          (address::extensions.citext, me, p_organization, 'From a spreadsheet', who, words)
        returning id into made;
        outcome := 'added';
      exception when unique_violation then
        outcome := 'on_list';
      end;
    end if;

    if private.valid_email(address) then
      seen := seen || address;
    end if;
    results := results || jsonb_build_object(
      'email', coalesce(nullif(address, ''), person ->> 'email'),
      'name', who,
      'outcome', outcome,
      'invite_id', made
    );
  end loop;

  return results;
end;
$$;

revoke all on function public.admin_invite_list(jsonb, uuid, text) from public, anon;
grant execute on function public.admin_invite_list(jsonb, uuid, text) to authenticated;
