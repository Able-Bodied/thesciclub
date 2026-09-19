import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useChatAuthors } from '@/lib/chat/authors';
import { useChatRooms, useRoomMembership, useRoomStats } from '@/lib/chat/rooms';
import { sortTopics, useRoomTopics } from '@/lib/chat/topics';
import { ROOM_SORTS, type RoomCategory, type RoomSort } from '@/lib/chat/types';
import { TopicRow } from '@/routes/chat/topic-row';

/**
 * One discussion room: its topics, and the way in.
 *
 * ---------------------------------------------------------------------------
 * Reading does not wait for anything
 * ---------------------------------------------------------------------------
 * The room, its topics and every post in them are readable by any member,
 * joined or not — that is the promise /chat prints, and the select policies
 * keep it. Joining is about writing. So this screen never gates its content on
 * membership; what membership changes is the bar at the bottom.
 *
 * ---------------------------------------------------------------------------
 * A closed room, for the one person who can see it
 * ---------------------------------------------------------------------------
 * The select policy hides a closed room from every member, so arriving here
 * with `openedAt` null means the reader is an administrator. They are told, in
 * the place they would otherwise assume a working room: seeding a closed room
 * is the reason they can see one at all, and an administrator who forgets it is
 * shut will wonder why nobody is answering.
 *
 * ---------------------------------------------------------------------------
 * Sorting
 * ---------------------------------------------------------------------------
 * The mock's sort bar, as the same pills every other screen uses rather than
 * its own `.sortb` control — a third kind of pill on the fourth screen is how a
 * product stops looking like one product.
 */

const SORT_LABELS: Record<RoomSort, string> = {
  activity: 'Activity',
  replies: 'Replies',
  views: 'Views',
};

const CATEGORY_ICON: Record<RoomCategory, string> = {
  Body: 'text-room-body',
  Life: 'text-room-life',
  Kit: 'text-room-kit',
};

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const account = useAccount();
  const { rooms, loading: roomsLoading } = useChatRooms();
  const { topics, loading: topicsLoading, error } = useRoomTopics(roomId);
  const membership = useRoomMembership();
  const { stats } = useRoomStats();
  const [sort, setSort] = useState<RoomSort>('activity');

  const room = rooms.find((r) => r.id === roomId) ?? null;
  const sorted = useMemo(() => sortTopics(topics, sort), [topics, sort]);
  // Every face on every row, asked for once.
  const authors = useChatAuthors(topics.flatMap((topic) => topic.participantIds));

  if (roomsLoading) {
    return <p className="px-6 py-10 text-center text-[0.875rem] text-grey">Loading…</p>;
  }

  if (!room) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to="/chat" label="Chat" />
          <p className="mt-6 text-[0.875rem] text-ink2 leading-relaxed">
            There is no such room, or it is not open yet.
          </p>
          <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">
            Rooms open one at a time, as there are members to fill them.
          </p>
        </div>
      </div>
    );
  }

  const closed = room.openedAt === null;
  const joined = membership.joined.has(room.id);
  const count = stats.get(room.id);
  // An administrator may post in a closed room without joining it — seeding one
  // is why they can see it. Everybody else needs the room open and a membership.
  const canPost = account.isAdmin || (joined && !closed);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-3">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to="/chat" label="Chat" />
          <div className="mt-1 flex items-start gap-[11px]">
            <span
              aria-hidden="true"
              className={`grid h-[2.4em] w-[2.4em] flex-none place-items-center rounded-[12px] bg-tint text-[1.125rem] leading-none ${CATEGORY_ICON[room.category]}`}
            >
              {room.icon}
            </span>
            <span className="min-w-0 flex-1">
              <h1 className="font-extrabold font-head text-[1.125rem] text-ink leading-[1.25]">
                {room.name}
              </h1>
              <p className="mt-[3px] text-[0.78125rem] text-ink2 leading-[1.45]">
                {room.description}
              </p>
              {/* Left off entirely until there is something to count, for the
                  reason room-card.tsx gives: three zeros read as a room that
                  failed rather than as one that has not started. And "open to
                  all" is not a promise to make about a closed room, which is
                  open to nobody — the banner below says so instead. */}
              {count && count.topicCount > 0 ? (
                <p className="mt-[5px] font-semibold text-[0.78125rem] text-navy">
                  {count.topicCount} {count.topicCount === 1 ? 'topic' : 'topics'} ·{' '}
                  {count.memberCount} {count.memberCount === 1 ? 'member' : 'members'}
                  {closed ? '' : ' · open to all, full history'}
                </p>
              ) : null}
            </span>
          </div>

          {closed ? (
            <p className="mt-2.5 rounded-[11px] bg-tint px-3 py-2 text-[0.78125rem] text-ink2 leading-[1.45]">
              This room is closed. No member can see it yet — you can, because you are an
              administrator, so that there is something here before it opens.
            </p>
          ) : null}

          <div className="mt-1 flex items-center gap-2 border-line border-t pt-1">
            <span className="flex-none font-bold text-[0.78125rem] text-ink2">Topic</span>
            <SegmentPills
              segments={ROOM_SORTS.map((key) => [key, SORT_LABELS[key]] as const)}
              value={sort}
              onChange={setSort}
              className="flex-1"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-2.5 pb-[18px] md:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          {topicsLoading ? (
            <p className="py-10 text-center text-[0.875rem] text-grey">Loading the topics…</p>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-[0.875rem] text-ink2 leading-relaxed">
                Could not load the topics.
              </p>
              <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">{error}</p>
            </div>
          ) : sorted.length === 0 ? (
            // Invites the first one; does not pretend there is activity.
            <p className="py-10 text-center text-[0.875rem] text-grey leading-relaxed">
              Nothing has been asked here yet.
              <br />
              {canPost
                ? 'Start the first topic.'
                : closed
                  ? 'An administrator can start one before the room opens.'
                  : 'Join the room to start the first one.'}
            </p>
          ) : (
            sorted.map((topic) => <TopicRow key={topic.id} topic={topic} authors={authors} />)
          )}

          {canPost ? (
            <Link
              to={`/chat/rooms/${room.id}/new`}
              className="mt-1 block w-full rounded-[12px] border-[1.6px] border-navy px-4 py-3 text-center font-bold font-head text-[0.9375rem] text-navy"
            >
              + New topic
            </Link>
          ) : null}
        </div>
      </div>

      {/* The join bar sits where the composer sits in a topic, because it is
          the same decision in the same place: this is how you get to write. */}
      {!canPost && !closed ? (
        <div className="flex-none border-line border-t bg-paper px-3.5 py-2.5">
          <div className="mx-auto w-full max-w-[720px]">
            <button
              type="button"
              onClick={() => {
                membership.toggle(room.id);
              }}
              className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem] transition-colors hover:bg-gold-hi"
            >
              Join {room.name}
            </button>
            {membership.error ? (
              <p className="mt-2 text-center text-[0.75rem] text-destructive leading-[1.45]">
                {membership.error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {joined && !closed ? (
        <div className="flex-none border-line border-t bg-paper px-3.5 py-2">
          <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-2">
            <span className="text-[0.78125rem] text-grey">You are in this room.</span>
            <button
              type="button"
              onClick={() => {
                membership.toggle(room.id);
              }}
              data-target="small"
              className="flex-none rounded-full bg-tint px-3 py-1.5 font-semibold text-[0.75rem] text-navy"
            >
              Leave
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
