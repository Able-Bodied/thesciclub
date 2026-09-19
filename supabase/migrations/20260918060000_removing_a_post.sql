-- ============================================================================
-- Chat, migration 6: taking a post back
-- ============================================================================
-- Moderation v1, and no more than that. An author can remove their own post; an
-- administrator can remove anybody's. There is no reporting, no blocking, no
-- editing. A control for any of those is not drawn anywhere, because a control
-- that does nothing is the failure CONTEXT.md keeps Home a placeholder to
-- avoid.
--
-- ---------------------------------------------------------------------------
-- The body is blanked in place, and the original moves out of reach
-- ---------------------------------------------------------------------------
-- CHAT-PLAN.md offered two shapes for this and asked for one to be chosen with
-- a reason. This is the second: `chat_posts.body` is overwritten with '' and the
-- text it held is moved to chat_removed_bodies, which no member and no
-- administrator can select — it has RLS on, no policy, and no grant to anyone.
--
-- The first shape was a `chat_posts_visible` view that nulls the body while the
-- row keeps it. It loses to this one on the thing the feature is about: in
-- Phase 4, Realtime reads *tables*, not views, and applies the table's select
-- policy. Every member who could read the post can subscribe to chat_posts and
-- receive the row — so under the view shape a removed body is still on the wire
-- to anybody who asks for it that way, and the view is a curtain rather than a
-- door. Blanking the column means there is one path to a post's text and the
-- removed ones are not on it, which also makes the view unnecessary: the client
-- reads chat_posts directly.
--
-- What is kept, and why, is the record. A member who was harassed and an
-- administrator deciding whether to remove somebody both need the words that
-- were said; "it was removed" is not evidence of anything. The row is reachable
-- by a database session and by nothing else, which is the right amount of
-- friction for something read once a year.
--
-- ---------------------------------------------------------------------------
-- The row stays
-- ---------------------------------------------------------------------------
-- Soft delete, not a delete. Posts are numbered ("3/11") and replies quote each
-- other by position; a post that vanished would renumber the rest of the topic
-- for everybody reading it and turn every reference after it into a lie. The
-- reader is told which of the two happened — "Removed by its author" or
-- "Removed by an administrator" — because those are different facts and only
-- one of them is a moderation decision.
--
-- `removed_by_admin` is derived here rather than trusted from a parameter: it is
-- true when the person removing it is not the person who wrote it. An
-- administrator removing their own post is an author removing their own post.
--
-- ---------------------------------------------------------------------------
-- Idempotent
-- ---------------------------------------------------------------------------
-- Removing a post that is already removed returns quietly instead of raising,
-- and does not overwrite the stored body with the blank that replaced it. Two
-- taps on a slow connection is the ordinary case, not an error.
-- ============================================================================

create table if not exists public.chat_removed_bodies (
  post_id uuid primary key references public.chat_posts (id) on delete cascade,
  body text not null,
  removed_at timestamptz not null default now(),
  removed_by uuid references public.members (id) on delete set null
);

comment on table public.chat_removed_bodies is
  'What a removed post said. RLS on with no policy and no grant: reachable from a database session and nowhere else.';

alter table public.chat_removed_bodies enable row level security;

-- No policy, deliberately, and no grant to anon or authenticated. The only
-- writer is chat_remove_post() below, which is definer.
revoke all on public.chat_removed_bodies from anon, authenticated, public;

create or replace function public.chat_remove_post(post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_posts;
begin
  select * into target from public.chat_posts p where p.id = post;
  if not found then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  -- Definer, so nothing above has checked that the caller can even see this
  -- topic. Read gate first, then the right to remove.
  if not exists (
    select 1 from public.chat_topics t
    where t.id = target.topic_id and public.chat_room_is_readable(t.room_id)
  ) then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  if target.author_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only the person who wrote a post, or an administrator, can remove it.'
      using errcode = '42501';
  end if;

  if target.removed_at is not null then
    return;
  end if;

  insert into public.chat_removed_bodies (post_id, body, removed_by)
  values (target.id, target.body, auth.uid())
  on conflict (post_id) do nothing;

  update public.chat_posts
     set body = '',
         removed_at = now(),
         removed_by_admin = (target.author_id is distinct from auth.uid())
   where id = target.id;
end;
$$;

comment on function public.chat_remove_post(uuid) is
  'Remove a post: blank its body, keep its row and its number. The author or an administrator.';

revoke all on function public.chat_remove_post(uuid) from public, anon;
grant execute on function public.chat_remove_post(uuid) to authenticated;
