import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { roomsByCategory, setRoomOpen, useChatRooms } from '@/lib/chat/rooms';
import type { ChatRoom, RoomCategory } from '@/lib/chat/types';
import { cn } from '@/lib/utils';

/**
 * The twelve discussion rooms, for an administrator.
 *
 * ---------------------------------------------------------------------------
 * Why this control exists at all
 * ---------------------------------------------------------------------------
 * CONTEXT.md records the objection that kept topic rooms deferred and it has
 * not stopped being true: the club has five members who are not seeded
 * directory rows, and a room of two dozen members is empty by construction.
 * The owner's answer is that rooms open one at a time, once there is somebody
 * to fill one, and this switch is the whole of that answer. Until it is
 * pressed, a member cannot see that the room exists.
 *
 * So the row leads with what a member would see, not with the room's own
 * state: "Nobody can see this room yet" rather than "closed". The
 * administrator is not managing a flag, they are deciding whether the club has
 * a room.
 *
 * Closing confirms and opening does not. Opening is additive and instantly
 * reversible; closing takes a room away from members who may be mid-
 * conversation in it, and the confirmation says that rather than asking "are
 * you sure".
 *
 * The refusal shown is the database's own sentence. `admin_set_room_open`
 * checks `is_admin()` itself — this component is the client asking, and
 * nothing here is the permission check.
 */

const CATEGORY_DOT: Record<RoomCategory, string> = {
  Body: 'bg-room-body',
  Life: 'bg-room-life',
  Kit: 'bg-room-kit',
};

export function RoomsSection() {
  const { rooms, loading, error, reload } = useChatRooms();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const open = rooms.filter((r) => r.openedAt !== null).length;

  function toggle(room: ChatRoom) {
    const opening = room.openedAt === null;
    if (!opening) {
      const ok = window.confirm(
        `Close ${room.name}?\n\nMembers lose sight of the room and everything in it. Nothing is deleted — reopening it brings the whole room back.`,
      );
      if (!ok) return;
    }
    setBusyId(room.id);
    setRoomOpen(room.id, opening)
      .then((result) => {
        if (result.ok) {
          setFailure(null);
          reload();
          return;
        }
        setFailure(result.error);
      })
      .catch((e: unknown) => {
        setFailure(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setBusyId(null);
      });
  }

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
          Discussion rooms
        </h2>
        <span className="text-[0.75rem] text-grey">
          {open} of {rooms.length} open
        </span>
      </div>
      <p className="mt-1 mb-2 text-[0.75rem] text-grey leading-[1.45]">
        Open one at a time, as there are members to fill it. A closed room does not exist as far as
        a member is concerned.
      </p>

      {failure ? (
        <p className="mb-2 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
          {failure}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[14px] border border-line bg-paper">
        {loading ? (
          <p className="py-6 text-center text-[0.8125rem] text-grey">Loading the rooms…</p>
        ) : error ? (
          <p className="px-3 py-6 text-center text-[0.8125rem] text-grey leading-[1.45]">{error}</p>
        ) : rooms.length === 0 ? (
          <p className="py-6 text-center text-[0.8125rem] text-grey">
            No rooms are seeded in this database.
          </p>
        ) : (
          roomsByCategory(rooms).map(([category, inCategory]) =>
            inCategory.map((room) => (
              <div
                key={room.id}
                className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 basis-[11rem]">
                  <span className="flex items-center gap-[7px]">
                    {/* Decorative: the category is written out beside it. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-[9px] w-[9px] flex-none rounded-[2px]',
                        CATEGORY_DOT[category],
                      )}
                    />
                    <span className="font-extrabold font-head text-[0.90625rem] text-ink">
                      {room.name}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-grey">
                    {category} ·{' '}
                    {room.openedAt
                      ? `open since ${new Date(room.openedAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}`
                      : 'nobody can see this room yet'}
                  </span>
                </span>
                {busyId === room.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-grey" />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      toggle(room);
                    }}
                    // 30px tall, like every other control on this screen.
                    data-target="small"
                    className="whitespace-nowrap rounded-full bg-tint px-3 py-1.5 font-semibold text-[0.75rem] text-navy transition-colors hover:bg-line"
                  >
                    {room.openedAt ? 'Close' : 'Open'}
                  </button>
                )}
              </div>
            )),
          )
        )}
      </div>

      {/* Goes when there is a room page to link to. Seeding a closed room is
          the reason an administrator can see one at all, and right now there
          is nothing to seed it with. */}
      <p className="mt-2 text-[0.75rem] text-grey leading-[1.45]">
        Topics and posts are being built. There is nothing to put in a room yet, so opening one
        shows members its description and no more.
      </p>
    </>
  );
}
