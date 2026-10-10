-- One emoji per member per post/message. Clearing keeps a null row so
-- Realtime delivers an UPDATE under RLS, rather than an unfiltered DELETE.
create table public.chat_post_reactions (
  target_id uuid not null references public.chat_posts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  emoji text check (emoji in ('👍','❤️','😂','😮','😢','🙏','🎉','💪')),
  primary key (target_id, member_id)
);
create table public.chat_message_reactions (
  target_id uuid not null references public.chat_messages(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  emoji text check (emoji in ('👍','❤️','😂','😮','😢','🙏','🎉','💪')),
  primary key (target_id, member_id)
);
create index chat_post_reactions_member_idx on public.chat_post_reactions(member_id);
create index chat_message_reactions_member_idx on public.chat_message_reactions(member_id);
alter table public.chat_post_reactions enable row level security;
alter table public.chat_message_reactions enable row level security;
create policy "read reactions on readable standing posts"
  on public.chat_post_reactions for select to authenticated using (
    exists (select 1 from public.chat_posts p join public.chat_topics t on t.id=p.topic_id
      where p.id=target_id and p.removed_at is null and public.chat_room_is_readable(t.room_id))
  );
create policy "read reactions in your conversation"
  on public.chat_message_reactions for select to authenticated using (
    exists (select 1 from public.chat_messages m where m.id=target_id
      and m.removed_at is null and m.notice is null and public.is_thread_member(m.thread_id))
  );
revoke all on public.chat_post_reactions, public.chat_message_reactions from public, anon, authenticated;
grant select on public.chat_post_reactions, public.chat_message_reactions to authenticated;

-- Only this function writes: callers cannot impersonate another member or
-- bypass the standing-message, active-member and visibility checks.
create function public.chat_set_reaction(kind text, target uuid, reaction text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() or (reaction is not null and not public.is_active_member()) then
    raise exception 'You cannot react.' using errcode='42501';
  end if;
  if reaction is not null and reaction not in ('👍','❤️','😂','😮','😢','🙏','🎉','💪') then
    raise exception 'Choose a supported reaction.' using errcode='22023';
  end if;
  if kind='post' then
    perform 1 from public.chat_posts p join public.chat_topics t on t.id=p.topic_id
      where p.id=target and p.removed_at is null and public.chat_room_is_readable(t.room_id)
      for share of p, t;
    if not found then raise exception 'You cannot react to this post.' using errcode='42501'; end if;
    insert into public.chat_post_reactions(target_id,member_id,emoji)
      values(target,auth.uid(),reaction)
      on conflict(target_id,member_id) do update set emoji=excluded.emoji;
  elsif kind='message' then
    perform 1 from public.chat_messages m where m.id=target and m.removed_at is null
      and m.notice is null and public.is_thread_member(m.thread_id) for share;
    if not found then raise exception 'You cannot react to this message.' using errcode='42501'; end if;
    insert into public.chat_message_reactions(target_id,member_id,emoji)
      values(target,auth.uid(),reaction)
      on conflict(target_id,member_id) do update set emoji=excluded.emoji;
  else
    raise exception 'Unknown reaction target.' using errcode='22023';
  end if;
end;
$$;
revoke all on function public.chat_set_reaction(text,uuid,text) from public, anon;
grant execute on function public.chat_set_reaction(text,uuid,text) to authenticated;
alter publication supabase_realtime add table public.chat_post_reactions, public.chat_message_reactions;
