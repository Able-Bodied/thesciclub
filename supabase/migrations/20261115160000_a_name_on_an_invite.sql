-- ============================================================================
-- A name on a single invite, optional
-- ============================================================================
-- The owner, 2026-11-15: "can we encode the name in the invite if it is filled
-- out ... So it is filled in during onboarding ... Make adding the name in the
-- invite optional." And: "Also make choosing an organization optional."
--
-- A spreadsheet invite already carries one (invitee_name, 20261114010000):
-- the email says "Hi Ana," and joining starts with the name filled in
-- (invite_details_for_token). The two single-invite forms now can too.
--
-- New versions of admin_create_invite and create_my_invite that take p_name,
-- and only when it is given: the versions without it stay exactly as they
-- are, for the iPhone app already on phones. Each new one asks the old one to
-- make the invite, with all its checks, and then writes the name on it, so
-- who may invite is decided in one place.
--
-- The name is kept on the invite row only, never in the link.
--
-- create_my_invite without an organization gives a member of exactly one
-- organization that one (20261105010000). The new version takes a null
-- p_organization as the member's choice of none, just the club, and leaves
-- the invite without one ("If it is not selected, then the user is not
-- auto-associated with an organization"); the old version still guesses, as
-- the app expects.
-- ============================================================================

create or replace function public.admin_create_invite(
  raw_email text,
  p_name text,
  organization_id uuid default null,
  note text default null
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.invites;
begin
  created := public.admin_create_invite(raw_email => $1, organization_id => $3, note => $4);
  update public.invites
     set invitee_name = nullif(left(btrim(coalesce($2, '')), 80), '')
   where id = created.id
  returning * into created;
  return created;
end;
$$;

revoke all on function public.admin_create_invite(text, text, uuid, text) from public, anon;
grant execute on function public.admin_create_invite(text, text, uuid, text) to authenticated;

create or replace function public.create_my_invite(
  raw_email text,
  p_name text,
  note text default null,
  p_organization uuid default null
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.invites;
begin
  created := public.create_my_invite(raw_email => $1, note => $3, p_organization => $4);
  update public.invites
     set invitee_name = nullif(left(btrim(coalesce($2, '')), 80), ''),
         for_organization_id = case when $4 is null then null else for_organization_id end
   where id = created.id
  returning * into created;
  return created;
end;
$$;

revoke all on function public.create_my_invite(text, text, text, uuid) from public, anon;
grant execute on function public.create_my_invite(text, text, text, uuid) to authenticated;

comment on function public.create_my_invite(text, text, text, uuid) is
  'create_my_invite with the person''s name, for the email and for joining. See 20261115160000.';
comment on function public.admin_create_invite(text, text, uuid, text) is
  'admin_create_invite with the person''s name, for the email and for joining. See 20261115160000.';
