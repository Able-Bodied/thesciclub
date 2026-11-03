-- ============================================================================
-- An invite request goes to one person
-- ============================================================================
-- The owner, 2026-11-02: "get rid of all the different options for now, just
-- have the request sent to me". Asking for an invite no longer lists the
-- organizations and their org admins (20261029030000): it is a name, an email
-- and an optional note, filed under The SCI Club for one of its org admins.
--
-- Who that is lives in private.invite_request_desk, set in the database rather
-- than here, since this file is public. Unset, or no longer an org admin of the
-- club, it falls to the club's longest-standing org admin, so a request never
-- has nowhere to go. Every org admin of the club still sees it on Invites, as
-- before; only the one chosen is told in the bell and by push.
--
-- request_club_invite hands over to request_invite, so the checks, the limits
-- and the "sent" said the same whatever the address are all as they were.
-- ============================================================================

create table if not exists private.invite_request_desk (
  only_row boolean primary key default true check (only_row),
  member_id uuid references public.members (id) on delete set null
);

comment on table private.invite_request_desk is
  'The one person invite requests go to. See 20261102050000.';

revoke all on private.invite_request_desk from public, anon, authenticated;

create or replace function public.request_club_invite(p_name text, p_email text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  club uuid;
  who uuid;
begin
  select o.id into club
    from public.organizations o
   where o.is_the_club and o.removed_at is null
   order by o.created_at
   limit 1;

  select r.member_id into who
    from public.organization_representatives r
    join public.members m on m.id = r.member_id and m.status = 'active' and not m.is_seed
    left join private.invite_request_desk d on d.member_id = r.member_id
   where r.organization_id = club
   order by (d.member_id is not null) desc, r.created_at, r.member_id
   limit 1;

  if club is null or who is null then
    raise exception 'Requests are not being taken right now. Please try again later.'
      using errcode = '55000';
  end if;

  perform public.request_invite(club, who, p_name, p_email, p_note);
end;
$$;

revoke all on function public.request_club_invite(text, text, text) from public;
grant execute on function public.request_club_invite(text, text, text) to anon, authenticated;
