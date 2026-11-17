-- An invitation asks its guests who have not answered, and keeps its emails
--
-- The owner, 2026-11-17, of events from calendar invitations (20261117130000
-- RSVPs the guests who said yes or maybe):
--
--   "users that have not responded should get an invite sent to them. So send
--    an invite to the event that is being created in a chat between the
--    organizer and the user. Also, it would be useful for the organizer to be
--    able to see the e-mails that resulted in the current event."
--
-- 1. A guest who is an active member and has not answered the calendar
--    invitation gets one message from the invitation's sender, in the
--    conversation between the two of them: the event's name, when it is and
--    its link, as Share sends an event (shared-posts.ts). Once for each
--    invitation and member, however often the invitation changes
--    (calendar_invite_asks). Not to somebody who cannot see the event, has
--    already answered it in the club, or cannot be messaged by the sender
--    (a block, or a member nobody can find): chat_open_direct decides, as it
--    does for a message written by hand.
--
-- 2. Every email that added, changed, held, cancelled or refused an
--    invitation is kept as one line (calendar_invite_emails), with what it
--    said, for whoever may change the event. Not its guests: nobody's address
--    is kept but the sender's. Emails before this migration left one line,
--    the last one received.
--
-- Additive: two tables, one trigger, and three functions replaced that only
-- the calendar-inbound function reaches. The shipped iPhone builds read none
-- of it.
--
-- Probe: calendar-invite-asks-and-emails.sql. Undo: supabase/undo/20261117150000.sql.

-- ------------------------------------------------------------------- asked --
create table public.calendar_invite_asks (
  -- The invitation's UID without "this and following" suffixes, so the later
  -- part of a split series does not ask again.
  base_uid   text not null,
  member_id  uuid not null references public.members (id) on delete cascade,
  event_id   uuid references public.events (id) on delete set null,
  message_id uuid references public.chat_messages (id) on delete set null,
  asked_at   timestamptz not null default now(),
  primary key (base_uid, member_id)
);

alter table public.calendar_invite_asks enable row level security;
revoke all on public.calendar_invite_asks from public, anon, authenticated;

comment on table public.calendar_invite_asks is
  'Which members a calendar invitation has already messaged for an answer, once each. Written by calendar_ask_guests. See 20261117150000.';

-- The guests who are active members, each once: yes before maybe before no
-- answer yet. As 20261117130000, and those who have not answered.
create or replace function private.calendar_guest_members(guests jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('member', q.id, 'answer', q.answer)), '[]'::jsonb)
    from (
      select distinct on (m.id) m.id, g.x ->> 'answer' as answer
        from jsonb_array_elements(
               case when jsonb_typeof(guests) = 'array' then guests else '[]'::jsonb end) g(x)
        join auth.users u on lower(u.email) = public.normalize_email(g.x ->> 'email')
        join public.members m on m.id = u.id and m.status = 'active'
       where g.x ->> 'answer' in ('yes', 'maybe', 'none')
       order by m.id, array_position(array['yes', 'maybe', 'none'], g.x ->> 'answer')
    ) q;
$$;

revoke all on function private.calendar_guest_members(jsonb) from public, anon, authenticated;

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

-- As 20261117130000; RSVPs only for yes and maybe now that the list also has
-- those who have not answered, and those are asked.
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

-- ------------------------------------------------------------------ emails --
create table public.calendar_invite_emails (
  id            uuid primary key default gen_random_uuid(),
  invite_id     uuid not null references public.calendar_invites (id) on delete cascade,
  base_uid      text not null,
  -- The transaction's time: one email is one line, however many times its
  -- invitation's row is written while it is taken in.
  received_at   timestamptz not null default now(),
  outcome       text not null check (outcome in
                  ('added', 'updated', 'held', 'cancelled', 'refused', 'approved', 'discarded')),
  reason        text,
  sender_email  extensions.citext not null,
  verified      boolean not null,
  sequence      integer not null default 0,
  -- What the email said, without its guests.
  payload       jsonb not null,
  event_id      uuid references public.events (id) on delete set null,
  decided_by    uuid references public.members (id) on delete set null,
  unique (invite_id, received_at, outcome)
);

create index calendar_invite_emails_base_idx on public.calendar_invite_emails (base_uid, received_at desc);

alter table public.calendar_invite_emails enable row level security;
revoke all on public.calendar_invite_emails from public, anon, authenticated;

comment on table public.calendar_invite_emails is
  'One line for each email that added, changed, held, cancelled or refused a calendar invitation, and each approval. Read through event_invitation_emails. See 20261117150000.';

create or replace function private.calendar_invite_keeps_its_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  what text;
begin
  if tg_op = 'UPDATE'
     and new.sequence is not distinct from old.sequence
     and new.state is not distinct from old.state
     and new.received_at is not distinct from old.received_at
     and new.decided_at is not distinct from old.decided_at
     and new.payload is not distinct from old.payload then
    -- Only where it points changed (its event, the part it carries on).
    update public.calendar_invite_emails l
       set event_id = new.event_id
     where l.invite_id = new.id and l.received_at = now() and new.event_id is not null;
    return null;
  end if;
  what := case
    when tg_op = 'UPDATE' and new.decided_at is not null
         and new.decided_at is distinct from old.decided_at
      then case when new.state = 'discarded' then 'discarded' else 'approved' end
    when new.state = 'added' and tg_op = 'UPDATE' and old.state = 'added' then 'updated'
    -- The later part of "this and following events": new here, a change to its event.
    when new.state = 'added' and tg_op = 'INSERT' and new.continues is not null then 'updated'
    else new.state
  end;
  insert into public.calendar_invite_emails
    (invite_id, base_uid, outcome, reason, sender_email, verified, sequence, payload, event_id, decided_by)
  values
    (new.id, private.calendar_base_uid(new.uid), what, new.reason, new.sender_email, new.verified,
     new.sequence, new.payload - 'guestMembers' - 'guests', new.event_id,
     case when what in ('approved', 'discarded') then new.decided_by end)
  on conflict (invite_id, received_at, outcome) do update
    set reason = excluded.reason, sequence = excluded.sequence, payload = excluded.payload,
        event_id = coalesce(excluded.event_id, public.calendar_invite_emails.event_id),
        verified = excluded.verified;
  return null;
exception when others then
  -- The history is never why an invitation is not taken.
  raise warning 'calendar_invite_keeps_its_emails: %', sqlerrm;
  return null;
end;
$$;

revoke all on function private.calendar_invite_keeps_its_emails() from public, anon, authenticated;

create trigger calendar_invites_keep_their_emails
  after insert or update on public.calendar_invites
  for each row execute function private.calendar_invite_keeps_its_emails();

-- What is known of the invitations already here: the last email of each.
insert into public.calendar_invite_emails
  (invite_id, base_uid, received_at, outcome, reason, sender_email, verified, sequence, payload, event_id)
select i.id, private.calendar_base_uid(i.uid), i.received_at,
       case when i.state = 'discarded' then 'discarded' else i.state end,
       i.reason, i.sender_email, i.verified, i.sequence,
       i.payload - 'guestMembers' - 'guests', i.event_id
  from public.calendar_invites i
on conflict do nothing;

-- For whoever may change the event: the emails of the invitation it came
-- from, and of the other parts of the same invitation, newest first.
create or replace function public.event_invitation_emails(p_event uuid)
returns table (
  id uuid,
  received_at timestamptz,
  outcome text,
  reason text,
  sender_email text,
  verified boolean,
  title text,
  starts timestamptz,
  all_day boolean,
  timezone text,
  place text,
  link text,
  description text,
  repeats boolean,
  decided_by_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with here as (
    select e.id, e.series_id from public.events e
     where e.id = p_event and public.may_change_event(p_event)
  ), family as (
    select distinct private.calendar_base_uid(i.uid) as base_uid
      from public.calendar_invites i
      join public.events e on e.id = i.event_id
      join here h on e.id = h.id or (h.series_id is not null and e.series_id = h.series_id)
  )
  select l.id, l.received_at, l.outcome, l.reason, l.sender_email::text, l.verified,
         l.payload ->> 'title',
         (l.payload ->> 'starts')::timestamptz,
         coalesce((l.payload ->> 'allDay')::boolean, false),
         coalesce(l.payload ->> 'timezone', 'America/Los_Angeles'),
         nullif(l.payload ->> 'location', ''),
         nullif(l.payload ->> 'url', ''),
         nullif(left(l.payload ->> 'description', 4000), ''),
         jsonb_typeof(l.payload -> 'repeat') = 'object',
         (select m.display_name from public.members m where m.id = l.decided_by)
    from public.calendar_invite_emails l
   where l.base_uid in (select f.base_uid from family f)
   order by l.received_at desc, l.id
   limit 200;
$$;

revoke all on function public.event_invitation_emails(uuid) from public, anon;
grant execute on function public.event_invitation_emails(uuid) to authenticated;
