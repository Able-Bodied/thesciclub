import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { useAccount } from '@/lib/account';
import { useChatAuthors } from '@/lib/chat/authors';
import { addToGroup, leaveGroup, useThreadRoster } from '@/lib/chat/groups';
import { useMyThreads } from '@/lib/chat/threads';
import { describeThrown } from '@/lib/describe-error';
import { MemberPicker } from '@/routes/chat/member-picker';

/**
 * Who is in a group, how somebody else gets in, and how you get out.
 *
 * A screen of its own rather than a panel on the conversation, because all
 * three of those are things somebody does once and none of them belongs beside
 * a composer. The header of the thread links here by its "N members" line.
 *
 * ---------------------------------------------------------------------------
 * There is no removing anybody but yourself
 * ---------------------------------------------------------------------------
 * The delete policy is own-row-only and there is no function that evicts. A
 * group has no owner: anybody in it can bring somebody in, anybody can leave,
 * and nobody can put somebody else out. Deciding who may throw whom out of a
 * conversation is a moderation question this build does not answer, and a
 * control that half-answers it is worse than the absence.
 *
 * ---------------------------------------------------------------------------
 * An event's group takes no members by hand
 * ---------------------------------------------------------------------------
 * Its roster is the people who said they are going, and each of them joins it
 * from the event. `chat_add_to_group` refuses a thread with an `event_id`, so
 * the picker is not drawn and the reason is printed where it would have been.
 *
 * ---------------------------------------------------------------------------
 * Leaving asks twice
 * ---------------------------------------------------------------------------
 * Not a browser `confirm()` — a modal that cannot be styled, cannot be read
 * properly by a screen reader in every browser, and appears somewhere nobody
 * was looking. The button turns into its own confirmation in place, and says
 * what leaving actually costs: the conversation stops being readable, including
 * the part of it that happened while they were in it.
 */
export default function GroupMembersPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const account = useAccount();
  const viewerId = account.status === 'member' ? account.userId : null;

  // The list, not the conversation: this screen has no use for the messages,
  // and chat_my_threads is the one round trip that carries the name and kind.
  const { threads, loading: threadsLoading } = useMyThreads();
  const thread = threads.find((candidate) => candidate.id === threadId) ?? null;
  const {
    memberIds,
    loading: rosterLoading,
    error: rosterError,
    reload,
  } = useThreadRoster(threadId);
  const authors = useChatAuthors(memberIds);

  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function toggle(memberId: string) {
    setPicked((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  }

  function add() {
    if (!threadId || picked.length === 0 || adding) return;
    setAdding(true);
    setFailure(null);
    // One call each, in order, and the first refusal stops the rest. Adding
    // four people where the second cannot be added should not leave somebody
    // guessing which two of them arrived — the roster below is refetched and
    // says.
    void (async () => {
      for (const memberId of picked) {
        const result = await addToGroup(threadId, memberId);
        if (!result.ok) {
          setFailure(result.error);
          break;
        }
      }
      setPicked([]);
      reload();
      setAdding(false);
    })();
  }

  function leave() {
    if (!threadId || !viewerId || leaving) return;
    setLeaving(true);
    setFailure(null);
    void leaveGroup(threadId, viewerId)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          setLeaving(false);
          return;
        }
        // Back to the list, replacing both this screen and the conversation:
        // the browser's back button must not land on a thread that no longer
        // loads for them.
        void navigate('/chat', { replace: true });
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'That did not work.'));
        setLeaving(false);
      });
  }

  if (threadsLoading || rosterLoading) {
    return <p className="px-6 py-10 text-center text-[0.875rem] text-grey">Loading…</p>;
  }

  if (thread?.kind !== 'group') {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to="/chat" label="Chat" />
          <p className="mt-6 text-[0.875rem] text-ink2 leading-relaxed">
            {thread
              ? 'A conversation between two people has no members to manage.'
              : 'This group cannot be shown.'}
          </p>
        </div>
      </div>
    );
  }

  const inIt = new Set(memberIds);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <BackLink to={`/chat/t/${thread.id}`} label={thread.name ?? 'Group'} />

        <h1 className="mt-1 font-extrabold font-head text-[1.25rem] text-ink tracking-[-0.02em]">
          {memberIds.length} {memberIds.length === 1 ? 'member' : 'members'}
        </h1>
        <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
          Everybody here can read the whole conversation, including what was said before they
          arrived.
        </p>

        {failure ? (
          <p className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
            {failure}
          </p>
        ) : null}
        {rosterError ? (
          <p className="mt-3 text-[0.78125rem] text-grey leading-relaxed">{rosterError}</p>
        ) : null}

        <div className="mt-3 rounded-[14px] border border-line bg-paper px-3.5">
          {memberIds.map((memberId) => {
            const author = authors.get(memberId) ?? null;
            return (
              <div
                key={memberId}
                className="flex min-h-[56px] items-center gap-3 border-line border-b py-2.5 last:border-b-0"
              >
                {/* Decorative: the name is beside it, and the name is the
                    link. A link whose only content is two initials has no
                    name — a screen reader reaches it and says "link, N". */}
                <span aria-hidden="true" className="flex-none">
                  {author ? (
                    <MemberAvatar
                      id={author.id}
                      displayName={author.displayName}
                      photoPath={author.photoPath}
                      photoAlt={author.photoAlt}
                    />
                  ) : (
                    <FormerMemberAvatar />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
                    {author?.hasProfile ? (
                      <Link to={`/peers/${author.id}`} className="text-navy">
                        {author.displayName}
                      </Link>
                    ) : (
                      (author?.displayName ?? 'Former member')
                    )}
                    {memberId === viewerId ? (
                      <span className="font-normal text-grey"> — you</span>
                    ) : null}
                  </span>
                  <span className="block text-[0.71875rem] text-grey">{author?.level ?? ''}</span>
                </span>
              </div>
            );
          })}
        </div>

        {thread.eventId ? (
          <p className="mt-4 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[#5C4409] text-[0.7875rem] leading-[1.5]">
            This is the group chat for an event. Everybody going to it can join from the event, so
            nobody is added by hand here.
          </p>
        ) : (
          <>
            <MemberPicker
              picked={picked}
              onToggle={toggle}
              exclude={inIt}
              label="Add somebody"
              emptyNote="Everybody in the club is already in this group."
            />
            {picked.length > 0 ? (
              <button
                type="button"
                onClick={add}
                disabled={adding}
                className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
              >
                {adding
                  ? 'Adding…'
                  : `Add ${picked.length} ${picked.length === 1 ? 'member' : 'members'}`}
              </button>
            ) : null}
          </>
        )}

        <h2 className="mt-6 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
          Leaving
        </h2>
        {confirmingLeave ? (
          <>
            <p className="mt-1.5 text-[0.78125rem] text-ink2 leading-[1.45]">
              You will stop being able to read this conversation, including the part of it that
              happened while you were in it. What you wrote stays, and anybody still in the group
              can bring you back.
            </p>
            <div className="mt-2.5 flex gap-2.5">
              <button
                type="button"
                onClick={leave}
                disabled={leaving}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[13px] border-[1.6px] border-destructive font-bold font-head text-[0.9375rem] text-destructive disabled:opacity-40"
              >
                {leaving ? 'Leaving…' : 'Leave the group'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingLeave(false);
                }}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[13px] border-[1.6px] border-line font-bold font-head text-[0.9375rem] text-ink"
              >
                Stay in it
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmingLeave(true);
            }}
            className="mt-1.5 flex min-h-[44px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-line font-bold font-head text-[0.9375rem] text-ink"
          >
            Leave this group
          </button>
        )}
        <div className="h-3" />
      </div>
    </div>
  );
}
