import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinEventGroup } from '@/lib/chat/groups';
import { useMyThreads } from '@/lib/chat/threads';
import { describeThrown } from '@/lib/describe-error';

/**
 * The group chat for one event, on the event's own page.
 *
 * ---------------------------------------------------------------------------
 * It has to know whether the member is already in it
 * ---------------------------------------------------------------------------
 * Which is why it reads `chat_my_threads()` — one call, and the thread carries
 * its `event_id`: Open for somebody already in it, Join for anybody else.
 *
 * It is a component of its own so that the read happens only for a signed-in
 * member. An event page is public — CONTEXT.md, events are the shopfront — and
 * a hook cannot be called conditionally, so the condition is which component
 * gets rendered.
 *
 * ---------------------------------------------------------------------------
 * Any member may join
 * ---------------------------------------------------------------------------
 * Not only those going, and at any time, before the event or after it (the
 * owner, 2026-10-22; 20261022210000): somebody deciding whether to go, or
 * who missed it, is who most wants to ask. Since 2026-10-30 that includes
 * whoever a followers or groups event leaves out (20261030000000), so a
 * member who cannot see the event is offered it too (OutsideTheAudience).
 * The chat is made the first time
 * anybody opens it (`chat_join_event_group`); leaving is from the group.
 */
export function EventGroupCard({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const { threads, loading } = useMyThreads();
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const existing = threads.find((thread) => thread.eventId === eventId) ?? null;

  function open() {
    if (opening) return;
    setOpening(true);
    setFailure(null);
    void joinEventGroup(eventId)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          setOpening(false);
          return;
        }
        void navigate(`/chat/t/${result.value}`);
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'That did not work.'));
        setOpening(false);
      });
  }

  // Nothing at all while the list is on its way, rather than a button that
  // changes its mind a moment later. This card sits under a description
  // somebody is reading.
  if (loading) return null;

  return (
    <div className="mt-3.5">
      <button
        type="button"
        onClick={open}
        disabled={opening}
        className="flex min-h-[44px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-tint disabled:opacity-40"
      >
        {opening ? 'Opening…' : existing ? 'Open group chat' : 'Join the group chat'}
      </button>
      <p className="mt-1.5 text-[0.7875rem] text-grey leading-[1.45]">
        {existing
          ? 'Any member can join it, before the event or after. Leave from the group itself.'
          : 'For any member, going or not, before the event or after. You read what was said before you joined, and can leave at any time.'}
      </p>
      {failure ? (
        <p className="mt-2 rounded-xl bg-danger-lt px-3.5 py-2.5 text-danger-ink text-[0.7875rem]">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
