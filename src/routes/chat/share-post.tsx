import { Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { GroupAvatar, MemberAvatar } from '@/components/member-avatar';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { useChatAuthors } from '@/lib/chat/authors';
import { type ShareTarget, sharePost } from '@/lib/chat/shared-posts';
import { threadTitle, useMyThreads } from '@/lib/chat/threads';
import { useDialogFocus } from '@/lib/dialog-focus';
import { markdownToPlain } from '@/lib/markdown';
import { useBrowseMembers } from '@/lib/members';
import { excerpt } from '@/routes/chat/reaction-bar';

/**
 * Share a post into a conversation (the owner, 2026-10-25): "Add the options
 * to share posts in group chats and DMs."
 *
 * A visible button beside React and Reply, as every action on a post is: no
 * long press. It opens a sheet of the member's conversations, newest first,
 * and "Someone else" for a member they have no conversation with yet. A line
 * of their own is optional. What arrives is a message carrying a card of the
 * post, which each reader sees only if they may read the post themselves
 * (shared-posts.ts).
 *
 * The destinations are radio buttons, one group across both lists, with the
 * whole row as the label, so a switch or a head pointer gets the platform's
 * own control and a large target. The lists scroll in a box measured in `em`,
 * so Send stays near at a large text size.
 */
export function SharePostButton({ postId, words }: { postId: string; words: string }) {
  const [open, setOpen] = useState(false);
  const what = `“${excerpt(markdownToPlain(words))}”`;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Share ${what} in a conversation`}
        onClick={() => {
          setOpen(true);
        }}
        className="relative inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.6875rem] text-grey hover:bg-tint"
      >
        <Send aria-hidden="true" className="h-3 w-3" />
        Share
      </button>
      {open
        ? createPortal(
            <SharePostSheet
              postId={postId}
              what={what}
              onClose={() => {
                setOpen(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/** The value of a destination's radio button. */
function targetKey(target: ShareTarget): string {
  return 'threadId' in target ? `thread:${target.threadId}` : `member:${target.memberId}`;
}

function SharePostSheet({
  postId,
  what,
  onClose,
}: {
  postId: string;
  what: string;
  onClose: () => void;
}) {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const announce = useAnnounce();
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  useDialogFocus(dialog, heading, onClose);

  const threads = useMyThreads();
  // A direct conversation whose other member has left has nobody to send to.
  const offered = threads.threads.filter((t) => t.kind === 'group' || t.otherMemberId !== null);
  const authors = useChatAuthors(offered.map((t) => t.otherMemberId));
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<{ value: ShareTarget; name: string } | null>(null);
  const [line, setLine] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<{ threadId: string; name: string } | null>(null);

  useEffect(() => {
    if (sent) confirmation.current?.focus();
  }, [sent]);

  const chosen = target ? targetKey(target.value) : null;

  function send() {
    if (!target || !memberId || sending) return;
    setSending(true);
    setFailure(null);
    const to = target;
    void sharePost(postId, to.value, memberId, line)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        setSent({ threadId: result.threadId, name: to.name });
        announce(`Shared with ${to.name}.`);
      })
      .finally(() => {
        setSending(false);
      });
  }

  const row =
    'flex min-h-[56px] w-full cursor-pointer items-center gap-3 border-line border-b py-2 last:border-b-0';

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close share"
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-black/40"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-post-heading"
        className="fixed inset-x-0 bottom-0 z-[81] max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-paper px-5 pt-4 pb-6 text-ink shadow-xl md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 pt-2">
            <h2
              id="share-post-heading"
              ref={heading}
              tabIndex={-1}
              className="font-bold font-head text-lg outline-none"
            >
              Share post
            </h2>
            <p className="mt-0.5 text-[0.875rem] text-grey leading-snug [overflow-wrap:anywhere]">
              {what}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 flex-none place-items-center rounded-full text-grey hover:bg-tint"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {sent ? (
          <div className="mt-4">
            <p
              ref={confirmation}
              tabIndex={-1}
              className="font-semibold text-[0.9375rem] text-ink leading-[1.45] outline-none"
            >
              Shared with {sent.name}.
            </p>
            <Link
              to={`/chat/t/${sent.threadId}`}
              onClick={onClose}
              className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-action px-4 font-bold text-[0.9375rem] text-white"
            >
              Go to the conversation
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 min-h-12 w-full rounded-xl border border-line font-semibold"
            >
              Done
            </button>
          </div>
        ) : (
          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <fieldset>
              <legend className="font-bold font-head text-[0.875rem] text-ink">Send to</legend>
              <p className="mt-0.5 text-[0.78125rem] text-grey leading-[1.45]">
                Only members who can read the post will see it.
              </p>
              {threads.loading ? (
                <p role="status" className="py-4 text-[0.875rem] text-grey">
                  Loading your conversations…
                </p>
              ) : threads.error ? (
                <p className="py-4 text-[0.875rem] text-ink2">{threads.error}</p>
              ) : offered.length === 0 ? (
                <p className="py-4 text-[0.875rem] text-grey">
                  No conversations yet. Choose someone below.
                </p>
              ) : (
                <div className="mt-2 max-h-[16em] overflow-y-auto rounded-[14px] border border-line px-3.5">
                  {offered.map((thread) => {
                    const other = thread.otherMemberId
                      ? (authors.get(thread.otherMemberId) ?? null)
                      : null;
                    const name = threadTitle(thread, other?.displayName ?? null) || '…';
                    const value: ShareTarget = { threadId: thread.id };
                    return (
                      <label key={thread.id} className={row}>
                        <input
                          type="radio"
                          name="share-to"
                          value={targetKey(value)}
                          checked={chosen === targetKey(value)}
                          onChange={() => {
                            setTarget({ value, name });
                          }}
                          className="h-[22px] w-[22px] flex-none accent-emphasis"
                        />
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
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-extrabold font-head text-[0.90625rem] text-ink [overflow-wrap:anywhere]">
                            {name}
                          </span>
                          <span className="block text-[0.71875rem] text-grey">
                            {thread.kind === 'group'
                              ? `Group · ${thread.memberCount} ${thread.memberCount === 1 ? 'member' : 'members'}`
                              : 'Direct message'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                aria-expanded={picking}
                aria-controls="share-post-members"
                onClick={() => {
                  setPicking((on) => !on);
                }}
                className="mt-2 inline-flex min-h-11 items-center font-semibold text-[0.875rem] text-emphasis underline underline-offset-2"
              >
                {picking ? 'Hide the members' : 'Someone else'}
              </button>
              <div id="share-post-members" hidden={!picking}>
                {picking ? (
                  <MemberChoices
                    viewerId={memberId}
                    chosen={chosen}
                    onChoose={(id, name) => {
                      setTarget({ value: { memberId: id }, name });
                    }}
                  />
                ) : null}
              </div>
            </fieldset>

            <label
              htmlFor="share-post-line"
              className="mt-4 block font-bold font-head text-[0.875rem] text-ink"
            >
              Add a message <span className="font-normal text-grey">(optional)</span>
            </label>
            <textarea
              id="share-post-line"
              rows={2}
              maxLength={4000}
              value={line}
              onChange={(event) => {
                setLine(event.target.value);
              }}
              className="mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[1rem] text-ink leading-[1.5] outline-none focus:border-emphasis"
            />

            {failure ? (
              <p
                role="alert"
                className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
              >
                {failure}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!target || sending}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-action px-4 font-bold text-[0.9375rem] text-white disabled:opacity-40"
            >
              {sending ? 'Sending…' : target ? `Send to ${target.name}` : 'Send'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}

/**
 * Members to start a direct conversation with: the people Peers shows, as
 * New message offers them, narrowed by name on the client.
 */
function MemberChoices({
  viewerId,
  chosen,
  onChoose,
}: {
  viewerId: string | null;
  chosen: string | null;
  onChoose: (memberId: string, name: string) => void;
}) {
  const { members, loading, error } = useBrowseMembers();
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return members
      .filter((member) => member.id !== viewerId)
      .filter(
        (member) =>
          needle === '' ||
          member.displayName.toLowerCase().includes(needle) ||
          (member.username ?? '').includes(needle.replace(/^@/, '')),
      );
  }, [members, viewerId, filter]);

  if (loading) {
    return (
      <p role="status" className="py-4 text-[0.875rem] text-grey">
        Loading the members…
      </p>
    );
  }
  if (error) return <p className="py-4 text-[0.875rem] text-ink2">{error}</p>;

  return (
    <>
      <label
        htmlFor="share-post-filter"
        className="mt-2 block font-semibold text-[0.8125rem] text-ink"
      >
        Narrow the list by name
      </label>
      <input
        id="share-post-filter"
        type="text"
        autoComplete="off"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
        className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[1rem] text-ink outline-none focus:border-emphasis"
      />
      {shown.length === 0 ? (
        <p className="py-4 text-[0.875rem] text-grey">
          {filter.trim() === ''
            ? 'Nobody else is in the club yet.'
            : `Nobody here is called “${filter.trim()}”.`}
        </p>
      ) : (
        <div className="mt-2 max-h-[16em] overflow-y-auto rounded-[14px] border border-line px-3.5">
          {shown.map((member) => {
            const value = `member:${member.id}`;
            return (
              <label
                key={member.id}
                className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 border-line border-b py-2 last:border-b-0"
              >
                <input
                  type="radio"
                  name="share-to"
                  value={value}
                  checked={chosen === value}
                  onChange={() => {
                    onChoose(member.id, member.displayName);
                  }}
                  className="h-[22px] w-[22px] flex-none accent-emphasis"
                />
                <span aria-hidden="true" className="flex-none">
                  <MemberAvatar
                    id={member.id}
                    displayName={member.displayName}
                    photoPath={member.photoPath}
                    photoAlt={member.photoAlt}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold font-head text-[0.90625rem] text-ink [overflow-wrap:anywhere]">
                    {member.displayName}
                  </span>
                  <span className="block text-[0.71875rem] text-grey">
                    {member.username ? `@${member.username}` : 'Member'}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}
