-- ============================================================================
-- Can't go is an answer to a calendar invitation too
-- ============================================================================
-- Can't go (20261114080000) reached main while the invitation's chat invites
-- (20261117150000) waited on the test site, and neither knew the other. A
-- member who said Can't go has no RSVP row, so to an invitation they had not
-- answered. The owner, 2026-11-17: skip them.
--
-- Two places, the same rule: what a member said in the club stands.
--   * calendar_ask_guests: no chat invite to a member who said Can't go to
--     the date they would be asked to, or a later one of its series.
--   * calendar_after_applied: a guest who accepted in their calendar and then
--     said Can't go to a date in the club is not made Going to that date
--     again each time the invitation changes (the RSVP would also have
--     cleared their Can't go, by event_rsvps_clear_decline).
--
-- Both functions are 20261117150000's but for those lines.
-- Probe: supabase/tests/calendar-invite-asks-and-emails.sql, step 6.
-- ============================================================================

-- One message each to the guests who have not answered, from the sender.
create or replace function private.calendar_ask_guests(made uuid, payload jsonb, before_ timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.events%rowtype;
  coming public.events%rowtype;
  organizer uuid;
  uid_ text := payload ->> 'uid';
  guests jsonb := payload -> 'guestMembers';
  base text := private.calendar_base_uid(payload ->> 'uid');
  claims text := current_setting('request.jwt.claims', true);
  claim_sub text := current_setting('request.jwt.claim.sub', true);
  guest uuid;
  thread uuid;
  message uuid;
  words text;
begin
  if base = '' or jsonb_typeof(guests) is distinct from 'array' then
    return;
  end if;
  select * into o from public.events e where e.id = made;
  if not found then
    return;
  end if;
  -- The date they are asked to: the next one still to come.
  select e.* into coming
    from public.events e
   where (e.id = o.id
          or (o.series_id is not null and e.series_id = o.series_id and e.start_time >= o.start_time))
     and e.start_time > now()
     and (before_ is null or e.start_time < before_)
   order by e.start_time
   limit 1;
  if not found then
    return;
  end if;
  -- Whoever sent the invitation; approving a held one is not sending it.
  organizer := coalesce(
    (select i.sender_member_id from public.calendar_invites i where i.uid = uid_),
    auth.uid(),
    o.added_by);
  if organizer is null
     or not exists (select 1 from public.members m where m.id = organizer and m.status = 'active') then
    return;
  end if;
  words := 'You''re invited: ' || coming.title || E'\n'
    || to_char(coming.start_time at time zone coalesce(coming.timezone, 'America/Los_Angeles'),
               case when coalesce(coming.all_day, false)
                    then 'FMDay, FMMonth FMDD'
                    else 'FMDay, FMMonth FMDD "at" FMHH12:MI AM' end)
    || E'\n' || 'https://thesciclub.com/events/' || coming.id::text;

  for guest in
    select m.id
      from jsonb_array_elements(guests) g(x)
      join public.members m on m.id = (g.x ->> 'member')::uuid and m.status = 'active'
     where g.x ->> 'answer' = 'none'
       and m.id <> organizer
       and private.member_sees_event(m.id, coming.id)
       and not exists (select 1 from public.calendar_invite_asks a
                        where a.base_uid = base and a.member_id = m.id)
       -- They have answered in the club already, this date or a later one.
       and not exists (
         select 1 from public.event_rsvps v
           join public.events e on e.id = v.event_id
          where v.member_id = m.id
            and (e.id = coming.id
                 or (coming.series_id is not null and e.series_id = coming.series_id
                     and e.start_time >= coming.start_time)))
       -- Can't go is an answer too (20261114080000).
       and not exists (
         select 1 from public.event_declines d
           join public.events e on e.id = d.event_id
          where d.member_id = m.id
            and (e.id = coming.id
                 or (coming.series_id is not null and e.series_id = coming.series_id
                     and e.start_time >= coming.start_time)))
  loop
    -- Each on their own: one who cannot be messaged does not stop the rest,
    -- and is not marked asked.
    begin
      perform private.act_as(organizer);
      thread := public.chat_open_direct(guest);
      -- The club's own writing, so not counted against the sender's thirty
      -- messages a minute (20261112020000): an invitation can have more guests.
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
      insert into public.chat_messages (thread_id, author_id, body)
      values (thread, organizer, words)
      returning id into message;
      insert into public.calendar_invite_asks (base_uid, member_id, event_id, message_id)
      values (base, guest, coming.id, message);
    exception when others then
      raise warning 'calendar_ask_guests: %', sqlerrm;
    end;
  end loop;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
exception when others then
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
  raise warning 'calendar_ask_guests: %', sqlerrm;
end;
$$;

revoke all on function private.calendar_ask_guests(uuid, jsonb, timestamptz) from public, anon, authenticated;

-- As 20261117150000, but no RSVP for a date the member said Can't go to.
create or replace function private.calendar_after_applied(made uuid, payload jsonb, before_ timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.events%rowtype;
  files jsonb := private.calendar_clean_attachments(payload -> 'attachments');
  claims text := current_setting('request.jwt.claims', true);
  claim_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select * into o from public.events e where e.id = made;
  if not found then
    return;
  end if;
  -- Only when the invitation says: one read before this has no such key.
  if payload ? 'attachments' then
    update public.events e
       set attachments = files
     where (e.id = o.id
            or (o.series_id is not null and e.series_id = o.series_id
                and e.start_time >= o.start_time and e.start_time > now()))
       and (before_ is null or e.start_time < before_)
       and e.attachments is distinct from files;
  end if;
  if jsonb_typeof(payload -> 'guestMembers') = 'array' then
    -- Nobody added anybody: quietly, as 20261101090000 gathers an event chat.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.event_rsvps (event_id, member_id, status)
    select e.id, m.id, case g.x ->> 'answer' when 'yes' then 'going' else 'interested' end
      from jsonb_array_elements(payload -> 'guestMembers') g(x)
      join public.members m on m.id = (g.x ->> 'member')::uuid and m.status = 'active'
      join public.events e
        on e.id = o.id
        or (o.series_id is not null and e.series_id = o.series_id and e.start_time >= o.start_time)
     where g.x ->> 'answer' in ('yes', 'maybe')
       and e.start_time > now()
       and (before_ is null or e.start_time < before_)
       -- Their Can't go to this date stands (20261114080000).
       and not exists (select 1 from public.event_declines d
                        where d.event_id = e.id and d.member_id = m.id)
    on conflict (event_id, member_id) do nothing;
    perform set_config('request.jwt.claims', coalesce(claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
    perform private.calendar_ask_guests(made, payload, before_);
  end if;
exception when others then
  raise warning 'calendar_after_applied: %', sqlerrm;
end;
$$;

revoke all on function private.calendar_after_applied(uuid, jsonb, timestamptz) from public, anon, authenticated;
