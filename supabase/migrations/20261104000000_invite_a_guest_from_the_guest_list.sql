-- ============================================================================
-- Inviting somebody who registered on an event's public page
-- ============================================================================
-- The owner, 2026-11-04: on the full guest list, a button sends somebody who
-- registered without being a member an invite to their address, and the link
-- starts onboarding with what they already typed: name and phone.
--
-- A registration is still never an invite by itself (20261022230000): it is
-- somebody who may invite, choosing to. Each invite is made by the
-- functions that already make one, with their rules: admin_create_invite for
-- an administrator, create_my_invite (allowance, blocked addresses, one per
-- address) for anybody else who organizes the event.
--
-- Name and phone are not put in the link. The invite points at the
-- registration, and invite_details_for_token reads them for the holder of the
-- link, who is the person they belong to. When the registration expires (90
-- days after the event) the invite still works; only the prefill goes.
-- ============================================================================

alter table public.invites
  add column event_registration_id uuid
    references public.event_registrations (id) on delete set null;

comment on column public.invites.event_registration_id is
  'The public-page registration this invite was sent from, for onboarding to start from. See 20261104000000.';

-- ------------------------------------------------------------ the button --
create function public.invite_event_guest(registration uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reg public.event_registrations;
  ev public.events;
  created public.invites;
  why text;
begin
  select * into reg from public.event_registrations r where r.id = registration;
  if reg.id is null or not public.may_change_event(reg.event_id) then
    raise exception 'Only the event''s organizers can invite its guests.' using errcode = '42501';
  end if;
  select * into ev from public.events e where e.id = reg.event_id;
  why := left('Registered for ' || coalesce(ev.title, 'an event'), 500);

  if public.is_admin() then
    created := public.admin_create_invite(reg.email::text, null, why);
  else
    created := public.create_my_invite(
      reg.email::text,
      why,
      case
        when ev.organization_id is not null and public.speaks_for(ev.organization_id)
          then ev.organization_id
      end
    );
  end if;

  update public.invites set event_registration_id = reg.id where id = created.id;
  return created.id;
end;
$$;

comment on function public.invite_event_guest(uuid) is
  'Invites the address of a public-page registration, as its event''s organizer. See 20261104000000.';

revoke all on function public.invite_event_guest(uuid) from public, anon;
grant execute on function public.invite_event_guest(uuid) to authenticated;

-- ------------------------------------------------------- the guest list --
-- As 20261022190000, with each registration's id and whether its address is
-- on the invite list already. invite_id only where the viewer may send it
-- again (send-invite: their own, or an administrator).
drop function public.event_guest_list(uuid);

create function public.event_guest_list(event uuid)
returns table (
  name text,
  email text,
  phone text,
  status text,
  state text,
  responded_at timestamptz,
  registration_id uuid,
  invite_status text,
  invite_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.may_change_event(event) then
    raise exception 'Only the event''s organizers see its guest list.' using errcode = '42501';
  end if;

  -- Members only when Going: the privacy policy promises that Interested
  -- shares nothing with the host. A registration from the public page is
  -- listed either way, since its form says the organizer sees it.
  return query
    select m.display_name, u.email::text, m.phone, r.status, 'member'::text, r.created_at,
           null::uuid, null::text, null::uuid
      from public.event_rsvps r
      join public.members m on m.id = r.member_id
      left join auth.users u on u.id = m.id
     where r.event_id = event and r.status = 'going'
    union all
    -- A member's address not yet claimed reads as a member; an account with
    -- no member yet, as joining; nothing but the form, as unconfirmed.
    select g.name, g.email::text, g.phone, g.status,
           case
             when exists (
               select 1 from auth.users u join public.members m on m.id = u.id
                where lower(u.email) = lower(g.email::text)
             ) then 'member'
             when exists (
               select 1 from auth.users u where lower(u.email) = lower(g.email::text)
             ) then 'joining'
             else 'unconfirmed'
           end,
           g.created_at,
           g.id,
           inv.status,
           case
             when inv.status = 'pending'
              and (inv.invited_by_member_id = (select auth.uid()) or public.is_admin())
               then inv.id
           end
      from public.event_registrations g
      left join lateral (
        select i.id, i.status, i.invited_by_member_id
          from public.invites i
         where lower(i.email::text) = lower(g.email::text)
           and i.status in ('pending', 'consumed')
         order by i.status = 'pending' desc, i.created_at desc
         limit 1
      ) inv on true
     where g.event_id = event and g.member_id is null
       -- Not twice: a member who also said yes in the club is listed once.
       and not exists (
         select 1 from public.event_rsvps r
           join auth.users u on u.id = r.member_id
          where r.event_id = event and lower(u.email) = lower(g.email::text)
       )
    order by 6;
end;
$$;
revoke all on function public.event_guest_list(uuid) from public, anon;
grant execute on function public.event_guest_list(uuid) to authenticated;

-- ------------------------------------------------------------- the link --
-- As invite_address_for_token (20261012030000), with what the registration
-- it was sent from says, for onboarding to start from. Null fields where
-- there is none. Nothing at all for a token that is not a live invite.
create function public.invite_details_for_token(token text)
returns table (
  email text,
  name text,
  phone text,
  event_id uuid,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select lower(i.email::text), r.name, r.phone, r.event_id, r.status
    from public.invites i
    left join public.event_registrations r
      on r.id = i.event_registration_id
     and lower(r.email::text) = lower(i.email::text)
   where i.token_hash = encode(extensions.digest(btrim(token), 'sha256'), 'hex')
     and i.status = 'pending'
     and i.claimed_by is null
     and i.email is not null
     and not public.is_blocked_email(i.email::text)
   limit 1;
$$;
comment on function public.invite_details_for_token(text) is
  'The address a held invite link was sent to, and the name and phone of the registration it came from, for onboarding to fill in. See 20261104000000.';

revoke all on function public.invite_details_for_token(text) from public;
grant execute on function public.invite_details_for_token(text) to anon, authenticated;
