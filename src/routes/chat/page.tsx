import { useMemo, useState } from 'react';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useChatAuthors } from '@/lib/chat/authors';
import { roomsByCategory, useChatRooms, useRoomMembership, useRoomStats } from '@/lib/chat/rooms';
import { useMyThreads } from '@/lib/chat/threads';
import type { ChatAuthor, ChatSegment, ChatThread } from '@/lib/chat/types';
import { RoomCard, RoomCategoryLabel } from '@/routes/chat/room-card';
import { ThreadRow } from '@/routes/chat/thread-row';

/**
 * Chat — direct messages, event groups, and topic rooms.
 *
 * **Being built, from 2026-09-18.** The discussion rooms are real, and so are
 * direct conversations: a card opens a room, a row opens a conversation.
 * Groups are not built, and this screen says so in the segment where they would
 * be rather than showing an empty list that could be read as "you are in no
 * groups" — the two are different facts and only one of them is true.
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
  const [segment, setSegment] = useState<ChatSegment>('all');
  const account = useAccount();
  const { rooms, loading, error } = useChatRooms();
  const { stats } = useRoomStats();
  const membership = useRoomMembership();
  const { threads, loading: threadsLoading, error: threadsError } = useMyThreads();

  const grouped = useMemo(() => roomsByCategory(rooms), [rooms]);

  // Direct conversations and groups share a table and a row, and the segments
  // are the two halves of it. `all` is both.
  const conversations = threads.filter(
    (thread) => segment === 'all' || thread.kind === (segment === 'direct' ? 'direct' : 'group'),
  );

  const authors = useChatAuthors(
    threads.flatMap((thread) => [thread.otherMemberId, thread.lastAuthorId]),
  );

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
                  They open one at a time, as there are members to fill them.
                </p>
              ) : (
                grouped.map(([category, inCategory]) => (
                  <section key={category}>
                    <RoomCategoryLabel category={category} />
                    {inCategory.map((room) => (
                      <RoomCard
                        key={room.id}
                        room={room}
                        stats={stats.get(room.id)}
                        joined={membership.joined.has(room.id)}
                      />
                    ))}
                  </section>
                ))
              )}
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
 * Three different blanks, and they are three different facts:
 *
 *  - Groups are **not built**. The word is "not built" and never "none yet",
 *    because a member with no groups and a member whose groups cannot be shown
 *    would otherwise see the same blank space and only one of them can do
 *    anything about it.
 *  - Direct has nothing in it: there is somewhere to go from here, and the
 *    empty state says where, because "no conversations" with no way out of it
 *    is a dead end on the one screen that is about reaching people.
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
      ) : segment === 'groups' ? null : (
        <p className="py-8 text-center text-[0.875rem] text-grey leading-relaxed">
          No conversations yet.
          <br />
          Message a member from their profile.
        </p>
      )}

      {segment === 'groups' || segment === 'all' ? <GroupsNotBuilt /> : null}
    </>
  );
}

/** Groups are the one part of Chat that is still a promise. Say it plainly. */
function GroupsNotBuilt() {
  return (
    <div className="mt-3 rounded-[14px] border border-line bg-paper px-3.5 py-3">
      <p className="text-[0.875rem] text-ink2 leading-relaxed">Groups are not built yet.</p>
      <p className="mt-1 text-[0.78125rem] text-grey leading-relaxed">
        They are next — a group for everybody going to an event, and groups members make themselves.
      </p>
    </div>
  );
}
