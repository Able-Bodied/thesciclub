-- Who organized an event is whoever added it and whoever changed it since
-- (the owner, 2026-11-07: "I edited it, so I should be included"). A member
-- is noted when they change what an event says, or invite somebody to it;
-- an import, a map lookup or a summary is nobody. Shown in Who's invited.

create table public.event_editors (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index event_editors_member on public.event_editors (member_id);
alter table public.event_editors enable row level security;
revoke all on public.event_editors from anon, authenticated;

create function private.note_event_editor(p_event uuid, p_member uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  insert into public.event_editors (event_id, member_id)
  select p_event, p_member
   where p_member is not null
     and exists (select 1 from public.members m where m.id = p_member)
  on conflict (event_id, member_id) do update set last_at = now();
$$;
revoke all on function private.note_event_editor(uuid, uuid) from public;

create function private.event_changed_by_member()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform private.note_event_editor(new.id, auth.uid());
  return new;
end;
$$;

create trigger events_note_who_changed_them
after update on public.events
for each row
when ((old.title, old.description, old.start_time, old.end_time, old.all_day, old.timezone,
       old.location, old.city, old.state, old.url, old.registration_url, old.meeting_url,
       old.organization_id, old.host_name, old.event_format, old.photo_path, old.photo_alt,
       old.more_photos, old.audience, old.short_link)
      is distinct from
      (new.title, new.description, new.start_time, new.end_time, new.all_day, new.timezone,
       new.location, new.city, new.state, new.url, new.registration_url, new.meeting_url,
       new.organization_id, new.host_name, new.event_format, new.photo_path, new.photo_alt,
       new.more_photos, new.audience, new.short_link))
execute function private.event_changed_by_member();

create function private.event_invite_notes_inviter()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform private.note_event_editor(new.event_id, new.invited_by);
  return new;
end;
$$;

create trigger event_invitees_note_inviter
after insert on public.event_invitees
for each row execute function private.event_invite_notes_inviter();

-- Who invited somebody before today counts too.
insert into public.event_editors (event_id, member_id, first_at, last_at)
select i.event_id, i.invited_by, min(i.created_at), max(i.created_at)
  from public.event_invitees i
  join public.members m on m.id = i.invited_by
 where i.invited_by is not null
 group by i.event_id, i.invited_by
on conflict do nothing;

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
