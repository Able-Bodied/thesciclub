import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as Reactions from '@/lib/chat/reactions';

/**
 * Where the app opens. The real routes and the real door, with the screens
 * behind them stubbed: what is under test is the redirect, not Home.
 */

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'u1', isAdmin: false, displayName: 'Test' }),
  signOut: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/lib/members', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOwnMember: () => ({ member: null, invitedBy: null, loading: false, error: null }),
}));
// The bar reads unread conversations and subscribes to them.
vi.mock('@/components/app-nav', () => ({ AppNav: () => null }));
vi.mock('@/routes/home/page', () => ({ default: () => <h1>Home</h1> }));
vi.mock('@/routes/peers/page', () => ({ default: () => <h1>Peers</h1> }));

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
