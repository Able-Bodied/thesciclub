-- ============================================================================
-- Chat, migration 15: handing one post, or one message, to the administrators
-- ============================================================================
-- Phase 3 established that an administrator cannot read a conversation they are
-- not in, and that is right. What it left behind is harassment in a direct
-- message — one of the four things CONTEXT.md says ends a membership — with no
-- evidence anybody can act on. The person being harassed is the only witness,
-- and until now they had no way to be one.
--
-- So: a member hands over **one post, or one message**. Nothing else about the
-- conversation is disclosed, and that sentence is the whole design. Every
-- decision below follows from it.
--
-- ---------------------------------------------------------------------------
-- The snapshot is the point
-- ---------------------------------------------------------------------------
-- The report copies the words, the author, the time and the place at the moment
-- it is made, rather than pointing at a row and reading it later. Two reasons,
-- and both of them are the difference between a record and a dangling link:
--
--  - the author can remove the message a second after sending it, which blanks
--    `chat_messages.body` in place (20260918100000). A report that read the
--    body live would then say nothing at all, and the fastest way to get away
--    with something would be to take it back;
--  - a member who is removed from the club takes their name off their words.
--    The report has to keep saying who wrote it, because that record is part of
--    why they are out.
--
-- Hence: **every foreign key here is ON DELETE SET NULL and none of them
-- cascades.** A report outlives the post, the message, the reporter and the
-- reported member. It is the only table in this feature that does.
--
-- Which forces the shape of the row's one check constraint. `kind` is the
-- discriminator, not "exactly one of post_id and message_id is set" — because
-- after a topic is deleted the post is gone, `post_id` goes null under the
-- SET NULL, and an "exactly one" check would refuse that update and block the
-- delete. So `kind` is not null and says which it was forever, and the check
-- only forbids the *other* id being set. A report whose ids are both null is a
-- report about something that no longer exists, which is a fact and not a
-- corruption.
--
-- ---------------------------------------------------------------------------
-- What the reporter can read back: almost nothing
-- ---------------------------------------------------------------------------
-- One policy — a member selects their own rows — and a **column-level** grant
-- of `(id, post_id, message_id)`. That is exactly enough for the client to draw
-- "Reported" on the control instead of "Report", and no more. The reporter
-- cannot read their own note back, or the snapshot, or whether anybody has
-- acted on it.
--
-- That is deliberate rather than mean. The snapshot is somebody else's words
-- held outside the conversation they were said in; the reporter already has
-- them on their own screen, and a second copy they can re-read through an API
-- is a second place for them to leak from. The note is written to
-- administrators and the resolution is written by them.
--
-- No insert, update or delete grant to anybody. Reports are written by the two
-- definer functions below and by nothing else. The revoke names `authenticated`
-- as well as `anon` and `public`, which is the Phase 1 lesson: Supabase's
-- default privileges grant every verb on a new table to `authenticated`, and a
-- revoke that does not name it leaves insert and delete in place — where RLS
-- turns them into a cheerful `UPDATE 0` rather than a refusal.
--
-- ---------------------------------------------------------------------------
-- Not on the wire
-- ---------------------------------------------------------------------------
-- `chat_reports` is not added to `supabase_realtime`. Realtime reads tables and
-- applies the table's select policy, so publishing it would put a member's
-- report — and the words it quotes — on a socket the moment it is filed. There
-- is nothing here anybody needs told about live.
--
-- ---------------------------------------------------------------------------
-- The parameter is `report_note`, not `note`
-- ---------------------------------------------------------------------------
-- The third time this trap has been paid for: `admin_set_room_open(is_open)`
-- and `chat_create_group(group_name)` are the other two. Inside plpgsql a
-- parameter with a column's name is ambiguous against that column, and the
-- insert below writes `chat_reports.note`. PostgREST sends arguments by name,
-- so the client names it `report_note` too.
-- ============================================================================

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),

  -- Which kind of thing was reported. Survives the thing itself — see the
  -- header on why this and not "exactly one id is set".
  kind text not null check (kind in ('post', 'message')),
  post_id uuid references public.chat_posts (id) on delete set null,
  message_id uuid references public.chat_messages (id) on delete set null,

  reporter_id uuid references public.members (id) on delete set null,
  reported_author_id uuid references public.members (id) on delete set null,

  -- What the reporter saw, copied at the moment they reported it.
  body_snapshot text not null check (char_length(body_snapshot) <= 4000),
  -- The reported row's own created_at, not this row's. An administrator needs
  -- to know when it was said, which is rarely when it was reported.
  written_at timestamptz not null,
  -- "Bowel management › Catheter kit that fits a rucksack", or the group's
  -- name, or "A direct conversation". Words, so that it still reads correctly
  -- after the room is renamed or the thread is gone.
  place text not null check (char_length(place) <= 300),

  -- Enough for /admin to open the topic a reported post is in. There is
  -- deliberately **no thread id** here and there never will be: an
  -- administrator who could follow a report into a private conversation is an
  -- administrator who can read private conversations.
  topic_id uuid,
  room_id text,

  note text check (char_length(note) <= 500),
  created_at timestamptz not null default clock_timestamp(),

  resolved_at timestamptz,
  resolved_by uuid references public.members (id) on delete set null,
  resolution text check (char_length(resolution) <= 500),

  -- A report about a post carries no message id, and the other way round.
  constraint chat_reports_kind_shape check (
    case kind when 'post' then message_id is null else post_id is null end
  ),
  -- Reporting the same thing twice is one row. Postgres admits any number of
  -- nulls in a unique constraint, so this means "at most one report per member
  -- per post" without also meaning "one message report per member ever".
  constraint chat_reports_one_per_post unique (reporter_id, post_id),
  constraint chat_reports_one_per_message unique (reporter_id, message_id)
);

comment on table public.chat_reports is
  'One post or one message, handed to the administrators with a snapshot of what it said. Nothing else about the conversation.';
comment on column public.chat_reports.body_snapshot is
  'What the reporter saw. Copied, not read live: the author can blank the original a second later.';
comment on column public.chat_reports.place is
  'Where it was said, in words. Never a thread id — see the migration header.';

-- Open reports first, newest first, which is the order /admin reads them in.
create index if not exists chat_reports_open_idx
  on public.chat_reports (created_at desc) where resolved_at is null;
-- "How many people reported this" is a count over one post or one message, and
-- the unique constraints above lead with reporter_id so they cannot serve it.
create index if not exists chat_reports_post_idx on public.chat_reports (post_id);
create index if not exists chat_reports_message_idx on public.chat_reports (message_id);

alter table public.chat_reports enable row level security;

drop policy if exists "a member sees their own reports" on public.chat_reports;
create policy "a member sees their own reports"
  on public.chat_reports for select
  using (reporter_id = auth.uid());

-- Everything, from everybody, first. See the header: `authenticated` is not
-- optional in this list.
revoke all on public.chat_reports from anon, authenticated, public;
-- Three columns, and no more. Enough to draw "Reported" and nothing else.
grant select (id, post_id, message_id) on public.chat_reports to authenticated;

-- --------------------------------------------------------------- a room post
create or replace function public.chat_report_post(post uuid, report_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_posts;
  topic public.chat_topics;
  room public.chat_rooms;
begin
  -- Definer, so RLS is off in here and nothing above has checked anything. The
  -- Phase 2 lesson: every gate this function relies on, it states itself.
  --
  -- is_member() and not is_active_member(): somebody who has been paused should
  -- still be able to say what was done to them. Being unable to write in a room
  -- is not the same as being unable to report what somebody wrote in one.
  if not public.is_member() then
    raise exception 'Only a member can report something.' using errcode = '42501';
  end if;

  select * into target from public.chat_posts p where p.id = post;
  if not found then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  select * into topic from public.chat_topics t where t.id = target.topic_id;
  select * into room from public.chat_rooms r where r.id = topic.room_id;

  -- The caller has to be able to read it. Without this, anybody holding a post
  -- id could push a closed room's contents onto the administrators' screen.
  if not public.chat_room_is_readable(topic.room_id) then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  if target.author_id = auth.uid() then
    raise exception 'You cannot report your own post. Remove it instead.'
      using errcode = '42501';
  end if;

  -- A blank body is nothing to report, and a report whose snapshot is '' tells
  -- an administrator nothing. Whoever removed it has already acted.
  if target.removed_at is not null then
    raise exception 'That post has already been removed.' using errcode = '42501';
  end if;

  insert into public.chat_reports
    (kind, post_id, reporter_id, reported_author_id,
     body_snapshot, written_at, place, topic_id, room_id, note)
  values
    ('post', target.id, auth.uid(), target.author_id,
     target.body, target.created_at,
     room.name || ' › ' || topic.title, topic.id, room.id,
     nullif(btrim(coalesce(report_note, '')), ''))
  -- Reporting twice is one row and no error. A member who taps it again
  -- because nothing visibly happened has not done anything wrong.
  on conflict (reporter_id, post_id) do nothing;
end;
$$;

comment on function public.chat_report_post(uuid, text) is
  'Hand one room post to the administrators, with a snapshot of what it said.';

revoke all on function public.chat_report_post(uuid, text) from public, anon;
grant execute on function public.chat_report_post(uuid, text) to authenticated;

-- ------------------------------------------------------------------ a message
create or replace function public.chat_report_message(message uuid, report_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_messages;
  thread public.chat_threads;
begin
  if not public.is_member() then
    raise exception 'Only a member can report something.' using errcode = '42501';
  end if;

  select * into target from public.chat_messages m where m.id = message;
  if not found then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;

  -- **The check this whole migration rests on.** Definer, so RLS is off and the
  -- select policy on chat_messages is not protecting anything in here. Without
  -- this line anybody holding a message id — and ids are uuids that leak from
  -- realtime payloads, error messages and screenshots — could push a private
  -- message onto the administrators' screen. That is a disclosure the two
  -- people in the conversation never chose, made by somebody who was not in it.
  --
  -- Not is_admin() as an alternative, unlike chat_remove_message. An
  -- administrator removing a message they were handed is acting on a report; an
  -- administrator *filing* one about a conversation they are not in is reading
  -- it.
  if not public.is_thread_member(target.thread_id) then
    raise exception 'There is no such message.' using errcode = 'P0002';
  end if;

  select * into thread from public.chat_threads t where t.id = target.thread_id;

  if target.author_id = auth.uid() then
    raise exception 'You cannot report your own message. Remove it instead.'
      using errcode = '42501';
  end if;

  if target.removed_at is not null then
    raise exception 'That message has already been removed.' using errcode = '42501';
  end if;

  insert into public.chat_reports
    (kind, message_id, reporter_id, reported_author_id,
     body_snapshot, written_at, place, note)
  values
    ('message', target.id, auth.uid(), target.author_id,
     target.body, target.created_at,
     -- A group is named; a pair is not. "A direct conversation" is all an
     -- administrator is told about where it was said, and all they need: the
     -- words, who wrote them and when are the report.
     case when thread.kind = 'group' then thread.name else 'A direct conversation' end,
     nullif(btrim(coalesce(report_note, '')), ''))
  on conflict (reporter_id, message_id) do nothing;
end;
$$;

comment on function public.chat_report_message(uuid, text) is
  'Hand one message to the administrators, with a snapshot of what it said. Nothing else in the conversation goes with it.';

revoke all on function public.chat_report_message(uuid, text) from public, anon;
grant execute on function public.chat_report_message(uuid, text) to authenticated;
