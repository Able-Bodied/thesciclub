import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type * as ChatRooms from '@/lib/chat/rooms';
import type { ChatRoom, RoomStats } from '@/lib/chat/types';
import { RoomsSection } from '@/routes/admin/rooms-section';

/**
 * `roomsByCategory` is left real — it is what decides the order of the twelve
 * rows, and a stub of it would let this file assert its own ordering.
 * `useChatRooms` and `setRoomOpen` are the network calls and are stubbed.
 */

const api = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  loading: false,
  error: null as string | null,
  reloads: 0,
  calls: [] as [string, boolean][],
  failWith: null as string | null,
  stats: new Map<string, RoomStats>(),
  statReloads: 0,
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({
    rooms: api.rooms,
    loading: api.loading,
    error: api.error,
    reload: () => {
      api.reloads += 1;
    },
  }),
  useRoomStats: () => ({
    stats: api.stats,
    loading: false,
    reload: () => {
      api.statReloads += 1;
    },
  }),
  setRoomOpen: (id: string, open: boolean) => {
    api.calls.push([id, open]);
    if (api.failWith) return Promise.resolve({ ok: false as const, error: api.failWith });
    return Promise.resolve({ ok: true as const });
  },
}));

const room = (o: Partial<ChatRoom> & { id: string }): ChatRoom => ({
  name: 'Bowel management',
  description: 'The one nobody talks about anywhere else.',
  category: 'Body',
  icon: '◍',
  sortOrder: 1,
  openedAt: null,
  createdBy: null,
  ...o,
});

function renderSection() {
  return render(
    <MemoryRouter>
      <RoomsSection />
    </MemoryRouter>,
  );
}

let confirmSpy: MockInstance<typeof window.confirm>;

beforeEach(() => {
  api.rooms = [];
  api.loading = false;
  api.error = null;
  api.reloads = 0;
  api.calls = [];
  api.failWith = null;
  api.stats = new Map();
  api.statReloads = 0;
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('the rooms section on /admin', () => {
  // The exemption that lets an administrator read a closed room exists so they
  // can seed one. Without a way in from here it is a policy nobody can use.
  it('opens the room from its name, closed or not', () => {
    api.rooms = [room({ id: 'bowel' })];
    renderSection();
    expect(screen.getByRole('link', { name: /Bowel management/ })).toHaveAttribute(
      'href',
      '/chat/rooms/bowel',
    );
  });

  it('says how much is in a room, so an administrator can tell when it is ready', () => {
    api.rooms = [room({ id: 'bowel' })];
    api.stats = new Map([['bowel', { topicCount: 2, postCount: 6, memberCount: 0 }]]);
    renderSection();
    expect(screen.getByText(/2 topics/)).toBeInTheDocument();
  });

  // Not "0 topics": the counts have not arrived, which is a different fact
  // from there being none, and one of them is worth acting on.
  it('does not report a room as empty before the counts arrive', () => {
    api.rooms = [room({ id: 'bowel' })];
    renderSection();
    expect(screen.getByText(/counting topics/)).toBeInTheDocument();
  });

  it('says a room is empty once it knows', () => {
    api.rooms = [room({ id: 'bowel' })];
    api.stats = new Map([['bowel', { topicCount: 0, postCount: 0, memberCount: 0 }]]);
    renderSection();
    expect(screen.getByText(/no topics yet/)).toBeInTheDocument();
  });

  // The row leads with what a member would see rather than with the room's
  // own state: the administrator is deciding whether the club has a room, not
  // flipping a flag.
  it('says a closed room cannot be seen, rather than calling it closed', () => {
    api.rooms = [room({ id: 'bowel' })];
    renderSection();
    expect(screen.getByText(/nobody can see this room yet/)).toBeInTheDocument();
  });

  // Matched on the parts rather than the whole string: the date is formatted
  // in the reader's own locale, so "18 September 2026" and "September 18,
  // 2026" are both correct and the test should not pick one.
  it('says when an open room was opened', () => {
    api.rooms = [room({ id: 'bowel', openedAt: '2026-09-18T10:00:00Z' })];
    renderSection();
    const line = screen.getByText(/open since/);
    expect(line.textContent).toMatch(/September/);
    expect(line.textContent).toMatch(/18/);
    expect(line.textContent).toMatch(/2026/);
  });

  it('counts how many of the twelve are open', () => {
    api.rooms = [
      room({ id: 'bowel', openedAt: '2026-09-18T10:00:00Z' }),
      room({ id: 'skin', sortOrder: 3 }),
    ];
    renderSection();
    expect(screen.getByText('1 of 2 open')).toBeInTheDocument();
  });

  // Opening is additive and instantly reversible, so it does not stop to ask.
  it('opens a room without confirming, and reloads', async () => {
    api.rooms = [room({ id: 'bowel' })];
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(api.calls).toEqual([['bowel', true]]);
    await waitFor(() => {
      expect(api.reloads).toBe(1);
    });
  });

  // Closing takes a room away from members who may be mid-conversation in it.
  // The confirmation says that, and says that nothing is deleted.
  it('says what closing costs before it closes', async () => {
    api.rooms = [room({ id: 'bowel', openedAt: '2026-09-18T10:00:00Z' })];
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(confirmSpy.mock.calls[0]?.[0]).toMatch(/Members lose sight of the room/);
    expect(confirmSpy.mock.calls[0]?.[0]).toMatch(/Nothing is deleted/);
    expect(api.calls).toEqual([['bowel', false]]);
  });

  it('closes nothing when the confirmation is declined', async () => {
    confirmSpy.mockReturnValue(false);
    api.rooms = [room({ id: 'bowel', openedAt: '2026-09-18T10:00:00Z' })];
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(api.calls).toEqual([]);
    expect(api.reloads).toBe(0);
  });

  // The database's own sentence, not a rewritten one: when an action is
  // blocked the reason matters more than the tone.
  it('shows the refusal verbatim', async () => {
    api.failWith = 'Only an administrator can open or close a room.';
    api.rooms = [room({ id: 'bowel' })];
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => {
      expect(
        screen.getByText('Only an administrator can open or close a room.'),
      ).toBeInTheDocument();
    });
    expect(api.reloads).toBe(0);
  });

  it('draws the rooms in category order', () => {
    api.rooms = [
      room({ id: 'equip', name: 'Equipment & assistive tech', category: 'Kit', sortOrder: 11 }),
      room({ id: 'newsci', name: 'Newly injured', category: 'Life', sortOrder: 6 }),
      room({ id: 'bowel', sortOrder: 1 }),
    ];
    renderSection();
    const names = screen
      .getAllByText(/Bowel management|Newly injured|Equipment & assistive tech/)
      .map((n) => n.textContent);
    expect(names).toEqual(['Bowel management', 'Newly injured', 'Equipment & assistive tech']);
  });
});
