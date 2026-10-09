-- Owner, 2026-10-09: a reply can answer another reply in the same topic.
create or replace function public.chat_check_post_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.chat_posts;
begin
  if new.reply_to is null then
    return new;
  end if;

  select * into parent from public.chat_posts p where p.id = new.reply_to;
  if not found or parent.topic_id is distinct from new.topic_id then
    raise exception 'The post you are replying to is not in this topic.';
  end if;
  if parent.removed_at is not null then
    raise exception 'The post you are replying to has been removed.';
  end if;

  return new;
end;
$$;

comment on function public.chat_check_post_reply() is
  'Before a post lands: its reply_to names a standing post in the same topic, or nothing.';

revoke all on function public.chat_check_post_reply() from public, anon, authenticated;
