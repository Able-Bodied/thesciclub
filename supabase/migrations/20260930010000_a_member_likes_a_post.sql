-- A member likes a post in a room, and every member who can read the room can
-- see who.
--
-- The owner, 2026-09-29, for Home: HOME-PLAN.md decision 4, "Likes, with names
-- shown", and step 3. One table and nothing else. A Like button on a photograph
-- on Home and on every post in a topic, a count beside it, and the count opens
-- the list of names.
--
-- ---------------------------------------------------------------------------
-- The row is the whole fact
-- ---------------------------------------------------------------------------
-- The shape of organization_follows: a row existing means "this member likes
-- this post", and unliking is a delete. No count column on chat_posts and no
-- counts view. The client reads (post_id, member_id) for the posts on screen
-- and gets the count and the names from the same rows, which the select policy
-- already allows — a count kept anywhere else is a second number that can
-- disagree with the list it counts.
--
-- ---------------------------------------------------------------------------
-- Who can see a like
-- ---------------------------------------------------------------------------
-- Everybody who can read the post: chat_room_is_readable on the post's topic's
-- room, the same gate as chat_posts' own select policy. That is the owner's
-- decision — names shown, to the room's readers and to nobody else. So a
-- closed room's likes are invisible to a member exactly as its posts are, and
-- a suspended member, who still reads, still sees them.
--
-- One select policy, on purpose. Two select policies are ORed; a second one
-- (say "your own likes") would widen this one, and every read that means
-- "mine" would then have to say so itself.
--
-- ---------------------------------------------------------------------------
-- Who can like
-- ---------------------------------------------------------------------------
-- An active member, as themselves, a standing post in a room they can read,
-- and not their own post. Suspension takes away writing and a like is a
-- write. A removed post cannot be liked; the likes it had before it went stay
-- underneath, as the post's row does, and nothing draws them. No membership
-- row is asked for: since 20260930000000 nothing in a room needs joining.
--
-- Unliking is your own row, active or not — somebody paused can still take
-- back what they did, as they can remove their own post.
--
-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Insert is granted by column, (post_id, member_id), never on the table, for
-- the reason 20260918110000 gives: a whole-table grant lets a member choose
-- liked_at, and RLS cannot take a granted column back. No update grant at all.
-- The client's insert is on conflict do nothing (ignoreDuplicates), which
-- needs only insert — an upsert that updates would be refused, and that is
-- right. See HANDOFF.md, "An upsert is on conflict do update".
--
-- ---------------------------------------------------------------------------
-- What this does not do
-- ---------------------------------------------------------------------------
-- Not in the supabase_realtime publication: a like is not urgent, and the
-- names would be on the wire to every subscriber. No notification: no
-- trigger, no new kind in push_owed (HOME-PLAN.md, "Out of scope"). No
-- function, so nothing here joins the advisor's list of functions without a
-- search_path or with loose grants.
--
-- Removing a member takes their likes (on delete cascade), as it takes what
-- they joined and read. Deleting a topic takes its posts, and they take their
-- likes, by the same cascade admin_delete_topic already relies on.

create table if not exists public.chat_post_likes (
  post_id uuid not null references public.chat_posts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (post_id, member_id)
);

comment on table public.chat_post_likes is
  'Who likes which post. Readable by whoever can read the post''s room; a member inserts and deletes their own.';

-- The primary key serves "the likes on these posts". This one serves the
-- cascade when a member is removed, which would otherwise scan the table.
create index if not exists chat_post_likes_member_idx on public.chat_post_likes (member_id);

alter table public.chat_post_likes enable row level security;

drop policy if exists "a member reads the likes in a readable room" on public.chat_post_likes;
create policy "a member reads the likes in a readable room"
  on public.chat_post_likes for select
  to authenticated
  using (
    exists (
      select 1
        from public.chat_posts p
        join public.chat_topics t on t.id = p.topic_id
       where p.id = chat_post_likes.post_id
         and public.chat_room_is_readable(t.room_id)
    )
  );

drop policy if exists "an active member likes somebody else's standing post" on public.chat_post_likes;
create policy "an active member likes somebody else's standing post"
  on public.chat_post_likes for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and public.is_active_member()
    and exists (
      select 1
        from public.chat_posts p
        join public.chat_topics t on t.id = p.topic_id
       where p.id = chat_post_likes.post_id
         and p.removed_at is null
         -- A former member's post (author_id null) is nobody's own.
         and p.author_id is distinct from (select auth.uid())
         and public.chat_room_is_readable(t.room_id)
    )
  );

drop policy if exists "a member takes back their own like" on public.chat_post_likes;
create policy "a member takes back their own like"
  on public.chat_post_likes for delete
  to authenticated
  using (member_id = (select auth.uid()));

-- `authenticated` is named — see 20260918020000's header. Supabase's default
-- privileges hand a new table to anon and authenticated with every verb;
-- take all of it back, then give exactly what the policies above gate.
revoke all on public.chat_post_likes from anon, authenticated, public;
grant select, delete on public.chat_post_likes to authenticated;
grant insert (post_id, member_id) on public.chat_post_likes to authenticated;
