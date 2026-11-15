-- Any one emoji, not only the eight (the owner, 2026-11-14: a + opens every emoji,
-- as WhatsApp's does). Emoji code points only, up to 12 (a family or a flag),
-- and never a bare digit, # or * (a keycap needs its U+20E3).
create function public.is_reaction_emoji(value text)
returns boolean language sql immutable set search_path = '' as $$
  select value ~ '^[0-9#*©®‍⃣️ -㏿\U0001F000-\U0001FAFF\U000E0020-\U000E007F]{1,12}$'
    and value ~ '[^0-9#*]'
    and (value !~ '[0-9#*]' or value ~ '⃣')
$$;

alter table public.chat_post_reactions
  drop constraint chat_post_reactions_emoji_check,
  add constraint chat_post_reactions_emoji_check check (public.is_reaction_emoji(emoji));
alter table public.chat_message_reactions
  drop constraint chat_message_reactions_emoji_check,
  add constraint chat_message_reactions_emoji_check check (public.is_reaction_emoji(emoji));

create or replace function public.chat_set_reaction(kind text, target uuid, reaction text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() or (reaction is not null and not public.is_active_member()) then
    raise exception 'You cannot react.' using errcode='42501';
  end if;
  if reaction is not null and not public.is_reaction_emoji(reaction) then
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
