-- ============================================================================
-- An administrator's QR code, for conventions
-- ============================================================================
-- The owner, 2026-10-14. Every administrator can show a QR code that opens
-- /join?from=<code>. It gives credit and nothing else (the owner's "option A"):
--
--   * Joining open (20261014000000): the join screen says who invited them,
--     and the walk-in's invite (20261014010000) names that administrator as
--     the inviter and the code's event. Admin's list reads "Invited by Alfred
--     · Abilities Expo LA", and the administrator is notified.
--   * Joining closed: the code lets nobody in. The screen says to ask that
--     administrator, with the email the code carries (their account address
--     unless they typed another when making it).
--
-- A code is one administrator and one event (or no event), typed freely each
-- time. It can be turned off; a turned-off code, or one whose maker is no
-- longer an active administrator, answers nothing, so it shows no name and no
-- email. Credit already given stays.
--
-- How the credit travels: the code is held by the browser through sign-up
-- (as an invite link's token is), then claim_qr_code records it against the
-- signed-in account in qr_code_claims. consume_invite_for_new_member reads
-- the claim when it writes a walk-in's invite. A real invite, when there is
-- one, is consumed instead and the claim is ignored.
--
-- Nothing here is readable by a member or by anon except through
-- qr_code_details, which answers for one code: the inviter's name, the event,
-- whether joining is open, and the email only while it is closed.
-- ============================================================================

-- ------------------------------------------------------------------- codes --
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  admin_id uuid not null references public.members (id) on delete cascade,
  event_name text check (
    event_name is null or (event_name = btrim(event_name) and char_length(event_name) between 1 and 80)
  ),
  contact_email extensions.citext not null check (
    contact_email::text = lower(btrim(contact_email::text))
    and char_length(contact_email::text) <= 254
    and contact_email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  created_at timestamptz not null default now(),
  turned_off_at timestamptz
);

comment on table public.qr_codes is
  'An administrator''s QR code: credit for whoever joins from it, and an email to ask while joining is closed. See 20261014020000.';

create index if not exists qr_codes_admin_idx on public.qr_codes (admin_id, created_at desc);

alter table public.qr_codes enable row level security;
revoke all on public.qr_codes from public, anon, authenticated;
grant select on public.qr_codes to authenticated;

drop policy if exists "administrators read their own codes" on public.qr_codes;
create policy "administrators read their own codes"
  on public.qr_codes for select
  using (admin_id = auth.uid() and public.is_admin());

-- ------------------------------------------------------------------ claims --
-- One per account: the last code it was sent by. Never read by a client.
create table if not exists public.qr_code_claims (
  account uuid primary key references auth.users (id) on delete cascade,
  qr_code_id uuid not null references public.qr_codes (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.qr_code_claims enable row level security;
revoke all on public.qr_code_claims from public, anon, authenticated;

-- ------------------------------------------------------- invites remember --
alter table public.invites
  add column if not exists qr_code_id uuid references public.qr_codes (id) on delete set null;

comment on column public.invites.qr_code_id is
  'The administrator''s QR code a walk-in joined from. See 20261014020000.';

-- A live code: not turned off, and its maker still an active administrator.
create or replace function private.live_qr_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select q.id
    from public.qr_codes q
    join public.members a on a.id = q.admin_id and a.is_admin and a.status = 'active'
   where q.code = btrim(coalesce(p_code, ''))
     and q.turned_off_at is null;
$$;

revoke all on function private.live_qr_code(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- making one
create or replace function public.admin_create_qr_code(p_event_name text, p_contact_email text)
returns public.qr_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  event text := nullif(btrim(coalesce(p_event_name, '')), '');
  address text := public.normalize_email(p_contact_email);
  made public.qr_codes;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can do that.' using errcode = '42501';
  end if;
  if event is not null and char_length(event) > 80 then
    raise exception 'Keep the event name to 80 characters.' using errcode = '22023';
  end if;
  if address is null or not private.valid_email(address) then
    raise exception 'Enter an email address people can write to.' using errcode = '22023';
  end if;
  insert into public.qr_codes (admin_id, event_name, contact_email)
  values (auth.uid(), event, address)
  returning * into made;
  return made;
end;
$$;

revoke all on function public.admin_create_qr_code(text, text) from public, anon;
grant execute on function public.admin_create_qr_code(text, text) to authenticated;

create or replace function public.admin_turn_off_qr_code(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can do that.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.qr_codes where id = p_code_id and admin_id = auth.uid()) then
    raise exception 'No such code.' using errcode = '22023';
  end if;
  update public.qr_codes
     set turned_off_at = coalesce(turned_off_at, now())
   where id = p_code_id and admin_id = auth.uid();
end;
$$;

revoke all on function public.admin_turn_off_qr_code(uuid) from public, anon;
grant execute on function public.admin_turn_off_qr_code(uuid) to authenticated;

-- ------------------------------------------------------- what a code says --
create or replace function public.qr_code_details(p_code text)
returns table (inviter_name text, event_name text, joining_open boolean, contact_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.display_name,
         q.event_name,
         public.joining_is_open(),
         case when public.joining_is_open() then null else q.contact_email::text end
    from public.qr_codes q
    join public.members a on a.id = q.admin_id
   where q.id = private.live_qr_code(p_code);
$$;

comment on function public.qr_code_details(text) is
  'For the join screen: who a live QR code is from, its event, whether joining is open, and the email to ask while it is closed. See 20261014020000.';

revoke all on function public.qr_code_details(text) from public;
grant execute on function public.qr_code_details(text) to anon, authenticated;

-- ---------------------------------------------------------------- claiming --
create or replace function public.claim_qr_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  live uuid := private.live_qr_code(p_code);
begin
  if me is null or live is null or exists (select 1 from public.members where id = me) then
    return false;
  end if;
  insert into public.qr_code_claims (account, qr_code_id)
  values (me, live)
  on conflict (account) do update set qr_code_id = excluded.qr_code_id, claimed_at = now();
  return true;
end;
$$;

revoke all on function public.claim_qr_code(text) from public, anon;
grant execute on function public.claim_qr_code(text) to authenticated;

-- ------------------------------------------------ the walk-in's invite, again
-- As 20261014010000, with the claimed code's administrator and event.
create or replace function public.consume_invite_for_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_id uuid;
  account_email text := private.confirmed_email(new.id);
  from_code uuid;
  from_admin uuid;
begin
  select i.id into matched_id
    from public.invites i
   where i.status = 'pending'
     and (
       i.claimed_by = new.id
       or (account_email is not null and lower(i.email::text) = account_email)
     )
   order by coalesce(i.claimed_by = new.id, false) desc, i.created_at
   limit 1
     for update;

  if matched_id is not null then
    update public.invites
       set status = 'consumed', consumed_at = now()
     where id = matched_id;
  elsif new.invite_id is null
        and auth.uid() = new.id
        and account_email is not null
        and not public.is_blocked_email(account_email)
        and public.joining_is_open() then
    -- Credit for the code they came from, if its maker is still an active
    -- administrator. Turned off since the claim still counts: it was live then.
    select q.id, q.admin_id into from_code, from_admin
      from public.qr_code_claims c
      join public.qr_codes q on q.id = c.qr_code_id
      join public.members a on a.id = q.admin_id and a.is_admin and a.status = 'active'
     where c.account = new.id;

    insert into public.invites (
      email, status, consumed_at, claimed_by, claimed_at, joined_while_open,
      invited_by_member_id, qr_code_id
    )
    values (account_email, 'consumed', now(), new.id, now(), true, from_admin, from_code)
    on conflict (email) where status in ('pending', 'consumed') and email is not null
    do nothing
    returning id into matched_id;
  end if;

  new.invite_id := coalesce(new.invite_id, matched_id);

  -- An instruction to this trigger, not a fact about the member: never
  -- stored. members_start_fresh_not_stored holds it to false afterwards.
  new.start_fresh := false;

  return new;
end;
$$;

revoke all on function public.consume_invite_for_new_member() from public, anon, authenticated;

-- ------------------------------------------------------------ notifications
-- Both as 20261010000000, changed only where invite_joined is concerned.
create or replace function public.notifications_record(p_event text, p_key jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_id uuid;
begin
  if p_event in ('message', 'post', 'report', 'member_joined') then
    key_id := (p_key ->> 'id')::uuid;
  end if;

  insert into public.notifications as n (
    member_id, kind, tag, actor_id, thread_id, message_id, topic_id, post_id,
    event_id, organization_id, report_id, joined_id, detail
  )
  select owed.member_id, owed.kind, owed.tag, owed.actor_id, owed.thread_id,
         owed.message_id, owed.topic_id, owed.post_id, owed.event_id,
         owed.organization_id, owed.report_id, owed.joined_id, owed.detail
    from (
      -- A message: everybody else in the conversation.
      select tm.member_id, t.kind, 'thread:' || t.id::text as tag, m.author_id as actor_id,
             t.id as thread_id, m.id as message_id, null::uuid as topic_id, null::uuid as post_id,
             null::uuid as event_id, null::uuid as organization_id, null::uuid as report_id,
             null::uuid as joined_id, null::text as detail
        from public.chat_messages m
        join public.chat_threads t on t.id = m.thread_id
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id is distinct from m.author_id
        join public.members r on r.id = tm.member_id and r.status = 'active'
       where p_event = 'message' and m.id = key_id and m.removed_at is null
         and not exists (
           select 1 from public.chat_thread_mutes x where x.thread_id = t.id and x.member_id = r.id
         )

      union all
      -- A reply: the topic's starter, and everybody else who has posted in it.
      select owed.member_id, owed.kind, 'topic:' || p.topic_id::text, p.author_id,
             null, null, p.topic_id, p.id, null, null, null, null, null
        from (
          select p.id, p.author_id, p.topic_id, tp.author_id as starter_id, tp.room_id, rm.opened_at
            from public.chat_posts p
            join public.chat_topics tp on tp.id = p.topic_id
            join public.chat_rooms rm on rm.id = tp.room_id
           where p_event = 'post' and p.id = key_id and p.removed_at is null
        ) p
        join lateral (
          select p.starter_id as member_id, 'reply'::text as kind
           where p.starter_id is not null and p.starter_id is distinct from p.author_id
          union
          select distinct o.author_id, 'reply_participant'::text
            from public.chat_posts o
           where o.topic_id = p.topic_id and o.removed_at is null
             and o.author_id is not null
             and o.author_id is distinct from p.author_id
             and o.author_id is distinct from p.starter_id
        ) owed on true
        join public.members r on r.id = owed.member_id and r.status = 'active'
       where (p.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = p.topic_id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = p.room_id and x.member_id = r.id
         )

      union all
      -- A like: the author of the post.
      select p.author_id, 'like', 'like:' || p.id::text, lk.member_id,
             null, null, tp.id, p.id, null, null, null, null, null
        from public.chat_post_likes lk
        join public.chat_posts p on p.id = lk.post_id and p.removed_at is null
        join public.chat_topics tp on tp.id = p.topic_id
        join public.chat_rooms rm on rm.id = tp.room_id
        join public.members r on r.id = p.author_id and r.status = 'active'
       where p_event = 'like'
         and lk.post_id = (p_key ->> 'post_id')::uuid
         and lk.member_id = (p_key ->> 'member_id')::uuid
         and p.author_id is distinct from lk.member_id
         and (rm.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = tp.id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = tp.room_id and x.member_id = r.id
         )

      union all
      -- Added to a group by somebody else.
      select tm.member_id, 'group_add', 'group_add:' || t.id::text, (p_key ->> 'by')::uuid,
             t.id, null, null, null, null, null, null, null, null
        from public.chat_threads t
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id = (p_key ->> 'member_id')::uuid
        join public.members r on r.id = tm.member_id and r.status = 'active'
       where p_event = 'group_add'
         and t.id = (p_key ->> 'thread_id')::uuid
         and t.kind = 'group' and t.event_id is null
         and (p_key ->> 'by') is not null
         and (p_key ->> 'by')::uuid <> tm.member_id

      union all
      -- A report: administrators other than the reporter.
      select r.id, 'report', 'report:' || rep.id::text, null,
             null, null, null, null, null, null, rep.id, null, null
        from public.chat_reports rep
        join public.members r
          on r.is_admin and r.status = 'active' and r.id is distinct from rep.reporter_id
       where p_event = 'report' and rep.id = key_id

      union all
      -- Somebody joined on an invite: whoever vouched for them. From an
      -- administrator's QR code, detail says so: 'qr:' and the event, if any.
      select r.id, 'invite_joined', 'joined:' || joined.id::text, joined.id,
             null, null, null, null, null, null, null, joined.id,
             case when i.qr_code_id is not null then 'qr:' || coalesce(q.event_name, '') end
        from public.members joined
        join public.invites i on i.id = joined.invite_id
        left join public.qr_codes q on q.id = i.qr_code_id
        join public.members r
          on r.id = i.invited_by_member_id and r.status = 'active' and r.id <> joined.id
       where p_event = 'member_joined' and joined.id = key_id

      union all
      -- Tomorrow's events, to everybody going.
      select r.id, 'event_reminder', 'event:' || e.id::text, null,
             null, null, null, null, e.id, null, null, null,
             lower(to_char(e.start_time at time zone coalesce(f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam'))
        from public.events e
        left join public.data_feeds f on f.id = e.feed_id
        join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
        join public.members r on r.id = rv.member_id and r.status = 'active'
       where p_event = 'daily'
         and (e.start_time at time zone coalesce(f.timezone, 'America/Los_Angeles'))::date
             = (now() at time zone coalesce(f.timezone, 'America/Los_Angeles'))::date + 1

      union all
      -- New events from an organization a member follows, counted.
      select r.id, 'org_events', 'org:' || o.id::text, null,
             null, null, null, null, null, o.id, null, null, count(*)::text
        from public.organization_follows fo
        join public.organizations o on o.id = fo.organization_id
        join public.events e
          on e.organization_id = o.id
         and e.created_at > now() - interval '24 hours'
         and e.start_time > now()
        join public.members r on r.id = fo.member_id and r.status = 'active'
       where p_event = 'daily'
       group by r.id, o.id
    ) owed
  on conflict (member_id, tag) where read_at is null
  do update set
    created_at = clock_timestamp(),
    count = n.count + 1,
    actor_id = excluded.actor_id,
    message_id = excluded.message_id,
    post_id = excluded.post_id,
    detail = excluded.detail,
    seen_at = null;
end;
$$;

revoke all on function public.notifications_record(text, jsonb) from public, anon, authenticated;

create or replace function public.my_notifications(before timestamptz default null, max_rows integer default 40)
returns table (
  id uuid,
  kind text,
  count integer,
  created_at timestamptz,
  seen boolean,
  read boolean,
  actor_id uuid,
  actor_name text,
  actor_photo text,
  place text,
  excerpt text,
  detail text,
  url text
)
language sql
security definer
stable
set search_path = ''
as $$
  select n.id, n.kind, n.count, n.created_at, n.seen_at is not null, n.read_at is not null,
         n.actor_id,
         case when n.actor_id is null and n.kind in ('direct', 'group', 'reply', 'reply_participant', 'like', 'group_add')
              then 'Deleted member' else a.display_name end,
         a.photo_path,
         case
           when n.kind in ('direct', 'group', 'group_add') then
             coalesce(t.name, (select e.title from public.events e where e.id = t.event_id))
           when n.kind in ('reply', 'reply_participant', 'like') then tp.title
           when n.kind = 'event_reminder' then ev.title
           when n.kind = 'org_events' then o.name
           when n.kind = 'invite_joined' then j.display_name
         end,
         case
           when n.kind in ('direct', 'group') and m.removed_at is null then
             left(nullif(btrim(m.body), ''), 160)
           when n.kind in ('reply', 'reply_participant', 'like') and p.removed_at is null then
             left(nullif(btrim(p.body), ''), 160)
         end,
         n.detail,
         case
           when n.kind in ('direct', 'group') then
             '/chat/t/' || n.thread_id::text || coalesce('?message=' || n.message_id::text, '')
           when n.kind = 'group_add' then '/chat/t/' || n.thread_id::text
           when n.kind in ('reply', 'reply_participant', 'like') then
             '/chat/rooms/' || tp.room_id || '/topics/' || tp.id::text
               || coalesce('?post=' || n.post_id::text, '')
           when n.kind = 'report' then '/admin?tab=reports'
           when n.kind = 'invite_joined' and n.detail like 'qr:%' then '/admin?tab=invites'
           when n.kind = 'invite_joined' then '/invites'
           when n.kind = 'event_reminder' then '/events/' || n.event_id::text
           when n.kind = 'org_events' then '/events/organizations/' || n.organization_id::text
         end
    from public.notifications n
    left join public.members a on a.id = n.actor_id
    left join public.chat_threads t on t.id = n.thread_id
    left join public.chat_messages m on m.id = n.message_id
    left join public.chat_topics tp on tp.id = n.topic_id
    left join public.chat_posts p on p.id = n.post_id
    left join public.events ev on ev.id = n.event_id
    left join public.organizations o on o.id = n.organization_id
    left join public.members j on j.id = n.joined_id
   where n.member_id = auth.uid()
     and (before is null or n.created_at < before)
     and n.created_at > now() - interval '30 days'
     and case
       when n.kind in ('direct', 'group', 'group_add') then exists (
         select 1 from public.chat_thread_members x
          where x.thread_id = n.thread_id and x.member_id = auth.uid()
       )
       when n.kind in ('reply', 'reply_participant') then public.chat_room_is_readable(tp.room_id)
       -- A like is about the post, so it goes with the post.
       when n.kind = 'like' then p.removed_at is null and public.chat_room_is_readable(tp.room_id)
       when n.kind = 'report' then public.is_admin()
       else true
     end
   order by n.created_at desc, n.id
   limit least(greatest(coalesce(max_rows, 40), 1), 100);
$$;

revoke all on function public.my_notifications(timestamptz, integer) from public, anon;
grant execute on function public.my_notifications(timestamptz, integer) to authenticated;

-- ------------------------------------------------------------ admin's list
-- As 20261014010000, with the code's event appended.
create or replace view public.admin_invites with (security_barrier = true) as
select
  i.id,
  i.phone,
  i.phone_raw,
  i.status,
  i.note,
  i.created_at,
  i.consumed_at,
  o.name as invited_by_organization,
  inviter.display_name as invited_by_member,
  inviter.is_admin as invited_by_member_is_admin,
  claim.display_name as claimable_name,
  i.seed_member_id,
  holder.display_name as held_by,
  holder.status as held_by_status,
  (coalesce(
     private.account_created_at_for_invite(i.claimed_by, i.email::text),
     private.account_created_at(i.phone)
   ) is not null) as has_account,
  coalesce(
    private.account_created_at_for_invite(i.claimed_by, i.email::text),
    private.account_created_at(i.phone)
  ) as account_created_at,
  i.email,
  i.claimed_by,
  i.claimed_at,
  i.sent_at,
  i.joined_while_open,
  (i.qr_code_id is not null) as from_qr_code,
  qr.event_name as qr_event_name
from public.invites i
left join public.organizations o on o.id = i.invited_by_organization_id
left join public.members inviter on inviter.id = i.invited_by_member_id
left join public.members claim on claim.id = i.seed_member_id
left join public.qr_codes qr on qr.id = i.qr_code_id
left join lateral (
  select h.display_name, h.status
    from public.members h
   where h.invite_id = i.id
      or (i.phone is not null and h.phone = i.phone)
   order by coalesce(h.invite_id = i.id, false) desc
   limit 1
) holder on true
where public.is_admin();
