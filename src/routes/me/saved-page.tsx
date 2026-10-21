import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { useAnnounce } from '@/lib/announce';
import { useChatAuthors } from '@/lib/chat/authors';
import { useChatRooms } from '@/lib/chat/rooms';
import { type SavedItem, saveKey, useSavedItems } from '@/lib/chat/saves';
import { chatTime } from '@/lib/chat/time';
import { markdownToPlain } from '@/lib/markdown';

/** The topics and posts the reader saved, newest first. Only they see this list. */
export default function SavedPage() {
  const { items, loading, error, reload, remove } = useSavedItems();
  const { rooms } = useChatRooms();
  const authors = useChatAuthors(items.map((item) => item.post?.authorId ?? null));
  const announce = useAnnounce();
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  function unsave(item: SavedItem) {
    const key = saveKey(item.topicId, item.postId);
    setFailure(null);
    void remove(item).then((message) => {
      if (message) setFailure({ key, message });
      else announce('Removed from Saved.');
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <div className="mx-auto w-full max-w-[560px]">
          <BackLink to="/me" label="Me" />
          <h1 className="mt-1 font-display font-extrabold text-[1.5625rem] text-ink tracking-[-0.01em]">
            Saved
          </h1>
          <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
            Topics and posts you saved. Only you can see this list.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[560px] flex-none px-4 pt-4 pb-8">
        {loading ? (
          <p role="status" className="py-6 text-center text-[0.875rem] text-grey">
            Loading…
          </p>
        ) : error ? (
          <div>
            <p role="alert" className="text-[0.875rem] text-destructive leading-[1.5]">
              {error}
            </p>
            <button
              type="button"
              onClick={reload}
              className="mt-2 min-h-[44px] font-semibold text-emphasis underline"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-[0.875rem] text-ink2 leading-[1.5]">
            Nothing saved yet. Press Save on a topic, or Save post in a post's actions, to find it
            here later.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => {
              const key = saveKey(item.topicId, item.postId);
              const room = item.topic
                ? (rooms.find((r) => r.id === item.topic?.roomId) ?? null)
                : null;
              const author = item.post?.authorId ? authors.get(item.post.authorId) : null;
              const gone =
                !item.topic || (item.postId !== null && (!item.post || item.post.removed));
              const title = item.topic?.title ?? 'A topic you can no longer see';
              const to = item.topic
                ? `/chat/rooms/${item.topic.roomId}/topics/${item.topicId}${item.postId ? `?post=${item.postId}` : ''}`
                : null;
              return (
                <li key={key} className="rounded-[14px] border border-line bg-paper p-3.5">
                  <p className="font-semibold text-[0.75rem] text-grey">
                    {item.postId ? 'Post' : 'Topic'}
                    {room ? ` · ${room.name}` : ''} · saved {chatTime(item.savedAt)}
                  </p>
                  {to && !gone ? (
                    <Link
                      to={to}
                      className="mt-1 block font-extrabold font-head text-[0.96875rem] text-ink underline-offset-2 hover:underline"
                    >
                      {item.postId ? `${author?.displayName ?? 'A member'} in ${title}` : title}
                    </Link>
                  ) : (
                    <p className="mt-1 font-extrabold font-head text-[0.96875rem] text-ink">
                      {title}
                    </p>
                  )}
                  {gone ? (
                    <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.5]">
                      {item.topic
                        ? 'This post was removed.'
                        : 'It was removed, or its room closed.'}
                    </p>
                  ) : item.post ? (
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-[0.8125rem] text-ink2 leading-[1.5]">
                      {markdownToPlain(item.post.body)}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      unsave(item);
                    }}
                    aria-label={`Remove ${item.postId ? 'the post' : 'the topic'} ${title} from Saved`}
                    data-target="small"
                    className="mt-2 font-semibold text-[0.75rem] text-grey underline decoration-line underline-offset-2 hover:text-destructive"
                  >
                    Remove from Saved
                  </button>
                  {failure?.key === key ? (
                    <p role="alert" className="mt-1 text-[0.78125rem] text-destructive">
                      {failure.message}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
