import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as Reactions from '@/lib/chat/reactions';

/**
 * Where the app opens. The real routes and the real door, with the screens
 * behind them stubbed: what is under test is the redirect, not Home.
 */

// The door reads on its first draw, then answers, as the real one does.
const door = vi.hoisted(() => ({ reads: 0 }));
vi.mock('@/lib/account', async () => {
  const { useEffect, useState } = await import('react');
  const member = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Test' };
  return {
    useAccount: () => member,
    useOwnAccount: () => {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        setReady(true);
      }, []);
      if (!ready) door.reads++;
      return ready ? member : { ...member, status: 'loading', userId: null };
    },
    AccountProvider: ({ children }: { children: React.ReactNode }) => children,
    signOut: () => Promise.resolve({ ok: true }),
  };
});
vi.mock('@/lib/members', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOwnMember: () => ({ member: null, invitedBy: null, loading: false, error: null }),
}));
// The bar reads unread conversations and subscribes to them.
vi.mock('@/components/app-nav', () => ({ AppNav: () => null }));
vi.mock('@/routes/home/page', () => ({ default: () => <h1>Home</h1> }));
vi.mock('@/routes/peers/page', () => ({ default: () => <h1>Peers</h1> }));
vi.mock('@/routes/profile/answers', () => ({
  default: () => <Link to="/peers">Peers tab</Link>,
}));

const { default: App } = await import('@/App');

describe('the app', () => {
  it('opens on Home', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Peers' })).toBeNull();
  });

  // Android check, 2026-11-17: a tab tapped on Your answers read the door
  // again, and the screen was blank until it answered.
  it('keeps the membership check from Your answers to a tab', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/answers']}>
        <App />
      </MemoryRouter>,
    );
    const before = door.reads;
    fireEvent.click(await screen.findByRole('link', { name: 'Peers tab' }));
    expect(await screen.findByRole('heading', { name: 'Peers' })).toBeInTheDocument();
    expect(door.reads).toBe(before);
  });
});

vi.mock('@/lib/chat/reactions', async (importOriginal) => ({
  ...(await importOriginal<typeof Reactions>()),
  useReactions: () => ({
    rows: [],
    loading: false,
    error: null,
    pending: new Set(),
    failure: null,
    choose: vi.fn(),
    reload: vi.fn(),
  }),
}));
