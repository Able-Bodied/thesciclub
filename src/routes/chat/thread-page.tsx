import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { FormerMemberAvatar, GroupAvatar, MemberAvatar } from '@/components/member-avatar';
import { motionReduced } from '@/lib/accessibility';
import { useAccount } from '@/lib/account';
import { useMyBlocks } from '@/lib/blocks';
import {
  attachmentFolder,
  deleteAttachments,
  uploadAttachments,
  useAttachmentUrls,
} from '@/lib/chat/attachments';
import { useChatAuthors } from '@/lib/chat/authors';
import { useThreadRoster } from '@/lib/chat/groups';
import { useReactions } from '@/lib/chat/reactions';
import { readReceipt, useThreadReadReceipts } from '@/lib/chat/read-receipts';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { reportMessage, useMyReports } from '@/lib/chat/reports';
import { useSharedPosts } from '@/lib/chat/shared-posts';
import { quoteText, shouldFollowScroll, threadTitle, useThreadMessages } from '@/lib/chat/threads';
import { chatDayHeading, messageDateTime, sameChatDay } from '@/lib/chat/time';
import type { ChatMessage } from '@/lib/chat/types';
import { describeThrown } from '@/lib/describe-error';
import { useHoldScroll } from '@/lib/hold-scroll';
import { Composer } from '@/routes/chat/composer';
import { DeleteConversation } from '@/routes/chat/delete-conversation';
import { MessageBubble, type Quote } from '@/routes/chat/message-bubble';
import { MuteButton } from '@/routes/chat/mute-button';
import { NoticeLine } from '@/routes/chat/notice-line';
import { ReactionBar } from '@/routes/chat/reaction-bar';
import { ReportSheet } from '@/routes/chat/report-sheet';
import { SWIPE_MAX, useSwipeDates } from '@/routes/chat/swipe-dates';
import { BlockMemberSheet } from '@/routes/peers/block-sheet';

/**
 * One conversation: the bubbles, and the box to add to it.
 *
 * Enter sends here (Shift+Enter breaks a line); in a topic only the button sends.
 *
 * Opens at the bottom, and follows new messages down only if the reader was already there: a
 * reader who scrolled up is reading. The threshold is `shouldFollowScroll` (threads.test.ts).
 *
 * A group's "N members" links to the members screen; a pair's subtitle is not a link.
 *
 * A direct thread whose other member was removed stays readable, anonymised (the owner's
 * decision), and loses its composer, saying why.
 *
 * Replies are quotes (2026-09-29), kept in time order, never nested (HANDOFF.md "What Home is",
 * decision 11). Tapping a quote scrolls to it and lights it once, honouring reduced motion. Edit
 * puts the words in the composer (2026-10-22).
 *
 * Reporting is the only way anything here reaches an administrator, who cannot read the thread:
 * it hands over one message, its author and time, nothing else, and the sheet says so first.
 *
 * A group rename or picture change is a notice row (20260930020000), drawn by `NoticeLine`; its
 * reload re-reads the thread, so the header updates for everybody.
 */
export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  // Keyed so a switch between conversations starts clean: no old messages,
  // draft, reply or edit carried into somebody else's.
  return <ThreadScreen key={threadId} threadId={threadId} />;
}

function ThreadScreen({ threadId }: { threadId: string | undefined }) {
  const account = useAccount();
  const {
    thread,
    messages,
    loading,
    error,
    stale,
    hasEarlier,
    loadingEarlier,
    earlierError,
    loadEarlier,
    reveal,
    reload,
    changed,
    send,
    edit,
    remove,
  } = useThreadMessages(threadId);
  const reactions = useReactions(
    'message',
    messages.filter((m) => !m.pending && !m.notice && m.removedAt === null).map((m) => m.id),
    account.userId,
    { within: threadId },
  );
  const reads = useThreadReadReceipts(threadId);
  // Read again with every reload: a block or a removal changes what a card may show.
  const shared = useSharedPosts(
    messages.filter((m) => m.sharedPostId && !m.pending && m.removedAt === null).map((m) => m.id),
    messages,
  );

  // Live: a changed row fetches just that message (a removal arrives as an
  // UPDATE); a reconnect reads the newest page again. Either marks it read.
  useRealtimeRows({
    table: 'chat_messages',
    filter: threadId ? `thread_id=eq.${threadId}` : undefined,
    onChange: reload,
    onRow: changed,
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
  // Block from a message's •••: hidden here at once, and by the database on
  // the next read. Focus then goes to the heading, as the bubble is gone.
  const blocks = useMyBlocks();
  const navigate = useNavigate();
  const [blockedHere, setBlockedHere] = useState<ReadonlySet<string>>(new Set());
  const [blocking, setBlocking] = useState<{ id: string; name: string } | null>(null);
  const [blockedCount, setBlockedCount] = useState(0);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const swipe = useSwipeDates();
  const shown = useMemo(
    () =>
      messages.filter(
        (m) => !m.authorId || !(blocks.ids.has(m.authorId) || blockedHere.has(m.authorId)),
      ),
    [messages, blocks.ids, blockedHere],
  );
  useEffect(() => {
    if (blockedCount > 0) heading.current?.focus();
  }, [blockedCount]);
  // Only while it stands: a removal over the wire ends the edit.
  const edited = shown.find(
    (m) => m.id === editingId && m.removedAt === null && !m.pending && !m.notice,
  );

  // Who an "@" can suggest here: the conversation's own members (the owner,
  // 2026-10-29).
  const roster = useThreadRoster(threadId);
  const mentionScope = useMemo(() => ({ among: roster.memberIds }), [roster.memberIds]);

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
  // The newest message seen, so earlier ones put in front are not "new".
  const seen = useRef<string | undefined>(undefined);
  const newestId = messages.at(-1)?.id;
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

  // Open at the bottom, once, on the first load with anything in it; or on the message a
  // notification was about (?message=), centred and lit once. Again on each new ?message=.
  const [searchParams] = useSearchParams();
  const wantedMessage = searchParams.get('message');
  const { key: navigationKey } = useLocation();
  const wantedNavigation = wantedMessage ? `${wantedMessage}:${navigationKey}` : null;
  const shownFor = useRef<string | null>(null);
  // A linked message older than the newest page is read back to, once.
  const [seeking, setSeeking] = useState<string | null>(null);
  const sought = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !thread || seeking) return;
    if (opened.current && wantedNavigation === shownFor.current) return;
    if (
      wantedMessage &&
      wantedNavigation &&
      sought.current !== wantedNavigation &&
      hasEarlier &&
      !messages.some((m) => m.id === wantedMessage)
    ) {
      sought.current = wantedNavigation;
      setSeeking(wantedNavigation);
      void reveal(wantedMessage).finally(() => {
        setSeeking(null);
      });
      return;
    }
    const first = !opened.current;
    opened.current = true;
    shownFor.current = wantedNavigation;
    seen.current = newestId;
    const target = wantedMessage ? document.getElementById(`message-${wantedMessage}`) : null;
    if (target) {
      pin.hold(() => {
        target.scrollIntoView({ block: 'center' });
      });
      setFlashId(null);
      requestAnimationFrame(() => {
        setFlashId(wantedMessage);
      });
      return;
    }
    if (first) toBottom('auto');
  }, [
    loading,
    thread,
    messages,
    newestId,
    hasEarlier,
    seeking,
    reveal,
    toBottom,
    wantedMessage,
    wantedNavigation,
    pin,
  ]);

  // Afterwards, follow a new newest message only if the reader was already there.
  useEffect(() => {
    if (!opened.current || newestId === seen.current) return;
    seen.current = newestId;
    if (!newestId) return;
    const element = scroller.current;
    if (!element) return;
    // Held means the reader is at the bottom, whatever the arithmetic says now
    // that the new message has already made the list taller.
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (pin.holding() || shouldFollowScroll(distance)) toBottom('smooth');
    else setBehind(true);
  }, [newestId, toBottom, pin]);

  // Show earlier keeps what the reader was looking at where it was: the
  // distance from the bottom is put back once the earlier messages are drawn.
  const keepFromBottom = useRef<number | null>(null);
  const oldestId = messages[0]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new oldest message is why it runs.
  useLayoutEffect(() => {
    const element = scroller.current;
    const kept = keepFromBottom.current;
    if (!element || kept === null) return;
    keepFromBottom.current = null;
    element.scrollTop = element.scrollHeight - kept;
  }, [oldestId]);
  function showEarlier() {
    const element = scroller.current;
    if (element) keepFromBottom.current = element.scrollHeight - element.scrollTop;
    pin.release();
    void loadEarlier();
  }

  /**
   * Coming back down to the newest message takes the hold up again, without a jump. Only on the
   * way down: doing it on a small scroll up pulled the reader back (the owner, 2026-10-26).
   */
  const lastTop = useRef(0);
  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    const goingDown = element.scrollTop > lastTop.current;
    lastTop.current = element.scrollTop;
    if (pin.holding() || !goingDown) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (shouldFollowScroll(distance)) {
      pin.hold(snapToBottom, { now: false });
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

  /** Block, on somebody else's message while they are still a member. */
  const blockOffer = (message: ChatMessage) => {
    const author = message.authorId ? authors.get(message.authorId) : undefined;
    if (!author || author.id === account.userId || message.pending) return undefined;
    return () => {
      setBlocking({ id: author.id, name: author.displayName });
    };
  };

  /** Scroll the quoted message into view and light it up once. */
  function showQuoted(messageId: string) {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return;
    element.scrollIntoView({ block: 'center', behavior: motionReduced() ? 'auto' : 'smooth' });
    // Off and on again, so a second tap on the same quote lights it again.
    setFlashId(null);
    requestAnimationFrame(() => {
      setFlashId(messageId);
    });
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

  // Only when there is nothing to show: a later failed read keeps the
  // conversation and the message box, and says so below the header.
  if (!thread) {
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
              <h1
                ref={heading}
                tabIndex={-1}
                className="truncate font-extrabold font-head text-[1rem] text-ink outline-none"
              >
                {title}
              </h1>
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

      {stale ? (
        <p
          role="status"
          className="flex-none border-line border-b bg-tint px-4 py-1.5 text-center text-[0.78125rem] text-ink2 leading-[1.45]"
        >
          Could not refresh this conversation.{' '}
          <button
            type="button"
            onClick={reload}
            data-target="small"
            className="font-semibold text-emphasis underline"
          >
            Try again
          </button>
        </p>
      ) : null}

      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto overflow-x-hidden px-4 pt-3 pb-2 md:px-6"
      >
        <div
          ref={log}
          {...swipe.handlers}
          // Sideways drags are the date swipe's (swipe-dates.ts); scrolling stays the browser's.
          style={{
            touchAction: 'pan-y',
            transform: swipe.offset ? `translateX(-${swipe.offset}px)` : undefined,
          }}
          // Pushed to the bottom rather than stacked from the top: a
          // conversation with three messages in it belongs above the composer
          // where the next one will appear, not floating under the header with
          // a screen of nothing below it.
          className={`mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-end ${swipe.offset ? '' : 'transition-transform duration-200'}`}
          // The list of what has been said, announced as it grows. Polite, not
          // assertive: a message is not an alert and must not cut across
          // whatever the reader is in the middle of.
          role="log"
          aria-live="polite"
          aria-label={`Messages with ${title}`}
        >
          {hasEarlier ? (
            <div className="mb-2.5 flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={showEarlier}
                disabled={loadingEarlier}
                className="min-h-11 rounded-full border border-line px-4 font-bold text-[0.78125rem] text-emphasis disabled:opacity-50"
              >
                {loadingEarlier ? 'Loading…' : 'Show earlier messages'}
              </button>
              {earlierError ? (
                <p role="alert" className="text-[0.78125rem] text-destructive">
                  {earlierError}
                </p>
              ) : null}
            </div>
          ) : null}

          {removalFailure ? (
            <p
              role="alert"
              className="mb-2.5 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
            >
              {removalFailure}
            </p>
          ) : null}

          {shown.length === 0 ? (
            <p className="py-10 text-center text-[0.875rem] text-grey leading-relaxed">
              Nothing has been said yet.
              <br />
              Whatever you write here is between the two of you.
            </p>
          ) : (
            shown.map((message, index) => (
              <Fragment key={message.id}>
                {index === 0 ||
                !sameChatDay(shown[index - 1]?.createdAt ?? '', message.createdAt) ? (
                  <p className="mt-1 mb-3 text-center font-semibold text-[0.6875rem] text-grey">
                    {chatDayHeading(message.createdAt)}
                  </p>
                ) : null}
                <div className="relative">
                  {message.notice ? (
                    <NoticeLine
                      key={message.id}
                      message={message}
                      notice={message.notice}
                      who={
                        message.authorId === account.userId
                          ? 'You'
                          : ((message.authorId
                              ? authors.get(message.authorId)?.displayName
                              : null) ?? 'A deleted member')
                      }
                      addedYou={message.subjectId === account.userId}
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
                      reactions={
                        <ReactionBar
                          target={message.id}
                          what={
                            message.body ||
                            (message.sharedPostId ? 'this shared post' : 'this photograph')
                          }
                          quoted={Boolean(message.body)}
                          state={reactions}
                          readerId={account.userId}
                        />
                      }
                      author={message.authorId ? (authors.get(message.authorId) ?? null) : null}
                      mine={message.authorId === account.userId}
                      sharedPost={
                        shared.cards.get(message.id) ??
                        (shared.answered.has(message.id) ? null : undefined)
                      }
                      receipt={readReceipt(message, thread.kind, reads)}
                      quote={quoteOf(message)}
                      onQuoteTap={showQuoted}
                      flash={flashId === message.id}
                      // The author's own, standing, while there is a conversation
                      // to edit in. chat_edit_message decides; this only asks.
                      canEdit={!gone && message.authorId === account.userId && !message.pending}
                      editing={edited?.id === message.id}
                      onEdit={() => {
                        setEditingId(message.id);
                      }}
                      canReply={!gone && !message.pending}
                      onReply={() => {
                        setEditingId(null);
                        setReplyingTo(message);
                      }}
                      // Own messages only, even for an administrator: a thread they could reach as
                      // one would not be private. See 20260918100000.
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
                      onBlock={blockOffer(message)}
                    />
                  )}
                  {swipe.offset && !message.pending ? (
                    // Slides in at the right as the list slides left. The same
                    // as the time's tooltip and the day heading, so hidden from
                    // screen readers.
                    <SwipedDate
                      iso={message.createdAt}
                      opacity={swipe.offset / SWIPE_MAX}
                      // Level with the bubble: under the name on somebody else's.
                      below={
                        !message.notice && message.authorId !== account.userId ? 'name' : 'top'
                      }
                    />
                  ) : null}
                </div>
              </Fragment>
            ))
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
          mentions
          mentionScope={mentionScope}
          editing={
            edited
              ? {
                  id: edited.id,
                  initial: edited.body,
                  noun: 'message',
                  photos: edited.attachments.length,
                  shared: edited.sharedPostId !== null,
                  anchor: `message-${edited.id}`,
                  onSave: (body) => edit(edited.id, body),
                  onClose: () => {
                    setEditingId(null);
                  },
                }
              : null
          }
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

      {blocking ? (
        <BlockMemberSheet
          memberId={blocking.id}
          name={blocking.name}
          onCancel={() => {
            setBlocking(null);
          }}
          onBlocked={() => {
            // A direct conversation with them is hidden whole (20261022060000).
            if (thread.kind === 'direct' && thread.otherMemberId === blocking.id) {
              void navigate('/chat', { replace: true });
              return;
            }
            setBlockedHere((ids) => new Set(ids).add(blocking.id));
            if (replyingTo?.authorId === blocking.id) setReplyingTo(null);
            setBlocking(null);
            setBlockedCount((n) => n + 1);
            blocks.reload();
            reload();
          }}
        />
      ) : null}

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

/** A message's date and time, at the right edge while the list is swiped left. */
function SwipedDate({
  iso,
  opacity,
  below,
}: {
  iso: string;
  opacity: number;
  below: 'name' | 'top';
}) {
  const { date, time } = messageDateTime(iso);
  return (
    <span
      aria-hidden="true"
      data-testid="swiped-date"
      style={{ opacity, width: SWIPE_MAX - 8 }}
      className={`absolute left-full ml-2 text-right text-[0.625rem] text-grey leading-tight ${below === 'name' ? 'top-6' : 'top-2'}`}
    >
      <span className="block whitespace-nowrap">{date}</span>
      <span className="block whitespace-nowrap">{time}</span>
    </span>
  );
}
