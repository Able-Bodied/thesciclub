import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { joinRoom, roomsByCategory, useChatRooms, useRoomMembership } from '@/lib/chat/rooms';
import type { ChatRoom } from '@/lib/chat/types';
import { describeThrown } from '@/lib/describe-error';
import { RoomCategoryLabel } from '@/routes/chat/room-card';
import { backToHome } from '@/routes/home/back';

/**
 * Asking or sharing from Home: which kind, and which room.
 *
 * ---------------------------------------------------------------------------
 * A question lives in a room, so this only picks one
 * ---------------------------------------------------------------------------
 * The owner's decision (HOME-PLAN.md, 1 and 2): a question asked from Home is
 * a topic, and a photograph shared from Home is a topic whose first post has
 * one. So there is no form here. This screen asks the two things the mock's
 * compose sheet asked — the kind, and where it goes — and hands over to the
 * New topic screen, which is where a topic is written whoever starts it. The
 * mock's category chips become the open rooms: the room is the category.
 *
 * Nothing is chosen to begin with. A default would be one room quietly chosen
 * for somebody, and a topic filed in the wrong room is read by the wrong
 * people and cannot be moved.
 *
 * ---------------------------------------------------------------------------
 * One radio group, under the six headings
 * ---------------------------------------------------------------------------
 * The rooms are grouped as Chat groups them, in `ROOM_CATEGORIES` order. The
 * headings are for reading; the choice is one group of native radios sharing
 * a name, so the arrow keys move through every room and a screen reader says
 * "3 of 9" rather than starting again under each heading. Each radio is named
 * by the room's name alone, and "Joined" where it is true, with the
 * description as the longer account, so the list of names is quick to go
 * through and the description is there for whoever stops on one.
 *
 * ---------------------------------------------------------------------------
 * The join is awaited
 * ---------------------------------------------------------------------------
 * Writing in a room needs a membership row (`chat_can_post_in`), and the New
 * topic screen does not offer to join. So a room not yet joined is joined
 * here, by the button that says so, and the New topic screen opens only once
 * the join has landed: `joinRoom` rather than the optimistic toggle Chat uses.
 * A refusal stays on this screen and says why. An administrator may write in
 * any room without joining, so is never asked to.
 *
 * If the read of which rooms the viewer is in fails, every room offers to
 * join. That costs nothing: a join of a room already joined does nothing.
 *
 * ---------------------------------------------------------------------------
 * No open room is an ordinary day
 * ---------------------------------------------------------------------------
 * Rooms open a few at a time, and a member can start one. So an empty list is
 * a sentence and the link to start a room, not an apology and not a button
 * that goes nowhere.
 */

type Kind = 'ask' | 'share';

const KINDS: [Kind, string][] = [
  ['ask', 'Ask a question'],
  ['share', 'Share something'],
];

const WORDS: Record<Kind, { heading: string; line: string }> = {
  ask: {
    heading: 'Ask the club',
    line: 'Goes to every member. Answers come from people who have lived it.',
  },
  share: {
    heading: 'Share a photograph',
    line: 'A picture and a line about it. Most of what gets shared here is something you did, made or worked out.',
  },
};

const LINK_CLASS =
  'inline-flex min-h-[2.75rem] items-center font-semibold text-[0.875rem] text-navy underline decoration-line underline-offset-2 hover:decoration-navy';

export default function HomeNewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const isAdmin = account.status === 'member' && account.isAdmin;
  const rooms = useChatRooms();
  const membership = useRoomMembership();

  // In the URL, so a link can open either kind: /home/new?kind=share.
  const [searchParams, setSearchParams] = useSearchParams();
  const kind: Kind = searchParams.get('kind') === 'share' ? 'share' : 'ask';
  const [roomId, setRoomId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const back = backToHome(location.state) ?? '/home';
  // The pill on Home this was opened from, handed on so that the New topic
  // screen, and the topic after it, come back to it.
  const { segment } = (location.state ?? {}) as { segment?: unknown };

  // An administrator reads closed rooms too. Only a room a member can see is
  // somewhere to ask.
  const open = rooms.rooms.filter((room) => room.openedAt !== null);
  const chosen = open.find((room) => room.id === roomId) ?? null;
  const mustJoin = chosen !== null && !isAdmin && !membership.joined.has(chosen.id);

  function setKind(next: Kind) {
    // Replace, not push, as Home's pills do; and keep the state, which is the
    // way back to Home.
    setSearchParams(next === 'ask' ? {} : { kind: next }, {
      replace: true,
      state: location.state as unknown,
    });
  }

  function proceed(room: ChatRoom) {
    const to = `/chat/rooms/${room.id}/new`;
    const state = { from: 'home', segment, kind };
    if (!mustJoin) {
      void navigate(to, { state });
      return;
    }
    if (!memberId || joining) return;
    setJoining(true);
    setFailure(null);
    joinRoom(room.id, memberId)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        void navigate(to, { state });
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'You did not join the room.'));
      })
      .finally(() => {
        setJoining(false);
      });
  }

  const words = WORDS[kind];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <BackLink to={back} label="Home" />

        <h1 className="mt-1 font-extrabold font-head text-[1.25rem] text-ink tracking-[-0.01em]">
          {words.heading}
        </h1>
        <SegmentPills segments={KINDS} value={kind} onChange={setKind} className="flex-wrap" />
        <p className="text-[0.8125rem] text-ink2 leading-[1.45]">{words.line}</p>

        {rooms.loading || membership.loading ? (
          <p role="status" className="px-6 py-10 text-center text-[0.875rem] text-grey">
            Loading…
          </p>
        ) : rooms.error ? (
          <>
            <p
              role="alert"
              className="mt-4 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
            >
              {rooms.error}
            </p>
            <p className="mt-2">
              <Link to="/chat/rooms/new" className={LINK_CLASS}>
                Start a room
              </Link>
            </p>
          </>
        ) : open.length === 0 ? (
          <div className="mt-4 rounded-[13px] border border-line bg-paper px-4 py-4">
            <p className="text-[0.875rem] text-ink leading-[1.5]">
              No rooms are open yet. Start one — it begins with your first topic.
            </p>
            <p className="mt-1">
              <Link to="/chat/rooms/new" className={LINK_CLASS}>
                Start a room
              </Link>
            </p>
          </div>
        ) : (
          <>
            <RoomChoice
              rooms={open}
              joined={membership.joined}
              value={roomId}
              onChange={(next) => {
                setRoomId(next);
                setFailure(null);
              }}
            />

            <p className="mt-1 text-[0.8125rem] text-ink2">
              None of these fit?{' '}
              <Link to="/chat/rooms/new" className={LINK_CLASS}>
                Start a room
              </Link>
            </p>

            {failure ? (
              <p
                role="alert"
                className="mt-2 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
              >
                {failure}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!chosen || joining}
              onClick={() => {
                if (chosen) proceed(chosen);
              }}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold px-4 py-2 text-center font-bold font-head text-on-gold text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
            >
              {joining
                ? 'Joining…'
                : chosen && mustJoin
                  ? `Join ${chosen.name} and continue`
                  : 'Continue'}
            </button>
            {/* What the button waits for, or what pressing it does. A
                disabled control with no explanation is a dead end, and a join
                should not be a surprise. */}
            {!chosen ? (
              <p className="mt-1.5 text-center text-[0.75rem] text-grey">Choose a room.</p>
            ) : mustJoin ? (
              <p className="mt-1.5 text-center text-[0.75rem] text-grey leading-[1.45]">
                Joining is what lets you write in a room. You can leave at any time.
              </p>
            ) : null}
          </>
        )}
        <div className="h-3" />
      </div>
    </div>
  );
}

function RoomChoice({
  rooms,
  joined,
  value,
  onChange,
}: {
  rooms: ChatRoom[];
  joined: Set<string>;
  value: string | null;
  onChange: (roomId: string) => void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="font-extrabold font-head text-[0.9375rem] text-ink">
        Which room does it go in?
      </legend>
      {roomsByCategory(rooms).map(([category, inCategory]) => (
        <div key={category}>
          <RoomCategoryLabel category={category} />
          <ul>
            {inCategory.map((room) => {
              const id = `room-${room.id}`;
              const isJoined = joined.has(room.id);
              return (
                <li key={room.id} className="mb-2">
                  {/* The whole card is the target; the radio inside it is
                      what is announced. */}
                  <label
                    htmlFor={id}
                    className="flex min-h-[2.75rem] cursor-pointer items-start gap-3 rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 has-[:checked]:border-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-navy has-[:focus-visible]:outline-offset-2"
                  >
                    <input
                      id={id}
                      type="radio"
                      name="room"
                      value={room.id}
                      checked={value === room.id}
                      onChange={() => {
                        onChange(room.id);
                      }}
                      aria-labelledby={`${id}-name${isJoined ? ` ${id}-joined` : ''}`}
                      aria-describedby={`${id}-description`}
                      className="mt-[0.2em] h-[1.1em] w-[1.1em] flex-none accent-navy outline-none"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-[7px] gap-y-1">
                        <span
                          id={`${id}-name`}
                          className="font-extrabold font-head text-[0.9375rem] text-ink"
                        >
                          {room.name}
                        </span>
                        {isJoined ? (
                          <span
                            id={`${id}-joined`}
                            className="whitespace-nowrap rounded-full bg-gold px-2 py-[2px] font-semibold text-on-gold text-[0.6875rem]"
                          >
                            Joined
                          </span>
                        ) : null}
                      </span>
                      <span
                        id={`${id}-description`}
                        className="mt-[3px] block text-[0.78125rem] text-ink2 leading-[1.45]"
                      >
                        {room.description}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}
