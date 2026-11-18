-- ============================================================================
-- A message on a single invite, optional, quoted in its email
-- ============================================================================
-- The owner, 2026-11-17: "Can we add an optional note field in the invite
-- section. So if I want to add a note to the invite e-mail it can be added in."
--
-- A list of invites already carries one (invites.message, 20261114010000) and
-- send-invite quotes it in the email, from the inviter. The two single-invite
-- forms (Admin → Invites, and the Invites page) now can too. Their Note stays
-- what it was: a private line on the list, never in the email.
--
-- New versions of admin_create_invite and create_my_invite that take
-- p_message, and only when it is given: every version without it stays
-- exactly as it is, for the iPhone app already on phones. Each new one asks
-- an existing one to make the invite, with all its checks, and then writes the
-- message on it, so who may invite is still decided in one place. The message
-- is written before the email goes: the form sends it afterwards.
-- ============================================================================

-- Trimmed, empty as none, at most 1,000 characters as a list's message.
create or replace function private.invite_message(p_message text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  words text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if char_length(words) > 1000 then
    raise exception 'The message can be up to 1,000 characters.' using errcode = '22023';
  end if;
  return words;
end;
$$;

revoke all on function private.invite_message(text) from public, anon, authenticated;

create or replace function public.admin_create_invite(
  raw_email text,
  p_message text,
  organization_id uuid default null,
  note text default null,
  p_name text default null
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  words text := private.invite_message($2);
  created public.invites;
begin
  -- The version with a name (20261115160000); a null name is none.
  created := public.admin_create_invite(
    raw_email => $1, p_name => $5, organization_id => $3, note => $4);
  update public.invites
     set message = words
   where id = created.id
  returning * into created;
  return created;
end;
$$;

revoke all on function public.admin_create_invite(text, text, uuid, text, text) from public, anon;
grant execute on function public.admin_create_invite(text, text, uuid, text, text) to authenticated;

-- p_no_organization: none was chosen on purpose. Without it and without a
-- name, the version without either decides, which gives a member of exactly
-- one organization that one (20261105010000), as the form has always had.
create or replace function public.create_my_invite(
  raw_email text,
  p_message text,
  note text default null,
  p_organization uuid default null,
  p_name text default null,
  p_no_organization boolean default false
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  words text := private.invite_message($2);
  created public.invites;
begin
  if $5 is not null or coalesce($6, false) then
    created := public.create_my_invite(
      raw_email => $1, p_name => $5, note => $3, p_organization => $4);
  else
    created := public.create_my_invite(raw_email => $1, note => $3, p_organization => $4);
  end if;
  update public.invites
     set message = words
   where id = created.id
  returning * into created;
  return created;
end;
$$;

revoke all on function public.create_my_invite(text, text, text, uuid, text, boolean) from public, anon;
grant execute on function public.create_my_invite(text, text, text, uuid, text, boolean) to authenticated;

comment on function public.admin_create_invite(text, text, uuid, text, text) is
  'admin_create_invite with a message quoted in the email. See 20261117160000.';
comment on function public.create_my_invite(text, text, text, uuid, text, boolean) is
  'create_my_invite with a message quoted in the email. See 20261117160000.';
