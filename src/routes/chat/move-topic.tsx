import { useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { roomsByCategory } from '@/lib/chat/rooms';
import { moveTopic } from '@/lib/chat/topics';
import type { ChatRoom } from '@/lib/chat/types';

/**
 * Filing a topic in the right room after it was asked (the owner,
 * 2026-10-09): an administrator, or the member who started it.
 *
 * Closed until asked for, because it is the rare thing on this screen. The
 * rooms are a native select under their headings, as on Home's ask screen;
 * an administrator sees closed rooms too, marked, since chat_move_topic lets
 * them file a topic into a room before it opens.
 */
export function MoveTopic({
  topicId,
  roomId,
  rooms,
  isAdmin,
  onMoved,
}: {
  topicId: string;
  roomId: string;
  rooms: readonly ChatRoom[];
  isAdmin: boolean;
  onMoved: (roomId: string) => void;
}) {
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = rooms.filter((room) => room.id !== roomId && (isAdmin || room.openedAt !== null));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        data-target="small"
        // A transparent border, so it is exactly Mute's height beside it.
        className="rounded-full border border-transparent bg-tint px-[0.85em] py-[0.45em] font-bold font-head text-[0.75rem] text-emphasis leading-[1.3] transition-colors hover:bg-line"
      >
        Move to another room
      </button>
    );
  }

  return (
    <form
      // The whole row's width once open, under the other two.
      className="w-full basis-full rounded-[13px] border border-line bg-canvas p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!target || busy) return;
        setBusy(true);
        setError(null);
        void moveTopic(topicId, target)
          .then((result) => {
            if (!result.ok) {
              setError(result.error);
              return;
            }
            const name = rooms.find((room) => room.id === target)?.name ?? 'the room';
            announce(`Moved to ${name}.`);
            onMoved(target);
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <label
        htmlFor="move-topic-room"
        className="block font-bold font-head text-[0.8125rem] text-ink"
      >
        Move this topic to
      </label>
      <select
        id="move-topic-room"
        value={target}
        onChange={(event) => {
          setTarget(event.target.value);
        }}
        className="mt-1.5 min-h-[48px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3 text-[1rem] text-ink outline-none focus:border-emphasis"
      >
        <option value="" disabled>
          Choose a room
        </option>
        {roomsByCategory([...choices]).map(([category, inCategory]) => (
          <optgroup key={category} label={category}>
            {inCategory.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.openedAt === null ? ' (closed)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
        The replies go with it, and links to it keep working.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!target || busy}
          className="min-h-[44px] rounded-full bg-action px-4 font-bold font-head text-[0.8125rem] text-white disabled:opacity-40"
        >
          {busy ? 'Moving…' : 'Move it'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="min-h-[44px] rounded-full bg-tint px-4 font-semibold text-[0.8125rem] text-emphasis"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
