-- A member saves a topic, or one post in it, to find again (the owner,
-- 2026-10-20: "bookmark topics/posts").
--
-- A row is the whole fact. post_id null is the topic itself, so a topic whose
-- opening post was removed can still be saved. Private: only the member who
-- saved it reads it, so no names and no counts. Not in the realtime
-- publication, and no notification.
--
-- Saving needs the topic's room to be readable, and a post standing in that
-- topic. A paused member may save: it is private and writes nothing anybody
-- reads. What a saved row shows is still read through chat_topics and
-- chat_posts, so a room that closes later hides its saves' words too.
--
-- Insert by column, so nobody chooses saved_at; no update grant. Removing a
-- member, a topic or a post takes its saves (on delete cascade).

create table if not exists public.chat_saves (
  member_id uuid not null references public.members (id) on delete cascade,
  topic_id uuid not null references public.chat_topics (id) on delete cascade,
  post_id uuid references public.chat_posts (id) on delete cascade,
  saved_at timestamptz not null default now(),
  -- One topic save per member, and one per post: null counts as a value here.
  constraint chat_saves_once unique nulls not distinct (member_id, topic_id, post_id)
);

comment on table public.chat_saves is
  'Topics (post_id null) and posts a member saved. Read and written only by that member.';

create index if not exists chat_saves_topic_idx on public.chat_saves (topic_id);
create index if not exists chat_saves_post_idx on public.chat_saves (post_id);

alter table public.chat_saves enable row level security;

drop policy if exists "a member reads their own saves" on public.chat_saves;
create policy "a member reads their own saves"
  on public.chat_saves for select
  to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists "a member saves what they can read" on public.chat_saves;
create policy "a member saves what they can read"
  on public.chat_saves for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and public.is_member()
    and exists (
      select 1
        from public.chat_topics t
       where t.id = chat_saves.topic_id
         and public.chat_room_is_readable(t.room_id)
    )
    and (
      post_id is null
      or exists (
        select 1
          from public.chat_posts p
         where p.id = chat_saves.post_id
           and p.topic_id = chat_saves.topic_id
           and p.removed_at is null
      )
    )
  );

drop policy if exists "a member takes back their own save" on public.chat_saves;
create policy "a member takes back their own save"
  on public.chat_saves for delete
  to authenticated
  using (member_id = (select auth.uid()));

revoke all on public.chat_saves from anon, authenticated, public;
grant select, delete on public.chat_saves to authenticated;
grant insert (member_id, topic_id, post_id) on public.chat_saves to authenticated;
grant select, insert, update, delete on public.chat_saves to service_role;
