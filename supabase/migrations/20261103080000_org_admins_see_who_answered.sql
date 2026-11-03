-- ============================================================================
-- Org admins see who of their people answered an event, told or not
-- ============================================================================
-- The owner, 2026-11-03, on Stats & controls: the notify list
--   * drops events that have started unless someone was notified of them;
--   * counts its people's answers whether or not they were notified;
--   * lists every one of its people with what they did (event_people_answers).
-- event_notice_recipients stays for the iPhone app's 1.1.9.
-- ============================================================================

-- Its people for one event, as the viewer may see them: in it now, or
-- notified of it; active, and no block either way.
create function private.event_people(p_event uuid, p_viewer uuid)
returns table (member_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select ids.member_id
    from (
      select p.member_id
        from public.events e, private.organization_people_ids(e.organization_id) p
       where e.id = p_event
      union
      select x.member_id from public.event_member_notices x where x.event_id = p_event
    ) ids
    join public.members m on m.id = ids.member_id and m.status = 'active'
   where p_viewer is null or not public.members_blocked(p_viewer, ids.member_id);
$$;

revoke all on function private.event_people(uuid, uuid) from public, anon, authenticated;

drop function public.organization_event_notices(uuid);

create function public.organization_event_notices(p_organization uuid)
returns table (
  event_id uuid,
  title text,
  start_time timestamptz,
  timezone text,
  all_day boolean,
  notified integer,
  opened integer,
  going integer,
  interested integer,
  not_opened integer,
  no_answer integer,
  can_reach integer,
  last_sent_at timestamptz,
  people_going integer,
  people_interested integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can see this.' using errcode = '42501';
  end if;
  return query
    select e.id, e.title, e.start_time, e.timezone, e.all_day,
           count(x.member_id)::integer,
           count(x.opened_at)::integer,
           count(x.member_id) filter (where r.status = 'going')::integer,
           count(x.member_id) filter (where r.status = 'interested')::integer,
           count(x.member_id) filter (where x.opened_at is null and r.status is null)::integer,
           count(x.member_id) filter (where r.status is null)::integer,
           (
             select count(*)::integer
               from private.organization_people_ids(p_organization) p
              where p.member_id is distinct from auth.uid()
                and private.member_sees_event(p.member_id, e.id)
                and not exists (
                  select 1 from public.event_rsvps y where y.event_id = e.id and y.member_id = p.member_id
                )
                and not exists (
                  select 1 from public.event_member_notices z
                   where z.event_id = e.id and z.member_id = p.member_id
                )
                and not public.members_blocked(auth.uid(), p.member_id)
           ),
           max(x.last_sent_at),
           a.going,
           a.interested
      from public.events e
      left join public.event_member_notices x on x.event_id = e.id
      left join public.event_rsvps r on r.event_id = e.id and r.member_id = x.member_id
      cross join lateral (
        select count(*) filter (where y.status = 'going')::integer as going,
               count(*) filter (where y.status = 'interested')::integer as interested
          from private.event_people(e.id, auth.uid()) q
          join public.event_rsvps y on y.event_id = e.id and y.member_id = q.member_id
      ) a
     where e.organization_id = p_organization
       and coalesce(e.end_time, e.start_time) > now() - interval '7 days'
       and (
         e.start_time > now()
         or exists (select 1 from public.event_member_notices z where z.event_id = e.id)
       )
     group by e.id, a.going, a.interested
     order by e.start_time, e.id
     limit 100;
end;
$$;

revoke all on function public.organization_event_notices(uuid) from public, anon;
grant execute on function public.organization_event_notices(uuid) to authenticated;

-- Every one of its people for one event: answered first, then opened, then
-- notified, then the rest.
create function public.event_people_answers(p_event uuid)
returns table (
  member_id uuid,
  display_name text,
  is_org_admin boolean,
  is_mentor boolean,
  rsvp text,
  last_sent_at timestamptz,
  sends integer,
  opened_at timestamptz,
  sees_event boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  organization uuid;
begin
  select e.organization_id into organization from public.events e where e.id = p_event;
  if organization is null or not (public.speaks_for(organization) or public.is_admin()) then
    raise exception 'Only the organization''s org admins can see this.' using errcode = '42501';
  end if;
  return query
    select m.id, m.display_name,
           exists (select 1 from public.organization_representatives a
                    where a.organization_id = organization and a.member_id = m.id),
           exists (select 1 from public.organization_mentors g
                    where g.organization_id = organization and g.member_id = m.id),
           r.status, x.last_sent_at, coalesce(x.sends, 0), x.opened_at,
           private.member_sees_event(m.id, p_event)
      from private.event_people(p_event, auth.uid()) q
      join public.members m on m.id = q.member_id
      left join public.event_member_notices x on x.event_id = p_event and x.member_id = m.id
      left join public.event_rsvps r on r.event_id = p_event and r.member_id = m.id
     order by case r.status when 'going' then 0 when 'interested' then 1 else 2 end,
              (x.opened_at is null), (x.member_id is null), lower(m.display_name), m.id;
end;
$$;

revoke all on function public.event_people_answers(uuid) from public, anon;
grant execute on function public.event_people_answers(uuid) to authenticated;
