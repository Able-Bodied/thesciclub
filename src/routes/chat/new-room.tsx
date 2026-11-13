import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { attachmentFolder, deleteAttachments, uploadAttachments } from '@/lib/chat/attachments';
import {
  addFirstPostPhotographs,
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
import { type ChatRoom, MEMBER_ROOM_CATEGORIES, type RoomCategory } from '@/lib/chat/types';
import { describeThrown } from '@/lib/describe-error';
import { type PhotoTarget, pastePhotos } from '@/lib/paste-photos';
import { PhotoPicker, PhotoStrip } from '@/routes/chat/photo-picker';

/**
 * Starting a room. A room cannot be born empty: an empty room reads as abandoned (CONTEXT.md's
 * objection), so `chat_create_room` writes the room and its first topic in one transaction.
 *
 * Rooms matching the typed name are listed as links first: a twin is always the one that looks
 * abandoned.
 *
 * A refusal keeps the draft. Its link is worked out from rooms on screen, never parsed from the
 * database's wording, which breaks silently when reworded. No link to a closed room the member
 * cannot read.
 *
 * No category is preselected: nobody edits a room afterwards, so a default would choose for them.
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
  const [files, setFiles] = useState<File[]>([]);
  // Pictures pasted into the first post join its photographs (lib/paste-photos.ts).
  const photoTarget = useRef<PhotoTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** A room started whose photographs then failed: link into it, never start a second. */
  const [startedWithout, setStartedWithout] = useState<{ id: string; why: string } | null>(null);

  const problem = roomProblem(name, category, description, title, body);
  const suggestions = roomsMatching(rooms, name);

  // From the screen, not the refusal's words. The duplicate wins: the function checks it first.
  const alreadyCalled = roomNamed(rooms, name);
  const unfilled = roomToFill(rooms, stats, viewerId);
  const goTo: ChatRoom | null = failure ? (alreadyCalled ?? unfilled) : null;

  function submit() {
    if (problem || saving || !category) return;
    setSaving(true);
    setFailure(null);
    void (async (): Promise<
      { ok: true; value: string; without: string | null } | { ok: false; error: string }
    > => {
      const made = await createRoom(name, description, category, title, body);
      if (!made.ok) return made;
      // Files go up after the room: its folder is named by the new id. If either step fails
      // the room still exists, so say so rather than start another.
      if (files.length > 0) {
        const up = await uploadAttachments(files, attachmentFolder('room', made.value));
        if (!up.ok) return { ok: true, value: made.value, without: up.error };
        const added = await addFirstPostPhotographs(made.value, up.value);
        if (!added.ok) {
          void deleteAttachments(up.value);
          return { ok: true, value: made.value, without: added.error };
        }
      }
      return { ok: true, value: made.value, without: null };
    })()
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        if (result.without) {
          setStartedWithout({ id: result.value, why: result.without });
          return;
        }
        // Replace this screen: going back to the filled form would invite a near-duplicate room.
        void navigate(`/chat/rooms/${result.value}`, { replace: true });
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'That did not work.'));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <BackLink to="/chat?segment=rooms" label="Chat" />

        <h1 className="mt-1 font-extrabold font-head text-[1.25rem] text-ink tracking-[-0.01em]">
          Start a room
        </h1>
        <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
          A room is open to every member from the moment you start it, with the whole history from
          then on. Nothing here is public. Nobody can rename or delete a room afterwards, including
          you — what people write in it is theirs.
        </p>

        {startedWithout ? (
          <div className="mt-3 rounded-[11px] border border-gold/60 bg-gold-lt px-3 py-2.5">
            <p className="text-[0.8125rem] text-ink leading-[1.45]">
              The room was started, but without its photographs. {startedWithout.why} You can add
              them in a reply.
            </p>
            <Link
              to={`/chat/rooms/${startedWithout.id}`}
              replace
              className="mt-1.5 inline-block font-bold text-[0.8125rem] text-emphasis underline underline-offset-2"
            >
              Open {name.trim()}
            </Link>
          </div>
        ) : null}

        {failure ? (
          <div className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <p role="alert" className="text-[0.8125rem] text-destructive leading-[1.45]">
              {failure} Nothing has been started, and what you wrote is still here.
            </p>
            {goTo ? (
              <Link
                to={`/chat/rooms/${goTo.id}`}
                className="mt-1.5 inline-block font-bold text-[0.8125rem] text-emphasis underline underline-offset-2"
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
          className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-emphasis"
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
                    className="text-[0.8125rem] text-emphasis underline underline-offset-2"
                  >
                    {room.name}
                  </Link>
                  <span className="text-[0.75rem] text-grey"> · {room.category}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* A paragraph, not a label: it introduces aria-pressed buttons, not one field. */}
        <p className="mt-4 font-bold font-head text-[0.8125rem] text-ink">
          Which part of life is it about?
        </p>
        {/* Wrapped, not scrolled: at 430px a scrolling row hides choices off the edge. */}
        <SegmentPills<RoomCategory | ''>
          segments={MEMBER_ROOM_CATEGORIES.map((c) => [c, c] as const)}
          value={category ?? ''}
          onChange={(next) => {
            setCategory(next === '' ? null : next);
          }}
          className="flex-wrap"
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
          className="mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink leading-[1.5] outline-none focus:border-emphasis"
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
          className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-emphasis"
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
          onPaste={(event) => {
            pastePhotos(event, photoTarget.current);
          }}
          placeholder="A question, something that worked for you, or what happened — whatever you want the room to have."
          className="mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink leading-[1.5] outline-none focus:border-emphasis"
        />

        {/* Under the first post, as on a new topic: the photographs go on it. */}
        <div className="mt-3">
          <PhotoStrip
            files={files}
            disabled={saving}
            onRemove={(index) => {
              setFiles((current) => current.filter((_, i) => i !== index));
            }}
          />
          <PhotoPicker ref={photoTarget} files={files} onChange={setFiles} disabled={saving} />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={Boolean(problem) || saving || startedWithout !== null}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
        >
          {saving ? 'Starting…' : 'Start the room'}
        </button>
        {/* Says why the button is disabled; an unexplained disabled control is a dead end. */}
        {problem ? (
          <p className="mt-1.5 text-center text-[0.71875rem] text-grey">{problem}</p>
        ) : null}
        <div className="h-3" />
      </div>
    </div>
  );
}
