-- Undo for 20261104070000_event_notices_count_each_event_once.sql: the notify
-- list as 20261103085000 wrote it.

create or replace function public.organization_event_notices(p_organization uuid)
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
