-- ============================================================================
-- How much the club notifies you: Everything, Balanced, Only what needs me
-- ============================================================================
-- The owner, 2026-11-14: "Build the notification volume setting for test",
-- as proposed on 2026-11-13: one choice at the top of Notifications.
--
--   Everything (no row; everybody starts here, so nothing changes for anybody
--     until they choose): every push as push_owed decides it.
--   Balanced: as Everything, without the pushes that never need you; they
--     wait in the bell: likes and reactions, an organization's new events,
--     grants opening, the weekly blocks count, profile reminders, somebody
--     joining with your invite, and an event's follow-up.
--   Only what needs me: direct messages, a message or post that names you,
--     Important messages, requests waiting on you (to join, an invite, an
--     organization, a family link, a calendar invitation to approve),
--     reports for administrators, and an event you are going to starting
--     soon or its check-in. Everything else waits in the bell.
--
-- Pushes only: the bell lists everything as before, and the badge counts as
-- before. Pause (20261113150000) still stops everything for its while.
--
-- How: push_owed as 20261113150000 left it becomes private.push_owed_every,
-- untouched, and public.push_owed passes on only what each member's level
-- lets through. Whoever changes push_owed again changes
-- private.push_owed_every, or this filter is lost.
--
-- Probe: supabase/tests/notification-volume.sql.
-- ============================================================================

create table if not exists private.push_levels (
  member_id uuid primary key references public.members (id) on delete cascade,
  level text not null check (level in ('balanced', 'needs')),
  set_at timestamptz not null default now()
);
comment on table private.push_levels is
  'A member''s notification volume, when not Everything. Theirs alone. See 20261114060000.';
revoke all on private.push_levels from public, anon, authenticated;

create or replace function public.set_push_level(p_level text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'Only members can choose this.' using errcode = '42501';
  end if;
  if p_level = 'everything' then
    delete from private.push_levels p where p.member_id = auth.uid();
    return 'everything';
  end if;
  if p_level is null or p_level not in ('balanced', 'needs') then
    raise exception 'Choose Everything, Balanced or Only what needs me.' using errcode = '22023';
  end if;
  insert into private.push_levels (member_id, level) values (auth.uid(), p_level)
  on conflict (member_id) do update set level = excluded.level, set_at = now();
  return p_level;
end;
$$;
revoke all on function public.set_push_level(text) from public, anon;
grant execute on function public.set_push_level(text) to authenticated;

create or replace function public.my_push_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.level from private.push_levels p where p.member_id = auth.uid()),
    'everything');
$$;
revoke all on function public.my_push_level() from public, anon;
grant execute on function public.my_push_level() to authenticated;

-- What a level lets through, for one push.
create or replace function private.push_level_allows(
  p_member uuid, p_kind text, p_event text, p_key jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  chosen text := (select p.level from private.push_levels p where p.member_id = p_member);
begin
  if chosen is null then
    return true;
  end if;

  -- What needs you, at every level.
  if p_event = 'important'
     or p_kind in ('direct', 'mention', 'important', 'invite_request', 'join_request',
                   'organization_request', 'family_link', 'calendar_invite', 'report',
                   'event_starting', 'check_in_reminder') then
    return true;
  end if;

  if chosen = 'balanced' then
    return p_kind not in ('like', 'reaction', 'org_events', 'grant_open', 'blocks_weekly',
                          'profile_reminder', 'invite_joined', 'event_followup');
  end if;

  -- Only what needs me: a group message only when it names them.
  if p_event = 'message' then
    return exists (
      select 1 from public.chat_messages m
       where m.id = (p_key ->> 'id')::uuid
         and private.message_names(m.body, p_member)
    );
  end if;
  return false;
end;
$$;
revoke all on function private.push_level_allows(uuid, text, text, jsonb) from public, anon, authenticated;

-- The pushes as before, then each member's level.
alter function public.push_owed(text, text, jsonb) rename to push_owed_every;
alter function public.push_owed_every(text, text, jsonb) set schema private;
revoke all on function private.push_owed_every(text, text, jsonb) from public, anon, authenticated, service_role;

create function public.push_owed(p_secret text, p_event text, p_key jsonb)
returns table (
  endpoint text, p256dh text, auth text, kind text, actor_name text, body text,
  photo_count integer, subject text, detail text, url text, tag text, badge integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.*
    from private.push_owed_every(p_secret, p_event, p_key) o
   where private.push_level_allows(
     (select s.member_id from public.push_subscriptions s where s.endpoint = o.endpoint limit 1),
     o.kind, p_event, p_key);
$$;
revoke all on function public.push_owed(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.push_owed(text, text, jsonb) to service_role;
comment on function public.push_owed(text, text, jsonb) is
  'private.push_owed_every, less what each member''s notification volume holds back. See 20261114060000.';
