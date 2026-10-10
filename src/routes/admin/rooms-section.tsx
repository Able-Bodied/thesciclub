import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnnounce } from '@/lib/announce';
import { useChatAuthors } from '@/lib/chat/authors';
import {
  roomsByCategory,
  setRoomHome,
  setRoomOpen,
  useChatRooms,
  useRoomStats,
} from '@/lib/chat/rooms';
import type { ChatRoom, RoomCategory } from '@/lib/chat/types';
import { describeThrown } from '@/lib/describe-error';
import { cn } from '@/lib/utils';
import { SmallButton } from '@/routes/admin/controls';

/**
 * The discussion rooms, for an administrator.
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
 *
 * ---------------------------------------------------------------------------
 * Rooms members started are in the same list
 * ---------------------------------------------------------------------------
 * From 2026-09-20 any member can start a room, and one is open from the moment
 * it exists — there is nobody standing by to open it, and it is born with a
 * topic in it. So the switch on those rows is a Close and not an Open, and the
 * row names whoever started it. They are not a separate panel: an
 * administrator moderating rooms is doing one job, and splitting the list by
 * who happened to create a room would make them look in two places for it.
 *
 * ---------------------------------------------------------------------------
 * The room's name is a link, and that is the point of the whole panel
 * ---------------------------------------------------------------------------
 * An administrator can read and post in a closed room — see chat_can_post_in —
 * and that exemption exists so a room has something in it before a member is
 * let into it. Without a way in from here, the exemption is a policy nobody
 * can use. The topic count beside it is what tells them whether the seeding is
 * done.
 */

const CATEGORY_DOT: Record<RoomCategory, string> = {
  // No colour of its own: General is about nothing in particular.
  General: 'bg-emphasis',
  Other: 'bg-emphasis',
  Body: 'bg-room-body',
  Mind: 'bg-room-mind',
  Life: 'bg-room-life',
  Family: 'bg-room-family',
  Kit: 'bg-room-kit',
  Places: 'bg-room-places',
};

export function RoomsSection() {
  const { rooms, loading, error, reload } = useChatRooms();
  const { stats, reload: reloadStats } = useRoomStats();
  const starters = useChatAuthors(rooms.map((room) => room.createdBy));
  const [busyId, setBusyId] = useState<string | null>(null);
  const announce = useAnnounce();
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
          // A closed room is outside chat_room_stats' own gate for everybody
          // but an administrator, and its counts are gone from the answer the
          // moment it shuts. Re-read both, or the row keeps a stale count.
          reloadStats();
          return;
        }
        setFailure(result.error);
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'That did not work.'));
      })
      .finally(() => {
        setBusyId(null);
      });
  }

  function toggleHome(room: ChatRoom) {
    const show = !room.showInHome;
    setBusyId(room.id);
    setFailure(null);
    void setRoomHome(room.id, show)
      .then((result) => {
        if (result.ok) {
          reload();
          announce(`${room.name} ${show ? 'will appear in' : 'is hidden from'} the Home feed.`);
        } else {
          setFailure(result.error);
        }
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
        Open the seeded ones a few at a time, as there are members to fill them. A closed room does
        not exist as far as a member is concerned. A room a member started is open already — closing
        it hides it from members. The Home feed switch controls whether its topics and photos appear
        in Home. Members can still open an excluded room in Chat. Nobody can rename or delete a
        room.
      </p>

      {failure ? (
        <p
          role="alert"
          className="mb-2 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
        >
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
                <Link to={`/chat/rooms/${room.id}`} className="min-w-0 flex-1 basis-[11rem]">
                  <span className="flex items-center gap-[7px]">
                    {/* Decorative: the category is written out beside it. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-[9px] w-[9px] flex-none rounded-[2px]',
                        CATEGORY_DOT[category],
                      )}
                    />
                    <span className="font-extrabold font-head text-[0.90625rem] text-ink underline decoration-line underline-offset-2">
                      {room.name}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-grey">
                    {category} · {topicsIn(stats.get(room.id)?.topicCount)} ·{' '}
                    {room.openedAt
                      ? `open since ${new Date(room.openedAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}`
                      : 'nobody can see this room yet'}
                    {room.createdBy
                      ? ` · started by ${starters.get(room.createdBy)?.displayName ?? 'a deleted member'}`
                      : ''}
                  </span>
                </Link>
                <button
                  type="button"
                  role="switch"
                  aria-checked={room.showInHome}
                  aria-label={`Show ${room.name} in Home feed`}
                  disabled={busyId !== null}
                  onClick={() => {
                    toggleHome(room);
                  }}
                  className="flex min-h-[44px] items-center gap-2 rounded-[10px] px-2 text-[0.8125rem] text-ink disabled:opacity-50"
                >
                  <span>Home feed</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-6 w-11 items-center rounded-full p-0.5',
                      room.showInHome ? 'justify-end bg-action' : 'justify-start bg-grey',
                    )}
                  >
                    <span className="h-5 w-5 rounded-full bg-white" />
                  </span>
                </button>
                {busyId === room.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-grey" />
                ) : (
                  <SmallButton
                    disabled={busyId !== null}
                    onClick={() => {
                      toggle(room);
                    }}
                  >
                    {room.openedAt ? 'Close' : 'Open'}
                  </SmallButton>
                )}
              </div>
            )),
          )
        )}
      </div>

      <p className="mt-2 text-[0.75rem] text-grey leading-[1.45]">
        Open a room's name to read it and to start a topic in it. You can post in a closed room, so
        that there is something there before anybody is let in.
      </p>
    </>
  );
}

/**
 * "no topics" · "1 topic" · "4 topics".
 *
 * Undefined means the counts have not arrived, not that there are none, so it
 * reads as the honest blank rather than as zero.
 */
function topicsIn(count: number | undefined): string {
  if (count === undefined) return 'counting topics…';
  if (count === 0) return 'no topics yet';
  return `${count} ${count === 1 ? 'topic' : 'topics'}`;
}
