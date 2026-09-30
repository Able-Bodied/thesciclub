import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { useAccount } from '@/lib/account';
import { attachmentFolder, deleteAttachments, uploadAttachments } from '@/lib/chat/attachments';
import { useChatAuthors } from '@/lib/chat/authors';
import { useEdits } from '@/lib/chat/edits';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { reportPost, useMyReports } from '@/lib/chat/reports';
import { useChatRooms } from '@/lib/chat/rooms';
import { chatTimeLong } from '@/lib/chat/time';
import {
  deleteTopic,
  editPost,
  firstUnreadThread,
  removePost,
  sendPost,
  threadPosts,
  useTopicPosts,
} from '@/lib/chat/topics';
import type { ChatPost } from '@/lib/chat/types';
import { describeThrown } from '@/lib/describe-error';
import { backFromTopic } from '@/routes/chat/back';
import { Composer } from '@/routes/chat/composer';
import { MuteButton } from '@/routes/chat/mute-button';
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
 * "3/11" counts the posts still standing. A removed post is not drawn at all —
 * the owner's call, 2026-09-27, over the "Removed by its author." line that
 * used to hold its place — so the numbers close up when one goes. The row
 * stays underneath for reports and moderation (20260927030000); it is only
 * the screen that forgets it.
 *
 * ---------------------------------------------------------------------------
 * Deleting a topic
 * ---------------------------------------------------------------------------
 * Administrators only, in the header, behind a confirm. It takes every post
 * with it; reports on them keep their own copy (20260927040000). The
 * photographs go through the storage API afterwards, as removing a post's do.
 *
 * ---------------------------------------------------------------------------
 * Editing, since 2026-09-29
 * ---------------------------------------------------------------------------
 * Edit on the reader's own standing post swaps its words for the composer
 * holding them (post.tsx). One post at a time, by id, so that a removal
 * arriving over the wire cannot leave an editor open on a post that is no
 * longer drawn. `chat_edit_post` decides; a refusal comes back into the
 * composer with the draft still in it.
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
  const { topic, posts, lastReadAt, loading, error, reload } = useTopicPosts(roomId, topicId);
  // What the reader sees and counts: removed posts are left out, and the
  // rest are filed under the post they answer. See the header.
  const threads = useMemo(
    () => threadPosts(posts.filter((post) => post.removedAt === null)),
    [posts],
  );
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removalFailure, setRemovalFailure] = useState<string | null>(null);
  /** The post whose words are in the composer, or null. See the header. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** The top-level post the next reply goes under, or null. */
  const [replyingTo, setReplyingTo] = useState<ChatPost | null>(null);
  const reports = useMyReports();
  // Which post the sheet is open over, or null. One at a time, and the id
  // rather than a boolean so that the sheet cannot outlive the post it is
  // about when a removal arrives over the wire mid-decision.
  const [reportingId, setReportingId] = useState<string | null>(null);

  // Live. A reply from somebody else appears without the reader doing
  // anything, and a removal arrives as an UPDATE and redraws as the sentence
  // that replaces it. The scroll is not affected: it happens once, on the
  // first load, so a reply landing does not throw the reader up the page.
  // Administrators only; everybody else gets empty maps without a read.
  const editedIds = useMemo(
    () => posts.filter((post) => post.editedAt !== null).map((post) => post.id),
    [posts],
  );
  const edits = useEdits(editedIds, []);

  useRealtimeRows({
    table: 'chat_posts',
    filter: topicId ? `topic_id=eq.${topicId}` : undefined,
    onChange: () => {
      reload();
      // An edit arrives as an update to the post; its earlier version is a
      // new row here.
      edits.reload();
    },
    enabled: Boolean(topicId),
  });

  const authors = useChatAuthors([topic?.authorId ?? null, ...posts.map((post) => post.authorId)]);
  const room = rooms.find((r) => r.id === roomId) ?? null;
  // Home, when the topic was opened from a card there; the room otherwise.
  const location = useLocation();
  const back = backFromTopic(location.state, room);
  const closed = room?.openedAt === null;
  // Any member, in an open room; an administrator in a closed one too, to
  // seed it. No membership since 20260930000000.
  const canPost = room !== null && (!closed || account.isAdmin);

  // Where the reader had got to, captured on the first load and not recomputed:
  // once they are reading, the page must stay where they put it.
  const scrolled = useRef(false);
  const list = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (loading || scrolled.current || threads.length === 0) return;
    scrolled.current = true;
    const index = firstUnreadThread(threads, lastReadAt);
    if (index === 0) return;
    const element = list.current?.children.item(index);
    element?.scrollIntoView({ block: 'start' });
  }, [loading, threads, lastReadAt]);

  function removeTopic() {
    if (!topicId) return;
    // A confirm, like closing a room: this cannot be undone and takes every
    // reply with it.
    if (
      !window.confirm(
        'Delete this topic and every reply in it? This cannot be undone. Reports on its posts keep their own copy.',
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteFailure(null);
    void deleteTopic(topicId)
      .then((result) => {
        if (!result.ok) {
          setDeleteFailure(result.error);
          setDeleting(false);
          return;
        }
        if (result.value.length > 0) void deleteAttachments(result.value);
        void navigate(room ? `/chat/rooms/${room.id}` : '/chat', { replace: true });
      })
      .catch((e: unknown) => {
        setDeleteFailure(describeThrown(e, 'The topic was not deleted.'));
        setDeleting(false);
      });
  }

  async function saveEdit(postId: string, body: string): Promise<string | null> {
    const result = await editPost(postId, body);
    if (!result.ok) return result.error;
    setEditingId(null);
    reload();
    edits.reload();
    return null;
  }

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
        setRemovalFailure(describeThrown(e, 'That did not work.'));
      })
      .finally(() => {
        setRemovingId(null);
      });
  }

  if (loading || roomsLoading) {
    return (
      <p role="status" className="px-6 py-10 text-center text-[0.875rem] text-grey">
        Loading…
      </p>
    );
  }

  if (error || !topic) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to={back.to} label={back.label} />
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
  const nameOf = (post: ChatPost) =>
    (post.authorId ? authors.get(post.authorId)?.displayName : null) ?? 'a former member';

  /** What every post is handed, top level or reply. `under` is the post a
      reply to this one files beneath: itself for a top-level post, its post
      for a reply — one level, decided here as well as by the trigger. */
  const postProps = (post: ChatPost, under: ChatPost) => ({
    post,
    author: post.authorId ? (authors.get(post.authorId) ?? null) : null,
    // The author's own, and nobody else's — not an administrator's either.
    // chat_edit_post decides; this only asks.
    canEdit: canPost && post.authorId === account.userId,
    editing: editingId === post.id,
    onEdit: () => {
      setEditingId(post.id);
    },
    onSaveEdit: (body: string) => saveEdit(post.id, body),
    onCancelEdit: () => {
      setEditingId(null);
    },
    canReply: canPost,
    onReply: () => {
      setReplyingTo(under);
    },
    // An administrator can remove anybody's; everybody else only their own.
    // chat_remove_post decides — this only asks.
    canRemove: account.isAdmin || post.authorId === account.userId,
    onRemove: () => {
      remove(post.id);
    },
    removing: removingId === post.id,
    // Exactly the posts the reader can neither remove nor wrote, and not a
    // former member's — see the header.
    canReport: !account.isAdmin && post.authorId !== null && post.authorId !== account.userId,
    reported: reports.postIds.has(post.id),
    onReport: () => {
      setReportingId(post.id);
    },
    edits: edits.byPost.get(post.id) ?? [],
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-3 pb-3">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to={back.to} label={back.label} />
          <h1 className="mt-1 font-extrabold font-head text-[1.125rem] text-ink leading-[1.3]">
            {topic.title}
          </h1>
          <p className="mt-1.5 text-[0.78125rem] text-grey leading-[1.45]">
            {topic.replyCount} {topic.replyCount === 1 ? 'reply' : 'replies'} · {topic.viewCount}{' '}
            {topic.viewCount === 1 ? 'view' : 'views'} · started by{' '}
            {starter ? starter.displayName : topic.authorId ? '…' : 'a former member'} on{' '}
            {chatTimeLong(topic.createdAt)}
          </p>
          {/* Only the member who started a topic is notified of its replies,
              so only they are offered a way to stop that. */}
          {topic.authorId !== null && topic.authorId === account.userId ? (
            <MuteButton
              target={{ kind: 'topic', id: topic.id }}
              what="replies to this topic"
              className="mt-2"
            />
          ) : null}
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
          {account.isAdmin ? (
            <button
              type="button"
              onClick={removeTopic}
              disabled={deleting}
              data-target="small"
              className="mt-2 rounded-full bg-destructive/10 px-[0.85em] py-[0.45em] font-bold font-head text-[0.75rem] text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete topic'}
            </button>
          ) : null}
          {deleteFailure ? (
            <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
              {deleteFailure}
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-[18px] md:px-6">
        <div className="mx-auto w-full max-w-[720px]" ref={list}>
          {removalFailure ? (
            <p
              role="alert"
              className="mb-2.5 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
            >
              {removalFailure}
            </p>
          ) : null}
          {threads.map(({ post, replies }, index) => (
            <Post
              key={post.id}
              {...postProps(post, post)}
              number={index + 1}
              total={threads.length}
            >
              {replies.map((reply) => (
                <Post key={reply.id} {...postProps(reply, post)} nested />
              ))}
            </Post>
          ))}
        </div>
      </div>

      {canPost ? (
        <Composer
          placeholder="Reply to this topic"
          sendLabel="Post this reply"
          // Enter breaks a line. Only the button sends — see the header.
          sendOnEnter={false}
          replyingTo={
            replyingTo
              ? {
                  id: replyingTo.id,
                  name: nameOf(replyingTo),
                  onCancel: () => {
                    setReplyingTo(null);
                  },
                }
              : null
          }
          onSend={async (body, files) => {
            if (!account.userId) return 'You are signed out.';
            // Files first, under the room's folder, which is what the read
            // policy checks; then the row that names them. A refused row
            // takes its files back out — see attachments.ts.
            let paths: string[] = [];
            if (files.length > 0) {
              const up = await uploadAttachments(files, attachmentFolder('room', room.id));
              if (!up.ok) return up.error;
              paths = up.value;
            }
            const result = await sendPost(
              topic.id,
              account.userId,
              body,
              paths,
              replyingTo?.id ?? null,
            );
            if (!result.ok) {
              void deleteAttachments(paths);
              return result.error;
            }
            setReplyingTo(null);
            reload();
            return null;
          }}
        />
      ) : (
        <div className="flex-none border-line border-t bg-paper px-3.5 py-3">
          <p className="mx-auto w-full max-w-[720px] text-center text-[0.78125rem] text-grey leading-[1.45]">
            This room is closed. No member can see it yet.
          </p>
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
