-- ============================================================================
-- How the invites did: link clicked, started onboarding, joined
-- ============================================================================
-- The owner, 2026-11-18: "can we show if someone clicked on the link, but did
-- not join? Maybe clicked on link, vs started onboarding, vs joined?"
--
-- invites.claimed_at is set when somebody signs in from the link, before the
-- onboarding steps (onboarding/page.tsx, claim_invite); until now the page
-- counted that as joined. Both tracking functions return three more columns:
--   started_at        invites.claimed_at: an account was made from the link
--   member_joined_at  the member row's created_at: onboarding finished
--   reached_step      for an administrator, the last onboarding step the
--                     account reached (onboarding_steps), while there is no
--                     member yet; null to an event's organizers.
-- joined_at stays claimed_at, for whatever still reads it.
--
-- The columns change, so each function is dropped and made again, as it was
-- in 20261114040000 and 20261114070000 but for them.
--
-- Undo: supabase/undo/20261118225000.sql.
-- ============================================================================

drop function if exists public.admin_invite_tracking(integer);

create function public.admin_invite_tracking(p_limit integer default 500)
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
  member_name text,
  -- 20261118225000
  started_at timestamptz,
  member_joined_at timestamptz,
  reached_step text
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
         joined.display_name,
         i.claimed_at,
         joined.created_at,
         -- How far onboarding got, while there is no member yet.
         case when joined.id is null and i.claimed_by is not null then
           (select s.step from public.onboarding_steps s
             where s.user_id = i.claimed_by
             order by s.reached_at desc limit 1)
         end
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

revoke all on function public.admin_invite_tracking(integer) from public, anon;
grant execute on function public.admin_invite_tracking(integer) to authenticated;

drop function if exists public.event_invite_tracking(uuid);

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
  member_name text,
  -- 20261118225000
  started_at timestamptz,
  member_joined_at timestamptz,
  reached_step text
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
           r.status,
           case when i.declined_at is not null then 'no' end),
         i.claimed_at,
         joined.display_name,
         i.claimed_at,
         joined.created_at,
         -- Which onboarding step is the club's to know, not an organizer's.
         null::text
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
