import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { MemberAvatar } from '@/components/member-avatar';
import { useAccount } from '@/lib/account';
import { openDirect } from '@/lib/chat/threads';
import { describeThrown } from '@/lib/describe-error';
import { useBrowseMembers } from '@/lib/members';

/**
 * Starting a conversation from Chat (the owner, 2026-10-10): until now the only
 * way to message somebody was the Message button on their profile.
 *
 * One tap on a person opens the conversation with them, made if it is not
 * there yet (`chat_open_direct` returns the existing one otherwise, so a
 * double tap is harmless). The people are the ones a member can find in Peers;
 * somebody who has hidden themselves is not offered, as there.
 *
 * Each row is a button, the whole row its target, named by the person.
 */
export default function NewMessagePage() {
  const navigate = useNavigate();
  const account = useAccount();
  const viewerId = account.status === 'member' ? account.userId : null;
  const { members, loading, error } = useBrowseMembers();
  const [filter, setFilter] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const offered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return members
      .filter((member) => member.id !== viewerId)
      .filter((member) => needle === '' || member.displayName.toLowerCase().includes(needle));
  }, [members, viewerId, filter]);

  function open(memberId: string) {
    if (opening) return;
    setOpening(memberId);
    setFailure(null);
    openDirect(memberId)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        void navigate(`/chat/t/${result.value}`, { replace: true });
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'The conversation was not opened.'));
      })
      .finally(() => {
        setOpening(null);
      });
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <BackLink to="/chat" label="Chat" />
        <h1 className="mt-1 font-extrabold font-head text-[1.25rem] text-ink tracking-[-0.01em]">
          New message
        </h1>
        <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.45]">
          Choose who to write to. Only the two of you can read it.{' '}
          <Link
            to="/chat/new-group"
            className="font-semibold text-emphasis underline underline-offset-2"
          >
            Start a group instead
          </Link>
        </p>

        {failure ? (
          <p
            role="alert"
            className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
          >
            {failure}
          </p>
        ) : null}

        <label
          htmlFor="message-filter"
          className="mt-4 block font-bold font-head text-[0.8125rem] text-ink"
        >
          To
        </label>
        <input
          id="message-filter"
          type="text"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
          }}
          placeholder="Type a name"
          autoComplete="off"
          className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[1rem] text-ink outline-none focus:border-emphasis"
        />

        {loading ? (
          <p role="status" className="py-8 text-center text-[0.875rem] text-grey">
            Loading the members…
          </p>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-[0.875rem] text-ink2 leading-relaxed">Could not load the members.</p>
            <p className="mt-2 text-[0.78125rem] text-grey leading-relaxed">{error}</p>
          </div>
        ) : offered.length === 0 ? (
          <p className="py-8 text-center text-[0.875rem] text-grey leading-relaxed">
            {filter.trim() === ''
              ? 'Nobody else is in the club yet.'
              : `Nobody here is called “${filter.trim()}”.`}
          </p>
        ) : (
          <ul className="mt-2.5 overflow-hidden rounded-[14px] border border-line bg-paper">
            {offered.map((member) => {
              const level = member.exactLevel ?? member.levelRange;
              return (
                <li key={member.id} className="border-line border-b last:border-b-0">
                  <button
                    type="button"
                    disabled={opening !== null}
                    onClick={() => {
                      open(member.id);
                    }}
                    aria-label={`Message ${member.displayName}`}
                    className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-tint disabled:opacity-60"
                  >
                    <span aria-hidden="true" className="flex-none">
                      <MemberAvatar
                        id={member.id}
                        displayName={member.displayName}
                        photoPath={member.photoPath}
                        photoAlt={member.photoAlt}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
                        {member.displayName}
                      </span>
                      <span className="block text-[0.75rem] text-grey">
                        {opening === member.id
                          ? 'Opening…'
                          : [level, member.city].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
