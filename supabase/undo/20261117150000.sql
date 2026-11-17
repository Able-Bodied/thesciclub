-- Undo for 20261117150000_an_invitation_asks_its_guests_and_keeps_its_emails.sql:
-- the two tables, the trigger and the reader gone, and the guests functions
-- as 20261117130000 left them. Messages already sent stay in their
-- conversations. Redeploy calendar-inbound from before it first, or guests
-- who have not answered are RSVPd as Interested.
drop function if exists public.event_invitation_emails(uuid);
drop trigger if exists calendar_invites_keep_their_emails on public.calendar_invites;
drop function if exists private.calendar_invite_keeps_its_emails();
drop table if exists public.calendar_invite_emails;

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
       where g.x ->> 'answer' in ('yes', 'maybe')
       order by m.id, (g.x ->> 'answer' = 'yes') desc
    ) q;
$$;

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
     where e.start_time > now()
       and (before_ is null or e.start_time < before_)
    on conflict (event_id, member_id) do nothing;
    perform set_config('request.jwt.claims', coalesce(claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
  end if;
exception when others then
  raise warning 'calendar_after_applied: %', sqlerrm;
end;
$$;

drop function if exists private.calendar_ask_guests(uuid, jsonb, timestamptz);
drop table if exists public.calendar_invite_asks;
