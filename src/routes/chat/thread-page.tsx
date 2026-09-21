import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { FormerMemberAvatar, GroupAvatar, MemberAvatar } from '@/components/member-avatar';
import { useAccount } from '@/lib/account';
import { useChatAuthors } from '@/lib/chat/authors';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { shouldFollowScroll, threadTitle, useThreadMessages } from '@/lib/chat/threads';
import { Composer } from '@/routes/chat/composer';
import { MessageBubble } from '@/routes/chat/message-bubble';

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
 */
export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const account = useAccount();
  const { thread, messages, loading, error, reload, send, remove } = useThreadMessages(threadId);

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

  const authors = useChatAuthors([
    thread?.otherMemberId ?? null,
    ...messages.map((message) => message.authorId),
  ]);
  const other = thread?.otherMemberId ? (authors.get(thread.otherMemberId) ?? null) : null;
  const title = thread ? threadTitle(thread, other?.displayName ?? null) : '';
  // A direct thread keeps its composer; one whose other half has gone does not.
  const gone = thread?.kind === 'direct' && thread.otherMemberId === null;

  const scroller = useRef<HTMLDivElement | null>(null);
  const opened = useRef(false);
  const seen = useRef(0);

  const toBottom = useCallback((behaviour: ScrollBehavior) => {
    const element = scroller.current;
    if (!element) return;
    // Two ways down, because `scrollTo` on an element is not everywhere — jsdom
    // has no implementation of it at all, and a screen whose tests cannot render
    // it is a screen with no tests. Setting scrollTop is what both understand;
    // scrollTo is only there for the smooth one.
    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: element.scrollHeight, behavior: behaviour });
    } else {
      element.scrollTop = element.scrollHeight;
    }
    setBehind(false);
  }, []);

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
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (shouldFollowScroll(distance)) toBottom('smooth');
    else setBehind(true);
  }, [messages.length, toBottom]);

  function removeMessage(messageId: string) {
    setRemovingId(messageId);
    setRemovalFailure(null);
    void remove(messageId)
      .then((problem) => {
        if (problem) setRemovalFailure(problem);
      })
      .catch((e: unknown) => {
        setRemovalFailure(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setRemovingId(null);
      });
  }

  if (loading) {
    return <p className="px-6 py-10 text-center text-[0.875rem] text-grey">Loading…</p>;
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
                <GroupAvatar />
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
                  className="block truncate text-[0.78125rem] text-navy underline"
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
                className="flex-none rounded-full border border-line px-3 py-1.5 font-bold text-[0.75rem] text-navy"
              >
                Profile
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div ref={scroller} className="relative flex-1 overflow-y-auto px-4 pt-3 pb-2 md:px-6">
        <div
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
            <p className="mb-2.5 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
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
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                author={message.authorId ? (authors.get(message.authorId) ?? null) : null}
                mine={message.authorId === account.userId}
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
              />
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
            className="-translate-y-2 pointer-events-auto min-h-[36px] rounded-full bg-navy px-4 font-bold text-[0.78125rem] text-white shadow-[0_6px_16px_rgba(10,20,35,.22)]"
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
        </div>
      ) : (
        <Composer
          placeholder={title ? `Message ${title}` : 'Message'}
          sendLabel="Send this message"
          // Enter sends here — see the header.
          sendOnEnter
          onSend={send}
        />
      )}
    </div>
  );
}
