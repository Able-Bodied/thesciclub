import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useChatAuthors } from '@/lib/chat/authors';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { roomsByCategory, useChatRooms, useRoomMembership, useRoomStats } from '@/lib/chat/rooms';
import { useMyThreads } from '@/lib/chat/threads';
import {
  CHAT_SEGMENTS,
  type ChatAuthor,
  type ChatSegment,
  type ChatThread,
} from '@/lib/chat/types';
import { RoomCard, RoomCategoryLabel } from '@/routes/chat/room-card';
import { ThreadRow } from '@/routes/chat/thread-row';

/**
 * Chat — direct messages, event groups, and topic rooms.
 *
 * **Being built, from 2026-09-18.** The discussion rooms are real, and so are
 * the conversations: a card opens a room, a row opens a conversation or a
 * group. What is not in this build — search, editing, blocking, attachments —
 * is absent rather than drawn and inert.
 *
 * ---------------------------------------------------------------------------
 * Why the rooms list is usually empty, and why that is right
 * ---------------------------------------------------------------------------
 * All twelve rooms are seeded closed and an administrator opens them one at a
 * time. CONTEXT.md records why: the club has five members who are not seeded
 * directory rows, and a room of two dozen members is empty by construction.
 * Twelve rooms opened at once is twelve rooms with four posts in them.
 *
 * So the ordinary first sight of this screen is the empty state, and the empty
 * state explains the policy rather than apologising for a lack of content.
 *
 * ---------------------------------------------------------------------------
 * No search box
 * ---------------------------------------------------------------------------
 * The mock's chat header has one. Search across messages and posts is not in
 * this build, and a field that takes words and does nothing with them is worse
 * than no field: it is the one control on the screen somebody will try first.
 */

const SEGMENTS: [ChatSegment, string][] = [
  ['all', 'All'],
  ['direct', 'Direct'],
  ['groups', 'Groups'],
  ['rooms', 'Rooms'],
];

export default function ChatPage() {
  // The segment lives in the URL rather than in component state, for the
  // reason /events found first: opening a room and pressing back landed on
  // All, because the state died with the unmounted page, and a back arrow that
  // does not go back is worse than no back arrow. It is also what lets Me's
  // ROOMS counter point at the rooms rather than at the top of the screen.
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get('segment');
  const segment: ChatSegment = CHAT_SEGMENTS.includes(fromUrl as ChatSegment)
    ? (fromUrl as ChatSegment)
    : 'all';
  const setSegment = useCallback(
    (next: ChatSegment) => {
      // Replace rather than push: four pills are a filter, and tapping through
      // them should not mean four presses of back to leave the screen.
      setSearchParams(next === 'all' ? {} : { segment: next }, { replace: true });
    },
    [setSearchParams],
  );
  const account = useAccount();
  const { rooms, loading, error } = useChatRooms();
  const { stats, reload: reloadStats } = useRoomStats();
  const membership = useRoomMembership();
  const {
    threads,
    loading: threadsLoading,
    error: threadsError,
    reload: reloadThreads,
  } = useMyThreads();

  // Two unfiltered subscriptions, both scoped by RLS to what this member can
  // already see: every message in a conversation they are in, and every topic
  // in a room they can read. Unfiltered is the point — the list is about all of
  // them at once, and a subscription per row would be a socket per
  // conversation.
  useRealtimeRows({ table: 'chat_messages', onChange: reloadThreads });
  useRealtimeRows({ table: 'chat_topics', onChange: reloadStats });

  const grouped = useMemo(() => roomsByCategory(rooms), [rooms]);

  // Direct conversations and groups share a table and a row, and the segments
  // are the two halves of it. `all` is both.
  const conversations = threads.filter(
    (thread) => segment === 'all' || thread.kind === (segment === 'direct' ? 'direct' : 'group'),
  );

  const authors = useChatAuthors(
    threads.flatMap((thread) => [thread.otherMemberId, thread.lastAuthorId]),
  );
  // Who started the member rooms. The seeded twelve have no starter, so on the
  // ordinary day this asks for nothing.
  const roomStarters = useChatAuthors(rooms.map((room) => room.createdBy));

  const showRooms = segment === 'all' || segment === 'rooms';
  const showConversations = segment !== 'rooms';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px]">
        <div className="mx-auto w-full max-w-[720px]">
          <h1 className="font-extrabold font-head text-[1.5625rem] text-ink tracking-[-0.02em]">
            Chat
          </h1>
        </div>
        <SegmentPills
          segments={SEGMENTS}
          value={segment}
          onChange={setSegment}
          className="max-w-[720px]"
        />
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-[18px] md:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          {showConversations ? (
            <Conversations
              segment={segment}
              threads={conversations}
              loading={threadsLoading}
              error={threadsError}
              authors={authors}
              viewerId={account.userId}
            />
          ) : null}

          {showRooms ? (
            <>
              <h2 className="mt-4 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
                Discussion rooms
              </h2>
              {/* The mock's words, kept. They say the two things a member
                  needs to know before reading one: that the whole history is
                  there from before they joined, and that none of it is
                  public. */}
              <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
                Open to every member, with the whole history from before you joined. Nothing here is
                public.
              </p>

              {loading ? (
                <p className="py-10 text-center text-[0.875rem] text-grey">Loading the rooms…</p>
              ) : error ? (
                <div className="py-10 text-center">
                  <p className="text-[0.875rem] text-ink2 leading-relaxed">
                    Could not load the rooms.
                  </p>
                  <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">{error}</p>
                </div>
              ) : grouped.length === 0 ? (
                <p className="py-10 text-center text-[0.875rem] text-grey leading-relaxed">
                  No rooms are open yet.
                  <br />
                  The seeded ones open a few at a time, and anybody can start one.
                </p>
              ) : (
                grouped.map(([category, inCategory]) => (
                  <section key={category}>
                    <RoomCategoryLabel category={category} />
                    {inCategory.map((room) => (
                      <RoomCard
                        key={room.id}
                        room={room}
                        starter={room.createdBy ? (roomStarters.get(room.createdBy) ?? null) : null}
                        stats={stats.get(room.id)}
                        joined={membership.joined.has(room.id)}
                      />
                    ))}
                  </section>
                ))
              )}

              {loading || error ? null : <NewRoomLink />}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The conversations, and what is honestly said where there are none.
 *
 * An empty list is never left as blank space. Every one of these says where to
 * go next, because "no conversations" with no way out of it is a dead end on
 * the one screen that is about reaching people — and the way out is different
 * in each segment:
 *
 *  - Direct: a conversation starts from somebody's profile, so that is what it
 *    says. There is no member picker here, deliberately; a direct message is a
 *    thing you send to a person you were just reading about.
 *  - Groups: a group starts here, so the control is here.
 *  - All: both, with the group control below the list.
 *  - A failure says so and shows the database's sentence.
 */
function Conversations({
  segment,
  threads,
  loading,
  error,
  authors,
  viewerId,
}: {
  segment: ChatSegment;
  threads: ChatThread[];
  loading: boolean;
  error: string | null;
  authors: Map<string, ChatAuthor>;
  viewerId: string | null;
}) {
  if (loading) {
    return (
      <p className="py-8 text-center text-[0.875rem] text-grey">Loading your conversations…</p>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-[0.875rem] text-ink2 leading-relaxed">
          Could not load your conversations.
        </p>
        <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">{error}</p>
      </div>
    );
  }

  return (
    <>
      {threads.length > 0 ? (
        <div className="rounded-[14px] border border-line bg-paper px-3.5">
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              other={thread.otherMemberId ? (authors.get(thread.otherMemberId) ?? null) : null}
              lastAuthor={thread.lastAuthorId ? (authors.get(thread.lastAuthorId) ?? null) : null}
              viewerId={viewerId}
            />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-[0.875rem] text-grey leading-relaxed">
          {segment === 'groups' ? (
            <>
              No groups yet.
              <br />
              Start one below, or open the group chat for an event you are going to.
            </>
          ) : (
            <>
              No conversations yet.
              <br />
              Message a member from their profile.
            </>
          )}
        </p>
      )}

      {segment === 'groups' || segment === 'all' ? <NewGroupLink /> : null}
    </>
  );
}

/**
 * The way into a room somebody starts themselves.
 *
 * Present for every member and not only when the list is empty. The twelve
 * seeded rooms are starters, not the limit — the owner's decision on
 * 2026-09-20 — and a control that only appears when there is nothing else on
 * the screen reads as an apology for the emptiness rather than as an offer.
 *
 * The same dashed link as Start a group, for the same reasons.
 */
function NewRoomLink() {
  return (
    <Link
      to="/chat/rooms/new"
      className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-navy border-dashed font-bold font-head text-[0.9375rem] text-navy transition-colors hover:bg-tint"
    >
      Start a room
    </Link>
  );
}

/**
 * The way into a group, and the one control on this screen that makes
 * something.
 *
 * A link and not a button: it goes to a page, it is worth opening in a new tab,
 * and a member who long-presses it gets the browser's own menu rather than
 * nothing. Full width and 48px tall, because it is the primary action of a
 * segment that is otherwise a list.
 */
function NewGroupLink() {
  return (
    <Link
      to="/chat/new-group"
      className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-navy border-dashed font-bold font-head text-[0.9375rem] text-navy transition-colors hover:bg-tint"
    >
      Start a group
    </Link>
  );
}
