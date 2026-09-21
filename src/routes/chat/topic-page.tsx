import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { useAccount } from '@/lib/account';
import { attachmentFolder, deleteAttachments, uploadAttachments } from '@/lib/chat/attachments';
import { useChatAuthors } from '@/lib/chat/authors';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { reportPost, useMyReports } from '@/lib/chat/reports';
import { useChatRooms, useRoomMembership } from '@/lib/chat/rooms';
import { chatTimeLong } from '@/lib/chat/time';
import { firstUnreadIndex, removePost, sendPost, useTopicPosts } from '@/lib/chat/topics';
import { Composer } from '@/routes/chat/composer';
import { Post } from '@/routes/chat/post';
import { ReportSheet } from '@/routes/chat/report-sheet';

/**
 * One topic: the question, every reply, and the box to add to it.
 *
 * ---------------------------------------------------------------------------
 * Enter breaks a line here, and does not send
 * ---------------------------------------------------------------------------
 * The opposite of a direct thread. A post in a room is paragraphs, and a member
 * dictating one will pause — a send bound to Enter would cut the answer in
 * half and publish the first sentence. Only the button sends.
 *
 * ---------------------------------------------------------------------------
 * Opening at the first unread post
 * ---------------------------------------------------------------------------
 * A topic somebody has read half of opens at the half they have not. A topic
 * they have never opened starts at the top, because for them the first unread
 * post *is* the question. The read row is fetched before this visit overwrites
 * it — see useTopicPosts — and the scroll happens once, on the first load, so
 * that a reply arriving later does not throw the reader back up the page.
 *
 * ---------------------------------------------------------------------------
 * Numbering
 * ---------------------------------------------------------------------------
 * "3/11" counts every row, removed ones included. That is why removal is soft:
 * a post that vanished would renumber the rest for everybody reading, and every
 * "as somebody said in 4" above it would be wrong.
 *
 * ---------------------------------------------------------------------------
 * Reporting
 * ---------------------------------------------------------------------------
 * Whoever can remove a post does not get offered Report on it — an
 * administrator can take it down, and an author's own post is theirs. So the
 * control is drawn on exactly the posts the reader can neither remove nor has
 * written, and the sheet says what it will disclose before it discloses it.
 *
 * A former member's post is not reportable from here. A report names who wrote
 * it, and they have already left the club, which is the furthest a report
 * could go.
 */
export default function TopicPage() {
  const { roomId, topicId } = useParams<{ roomId: string; topicId: string }>();
  const account = useAccount();
  const { rooms, loading: roomsLoading } = useChatRooms();
  const membership = useRoomMembership();
  const { topic, posts, lastReadAt, loading, error, reload } = useTopicPosts(roomId, topicId);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removalFailure, setRemovalFailure] = useState<string | null>(null);
  const reports = useMyReports();
  // Which post the sheet is open over, or null. One at a time, and the id
  // rather than a boolean so that the sheet cannot outlive the post it is
  // about when a removal arrives over the wire mid-decision.
  const [reportingId, setReportingId] = useState<string | null>(null);

  // Live. A reply from somebody else appears without the reader doing
  // anything, and a removal arrives as an UPDATE and redraws as the sentence
  // that replaces it. The scroll is not affected: it happens once, on the
  // first load, so a reply landing does not throw the reader up the page.
  useRealtimeRows({
    table: 'chat_posts',
    filter: topicId ? `topic_id=eq.${topicId}` : undefined,
    onChange: reload,
    enabled: Boolean(topicId),
  });

  const authors = useChatAuthors([topic?.authorId ?? null, ...posts.map((post) => post.authorId)]);
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const closed = room?.openedAt === null;
  const canPost = account.isAdmin || (room !== null && !closed && membership.joined.has(room.id));

  // Where the reader had got to, captured on the first load and not recomputed:
  // once they are reading, the page must stay where they put it.
  const scrolled = useRef(false);
  const list = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (loading || scrolled.current || posts.length === 0) return;
    scrolled.current = true;
    const index = firstUnreadIndex(posts, lastReadAt);
    if (index === 0) return;
    const element = list.current?.children.item(index);
    element?.scrollIntoView({ block: 'start' });
  }, [loading, posts, lastReadAt]);

  function remove(postId: string) {
    setRemovingId(postId);
    setRemovalFailure(null);
    // Captured before the row is blanked: the function empties the list, and
    // the files go through the storage API afterwards — see 20260918200000.
    const files = posts.find((post) => post.id === postId)?.attachments ?? [];
    void removePost(postId)
      .then((result) => {
        if (!result.ok) {
          setRemovalFailure(result.error);
          return;
        }
        if (files.length > 0) void deleteAttachments(files);
        reload();
      })
      .catch((e: unknown) => {
        setRemovalFailure(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setRemovingId(null);
      });
  }

  if (loading || roomsLoading) {
    return <p className="px-6 py-10 text-center text-[0.875rem] text-grey">Loading…</p>;
  }

  if (error || !topic) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to={room ? `/chat/rooms/${room.id}` : '/chat'} label={room?.name ?? 'Chat'} />
          <p className="mt-6 text-[0.875rem] text-ink2 leading-relaxed">
            This topic cannot be shown.
          </p>
          {error ? (
            <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">{error}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const starter = topic.authorId ? authors.get(topic.authorId) : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-3 pb-3">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to={room ? `/chat/rooms/${room.id}` : '/chat'} label={room?.name ?? 'Chat'} />
          <h1 className="mt-1 font-extrabold font-head text-[1.125rem] text-ink leading-[1.3]">
            {topic.title}
          </h1>
          <p className="mt-1.5 text-[0.78125rem] text-grey leading-[1.45]">
            {topic.replyCount} {topic.replyCount === 1 ? 'reply' : 'replies'} · {topic.viewCount}{' '}
            {topic.viewCount === 1 ? 'view' : 'views'} · started by{' '}
            {starter ? starter.displayName : topic.authorId ? '…' : 'a former member'} on{' '}
            {chatTimeLong(topic.createdAt)}
          </p>
          {/* An administrator seeding a room reaches this screen with a
              working composer and no other sign that nobody can read what
              they are writing. The room page says the same thing; forgetting
              it one screen deeper is how somebody wonders why there is no
              answer. */}
          {closed ? (
            <p className="mt-2 rounded-[11px] bg-tint px-3 py-2 text-[0.78125rem] text-ink2 leading-[1.45]">
              This room is closed. No member can see this topic yet.
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-[18px] md:px-6">
        <div className="mx-auto w-full max-w-[720px]" ref={list}>
          {removalFailure ? (
            <p className="mb-2.5 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
              {removalFailure}
            </p>
          ) : null}
          {posts.map((post, index) => (
            <Post
              key={post.id}
              post={post}
              author={post.authorId ? (authors.get(post.authorId) ?? null) : null}
              number={index + 1}
              total={posts.length}
              // An administrator can remove anybody's; everybody else only
              // their own. chat_remove_post decides — this only asks.
              canRemove={account.isAdmin || post.authorId === account.userId}
              onRemove={() => {
                remove(post.id);
              }}
              removing={removingId === post.id}
              // Exactly the posts the reader can neither remove nor wrote,
              // and not a former member's — see the header.
              canReport={
                !account.isAdmin && post.authorId !== null && post.authorId !== account.userId
              }
              reported={reports.postIds.has(post.id)}
              onReport={() => {
                setReportingId(post.id);
              }}
            />
          ))}
        </div>
      </div>

      {canPost ? (
        <Composer
          placeholder="Reply to this topic"
          sendLabel="Post this reply"
          // Enter breaks a line. Only the button sends — see the header.
          sendOnEnter={false}
          onSend={async (body, files) => {
            if (!account.userId) return 'You are signed out.';
            if (!room) return 'There is no such room.';
            // Files first, under the room's folder, which is what the read
            // policy checks; then the row that names them. A refused row
            // takes its files back out — see attachments.ts.
            let paths: string[] = [];
            if (files.length > 0) {
              const up = await uploadAttachments(files, attachmentFolder('room', room.id));
              if (!up.ok) return up.error;
              paths = up.value;
            }
            const result = await sendPost(topic.id, account.userId, body, paths);
            if (!result.ok) {
              void deleteAttachments(paths);
              return result.error;
            }
            reload();
            return null;
          }}
        />
      ) : closed ? (
        <div className="flex-none border-line border-t bg-paper px-3.5 py-3">
          <p className="mx-auto w-full max-w-[720px] text-center text-[0.78125rem] text-grey leading-[1.45]">
            This room is closed. No member can see it yet.
          </p>
        </div>
      ) : (
        <div className="flex-none border-line border-t bg-paper px-3.5 py-2.5">
          <div className="mx-auto w-full max-w-[720px]">
            <button
              type="button"
              onClick={() => {
                if (room) membership.toggle(room.id);
              }}
              className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem] transition-colors hover:bg-gold-hi"
            >
              Join {room?.name ?? 'this room'} to reply
            </button>
            {membership.error ? (
              <p className="mt-2 text-center text-[0.75rem] text-destructive leading-[1.45]">
                {membership.error}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {reportingId ? (
        <ReportSheet
          kind="post"
          onCancel={() => {
            setReportingId(null);
          }}
          onSend={async (note) => {
            const result = await reportPost(reportingId, note);
            if (!result.ok) return result.error;
            // Read back what the database actually holds rather than assuming
            // it took: the control that says "Reported" should be reporting a
            // row, not an optimistic guess.
            reports.reload();
            setReportingId(null);
            return null;
          }}
        />
      ) : null}
    </div>
  );
}
