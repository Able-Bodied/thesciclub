import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';

const account = vi.hoisted(() => ({
  current: null as Account | null,
  restore: vi.fn(() => Promise.resolve('off')),
}));
vi.mock('@/lib/push/notifications', () => ({
  restoreDeviceNotifications: account.restore,
}));
vi.mock('@/lib/account', () => ({
  useAccount: () => account.current,
  useOwnAccount: () => account.current,
  AccountProvider: ({ children }: { children: React.ReactNode }) => children,
  signOut: () => Promise.resolve({ ok: true }),
}));
const forgotten = vi.hoisted(() => ({ urls: vi.fn(), reads: vi.fn() }));
vi.mock('@/lib/chat/attachments', () => ({ resetAttachmentUrls: forgotten.urls }));
vi.mock('@/lib/shared-reads', () => ({ forgetSharedReads: forgotten.reads }));
vi.mock('@/lib/members', () => ({
  useOwnMember: () => ({ member: null, invitedBy: 'NorCal SCI', loading: false, error: null }),
}));

// A registration from a public event's page (20261022190000).
const registration = vi.hoisted(() => ({
  pending: null as null | { eventId: string },
  publicEvent: null as null | { id: string },
  claimed: vi.fn(() => Promise.resolve(['picnic'])),
  forgotten: vi.fn(),
}));
vi.mock('@/lib/event-audience', () => ({
  pendingRegistration: () => registration.pending,
  claimEventRegistrations: registration.claimed,
  fetchPublicEvent: () => Promise.resolve({ ok: true, value: registration.publicEvent }),
  forgetPendingRegistration: () => {
    registration.forgotten();
    registration.pending = null;
  },
}));

const { RequireMember } = await import('@/components/require-member');

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/peers']}>
      <Routes>
        <Route path="/join" element={<p>Welcome screen</p>} />
        <Route path="/events/:id" element={<p>The event</p>} />
        <Route
          path="/peers"
          element={
            <RequireMember>
              <p>Inside the club</p>
            </RequireMember>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  registration.pending = null;
  registration.claimed.mockClear();
  registration.forgotten.mockClear();
  account.restore.mockClear();
  forgotten.urls.mockClear();
  forgotten.reads.mockClear();
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Test' };
});

describe('RequireMember', () => {
  it('lets a member in', () => {
    vi.useFakeTimers();
    try {
      renderGuarded();
      expect(screen.getByText('Inside the club')).toBeInTheDocument();
      // After the first screen's reads, not with them.
      expect(account.restore).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);
      expect(account.restore).toHaveBeenCalledWith('u1');
    } finally {
      vi.useRealTimers();
    }
  });

  // Suspension did nothing a member could perceive: the row was read without
  // its status, so this branch resolved to 'member' and let them in to an
  // empty deck with no explanation anywhere.
  it('shows a suspended member why, rather than letting them in', () => {
    account.current = { status: 'suspended', userId: 'u1', isAdmin: false, displayName: 'Dana' };
    renderGuarded();
    expect(screen.getByText('Your membership is paused')).toBeInTheDocument();
    expect(account.restore).not.toHaveBeenCalled();
    expect(screen.queryByText('Inside the club')).toBeNull();
  });

  // Not a redirect. Bouncing them to /join offers them a club they are
  // already in, and every screen inside comes back empty.
  it('keeps them where they are rather than sending them to the welcome screen', () => {
    account.current = { status: 'suspended', userId: 'u1', isAdmin: false, displayName: 'Dana' };
    renderGuarded();
    expect(screen.queryByText('Welcome screen')).toBeNull();
  });

  it('names whoever vouched for them, as the people to ask', () => {
    account.current = { status: 'suspended', userId: 'u1', isAdmin: false, displayName: 'Dana' };
    renderGuarded();
    expect(screen.getByText(/NorCal SCI/)).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the welcome screen', () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: 'Test' };
    renderGuarded();
    expect(screen.getByText('Welcome screen')).toBeInTheDocument();
    expect(account.restore).not.toHaveBeenCalled();
    expect(screen.queryByText('Inside the club')).not.toBeInTheDocument();
  });

  it('sends somebody who abandoned signup back to finish it', () => {
    account.current = { status: 'signed-up', userId: 'u1', isAdmin: false, displayName: 'Test' };
    renderGuarded();
    expect(screen.getByText('Welcome screen')).toBeInTheDocument();
  });

  it('renders nothing of the club while it is still deciding', () => {
    account.current = { status: 'loading', userId: null, isAdmin: false, displayName: 'Test' };
    renderGuarded();
    expect(screen.queryByText('Inside the club')).not.toBeInTheDocument();
    expect(screen.queryByText('Welcome screen')).not.toBeInTheDocument();
  });

  it('starts another member with nothing the last one left', () => {
    let mounts = 0;
    function Kept() {
      useState(() => {
        mounts += 1;
      });
      return <p>Inside the club</p>;
    }
    const tree = () => (
      <MemoryRouter initialEntries={['/peers']}>
        <Routes>
          <Route
            path="/peers"
            element={
              <RequireMember>
                <Kept />
              </RequireMember>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(tree());
    account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Test' };
    rerender(tree());
    expect(mounts).toBe(1);
    expect(forgotten.urls).not.toHaveBeenCalled();

    account.current = { status: 'member', userId: 'u2', isAdmin: false, displayName: 'Other' };
    rerender(tree());
    expect(mounts).toBe(2);
    expect(forgotten.urls).toHaveBeenCalledTimes(1);
    expect(forgotten.reads).toHaveBeenCalledTimes(1);
  });

  it('forgets what was signed and read when the member signs out', () => {
    const { rerender } = renderGuarded();
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: null };
    rerender(
      <MemoryRouter initialEntries={['/peers']}>
        <Routes>
          <Route path="/join" element={<p>Welcome screen</p>} />
          <Route
            path="/peers"
            element={
              <RequireMember>
                <p>Inside the club</p>
              </RequireMember>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(forgotten.urls).toHaveBeenCalledTimes(1);
    expect(forgotten.reads).toHaveBeenCalledTimes(1);
  });
});

describe('a registration made before signing in', () => {
  it('becomes the member’s RSVP, and opens the event', async () => {
    registration.pending = { eventId: 'picnic' };
    renderGuarded();
    expect(await screen.findByText('The event')).toBeInTheDocument();
    expect(registration.claimed).toHaveBeenCalledTimes(1);
    expect(registration.forgotten).toHaveBeenCalledTimes(1);
  });

  it('is not asked about when there is none', () => {
    renderGuarded();
    expect(screen.getByText('Inside the club')).toBeInTheDocument();
    expect(registration.claimed).not.toHaveBeenCalled();
  });
});

// An event's own address, copied from the address bar and opened signed out.
describe('an event address, signed out', () => {
  const EVENT = '7f3a9c00-0000-4000-8000-000000000001';
  function renderEvent() {
    return render(
      <MemoryRouter initialEntries={[`/events/${EVENT}`]}>
        <Routes>
          <Route path="/join" element={<p>Welcome screen</p>} />
          <Route path="/e/:id" element={<p>The public page</p>} />
          <Route
            path="/events/:id"
            element={
              <RequireMember>
                <p>Inside the club</p>
              </RequireMember>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('opens the public page when the event has one', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: null };
    registration.publicEvent = { id: EVENT };
    renderEvent();
    expect(await screen.findByText('The public page')).toBeInTheDocument();
    registration.publicEvent = null;
  });

  it('opens the door when it does not', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: null };
    registration.publicEvent = null;
    renderEvent();
    expect(await screen.findByText('Welcome screen')).toBeInTheDocument();
  });
});
