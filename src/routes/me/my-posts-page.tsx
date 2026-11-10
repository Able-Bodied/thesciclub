import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { filterMyTopics, type MyTopicKind, useMyTopics } from '@/lib/chat/my-topics';
import { useChatRooms } from '@/lib/chat/rooms';
import { chatTime } from '@/lib/chat/time';
import { ROOM_CATEGORIES, type RoomCategory } from '@/lib/chat/types';

const KINDS = [
  ['all', 'All'],
  ['question', 'Questions'],
  ['post', 'Posts'],
] as const satisfies readonly (readonly [MyTopicKind, string])[];

/** The questions and posts the member started, newest first. */
export default function MyPostsPage() {
  const { userId } = useAccount();
  const { topics, error, reload } = useMyTopics(userId);
  const { rooms } = useChatRooms();
  const [kind, setKind] = useState<MyTopicKind>('all');
  const [category, setCategory] = useState<RoomCategory | 'all'>('all');

  const everything = topics ? filterMyTopics(topics, rooms, 'all', 'all') : [];
  // Only the room types they have posted in, in the club's order.
  const used = new Set(
    everything.map((t) => rooms.find((r) => r.id === t.roomId)?.category).filter(Boolean),
  );
  const categories = [
    ['all', 'All rooms'] as const,
    ...ROOM_CATEGORIES.filter((c) => used.has(c)).map((c) => [c, c] as const),
  ];
  const shown = topics ? filterMyTopics(topics, rooms, kind, category) : [];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <div className="mx-auto w-full max-w-[560px]">
          <BackLink to="/me" label="Me" />
          <h1 className="mt-1 font-display font-extrabold text-[1.5625rem] text-ink tracking-[-0.01em]">
            My posts
          </h1>
          <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
            The questions and posts you started in rooms.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[560px] flex-none px-4 pt-2 pb-8">
        {error ? (
          <div className="pt-4">
            <p role="alert" className="text-[0.875rem] text-destructive leading-[1.5]">
              {error}
            </p>
            <button
              type="button"
              onClick={() => {
                void reload();
              }}
              className="mt-2 min-h-[44px] font-semibold text-emphasis underline"
            >
              Try again
            </button>
          </div>
        ) : topics === null ? (
          <p role="status" className="py-6 text-center text-[0.875rem] text-grey">
            Loading…
          </p>
        ) : everything.length === 0 ? (
          <p className="py-6 text-[0.875rem] text-ink2 leading-[1.5]">
            Nothing yet. A question or post you start in a room will be listed here.
          </p>
        ) : (
          <>
            <fieldset>
              <legend className="sr-only">Show</legend>
              <SegmentPills segments={KINDS} value={kind} onChange={setKind} />
            </fieldset>
            {categories.length > 2 ? (
              <fieldset>
                <legend className="sr-only">Room type</legend>
                <SegmentPills
                  segments={categories}
                  value={category}
                  onChange={setCategory}
                  className="pt-0"
                />
              </fieldset>
            ) : null}
            <p role="status" className="mb-2 text-[0.75rem] text-grey">
              {shown.length === 1 ? '1 shown' : `${shown.length} shown`}
            </p>
            {shown.length === 0 ? (
              <p className="py-4 text-[0.875rem] text-ink2 leading-[1.5]">
                None of those. Try another filter.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {shown.map((topic) => {
                  const room = rooms.find((r) => r.id === topic.roomId);
                  return (
                    <li key={topic.id} className="rounded-[14px] border border-line bg-paper p-3.5">
                      <p className="font-semibold text-[0.75rem] text-grey">
                        {topic.isQuestion ? 'Question' : 'Post'}
                        {room ? ` · ${room.name}` : ''} · {chatTime(topic.createdAt)}
                      </p>
                      <Link
                        to={`/chat/rooms/${topic.roomId}/topics/${topic.id}`}
                        className="mt-1 block font-extrabold font-head text-[0.96875rem] text-ink underline-offset-2 hover:underline"
                      >
                        {topic.title}
                      </Link>
                      <p className="mt-1 text-[0.8125rem] text-ink2">
                        {topic.replyCount === 1 ? '1 reply' : `${topic.replyCount} replies`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
