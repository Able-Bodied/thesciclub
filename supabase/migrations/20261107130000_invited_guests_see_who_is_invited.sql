-- Who is invited to an invite-only event (the owner, 2026-11-07): its guests
-- see the list too, as its organizers do, and everyone who sees the event
-- sees who added it. Its creator sees every invitee. A guest sees only the members the directory shows them
-- (listed, active, no block either way); organizers see every invitee.

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
      when private.may_set_visibility(e.id) or e.added_by = auth.uid() then (
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
