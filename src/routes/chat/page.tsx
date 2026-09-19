import { useMemo, useState } from 'react';
import { SegmentPills } from '@/components/segment-pills';
import { roomsByCategory, useChatRooms } from '@/lib/chat/rooms';
import type { ChatSegment } from '@/lib/chat/types';
import { RoomCard, RoomCategoryLabel } from '@/routes/chat/room-card';

/**
 * Chat — direct messages, event groups, and topic rooms.
 *
 * **Being built, from 2026-09-18.** The discussion rooms are the first part of
 * it to be real. Direct messages and groups are not built, and this screen says
 * so in the segment where they would be rather than showing an empty list that
 * could be read as "you have no messages" — the two are different facts and
 * only one of them is true.
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
  const { rooms, loading, error } = useChatRooms();

  const grouped = useMemo(() => roomsByCategory(rooms), [rooms]);

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
          {showConversations ? <NotBuiltYet segment={segment} /> : null}

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
                <>
                  {grouped.map(([category, inCategory]) => (
                    <section key={category}>
                      <RoomCategoryLabel category={category} />
                      {inCategory.map((room) => (
                        <RoomCard key={room.id} room={room} />
                      ))}
                    </section>
                  ))}
                  {/* Under the cards, not over them: it is a note about what
                      the cards cannot do yet, and it stops being true — and
                      goes — when topics and posts land. */}
                  <p className="mt-3 text-[0.78125rem] text-grey leading-[1.45]">
                    Reading and writing topics is being built. A room shows what it is for until
                    then.
                  </p>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * What is not built, in the segment where it would be.
 *
 * Worded as "not built" and never as "nothing yet": a member with no messages
 * and a member whose messages cannot be shown see the same blank space, and
 * only one of those is something they can do anything about.
 */
function NotBuiltYet({ segment }: { segment: ChatSegment }) {
  const what =
    segment === 'direct'
      ? 'Direct messages are not built yet.'
      : segment === 'groups'
        ? 'Groups are not built yet.'
        : 'Direct messages and groups are not built yet.';
  return (
    <div className="rounded-[14px] border border-line bg-paper px-3.5 py-3">
      <p className="text-[0.875rem] text-ink2 leading-relaxed">{what}</p>
      <p className="mt-1 text-[0.78125rem] text-grey leading-relaxed">
        They are next.{' '}
        {segment === 'all'
          ? 'The discussion rooms below are the part of Chat that is real.'
          : 'The discussion rooms, under Rooms, are the part of Chat that is real.'}
      </p>
    </div>
  );
}
