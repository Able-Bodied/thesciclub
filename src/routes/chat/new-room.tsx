import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import {
  createRoom,
  ROOM_DESCRIPTION_MAX,
  ROOM_NAME_MAX,
  roomNamed,
  roomProblem,
  roomsMatching,
  roomToFill,
  useChatRooms,
  useRoomStats,
} from '@/lib/chat/rooms';
import { type ChatRoom, ROOM_CATEGORIES, type RoomCategory } from '@/lib/chat/types';

/**
 * Starting a room: five fields, and the reason the last two are there.
 *
 * ---------------------------------------------------------------------------
 * A room cannot be born empty
 * ---------------------------------------------------------------------------
 * CONTEXT.md's objection to topic rooms is not answered by a rule, because
 * there is no rule that makes people write: a room of two dozen members is
 * empty by construction, and a room with nothing in it reads as abandoned
 * rather than as new. It is answered by this form. The first topic's title and
 * body are asked for here, `chat_create_room` writes the room and the topic in
 * one transaction, and there is no way to make a room and fill it later.
 *
 * ---------------------------------------------------------------------------
 * "Is it one of these?"
 * ---------------------------------------------------------------------------
 * The most likely outcome of a new-room impulse is a room that already exists,
 * and finding it is a better result than making a twin — the twin is always the
 * one that looks abandoned. So the rooms whose names contain what is being
 * typed are listed under the field as links, before anything is submitted.
 *
 * ---------------------------------------------------------------------------
 * A refusal keeps the draft and gets a link where it can
 * ---------------------------------------------------------------------------
 * Nothing is cleared and the screen does not navigate. Two of the refusals name
 * a room — the duplicate and "fill your last room" — and the link under them is
 * worked out from the rooms already on the screen rather than read out of the
 * sentence. A link that depends on the database's prose breaks silently the day
 * somebody rewords the message, and the wording is the part most likely to be
 * reworded.
 *
 * Where the clash is with a room an administrator has closed, there is no link:
 * the member cannot read that room, and a link into nothing is worse than the
 * sentence on its own.
 *
 * ---------------------------------------------------------------------------
 * No category is picked to begin with
 * ---------------------------------------------------------------------------
 * A default would be one of the three quietly chosen for somebody, and nobody
 * edits a room afterwards — not even its starter. So all three pills start
 * unpressed and the submit says what is missing.
 */
export default function NewRoomPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const viewerId = account.status === 'member' ? account.userId : null;
  const { rooms } = useChatRooms();
  const { stats } = useRoomStats();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<RoomCategory | null>(null);
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const problem = roomProblem(name, category, description, title, body);
  const suggestions = roomsMatching(rooms, name);

  // Worked out from what is on the screen, not from the refusal's words. The
  // duplicate wins where both are true, because that is the order the function
  // checks them in.
  const alreadyCalled = roomNamed(rooms, name);
  const unfilled = roomToFill(rooms, stats, viewerId);
  const goTo: ChatRoom | null = failure ? (alreadyCalled ?? unfilled) : null;

  function submit() {
    if (problem || saving || !category) return;
    setSaving(true);
    setFailure(null);
    void createRoom(name, description, category, title, body)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        // Straight into the room, replacing this screen: coming back to a
        // filled-in form for a room that now exists would invite a second one
        // under a slightly different name, which is the thing this screen is
        // most trying to prevent.
        void navigate(`/chat/rooms/${result.value}`, { replace: true });
      })
      .catch((e: unknown) => {
        setFailure(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <BackLink to="/chat?segment=rooms" label="Chat" />

        <h1 className="mt-1 font-extrabold font-head text-[1.25rem] text-ink tracking-[-0.02em]">
          Start a room
        </h1>
        <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
          A room is open to every member from the moment you start it, with the whole history from
          then on. Nothing here is public. Nobody can rename or delete a room afterwards, including
          you — what people write in it is theirs.
        </p>

        {failure ? (
          <div className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <p className="text-[0.8125rem] text-destructive leading-[1.45]">
              {failure} Nothing has been started, and what you wrote is still here.
            </p>
            {goTo ? (
              <Link
                to={`/chat/rooms/${goTo.id}`}
                className="mt-1.5 inline-block font-bold text-[0.8125rem] text-navy underline underline-offset-2"
              >
                Open {goTo.name}
              </Link>
            ) : null}
          </div>
        ) : null}

        <label
          htmlFor="room-name"
          className="mt-4 block font-bold font-head text-[0.8125rem] text-ink"
        >
          What is the room for?
        </label>
        <input
          id="room-name"
          value={name}
          maxLength={ROOM_NAME_MAX}
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder="Shoulder pain"
          className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-navy"
        />
        <p className="mt-1 text-[0.71875rem] text-grey">
          {ROOM_NAME_MAX - name.length} characters left. A subject, not a question — the questions
          go in the topics.
        </p>

        {suggestions.length > 0 ? (
          <div className="mt-2 rounded-[11px] border border-line bg-tint px-3 py-2.5">
            <p className="font-bold text-[0.78125rem] text-ink">Is it one of these?</p>
            <ul className="mt-1">
              {suggestions.map((room) => (
                <li key={room.id} className="mt-0.5">
                  <Link
                    to={`/chat/rooms/${room.id}`}
                    className="text-[0.8125rem] text-navy underline underline-offset-2"
                  >
                    {room.name}
                  </Link>
                  <span className="text-[0.75rem] text-grey"> · {room.category}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* A paragraph and not a label: the control it introduces is three
            aria-pressed buttons rather than one field, which is the same shape
            the sort bar on a room page has. */}
        <p className="mt-4 font-bold font-head text-[0.8125rem] text-ink">
          Which part of life is it about?
        </p>
        <SegmentPills<RoomCategory | ''>
          segments={ROOM_CATEGORIES.map((c) => [c, c] as const)}
          value={category ?? ''}
          onChange={(next) => {
            setCategory(next === '' ? null : next);
          }}
        />

        <label
          htmlFor="room-description"
          className="mt-1 block font-bold font-head text-[0.8125rem] text-ink"
        >
          What belongs in it?
        </label>
        <textarea
          id="room-description"
          value={description}
          rows={3}
          maxLength={ROOM_DESCRIPTION_MAX}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          placeholder="Overuse, transfers, injections, and what people did before surgery."
          className="mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink leading-[1.5] outline-none focus:border-navy"
        />
        <p className="mt-1 text-[0.71875rem] text-grey">
          {ROOM_DESCRIPTION_MAX - description.length} characters left. This is the line under the
          room's name in the list.
        </p>

        <h2 className="mt-5 font-extrabold font-head text-[0.9375rem] text-ink">The first topic</h2>
        <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
          A room starts with its first topic, so nobody arrives to an empty one. This is an ordinary
          topic — you can take it back afterwards like anything else you write.
        </p>

        <label
          htmlFor="room-topic-title"
          className="mt-3 block font-bold font-head text-[0.8125rem] text-ink"
        >
          What is it about?
        </label>
        <input
          id="room-topic-title"
          value={title}
          maxLength={140}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          placeholder="Twenty years of pushing"
          className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-navy"
        />

        <label
          htmlFor="room-topic-body"
          className="mt-4 block font-bold font-head text-[0.8125rem] text-ink"
        >
          The first post
        </label>
        <textarea
          id="room-topic-body"
          value={body}
          rows={6}
          maxLength={4000}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          placeholder="A question, something that worked for you, or what happened — whatever you want the room to have."
          className="mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink leading-[1.5] outline-none focus:border-navy"
        />

        <button
          type="button"
          onClick={submit}
          disabled={Boolean(problem) || saving}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
        >
          {saving ? 'Starting…' : 'Start the room'}
        </button>
        {/* The same value that disabled the button, said out loud. A disabled
            control with no explanation is a dead end. */}
        {problem ? (
          <p className="mt-1.5 text-center text-[0.71875rem] text-grey">{problem}</p>
        ) : null}
        <div className="h-3" />
      </div>
    </div>
  );
}
