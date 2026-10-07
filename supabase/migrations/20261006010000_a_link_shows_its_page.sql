-- ============================================================================
-- A link shows its page: a picture and a title, and a YouTube video plays
-- ============================================================================
-- The owner, 2026-10-06: links in Chat should fill in their page's picture
-- and title, and a YouTube video should play where it was posted. In direct
-- and group conversations and in rooms; Home draws a room post's the same way.
--
-- ---------------------------------------------------------------------------
-- The club fetches the page, once; readers' phones never do
-- ---------------------------------------------------------------------------
-- The owner's choice over letting every phone load the picture from the
-- other site. A member scrolling past a link in a private conversation should
-- not tell YouTube or Amazon that they did. So the `link-preview` Edge
-- Function reads the page when the message is written, keeps a copy of its
-- picture in the club's own bucket, and writes the preview onto the row. A
-- YouTube video reaches YouTube only when somebody presses play.
--
-- ---------------------------------------------------------------------------
-- On the row, not in a table of addresses
-- ---------------------------------------------------------------------------
-- A shared cache keyed by address would answer "has anybody in the club
-- linked this?" for any address a member cared to ask about, including links
-- sent in conversations they are not in. On the row, a preview is exactly as
-- readable as the words it belongs to, under the policies those words
-- already have.
--
-- Members cannot write it: messages and posts are inserted through granted
-- columns and changed only through functions, and `link_preview` is in no
-- grant. Only `link_preview_save`, with the vault's secret, writes it, so a
-- member cannot put a made-up title or picture under a real address.
--
-- ---------------------------------------------------------------------------
-- When the words change, the preview goes
-- ---------------------------------------------------------------------------
-- An edit, or a message taken back (its words are blanked): a trigger clears
-- the preview before the row is written, and if the new words have a link the
-- function is asked again. `link_preview_save` writes only if the words are
-- still the ones it read, so a slow fetch cannot put an old link's card under
-- an edited message.
--
-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
-- As with notifications: the vault's `link_preview_url` says where the
-- function is, and while it is absent nothing is sent. This migration is safe
-- on a project with no function deployed. `link_preview_secret` is made here.
-- ============================================================================

alter table public.chat_messages add column if not exists link_preview jsonb;
alter table public.chat_posts add column if not exists link_preview jsonb;

comment on column public.chat_messages.link_preview is
  'The first link''s page: {url, title, description, siteName, imagePath, youtubeId}. Written only by link_preview_save.';
comment on column public.chat_posts.link_preview is
  'The first link''s page: {url, title, description, siteName, imagePath, youtubeId}. Written only by link_preview_save.';

-- Readable wherever the row is: the policies on the rows decide.
grant select (link_preview) on public.chat_messages to authenticated;
grant select (link_preview) on public.chat_posts to authenticated;

-- ------------------------------------------------------------------- bucket
-- Private, as every other bucket is. The pictures are of public pages, so
-- any active member may read any of them; what they cannot do is find one
-- without the row that names it. Written by the function's service role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'link-previews', 'link-previews', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "an active member reads link pictures" on storage.objects;
create policy "an active member reads link pictures"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'link-previews' and public.is_active_member());

-- ------------------------------------------------------------------- secret
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'link_preview_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'link_preview_secret',
      'Sent by link_preview_enqueue and checked by link_preview_source and link_preview_save.'
    );
  end if;
end;
$$;

create or replace function public.link_preview_secret_is(p_secret text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select p_secret is not null and p_secret = (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'link_preview_secret'
  );
$$;

revoke all on function public.link_preview_secret_is(text) from public, anon, authenticated;

-- ---------------------------------------------------------- what to fetch
-- The words of a standing message or post. Service role only, and the secret
-- besides, so the function's public URL cannot be used to read anything.
create or replace function public.link_preview_source(p_secret text, p_table text, p_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  words text;
begin
  if not public.link_preview_secret_is(p_secret) then
    raise exception 'Not the link preview trigger.' using errcode = '42501';
  end if;
  if p_table = 'chat_messages' then
    select m.body into words from public.chat_messages m where m.id = p_id and m.removed_at is null;
  elsif p_table = 'chat_posts' then
    select p.body into words from public.chat_posts p where p.id = p_id and p.removed_at is null;
  else
    raise exception 'Unknown table: %', p_table using errcode = '22023';
  end if;
  return words;
end;
$$;

revoke all on function public.link_preview_source(text, text, uuid) from public, anon, authenticated;
grant execute on function public.link_preview_source(text, text, uuid) to service_role;

-- ------------------------------------------------------------ writing it
-- Checked here and not trusted from the function: the shape, the lengths, a
-- picture path that can only be a file the function named, and a video id
-- that can only be an id. `p_body` is the words the function read: if they
-- have changed since, the preview is for words nobody can see any more.
create or replace function public.link_preview_save(
  p_secret text,
  p_table text,
  p_id uuid,
  p_body text,
  p_preview jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean jsonb;
  saved boolean := false;
begin
  if not public.link_preview_secret_is(p_secret) then
    raise exception 'Not the link preview trigger.' using errcode = '42501';
  end if;
  -- coalesce(…, true): the picture and the video id may be absent, and a
  -- regex against null is null rather than false.
  if not (
    jsonb_typeof(p_preview) = 'object'
    and coalesce(p_preview ->> 'url' ~* '^https?://\S+$', false)
    and length(p_preview ->> 'url') <= 2000
    and length(coalesce(p_preview ->> 'title', '')) <= 200
    and length(coalesce(p_preview ->> 'description', '')) <= 300
    and length(coalesce(p_preview ->> 'siteName', '')) <= 120
    and coalesce((p_preview ->> 'imagePath') ~ '^[0-9a-f]{64}\.(jpg|png|webp|gif)$', true)
    and coalesce((p_preview ->> 'youtubeId') ~ '^[A-Za-z0-9_-]{11}$', true)
  ) then
    raise exception 'Not a preview.' using errcode = '22023';
  end if;

  -- Only the known keys, so nothing else rides along to the reader.
  clean := jsonb_build_object(
    'url', p_preview ->> 'url',
    'title', p_preview ->> 'title',
    'description', p_preview ->> 'description',
    'siteName', p_preview ->> 'siteName',
    'imagePath', p_preview ->> 'imagePath',
    'youtubeId', p_preview ->> 'youtubeId'
  );

  if p_table = 'chat_messages' then
    update public.chat_messages m set link_preview = clean
     where m.id = p_id and m.removed_at is null and m.body = p_body;
    saved := found;
  elsif p_table = 'chat_posts' then
    update public.chat_posts p set link_preview = clean
     where p.id = p_id and p.removed_at is null and p.body = p_body;
    saved := found;
  else
    raise exception 'Unknown table: %', p_table using errcode = '22023';
  end if;
  return saved;
end;
$$;

revoke all on function public.link_preview_save(text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.link_preview_save(text, text, uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------- triggers
-- Before an update: new words, no preview. Before the row is written, so a
-- message taken back never stands for a moment with its old card under it.
create or replace function public.link_preview_clear()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.link_preview := null;
  end if;
  return new;
end;
$$;

revoke all on function public.link_preview_clear() from public, anon, authenticated;

-- After: if the words have a link, ask the function. Swallows every error,
-- as push_notify_enqueue does: a message must never fail for its preview.
create or replace function public.link_preview_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
  secret text;
begin
  if new.removed_at is not null or new.body !~* '(https?://|www\.)' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then
    return null;
  end if;
  select s.decrypted_secret into target
    from vault.decrypted_secrets s where s.name = 'link_preview_url';
  if target is null or target = '' then
    return null;  -- switched off; see the header
  end if;
  select s.decrypted_secret into secret
    from vault.decrypted_secrets s where s.name = 'link_preview_secret';

  perform net.http_post(
    url := target,
    body := jsonb_build_object('table', tg_table_name, 'id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-preview-secret', secret
    ),
    timeout_milliseconds := 20000
  );
  return null;
exception when others then
  raise warning 'link_preview_enqueue: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.link_preview_enqueue() from public, anon, authenticated;

drop trigger if exists chat_messages_link_preview_clear on public.chat_messages;
create trigger chat_messages_link_preview_clear
  before update of body on public.chat_messages
  for each row execute function public.link_preview_clear();

drop trigger if exists chat_posts_link_preview_clear on public.chat_posts;
create trigger chat_posts_link_preview_clear
  before update of body on public.chat_posts
  for each row execute function public.link_preview_clear();

drop trigger if exists chat_messages_link_preview on public.chat_messages;
create trigger chat_messages_link_preview
  after insert or update of body on public.chat_messages
  for each row execute function public.link_preview_enqueue();

drop trigger if exists chat_posts_link_preview on public.chat_posts;
create trigger chat_posts_link_preview
  after insert or update of body on public.chat_posts
  for each row execute function public.link_preview_enqueue();
