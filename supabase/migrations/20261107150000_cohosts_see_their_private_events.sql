-- A co-host's org admins see the event they co-host, however private, as the
-- lead host's do, and its whole guest list (the owner, 2026-11-07: an
-- invite-only event's co-hosts could not see it).

create or replace function private.member_sees_event(p_member uuid, p_event uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.events e
     where e.id = p_event
       and (
         e.audience in ('public', 'club')
         or e.added_by = p_member
         or exists (
           select 1 from public.organization_representatives r
            where r.organization_id = e.organization_id and r.member_id = p_member
         )
         -- A co-host's org admins (the owner, 2026-11-07).
         or exists (
           select 1 from public.event_cohosts c
             join public.organization_representatives r
               on r.organization_id = c.organization_id and r.member_id = p_member
            where c.event_id = e.id
         )
         or (
           e.audience = 'followers'
           and (
             exists (
               select 1 from public.organization_follows f
                where f.organization_id = e.organization_id and f.member_id = p_member
             )
             or exists (
               select 1 from public.organization_members om
                where om.organization_id = e.organization_id and om.member_id = p_member
                  and om.left_at is null and om.denied_at is null
             )
           )
         )
         or (
           e.audience = 'groups'
           and exists (
             select 1 from public.event_audience_groups g
               join public.chat_thread_members t
                 on t.thread_id = g.thread_id and t.member_id = p_member
              where g.event_id = e.id
           )
         )
         or (
           e.audience = 'organizations'
           and exists (
             select 1 from public.event_audience_organizations a
              where a.event_id = e.id
                and (
                  exists (select 1 from public.organization_follows f
                           where f.organization_id = a.organization_id and f.member_id = p_member)
                  or exists (select 1 from public.organization_members om
                              where om.organization_id = a.organization_id and om.member_id = p_member
                                and om.left_at is null and om.denied_at is null)
                  or exists (select 1 from public.organization_representatives r
                              where r.organization_id = a.organization_id and r.member_id = p_member)
                )
           )
         )
         or (
           e.audience = 'people'
           and exists (
             select 1 from public.event_invitees i
              where i.event_id = e.id and i.member_id = p_member
           )
         )
       )
  );
$function$;

create or replace function public.event_visibility(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'audience', e.audience,
    'may_change', private.may_set_visibility(e.id),
    'organizations', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'name', o.name, 'short_code', o.short_code, 'logo_path', o.logo_path)
               order by o.name), '[]')
        from public.event_audience_organizations a
        join public.organizations o on o.id = a.organization_id
       where a.event_id = e.id),
    'groups', case when private.may_set_visibility(e.id) then (
      select coalesce(jsonb_agg(g.thread_id), '[]')
        from public.event_audience_groups g where g.event_id = e.id) end,
    'invitees', case
      when private.may_set_visibility(e.id) or e.added_by = auth.uid() or exists (
        select 1 from public.event_cohosts c
          join public.organization_representatives r
            on r.organization_id = c.organization_id and r.member_id = auth.uid()
         where c.event_id = e.id
      ) then (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', m.id, 'name', m.display_name, 'username', m.username,
                 'photo_path', m.photo_path) order by lower(m.display_name)), '[]')
          from public.event_invitees i
          join public.members m on m.id = i.member_id and m.status = 'active'
         where i.event_id = e.id)
      when e.audience = 'people' and exists (
        select 1 from public.event_invitees x where x.event_id = e.id and x.member_id = auth.uid()
      ) then (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', m.id, 'name', m.display_name, 'username', m.username,
                 'photo_path', m.photo_path) order by lower(m.display_name)), '[]')
          from public.event_invitees i
          join public.members m on m.id = i.member_id and m.status = 'active'
         where i.event_id = e.id
           and (m.id = auth.uid() or exists (select 1 from public.browse_members b where b.id = m.id)))
    end,
    'invitee_count', (select count(*) from public.event_invitees i where i.event_id = e.id),
    -- Who changed it or invited people since (20261107140000), first first.
    'changed_by', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.display_name, 'photo_path', m.photo_path)
               order by x.first_at), '[]')
        from public.event_editors x
        join public.members m on m.id = x.member_id and m.status = 'active'
       where x.event_id = e.id and x.member_id is distinct from e.added_by
         and (m.id = auth.uid() or exists (select 1 from public.browse_members b where b.id = m.id))),
    -- Who added it, when the reader may see them.
    'added_by', (
      select jsonb_build_object('id', m.id, 'name', m.display_name, 'photo_path', m.photo_path)
        from public.members m
       where m.id = e.added_by and m.status = 'active'
         and (m.id = auth.uid() or exists (select 1 from public.browse_members b where b.id = m.id)))
  )
    from public.events e
   where e.id = p_event and public.can_see_event(e.id);
$$;
