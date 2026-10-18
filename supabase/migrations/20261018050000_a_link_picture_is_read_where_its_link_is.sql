-- A link's picture is readable only by somebody who can read the message or
-- post it belongs to.
--
-- The security scan of 2026-10-17 (findings F11 and F16). 20261006010000 let
-- every active member read every object in the link-previews bucket, on the
-- reasoning that nobody could find a picture without the row that names it.
-- But link-preview names each picture after the sha256 of the image's own
-- address, and many of those addresses are predictable (a YouTube video's
-- thumbnail is i.ytimg.com/vi/<id>/hqdefault.jpg). So a member could compute
-- the name for any link they cared about and ask storage to sign it: a URL
-- back meant somebody in the club had linked it, in a direct or group
-- conversation they were not in as much as anywhere else. Listing the bucket
-- showed every picture from every conversation. That is the "has anybody in
-- the club linked this?" question the 20261006010000 header set out to rule
-- out.
--
-- Now a picture is readable as its words are, the way chat photographs are
-- (chat_file_is_readable): when a conversation the reader is in, or a room
-- they can read, has a message or post whose preview names it. The names stay
-- as they are: a picture two rows share is stored once, and a shared one is
-- readable through either row, which tells the reader nothing they could not
-- already read.

-- The rows that name a picture, found by name.
create index if not exists chat_messages_link_picture_idx
  on public.chat_messages ((link_preview ->> 'imagePath'))
  where link_preview ? 'imagePath';
create index if not exists chat_posts_link_picture_idx
  on public.chat_posts ((link_preview ->> 'imagePath'))
  where link_preview ? 'imagePath';

-- Definer, as chat_file_is_readable is: the row policies would otherwise run
-- for every row before the name could narrow them, and these helpers are the
-- same tests those policies make.
create or replace function public.link_picture_is_readable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member()
     and (
       exists (
         select 1 from public.chat_messages m
          where m.link_preview ? 'imagePath'
            and m.link_preview ->> 'imagePath' = object_name
            and public.is_thread_member(m.thread_id)
       )
       or exists (
         select 1
           from public.chat_posts p
           join public.chat_topics t on t.id = p.topic_id
          where p.link_preview ? 'imagePath'
            and p.link_preview ->> 'imagePath' = object_name
            and public.chat_room_is_readable(t.room_id)
       )
     );
$$;

comment on function public.link_picture_is_readable(text) is
  'True when the caller is an active member and a conversation they are in, or a room they can read, has a message or post whose link preview names this picture. The link-previews bucket''s read policy. See 20261018050000.';

revoke all on function public.link_picture_is_readable(text) from public, anon;
grant execute on function public.link_picture_is_readable(text) to authenticated;

drop policy if exists "an active member reads link pictures" on storage.objects;
create policy "a member reads a link picture they could read the words of"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'link-previews' and public.link_picture_is_readable(name));
