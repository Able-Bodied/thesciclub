import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinEventGroup } from '@/lib/chat/groups';
import { useMyThreads } from '@/lib/chat/threads';

/**
 * The group chat for one event, on the event's own page.
 *
 * ---------------------------------------------------------------------------
 * It has to know whether the member is already in it
 * ---------------------------------------------------------------------------
 * Which is why it reads `chat_my_threads()` — one call, and the thread carries
 * its `event_id`. Three of the five things this card can say depend on the
 * answer, and the important one is the past event: somebody who was in the
 * group keeps reading it forever, and somebody who was not cannot join it any
 * more. Offering them a button that the database is going to refuse is the
 * thing this codebase calls a control that gets demoed, believed and then
 * explained.
 *
 * It is a component of its own so that the read happens only for a signed-in
 * member. An event page is public — CONTEXT.md, events are the shopfront — and
 * a hook cannot be called conditionally, so the condition is which component
 * gets rendered.
 *
 * ---------------------------------------------------------------------------
 * Un-RSVPing does not take somebody out
 * ---------------------------------------------------------------------------
 * `chat_join_event_group` is lazy and there is no trigger across RSVP and
 * chat — see 20260918140000. So the card says so where somebody might be about
 * to change their mind, rather than letting them find out by still being in a
 * conversation about a day they are no longer going to.
 */
export function EventGroupCard({
  eventId,
  going,
  past,
}: {
  eventId: string;
  going: boolean;
  past: boolean;
}) {
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
        setFailure(e instanceof Error ? e.message : 'That did not work.');
        setOpening(false);
      });
  }

  // Nothing at all while the list is on its way, rather than a button that
  // changes its mind a moment later. This card sits under a description
  // somebody is reading.
  if (loading) return null;

  // A past event nobody joined has no group and will not get one. Say nothing:
  // there is no action and no fact worth the space.
  if (!existing && past && !going) return null;

  if (!existing && !going) {
    return (
      <p className="mt-3.5 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[#5C4409] text-[0.7875rem] leading-[1.5]">
        Going? There is a group chat for everyone who is.
      </p>
    );
  }

  if (!existing && past) {
    return (
      <p className="mt-3.5 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[#5C4409] text-[0.7875rem] leading-[1.5]">
        This event is over. Its group chat stays open to whoever was already in it.
      </p>
    );
  }

  return (
    <div className="mt-3.5">
      <button
        type="button"
        onClick={open}
        disabled={opening}
        className="flex min-h-[44px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-navy font-bold font-head text-[0.9375rem] text-navy transition-colors hover:bg-tint disabled:opacity-40"
      >
        {opening ? 'Opening…' : existing ? 'Open group chat' : 'Join the group chat'}
      </button>
      <p className="mt-1.5 text-[0.7875rem] text-grey leading-[1.45]">
        {existing
          ? 'Everyone going to this can read it. Changing your mind about the event does not take you out of it — leave from the group itself.'
          : 'Everyone going to this can read it, including what was said before you joined. You can leave it at any time.'}
      </p>
      {failure ? (
        <p className="mt-2 rounded-xl bg-[#FBE9E7] px-3.5 py-2.5 text-[#8C1D18] text-[0.7875rem]">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
