import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Threads from '@/lib/chat/threads';
import type * as Events from '@/lib/events';
import { makeEvent } from '@/test/factory';
import type { ClubEvent } from '@/types/domain';

/**
 * Deleting an event added by hand, as somebody who may: an administrator.
 * Apart from event-detail.test.tsx because that file reads the page as a
 * member who may not change anything, and its mocks say so.
 *
 * The two deletes are stubbed; which one is called, and what the page says
 * before it, is what is under test.
 */

const state = vi.hoisted(() => ({
  events: [] as ClubEvent[],
  deleteEvent: vi.fn(),
  deleteEventAndLater: vi.fn(),
}));

vi.mock('@/lib/events', async (importOriginal) => ({
  rsvpSaved: (await importOriginal<typeof Events>()).rsvpSaved,
  useEvents: () => ({ events: state.events, loading: false, error: null }),
  useAttendeesByEvent: () => ({ byEvent: new Map(), loading: false, error: null }),
  useViewerEvents: () => ({ rsvps: new Map(), loading: false, error: null, reload: vi.fn() }),
  setRsvp: vi.fn(),
  deleteEvent: (id: string) => state.deleteEvent(id) as unknown,
  deleteEventAndLater: (id: string) => state.deleteEventAndLater(id) as unknown,
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: true, displayName: 'Admin' }),
}));

vi.mock('@/lib/organization-representatives', () => ({
  useMyOrganizations: () => ({ ids: new Set<string>(), loading: false }),
}));

vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({ organizations: [], byId: new Map(), loading: false, error: null }),
}));

vi.mock('@/lib/session', () => ({
  useSession: () => ({ status: 'signed-in', userId: 'me' }),
}));

vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof Threads>()),
  useMyThreads: () => ({ threads: [], loading: false, error: null, reload: vi.fn() }),
}));

const { default: EventDetailPage } = await import('@/routes/events/event-detail');

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/events/hh']}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/events" element={<p>Events list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function event(overrides: Partial<ClubEvent> = {}): ClubEvent {
  return makeEvent({
    id: 'hh',
    title: 'Friday Happy Hour',
    startTime: new Date(Date.now() + 3 * 864e5).toISOString(),
    handAdded: true,
    goingCount: 1,
    ...overrides,
  });
}

beforeEach(() => {
  state.deleteEvent = vi.fn().mockResolvedValue({ ok: true });
  state.deleteEventAndLater = vi.fn().mockResolvedValue({ ok: true });
});

describe('deleting an event added by hand', () => {
  it('asks once and deletes a one-off', async () => {
    state.events = [event({ seriesId: null })];
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/^Delete this event\?/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'This and all later dates' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(state.deleteEvent).toHaveBeenCalledWith('hh');
    expect(await screen.findByText('Events list')).toBeInTheDocument();
  });

  it('asks which dates for a repeating event, and deletes this one only', async () => {
    state.events = [event({ seriesId: 's1' })];
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/^This event repeats\. Delete which dates\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'This date only' }));
    expect(state.deleteEvent).toHaveBeenCalledWith('hh');
    expect(state.deleteEventAndLater).not.toHaveBeenCalled();
  });

  it('deletes this and every later date when asked', async () => {
    state.events = [event({ seriesId: 's1' })];
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'This and all later dates' }));
    expect(state.deleteEventAndLater).toHaveBeenCalledWith('hh');
    expect(state.deleteEvent).not.toHaveBeenCalled();
    expect(await screen.findByText('Events list')).toBeInTheDocument();
  });

  it('keeps everything on Keep it, and says why a refusal failed', async () => {
    state.events = [event({ seriesId: 's1' })];
    state.deleteEventAndLater = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'You cannot delete this event.' });
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'This and all later dates' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot delete this event.');
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
