-- ============================================================================
-- An event's emailed invites, and how each did, on its guest list
-- ============================================================================
-- The owner, 2026-11-14: "put the invite list on the event itself for the
-- event based invites ... incorporate status and what happened in the
-- guestlist". An event's organizers (and administrators) see every invite
-- emailed for it: sent, opened, viewed the event, going, joined.
--
-- admin_invite_tracking (20261114030000) now leaves event invites to their
-- events and lists the club's own.
-- ============================================================================

create function public.event_invite_tracking(p_event uuid)
returns table (
  id uuid,
  email text,
  name text,
  status text,
  inviter_name text,
  created_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  link_opened_at timestamptz,
  rsvp text,
  joined_at timestamptz,
  member_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.may_change_event(p_event) then
    raise exception 'Only the event''s organizers can see its invites.' using errcode = '42501';
  end if;
  return query
  select i.id,
         lower(i.email::text),
         coalesce(joined.display_name, r.name, i.invitee_name),
         i.status,
         coalesce(org.name, inviter.display_name),
         i.created_at,
         i.sent_at,
         i.opened_at,
         i.link_opened_at,
         coalesce(
           (select x.status from public.event_rsvps x
             where x.event_id = i.event_id and x.member_id = i.claimed_by),
           r.status),
         i.claimed_at,
         joined.display_name
    from public.invites i
    left join public.organizations org on org.id = i.invited_by_organization_id
    left join public.members inviter on inviter.id = i.invited_by_member_id
    left join public.members joined on joined.id = i.claimed_by
    left join public.event_registrations r
      on r.id = i.event_registration_id and lower(r.email::text) = lower(i.email::text)
   where i.event_id = p_event
     and i.email is not null
     and i.status <> 'revoked'
   order by i.created_at desc, i.id desc
   limit 1000;
end;
$$;
revoke all on function public.event_invite_tracking(uuid) from public, anon;
grant execute on function public.event_invite_tracking(uuid) to authenticated;

-- The administrator's view: the club's own invites; an event's are on it.
create or replace function public.admin_invite_tracking(p_limit integer default 500)
returns table (
  id uuid,
  email text,
  name text,
  status text,
  note text,
  inviter_name text,
  event_id uuid,
  event_title text,
  event_start timestamptz,
  created_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  link_opened_at timestamptz,
  rsvp text,
  joined_at timestamptz,
  member_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not an administrator' using errcode = '42501';
  end if;
  return query
  select i.id,
         lower(i.email::text),
         coalesce(joined.display_name, i.invitee_name),
         i.status,
         i.note,
         coalesce(org.name, inviter.display_name),
         null::uuid,
         null::text,
         null::timestamptz,
         i.created_at,
         i.sent_at,
         i.opened_at,
         i.link_opened_at,
         null::text,
         i.claimed_at,
         joined.display_name
    from public.invites i
    left join public.organizations org on org.id = i.invited_by_organization_id
    left join public.members inviter on inviter.id = i.invited_by_member_id
    left join public.members joined on joined.id = i.claimed_by
   where i.sent_at is not null
     and i.email is not null
     and i.status <> 'revoked'
     and i.event_id is null
   order by i.created_at desc, i.id desc
   limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;
