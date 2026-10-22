import { useState } from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { useAnnounce } from '@/lib/announce';
import { unblockMember, useMyBlocks } from '@/lib/blocks';
import { useChatAuthors } from '@/lib/chat/authors';

/**
 * Me → Settings → Blocked members: the way back to somebody hidden everywhere
 * else. One line each, with Unblock. Not per device, unlike the rest of the tab.
 */
export function BlockedMembers() {
  const { blocked, loading, error, reload } = useMyBlocks();
  const authors = useChatAuthors(blocked.map((b) => b.memberId));
  const announce = useAnnounce();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  function unblock(memberId: string, name: string) {
    if (busyId) return;
    setBusyId(memberId);
    setFailure(null);
    void unblockMember(memberId).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      announce(`Unblocked ${name}.`);
      reload();
    });
  }

  return (
    <section aria-labelledby="blocked-members-heading" className="mt-6">
      <h2
        id="blocked-members-heading"
        className="mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Blocked members
      </h2>
      <div className="rounded-[17px] border border-line bg-paper p-3.5">
        <p className="text-[0.875rem] text-ink2 leading-[1.45]">
          These follow your account, wherever you sign in. You don't see what they post or send, and
          neither of you can message the other. They are not told.
        </p>
        {loading ? (
          <p role="status" className="mt-3 text-[0.875rem] text-grey">
            Loading…
          </p>
        ) : error ? (
          <p className="mt-3 text-[0.875rem] text-destructive leading-[1.45]">{error}</p>
        ) : blocked.length === 0 ? (
          <p className="mt-3 text-[0.875rem] text-grey leading-[1.45]">
            You haven't blocked anybody. To block a member, open their profile and press •••.
          </p>
        ) : (
          <ul className="mt-2">
            {blocked.map(({ memberId }) => {
              const author = authors.get(memberId);
              const name = author?.displayName ?? 'A member';
              return (
                <li
                  key={memberId}
                  className="flex flex-wrap items-center gap-3 border-line border-t py-2.5 first:border-t-0"
                >
                  <MemberAvatar
                    id={memberId}
                    displayName={name}
                    photoPath={author?.photoPath}
                    photoAlt={author?.photoAlt}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[0.9375rem] text-ink">{name}</span>
                    {author?.username ? (
                      <span className="block text-[0.8125rem] text-grey">@{author.username}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    aria-label={`Unblock ${name}`}
                    onClick={() => {
                      unblock(memberId, name);
                    }}
                    className="min-h-[44px] rounded-[11px] border-[1.6px] border-emphasis px-4 font-bold font-head text-[0.875rem] text-emphasis transition-colors hover:bg-tint disabled:opacity-50"
                  >
                    {busyId === memberId ? 'Unblocking…' : 'Unblock'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {failure ? (
          <p role="alert" className="mt-2 text-[0.875rem] text-destructive leading-[1.45]">
            {failure}
          </p>
        ) : null}
      </div>
    </section>
  );
}
