-- ============================================================================
-- Stats & controls says who each upcoming event is for
-- ============================================================================
-- The owner, 2026-11-06: an org admin changes who can see an event from the
-- Events tab of Stats & controls too, as on the event's page (20261106030000).
-- organization_event_notices also returns each event's audience and series,
-- so the tab says who it is for without asking event by event. Otherwise as
-- 20261104215000. Store builds (1.0.5, 1.2.0) ignore the two new columns.
--
-- Undo: supabase/undo/20261106060000.sql.
-- ============================================================================

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
  people_interested integer,
  audience text,
  series_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can see this.' using errcode = '42501';
  end if;
  return query
    with people as materialized (
      select p.member_id from private.organization_people_ids(p_organization) p
    ),
    -- members_blocked(me, b), both ways, once.
    blocked as materialized (
      select b.blocked_id as member_id from public.member_blocks b where b.blocker_id = me
      union
      select b.blocker_id from public.member_blocks b where b.blocked_id = me
    ),
    shown as materialized (
      select e.id, e.title, e.start_time, e.timezone, e.all_day, e.audience, e.series_id
        from public.events e
       where e.organization_id = p_organization
         and coalesce(e.end_time, e.start_time) > now() - interval '7 days'
         and (
           e.start_time > now()
           or exists (select 1 from public.event_member_notices z where z.event_id = e.id)
         )
       order by e.start_time, e.id
       limit 100
    )
    select s.id, s.title, s.start_time, s.timezone, s.all_day,
           n.notified, n.opened, n.going, n.interested, n.not_opened, n.no_answer,
           (
             select count(*)::integer
               from (
                 select p.member_id
                   from people p
                  where p.member_id is distinct from me
                    and not exists (
                      select 1 from public.event_rsvps y where y.event_id = s.id and y.member_id = p.member_id
                    )
                    and not exists (
                      select 1 from public.event_member_notices z
                       where z.event_id = s.id and z.member_id = p.member_id
                    )
                    and not exists (select 1 from blocked b where b.member_id = p.member_id)
                 offset 0 -- the cheap checks first
               ) c
              where s.audience in ('public', 'club') or private.member_sees_event(c.member_id, s.id)
           ),
           n.last_sent_at,
           a.going,
           a.interested,
           s.audience,
           s.series_id
      from shown s
      cross join lateral (
        select count(x.member_id)::integer as notified,
               count(x.opened_at)::integer as opened,
               count(x.member_id) filter (where r.status = 'going')::integer as going,
               count(x.member_id) filter (where r.status = 'interested')::integer as interested,
               count(x.member_id) filter (where x.opened_at is null and r.status is null)::integer as not_opened,
               count(x.member_id) filter (where r.status is null)::integer as no_answer,
               max(x.last_sent_at) as last_sent_at
          from public.event_member_notices x
          left join public.event_rsvps r on r.event_id = x.event_id and r.member_id = x.member_id
         where x.event_id = s.id
      ) n
      -- event_people(s.id, me) joined to its answers.
      cross join lateral (
        select count(*) filter (where y.status = 'going')::integer as going,
               count(*) filter (where y.status = 'interested')::integer as interested
          from public.event_rsvps y
          join public.members m on m.id = y.member_id and m.status = 'active'
         where y.event_id = s.id
           and (
             exists (select 1 from people p where p.member_id = y.member_id)
             or exists (
               select 1 from public.event_member_notices x
                where x.event_id = s.id and x.member_id = y.member_id
             )
           )
           and not exists (select 1 from blocked b where b.member_id = y.member_id)
      ) a
     order by s.start_time, s.id;
end;
$$;

revoke all on function public.organization_event_notices(uuid) from public, anon;
grant execute on function public.organization_event_notices(uuid) to authenticated;
