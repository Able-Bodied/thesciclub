-- Who is owed a notification, what mutes one, and the trigger that sends it.
--
-- Piece 4 of notifications (HANDOFF.md, "Next up: notifications on an
-- iPhone"). The owner's decisions, 2026-09-27:
--
--   - A direct message notifies the other member, with the words.
--   - A group message notifies everybody else in the group, with who sent it
--     and the words.
--   - A reply in a topic notifies whoever *started* the topic, with who
--     replied and nothing else — not the words, not the topic, not the room.
--   - A conversation can be muted, and so can a topic or a whole room.
--
-- The words are cut short and the lock-screen text is put together in the
-- Edge Function (supabase/functions/push-notify/compose.ts), which is tested.
-- This file decides *who*: that is the part a mistake in turns into a
-- stranger's message on somebody's lock screen, so it lives next to the
-- policies it has to agree with and has a probe (push-notify.sql).
--
-- ---------------------------------------------------------------------------
-- A topic reply never carries its words, and that is enforced here
-- ---------------------------------------------------------------------------
-- `push_owed` returns no body for a post at all. The function could not put a
-- reply's words on a lock screen if it tried, which is the only way to be sure
-- it never will. The rooms are named for what they are about; a lock screen is
-- read by whoever is next to it.
--
-- ---------------------------------------------------------------------------
-- Who is not owed one
-- ---------------------------------------------------------------------------
-- The author. Anybody paused (they cannot reply, and a notification is an
-- invitation to). Anybody who has muted the conversation, the topic or the
-- room. For a topic, a starter who can no longer read the room — an
-- administrator closed it — the same rule `chat_room_is_readable` applies to a
-- member reading it. A removed member has no row and so no subscriptions.
--
-- ---------------------------------------------------------------------------
-- How a message reaches the sender, and why it cannot stop the message
-- ---------------------------------------------------------------------------
-- An `after insert` trigger queues an HTTP call through pg_net, which sends it
-- after the transaction commits — so the function reads a row that exists. The
-- call carries only the table and the id; the function asks `push_owed` for
-- the rest with the service role.
--
-- Two vault secrets, and the first is the switch:
--
--   push_notify_url     where the function is. Absent, nothing is sent — so
--                       this migration is safe on a project with no function.
--   push_notify_secret  made here, at random. The trigger sends it and
--                       `push_owed` checks it, so the function's public URL
--                       cannot be used to replay somebody's message to them.
--                       The function never holds it; it passes on what it was
--                       given and the database says yes or no.
--
-- The trigger swallows every error. Somebody sending a message must never be
-- told it failed because a notification could not be queued.

create extension if not exists pg_net with schema extensions;

-- ------------------------------------------------------------------- mutes
-- The row's existence is the whole fact, as with organization_follows:
-- muting is an insert, unmuting a delete, nothing to update and so no upsert.

-- A conversation's mute belongs to the membership: leaving a group takes it
-- with it, so being added back starts unmuted rather than silently muted.
create table if not exists public.chat_thread_mutes (
  thread_id uuid not null,
  member_id uuid not null,
  muted_at timestamptz not null default now(),
  primary key (thread_id, member_id),
  foreign key (thread_id, member_id)
    references public.chat_thread_members (thread_id, member_id) on delete cascade
);

create table if not exists public.chat_topic_mutes (
  topic_id uuid not null references public.chat_topics (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  muted_at timestamptz not null default now(),
  primary key (topic_id, member_id)
);

create table if not exists public.chat_room_mutes (
  room_id text not null references public.chat_rooms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  muted_at timestamptz not null default now(),
  primary key (room_id, member_id)
);

create index if not exists chat_topic_mutes_member_idx on public.chat_topic_mutes (member_id);
create index if not exists chat_room_mutes_member_idx on public.chat_room_mutes (member_id);

comment on table public.chat_thread_mutes is 'A conversation a member gets no notifications from. Private to them.';
comment on table public.chat_topic_mutes is 'A topic whose replies a member gets no notifications for. Private to them.';
comment on table public.chat_room_mutes is 'A room whose topic replies a member gets no notifications for. Private to them.';

alter table public.chat_thread_mutes enable row level security;
alter table public.chat_topic_mutes enable row level security;
alter table public.chat_room_mutes enable row level security;

-- Nobody sees anybody else's mutes: that somebody has muted a conversation
-- with you is a statement about you they did not make to you.
drop policy if exists "members read their own thread mutes" on public.chat_thread_mutes;
create policy "members read their own thread mutes" on public.chat_thread_mutes
  for select using (member_id = auth.uid());
drop policy if exists "members mute their own threads" on public.chat_thread_mutes;
create policy "members mute their own threads" on public.chat_thread_mutes
  for insert with check (member_id = auth.uid() and public.is_thread_member(thread_id));
drop policy if exists "members unmute their own threads" on public.chat_thread_mutes;
create policy "members unmute their own threads" on public.chat_thread_mutes
  for delete using (member_id = auth.uid());

drop policy if exists "members read their own topic mutes" on public.chat_topic_mutes;
create policy "members read their own topic mutes" on public.chat_topic_mutes
  for select using (member_id = auth.uid());
drop policy if exists "members mute topics they can read" on public.chat_topic_mutes;
create policy "members mute topics they can read" on public.chat_topic_mutes
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1 from public.chat_topics t
      where t.id = topic_id and public.chat_room_is_readable(t.room_id)
    )
  );
drop policy if exists "members unmute their own topics" on public.chat_topic_mutes;
create policy "members unmute their own topics" on public.chat_topic_mutes
  for delete using (member_id = auth.uid());

drop policy if exists "members read their own room mutes" on public.chat_room_mutes;
create policy "members read their own room mutes" on public.chat_room_mutes
  for select using (member_id = auth.uid());
drop policy if exists "members mute rooms they can read" on public.chat_room_mutes;
create policy "members mute rooms they can read" on public.chat_room_mutes
  for insert with check (member_id = auth.uid() and public.chat_room_is_readable(room_id));
drop policy if exists "members unmute their own rooms" on public.chat_room_mutes;
create policy "members unmute their own rooms" on public.chat_room_mutes
  for delete using (member_id = auth.uid());

revoke all on public.chat_thread_mutes from anon, authenticated, public;
revoke all on public.chat_topic_mutes from anon, authenticated, public;
revoke all on public.chat_room_mutes from anon, authenticated, public;
grant select, insert, delete on public.chat_thread_mutes to authenticated;
grant select, insert, delete on public.chat_topic_mutes to authenticated;
grant select, insert, delete on public.chat_room_mutes to authenticated;

-- ------------------------------------------------------------------ secret
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_notify_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'push_notify_secret',
      'Sent by push_notify_enqueue and checked by push_owed. Never leaves the database.'
    );
  end if;
end;
$$;

-- -------------------------------------------------------------- push_owed
-- One row per device owed a notification for this message or post. The
-- service role only; the secret is the trigger's, see the header.
--
-- `kind` is 'direct', 'group' or 'reply'. `body` is null for a reply, always.
create or replace function public.push_owed(p_secret text, p_table text, p_id uuid)
returns table (
  endpoint text,
  p256dh text,
  auth text,
  kind text,
  author_name text,
  body text,
  photo_count integer,
  url text,
  tag text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_notify_secret'
  ) then
    raise exception 'Not the notification trigger.' using errcode = '42501';
  end if;

  if p_table = 'chat_messages' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             t.kind,
             a.display_name,
             m.body,
             cardinality(m.attachments),
             '/chat/t/' || t.id::text,
             'thread:' || t.id::text
        from public.chat_messages m
        join public.chat_threads t on t.id = m.thread_id
        join public.chat_thread_members tm
          on tm.thread_id = t.id and tm.member_id is distinct from m.author_id
        join public.members r on r.id = tm.member_id and r.status = 'active'
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = m.author_id
       where m.id = p_id
         and m.removed_at is null
         and not exists (
           select 1 from public.chat_thread_mutes x
            where x.thread_id = t.id and x.member_id = r.id
         );
  elsif p_table = 'chat_posts' then
    return query
      select s.endpoint, s.p256dh, s.auth,
             'reply'::text,
             a.display_name,
             null::text,           -- never the words of a reply; see the header
             0,
             '/chat/rooms/' || tp.room_id || '/topics/' || tp.id::text,
             'topic:' || tp.id::text
        from public.chat_posts p
        join public.chat_topics tp on tp.id = p.topic_id
        join public.chat_rooms rm on rm.id = tp.room_id
        join public.members r
          on r.id = tp.author_id and r.status = 'active'
         and tp.author_id is distinct from p.author_id
        join public.push_subscriptions s on s.member_id = r.id
        left join public.members a on a.id = p.author_id
       where p.id = p_id
         and p.removed_at is null
         and (rm.opened_at is not null or r.is_admin)
         and not exists (
           select 1 from public.chat_topic_mutes x where x.topic_id = tp.id and x.member_id = r.id
         )
         and not exists (
           select 1 from public.chat_room_mutes x where x.room_id = tp.room_id and x.member_id = r.id
         );
  end if;
end;
$$;

comment on function public.push_owed(text, text, uuid) is
  'The devices owed a notification for one new message or post, with what it may say. For the push-notify function only.';

revoke all on function public.push_owed(text, text, uuid) from public, anon, authenticated;
grant execute on function public.push_owed(text, text, uuid) to service_role;

-- ------------------------------------------------------------- push_forget
-- The push service said these are gone (404 or 410): the phone was wiped, the
-- app deleted, the permission withdrawn. Without this the table fills with
-- addresses that will never answer.
create or replace function public.push_forget(p_secret text, p_endpoints text[])
returns void
language plpgsql
security definer
volatile
set search_path = ''
as $$
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_notify_secret'
  ) then
    raise exception 'Not the notification trigger.' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
end;
$$;

revoke all on function public.push_forget(text, text[]) from public, anon, authenticated;
grant execute on function public.push_forget(text, text[]) to service_role;

-- ---------------------------------------------------------------- trigger
create or replace function public.push_notify_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
  secret text;
begin
  select s.decrypted_secret into target
    from vault.decrypted_secrets s where s.name = 'push_notify_url';
  if target is null or target = '' then
    return null;  -- switched off; see the header
  end if;
  select s.decrypted_secret into secret
    from vault.decrypted_secrets s where s.name = 'push_notify_secret';

  perform net.http_post(
    url := target,
    body := jsonb_build_object('table', tg_table_name, 'id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', secret
    ),
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  -- A notification that could not be queued must never cost the message.
  raise warning 'push_notify_enqueue: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.push_notify_enqueue() from public, anon, authenticated;

drop trigger if exists chat_messages_push_notify on public.chat_messages;
create trigger chat_messages_push_notify
  after insert on public.chat_messages
  for each row execute function public.push_notify_enqueue();

drop trigger if exists chat_posts_push_notify on public.chat_posts;
create trigger chat_posts_push_notify
  after insert on public.chat_posts
  for each row execute function public.push_notify_enqueue();
