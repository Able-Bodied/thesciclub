import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { FormerMemberAvatar, GroupAvatar, MemberAvatar } from '@/components/member-avatar';
import { useAccount } from '@/lib/account';
import {
  attachmentFolder,
  deleteAttachments,
  uploadAttachments,
  useAttachmentUrls,
} from '@/lib/chat/attachments';
import { useChatAuthors } from '@/lib/chat/authors';
import { readReceipt, useThreadReadReceipts } from '@/lib/chat/read-receipts';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { reportMessage, useMyReports } from '@/lib/chat/reports';
import { quoteText, shouldFollowScroll, threadTitle, useThreadMessages } from '@/lib/chat/threads';
import type { ChatMessage } from '@/lib/chat/types';
import { describeThrown } from '@/lib/describe-error';
import { useHoldScroll } from '@/lib/hold-scroll';
import { Composer } from '@/routes/chat/composer';
import { DeleteConversation } from '@/routes/chat/delete-conversation';
import { MessageBubble, type Quote } from '@/routes/chat/message-bubble';
import { MuteButton } from '@/routes/chat/mute-button';
import { NoticeLine } from '@/routes/chat/notice-line';
import { ReportSheet } from '@/routes/chat/report-sheet';

/**
 * One conversation: the bubbles, and the box to add to it.
 *
 * ---------------------------------------------------------------------------
 * Enter sends here, and breaks a line in a topic
 * ---------------------------------------------------------------------------
 * The opposite of a room. Messages are short and Enter is what everybody's
 * hands already do; Shift+Enter is the line break. A post in a room is
 * paragraphs and Enter has to be the break, so only the button sends there.
 *
 * ---------------------------------------------------------------------------
 * Scroll
 * ---------------------------------------------------------------------------
 * A conversation opens at the bottom, because the newest message is the one you
 * came for — the opposite of a topic, which opens at the first post you have
 * not read. When something new arrives the list follows it down only if the
 * reader was already at the bottom; somebody who has scrolled up is reading
 * something, and yanking them away mid-sentence is worse than making them tap a
 * pill to come back. `shouldFollowScroll` is where the threshold lives and is
 * tested in threads.test.ts.
 *
 * ---------------------------------------------------------------------------
 * A group's header is a link, a pair's is not
 * ---------------------------------------------------------------------------
 * "N members" opens the members screen, where adding and leaving live. A direct
 * conversation has nothing behind its subtitle — the other member's level is a
 * fact about them, and their profile is the button already on the right.
 *
 * ---------------------------------------------------------------------------
 * Talking to somebody who has left
 * ---------------------------------------------------------------------------
 * A direct thread whose other half has been removed from the club stays
 * readable — their words stay, anonymised, which is the owner's decision — and
 * loses its composer, because there is nobody to send to. It says so rather
 * than presenting a box that would fail.
 *
 * ---------------------------------------------------------------------------
 * Replies are quotes, and editing is in place — since 2026-09-29
 * ---------------------------------------------------------------------------
 * Reply on a bubble puts "Replying to Jan" over the composer and sends the
 * next message with `reply_to` set; the bubble that lands carries a quote of
 * the message it answers, and the list stays in time order (HANDOFF.md "What Home is",
 * decision 11 — a nest in a chat would break the one thing a conversation
 * is). Tapping a quote scrolls the quoted message into view and lights it
 * up once, with `prefers-reduced-motion` honoured for both. Edit on the
 * reader's own bubble swaps it for the composer holding the words; one at a
 * time, by id.
 *
 * ---------------------------------------------------------------------------
 * Reporting is the one way anything said here reaches an administrator
 * ---------------------------------------------------------------------------
 * They are not in this conversation and cannot read it, which is right and is
 * what makes harassment in a direct message otherwise unactionable: the person
 * it happened to is the only witness. Report on somebody else's bubble hands
 * over that one message, its author and its time, and nothing else — not the
 * thread, not the message before it, not the reply. The sheet says so before
 * anything is sent.
 *
 * ---------------------------------------------------------------------------
 * A change to the group is a line, not a bubble — since 2026-09-30
 * ---------------------------------------------------------------------------
 * Renaming a group or changing its picture leaves a row marked as a notice
 * (20260930020000), drawn by `NoticeLine` in its place in time order. It
 * arrives over the same realtime as a message, and the reload that brings it
 * in re-reads the thread too, so the header's name and picture change for
 * everybody looking at the same moment.
 */
export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const account = useAccount();
  const { thread, messages, loading, error, reload, send, edit, remove } =
    useThreadMessages(threadId);
  const reads = useThreadReadReceipts(threadId);

  // Live. The reload also re-marks the thread read, which is right: the reader
  // is looking at it. Removal arrives here as an UPDATE, so a message taken
  // back turns into "Removed by…" under somebody who is mid-conversation
  // rather than staying on their screen.
  useRealtimeRows({
    table: 'chat_messages',
    filter: threadId ? `thread_id=eq.${threadId}` : undefined,
    onChange: reload,
    enabled: Boolean(threadId),
  });

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removalFailure, setRemovalFailure] = useState<string | null>(null);
  const [behind, setBehind] = useState(false);
  /** The message whose words are in the composer, or null. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** The message the next one answers, or null. */
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  /** The message lit up after a quote was tapped, or null. */
  const [flashId, setFlashId] = useState<string | null>(null);
  const reports = useMyReports();
  /** Which message the sheet is open over, or null. One at a time. */
  const [reportingId, setReportingId] = useState<string | null>(null);

  const authors = useChatAuthors([
    thread?.otherMemberId ?? null,
    ...messages.map((message) => message.authorId),
  ]);
  const other = thread?.otherMemberId ? (authors.get(thread.otherMemberId) ?? null) : null;
  // Signed under the reader's token: a group's picture is as private as its
  // words. Empty for a pair, and for a group with none.
  const picture = useAttachmentUrls(thread?.photoPath ? [thread.photoPath] : []);
  const title = thread ? threadTitle(thread, other?.displayName ?? null) : '';
  // A direct thread keeps its composer; one whose other half has gone does not.
  const gone = thread?.kind === 'direct' && thread.otherMemberId === null;

  const scroller = useRef<HTMLDivElement | null>(null);
  const log = useRef<HTMLDivElement | null>(null);
  const opened = useRef(false);
  const seen = useRef(0);
  // Held at the bottom while photographs load, until the reader scrolls; see
  // lib/hold-scroll.ts. Taken up again whenever they come back down.
  const pin = useHoldScroll(scroller, log, !loading && thread !== null);

  /** Straight to the bottom, with no animation: what a hold re-applies. */
  const snapToBottom = useCallback(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, []);

  const toBottom = useCallback(
    (behaviour: ScrollBehavior) => {
      const element = scroller.current;
      if (!element) return;
      // Two ways down, because `scrollTo` on an element is not everywhere — jsdom
      // has no implementation of it at all, and a screen whose tests cannot render
      // it is a screen with no tests. Setting scrollTop is what both understand;
      // scrollTo is only there for the smooth one.
      if (behaviour === 'smooth' && typeof element.scrollTo === 'function') {
        element.scrollTo({ top: element.scrollHeight, behavior: behaviour });
        // Held without a jump, so the smooth scroll is what the reader sees; a
        // photograph that lands later snaps to the bottom from wherever it is.
        pin.hold(snapToBottom, { now: false });
      } else {
        pin.hold(snapToBottom);
      }
      setBehind(false);
    },
    [pin, snapToBottom],
  );

  // Open at the bottom, once, on the first load that has anything in it.
  useEffect(() => {
    if (loading || opened.current || !thread) return;
    opened.current = true;
    seen.current = messages.length;
    toBottom('auto');
  }, [loading, thread, messages.length, toBottom]);

  // Afterwards, follow only if the reader was already there.
  useEffect(() => {
    if (!opened.current || messages.length === seen.current) return;
    const grew = messages.length > seen.current;
    seen.current = messages.length;
    if (!grew) return;
    const element = scroller.current;
    if (!element) return;
    // Held means the reader is at the bottom, whatever the arithmetic says now
    // that the new message has already made the list taller.
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (pin.holding() || shouldFollowScroll(distance)) toBottom('smooth');
    else setBehind(true);
  }, [messages.length, toBottom, pin]);

  /** Coming back down to the newest message takes the hold up again. */
  function onScroll() {
    const element = scroller.current;
    if (!element || pin.holding()) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (shouldFollowScroll(distance)) {
      pin.hold(snapToBottom);
      setBehind(false);
    }
  }

  const nameOf = (message: ChatMessage): string => {
    if (message.authorId === account.userId) return 'you';
    return (
      (message.authorId ? authors.get(message.authorId)?.displayName : null) ?? 'a deleted member'
    );
  };

  /** The quote over a reply: the message it answers, found in the list. */
  const quoteOf = (message: ChatMessage): Quote | null => {
    if (!message.replyTo) return null;
    const target = messages.find((candidate) => candidate.id === message.replyTo);
    // "You" as a heading over the quote, where the reply bar says "you".
    const name = target ? nameOf(target) : 'Earlier message';
    return {
      id: message.replyTo,
      name: name === 'you' ? 'You' : name,
      text: quoteText(target),
    };
  };

  /** Scroll the quoted message into view and light it up once. */
  function showQuoted(messageId: string) {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    // Off and on again, so a second tap on the same quote lights it again.
    setFlashId(null);
    requestAnimationFrame(() => {
      setFlashId(messageId);
    });
  }

  async function saveEdit(messageId: string, body: string): Promise<string | null> {
    const problem = await edit(messageId, body);
    if (problem) return problem;
    setEditingId(null);
    return null;
  }

  function removeMessage(messageId: string) {
    setRemovingId(messageId);
    setRemovalFailure(null);
    void remove(messageId)
      .then((problem) => {
        if (problem) setRemovalFailure(problem);
      })
      .catch((e: unknown) => {
        setRemovalFailure(describeThrown(e, 'That did not work.'));
      })
      .finally(() => {
        setRemovingId(null);
      });
  }

  if (loading) {
    return (
      <p role="status" className="px-6 py-10 text-center text-[0.875rem] text-grey">
        Loading…
      </p>
    );
  }

  if (error || !thread) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to="/chat" label="Chat" />
          <p className="mt-6 text-[0.875rem] text-ink2 leading-relaxed">
            This conversation cannot be shown.
          </p>
          {error ? (
            <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">{error}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-3 pb-3">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to="/chat" label="Chat" />
          <div className="mt-1 flex items-center gap-2.5">
            {/* Decorative: the name is beside it, and Profile is the link. */}
            <span aria-hidden="true" className="flex-none">
              {thread.kind === 'group' ? (
                <GroupAvatar url={thread.photoPath ? picture.get(thread.photoPath) : null} />
              ) : other ? (
                <MemberAvatar
                  id={other.id}
                  displayName={other.displayName}
                  photoPath={other.photoPath}
                  photoAlt={other.photoAlt}
                />
              ) : (
                <FormerMemberAvatar />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-extrabold font-head text-[1rem] text-ink">{title}</h1>
              {thread.kind === 'group' ? (
                <Link
                  to={`/chat/t/${thread.id}/members`}
                  data-target="small"
                  className="block truncate text-[0.78125rem] text-emphasis underline"
                >
                  {thread.memberCount} {thread.memberCount === 1 ? 'member' : 'members'}
                </Link>
              ) : (
                <p className="truncate text-[0.78125rem] text-grey">{other?.level ?? ''}</p>
              )}
            </div>
            {other?.hasProfile ? (
              <Link
                to={`/peers/${other.id}`}
                data-target="small"
                className="flex-none rounded-full border border-line px-3 py-1.5 font-bold text-[0.75rem] text-emphasis"
              >
                Profile
              </Link>
            ) : null}
            {/* Every member of a conversation is notified of it, so every
                member can mute it. Draws nothing while notifications are off. */}
            <MuteButton
              target={{ kind: 'thread', id: thread.id }}
              what="this conversation"
              className="flex-none"
            />
          </div>
        </div>
      </header>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto px-4 pt-3 pb-2 md:px-6"
      >
        <div
          ref={log}
          // Pushed to the bottom rather than stacked from the top: a
          // conversation with three messages in it belongs above the composer
          // where the next one will appear, not floating under the header with
          // a screen of nothing below it.
          className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-end"
          // The list of what has been said, announced as it grows. Polite, not
          // assertive: a message is not an alert and must not cut across
          // whatever the reader is in the middle of.
          role="log"
          aria-live="polite"
          aria-label={`Messages with ${title}`}
        >
          {removalFailure ? (
            <p
              role="alert"
              className="mb-2.5 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
            >
              {removalFailure}
            </p>
          ) : null}

          {messages.length === 0 ? (
            <p className="py-10 text-center text-[0.875rem] text-grey leading-relaxed">
              Nothing has been said yet.
              <br />
              Whatever you write here is between the two of you.
            </p>
          ) : (
            messages.map((message) =>
              message.notice ? (
                <NoticeLine
                  key={message.id}
                  message={message}
                  notice={message.notice}
                  who={
                    message.authorId === account.userId
                      ? 'You'
                      : ((message.authorId ? authors.get(message.authorId)?.displayName : null) ??
                        'A deleted member')
                  }
                  // As on a bubble: somebody else's, and not a former member's.
                  canReport={message.authorId !== null && message.authorId !== account.userId}
                  reported={reports.messageIds.has(message.id)}
                  onReport={() => {
                    setReportingId(message.id);
                  }}
                />
              ) : (
                <MessageBubble
                  key={message.id}
                  message={message}
                  author={message.authorId ? (authors.get(message.authorId) ?? null) : null}
                  mine={message.authorId === account.userId}
                  receipt={readReceipt(message, thread.kind, reads)}
                  quote={quoteOf(message)}
                  onQuoteTap={showQuoted}
                  flash={flashId === message.id}
                  // The author's own, standing, while there is a conversation
                  // to edit in. chat_edit_message decides; this only asks.
                  canEdit={!gone && message.authorId === account.userId && !message.pending}
                  editing={editingId === message.id}
                  onEdit={() => {
                    setEditingId(message.id);
                  }}
                  onSaveEdit={(body) => saveEdit(message.id, body)}
                  onCancelEdit={() => {
                    setEditingId(null);
                  }}
                  canReply={!gone && !message.pending}
                  onReply={() => {
                    setReplyingTo(message);
                  }}
                  // An administrator can remove anybody's; everybody else only
                  // their own. chat_remove_message decides — this only asks.
                  // Own messages only, even for an administrator. They are in
                  // this conversation as a member of it — a private thread they
                  // could reach as an administrator would not be private — and
                  // moderating one they are not in happens by an id somebody
                  // hands them, which is not a screen. See 20260918100000.
                  canRemove={message.authorId === account.userId}
                  onRemove={() => {
                    removeMessage(message.id);
                  }}
                  removing={removingId === message.id}
                  // Somebody else's, and not a former member's: a report names
                  // who wrote it, and they have already left the club.
                  canReport={
                    message.authorId !== null &&
                    message.authorId !== account.userId &&
                    !message.pending
                  }
                  reported={reports.messageIds.has(message.id)}
                  onReport={() => {
                    setReportingId(message.id);
                  }}
                />
              ),
            )
          )}
        </div>
      </div>

      {behind ? (
        <div className="pointer-events-none relative z-10 flex justify-center">
          <button
            type="button"
            onClick={() => {
              toBottom('smooth');
            }}
            className="-translate-y-2 pointer-events-auto min-h-[36px] rounded-full bg-action px-4 font-bold text-[0.78125rem] text-white shadow-[0_6px_16px_rgba(10,20,35,.22)]"
            data-target="small"
          >
            New messages ↓
          </button>
        </div>
      ) : null}

      {gone ? (
        <div className="flex-none border-line border-t bg-paper px-3.5 py-3">
          <p className="mx-auto w-full max-w-[720px] text-center text-[0.78125rem] text-grey leading-[1.45]">
            This member has left the club. What they wrote stays; there is nobody to reply to.
          </p>
          <DeleteConversation threadId={thread.id} />
        </div>
      ) : (
        <Composer
          placeholder={title ? `Message ${title}` : 'Message'}
          sendLabel="Send this message"
          // Enter sends here — see the header.
          sendOnEnter
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
            // Files first, under this thread's folder, which is what the read
            // policy checks; then the row that names them. A refused row takes
            // its files back out — see attachments.ts.
            let paths: string[] = [];
            if (files.length > 0) {
              const up = await uploadAttachments(files, attachmentFolder('thread', thread.id));
              if (!up.ok) return up.error;
              paths = up.value;
            }
            const problem = await send(body, paths, replyingTo?.id ?? null);
            if (problem) {
              void deleteAttachments(paths);
              return problem;
            }
            setReplyingTo(null);
            return null;
          }}
        />
      )}

      {reportingId ? (
        <ReportSheet
          kind="message"
          onCancel={() => {
            setReportingId(null);
          }}
          onSend={async (note) => {
            const result = await reportMessage(reportingId, note);
            if (!result.ok) return result.error;
            // Read back what the database holds rather than assuming it took.
            reports.reload();
            setReportingId(null);
            return null;
          }}
        />
      ) : null}
    </div>
  );
}
